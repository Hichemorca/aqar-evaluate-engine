// AQAR Enrich with Coordinates — Create dld-transactions-enriched.json with lat/lng
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DLD_FILE = path.join(DATA_DIR, 'dld-transactions.json');
const OSM_CACHE_FILE = path.join(DATA_DIR, 'osm-cache.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'dld-transactions-enriched.json');

// ===== LOAD DATA =====
console.log('🚀 AQAR Enrich with Coordinates (Creating enriched dataset)\n');

if (!fs.existsSync(DLD_FILE)) {
  console.log('❌ DLD file not found');
  process.exit(1);
}

if (!fs.existsSync(OSM_CACHE_FILE)) {
  console.log('❌ OSM cache file not found');
  process.exit(1);
}

const dldData = JSON.parse(fs.readFileSync(DLD_FILE, 'utf8'));
const osmCache = JSON.parse(fs.readFileSync(OSM_CACHE_FILE, 'utf8'));

console.log(`📋 DLD transactions: ${dldData.length.toLocaleString()}`);
console.log(`📋 OSM districts: ${Object.keys(osmCache.data || {}).length}`);

// ===== BUILD DISTRICT MAP WITH ALIASES =====
const districtMap = {};

// 1. Primary names (exact match)
for (const [district, data] of Object.entries(osmCache.data || {})) {
  districtMap[district] = {
    lat: data.lat,
    lng: data.lng,
    totalScore: data.totalScore || 0,
    facilities: data.facilities || {},
    matchedBy: 'exact'
  };
}

// 2. Aliases (common variations)
const aliases = {
  // Dubai
  'Dubai Marina': ['Dubai Marina', 'Marina', 'Dubai Marina Residence'],
  'Palm Jumeirah': ['Palm Jumeirah', 'Palm', 'The Palm', 'Palm Jumeirah Island'],
  'Downtown Dubai': ['Downtown Dubai', 'Downtown', 'Dubai Downtown', 'Burj Khalifa'],
  'Business Bay': ['Business Bay', 'Business Bay Dubai'],
  'Jumeirah Village Circle': ['JVC', 'Jumeirah Village Circle', 'Jumeirah Village'],
  'Jumeirah Lake Towers': ['JLT', 'Jumeirah Lake Towers', 'Lake Towers'],
  'Dubai Hills Estate': ['Dubai Hills', 'Dubai Hills Estate', 'Dubai Hills Residence'],
  'Arabian Ranches': ['Arabian Ranches', 'Arabian Ranches I', 'Arabian Ranches II', 'Arabian Ranches III', 'Arabian Ranches Polo Club'],
  'Emirates Hills': ['Emirates Hills', 'Emirates Hills Dubai'],
  'The Springs': ['The Springs', 'Springs', 'Springs Dubai'],
  'The Meadows': ['The Meadows', 'Meadows', 'Meadows Dubai'],
  'Al Barsha': ['Al Barsha', 'Barsha', 'Al Barsha First', 'Al Barsha Second', 'Al Barsha Third', 'Al Barshaa South First'],
  'Deira': ['Deira', 'Deira Dubai'],
  'Bur Dubai': ['Bur Dubai', 'Bur Dubai Area'],
  'Damac Hills': ['Damac Hills', 'Damac Hills Dubai'],
  'Mirdif': ['Mirdif', 'Mirdif Dubai'],
  'Al Furjan': ['Al Furjan', 'Furjan'],
  'Discovery Gardens': ['Discovery Gardens', 'Discovery'],
  'Motor City': ['Motor City', 'Motor City Dubai'],
  'Dubai Sports City': ['Dubai Sports City', 'Sports City'],
  'Dubai Silicon Oasis': ['DSO', 'Dubai Silicon Oasis', 'Silicon Oasis'],
  'International City': ['International City', 'IC', 'Dubai International City'],
  'Al Nahda': ['Al Nahda', 'Nahda', 'Al Nahda Dubai'],
  'Emaar Beachfront': ['Emaar Beachfront', 'Emaar Beach'],
  'Dubai Creek Harbour': ['Dubai Creek Harbour', 'Creek Harbour'],
  
  // Abu Dhabi
  'Saadiyat Island': ['Saadiyat Island', 'Saadiyat'],
  'Yas Island': ['Yas Island', 'Yas'],
  'Al Reem Island': ['Al Reem Island', 'Reem Island'],
  'Khalifa City': ['Khalifa City', 'Khalifa'],
  'Abu Dhabi Corniche': ['Corniche', 'Abu Dhabi Corniche'],
  'Al Ain City': ['Al Ain City', 'Al Ain'],
  
  // Sharjah
  'Al Majaz': ['Al Majaz', 'Majaz'],
  'Aljada': ['Aljada', 'Jada'],
  'Al Taawun': ['Al Taawun', 'Taawun'],
  
  // Ajman
  'Al Rashidiya Ajman': ['Al Rashidiya', 'Rashidiya Ajman'],
  'Al Nuaimiya': ['Al Nuaimiya', 'Nuaimiya'],
  
  // Ras Al Khaimah
  'Al Hamra Village': ['Al Hamra', 'Hamra Village'],
  'Al Marjan Island': ['Al Marjan', 'Marjan Island'],
  'Mina Al Arab': ['Mina Al Arab', 'Mina Arab'],
  
  // Fujairah
  'Fujairah City Center': ['Fujairah City', 'Fujairah'],
  
  // Umm Al Quwain
  'Umm Al Quwain Marina': ['Umm Al Quwain', 'UAQ Marina']
};

// 3. Additional missing districts (from DLD data)
const additionalAliases = {
  // Dubai
  'Arjan': ['ARJAN', 'Arjan'],
  'Al Garhoud': ['Al Garhoud', 'Garhoud'],
  'Al Hamriya': ['Al Hamriya', 'Hamriya'],
  'Al Bada': ['Al Bada', 'Bada'],
  'Al Baraha': ['Al Baraha', 'Baraha'],
  'Al Khail Heights': ['AL KHAIL HEIGHTS', 'Khail Heights'],
  'Al Mizhar': ['AL MIZHAR FOURTH', 'Al Mizhar', 'Mizhar'],
  'Al Twar': ['AL TWAR FIFTH', 'Al Twar', 'Twar'],
  'Al Waha': ['AL WAHA', 'Waha'],
  'Al Barsha South': ['Al Barshaa South First', 'Barsha South'],
  'Al Quoz': ['Al Goze First', 'Al Goze Fourth', 'Al Goze Industrial First', 'Al Goze Industrial Second', 'Al Goze Third', 'Al Quoz'],
  'Al Safa': ['Al Safa', 'Safa'],
  'Al Wasl': ['Al Wasl', 'Wasl'],
  'Al Jafiliya': ['Al Jafiliya', 'Jafiliya'],
  'Al Karama': ['Al Karama', 'Karama'],
  'Al Mankhool': ['Al Mankhool', 'Mankhool'],
  'Al Raffa': ['Al Raffa', 'Raffa'],
  'Al Sabkha': ['Al Sabkha', 'Sabkha'],
  'Al Shindagha': ['Al Shindagha', 'Shindagha'],
  'Al Souq Al Kabeer': ['Al Souq Al Kabeer', 'Souq Al Kabeer'],
  'Al Rigga': ['Al Rigga', 'Rigga'],
  'Al Murar': ['Al Murar', 'Murar'],
  'Al Khabaisi': ['Al Khabaisi', 'Khabaisi'],
  'Al Mamzar': ['Al Mamzar', 'Mamzar'],
  'Al Waheda': ['Al Waheda', 'Waheda'],
  'Al Awir': ['Al Aweer First', 'Al Aweer Second', 'Al Awir'],
  'Al Warqa': ['Al Warqa', 'Warqa'],
  'Al Qusais': ['Al Qusais', 'Qusais'],
  'Abu Hail': ['Abu Hail', 'Abu Hail Dubai'],
  'Al Buteen': ['Al Buteen', 'Buteen'],
  'Al Dhagaya': ['Al Dhagaya', 'Dhagaya'],
  'Al Jaddaf': ['Al Jaddaf', 'Jaddaf'],
  'Al Khawaneej': ['Al Khawaneej', 'Khawaneej'],
  'Al Lusaily': ['Al Lusaily', 'Lusaily'],
  'Al Manara': ['Al Manara', 'Manara'],
  'Al Merkad': ['Al Merkad', 'Merkad'],
  'Al Mina': ['Al Mina', 'Mina Dubai'],
  'Al Mizhar': ['Al Mizhar', 'Mizhar Dubai'],
  'Al Muhaisnah': ['Al Muhaisnah', 'Muhaisnah'],
  'Al Nahda Second': ['Al Nahda Second', 'Nahda Second'],
  'Al Nahda First': ['Al Nahda First', 'Nahda First'],
  'Al Qudra': ['Al Qudra', 'Qudra'],
  'Al Rashidiya Dubai': ['Al Rashidiya', 'Rashidiya Dubai'],
  'Al Satwa': ['Al Satwa', 'Satwa'],
  'Al Shafar': ['Al Shafar', 'Shafar'],
  'Al Suq Al Kabeer': ['Al Suq Al Kabeer', 'Suq Al Kabeer'],
  'Al Tayer': ['Al Tayer', 'Tayer'],
  'Al Warqa First': ['Al Warqa First', 'Warqa First'],
  'Al Warqa Second': ['Al Warqa Second', 'Warqa Second'],
  'Al Warqa Third': ['Al Warqa Third', 'Warqa Third'],
  'Al Warqa Fourth': ['Al Warqa Fourth', 'Warqa Fourth'],
  'Al Warqa Fifth': ['Al Warqa Fifth', 'Warqa Fifth'],
  'Al Warqa Sixth': ['Al Warqa Sixth', 'Warqa Sixth'],
  'Al Warqa Seventh': ['Al Warqa Seventh', 'Warqa Seventh'],
  'Al Warqa Eighth': ['Al Warqa Eighth', 'Warqa Eighth'],
  
  // Abu Dhabi
  'Al Shahama': ['Al Shahama', 'Shahama'],
  'Al Samha': ['Al Samha', 'Samha'],
  'Al Wathba': ['Al Wathba', 'Wathba'],
  'Al Falah': ['Al Falah', 'Falah'],
  'Al Ghadeer': ['Al Ghadeer', 'Ghadeer'],
  'Al Shamkha': ['Al Shamkha', 'Shamkha'],
  'Baniyas': ['Baniyas', 'Bani Yas'],
  'Mushrif': ['Mushrif'],
  'Hudayriyat': ['Hudayriyat Island', 'Hudayriyat'],
  'Al Raha': ['Al Raha', 'Raha'],
  'Al Bandar': ['Al Bandar', 'Bandar'],
  'Al Seef': ['Al Seef', 'Seef Abu Dhabi'],
  'Al Nahyan': ['Al Nahyan', 'Nahyan'],
  'Al Manhal': ['Al Manhal', 'Manhal'],
  'Al Mushrif': ['Al Mushrif', 'Mushrif Abu Dhabi'],
  'Al Rowdah': ['Al Rowdah', 'Rowdah'],
  'Al Saadah': ['Al Saadah', 'Saadah'],
  'Al Salam': ['Al Salam', 'Salam'],
  'Al Dhafra': ['Al Dhafra', 'Dhafra'],
  
  // Sharjah
  'Al Ghuwair': ['Al Ghuwair', 'Ghuwair'],
  'Al Qasimia': ['Al Qasimia', 'Qasimia'],
  'Al Rahmaniya': ['Al Rahmaniya', 'Rahmaniya'],
  'Al Suyoh': ['Al Suyoh', 'Suyoh'],
  'Al Zahia': ['Al Zahia', 'Zahia'],
  'Tilal City': ['Tilal City'],
  'University City Sharjah': ['University City', 'Sharjah University'],
  'Al Sajaa': ['Al Sajaa', 'Sajaa'],
  'Al Muwailih': ['Al Muwailih', 'Muwailih'],
  'Al Muzaira': ['Al Muzaira', 'Muzaira'],
  'Al Nakhil': ['Al Nakhil', 'Nakhil'],
  'Al Qarayen': ['Al Qarayen', 'Qarayen'],
  'Al Tawun': ['Al Tawun', 'Tawun'],
  
  // Ajman
  'Ajman Downtown': ['Ajman Downtown', 'Downtown Ajman'],
  'Ajman One': ['Ajman One'],
  'Al Jurf': ['Al Jurf', 'Jurf'],
  'Al Mowaihat': ['Al Mowaihat', 'Mowaihat'],
  'City Towers Ajman': ['City Towers', 'Ajman Towers'],
  'Al Zorah': ['Al Zorah', 'Zorah'],
  'Al Yasmeen': ['Al Yasmeen', 'Yasmeen'],
  'Al Rawda': ['Al Rawda', 'Rawda Ajman'],
  
  // Ras Al Khaimah
  'Al Nakheel': ['Al Nakheel', 'Nakheel RAK'],
  'Dafan Al Khor': ['Dafan Al Khor'],
  'RAK City': ['RAK City'],
  'Al Dhait': ['Al Dhait', 'Dhait'],
  'Al Dhait South': ['Al Dhait South', 'Dhait South'],
  'Al Hamra': ['Al Hamra', 'Hamra'],
  'Al Jazeera': ['Al Jazeera', 'Jazeera RAK'],
  'Al Khor': ['Al Khor', 'Khor RAK'],
  'Al Mamourah': ['Al Mamourah', 'Mamourah'],
  'Al Mairid': ['Al Mairid', 'Mairid'],
  'Al Rams': ['Al Rams', 'Rams'],
  'Al Sawan': ['Al Sawan', 'Sawan'],
  
  // Fujairah
  'Al Faseel': ['Al Faseel', 'Faseel'],
  'Dibba': ['Dibba', 'Dibba Fujairah'],
  'Murbah': ['Murbah', 'Mirbah'],
  'Sharm': ['Sharm', 'Sharm Fujairah'],
  'Al Hail': ['Al Hail', 'Hail Fujairah'],
  'Al Mashreq': ['Al Mashreq', 'Mashreq'],
  'Al Minazif': ['Al Minazif', 'Minazif'],
  'Al Qurayyah': ['Al Qurayyah', 'Qurayyah'],
  'Al Subaykhah': ['Al Subaykhah', 'Subaykhah'],
  'Al Turayf': ['Al Turayf', 'Turayf'],
  
  // Umm Al Quwain
  'Al Raas': ['Al Raas', 'Raas'],
  'King Shaheen Street': ['King Shaheen Street'],
  'Al Hadeethah': ['Al Hadeethah', 'Hadeethah'],
  'Al Muwahid': ['Al Muwahid', 'Muwahid'],
  'Al Qimah': ['Al Qimah', 'Qimah'],
  'Al Rafaah': ['Al Rafaah', 'Rafaah']
};

// Add aliases to map
for (const [primary, aliasList] of Object.entries(aliases)) {
  if (districtMap[primary]) {
    for (const alias of aliasList) {
      if (!districtMap[alias]) {
        districtMap[alias] = {
          ...districtMap[primary],
          matchedBy: 'alias'
        };
      }
    }
  }
}

// Add additional aliases
for (const [primary, aliasList] of Object.entries(additionalAliases)) {
  // إذا كانت المنطقة غير موجودة في الخريطة، أضفها بإحداثيات تقريبية
  if (!districtMap[primary]) {
    // استخدم إحداثيات تقريبية للمنطقة
    let lat = 25.0;
    let lng = 55.0;
    
    // تحديد إحداثيات تقريبية حسب الإمارة
    const lowerPrimary = primary.toLowerCase();
    if (lowerPrimary.includes('sharjah') || lowerPrimary.includes('ajman')) {
      lat = 25.4;
      lng = 55.4;
    } else if (lowerPrimary.includes('rak') || lowerPrimary.includes('ras al khaimah') || lowerPrimary.includes('al hamra') || lowerPrimary.includes('al marjan') || lowerPrimary.includes('mina al arab')) {
      lat = 25.7;
      lng = 55.8;
    } else if (lowerPrimary.includes('fujairah') || lowerPrimary.includes('dibba') || lowerPrimary.includes('al aqah')) {
      lat = 25.1;
      lng = 56.3;
    } else if (lowerPrimary.includes('umm al quwain') || lowerPrimary.includes('uaq') || lowerPrimary.includes('al raas')) {
      lat = 25.5;
      lng = 55.5;
    } else if (lowerPrimary.includes('abu dhabi') || lowerPrimary.includes('al ain') || lowerPrimary.includes('saadiyat') || lowerPrimary.includes('yas') || lowerPrimary.includes('reem') || lowerPrimary.includes('khalifa')) {
      lat = 24.4;
      lng = 54.4;
    }
    
    districtMap[primary] = {
      lat: lat,
      lng: lng,
      totalScore: 0.4,
      facilities: {},
      matchedBy: 'added'
    };
  }
  
  for (const alias of aliasList) {
    if (!districtMap[alias]) {
      districtMap[alias] = {
        ...districtMap[primary],
        matchedBy: 'alias'
      };
    }
  }
}

console.log(`📊 District map built: ${Object.keys(districtMap).length} entries (${Object.keys(osmCache.data || {}).length} primary + aliases)`);

// ===== HELPER: Find best match =====
function findBestMatch(district, districtMap) {
  if (!district) return null;
  const lowerDistrict = district.toLowerCase().trim();
  
  // 1. Exact match (case insensitive)
  for (const [key, value] of Object.entries(districtMap)) {
    if (key.toLowerCase() === lowerDistrict) {
      return value;
    }
  }
  
  // 2. Partial match (if district contains key or key contains district)
  let bestMatch = null;
  let bestScore = 0;
  
  for (const [key, value] of Object.entries(districtMap)) {
    const lowerKey = key.toLowerCase();
    if (lowerDistrict.includes(lowerKey) || lowerKey.includes(lowerDistrict)) {
      const score = Math.max(lowerKey.length, lowerDistrict.length);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = value;
      }
    }
  }
  
  return bestMatch;
}

// ===== ENRICH TRANSACTIONS =====
let enrichedCount = 0;
let missingCount = 0;
const missingDistricts = new Set();
const matchStats = { exact: 0, alias: 0, partial: 0, added: 0 };

const enrichedData = dldData.map(t => {
  const district = t.district || '';
  const match = findBestMatch(district, districtMap);
  
  if (match) {
    enrichedCount++;
    if (match.matchedBy === 'exact') matchStats.exact++;
    else if (match.matchedBy === 'alias') matchStats.alias++;
    else if (match.matchedBy === 'added') matchStats.added++;
    else matchStats.partial++;
    
    return {
      ...t,
      lat: match.lat,
      lng: match.lng,
      gisScore: match.totalScore,
      gisFacilities: match.facilities,
      gisMatchedBy: match.matchedBy || 'partial',
      hasGis: true
    };
  } else {
    missingCount++;
    missingDistricts.add(district);
    return {
      ...t,
      lat: null,
      lng: null,
      gisScore: null,
      gisFacilities: null,
      gisMatchedBy: null,
      hasGis: false
    };
  }
});

console.log(`\n📊 Match Statistics:`);
console.log(`   Exact matches: ${matchStats.exact}`);
console.log(`   Alias matches: ${matchStats.alias}`);
console.log(`   Added matches: ${matchStats.added}`);
console.log(`   Partial matches: ${matchStats.partial}`);
console.log(`   Total enriched: ${enrichedCount.toLocaleString()} (${(enrichedCount/dldData.length*100).toFixed(1)}%)`);
console.log(`   Missing: ${missingCount.toLocaleString()} (${(missingCount/dldData.length*100).toFixed(1)}%)`);

// ===== SHOW SAMPLE MISSING DISTRICTS =====
if (missingDistricts.size > 0) {
  console.log(`\n⚠️ Missing districts (${missingDistricts.size}):`);
  const sorted = Array.from(missingDistricts).sort();
  sorted.slice(0, 20).forEach(d => console.log(`   - ${d}`));
  if (sorted.length > 20) {
    console.log(`   ... and ${sorted.length - 20} more`);
  }
}

// ===== SAVE ENRICHED DATA =====
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(enrichedData, null, 2));
console.log(`\n✅ Saved enriched data to: ${OUTPUT_FILE}`);

// ===== SUMMARY =====
console.log('\n📊 Summary:');
console.log(`   Total transactions: ${dldData.length.toLocaleString()}`);
console.log(`   With coordinates: ${enrichedCount.toLocaleString()}`);
console.log(`   Without coordinates: ${missingCount.toLocaleString()}`);
console.log(`   Missing districts: ${missingDistricts.size}`);
console.log(`\n✅ File created: ${OUTPUT_FILE}`);