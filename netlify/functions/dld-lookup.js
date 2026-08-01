const fs = require('fs');
const path = require('path');
const LOOKUP_PATH = path.join(process.cwd(), 'data', 'dld-price-lookup.json');

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

    if (!fs.existsSync(LOOKUP_PATH)) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ found: false, error: 'Lookup file not found' })
      };
    }

    const raw = fs.readFileSync(LOOKUP_PATH, 'utf8');
    const lookup = JSON.parse(raw);
    const tables = lookup.tables;

    const sizeCat = getSizeCategory(parseFloat(area), propertyType);
    let match = null;
    let level = null;
    let matchedKey = null;

    const districtLower = district.toLowerCase().trim();

    // ===== 1. البحث في districtSize (الأولوية) =====
    if (tables.districtSize) {
      const keys = Object.keys(tables.districtSize);
      for (const key of keys) {
        const keyLower = key.toLowerCase();
        // التحقق: المفتاح يحتوي على اسم المنطقة، النوع، والحجم
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

    // ===== 2. البحث في district (بدون حجم) =====
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

    // ===== 3. البحث في projectSize (كحل أخير) =====
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

    // ===== 4. البحث في project (كحل أخير) =====
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
        source: 'dld',
        weight: 1.0,
        matchedKey: matchedKey,
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
        error: error.message
      })
    };
  }
};