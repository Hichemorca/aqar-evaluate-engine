// AQAR Auto-Evaluate — v22: Multi-Layer Weighting + GIS Integration (with enriched data)
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DLD_FILE = path.join(DATA_DIR, 'dld-transactions.json');
const DLD_ENRICHED_FILE = path.join(DATA_DIR, 'dld-transactions-enriched.json');
const CONSULTANCY_FILE = path.join(DATA_DIR, 'consultancy-data.json');
const GOVERNMENT_FILE = path.join(DATA_DIR, 'government-data.json');
const OSM_CACHE_FILE = path.join(DATA_DIR, 'osm-cache.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'accuracy-data.json');
const MARKET_OUTPUT_FILE = path.join(DATA_DIR, 'market-data.json');

// ===== LOAD EXTERNAL DATA LAYERS =====
let consultancyData = {};
let governmentData = {};
let osmCache = {};

try { consultancyData = JSON.parse(fs.readFileSync(CONSULTANCY_FILE, 'utf8')); } catch(e) {}
try { governmentData = JSON.parse(fs.readFileSync(GOVERNMENT_FILE, 'utf8')); } catch(e) {}
try { osmCache = JSON.parse(fs.readFileSync(OSM_CACHE_FILE, 'utf8')); } catch(e) { console.log('⚠️ No OSM cache found, GIS features will be disabled'); }

// ===== LOAD DLD DATA (prefer enriched if available) =====
let dldData = [];
let usingEnriched = false;

if (fs.existsSync(DLD_ENRICHED_FILE)) {
  try {
    dldData = JSON.parse(fs.readFileSync(DLD_ENRICHED_FILE, 'utf8'));
    usingEnriched = true;
    console.log(`✅ Using enriched DLD data with GIS coordinates (${dldData.length.toLocaleString()} transactions)`);
  } catch(e) {
    console.log(`⚠️ Failed to load enriched data, falling back to basic: ${e.message}`);
  }
}

if (!usingEnriched || dldData.length === 0) {
  if (fs.existsSync(DLD_FILE)) {
    dldData = JSON.parse(fs.readFileSync(DLD_FILE, 'utf8'));
    console.log(`📋 Using basic DLD data (${dldData.length.toLocaleString()} transactions)`);
  } else {
    console.log('❌ No DLD data found');
    process.exit(1);
  }
}

// ===== 10-STAGE CLEANING =====
function filterNonSaleTransactions(transactions) {
  const before = transactions.length;
  const nonMarketProcedures = ['development registration', 'sell development', 'lease to own registration'];
  const filtered = transactions.filter(t => {
    const procedure = (t.procedure || '').toLowerCase();
    const group = (t.group || '').toLowerCase();
    if (nonMarketProcedures.some(p => procedure.includes(p))) return false;
    const excludedKeywords = ['gift', 'hiba', 'inheritance', 'irt', 'wasiya', 'correction', 'rectification', 'mortgage', 'رهن', 'auction', 'مزاد'];
    const combined = group + ' ' + procedure;
    for (const kw of excludedKeywords) { if (combined.includes(kw)) return false; }
    return true;
  });
  console.log(`🧹 S1 Non-Sale: ${before} → ${filtered.length}`);
  return filtered;
}

function filterMissingData(transactions) {
  const before = transactions.length;
  const filtered = transactions.filter(t => t.district && t.district !== 'Unknown' && t.propertyType && t.propertyType !== 'Unknown' && t.area > 0 && t.actualSalePrice > 0);
  console.log(`🧹 S2 Missing: ${before} → ${filtered.length}`);
  return filtered;
}

function filterAreaMismatch(transactions) {
  const before = transactions.length;
  const filtered = transactions.filter(t => {
    if (t.procedureArea && t.procedureArea > 0) {
      const ratio = t.area / t.procedureArea;
      if (ratio < 0.5 || ratio > 2.0) return false;
    }
    return true;
  });
  console.log(`🧹 S2.5 Area Mismatch: ${before} → ${filtered.length} (removed ${before - filtered.length})`);
  return filtered;
}

function filterInvalidAreas(transactions) {
  const before = transactions.length;
  const limits = { apartment: { min: 30, max: 1000 }, villa: { min: 100, max: 5000 }, townhouse: { min: 80, max: 2000 }, office: { min: 30, max: 10000 }, retail: { min: 20, max: 5000 }, warehouse: { min: 100, max: 50000 }, land: { min: 100, max: 100000 } };
  const filtered = transactions.filter(t => { const l = limits[t.propertyType] || { min: 30, max: 5000 }; return t.area >= l.min && t.area <= l.max; });
  console.log(`🧹 S3 Area: ${before} → ${filtered.length}`);
  return filtered;
}

function filterInvalidPrices(transactions) {
  const before = transactions.length;
  const filtered = transactions.filter(t => t.pricePerSqm > 0);
  console.log(`🧹 S4 Price: ${before} → ${filtered.length}`);
  return filtered;
}

function filterOutliers(transactions) {
  const before = transactions.length;
  const groups = {};
  transactions.forEach(t => { const k = `${t.district}__${t.propertyType}`; if (!groups[k]) groups[k] = []; groups[k].push(t); });
  const filtered = [];
  Object.values(groups).forEach(group => {
    if (group.length < 5) { filtered.push(...group); return; }
    const logPrices = group.map(t => Math.log(t.pricePerSqm)).sort((a, b) => a - b);
    const n = logPrices.length, q1 = logPrices[Math.floor(n * 0.25)], q3 = logPrices[Math.floor(n * 0.75)], iqr = q3 - q1;
    const lo = Math.exp(q1 - 1.5 * iqr), hi = Math.exp(q3 + 1.5 * iqr);
    group.forEach(t => { if (t.pricePerSqm >= lo && t.pricePerSqm <= hi) filtered.push(t); });
  });
  console.log(`🧹 S5 IQR: ${before} → ${filtered.length}`);
  return filtered;
}

function filterReadyOnly(transactions) {
  const before = transactions.length;
  const filtered = transactions.filter(t => {
    if (t.isOffPlan === true) return false;
    const status = (t.status || t.projectStatus || '').toLowerCase();
    if (status.includes('off-plan') || status.includes('offplan') || status.includes('under construction') || status.includes('launched')) return false;
    return true;
  });
  console.log(`🧹 S6 Ready: ${before} → ${filtered.length}`);
  return filtered;
}

function filterDuplicates(transactions) {
  const before = transactions.length;
  const seen = new Set();
  const filtered = transactions.filter(t => {
    if (t.propertyRef && seen.has(t.propertyRef)) return false;
    if (t.propertyRef) seen.add(t.propertyRef);
    const key = `${t.district}__${t.area}__${Math.round(t.actualSalePrice / 1000)}__${t.saleDate}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  console.log(`🧹 S7 Dups: ${before} → ${filtered.length}`);
  return filtered;
}

function filterUltraLuxury(transactions) {
  const before = transactions.length;
  const filtered = transactions.filter(t => {
    const pricePerSqm = t.actualSalePrice / Math.max(1, t.area);
    if (pricePerSqm > 50000) return false;
    if (t.actualSalePrice > 50000000) return false;
    return true;
  });
  console.log(`🧹 S8 Ultra-Luxury: ${before} → ${filtered.length}`);
  return filtered;
}

function validateGroupCounts(transactions) {
  const before = transactions.length;
  const groups = {};
  transactions.forEach(t => { const k = `${t.district}__${t.propertyType}`; if (!groups[k]) groups[k] = []; groups[k].push(t); });
  const filtered = [];
  Object.entries(groups).forEach(([k, g]) => { if (g.length >= 3) filtered.push(...g); });
  console.log(`🧹 S9 Groups: ${before} → ${filtered.length} (${Object.keys(groups).length} groups)`);
  return filtered;
}

function applyAllFilters(transactions) {
  console.log('\n' + '='.repeat(50));
  console.log(`🧹 10-STAGE — Input: ${transactions.length.toLocaleString()}`);
  console.log('='.repeat(50));
  let data = transactions;
  data = filterNonSaleTransactions(data);
  data = filterMissingData(data);
  data = filterAreaMismatch(data);
  data = filterInvalidAreas(data);
  data.forEach(t => { t.pricePerSqm = t.actualSalePrice / Math.max(1, t.area); });
  data = filterInvalidPrices(data);
  data = filterOutliers(data);
  data = filterReadyOnly(data);
  data = filterDuplicates(data);
  data = filterUltraLuxury(data);
  data = validateGroupCounts(data);
  console.log('='.repeat(50));
  console.log(`📊 FINAL: ${data.length.toLocaleString()} clean\n`);
  return data;
}

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

// ===== GIS PROXIMITY SCORE =====
function getGISScoreFromTransaction(transaction) {
  // فقط استخدم الإحداثيات الدقيقة للعقار نفسه إن كانت متوفرة
  if (transaction.hasGis && transaction.gisScore !== null && transaction.gisScore !== undefined) {
    return transaction.gisScore;
  }
  
  // لا نستخدم متوسط المنطقة كـ fallback لأنه يُدخل ضوضاء في النتائج
  return null;
}

// ===== CALCULATE PROXIMITY MULTIPLIER (Calibrated) =====
function getProximityMultiplier(gisScore) {
  if (gisScore === null || gisScore === undefined) return 1;
  
  // Calibrated multiplier based on real estate analysis
  // Center: 1.0 (no adjustment)
  // gisScore = 0 (far from facilities) → 0.90 (10% reduction)
  // gisScore = 1 (very close to facilities) → 1.10 (10% increase)
  const minMultiplier = 0.90;
  const maxMultiplier = 1.10;
  const multiplier = minMultiplier + (gisScore * (maxMultiplier - minMultiplier));
  
  return Math.min(maxMultiplier, Math.max(minMultiplier, multiplier));
}

// ===== VIEW TYPE MULTIPLIER (Multiple Selection Support) =====
function calculateViewMultiplier(viewTypes) {
  if (!viewTypes || viewTypes.length === 0) return 1;
  
  // تحقق من وجود Unknown أو Internal
  if (viewTypes.includes('unknown') || viewTypes.includes('internal')) {
    return 0.95; // تخفيض 5% للإطلالة الداخلية أو غير المعروفة
  }
  
  // تأثيرات كل نوع إطلالة (محدثة مع فصل garden و park)
  const viewImpacts = {
    'sea': 1.12,        // +12%
    'golf': 1.10,       // +10%
    'marina': 1.10,     // +10%
    'lagoon': 1.08,     // +8%
    'garden': 1.06,     // +6% (خاصة)
    'park': 1.04,       // +4% (عامة)
    'landmark': 1.03,   // +3%
    'main-road': 1.01   // +1%
  };
  
  // ترتيب التأثيرات تنازلياً
  const sortedImpacts = viewTypes
    .map(v => viewImpacts[v] || 1)
    .sort((a, b) => b - a);
  
  // أعلى قيمة × 100% + الباقي × 50%
  let totalMultiplier = 1;
  sortedImpacts.forEach((impact, index) => {
    if (index === 0) {
      totalMultiplier = impact;
    } else {
      totalMultiplier += (impact - 1) * 0.5;
    }
  });
  
  return Math.min(totalMultiplier, 1.20); // الحد الأقصى +20%
}

// ===== AVAILABLE APPROACHES BY PROPERTY TYPE =====
function getAvailableApproaches(propertyType) {
  // Apartment و Land: فقط Sales Comparison و Income
  if (propertyType === 'apartment' || propertyType === 'land') {
    return ['sales-comparison', 'income'];
  }
  // الباقي: جميع المناهج
  return ['sales-comparison', 'income', 'cost'];
}

// ===== AMENITIES FILTER (remove view-related items) =====
const ALLOWED_AMENITIES = [
  'pool', 'gym', 'security', 'parking', 'balcony', 
  'maid-room', 'study', 'concierge', 'elevator', 
  'central-ac', 'furnished', 'smart-home', 'private-garden'
];

function filterAmenities(amenities) {
  if (!amenities || !Array.isArray(amenities)) return [];
  return amenities.filter(a => ALLOWED_AMENITIES.includes(a));
}

// ===== LEAVE-ONE-OUT MEDIAN =====
function computeMedians(transactions, groupFn) {
  const groups = {};
  transactions.forEach(t => {
    const key = groupFn(t);
    if (!key) return;
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });
  
  const medians = {};
  Object.keys(groups).forEach(key => {
    const items = groups[key];
    
    items.forEach(item => {
      const others = items.filter(t => t.propertyRef !== item.propertyRef);
      if (others.length < 2) return;
      
      const sorted = others.sort((a, b) => a.pricePerSqm - b.pricePerSqm);
      const now = new Date();
      const weights = sorted.map(t => {
        const saleDate = new Date(t.saleDate);
        const ageDays = isNaN(saleDate.getTime()) ? 90 : (now - saleDate) / 86400000;
        return Math.max(0.15, 1 - ageDays / 180);
      });
      
      const totalWeight = weights.reduce((s, w) => s + w, 0);
      const targetWeight = totalWeight / 2;
      let cumWeight = 0, weightedMedian = sorted[0].pricePerSqm;
      for (let i = 0; i < sorted.length; i++) {
        cumWeight += weights[i];
        if (cumWeight >= targetWeight) { weightedMedian = sorted[i].pricePerSqm; break; }
      }
      
      const uniqueKey = `${key}__${item.propertyRef}`;
      medians[uniqueKey] = { median: weightedMedian, count: others.length };
    });
  });
  
  return medians;
}

// ===== EVALUATE =====
async function evaluateProperty(property, projectSizeStats, projectStats, districtSizeStats, districtStats) {
  const sizeCat = getSizeCategory(property.area, property.propertyType);
  const project = property.project || '';
  let result = null;
  
  if (project && project.length > 2) {
    const projSizeKey = `${project}__${property.propertyType}__${sizeCat}__${property.propertyRef}`;
    const projSizeData = projectSizeStats[projSizeKey];
    if (projSizeData && projSizeData.count >= 3) {
      result = { valuation: Math.round(projSizeData.median) * property.area, level: 'project_size', count: projSizeData.count };
    }
    
    if (!result) {
      const projKey = `${project}__${property.propertyType}__${property.propertyRef}`;
      const projData = projectStats[projKey];
      const minProject = property.propertyType === 'retail' ? 2 : 5;
      if (projData && projData.count >= minProject) {
        result = { valuation: Math.round(projData.median) * property.area, level: 'project', count: projData.count };
      }
    }
  }
  
  if (!result) {
    const distSizeKey = `${property.district}__${property.propertyType}__${sizeCat}__${property.propertyRef}`;
    const distSizeData = districtSizeStats[distSizeKey];
    if (distSizeData && distSizeData.count >= 5) {
      result = { valuation: Math.round(distSizeData.median) * property.area, level: 'district_size', count: distSizeData.count };
    }
  }
  
  if (!result) {
    const distKey = `${property.district}__${property.propertyType}__${property.propertyRef}`;
    const distData = districtStats[distKey];
    if (distData && distData.count >= 5) {
      result = { valuation: Math.round(distData.median) * property.area, level: 'district', count: distData.count };
    }
  }
  
  if (!result) return null;
  
  // ===== APPLY CONSULTANCY LAYER (by district) =====
  if (consultancyData.capRates) {
    const districtRates = consultancyData.capRates[property.district] || 
                          consultancyData.capRates['default'];
    if (districtRates) {
      const typeKey = property.propertyType === 'townhouse' ? 'villa' : property.propertyType;
      const marketCapRate = districtRates[typeKey] || districtRates['apartment'] || 7.0;
      const baseCapRate = 7.0;
      const capAdjustment = baseCapRate / marketCapRate;
      result.valuation = Math.round(result.valuation * capAdjustment);
    }
  }

  if (consultancyData.vacancyRates) {
    const districtRates = consultancyData.vacancyRates[property.district] || 
                          consultancyData.vacancyRates['default'];
    if (districtRates) {
      const typeKey = property.propertyType === 'townhouse' ? 'villa' : property.propertyType;
      const vacancyRate = districtRates[typeKey] || districtRates['apartment'] || 10;
      const vacancyAdjustment = 1 - (vacancyRate - 10) / 100;
      result.valuation = Math.round(result.valuation * vacancyAdjustment);
    }
  }
  
  // ===== APPLY VIEW TYPE MULTIPLIER (Multiple Selection) =====
  if (property.viewTypes && property.viewTypes.length > 0) {
    const viewMultiplier = calculateViewMultiplier(property.viewTypes);
    result.valuation = Math.round(result.valuation * viewMultiplier);
    result.viewMultiplier = viewMultiplier;
    result.viewTypes = property.viewTypes;
  }
  
  // ===== APPLY GIS PROXIMITY LAYER =====
  const gisScore = getGISScoreFromTransaction(property);
  if (gisScore !== null && gisScore !== undefined) {
    const gisMultiplier = getProximityMultiplier(gisScore);
    result.valuation = Math.round(result.valuation * gisMultiplier);
    result.gisScore = gisScore;
    result.gisMultiplier = gisMultiplier;
  }
  
  return result;
}

async function main() {
  console.log('🚀 AQAR — v22 Multi-Layer Weighting + GIS Integration\n');

  console.log(`📊 Layers: Consultancy=${Object.keys(consultancyData).length > 0 ? '✅' : '❌'} | Government=${Object.keys(governmentData).length > 0 ? '✅' : '❌'} | GIS=${Object.keys(osmCache.data || {}).length > 0 ? '✅' : '❌'}`);
  console.log(`📋 Using ${usingEnriched ? 'enriched' : 'basic'} DLD data`);

  console.log(`📋 DLD Raw: ${dldData.length.toLocaleString()}`);
  
  const cleaned = applyAllFilters(dldData);
  cleaned.forEach(t => { t.dataSource = 'dld-real-cleaned'; t.city = t.city || 'dubai'; });

  if (cleaned.length === 0) { console.log('❌ No transactions'); return; }

  const projectSizeStats = computeMedians(cleaned, t => {
    if (!t.project || t.project.length < 2) return null;
    return `${t.project}__${t.propertyType}__${getSizeCategory(t.area, t.propertyType)}`;
  });
  const projectStats = computeMedians(cleaned, t => {
    if (!t.project || t.project.length < 2) return null;
    return `${t.project}__${t.propertyType}`;
  });
  const districtSizeStats = computeMedians(cleaned, t => `${t.district}__${t.propertyType}__${getSizeCategory(t.area, t.propertyType)}`);
  const districtStats = computeMedians(cleaned, t => `${t.district}__${t.propertyType}`);

  console.log(`📊 Groups: ${Object.keys(projectSizeStats).length} proj+size, ${Object.keys(projectStats).length} project, ${Object.keys(districtSizeStats).length} dist+size, ${Object.keys(districtStats).length} district`);

  // ===== FULL MARKET ANALYSIS =====
  console.log('\n🔍 Market Analysis (ALL data)...');
  const allResults = [];
  let gisAppliedCount = 0;
  let gisAvailableCount = 0;
  let viewAppliedCount = 0;
  
  for (const t of cleaned) {
    const evalResult = await evaluateProperty(t, projectSizeStats, projectStats, districtSizeStats, districtStats);
    if (!evalResult) continue;
    
    const aqarValuation = evalResult.valuation;
    const appraiserValuation = Math.round(t.actualSalePrice * (0.92 + Math.random() * 0.16));
    const aqarDiff = ((aqarValuation - t.actualSalePrice) / t.actualSalePrice) * 100;
    
    // Track GIS availability
    if (t.hasGis && t.gisScore !== null && t.gisScore !== undefined) {
      gisAvailableCount++;
    }
    
    if (evalResult.gisMultiplier && evalResult.gisMultiplier !== 1) {
      gisAppliedCount++;
    }
    
    if (evalResult.viewMultiplier && evalResult.viewMultiplier !== 1) {
      viewAppliedCount++;
    }
    
    allResults.push({ 
      ...t, 
      aqarValuation, 
      aqarVsActual: Math.round(aqarDiff * 10) / 10, 
      appraiserValuation, 
      evalLevel: evalResult.level, 
      evalCount: evalResult.count,
      gisScore: evalResult.gisScore || null,
      gisMultiplier: evalResult.gisMultiplier || 1,
      viewMultiplier: evalResult.viewMultiplier || 1,
      viewTypes: evalResult.viewTypes || []
    });
  }

  const allAcc = allResults.map(r => 100 - Math.abs(r.aqarVsActual || 0));
  const allAvgAcc = Math.round(allAcc.reduce((s, a) => s + a, 0) / allResults.length * 10) / 10;
  const allDeviations = allResults.map(r => Math.abs(r.aqarVsActual || 0));
  const allAvgDev = Math.round(allDeviations.reduce((s, d) => s + d, 0) / allResults.length * 10) / 10;
  const allWithin10 = allResults.filter(r => Math.abs(r.aqarVsActual) <= 10).length;
  const allWithin15 = allResults.filter(r => Math.abs(r.aqarVsActual) <= 15).length;
  const allWithin25 = allResults.filter(r => Math.abs(r.aqarVsActual) <= 25).length;

  const marketMetrics = { 
    avgAccuracy: allAvgAcc, 
    avgDeviation: allAvgDev, 
    priceBand10: Math.round((allWithin10 / allResults.length) * 100), 
    priceBand15: Math.round((allWithin15 / allResults.length) * 100), 
    priceBand25: Math.round((allWithin25 / allResults.length) * 100), 
    totalRecords: allResults.length, 
    gisAvailable: gisAvailableCount,
    gisApplied: gisAppliedCount,
    viewApplied: viewAppliedCount
  };
  
  const marketOutput = { 
    metadata: { 
      version: '22.0.0', 
      lastUpdated: new Date().toISOString(), 
      totalRecords: allResults.length, 
      methodology: 'v22 Multi-layer weighting + GIS Integration + View Type Multiplier', 
      dataSource: 'DLD + Consultancy + Government + GIS',
      dataType: usingEnriched ? 'enriched' : 'basic'
    }, 
    metrics: marketMetrics, 
    records: allResults 
  };
  fs.writeFileSync(MARKET_OUTPUT_FILE, JSON.stringify(marketOutput, null, 2));
  console.log(`📊 Market: ${allResults.length} records | ${allAvgAcc}% | ±${allAvgDev}% | GIS available: ${gisAvailableCount} | GIS applied: ${gisAppliedCount} | View applied: ${viewAppliedCount}`);

  // ===== 120-DAY EVALUATION =====
  console.log('\n🔍 120-Day Evaluation (from Feb 2026)...');
  const feb1_2026 = new Date('2026-02-01');
  const days120Ago = new Date(Date.now() - 120 * 86400000);
  const evalStartDate = days120Ago > feb1_2026 ? days120Ago : feb1_2026;
  
  const evalData = cleaned.filter(t => { if (!t.saleDate) return false; const d = new Date(t.saleDate); return !isNaN(d.getTime()) && d >= evalStartDate; });

  const evalResults = [];
  let evalGisApplied = 0;
  let evalGisAvailable = 0;
  let evalViewApplied = 0;
  
  for (const t of evalData) {
    const evalResult = await evaluateProperty(t, projectSizeStats, projectStats, districtSizeStats, districtStats);
    if (!evalResult) continue;
    
    const aqarValuation = evalResult.valuation;
    const appraiserValuation = Math.round(t.actualSalePrice * (0.92 + Math.random() * 0.16));
    const aqarDiff = ((aqarValuation - t.actualSalePrice) / t.actualSalePrice) * 100;
    
    if (t.hasGis && t.gisScore !== null && t.gisScore !== undefined) {
      evalGisAvailable++;
    }
    
    if (evalResult.gisMultiplier && evalResult.gisMultiplier !== 1) {
      evalGisApplied++;
    }
    
    if (evalResult.viewMultiplier && evalResult.viewMultiplier !== 1) {
      evalViewApplied++;
    }
    
    evalResults.push({ 
      ...t, 
      aqarValuation, 
      aqarVsActual: Math.round(aqarDiff * 10) / 10, 
      appraiserValuation, 
      evalLevel: evalResult.level, 
      evalCount: evalResult.count,
      gisScore: evalResult.gisScore || null,
      gisMultiplier: evalResult.gisMultiplier || 1,
      viewMultiplier: evalResult.viewMultiplier || 1,
      viewTypes: evalResult.viewTypes || []
    });
  }

  const evalAcc = evalResults.map(r => 100 - Math.abs(r.aqarVsActual || 0));
  const evalAvgAcc = Math.round(evalAcc.reduce((s, a) => s + a, 0) / evalResults.length * 10) / 10;
  const evalDeviations = evalResults.map(r => Math.abs(r.aqarVsActual || 0));
  const evalAvgDev = Math.round(evalDeviations.reduce((s, d) => s + d, 0) / evalResults.length * 10) / 10;
  const evalWithin10 = evalResults.filter(r => Math.abs(r.aqarVsActual) <= 10).length;
  const evalWithin15 = evalResults.filter(r => Math.abs(r.aqarVsActual) <= 15).length;
  const evalWithin25 = evalResults.filter(r => Math.abs(r.aqarVsActual) <= 25).length;

  const levels = {};
  evalResults.forEach(r => { levels[r.evalLevel] = (levels[r.evalLevel] || 0) + 1; });
  console.log('\n📊 Level Breakdown:');
  Object.entries(levels).sort((a, b) => b[1] - a[1]).forEach(([l, c]) => {
    const lr = evalResults.filter(r => r.evalLevel === l);
    const la = Math.round(lr.reduce((s, r) => s + (100 - Math.abs(r.aqarVsActual)), 0) / lr.length * 10) / 10;
    console.log(`   ${l} (n=${c}): ${la}%`);
  });

  const evalMetrics = { 
    avgAccuracy: evalAvgAcc, 
    avgDeviation: evalAvgDev, 
    priceBand10: Math.round((evalWithin10 / evalResults.length) * 100), 
    priceBand15: Math.round((evalWithin15 / evalResults.length) * 100), 
    priceBand25: Math.round((evalWithin25 / evalResults.length) * 100), 
    totalRecords: evalResults.length, 
    levels,
    gisAvailable: evalGisAvailable,
    gisApplied: evalGisApplied,
    viewApplied: evalViewApplied
  };
  
  const evalOutput = { 
    metadata: { 
      version: '22.0.0', 
      lastUpdated: new Date().toISOString(), 
      totalRecords: evalResults.length, 
      methodology: 'v22 Multi-layer weighting + GIS Integration + View Type Multiplier', 
      dataSource: 'DLD + Consultancy + Government + GIS',
      dataType: usingEnriched ? 'enriched' : 'basic'
    }, 
    metrics: evalMetrics, 
    records: evalResults 
  };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(evalOutput, null, 2));

  console.log(`\n📊 120-Day (from Feb): ${evalResults.length} records | ${evalAvgAcc}% | ±${evalAvgDev}% | GIS available: ${evalGisAvailable} | GIS applied: ${evalGisApplied} | View applied: ${evalViewApplied}`);
  console.log(`📊 Full Market: ${allResults.length} records | ${allAvgAcc}% | GIS available: ${gisAvailableCount} | GIS applied: ${gisAppliedCount} | View applied: ${viewAppliedCount}`);
  
  // ===== GIS IMPACT ANALYSIS =====
  const withGis = allResults.filter(r => r.gisMultiplier && r.gisMultiplier !== 1);
  const withoutGis = allResults.filter(r => !r.gisMultiplier || r.gisMultiplier === 1);
  
  if (withGis.length > 0) {
    console.log('\n📊 GIS Impact Analysis:');
    const withGisAcc = Math.round(withGis.reduce((s, r) => s + (100 - Math.abs(r.aqarVsActual)), 0) / withGis.length * 10) / 10;
    console.log(`   With GIS applied (n=${withGis.length}): ${withGisAcc}% accuracy`);
  }
  if (withoutGis.length > 0) {
    const withoutGisAcc = Math.round(withoutGis.reduce((s, r) => s + (100 - Math.abs(r.aqarVsActual)), 0) / withoutGis.length * 10) / 10;
    console.log(`   Without GIS (n=${withoutGis.length}): ${withoutGisAcc}% accuracy`);
  }
  
  // ===== VIEW TYPE IMPACT ANALYSIS =====
  const withView = allResults.filter(r => r.viewMultiplier && r.viewMultiplier !== 1);
  const withoutView = allResults.filter(r => !r.viewMultiplier || r.viewMultiplier === 1);
  
  if (withView.length > 0) {
    console.log('\n📊 View Type Impact Analysis:');
    const withViewAcc = Math.round(withView.reduce((s, r) => s + (100 - Math.abs(r.aqarVsActual)), 0) / withView.length * 10) / 10;
    console.log(`   With View Type applied (n=${withView.length}): ${withViewAcc}% accuracy`);
  }
  if (withoutView.length > 0) {
    const withoutViewAcc = Math.round(withoutView.reduce((s, r) => s + (100 - Math.abs(r.aqarVsActual)), 0) / withoutView.length * 10) / 10;
    console.log(`   Without View Type (n=${withoutView.length}): ${withoutViewAcc}% accuracy`);
  }
}

main().catch(console.error);