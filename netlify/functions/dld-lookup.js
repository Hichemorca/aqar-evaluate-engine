const https = require('https');
const url = require('url');

// ===== SIZE CATEGORIES =====
function getSizeCategory(area, propertyType) {
  if (propertyType === 'land') {
    if (area <= 200) return 'land_tiny';
    if (area <= 500) return 'land_small';
    if (area <= 1000) return 'land_medium';
    if (area <= 3000) return 'land_large';
    return 'land_xlarge';
  }
  if (area < 80) return 'small';
  if (area > 200) return 'large';
  return 'medium';
}

// ===== 10-STAGE CLEANING =====
function filterNonSaleTransactions(transactions) {
  const nonMarketProcedures = ['development registration', 'sell development', 'lease to own registration'];
  const excludedKeywords = ['gift', 'hiba', 'inheritance', 'irt', 'wasiya', 'correction', 'rectification', 'mortgage', 'رهن', 'auction', 'مزاد'];
  return transactions.filter(t => {
    const procedure = (t.procedure || '').toLowerCase();
    const group = (t.group || '').toLowerCase();
    if (nonMarketProcedures.some(p => procedure.includes(p))) return false;
    const combined = group + ' ' + procedure;
    for (const kw of excludedKeywords) { if (combined.includes(kw)) return false; }
    return true;
  });
}

function filterMissingData(transactions) {
  return transactions.filter(t => 
    t.district && t.district !== 'Unknown' && 
    t.propertyType && t.propertyType !== 'Unknown' && 
    t.area > 0 && t.actualSalePrice > 0
  );
}

function filterAreaMismatch(transactions) {
  return transactions.filter(t => {
    if (t.procedureArea && t.procedureArea > 0) {
      const ratio = t.area / t.procedureArea;
      if (ratio < 0.5 || ratio > 2.0) return false;
    }
    return true;
  });
}

function filterInvalidAreas(transactions) {
  const limits = { 
    apartment: { min: 30, max: 1000 }, 
    villa: { min: 100, max: 5000 }, 
    townhouse: { min: 80, max: 2000 }, 
    office: { min: 30, max: 10000 }, 
    retail: { min: 20, max: 5000 }, 
    warehouse: { min: 100, max: 50000 }, 
    land: { min: 100, max: 100000 } 
  };
  return transactions.filter(t => { 
    const l = limits[t.propertyType] || { min: 30, max: 5000 }; 
    return t.area >= l.min && t.area <= l.max; 
  });
}

function filterInvalidPrices(transactions) {
  transactions.forEach(t => { t.pricePerSqm = t.actualSalePrice / Math.max(1, t.area); });
  return transactions.filter(t => t.pricePerSqm > 0);
}

function filterOutliers(transactions) {
  const groups = {};
  transactions.forEach(t => { 
    const k = `${t.district}__${t.propertyType}`; 
    if (!groups[k]) groups[k] = []; 
    groups[k].push(t); 
  });
  const filtered = [];
  Object.values(groups).forEach(group => {
    if (group.length < 5) { filtered.push(...group); return; }
    const logPrices = group.map(t => Math.log(t.pricePerSqm)).sort((a, b) => a - b);
    const n = logPrices.length, q1 = logPrices[Math.floor(n * 0.25)], q3 = logPrices[Math.floor(n * 0.75)], iqr = q3 - q1;
    const lo = Math.exp(q1 - 1.5 * iqr), hi = Math.exp(q3 + 1.5 * iqr);
    group.forEach(t => { if (t.pricePerSqm >= lo && t.pricePerSqm <= hi) filtered.push(t); });
  });
  return filtered;
}

function filterReadyOnly(transactions) {
  return transactions.filter(t => {
    if (t.isOffPlan === true) return false;
    const status = (t.status || t.projectStatus || '').toLowerCase();
    if (status.includes('off-plan') || status.includes('offplan') || status.includes('under construction') || status.includes('launched')) return false;
    return true;
  });
}

function filterDuplicates(transactions) {
  const seen = new Set();
  return transactions.filter(t => {
    if (t.propertyRef && seen.has(t.propertyRef)) return false;
    if (t.propertyRef) seen.add(t.propertyRef);
    const key = `${t.district}__${t.area}__${Math.round(t.actualSalePrice / 1000)}__${t.saleDate}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function filterUltraLuxury(transactions) {
  return transactions.filter(t => {
    const pricePerSqm = t.actualSalePrice / Math.max(1, t.area);
    if (pricePerSqm > 50000) return false;
    if (t.actualSalePrice > 50000000) return false;
    return true;
  });
}

function validateGroupCounts(transactions) {
  const groups = {};
  transactions.forEach(t => { 
    const k = `${t.district}__${t.propertyType}`; 
    if (!groups[k]) groups[k] = []; 
    groups[k].push(t); 
  });
  const filtered = [];
  Object.entries(groups).forEach(([k, g]) => { if (g.length >= 3) filtered.push(...g); });
  return filtered;
}

function applyAllFilters(transactions) {
  console.log(`🧹 Cleaning: ${transactions.length} input`);
  let data = transactions;
  data = filterNonSaleTransactions(data);
  data = filterMissingData(data);
  data = filterAreaMismatch(data);
  data = filterInvalidAreas(data);
  data.forEach(t => { t.pricePerSqm = t.actualSalePrice / Math.max(1, t.area); });
  data = filterInvalidPrices(data);
  data = filterOutliers(data);
  data = filterReadyOnly(data);
  data = filterDuplicates(data);
  data = filterUltraLuxury(data);
  data = validateGroupCounts(data);
  console.log(`✅ Cleaned: ${data.length} transactions`);
  return data;
}

// ===== FETCH DLD DATA =====
function fetchDLDData() {
  return new Promise((resolve, reject) => {
    const baseUrl = process.env.URL || 'https://aqar-evaluate-engine.netlify.app';
    const fileUrl = `${baseUrl}/data/dld-transactions.json`;
    
    console.log('🔍 Fetching DLD data from:', fileUrl);
    
    const parsedUrl = url.parse(fileUrl);
    const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.path,
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          console.log(`✅ Loaded ${json.length} transactions via HTTP`);
          resolve(json);
        } catch (e) {
          reject(new Error('Failed to parse JSON: ' + e.message));
        }
      });
    });
    
    req.on('error', (e) => { reject(new Error('HTTP request failed: ' + e.message)); });
    req.end();
  });
}

// ===== COMPUTE MEDIAN =====
function computeMedian(transactions) {
  if (!transactions || transactions.length === 0) return null;
  const prices = transactions.map(t => t.actualSalePrice / t.area);
  const sorted = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

// ===== COMPUTE MONTHLY GROWTH RATE =====
function computeMonthlyGrowthRate(transactions) {
  if (!transactions || transactions.length < 10) return 0.005; // Default 0.5%
  
  // Group by month
  const monthly = {};
  for (const t of transactions) {
    const date = new Date(t.saleDate);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!monthly[monthKey]) monthly[monthKey] = [];
    monthly[monthKey].push(t.actualSalePrice / t.area);
  }
  
  const months = Object.keys(monthly).sort();
  if (months.length < 3) return 0.005;
  
  // Calculate monthly medians
  const medians = months.map(m => {
    const prices = monthly[m];
    const sorted = [...prices].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  });
  
  // Calculate average monthly growth
  let totalGrowth = 0;
  let count = 0;
  for (let i = 1; i < medians.length; i++) {
    if (medians[i-1] > 0) {
      totalGrowth += (medians[i] - medians[i-1]) / medians[i-1];
      count++;
    }
  }
  
  return count > 0 ? totalGrowth / count : 0.005;
}

// ===== TIME-ADJUSTED PRICE =====
function getTimeAdjustedPrice(saleDate, pricePerSqm, monthlyGrowthRate, monthsDiff) {
  // Adjusted price = price * (1 + growthRate)^months
  return pricePerSqm * Math.pow(1 + monthlyGrowthRate, monthsDiff);
}

// ===== ADAPTIVE SEARCH =====
function adaptiveSearch(district, propertyType, sizeCat, transactions, targetDate) {
  const windows = [30, 60, 90, 180, 365, 730, Infinity];
  const districtUpper = district.toUpperCase();
  
  // Pre-filter by district and type
  const relevant = transactions.filter(t => 
    t.district.toUpperCase() === districtUpper &&
    t.propertyType === propertyType &&
    getSizeCategory(t.area, t.propertyType) === sizeCat
  );
  
  if (relevant.length === 0) return null;
  
  // Compute monthly growth rate for this district/type
  const monthlyGrowthRate = computeMonthlyGrowthRate(relevant);
  console.log(`📈 Monthly growth rate for ${district}: ${(monthlyGrowthRate * 100).toFixed(1)}%`);
  
  for (const windowDays of windows) {
    const cutoffDate = new Date(targetDate);
    cutoffDate.setDate(cutoffDate.getDate() - windowDays);
    
    const filtered = relevant.filter(t => {
      const saleDate = new Date(t.saleDate);
      return saleDate >= cutoffDate;
    });
    
    if (filtered.length >= 5) {
      // Calculate time-adjusted prices
      const adjustedPrices = filtered.map(t => {
        const saleDate = new Date(t.saleDate);
        const monthsDiff = (targetDate - saleDate) / (30.44 * 86400000);
        const currentPricePerSqm = getTimeAdjustedPrice(
          saleDate, 
          t.actualSalePrice / t.area, 
          monthlyGrowthRate, 
          monthsDiff
        );
        return currentPricePerSqm;
      });
      
      const sorted = [...adjustedPrices].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
      
      const confidence = windowDays <= 30 ? 'high' : 
                        windowDays <= 90 ? 'medium' : 
                        windowDays <= 180 ? 'low' : 'very-low';
      
      return {
        avgPricePerSqm: Math.round(median),
        count: filtered.length,
        timeWindow: windowDays,
        adjusted: true,
        confidence: confidence,
        monthlyGrowthRate: monthlyGrowthRate,
        source: 'dld',
        level: windowDays <= 90 ? 'district_size' : 'district_size_adjusted'
      };
    }
  }
  
  return null;
}

// ===== HANDLER =====
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  try {
    const { district, propertyType, area, project } = event.queryStringParameters || {};

    if (!district || !propertyType || !area) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ found: false, error: 'district, propertyType, and area are required' })
      };
    }

    // Fetch DLD data
    let transactions;
    try {
      transactions = await fetchDLDData();
    } catch (e) {
      console.error('❌ Failed to fetch DLD data:', e.message);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ found: false, error: 'Failed to load DLD data: ' + e.message })
      };
    }
    
    if (!transactions || transactions.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ found: false, error: 'No DLD data available' })
      };
    }

    // Apply 10-stage cleaning
    const cleaned = applyAllFilters(transactions);
    
    if (cleaned.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ found: false, error: 'No clean data available' })
      };
    }

    const sizeCat = getSizeCategory(parseFloat(area), propertyType);
    const targetDate = new Date();
    
    // ===== ADAPTIVE SEARCH =====
    const result = adaptiveSearch(district, propertyType, sizeCat, cleaned, targetDate);

    if (!result) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          found: false,
          reason: 'no-sufficient-dld-comparables',
          district: district,
          propertyType: propertyType,
          sizeCat: sizeCat
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
        adjusted: result.adjusted,
        level: result.level,
        matchedKey: `${district}__${propertyType}__${sizeCat}`,
        source: 'dld',
        weight: 1.0,
        generatedAt: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('❌ DLD Lookup Error:', error);
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