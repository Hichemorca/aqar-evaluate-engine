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
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid JSON: ' + e.message));
        }
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

function adjustPrice(saleDate, pricePerSqm, growth, months) {
  return pricePerSqm * Math.pow(1 + growth, months);
}

function findComparables(transactions, district, type, size, targetDate) {
  const lower = district.toLowerCase().trim();
  const windows = [30, 60, 90, 180, 365, 730, Infinity];

  // Try: district + type + size
  let filtered = transactions.filter(t => {
    const d = (t.district || '').toLowerCase();
    return (d.includes(lower) || lower.includes(d)) &&
           t.propertyType === type &&
           getSizeCategory(t.area, t.propertyType) === size;
  });
  let level = 'district_size';

  // Fallback: district + type
  if (filtered.length < 5) {
    filtered = transactions.filter(t => {
      const d = (t.district || '').toLowerCase();
      return (d.includes(lower) || lower.includes(d)) && t.propertyType === type;
    });
    level = 'district_type';
  }

  // Fallback: district only
  if (filtered.length < 5) {
    filtered = transactions.filter(t => {
      const d = (t.district || '').toLowerCase();
      return d.includes(lower) || lower.includes(d);
    });
    level = 'district_only';
  }

  if (filtered.length === 0) return null;

  const growth = monthlyGrowthRate(filtered);
  console.log(`📈 Growth: ${(growth * 100).toFixed(1)}% | Level: ${level} | Found: ${filtered.length}`);

  for (const days of windows) {
    const cutoff = new Date(targetDate);
    cutoff.setDate(cutoff.getDate() - days);

    const matches = filtered.filter(t => new Date(t.saleDate) >= cutoff);
    if (matches.length >= 5) {
      const adjusted = matches.map(t => {
        const months = (targetDate - new Date(t.saleDate)) / (30.44 * 86400000);
        return adjustPrice(new Date(t.saleDate), t.actualSalePrice / t.area, growth, months);
      });

      return {
        avgPricePerSqm: Math.round(median(adjusted)),
        count: matches.length,
        days,
        confidence: days <= 90 ? 'high' : days <= 180 ? 'medium' : 'low',
        growth,
        level
      };
    }
  }

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
    const result = findComparables(cleaned, district, propertyType, size, new Date());

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
        timeWindow: result.days,
        confidence: result.confidence,
        monthlyGrowthRate: result.growth,
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