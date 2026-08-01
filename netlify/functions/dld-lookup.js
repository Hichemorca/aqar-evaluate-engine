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

    // ===== TRY MULTIPLE PATHS =====
    let lookupContent = null;
    const possiblePaths = [
      path.join(process.cwd(), 'data', 'dld-price-lookup.json'),
      path.join(__dirname, '..', '..', 'data', 'dld-price-lookup.json'),
      path.join('/var/task', 'data', 'dld-price-lookup.json'),  // Netlify path
      path.join(__dirname, 'data', 'dld-price-lookup.json'),
      'data/dld-price-lookup.json'
    ];

    for (const p of possiblePaths) {
      try {
        if (fs.existsSync(p)) {
          lookupContent = fs.readFileSync(p, 'utf8');
          console.log('✅ Found lookup file at:', p);
          break;
        }
      } catch (e) {}
    }

    if (!lookupContent) {
      console.error('❌ Lookup file not found. Tried paths:', possiblePaths);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ found: false, error: 'Lookup file not found' })
      };
    }

    const lookup = JSON.parse(lookupContent);
    const tables = lookup.tables;

    const sizeCat = getSizeCategory(parseFloat(area), propertyType);
    let match = null;
    let level = null;
    let matchedKey = null;

    const districtLower = district.toLowerCase().trim();

    // ===== 1. Search in districtSize =====
    if (tables.districtSize) {
      const keys = Object.keys(tables.districtSize);
      for (const key of keys) {
        const keyLower = key.toLowerCase();
        if (keyLower.includes(districtLower) && 
            key.includes(propertyType) && 
            key.includes(sizeCat) && 
            tables.districtSize[key].count >= 5) {
          match = tables.districtSize[key];
          level = 'district_size';
          matchedKey = key;
          break;
        }
      }
    }

    // ===== 2. Search in district =====
    if (!match && tables.district) {
      const keys = Object.keys(tables.district);
      for (const key of keys) {
        const keyLower = key.toLowerCase();
        if (keyLower.includes(districtLower) && 
            key.includes(propertyType) && 
            tables.district[key].count >= 5) {
          match = tables.district[key];
          level = 'district';
          matchedKey = key;
          break;
        }
      }
    }

    // ===== 3. Search in projectSize =====
    if (!match && tables.projectSize) {
      const keys = Object.keys(tables.projectSize);
      for (const key of keys) {
        const keyLower = key.toLowerCase();
        if (keyLower.includes(districtLower) && 
            key.includes(propertyType) && 
            key.includes(sizeCat) && 
            tables.projectSize[key].count >= 3) {
          match = tables.projectSize[key];
          level = 'project_size';
          matchedKey = key;
          break;
        }
      }
    }

    // ===== 4. Search in project =====
    if (!match && tables.project) {
      const keys = Object.keys(tables.project);
      for (const key of keys) {
        const keyLower = key.toLowerCase();
        if (keyLower.includes(districtLower) && 
            key.includes(propertyType) && 
            tables.project[key].count >= 3) {
          match = tables.project[key];
          level = 'project';
          matchedKey = key;
          break;
        }
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
        generatedAt: lookup.generatedAt
      })
    };

  } catch (error) {
    console.error('❌ DLD Lookup Error:', error);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        found: false,
        error: error.message,
        stack: error.stack
      })
    };
  }
};