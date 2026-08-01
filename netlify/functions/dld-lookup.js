const https = require('https');
const url = require('url');

// ============================================================
// IMPORT SHARED CLEANING
// ============================================================
const { getSizeCategory, applyAllFilters } = require('../../scripts/cleaning-pipeline');

// ============================================================
// HELPERS
// ============================================================

function fetchDLDData() {
  return new Promise((resolve, reject) => {
    const baseUrl = process.env.URL || 'https://aqar-evaluate-engine.netlify.app';
    const fileUrl = `${baseUrl}/data/dld-transactions.json`;
    console.log('🔍 Fetching:', fileUrl);
    const req = https.get(fileUrl, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON: ' + e.message)); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function median(values) {
  if (!values || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function monthlyGrowthRate(transactions) {
  if (!transactions || transactions.length < 10) return 0.005;
  const byMonth = {};
  for (const t of transactions) {
    const d = new Date(t.saleDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(t.actualSalePrice / t.area);
  }
  const months = Object.keys(byMonth).sort();
  if (months.length < 3) return 0.005;
  const medians = months.map(m => median(byMonth[m])).filter(Boolean);
  let total = 0, count = 0;
  for (let i = 1; i < medians.length; i++) {
    if (medians[i - 1] > 0) {
      total += (medians[i] - medians[i - 1]) / medians[i - 1];
      count++;
    }
  }
  return count > 0 ? total / count : 0.005;
}

function getTimeAdjustedPrice(saleDate, pricePerSqm, growth, months) {
  return pricePerSqm * Math.pow(1 + growth, months);
}

function buildResult(transactions, windows, targetDate, level) {
  const growth = monthlyGrowthRate(transactions);
  for (const days of windows) {
    const cutoff = new Date(targetDate);
    cutoff.setDate(cutoff.getDate() - days);
    const filtered = transactions.filter(t => new Date(t.saleDate) >= cutoff);
    if (filtered.length >= 5) {
      const adjusted = filtered.map(t => {
        const months = (targetDate - new Date(t.saleDate)) / (30.44 * 86400000);
        return getTimeAdjustedPrice(new Date(t.saleDate), t.actualSalePrice / t.area, growth, months);
      });
      const sorted = [...adjusted].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const medianVal = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
      return {
        avgPricePerSqm: Math.round(medianVal),
        count: filtered.length,
        timeWindow: days,
        confidence: days <= 90 ? 'high' : days <= 180 ? 'medium' : 'low',
        monthlyGrowthRate: growth,
        level: level
      };
    }
  }
  return null;
}

// ===== ADAPTIVE SEARCH =====
function adaptiveSearch(district, propertyType, sizeCat, transactions, targetDate) {
  const windows = [30, 60, 90, 180, 365, 730, Infinity];
  const districtLower = district.toLowerCase().trim();

  // ===== LEVEL 1: District + Type + Size (Fuzzy) =====
  let relevant = transactions.filter(t => {
    const d = (t.district || '').toLowerCase();
    return (d.includes(districtLower) || districtLower.includes(d)) &&
           t.propertyType === propertyType &&
           getSizeCategory(t.area, t.propertyType) === sizeCat;
  });

  if (relevant.length >= 5) {
    return buildResult(relevant, windows, targetDate, 'district_size');
  }

  // ===== LEVEL 2: District + Type only (no size) =====
  if (relevant.length > 0 && relevant.length < 5) {
    console.log(`⚠️ Only ${relevant.length} with size, trying without size...`);
  }
  const relevantNoSize = transactions.filter(t => {
    const d = (t.district || '').toLowerCase();
    return (d.includes(districtLower) || districtLower.includes(d)) &&
           t.propertyType === propertyType;
  });

  if (relevantNoSize.length >= 5) {
    return buildResult(relevantNoSize, windows, targetDate, 'district_type');
  }

  // ===== LEVEL 3: District only (any type) =====
  if (relevantNoSize.length > 0 && relevantNoSize.length < 5) {
    console.log(`⚠️ Only ${relevantNoSize.length} with type, trying district only...`);
  }
  const relevantDistrict = transactions.filter(t => {
    const d = (t.district || '').toLowerCase();
    return d.includes(districtLower) || districtLower.includes(d);
  });

  if (relevantDistrict.length >= 5) {
    return buildResult(relevantDistrict, windows, targetDate, 'district_only');
  }

  console.log(`❌ No data found for ${district} (tried ${relevant.length} with size, ${relevantNoSize.length} with type, ${relevantDistrict.length} district only)`);
  return null;
}

// ============================================================
// HANDLER
// ============================================================

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  try {
    const { district, propertyType, area } = event.queryStringParameters || {};

    if (!district || !propertyType || !area) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ found: false, error: 'district, propertyType, and area are required' })
      };
    }

    const raw = await fetchDLDData();
    if (!raw || raw.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ found: false, error: 'No DLD data' })
      };
    }

    const cleaned = applyAllFilters(raw);
    if (cleaned.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ found: false, error: 'No clean data' })
      };
    }

    const size = getSizeCategory(parseFloat(area), propertyType);
    const result = adaptiveSearch(district, propertyType, size, cleaned, new Date());

    if (!result) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          found: false,
          reason: 'no-sufficient-data',
          district,
          propertyType,
          size
        })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        found: true,
        avgPricePerSqm: result.avgPricePerSqm,
        count: result.count,
        timeWindow: result.timeWindow,
        confidence: result.confidence,
        monthlyGrowthRate: result.monthlyGrowthRate,
        level: result.level,
        source: 'dld',
        weight: 1.0,
        generatedAt: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('❌ Error:', error);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        found: false,
        error: error.message
      })
    };
  }
};