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

// ===== FETCH DLD DATA VIA HTTP =====
function fetchDLDData() {
  return new Promise((resolve, reject) => {
    // Use the public URL of the file
    const baseUrl = process.env.URL || 'https://aqar-evaluate-engine.netlify.app';
    const fileUrl = `${baseUrl}/data/dld-transactions.json`;
    
    console.log('🔍 Fetching DLD data from:', fileUrl);
    
    const parsedUrl = url.parse(fileUrl);
    const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.path,
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
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
    
    req.on('error', (e) => {
      reject(new Error('HTTP request failed: ' + e.message));
    });
    
    req.end();
  });
}

// ===== COMPUTE MEDIAN =====
function computeMedian(transactions) {
  if (!transactions || transactions.length === 0) return null;
  
  const prices = transactions.map(t => t.actualSalePrice / t.area);
  const sorted = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
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

    // Fetch DLD data via HTTP
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

    const tables = buildLookup(transactions);

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