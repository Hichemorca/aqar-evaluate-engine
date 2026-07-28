// AQAR Valuation Engine — Simplified GIS from cached file only
const axios = require('axios');
const path = require('path');
const fs = require('fs');

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

// ===== GIS FUNCTIONS (Reading from cached file only) =====
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

  // زيادة المسافة المسموحة من 3000 إلى 5000 متر (5km)
  if (closestDistrict && closestDistance < 5000) {
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
  // تحسين مطابقة العناوين
  const cache = loadOSMCache();
  if (!cache || !cache.data) return null;

  const addressLower = address.toLowerCase().trim();
  
  // قائمة المرادفات للمناطق
  const synonyms = {
    'dubai marina': 'Dubai Marina',
    'marina': 'Dubai Marina',
    'palm': 'Palm Jumeirah',
    'palm jumeirah': 'Palm Jumeirah',
    'downtown': 'Downtown Dubai',
    'business bay': 'Business Bay',
    'jvc': 'Jumeirah Village Circle',
    'jumeirah village': 'Jumeirah Village Circle',
    'jlt': 'Jumeirah Lake Towers',
    'jumeirah lake towers': 'Jumeirah Lake Towers',
    'dubai hills': 'Dubai Hills Estate',
    'arabian ranches': 'Arabian Ranches',
    'emirates hills': 'Emirates Hills',
    'springs': 'The Springs',
    'the springs': 'The Springs',
    'meadows': 'The Meadows',
    'the meadows': 'The Meadows',
    'barsha': 'Al Barsha',
    'al barsha': 'Al Barsha',
    'deira': 'Deira',
    'bur dubai': 'Bur Dubai',
    'damac hills': 'Damac Hills',
    'mirdif': 'Mirdif',
    'furjan': 'Al Furjan',
    'al furjan': 'Al Furjan',
    'discovery gardens': 'Discovery Gardens',
    'motor city': 'Motor City',
    'dubai sports city': 'Dubai Sports City',
    'dso': 'Dubai Silicon Oasis',
    'dubai silicon oasis': 'Dubai Silicon Oasis',
    'international city': 'International City',
    'nahda': 'Al Nahda',
    'al nahda': 'Al Nahda',
    'emaaar beachfront': 'Emaar Beachfront',
    'creek harbour': 'Dubai Creek Harbour',
    'dubai creek': 'Dubai Creek Harbour'
  };

  // البحث عن تطابق مباشر
  let bestMatch = null;
  let bestScore = 0;

  for (const [district, data] of Object.entries(cache.data)) {
    const districtLower = district.toLowerCase();
    // تطابق تام أو جزئي
    if (addressLower.includes(districtLower) || districtLower.includes(addressLower)) {
      const score = Math.max(districtLower.length, addressLower.length);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = { ...data, district };
      }
    }
  }

  // إذا لم يتم العثور على تطابق، جرب المرادفات
  if (!bestMatch) {
    for (const [synonym, district] of Object.entries(synonyms)) {
      if (addressLower.includes(synonym)) {
        const data = cache.data[district];
        if (data) {
          bestMatch = { ...data, district };
          console.log(`📍 Matched synonym "${synonym}" to district "${district}"`);
          break;
        }
      }
    }
  }

  if (bestMatch) {
    console.log(`📍 Matched address to district: ${bestMatch.district}`);
    return {
      ...bestMatch,
      displayName: bestMatch.district,
      source: 'cached'
    };
  }

  // إذا لم يتم العثور على تطابق، استخدم المنطقة الأولى كتخمين
  const firstDistrict = Object.keys(cache.data)[0];
  if (firstDistrict) {
    console.log(`⚠️ No exact match, using first district: ${firstDistrict}`);
    const data = cache.data[firstDistrict];
    return {
      ...data,
      district: firstDistrict,
      displayName: firstDistrict,
      source: 'fallback'
    };
  }

  return null;
}

function getProximityMultiplier(gisData) {
  if (!gisData || !gisData.totalScore) return 1;
  const multiplier = 1 + (gisData.totalScore * 0.5);
  return Math.min(1.5, Math.max(1.0, multiplier));
}

function getFacilitySummary(gisData) {
  if (!gisData || !gisData.facilities) return 'No GIS data available';
  
  const summary = [];
  const labels = {
    metro: '🚇 Metro',
    mall: '🛍️ Shopping Mall',
    supermarket: '🛒 Supermarket',
    school: '🏫 School',
    hospital: '🏥 Hospital',
    park: '🌳 Park'
  };
  
  for (const [key, data] of Object.entries(gisData.facilities)) {
    if (data.count > 0) {
      const label = labels[key] || key;
      const dist = data.distance !== null ? `${data.distance}m` : 'nearby';
      summary.push(`${label}: ${data.count} (${dist})`);
    }
  }
  
  return summary.length > 0 ? summary.join(' • ') : 'No nearby facilities found';
}

// ===== UAE MARKET PRICES (simplified) =====
function getFallbackPrice(city, district, propertyType) {
  const rates = {
    dubai: { default: 7000 },
    'abu-dhabi': { default: 6000 },
    sharjah: { default: 3200 },
    ajman: { default: 2500 },
    'ras-al-khaimah': { default: 2800 },
    fujairah: { default: 2200 },
    'umm-al-quwain': { default: 2000 }
  };
  return rates[city]?.default || 5000;
}

// ===== SCRAPING FUNCTIONS =====
async function scrapeWithScrapingBee(url) {
  if (!SCRAPINGBEE_KEY) return null;
  try {
    const response = await axios.get(SCRAPINGBEE_URL, {
      params: { api_key: SCRAPINGBEE_KEY, url, render_js: false, country_code: 'ae', timeout: 15000 }
    });
    return response.data;
  } catch (error) {
    console.log(`⚠️ ScrapingBee failed: ${error.message}`);
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
  const html = await scrapeWithScrapingBee(url);
  return extractSalesFromHTML(html, 'Bayut');
}

async function scrapePropertyFinder(city, district, propertyType) {
  const typeMap = { apartment: 'apartments', villa: 'villas', townhouse: 'townhouses', office: 'commercial', retail: 'commercial' };
  const typeSlug = typeMap[propertyType] || 'apartments';
  const districtSlug = district.toLowerCase().replace(/\s+/g, '-');
  const url = `https://www.propertyfinder.ae/en/buy/${districtSlug}/${typeSlug}`;
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

    // ===== GIS-ONLY MODE =====
    if (gisOnly) {
      let gisResult = null;
      
      if (lat && lng) {
        console.log(`📍 GIS Only: ${lat}, ${lng}`);
        gisResult = await getGISData(parseFloat(lat), parseFloat(lng), parseInt(radius) || 500);
      } else if (address) {
        console.log(`📍 GIS Only: ${address}`);
        gisResult = await getGISFromAddress(address);
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

    // ===== REVERSE GEOCODING (simplified) =====
    if (reverse && lat && lng) {
      // Try to find nearest district from cache
      const cache = loadOSMCache();
      let closestDistrict = null;
      let closestDistance = Infinity;
      if (cache && cache.data) {
        for (const [district, data] of Object.entries(cache.data)) {
          const dist = haversine(parseFloat(lat), parseFloat(lng), data.lat, data.lng);
          if (dist < closestDistance) {
            closestDistance = dist;
            closestDistrict = district;
          }
        }
      }
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ address: closestDistrict || null })
      };
    }

    // ===== MAIN SCRAPING LOGIC =====
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
    }

    if (allSales.length < 5) {
      console.log('📊 Using market estimates');
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
      const gisData = await getGISData(parseFloat(lat), parseFloat(lng), parseInt(radius) || 500);
      result.gisData = gisData;
      result.proximityMultiplier = getProximityMultiplier(gisData);
      result.facilitySummary = getFacilitySummary(gisData);
    } else if (address) {
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