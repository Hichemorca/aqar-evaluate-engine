// AQAR OSM Data Fetcher — Pre-fetch all Dubai districts via GitHub Actions
// Optimized: Smaller queries, better error handling, retry logic
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const OSM_CACHE_FILE = path.join(DATA_DIR, 'osm-cache.json');

// ===== DUBAI DISTRICTS WITH COORDINATES =====
const DUBAI_DISTRICTS = {
  'Dubai Marina': { lat: 25.0734, lng: 55.1312 },
  'Palm Jumeirah': { lat: 25.1100, lng: 55.1400 },
  'Downtown Dubai': { lat: 25.1950, lng: 55.2740 },
  'Business Bay': { lat: 25.1900, lng: 55.2600 },
  'Jumeirah Village Circle': { lat: 25.0500, lng: 55.1800 },
  'Jumeirah Lake Towers': { lat: 25.0700, lng: 55.1400 },
  'Dubai Hills Estate': { lat: 25.1200, lng: 55.2200 },
  'Arabian Ranches': { lat: 25.0400, lng: 55.2300 },
  'Emirates Hills': { lat: 25.0600, lng: 55.2000 },
  'The Springs': { lat: 25.0800, lng: 55.2100 },
  'The Meadows': { lat: 25.0700, lng: 55.2200 },
  'Al Barsha': { lat: 25.1100, lng: 55.2100 },
  'Deira': { lat: 25.2700, lng: 55.3200 },
  'Bur Dubai': { lat: 25.2500, lng: 55.3100 },
  'Damac Hills': { lat: 25.0300, lng: 55.1700 },
  'Mirdif': { lat: 25.2100, lng: 55.4100 },
  'Al Furjan': { lat: 25.0200, lng: 55.1500 },
  'Discovery Gardens': { lat: 25.0100, lng: 55.1400 },
  'Motor City': { lat: 25.0400, lng: 55.1900 },
  'Dubai Sports City': { lat: 25.0300, lng: 55.2000 },
  'Dubai Silicon Oasis': { lat: 25.1300, lng: 55.3800 },
  'International City': { lat: 25.1600, lng: 55.4700 },
  'Al Nahda': { lat: 25.2900, lng: 55.3700 },
  'Emaar Beachfront': { lat: 25.0800, lng: 55.1200 },
  'Dubai Creek Harbour': { lat: 25.2200, lng: 55.3300 }
};

// ===== FACILITY TYPES (simplified) =====
const FACILITY_TYPES = {
  metro: { tags: ['railway=station'], label: '🚇 Metro', weight: 0.15 },
  mall: { tags: ['shop=mall'], label: '🛍️ Shopping Mall', weight: 0.12 },
  supermarket: { tags: ['shop=supermarket'], label: '🛒 Supermarket', weight: 0.08 },
  school: { tags: ['amenity=school'], label: '🏫 School', weight: 0.10 },
  hospital: { tags: ['amenity=hospital'], label: '🏥 Hospital', weight: 0.08 },
  park: { tags: ['leisure=park'], label: '🌳 Park', weight: 0.10 },
  mosque: { tags: ['amenity=mosque'], label: '🕌 Mosque', weight: 0.04 },
  bus: { tags: ['highway=bus_stop'], label: '🚌 Bus Stop', weight: 0.05 }
};

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

// ===== QUERY OVERPASS (with retry) =====
async function queryOverpass(query, retries = 2) {
  const servers = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    for (const server of servers) {
      try {
        const url = `${server}?data=${encodeURIComponent(query)}`;
        console.log(`🌍 Querying: ${server} (attempt ${attempt + 1})`);
        const response = await axios.get(url, {
          timeout: 20000,
          headers: { 'User-Agent': 'AQAR-Valuation-Engine/2.0' }
        });
        if (response.data && response.data.elements) {
          console.log(`✅ Success from ${server}`);
          return response.data;
        }
      } catch (error) {
        console.log(`⚠️ ${server} failed: ${error.message}`);
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }
  return null;
}

// ===== FETCH FACILITIES FOR DISTRICT (one type at a time) =====
async function fetchFacilitiesForDistrict(district, lat, lng, radius = 1000) {
  console.log(`🔍 Fetching facilities for ${district}...`);
  
  const results = {};
  Object.keys(FACILITY_TYPES).forEach(key => {
    results[key] = { count: 0, distance: null, score: 0, weight: FACILITY_TYPES[key].weight };
  });

  let totalCount = 0;

  // Fetch each facility type separately (smaller queries)
  for (const [key, type] of Object.entries(FACILITY_TYPES)) {
    const tag = type.tags[0];
    const query = `
      [out:json][timeout:20];
      (
        node["${tag}"](around:${radius},${lat},${lng});
        way["${tag}"](around:${radius},${lat},${lng});
      );
      out body;
      >;
      out skel qt;
    `;

    const data = await queryOverpass(query);
    if (!data || !data.elements) {
      continue;
    }

    const elements = data.elements || [];
    let count = 0;
    let minDistance = null;

    elements.forEach(el => {
      if (el.lat && el.lon) {
        const dist = haversine(lat, lng, el.lat, el.lon);
        if (dist <= radius) {
          count++;
          if (minDistance === null || dist < minDistance) {
            minDistance = Math.round(dist);
          }
        }
      }
    });

    results[key].count = count;
    results[key].distance = minDistance;
    totalCount += count;

    // Wait between requests to avoid rate limiting
    await new Promise(r => setTimeout(r, 500));
  }

  // Calculate scores
  let totalScore = 0;
  Object.keys(results).forEach(key => {
    const r = results[key];
    const maxDist = radius;
    if (r.count > 0) {
      const distanceFactor = r.distance !== null ? Math.max(0, 1 - (r.distance / maxDist)) : 0.5;
      const countFactor = Math.min(1, r.count / 3);
      r.score = Math.min(1, r.weight * distanceFactor * (1 + countFactor * 0.5));
    } else {
      r.score = 0;
    }
    totalScore += r.score;
  });

  console.log(`✅ ${district}: ${totalCount} facilities found`);

  return {
    district,
    lat,
    lng,
    facilities: results,
    totalScore: Math.min(1, totalScore),
    count: totalCount,
    queriedAt: new Date().toISOString(),
    radius,
    source: 'osm'
  };
}

// ===== MAIN =====
async function main() {
  console.log('🚀 AQAR OSM Data Pre-fetcher (Optimized)\n');
  console.log(`📊 Fetching data for ${Object.keys(DUBAI_DISTRICTS).length} districts...`);

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const results = {};
  let successCount = 0;

  for (const [district, coords] of Object.entries(DUBAI_DISTRICTS)) {
    try {
      const data = await fetchFacilitiesForDistrict(district, coords.lat, coords.lng);
      if (data && data.count > 0) {
        results[district] = data;
        successCount++;
        console.log(`✅ ${district}: ${data.count} facilities found`);
      } else {
        console.log(`⚠️ ${district}: No facilities found, using empty data`);
        // Still save empty data to avoid re-fetching
        results[district] = {
          district,
          lat: coords.lat,
          lng: coords.lng,
          facilities: {},
          totalScore: 0,
          count: 0,
          queriedAt: new Date().toISOString(),
          radius: 1000,
          source: 'empty'
        };
      }
    } catch (error) {
      console.log(`❌ ${district}: Error - ${error.message}`);
      // Save empty data to avoid re-fetching
      results[district] = {
        district,
        lat: coords.lat,
        lng: coords.lng,
        facilities: {},
        totalScore: 0,
        count: 0,
        queriedAt: new Date().toISOString(),
        radius: 1000,
        source: 'error',
        error: error.message
      };
    }
    // Wait between districts to avoid rate limiting
    await new Promise(r => setTimeout(r, 2000));
  }

  const output = {
    generatedAt: new Date().toISOString(),
    totalDistricts: Object.keys(DUBAI_DISTRICTS).length,
    successCount,
    data: results,
    facilityTypes: FACILITY_TYPES
  };

  fs.writeFileSync(OSM_CACHE_FILE, JSON.stringify(output, null, 2));
  console.log(`\n✅ Saved to ${OSM_CACHE_FILE}`);
  console.log(`📊 ${successCount}/${Object.keys(DUBAI_DISTRICTS).length} districts have data`);
}

main().catch(console.error);