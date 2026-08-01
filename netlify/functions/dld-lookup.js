const fs = require('fs');
const path = require('path');
const LOOKUP_PATH = path.join(process.cwd(), 'data', 'dld-price-lookup.json');

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

    // قراءة الملف
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

    // دالة التصنيف
    function getSizeCategory(areaNum, propType) {
      if (propType === 'land') {
        if (areaNum <= 200) return 'land_tiny';
        if (areaNum <= 500) return 'land_small';
        if (areaNum <= 1000) return 'land_medium';
        if (areaNum <= 3000) return 'land_large';
        return 'land_xlarge';
      }
      if (areaNum < 80) return 'small';
      if (areaNum > 200) return 'large';
      return 'medium';
    }

    const sizeCat = getSizeCategory(parseFloat(area), propertyType);
    let match = null, level = null;

    // 1. مشروع + نوع + حجم
    if (project && project.length > 2) {
      const projSizeKey = `${project}__${propertyType}__${sizeCat}`;
      if (tables.projectSize && tables.projectSize[projSizeKey] && tables.projectSize[projSizeKey].count >= 3) {
        match = tables.projectSize[projSizeKey];
        level = 'project_size';
      }
      // 2. مشروع + نوع
      if (!match) {
        const projKey = `${project}__${propertyType}`;
        const minCount = propertyType === 'retail' ? 2 : 5;
        if (tables.project && tables.project[projKey] && tables.project[projKey].count >= minCount) {
          match = tables.project[projKey];
          level = 'project';
        }
      }
    }

    // 3. منطقة + نوع + حجم
    if (!match) {
      const distSizeKey = `${district}__${propertyType}__${sizeCat}`;
      if (tables.districtSize && tables.districtSize[distSizeKey] && tables.districtSize[distSizeKey].count >= 5) {
        match = tables.districtSize[distSizeKey];
        level = 'district_size';
      }
    }

    // 4. منطقة + نوع
    if (!match) {
      const distKey = `${district}__${propertyType}`;
      if (tables.district && tables.district[distKey] && tables.district[distKey].count >= 5) {
        match = tables.district[distKey];
        level = 'district';
      }
    }

    if (!match) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ found: false, reason: 'no-sufficient-dld-comparables' })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        found: true,
        avgPricePerSqm: match.medianPricePerSqm,
        count: match.count,
        level,
        source: 'dld',
        weight: 1.0,
        generatedAt: lookup.generatedAt
      })
    };
  } catch (err) {
    console.error('DLD Lookup Error:', err);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ found: false, error: err.message })
    };
  }
};