const fs = require('fs');
const path = require('path');

// ===== PATHS =====
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DLD_FILE = path.join(DATA_DIR, 'dld-transactions.json');
const DLD_ENRICHED_FILE = path.join(DATA_DIR, 'dld-transactions-enriched.json');

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

// ===== LOAD DLD DATA =====
function loadDLDData() {
  let data = [];
  
  // Try enriched first
  if (fs.existsSync(DLD_ENRICHED_FILE)) {
    try {
      data = JSON.parse(fs.readFileSync(DLD_ENRICHED_FILE, 'utf8'));
      console.log(`✅ Loaded ${data.length} transactions from enriched DLD data`);
      return data;
    } catch(e) {
      console.log('⚠️ Failed to load enriched data:', e.message);
    }
  }
  
  // Fallback to basic
  if (fs.existsSync(DLD_FILE)) {
    try {
      data = JSON.parse(fs.readFileSync(DLD_FILE, 'utf8'));
      console.log(`✅ Loaded ${data.length} transactions from basic DLD data`);
      return data;
    } catch(e) {
      console.log('⚠️ Failed to load basic data:', e.message);
    }
  }
  
  return [];
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

// ===== BUILD LOOKUP ON THE FLY =====
function buildLookup(transactions) {
  const districtSizeGroups = {};
  const districtGroups = {};
  const projectSizeGroups = {};
  const projectGroups = {};
  
  for (const t of transactions) {
    if (!t.district || !t.propertyType || !t.area || !t.actualSalePrice) continue;
    if (t.isOffPlan === true) continue;
    if (t.actualSalePrice <= 0 || t.area <= 0) continue;
    
    const sizeCat = getSizeCategory(t.area, t.propertyType);
    const district = t.district.toUpperCase();
    const propertyType = t.propertyType;
    const project = t.project || '';
    
    // District + Type + Size
    const distSizeKey = `${district}__${propertyType}__${sizeCat}`;
    if (!districtSizeGroups[distSizeKey]) districtSizeGroups[distSizeKey] = [];
    districtSizeGroups[distSizeKey].push(t);
    
    // District + Type
    const distKey = `${district}__${propertyType}`;
    if (!districtGroups[distKey]) districtGroups[distKey] = [];
    districtGroups[distKey].push(t);
    
    // Project + Type + Size
    if (project && project.length > 2) {
      const projSizeKey = `${project}__${propertyType}__${sizeCat}`;
      if (!projectSizeGroups[projSizeKey]) projectSizeGroups[projSizeKey] = [];
      projectSizeGroups[projSizeKey].push(t);
      
      const projKey = `${project}__${propertyType}`;
      if (!projectGroups[projKey]) projectGroups[projKey] = [];
      projectGroups[projKey].push(t);
    }
  }
  
  // Compute medians and filter
  const result = {
    districtSize: {},
    district: {},
    projectSize: {},
    project: {}
  };
  
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
  
  for (const [key, items] of Object.entries(projectSizeGroups)) {
    if (items.length >= 3) {
      const median = computeMedian(items);
      if (median) {
        result.projectSize[key] = { medianPricePerSqm: Math.round(median), count: items.length };
      }
    }
  }
  
  for (const [key, items] of Object.entries(projectGroups)) {
    const minCount = key.includes('retail') ? 2 : 5;
    if (items.length >= minCount) {
      const median = computeMedian(items);
      if (median) {
        result.project[key] = { medianPricePerSqm: Math.round(median), count: items.length };
      }
    }
  }
  
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

    // ===== LOAD DLD DATA =====
    const transactions = loadDLDData();
    if (transactions.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ found: false, error: 'No DLD data available' })
      };
    }

    // ===== BUILD LOOKUP =====
    const tables = buildLookup(transactions);

    const sizeCat = getSizeCategory(parseFloat(area), propertyType);
    let match = null;
    let level = null;
    let matchedKey = null;

    const districtUpper = district.toUpperCase().trim();

    // ===== 1. Search in districtSize =====
    const distSizeKey = `${districtUpper}__${propertyType}__${sizeCat}`;
    if (tables.districtSize[distSizeKey] && tables.districtSize[distSizeKey].count >= 5) {
      match = tables.districtSize[distSizeKey];
      level = 'district_size';
      matchedKey = distSizeKey;
    }

    // ===== 2. Search in district =====
    if (!match) {
      const distKey = `${districtUpper}__${propertyType}`;
      if (tables.district[distKey] && tables.district[distKey].count >= 5) {
        match = tables.district[distKey];
        level = 'district';
        matchedKey = distKey;
      }
    }

    // ===== 3. Search in projectSize =====
    if (!match && project && project.length > 2) {
      const projSizeKey = `${project}__${propertyType}__${sizeCat}`;
      if (tables.projectSize[projSizeKey] && tables.projectSize[projSizeKey].count >= 3) {
        match = tables.projectSize[projSizeKey];
        level = 'project_size';
        matchedKey = projSizeKey;
      }
    }

    // ===== 4. Search in project =====
    if (!match && project && project.length > 2) {
      const projKey = `${project}__${propertyType}`;
      const minCount = propertyType === 'retail' ? 2 : 5;
      if (tables.project[projKey] && tables.project[projKey].count >= minCount) {
        match = tables.project[projKey];
        level = 'project';
        matchedKey = projKey;
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