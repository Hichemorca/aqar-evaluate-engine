// AQAR OSM Data Fetcher — Pre-fetch all districts (Single query per location)
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const OSM_CACHE_FILE = path.join(DATA_DIR, 'osm-cache.json');

// ===== ALL DUBAI DISTRICTS =====
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

// ===== FACILITY TYPES (single combined query) =====
const FACILITY_TAGS = [
  'railway=station',
  'railway=subway',
  'station=subway',
  'railway=tram_stop',
  'shop=mall',
  'shop=department_store',
  'shop=supermarket',
  'shop=grocery',
  'amenity=school',
  'amenity=kindergarten',
  'amenity=university',
  'amenity=college',
  'amenity=hospital',
  'healthcare=hospital',
  'amenity=clinic',
  'amenity=doctors',
  'leisure=park',
  'leisure=garden',
  'natural=beach',
  'leisure=beach_resort',
  'amenity=mosque',
  'place_of_worship=mosque',
  'amenity=police',
  'highway=bus_stop',
  'amenity=bus_station'
];

const FACILITY_LABELS = {
  'railway=station': '🚇 Metro',
  'railway=subway': '🚇 Metro',
  'station=subway': '🚇 Metro',
  'railway=tram_stop': '🚊 Tram',
  'shop=mall': '🛍️ Mall',
  'shop=department_store': '🛍️ Mall',
  'shop=supermarket': '🛒 Supermarket',
  'shop=grocery': '🛒 Supermarket',
  'amenity=school': '🏫 School',
  'amenity=kindergarten': '🏫 School',
  'amenity=university': '🎓 University',
  'amenity=college': '🎓 University',
  'amenity=hospital': '🏥 Hospital',
  'healthcare=hospital': '🏥 Hospital',
  'amenity=clinic': '🩺 Clinic',
  'amenity=doctors': '🩺 Clinic',
  'leisure=park': '🌳 Park',
  'leisure=garden': '🌳 Park',
  'natural=beach': '🏖️ Beach',
  'leisure=beach_resort': '🏖️ Beach',
  'amenity=mosque': '🕌 Mosque',
  'place_of_worship=mosque': '🕌 Mosque',
  'amenity=police': '👮 Police',
  'highway=bus_stop': '🚌 Bus',
  'amenity=bus_station': '🚌 Bus'
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

// ===== QUERY OVERPASS (with retry and backoff) =====
async function queryOverpass(query, retries = 3) {
  const servers = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];

  for (let attempt = 0; attempt <= retries; attempt++) {
    for (const server of servers) {
      try {
        const url = `${server}?data=${encodeURIComponent(query)}`;
        console.log(`🌍 Querying ${server} (attempt ${attempt + 1}/${retries + 1})`);
        
        const response = await axios.get(url, {
          timeout: 20000,
          headers: { 'User-Agent': 'AQAR-Valuation-Engine/2.0' }
        });

        if (response.data && response.data.elements) {
          console.log(`✅ Success from ${server}`);
          return response.data;
        }
      } catch (error) {
        const status = error.response?.status || error.code;
        console.log(`⚠️ ${server} failed: ${status || error.message}`);
        
        // Backoff: 1s, 2s, 4s
        if (attempt < retries) {
          const wait = Math.pow(2, attempt) * 1000;
          console.log(`⏳ Waiting ${wait/1000}s before retry...`);
          await new Promise(r => setTimeout(r, wait));
        }
      }
    }
  }
  return null;
}

// ===== FETCH FACILITIES FOR DISTRICT (Single combined query) =====
async function fetchFacilitiesForDistrict(district, lat, lng, radius = 800) {
  console.log(`\n🔍 Fetching ${district}...`);

  // Build combined query for all facility types
  const tagQueries = FACILITY_TAGS.map(tag => `node["${tag}"](around:${radius},${lat},${lng});`).join('');
  const wayQueries = FACILITY_TAGS.map(tag => `way["${tag}"](around:${radius},${lat},${lng});`).join('');

  const query = `
    [out:json][timeout:20];
    (
      ${tagQueries}
      ${wayQueries}
    );
    out body;
    >;
    out skel qt;
  `;

  const data = await queryOverpass(query);
  
  if (!data || !data.elements) {
    console.log(`⚠️ No data for ${district}`);
    return null;
  }

  // Process results - group by facility type
  const facilities = {};
  let totalCount = 0;

  data.elements.forEach(el => {
    const tags = el.tags || {};
    let matched = false;
    
    for (const tag of FACILITY_TAGS) {
      const [key, value] = tag.split('=');
      if (tags[key] === value) {
        const label = FACILITY_LABELS[tag] || tag;
        if (!facilities[label]) {
          facilities[label] = { count: 0, distance: null };
        }
        facilities[label].count += 1;
        totalCount += 1;
        
        if (el.lat && el.lon) {
          const dist = haversine(lat, lng, el.lat, el.lon);
          if (facilities[label].distance === null || dist < facilities[label].distance) {
            facilities[label].distance = Math.round(dist);
          }
        }
        matched = true;
        break;
      }
    }
  });

  // Convert to expected format
  const facilityWeights = {
    '🚇 Metro': 0.15,
    '🚊 Tram': 0.10,
    '🛍️ Mall': 0.12,
    '🛒 Supermarket': 0.08,
    '🏫 School': 0.10,
    '🎓 University': 0.08,
    '🏥 Hospital': 0.08,
    '🩺 Clinic': 0.05,
    '🌳 Park': 0.10,
    '🏖️ Beach': 0.08,
    '🕌 Mosque': 0.04,
    '👮 Police': 0.03,
    '🚌 Bus': 0.05
  };

  const results = {};
  let totalScore = 0;

  for (const [label, data] of Object.entries(facilities)) {
    const weight = facilityWeights[label] || 0.05;
    const distanceFactor = data.distance !== null ? Math.max(0, 1 - (data.distance / radius)) : 0.5;
    const countFactor = Math.min(1, data.count / 3);
    const score = Math.min(1, weight * distanceFactor * (1 + countFactor * 0.5));
    
    // Map label to key for compatibility
    const keyMap = {
      '🚇 Metro': 'metro',
      '🚊 Tram': 'tram',
      '🛍️ Mall': 'mall',
      '🛒 Supermarket': 'supermarket',
      '🏫 School': 'school',
      '🎓 University': 'university',
      '🏥 Hospital': 'hospital',
      '🩺 Clinic': 'clinic',
      '🌳 Park': 'park',
      '🏖️ Beach': 'beach',
      '🕌 Mosque': 'mosque',
      '👮 Police': 'police',
      '🚌 Bus': 'bus'
    };
    
    const key = keyMap[label] || label;
    results[key] = {
      count: data.count,
      distance: data.distance,
      score: score
    };
    totalScore += score;
  }

  console.log(`✅ ${district}: ${totalCount} facilities found (${Object.keys(results).length} types)`);

  return {
    district,
    lat,
    lng,
    facilities: results,
    totalScore: Math.min(1, totalScore),
    count: totalCount,
    queriedAt: new Date().toISOString(),
    radius,
    source: 'osm-real'
  };
}

// ===== MAIN =====
async function main() {
  console.log('🚀 AQAR OSM Data Pre-fetcher (Single Query)\n');
  console.log(`📊 Fetching ${Object.keys(DUBAI_DISTRICTS).length} districts...`);

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
      } else {
        console.log(`⚠️ ${district}: No data, using empty`);
        results[district] = {
          district,
          lat: coords.lat,
          lng: coords.lng,
          facilities: {},
          totalScore: 0,
          count: 0,
          queriedAt: new Date().toISOString(),
          radius: 800,
          source: 'empty'
        };
      }
    } catch (error) {
      console.log(`❌ ${district}: ${error.message}`);
      results[district] = {
        district,
        lat: coords.lat,
        lng: coords.lng,
        facilities: {},
        totalScore: 0,
        count: 0,
        queriedAt: new Date().toISOString(),
        radius: 800,
        source: 'error',
        error: error.message
      };
    }
    // Wait between districts
    await new Promise(r => setTimeout(r, 2000));
  }

  const output = {
    generatedAt: new Date().toISOString(),
    totalDistricts: Object.keys(DUBAI_DISTRICTS).length,
    successCount,
    data: results
  };

  fs.writeFileSync(OSM_CACHE_FILE, JSON.stringify(output, null, 2));
  console.log(`\n✅ Saved to ${OSM_CACHE_FILE}`);
  console.log(`📊 ${successCount}/${Object.keys(DUBAI_DISTRICTS).length} districts have data`);
}

main().catch(console.error);