// AQAR OSM Data Fetcher — OpenStreetMap Overpass API
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const OSM_CACHE_FILE = path.join(DATA_DIR, 'osm-cache.json');

// ===== TYPES OF FACILITIES =====
const FACILITY_TYPES = {
  metro: {
    tags: ['railway=station', 'railway=subway', 'station=subway'],
    label: '🚇 Metro Station',
    weight: 0.15,
    radius: 800
  },
  tram: {
    tags: ['railway=tram_stop', 'railway=tram'],
    label: '🚊 Tram Stop',
    weight: 0.10,
    radius: 500
  },
  mall: {
    tags: ['shop=mall', 'shop=department_store', 'building=retail'],
    label: '🛍️ Shopping Mall',
    weight: 0.12,
    radius: 1000
  },
  supermarket: {
    tags: ['shop=supermarket', 'shop=grocery'],
    label: '🛒 Supermarket',
    weight: 0.08,
    radius: 500
  },
  school: {
    tags: ['amenity=school', 'amenity=kindergarten', 'amenity=college'],
    label: '🏫 School',
    weight: 0.10,
    radius: 800
  },
  university: {
    tags: ['amenity=university', 'amenity=college'],
    label: '🎓 University',
    weight: 0.08,
    radius: 1000
  },
  hospital: {
    tags: ['amenity=hospital', 'amenity=clinic', 'healthcare=hospital'],
    label: '🏥 Hospital',
    weight: 0.08,
    radius: 1000
  },
  clinic: {
    tags: ['amenity=clinic', 'amenity=doctors', 'healthcare=clinic'],
    label: '🏥 Clinic',
    weight: 0.05,
    radius: 500
  },
  park: {
    tags: ['leisure=park', 'leisure=garden', 'leisure=playground'],
    label: '🌳 Park',
    weight: 0.10,
    radius: 500
  },
  beach: {
    tags: ['natural=beach', 'leisure=beach_resort'],
    label: '🏖️ Beach',
    weight: 0.08,
    radius: 1000
  },
  mosque: {
    tags: ['amenity=mosque', 'amenity=place_of_worship', 'religion=muslim'],
    label: '🕌 Mosque',
    weight: 0.04,
    radius: 500
  },
  police: {
    tags: ['amenity=police'],
    label: '👮 Police Station',
    weight: 0.03,
    radius: 1000
  },
  bus: {
    tags: ['highway=bus_stop', 'amenity=bus_station'],
    label: '🚌 Bus Stop',
    weight: 0.05,
    radius: 300
  }
};

// ===== CACHE =====
let cache = {};
if (fs.existsSync(OSM_CACHE_FILE)) {
  try { cache = JSON.parse(fs.readFileSync(OSM_CACHE_FILE, 'utf8')); } catch(e) {}
}
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

function getCacheKey(lat, lng, radius) {
  return `${Math.round(lat * 1000)},${Math.round(lng * 1000)},${radius}`;
}

function getCached(key) {
  const entry = cache[key];
  if (entry && (Date.now() - entry.timestamp) < CACHE_TTL) {
    return entry.data;
  }
  return null;
}

function setCache(key, data) {
  cache[key] = { data, timestamp: Date.now() };
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(OSM_CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch(e) {}
}

// ===== OSM QUERY =====
async function queryOverpass(query) {
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
  try {
    const response = await axios.get(url, { timeout: 30000 });
    return response.data;
  } catch (error) {
    console.log(`⚠️ OSM query failed: ${error.message}`);
    return null;
  }
}

async function fetchFacilities(lat, lng, radius = 500) {
  const cacheKey = getCacheKey(lat, lng, radius);
  const cached = getCached(cacheKey);
  if (cached) {
    console.log(`✅ OSM: Using cached data for ${lat}, ${lng}`);
    return cached;
  }

  console.log(`🔍 OSM: Fetching facilities around ${lat}, ${lng} (${radius}m)`);

  // Build query: find all facilities within radius
  const allTags = Object.values(FACILITY_TYPES).flatMap(f => f.tags);
  const tagQuery = allTags.map(t => `node["${t}"]`).join(';');
  
  const query = `
    [out:json][timeout:25];
    (
      ${tagQuery}
      (around:${radius},${lat},${lng});
      way${allTags.map(t => `["${t}"]`).join(';')}
      (around:${radius},${lat},${lng});
      relation${allTags.map(t => `["${t}"]`).join(';')}
      (around:${radius},${lat},${lng});
    );
    out body;
    >;
    out skel qt;
  `;

  const data = await queryOverpass(query);
  if (!data) {
    // Return empty result but don't cache failures
    return { facilities: {}, count: 0 };
  }

  // Process results
  const results = {};
  let totalCount = 0;

  // Initialize all facility types
  Object.keys(FACILITY_TYPES).forEach(key => {
    results[key] = { count: 0, distance: null, weight: FACILITY_TYPES[key].weight };
  });

  // Count elements by type
  const elements = data.elements || [];
  elements.forEach(el => {
    const tags = el.tags || {};
    for (const [key, config] of Object.entries(FACILITY_TYPES)) {
      const matched = config.tags.some(tag => {
        const [k, v] = tag.split('=');
        return tags[k] === v;
      });
      if (matched) {
        results[key].count += 1;
        totalCount += 1;
        // Estimate distance (simplified: if we have lat/lng)
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

  // Calculate score
  let totalScore = 0;
  Object.keys(results).forEach(key => {
    const r = results[key];
    const maxDist = FACILITY_TYPES[key]?.radius || 500;
    if (r.count > 0) {
      const distanceFactor = r.distance !== null ? Math.max(0, 1 - (r.distance / maxDist)) : 0.5;
      r.score = Math.min(1, r.weight * distanceFactor * Math.min(r.count, 3));
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
    radius
  };

  setCache(cacheKey, result);
  console.log(`✅ OSM: Found ${totalCount} facilities, score: ${(result.totalScore * 100).toFixed(1)}%`);

  return result;
}

// ===== HAVERSINE =====
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1000; // meters
}

// ===== GEOCODING (Nominatim) =====
async function geocodeAddress(address) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&accept-language=en`;
  try {
    const response = await axios.get(url, {
      timeout: 3000,
      headers: { 'User-Agent': 'AQAR-Valuation-Engine/2.0' }
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
      timeout: 5000,
      headers: { 'User-Agent': 'AQAR-Valuation-Engine/2.0' }
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

// ===== MAIN EXPORT =====
module.exports = {
  fetchFacilities,
  geocodeAddress,
  reverseGeocode,
  FACILITY_TYPES,
  haversine
};

// If run directly, test with Dubai Marina
if (require.main === module) {
  const dubaiMarina = { lat: 25.0734, lng: 55.1312 };
  fetchFacilities(dubaiMarina.lat, dubaiMarina.lng, 500).then(console.log);
}