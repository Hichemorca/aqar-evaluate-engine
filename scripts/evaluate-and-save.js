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
const { getApplicableMethods } = require('../shared/aqar-policy');
const { getSizeCategory, applyAllFilters } = require('../scripts/cleaning-pipeline');
const { findUnverifiedRecords } = require('../shared/dld-provenance');
const { cleanDldRecords } = require('../shared/dld-evidence-cleaning');
const calibrationDefaults = require('../shared/aqar-calibration-defaults');
const calibrationEngine = require('../shared/calibration-engine');
const ACTIVE_CALIBRATION_FILE = path.join(DATA_DIR, 'active-calibration.json');
const DLD_CLEANING_REPORT_FILE = path.join(DATA_DIR, 'dld-cleaning-report.json');
let ACTIVE_CALIBRATION = calibrationDefaults.createDefaultCalibrationConfig();
let DLD_CLEANING_REPORT = null;
try {
  if (fs.existsSync(ACTIVE_CALIBRATION_FILE)) ACTIVE_CALIBRATION = JSON.parse(fs.readFileSync(ACTIVE_CALIBRATION_FILE, 'utf8'));
} catch (error) {
  console.log(`⚠️ Could not load active calibration, using defaults: ${error.message}`);
}
try {
  if (fs.existsSync(DLD_CLEANING_REPORT_FILE)) DLD_CLEANING_REPORT = JSON.parse(fs.readFileSync(DLD_CLEANING_REPORT_FILE, 'utf8'));
} catch (error) {
  console.log(`⚠️ Could not load DLD cleaning report: ${error.message}`);
}
function getBatchCalibration(propertyType) {
  return calibrationDefaults.getPropertyConfig(ACTIVE_CALIBRATION, propertyType);
}

console.log(`📊 Active calibration config: ${ACTIVE_CALIBRATION.configId || 'base-22.1'}`);

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

// ===== SHARED CLEANING PIPELINE =====
// Cleaning rules are imported from scripts/cleaning-pipeline.js.

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
  return null;
}

// ===== CALCULATE PROXIMITY MULTIPLIER (Re-calibrated based on actual data) =====
function getProximityMultiplier(gisScore) {
  if (gisScore === null || gisScore === undefined) return 1;
  const gis = ACTIVE_CALIBRATION.gis || {};
  const calibrationFactor = Number(gis.proximityFactorPerScore ?? -0.0156);
  const adjustment = gisScore * calibrationFactor;
  const multiplier = 1 + adjustment;
  return Math.min(Number(gis.proximityMaximumMultiplier ?? 1.01), Math.max(Number(gis.proximityMinimumMultiplier ?? 0.98), multiplier));
}

// ===== VIEW TYPE MULTIPLIER (Multiple Selection Support) =====
function calculateViewMultiplier(viewTypes, propertyType) {
  if (!viewTypes || viewTypes.length === 0) return 1;
  if (viewTypes.includes('unknown') || viewTypes.includes('internal')) return 1;
  const sales = getBatchCalibration(propertyType || 'apartment').coefficients.sales;
  const factors = sales.viewFactors || {};
  const impacts = viewTypes.map(view => Number(factors[view] || 1)).sort((a, b) => b - a);
  let totalMultiplier = 1;
  impacts.forEach((impact, index) => {
    totalMultiplier = index === 0 ? impact : totalMultiplier + (impact - 1) * Number(sales.viewSecondaryFactor ?? 0.5);
  });
  return Math.max(Number(sales.viewMinimumMultiplier ?? 0.8), Math.min(Number(sales.viewMaximumMultiplier ?? 1.25), totalMultiplier));
}

// ===== AVAILABLE APPROACHES BY PROPERTY TYPE =====
function getAvailableApproaches(propertyType) {
  return getApplicableMethods(propertyType, 'batch');
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

// ===== BUILD LIVE LOOKUP TABLE =====
function buildLiveLookupTable(transactions) {
  function simpleMedian(items) {
    const now = new Date();
    const withWeights = items.map(t => {
      const saleDate = new Date(t.saleDate);
      const ageDays = isNaN(saleDate.getTime()) ? 90 : (now - saleDate) / 86400000;
      return { price: t.pricePerSqm, weight: Math.max(0.15, 1 - ageDays / 180) };
    }).sort((a, b) => a.price - b.price);
    const totalWeight = withWeights.reduce((s, w) => s + w.weight, 0);
    const targetWeight = totalWeight / 2;
    let cumWeight = 0;
    for (const w of withWeights) {
      cumWeight += w.weight;
      if (cumWeight >= targetWeight) return w.price;
    }
    return withWeights[withWeights.length - 1].price;
  }

  function groupAndMedian(groupFn) {
    const groups = {};
    transactions.forEach(t => {
      const key = groupFn(t);
      if (!key) return;
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });
    const result = {};
    Object.keys(groups).forEach(key => {
      if (groups[key].length < 2) return;
      result[key] = { medianPricePerSqm: Math.round(simpleMedian(groups[key])), count: groups[key].length };
    });
    return result;
  }

  return {
    projectSize: groupAndMedian(t => {
      if (!t.project || t.project.length < 2) return null;
      return `${t.project}__${t.propertyType}__${getSizeCategory(t.area, t.propertyType)}`;
    }),
    project: groupAndMedian(t => {
      if (!t.project || t.project.length < 2) return null;
      return `${t.project}__${t.propertyType}`;
    }),
    districtSize: groupAndMedian(t => `${t.district}__${t.propertyType}__${getSizeCategory(t.area, t.propertyType)}`),
    district: groupAndMedian(t => `${t.district}__${t.propertyType}`)
  };
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
    const viewMultiplier = calculateViewMultiplier(property.viewTypes, property.propertyType);
    result.valuation = Math.round(result.valuation * viewMultiplier);
    result.viewMultiplier = viewMultiplier;
    result.viewTypes = property.viewTypes;
  }
  
  // ===== APPLY GIS PROXIMITY LAYER (Re-calibrated) =====
  const gisScore = getGISScoreFromTransaction(property);
  if (gisScore !== null && gisScore !== undefined) {
    const gisMultiplier = getProximityMultiplier(gisScore);
    result.valuation = Math.round(result.valuation * gisMultiplier);
    result.gisScore = gisScore;
    result.gisMultiplier = gisMultiplier;
  }

  const propertyConfig = getBatchCalibration(property.propertyType);
  const methodResults = calibrationEngine.buildMethodResults({
    salesValue: result.valuation,
    marketValue: result.valuation,
    annualRent: property.annualRent,
    annualExpenses: property.annualExpenses,
    vacancyRatePercent: property.vacancyRatePercent,
    capRatePercent: property.capRatePercent,
    area: property.area,
    landValue: property.landValue,
    constructionCost: property.constructionCost,
    yearBuilt: property.yearBuilt,
    currentYear: 2026,
    condition: property.condition || 'good'
  }, propertyConfig);
  const combined = calibrationEngine.combineMethodResults(methodResults, propertyConfig, ACTIVE_CALIBRATION.configId || 'base-22.1');
  if (combined.status !== 'APPLIED') return null;
  result.valuation = combined.value;
  result.methodResults = combined.methods;
  result.assumptions = combined.assumptions;
  result.calibrationId = combined.calibrationId;

  return result;
}

async function main() {
  console.log('🚀 AQAR — v22 Multi-Layer Weighting + GIS Integration\n');

  console.log(`📊 Layers: Consultancy=${Object.keys(consultancyData).length > 0 ? '✅' : '❌'} | Government=${Object.keys(governmentData).length > 0 ? '✅' : '❌'} | GIS=${Object.keys(osmCache.data || {}).length > 0 ? '✅' : '❌'}`);
  console.log(`📋 Using ${usingEnriched ? 'enriched' : 'basic'} DLD data`);

  console.log(`📋 DLD Raw: ${dldData.length.toLocaleString()}`);
  const dldCleaning = cleanDldRecords(dldData);
  console.log(`🧼 DLD Evidence Cleaning: ${dldCleaning.eligibleRecords.length.toLocaleString()} eligible | ${dldCleaning.rejectedRecords.length.toLocaleString()} rejected | ${dldCleaning.summary.skipped.toLocaleString()} skipped | ${dldCleaning.summary.duplicateTransactionIds.toLocaleString()} duplicates`);
  dldData = dldCleaning.eligibleRecords;
  const unverifiedRecords = findUnverifiedRecords(dldData);
  if (unverifiedRecords.length > 0) {
    console.error(`❌ Refusing official accuracy generation: ${unverifiedRecords.length} unverified DLD records`);
    process.exitCode = 1;
    return;
  }
  
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

  // ===== BUILD LIVE LOOKUP TABLE =====
  const liveLookup = buildLiveLookupTable(cleaned);
  const lookupOutput = {
    generatedAt: new Date().toISOString(),
    source: 'dld-transactions.csv',
    totalTransactionsUsed: cleaned.length,
    tables: liveLookup
  };
  fs.writeFileSync(path.join(DATA_DIR, 'dld-price-lookup.json'), JSON.stringify(lookupOutput, null, 2));
  console.log(`✅ Saved live lookup table: ${Object.keys(liveLookup.projectSize).length} project+size, ${Object.keys(liveLookup.district).length} district groups`);

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
      evalLevel: evalResult.level, 
      evalCount: evalResult.count,
      gisScore: evalResult.gisScore ?? null,
      gisMultiplier: evalResult.gisMultiplier || 1,
      viewMultiplier: evalResult.viewMultiplier || 1,
      viewTypes: evalResult.viewTypes || [],
      calibrationConfigId: evalResult.calibrationId,
      valuationMethods: evalResult.methodResults,
      calibrationAssumptions: evalResult.assumptions
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
      version: '22.1.0', 
      lastUpdated: new Date().toISOString(), 
      totalRecords: allResults.length, 
      methodology: 'v22.1 Calibrated with Mean + optimized multipliers', 
      dataSource: 'DLD + Consultancy + Government + GIS',
      accuracyScope: 'verified-dld-only',
      comparison: 'AQAR vs actual sale price',
      calibrationConfigId: ACTIVE_CALIBRATION.configId || 'base-22.1',
      dataType: usingEnriched ? 'enriched' : 'basic',
      calibration: ACTIVE_CALIBRATION,
      dldCleaning: DLD_CLEANING_REPORT
        ? {
            sourceChecksum: DLD_CLEANING_REPORT.sourceChecksum,
            recordsRead: DLD_CLEANING_REPORT.recordsRead,
            eligible: DLD_CLEANING_REPORT.eligible,
            rejected: DLD_CLEANING_REPORT.rejected,
            skipped: DLD_CLEANING_REPORT.skipped,
            duplicateTransactionIds: DLD_CLEANING_REPORT.duplicateTransactionIds
          }
        : null
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
      evalLevel: evalResult.level, 
      evalCount: evalResult.count,
      gisScore: evalResult.gisScore ?? null,
      gisMultiplier: evalResult.gisMultiplier || 1,
      viewMultiplier: evalResult.viewMultiplier || 1,
      viewTypes: evalResult.viewTypes || [],
      calibrationConfigId: evalResult.calibrationId,
      valuationMethods: evalResult.methodResults,
      calibrationAssumptions: evalResult.assumptions
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
      version: '22.1.0', 
      lastUpdated: new Date().toISOString(), 
      totalRecords: evalResults.length, 
      methodology: 'v22.1 Calibrated with Mean + optimized multipliers', 
      dataSource: 'DLD + Consultancy + Government + GIS',
      accuracyScope: 'verified-dld-only',
      comparison: 'AQAR vs actual sale price',
      calibrationConfigId: ACTIVE_CALIBRATION.configId || 'base-22.1',
      dataType: usingEnriched ? 'enriched' : 'basic',
      calibration: ACTIVE_CALIBRATION,
      dldCleaning: DLD_CLEANING_REPORT
        ? {
            sourceChecksum: DLD_CLEANING_REPORT.sourceChecksum,
            recordsRead: DLD_CLEANING_REPORT.recordsRead,
            eligible: DLD_CLEANING_REPORT.eligible,
            rejected: DLD_CLEANING_REPORT.rejected,
            skipped: DLD_CLEANING_REPORT.skipped,
            duplicateTransactionIds: DLD_CLEANING_REPORT.duplicateTransactionIds
          }
        : null
    }, 
    metrics: evalMetrics, 
    records: evalResults 
  };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(evalOutput, null, 2));

  console.log(`\n📊 120-Day (from Feb): ${evalResults.length} records | ${evalAvgAcc}% | ±${evalAvgDev}% | GIS available: ${evalGisAvailable} | GIS applied: ${evalGisApplied} | View applied: ${evalViewApplied}`);
  console.log(`📊 Full Market: ${allResults.length} records | ${allAvgAcc}% | GIS available: ${gisAvailableCount} | GIS applied: ${gisAppliedCount} | View applied: ${viewAppliedCount}`);
  
  // ===== GIS IMPACT ANALYSIS (مع تحليل الأخطاء) =====
  const withGis = allResults.filter(r => r.gisMultiplier && r.gisMultiplier !== 1);
  const withoutGis = allResults.filter(r => !r.gisMultiplier || r.gisMultiplier === 1);

  if (withGis.length > 0) {
    console.log('\n📊 GIS Impact Analysis:');
    const withGisAcc = Math.round(withGis.reduce((s, r) => s + (100 - Math.abs(r.aqarVsActual)), 0) / withGis.length * 10) / 10;
    console.log(`   With GIS applied (n=${withGis.length}): ${withGisAcc}% accuracy`);
    
    // تحليل الانحياز (bias)
    const withGisBias = Math.round(withGis.reduce((s, r) => s + (r.aqarVsActual || 0), 0) / withGis.length * 10) / 10;
    console.log(`   Mean signed error (bias): ${withGisBias}%`);
    console.log(`   Mean absolute error: ${Math.round(100 - withGisAcc)}%`);
  }
  if (withoutGis.length > 0) {
    const withoutGisAcc = Math.round(withoutGis.reduce((s, r) => s + (100 - Math.abs(r.aqarVsActual)), 0) / withoutGis.length * 10) / 10;
    console.log(`   Without GIS (n=${withoutGis.length}): ${withoutGisAcc}% accuracy`);
    const withoutGisBias = Math.round(withoutGis.reduce((s, r) => s + (r.aqarVsActual || 0), 0) / withoutGis.length * 10) / 10;
    console.log(`   Mean signed error (bias): ${withoutGisBias}%`);
  }

  // تحليل تفصيلي حسب درجة القرب
  console.log('\n📊 GIS Breakdown by Score:');
  const gisGroups = {};
  allResults.forEach(r => {
    const score = r.gisScore !== undefined && r.gisScore !== null ? r.gisScore : 'no_gis';
    if (!gisGroups[score]) gisGroups[score] = [];
    gisGroups[score].push(r);
  });
  Object.entries(gisGroups).sort((a, b) => {
    if (a[0] === 'no_gis') return 1;
    if (b[0] === 'no_gis') return -1;
    return parseFloat(a[0]) - parseFloat(b[0]);
  }).forEach(([score, records]) => {
    const acc = Math.round(records.reduce((s, r) => s + (100 - Math.abs(r.aqarVsActual)), 0) / records.length * 10) / 10;
    const bias = Math.round(records.reduce((s, r) => s + (r.aqarVsActual || 0), 0) / records.length * 10) / 10;
    const label = score === 'no_gis' ? 'No GIS' : `GIS = ${score}`;
    console.log(`   ${label} (n=${records.length}): ${acc}% accuracy, bias: ${bias}%`);
  });

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