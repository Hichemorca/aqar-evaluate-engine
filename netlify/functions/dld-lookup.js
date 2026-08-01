const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

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

// ===== 10-STAGE CLEANING (مطابق لـ evaluate-and-save.js) =====

// S1: إزالة المعاملات غير البيعية
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

// S2: إزالة البيانات الناقصة
function filterMissingData(transactions) {
  return transactions.filter(t => 
    t.district && t.district !== 'Unknown' && 
    t.propertyType && t.propertyType !== 'Unknown' && 
    t.area > 0 && t.actualSalePrice > 0
  );
}

// S2.5: فحص تطابق المساحة
function filterAreaMismatch(transactions) {
  return transactions.filter(t => {
    if (t.procedureArea && t.procedureArea > 0) {
      const ratio = t.area / t.procedureArea;
      if (ratio < 0.5 || ratio > 2.0) return false;
    }
    return true;
  });
}

// S3: تصفية المساحات غير المنطقية
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

// S4: تصفية الأسعار الصفرية
function filterInvalidPrices(transactions) {
  transactions.forEach(t => { t.pricePerSqm = t.actualSalePrice / Math.max(1, t.area); });
  return transactions.filter(t => t.pricePerSqm > 0);
}

// S5: إزالة القيم المتطرفة (IQR)
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

// S6: تصفية المشاريع غير الجاهزة
function filterReadyOnly(transactions) {
  return transactions.filter(t => {
    if (t.isOffPlan === true) return false;
    const status = (t.status || t.projectStatus || '').toLowerCase();
    if (status.includes('off-plan') || status.includes('offplan') || status.includes('under construction') || status.includes('launched')) return false;
    return true;
  });
}

// S7: إزالة المكررات
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

// S8: إزالة العقارات فائقة الفخامة
function filterUltraLuxury(transactions) {
  return transactions.filter(t => {
    const pricePerSqm = t.actualSalePrice / Math.max(1, t.area);
    if (pricePerSqm > 50000) return false;
    if (t.actualSalePrice > 50000000) return false;
    return true;
  });
}

// S9: تصفية المجموعات الصغيرة
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

// ===== APPLY ALL FILTERS =====
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

// ===== FETCH DLD DATA VIA HTTP =====
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

// ===== BUILD LOOKUP =====
function buildLookup(transactions) {
  const districtSizeGroups = {};
  const districtGroups = {};
  
  const valid = transactions.filter(t => {
    if (!t.district || !t.propertyType) return false;
    if (!t.area || t.area <= 0) return false;
    if (!t.actualSalePrice || t.actualSalePrice <= 0) return false;
    if (t.isOffPlan === true) return false;
    return true;
  });
  
  console.log(`📊 Building lookup from ${valid.length} valid transactions...`);
  
  for (const t of valid) {
    const sizeCat = getSizeCategory(t.area, t.propertyType);
    const district = t.district.toUpperCase();
    const propertyType = t.propertyType;
    
    const distSizeKey = `${district}__${propertyType}__${sizeCat}`;
    if (!districtSizeGroups[distSizeKey]) districtSizeGroups[distSizeKey] = [];
    districtSizeGroups[distSizeKey].push(t);
    
    const distKey = `${district}__${propertyType}`;
    if (!districtGroups[distKey]) districtGroups[distKey] = [];
    districtGroups[distKey].push(t);
  }
  
  const result = { districtSize: {}, district: {} };
  
  for (const [key, items] of Object.entries(districtSizeGroups)) {
    if (items.length >= 5) {
      const median = computeMedian(items);
      if (median) {
        result.districtSize[key] = { medianPricePerSqm: Math.round(median), count: items.length };
      }
    }
  }
  
  for (const [key, items] of Object.entries(districtGroups)) {
    if (items.length >= 5) {
      const median = computeMedian(items);
      if (median) {
        result.district[key] = { medianPricePerSqm: Math.round(median), count: items.length };
      }
    }
  }
  
  console.log(`✅ Built ${Object.keys(result.districtSize).length} districtSize groups, ${Object.keys(result.district).length} district groups`);
  return result;
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

    // ===== APPLY SAME FILTERS AS evaluate-and-save.js =====
    const cleaned = applyAllFilters(transactions);
    
    if (cleaned.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ found: false, error: 'No clean data available' })
      };
    }

    const tables = buildLookup(cleaned);

    const sizeCat = getSizeCategory(parseFloat(area), propertyType);
    let match = null;
    let level = null;
    let matchedKey = null;

    const districtUpper = district.toUpperCase().trim();

    const distSizeKey = `${districtUpper}__${propertyType}__${sizeCat}`;
    if (tables.districtSize[distSizeKey] && tables.districtSize[distSizeKey].count >= 5) {
      match = tables.districtSize[distSizeKey];
      level = 'district_size';
      matchedKey = distSizeKey;
    }

    if (!match) {
      const distKey = `${districtUpper}__${propertyType}`;
      if (tables.district[distKey] && tables.district[distKey].count >= 5) {
        match = tables.district[distKey];
        level = 'district';
        matchedKey = distKey;
      }
    }

    if (!match) {
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
        avgPricePerSqm: match.medianPricePerSqm,
        count: match.count,
        level: level,
        matchedKey: matchedKey,
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