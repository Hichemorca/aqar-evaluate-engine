// AQAR Valuation Engine — Live Scraping with ScrapingBee + GIS Integration
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { geocodeAddress, reverseGeocode, FACILITY_TYPES } = require(path.join(__dirname, '../../scripts/fetch-osm'));

const SCRAPINGBEE_KEY = process.env.SCRAPINGBEE_KEY || '';
const SCRAPINGBEE_URL = 'https://app.scrapingbee.com/api/v1';

// Cache: 24 hours
const cache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000;

// GIS Cache
const gisCache = new Map();
const GIS_CACHE_TTL = 24 * 60 * 60 * 1000;

// OSM Cache file path
const OSM_CACHE_PATH = path.join(__dirname, '../../data/osm-cache.json');
let osmCache = null;

// ===== LOAD OSM CACHE =====
function loadOSMCache() {
  if (osmCache) return osmCache;
  try {
    if (fs.existsSync(OSM_CACHE_PATH)) {
      const data = fs.readFileSync(OSM_CACHE_PATH, 'utf8');
      osmCache = JSON.parse(data);
      console.log(`✅ Loaded OSM cache: ${Object.keys(osmCache.data || {}).length} districts`);
      return osmCache;
    }
  } catch (error) {
    console.log(`⚠️ Could not load OSM cache: ${error.message}`);
  }
  return null;
}

// ===== HAVERSINE =====
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1000;
}

// ===== GIS FUNCTIONS (Reading from cached file) =====
async function getGISData(lat, lng, radius = 500) {
  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)},${radius}`;
  const cached = gisCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < GIS_CACHE_TTL) {
    console.log('✅ GIS: Using cached data');
    return cached.data;
  }

  const cache = loadOSMCache();
  if (!cache || !cache.data) {
    console.log('⚠️ No OSM cache available');
    return {
      facilities: {},
      totalScore: 0,
      count: 0,
      source: 'no-cache',
      error: 'OSM data not available'
    };
  }

  // Find closest district
  let closestDistrict = null;
  let closestDistance = Infinity;

  for (const [district, data] of Object.entries(cache.data)) {
    const dist = haversine(lat, lng, data.lat, data.lng);
    if (dist < closestDistance) {
      closestDistance = dist;
      closestDistrict = district;
    }
  }

  if (closestDistrict && closestDistance < 3000) {
    console.log(`📍 Using cached data for ${closestDistrict} (${Math.round(closestDistance)}m away)`);
    const districtData = cache.data[closestDistrict];
    const result = {
      ...districtData,
      lat,
      lng,
      radius,
      source: 'cached',
      closestDistrict,
      closestDistance: Math.round(closestDistance)
    };
    gisCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  }

  console.log('⚠️ No nearby district found in cache');
  return {
    facilities: {},
    totalScore: 0,
    count: 0,
    source: 'no-match',
    error: 'No matching district found in cache'
  };
}

async function getGISFromAddress(address) {
  const geocodeResult = await geocodeAddress(address);
  if (!geocodeResult) return null;
  
  const gisData = await getGISData(geocodeResult.lat, geocodeResult.lng);
  return {
    ...geocodeResult,
    ...gisData
  };
}

function getProximityMultiplier(gisData) {
  if (!gisData || !gisData.totalScore) return 1;
  const multiplier = 1 + (gisData.totalScore * 0.5);
  return Math.min(1.5, Math.max(1.0, multiplier));
}

function getFacilitySummary(gisData) {
  if (!gisData || !gisData.facilities) return 'No GIS data available';
  
  const summary = [];
  for (const [key, data] of Object.entries(gisData.facilities)) {
    if (data.count > 0) {
      const label = FACILITY_TYPES[key]?.label || key;
      const dist = data.distance !== null ? `${data.distance}m` : 'nearby';
      summary.push(`${label}: ${data.count} (${dist})`);
    }
  }
  
  return summary.length > 0 ? summary.join(' • ') : 'No nearby facilities found';
}

// ===== UAE MARKET PRICES =====
const UAE_MARKET = {
  dubai: {
    'Dubai Marina': { apt: 11850, villa: 14200, townhouse: 12500, office: 10500, retail: 13500 },
    'Palm Jumeirah': { apt: 16500, villa: 22000, townhouse: 18000, office: 12000, retail: 18000 },
    'Downtown Dubai': { apt: 13200, villa: 18000, townhouse: 15500, office: 12500, retail: 20000 },
    'Business Bay': { apt: 9200, villa: 12000, townhouse: 10500, office: 8800, retail: 11000 },
    'Jumeirah Village Circle': { apt: 6200, villa: 7200, townhouse: 6800, office: 5500, retail: 7000 },
    'Jumeirah Lake Towers': { apt: 7200, villa: 8500, townhouse: 7800, office: 6800, retail: 8200 },
    'Dubai Hills Estate': { apt: 8200, villa: 9500, townhouse: 8800, office: 7500, retail: 9500 },
    'Arabian Ranches': { apt: 6500, villa: 7500, townhouse: 7000, office: 5200, retail: 6800 },
    'Emirates Hills': { apt: 9500, villa: 14000, townhouse: 11500, office: 8500, retail: 12000 },
    'Emaar Beachfront': { apt: 14500, villa: 18500, townhouse: 16000, office: 11000, retail: 16000 },
    'Dubai Creek Harbour': { apt: 8800, villa: 11000, townhouse: 9800, office: 8200, retail: 10500 },
    'Al Barsha': { apt: 5500, villa: 6500, townhouse: 6000, office: 4800, retail: 6200 },
    'The Springs': { apt: 6500, villa: 7500, townhouse: 7000, office: 5200, retail: 6800 },
    'The Meadows': { apt: 7000, villa: 8200, townhouse: 7600, office: 5500, retail: 7200 },
    'Deira': { apt: 3500, villa: 4200, townhouse: 3800, office: 3200, retail: 4500 },
    'Bur Dubai': { apt: 4000, villa: 4800, townhouse: 4400, office: 3600, retail: 5200 },
    'Damac Hills': { apt: 5800, villa: 6800, townhouse: 6300, office: 4800, retail: 6500 },
    'Mirdif': { apt: 4500, villa: 5500, townhouse: 5000, office: 4000, retail: 5000 },
    'Al Furjan': { apt: 5000, villa: 6000, townhouse: 5500, office: 4200, retail: 5500 },
    'Discovery Gardens': { apt: 3800, villa: 4500, townhouse: 4200, office: 3200, retail: 4200 },
    'Motor City': { apt: 5200, villa: 6200, townhouse: 5800, office: 4400, retail: 5800 },
    'Dubai Sports City': { apt: 4800, villa: 5800, townhouse: 5300, office: 4200, retail: 5200 },
    'Dubai Silicon Oasis': { apt: 5000, villa: 6000, townhouse: 5500, office: 4500, retail: 5500 },
    'International City': { apt: 3200, villa: 4000, townhouse: 3600, office: 2800, retail: 3800 },
    'Al Nahda': { apt: 3400, villa: 4000, townhouse: 3700, office: 3000, retail: 3800 }
  },
  'abu-dhabi': {
    'Saadiyat Island': { apt: 10200, villa: 13000, townhouse: 11500, office: 9500, retail: 12500 },
    'Yas Island': { apt: 7500, villa: 9000, townhouse: 8200, office: 6800, retail: 8500 },
    'Al Reem Island': { apt: 7200, villa: 8500, townhouse: 7800, office: 6500, retail: 8200 },
    'Al Raha Beach': { apt: 8200, villa: 10000, townhouse: 9000, office: 7500, retail: 9500 },
    'Khalifa City': { apt: 4500, villa: 5500, townhouse: 5000, office: 4000, retail: 5200 },
    'Mohammed Bin Zayed City': { apt: 3800, villa: 4500, townhouse: 4200, office: 3400, retail: 4400 },
    'Al Reef': { apt: 5000, villa: 6000, townhouse: 5500, office: 4400, retail: 5800 },
    'Corniche Area': { apt: 6800, villa: 8000, townhouse: 7200, office: 6200, retail: 7800 },
    'Al Maryah Island': { apt: 9000, villa: 12000, townhouse: 10500, office: 8500, retail: 11000 },
    'Masdar City': { apt: 5500, villa: 7000, townhouse: 6200, office: 5000, retail: 6500 },
    'Al Ain City': { apt: 3000, villa: 3800, townhouse: 3400, office: 2600, retail: 3500 },
    'Al Bateen': { apt: 6500, villa: 7800, townhouse: 7000, office: 5800, retail: 7200 },
    'Khalidiya': { apt: 5500, villa: 6500, townhouse: 6000, office: 4800, retail: 6200 }
  },
  sharjah: {
    'Al Majaz': { apt: 3200, villa: 3800, townhouse: 3500, office: 2800, retail: 3600 },
    'Al Nahda Sharjah': { apt: 2800, villa: 3400, townhouse: 3100, office: 2500, retail: 3200 },
    'Al Taawun': { apt: 3300, villa: 3900, townhouse: 3600, office: 2900, retail: 3700 },
    'Muwaileh': { apt: 2600, villa: 3200, townhouse: 2900, office: 2300, retail: 3000 },
    'Aljada': { apt: 3800, villa: 4500, townhouse: 4200, office: 3400, retail: 4400 },
    'Al Khan': { apt: 3000, villa: 3800, townhouse: 3400, office: 2600, retail: 3500 },
    'Maryam Island': { apt: 4000, villa: 5000, townhouse: 4500, office: 3500, retail: 4600 }
  },
  ajman: {
    'Al Rashidiya': { apt: 2200, villa: 2800, townhouse: 2500, office: 2000, retail: 2600 },
    'Al Nuaimiya': { apt: 2000, villa: 2500, townhouse: 2200, office: 1800, retail: 2400 },
    'Emirates City': { apt: 1800, villa: 2300, townhouse: 2000, office: 1600, retail: 2200 }
  },
  'ras-al-khaimah': {
    'Al Hamra Village': { apt: 3200, villa: 4200, townhouse: 3700, office: 2800, retail: 3800 },
    'Mina Al Arab': { apt: 2800, villa: 3500, townhouse: 3100, office: 2500, retail: 3200 },
    'Al Marjan Island': { apt: 3600, villa: 4500, townhouse: 4000, office: 3200, retail: 4200 }
  },
  fujairah: {
    'Al Aqah': { apt: 2800, villa: 3500, townhouse: 3100, office: 2500, retail: 3200 },
    'Fujairah City Center': { apt: 2000, villa: 2500, townhouse: 2200, office: 1800, retail: 2400 }
  },
  'umm-al-quwain': {
    'Umm Al Quwain Marina': { apt: 2200, villa: 2800, townhouse: 2500, office: 2000, retail: 2600 }
  }
};

function getFallbackPrice(city, district, propertyType) {
  const cityData = UAE_MARKET[city];
  if (!cityData) return 5000;
  const districtData = cityData[district] || Object.values(cityData)[0];
  if (!districtData) return 5000;
  const typeMap = { apartment: 'apt', villa: 'villa', townhouse: 'townhouse', office: 'office', retail: 'retail' };
  const key = typeMap[propertyType] || 'apt';
  return districtData[key] || districtData.apt || 5000;
}

async function scrapeWithScrapingBee(url) {
  if (!SCRAPINGBEE_KEY) {
    console.log('⚠️ No ScrapingBee API key configured');
    return null;
  }
  
  try {
    const response = await axios.get(SCRAPINGBEE_URL, {
      params: {
        api_key: SCRAPINGBEE_KEY,
        url: url,
        render_js: false,
        country_code: 'ae',
        timeout: 15000
      }
    });
    return response.data;
  } catch (error) {
    console.log(`⚠️ ScrapingBee failed for ${url}: ${error.message}`);
    return null;
  }
}

function extractSalesFromHTML(html, source) {
  if (!html) return [];
  
  const sales = [];
  const priceRegex = /(?:AED|د\.إ)\s*([\d,]+(?:\s*(?:Million|K))?)/gi;
  const areaRegex = /([\d,]+)\s*(?:sq\s*ft|sq\.?\s*m|م٢|قدم)/gi;
  
  const prices = [...html.matchAll(priceRegex)];
  const areas = [...html.matchAll(areaRegex)];
  
  const count = Math.min(prices.length, areas.length, 15);
  
  for (let i = 0; i < count; i++) {
    try {
      let price = parseFloat(prices[i][1].replace(/,/g, ''));
      if (prices[i][0].toLowerCase().includes('m')) price *= 1000000;
      if (prices[i][0].toLowerCase().includes('k')) price *= 1000;
      
      let sqm = parseFloat(areas[i][1].replace(/,/g, ''));
      if (areas[i][0].toLowerCase().includes('ft') || areas[i][0].includes('قدم')) {
        sqm = Math.round(sqm * 0.0929);
      }
      
      if (price > 50000 && sqm > 15 && price < 200000000) {
        sales.push({
          price: Math.round(price),
          sqm: sqm,
          pricePerSqm: Math.round(price / sqm),
          date: new Date().toISOString().split('T')[0],
          source: source
        });
      }
    } catch (e) {}
  }

  return sales.slice(0, 12);
}

async function scrapeBayut(city, district, propertyType) {
  const citySlugMap = { dubai: 'dubai', 'abu-dhabi': 'abu-dhabi', sharjah: 'sharjah', ajman: 'ajman', 'ras-al-khaimah': 'rak', fujairah: 'fujairah', 'umm-al-quwain': 'uaq' };
  const citySlug = citySlugMap[city] || 'dubai';
  const typeSlug = propertyType === 'villa' ? 'villas' : 'apartments';
  const districtSlug = district.toLowerCase().replace(/\s+/g, '-').replace(/['']/g, '');
  
  const url = `https://www.bayut.com/for-sale/property/${districtSlug}-${citySlug}/${typeSlug}`;
  console.log(`🔍 Scraping Bayut: ${url}`);
  
  const html = await scrapeWithScrapingBee(url);
  return extractSalesFromHTML(html, 'Bayut');
}

async function scrapePropertyFinder(city, district, propertyType) {
  const typeMap = { apartment: 'apartments', villa: 'villas', townhouse: 'townhouses', office: 'commercial', retail: 'commercial' };
  const typeSlug = typeMap[propertyType] || 'apartments';
  const districtSlug = district.toLowerCase().replace(/\s+/g, '-');
  
  const url = `https://www.propertyfinder.ae/en/buy/${districtSlug}/${typeSlug}`;
  console.log(`🔍 Scraping Property Finder: ${url}`);
  
  const html = await scrapeWithScrapingBee(url);
  return extractSalesFromHTML(html, 'Property Finder');
}

function generateSalesFallback(city, district, propertyType, count) {
  const basePrice = getFallbackPrice(city, district, propertyType);
  const sales = [];
  
  for (let i = 0; i < count; i++) {
    const variation = 0.88 + Math.random() * 0.24;
    const pricePerSqm = Math.round(basePrice * variation);
    const sqm = propertyType === 'villa' ? Math.floor(Math.random() * 300) + 180 :
                propertyType === 'office' ? Math.floor(Math.random() * 350) + 80 :
                Math.floor(Math.random() * 120) + 50;
    const daysAgo = Math.floor(Math.random() * 60);
    
    sales.push({
      price: pricePerSqm * sqm,
      sqm,
      pricePerSqm,
      date: new Date(Date.now() - daysAgo * 86400000).toISOString().split('T')[0],
      source: 'Market Estimate'
    });
  }
  return sales;
}

// ===== MAIN EXPORT =====
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Use POST' }) };
  }

  try {
    const body = JSON.parse(event.body);
    const { city, district, propertyType, lat, lng, address, radius, reverse, gisOnly } = body;

    if (gisOnly) {
      let gisResult = null;
      
      if (lat && lng) {
        console.log(`📍 GIS Only: ${lat}, ${lng}`);
        gisResult = await getGISData(parseFloat(lat), parseFloat(lng), parseInt(radius) || 500);
      } else if (address) {
        console.log(`📍 GIS Only: ${address}`);
        const geocode = await geocodeAddress(address);
        if (geocode) {
          gisResult = await getGISData(geocode.lat, geocode.lng, parseInt(radius) || 500);
          gisResult.displayName = geocode.displayName;
        }
      }
      
      if (gisResult) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            gisData: gisResult,
            proximityMultiplier: getProximityMultiplier(gisResult),
            facilitySummary: getFacilitySummary(gisResult)
          })
        };
      }
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ error: 'No GIS data found' })
      };
    }

    if (reverse && lat && lng) {
      const result = await reverseGeocode(parseFloat(lat), parseFloat(lng));
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ address: result?.displayName || null })
      };
    }

    if (!city || !district) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'City and district required', sales: [], count: 0 })
      };
    }

    const cacheKey = `${city}-${district}-${propertyType}`;
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      console.log('✅ Serving from cache');
      let responseData = cached.data;
      
      if (lat && lng) {
        console.log(`📍 Adding GIS data for ${lat}, ${lng}`);
        const gisData = await getGISData(parseFloat(lat), parseFloat(lng), parseInt(radius) || 500);
        responseData.gisData = gisData;
        responseData.proximityMultiplier = getProximityMultiplier(gisData);
        responseData.facilitySummary = getFacilitySummary(gisData);
      }
      
      return { statusCode: 200, headers, body: JSON.stringify(responseData) };
    }

    let allSales = [];
    let dataSource = 'estimated';

    if (SCRAPINGBEE_KEY) {
      console.log('🔍 Attempting live scraping with ScrapingBee...');
      
      const bayutSales = await scrapeBayut(city, district, propertyType);
      if (bayutSales.length > 0) {
        allSales = allSales.concat(bayutSales);
        dataSource = 'live';
        console.log(`✅ Bayut: ${bayutSales.length} listings`);
      }

      const pfSales = await scrapePropertyFinder(city, district, propertyType);
      if (pfSales.length > 0) {
        allSales = allSales.concat(pfSales);
        dataSource = 'live';
        console.log(`✅ Property Finder: ${pfSales.length} listings`);
      }
    } else {
      console.log('⚠️ No ScrapingBee key — using estimates');
    }

    if (allSales.length < 5) {
      console.log('📊 Using market estimates (insufficient live data)');
      allSales = generateSalesFallback(city, district, propertyType, 8);
      dataSource = 'estimated';
    }

    const seen = new Set();
    const unique = allSales.filter(s => {
      const key = `${Math.round(s.price/10000)}-${s.sqm}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const avgPricePerSqm = unique.length > 0
      ? Math.round(unique.reduce((s, r) => s + r.pricePerSqm, 0) / unique.length)
      : getFallbackPrice(city, district, propertyType);

    const result = {
      sales: unique.slice(0, 15),
      avgPricePerSqm,
      count: unique.length,
      scrapedAt: new Date().toISOString(),
      city,
      district,
      dataSource
    };

    if (lat && lng) {
      console.log(`📍 Fetching GIS data for ${lat}, ${lng}`);
      const gisData = await getGISData(parseFloat(lat), parseFloat(lng), parseInt(radius) || 500);
      result.gisData = gisData;
      result.proximityMultiplier = getProximityMultiplier(gisData);
      result.facilitySummary = getFacilitySummary(gisData);
    } else if (address) {
      console.log(`📍 Geocoding address: ${address}`);
      const gisResult = await getGISFromAddress(address);
      if (gisResult) {
        result.gisData = gisResult;
        result.proximityMultiplier = getProximityMultiplier(gisResult);
        result.facilitySummary = getFacilitySummary(gisResult);
        result.geocodedLocation = {
          lat: gisResult.lat,
          lng: gisResult.lng,
          displayName: gisResult.displayName
        };
      }
    }

    cache.set(cacheKey, { data: result, timestamp: Date.now() });

    console.log(`✅ Response: ${unique.length} sales, ${avgPricePerSqm} AED/sqm, source: ${dataSource}`);
    return { statusCode: 200, headers, body: JSON.stringify(result) };

  } catch (error) {
    console.error('❌ Error:', error.message);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        sales: [],
        avgPricePerSqm: 5000,
        count: 0,
        dataSource: 'error',
        error: error.message
      })
    };
  }
};