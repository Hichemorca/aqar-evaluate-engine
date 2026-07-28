// AQAR OSM Data Fetcher — Real Data from OpenStreetMap
const axios = require('axios');

// ===== FACILITY TYPES =====
const FACILITY_TYPES = {
  metro: {
    tags: ['railway=station', 'railway=subway', 'station=subway'],
    label: '🚇 Metro',
    weight: 0.15
  },
  tram: {
    tags: ['railway=tram_stop', 'railway=tram'],
    label: '🚊 Tram',
    weight: 0.10
  },
  mall: {
    tags: ['shop=mall', 'shop=department_store'],
    label: '🛍️ Shopping Mall',
    weight: 0.12
  },
  supermarket: {
    tags: ['shop=supermarket', 'shop=grocery'],
    label: '🛒 Supermarket',
    weight: 0.08
  },
  school: {
    tags: ['amenity=school', 'amenity=kindergarten'],
    label: '🏫 School',
    weight: 0.10
  },
  university: {
    tags: ['amenity=university', 'amenity=college'],
    label: '🎓 University',
    weight: 0.08
  },
  hospital: {
    tags: ['amenity=hospital', 'healthcare=hospital'],
    label: '🏥 Hospital',
    weight: 0.08
  },
  clinic: {
    tags: ['amenity=clinic', 'amenity=doctors', 'healthcare=clinic'],
    label: '🩺 Clinic',
    weight: 0.05
  },
  park: {
    tags: ['leisure=park', 'leisure=garden'],
    label: '🌳 Park',
    weight: 0.10
  },
  beach: {
    tags: ['natural=beach', 'leisure=beach_resort'],
    label: '🏖️ Beach',
    weight: 0.08
  },
  mosque: {
    tags: ['amenity=mosque', 'place_of_worship=mosque'],
    label: '🕌 Mosque',
    weight: 0.04
  },
  police: {
    tags: ['amenity=police'],
    label: '👮 Police Station',
    weight: 0.03
  },
  bus: {
    tags: ['highway=bus_stop', 'amenity=bus_station'],
    label: '🚌 Bus Stop',
    weight: 0.05
  }
};

// ===== CACHE =====
const gisCache = new Map();
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

function getCacheKey(lat, lng, radius) {
  return `${lat.toFixed(4)},${lng.toFixed(4)},${radius}`;
}

function getCached(key) {
  const entry = gisCache.get(key);
  if (entry && (Date.now() - entry.timestamp) < CACHE_TTL) {
    return entry.data;
  }
  return null;
}

function setCache(key, data) {
  gisCache.set(key, { data, timestamp: Date.now() });
}

// ===== OSM QUERY =====
async function queryOverpass(query) {
  // استخدام Overpass API مع مهلة أطول
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
  
  console.log(`🌍 Querying Overpass API...`);
  
  try {
    const response = await axios.get(url, {
      timeout: 25000, // 25 ثانية
      headers: {
        'User-Agent': 'AQAR-Valuation-Engine/2.0 (contact@aqar.ae)'
      }
    });
    console.log(`✅ Overpass API responded`);
    return response.data;
  } catch (error) {
    console.log(`⚠️ Overpass API error: ${error.message}`);
    return null;
  }
}

// ===== FETCH FACILITIES =====
async function fetchFacilities(lat, lng, radius = 500) {
  const cacheKey = getCacheKey(lat, lng, radius);
  const cached = getCached(cacheKey);
  
  if (cached) {
    console.log(`✅ GIS: Using cached data for ${lat}, ${lng}`);
    return cached;
  }

  console.log(`🔍 OSM: Fetching facilities around ${lat}, ${lng} (${radius}m)`);

  // بناء استعلام OSM مبسط
  const tags = [];
  Object.values(FACILITY_TYPES).forEach(type => {
    type.tags.forEach(tag => {
      tags.push(`["${tag}"]`);
    });
  });

  // استعلام مبسط للحصول على المرافق
  const query = `
    [out:json][timeout:25];
    (
      ${Object.values(FACILITY_TYPES).map(type => 
        type.tags.map(tag => `node["${tag}"](around:${radius},${lat},${lng});`).join('')
      ).join('')}
      ${Object.values(FACILITY_TYPES).map(type => 
        type.tags.map(tag => `way["${tag}"](around:${radius},${lat},${lng});`).join('')
      ).join('')}
    );
    out body;
    >;
    out skel qt;
  `;

  const data = await queryOverpass(query);
  
  if (!data || !data.elements) {
    console.log('⚠️ No data from Overpass API');
    return {
      facilities: {},
      totalScore: 0,
      count: 0,
      source: 'empty'
    };
  }

  // معالجة النتائج
  const results = {};
  Object.keys(FACILITY_TYPES).forEach(key => {
    results[key] = { count: 0, distance: null, score: 0, weight: FACILITY_TYPES[key].weight };
  });

  const elements = data.elements || [];
  let totalCount = 0;

  elements.forEach(el => {
    const tags = el.tags || {};
    // التحقق من كل نوع
    for (const [key, type] of Object.entries(FACILITY_TYPES)) {
      const matched = type.tags.some(tag => {
        const [k, v] = tag.split('=');
        return tags[k] === v;
      });
      if (matched) {
        results[key].count += 1;
        totalCount += 1;
        // حساب المسافة التقريبية
        if (el.lat && el.lon) {
          const dist = haversine(lat, lng, el.lat, el.lon);
          if (results[key].distance === null || dist < results[key].distance) {
            results[key].distance = Math.round(dist);
          }
        }
        break;
      }
    }
  });

  // حساب النقاط لكل نوع
  let totalScore = 0;
  Object.keys(results).forEach(key => {
    const r = results[key];
    const maxDist = 500;
    if (r.count > 0) {
      // النقاط تعتمد على القرب والعدد
      const distanceFactor = r.distance !== null ? Math.max(0, 1 - (r.distance / maxDist)) : 0.5;
      const countFactor = Math.min(1, r.count / 3);
      r.score = Math.min(1, r.weight * distanceFactor * (1 + countFactor * 0.5));
    } else {
      r.score = 0;
    }
    totalScore += r.score;
  });

  const result = {
    facilities: results,
    totalScore: Math.min(1, totalScore),
    count: totalCount,
    queriedAt: new Date().toISOString(),
    lat,
    lng,
    radius,
    source: 'osm'
  };

  // تخزين في الكاش
  setCache(cacheKey, result);
  console.log(`✅ OSM: Found ${totalCount} facilities, score: ${(result.totalScore * 100).toFixed(1)}%`);

  return result;
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

// ===== GEOCODING =====
async function geocodeAddress(address) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&accept-language=en`;
  try {
    const response = await axios.get(url, {
      timeout: 8000,
      headers: { 'User-Agent': 'AQAR-Valuation-Engine/2.0 (contact@aqar.ae)' }
    });
    if (response.data && response.data.length > 0) {
      const result = response.data[0];
      return {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        displayName: result.display_name,
        placeId: result.place_id
      };
    }
    return null;
  } catch (error) {
    console.log(`⚠️ Geocoding failed: ${error.message}`);
    return null;
  }
}

// ===== REVERSE GEOCODING =====
async function reverseGeocode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=en`;
  try {
    const response = await axios.get(url, {
      timeout: 8000,
      headers: { 'User-Agent': 'AQAR-Valuation-Engine/2.0 (contact@aqar.ae)' }
    });
    if (response.data) {
      return {
        displayName: response.data.display_name,
        address: response.data.address || {}
      };
    }
    return null;
  } catch (error) {
    console.log(`⚠️ Reverse geocoding failed: ${error.message}`);
    return null;
  }
}

// ===== EXPORTS =====
module.exports = {
  fetchFacilities,
  geocodeAddress,
  reverseGeocode,
  FACILITY_TYPES
};

// اختبار
if (require.main === module) {
  const dubaiMarina = { lat: 25.0734, lng: 55.1312 };
  fetchFacilities(dubaiMarina.lat, dubaiMarina.lng, 500).then(console.log);
}