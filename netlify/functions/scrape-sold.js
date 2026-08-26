// AQAR Valuation Engine — Sold Properties Scraper
// Fetches actual transaction data from Dubai Land Department & Property Finder

const axios = require('axios');
const SCRAPE_SOLD_ENDPOINT_ENABLED = process.env.SCRAPE_SOLD_ENDPOINT_ENABLED === 'true';

// ===== MAIN EXPORT =====
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  };

  if (!SCRAPE_SOLD_ENDPOINT_ENABLED) {
    return {
      statusCode: 410,
      headers,
      body: JSON.stringify({ error: 'This legacy sold-properties endpoint is disabled.' })
    };
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Use POST' }) };
  }

  try {
    const { city, propertyType, days } = JSON.parse(event.body || '{}');
    const daysBack = days || 60;
    
    console.log(`🔍 Fetching verified sold properties: ${city || 'all'} / ${propertyType || 'all'} / last ${daysBack} days`);
    let allProperties = [];

    if (city === 'dubai' || !city) {
      try {
        const dldData = await scrapeDLD(daysBack, propertyType);
        allProperties = allProperties.concat(dldData);
        console.log(`✅ DLD: ${dldData.length} records`);
      } catch (error) {
        console.log(`⚠️ Verified DLD source unavailable: ${error.message}`);
      }
    }

    const unique = deduplicateProperties(allProperties);
    if (unique.length === 0) {
      return {
        statusCode: 503,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Verified transaction source unavailable. No accuracy data was generated.',
          dataSource: 'unavailable'
        })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        count: unique.length,
        properties: unique.slice(0, 100),
        metrics: calculateAccuracyMetrics(unique),
        scrapedAt: new Date().toISOString(),
        dataSource: unique[0]?.scrapedFrom || 'verified'
      })
    };
  } catch (error) {
    console.error('❌ Error:', error.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Verified accuracy data could not be loaded.',
        dataSource: 'unavailable'
      })
    };
  }
};

// ===== VERIFIED SOURCE ADAPTER =====
// This endpoint must never manufacture transaction or appraiser records.
// A real DLD adapter can be added here only when an approved source is available.
async function scrapeDLD() {
  throw new Error('Verified DLD source adapter is not configured');
}

// ===== HELPERS =====
function deduplicateProperties(properties) {
  const seen = new Set();
  return properties.filter(p => {
    const key = `${p.district}-${p.area}-${Math.round(p.actualSalePrice/10000)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function calculateAccuracyMetrics(properties) {
  if (!properties || properties.length === 0) {
    return { avgAccuracy: 0, avgDeviation: 0, totalRecords: 0 };
  }

  const total = properties.length;
  const accuracies = properties.map(p => 100 - Math.abs(p.aqarVsActual));
  const avgAccuracy = Math.round(accuracies.reduce((s, a) => s + a, 0) / total * 10) / 10;
  const deviations = properties.map(p => Math.abs(p.aqarVsActual));
  const avgDeviation = Math.round(deviations.reduce((s, d) => s + d, 0) / total * 10) / 10;

  return { avgAccuracy, avgDeviation, totalRecords: total };
}