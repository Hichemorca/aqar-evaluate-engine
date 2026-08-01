const fs = require('fs');
const path = require('path');
const LOOKUP_PATH = path.join(process.cwd(), 'data', 'dld-price-lookup.json');

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

    // ===== 1. البحث بالمشروع (إذا وجد) =====
    if (project && project.length > 2) {
      // project + type + size
      const projSizeKey = `${project}__${propertyType}__${sizeCat}`;
      if (tables.projectSize && tables.projectSize[projSizeKey] && tables.projectSize[projSizeKey].count >= 3) {
        match = tables.projectSize[projSizeKey];
        level = 'project_size';
      }
      // project + type
      if (!match) {
        const projKey = `${project}__${propertyType}`;
        const minCount = propertyType === 'retail' ? 2 : 5;
        if (tables.project && tables.project[projKey] && tables.project[projKey].count >= minCount) {
          match = tables.project[projKey];
          level = 'project';
        }
      }
    }

    // ===== 2. البحث بالمنطقة (district) =====
    if (!match) {
      const districtLower = district.toLowerCase().trim();
      
      // 2a. البحث في districtSize
      if (tables.districtSize) {
        for (const [key, value] of Object.entries(tables.districtSize)) {
          // المفتاح في الجدول يكون: "المنطقة__نوع__حجم"
          const parts = key.split('__');
          if (parts.length >= 3) {
            const keyDistrict = parts[0].toLowerCase();
            const keyType = parts[1];
            const keySize = parts[2];
            
            // التحقق: المنطقة تحتوي على النص المطلوب، النوع متطابق، الحجم متطابق
            if (keyDistrict.includes(districtLower) && 
                keyType === propertyType && 
                keySize === sizeCat && 
                value.count >= 5) {
              match = value;
              level = 'district_size';
              console.log('✅ Found match:', key);
              break;
            }
          }
        }
      }
    }

    // 2b. البحث في district (بدون حجم)
    if (!match && tables.district) {
      const districtLower = district.toLowerCase().trim();
      for (const [key, value] of Object.entries(tables.district)) {
        const parts = key.split('__');
        if (parts.length >= 2) {
          const keyDistrict = parts[0].toLowerCase();
          const keyType = parts[1];
          
          if (keyDistrict.includes(districtLower) && 
              keyType === propertyType && 
              value.count >= 5) {
            match = value;
            level = 'district';
            console.log('✅ Found match (district):', key);
            break;
          }
        }
      }
    }

    // ===== 3. البحث في projectSize (كحل أخير) =====
    if (!match && tables.projectSize) {
      const districtLower = district.toLowerCase().trim();
      for (const [key, value] of Object.entries(tables.projectSize)) {
        if (key.toLowerCase().includes(districtLower) && 
            key.includes(propertyType) && 
            key.includes(sizeCat) && 
            value.count >= 3) {
          match = value;
          level = 'project_size';
          console.log('✅ Found match (projectSize fallback):', key);
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