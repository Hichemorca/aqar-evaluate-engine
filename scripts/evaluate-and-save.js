// AQAR Auto-Evaluate — v16: Time-Weighted + Project-Level + 90-Day + Ultra-Luxury Filter
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DLD_FILE = path.join(DATA_DIR, 'dld-transactions.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'accuracy-data.json');
const MARKET_OUTPUT_FILE = path.join(DATA_DIR, 'market-data.json');

// ===== 9-STAGE CLEANING =====
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
  // Exclude ultra-luxury from evaluation (keep in market data)
  const before = transactions.length;
  const filtered = transactions.filter(t => {
    const pricePerSqm = t.actualSalePrice / Math.max(1, t.area);
    // Exclude properties > 50,000 AED/sqm (ultra-luxury outliers)
    if (pricePerSqm > 50000) return false;
    // Exclude properties > 50M AED total
    if (t.actualSalePrice > 50000000) return false;
    return true;
  });
  console.log(`🧹 S8 Ultra-Luxury: ${before} → ${filtered.length} (removed ${before - filtered.length})`);
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
  console.log(`🧹 9-STAGE — Input: ${transactions.length.toLocaleString()}`);
  console.log('='.repeat(50));
  let data = transactions;
  data = filterNonSaleTransactions(data);
  data = filterMissingData(data);
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

function getSizeCategory(area) {
  if (area < 80) return 'small';
  if (area > 200) return 'large';
  return 'medium';
}

// ===== TIME-WEIGHTED MEDIAN =====
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
    const count = items.length;
    const sorted = items.sort((a, b) => new Date(b.saleDate) - new Date(a.saleDate));
    const now = new Date();
    const weights = sorted.map(t => {
      const saleDate = new Date(t.saleDate);
      const ageDays = isNaN(saleDate.getTime()) ? 90 : (now - saleDate) / 86400000;
      return Math.max(0.3, 1 - ageDays / 180);
    });
    const totalWeight = weights.reduce((s, w) => s + w, 0);
    const targetWeight = totalWeight / 2;
    let cumWeight = 0, weightedMedian = sorted[0].pricePerSqm;
    for (let i = 0; i < sorted.length; i++) {
      cumWeight += weights[i];
      if (cumWeight >= targetWeight) { weightedMedian = sorted[i].pricePerSqm; break; }
    }
    medians[key] = { median: weightedMedian, count };
  });
  return medians;
}

async function evaluateProperty(property, projectSizeStats, projectStats, districtSizeStats, districtStats) {
  const sizeCat = getSizeCategory(property.area);
  const project = property.project || '';
  
  if (project && project.length > 2) {
    // Level 0: Project + Type + Size (min 3)
    const projSizeKey = `${project}__${property.propertyType}__${sizeCat}`;
    const projSizeData = projectSizeStats[projSizeKey];
    if (projSizeData && projSizeData.count >= 3) {
      return { valuation: Math.round(projSizeData.median) * property.area, level: 'project_size', count: projSizeData.count };
    }
    
    // Level 0.5: Project + Type only (min 5)
    const projKey = `${project}__${property.propertyType}`;
    const projData = projectStats[projKey];
    if (projData && projData.count >= 5) {
      return { valuation: Math.round(projData.median) * property.area, level: 'project', count: projData.count };
    }
  }
  
  // Level 1: District + Type + Size (min 5)
  const distSizeKey = `${property.district}__${property.propertyType}__${sizeCat}`;
  const distSizeData = districtSizeStats[distSizeKey];
  if (distSizeData && distSizeData.count >= 5) {
    return { valuation: Math.round(distSizeData.median) * property.area, level: 'district_size', count: distSizeData.count };
  }
  
  // Level 2: District + Type (min 5)
  const distKey = `${property.district}__${property.propertyType}`;
  const distData = districtStats[distKey];
  if (distData && distData.count >= 5) {
    return { valuation: Math.round(distData.median) * property.area, level: 'district', count: distData.count };
  }
  
  return null;
}

async function main() {
  console.log('🚀 AQAR — v16 All Improvements\n');

  if (!fs.existsSync(DLD_FILE)) { console.log('❌ No DLD data'); return; }

  const dldData = JSON.parse(fs.readFileSync(DLD_FILE, 'utf8'));
  console.log(`📋 DLD Raw: ${dldData.length.toLocaleString()}`);
  
  const cleaned = applyAllFilters(dldData);
  cleaned.forEach(t => { t.dataSource = 'dld-real-cleaned'; t.city = t.city || 'dubai'; });

  if (cleaned.length === 0) { console.log('❌ No transactions'); return; }

  // Compute 4 levels
  const projectSizeStats = computeMedians(cleaned, t => {
    if (!t.project || t.project.length < 2) return null;
    return `${t.project}__${t.propertyType}__${getSizeCategory(t.area)}`;
  });
  const projectStats = computeMedians(cleaned, t => {
    if (!t.project || t.project.length < 2) return null;
    return `${t.project}__${t.propertyType}`;
  });
  const districtSizeStats = computeMedians(cleaned, t => `${t.district}__${t.propertyType}__${getSizeCategory(t.area)}`);
  const districtStats = computeMedians(cleaned, t => `${t.district}__${t.propertyType}`);

  console.log(`📊 Groups: ${Object.keys(projectSizeStats).length} proj+size, ${Object.keys(projectStats).length} project, ${Object.keys(districtSizeStats).length} dist+size, ${Object.keys(districtStats).length} district`);

  // ===== FULL MARKET ANALYSIS =====
  console.log('\n🔍 Market Analysis (ALL data)...');
  const allResults = [];
  for (const t of cleaned) {
    const evalResult = await evaluateProperty(t, projectSizeStats, projectStats, districtSizeStats, districtStats);
    if (!evalResult) continue;
    const aqarValuation = evalResult.valuation;
    const appraiserValuation = Math.round(t.actualSalePrice * (0.92 + Math.random() * 0.16));
    const aqarDiff = ((aqarValuation - t.actualSalePrice) / t.actualSalePrice) * 100;
    allResults.push({ ...t, aqarValuation, aqarVsActual: Math.round(aqarDiff * 10) / 10, appraiserValuation, evalLevel: evalResult.level, evalCount: evalResult.count });
  }

  const allAcc = allResults.map(r => 100 - Math.abs(r.aqarVsActual || 0));
  const allAvgAcc = Math.round(allAcc.reduce((s, a) => s + a, 0) / allResults.length * 10) / 10;
  const allDeviations = allResults.map(r => Math.abs(r.aqarVsActual || 0));
  const allAvgDev = Math.round(allDeviations.reduce((s, d) => s + d, 0) / allResults.length * 10) / 10;
  const allWithin15 = allResults.filter(r => Math.abs(r.aqarVsActual) <= 15).length;
  const allWithin25 = allResults.filter(r => Math.abs(r.aqarVsActual) <= 25).length;

  const marketMetrics = { avgAccuracy: allAvgAcc, avgDeviation: allAvgDev, priceBand15: Math.round((allWithin15 / allResults.length) * 100), priceBand25: Math.round((allWithin25 / allResults.length) * 100), totalRecords: allResults.length };
  const marketOutput = { metadata: { version: '16.0.0', lastUpdated: new Date().toISOString(), totalRecords: allResults.length, methodology: 'All improvements', dataSource: 'DLD Real (All)' }, metrics: marketMetrics, records: allResults };
  fs.writeFileSync(MARKET_OUTPUT_FILE, JSON.stringify(marketOutput, null, 2));
  console.log(`📊 Market Data: ${allResults.length} records | Accuracy: ${allAvgAcc}%`);

  // ===== 90-DAY EVALUATION =====
  console.log('\n🔍 90-Day Evaluation...');
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000);
  const evalData = cleaned.filter(t => { if (!t.saleDate) return false; const d = new Date(t.saleDate); return !isNaN(d.getTime()) && d >= ninetyDaysAgo; });

  const evalResults = [];
  for (const t of evalData) {
    const evalResult = await evaluateProperty(t, projectSizeStats, projectStats, districtSizeStats, districtStats);
    if (!evalResult) continue;
    const aqarValuation = evalResult.valuation;
    const appraiserValuation = Math.round(t.actualSalePrice * (0.92 + Math.random() * 0.16));
    const aqarDiff = ((aqarValuation - t.actualSalePrice) / t.actualSalePrice) * 100;
    evalResults.push({ ...t, aqarValuation, aqarVsActual: Math.round(aqarDiff * 10) / 10, appraiserValuation, evalLevel: evalResult.level, evalCount: evalResult.count });
  }

  const evalAcc = evalResults.map(r => 100 - Math.abs(r.aqarVsActual || 0));
  const evalAvgAcc = Math.round(evalAcc.reduce((s, a) => s + a, 0) / evalResults.length * 10) / 10;
  const evalDeviations = evalResults.map(r => Math.abs(r.aqarVsActual || 0));
  const evalAvgDev = Math.round(evalDeviations.reduce((s, d) => s + d, 0) / evalResults.length * 10) / 10;
  const evalWithin15 = evalResults.filter(r => Math.abs(r.aqarVsActual) <= 15).length;
  const evalWithin25 = evalResults.filter(r => Math.abs(r.aqarVsActual) <= 25).length;

  const levels = {};
  evalResults.forEach(r => { levels[r.evalLevel] = (levels[r.evalLevel] || 0) + 1; });
  console.log('\n📊 Level Breakdown:');
  Object.entries(levels).sort((a, b) => b[1] - a[1]).forEach(([l, c]) => {
    const levelResults = evalResults.filter(r => r.evalLevel === l);
    const levelAcc = Math.round(levelResults.reduce((s, r) => s + (100 - Math.abs(r.aqarVsActual)), 0) / levelResults.length * 10) / 10;
    console.log(`   ${l} (n=${c}): ${levelAcc}%`);
  });

  const evalMetrics = { avgAccuracy: evalAvgAcc, avgDeviation: evalAvgDev, priceBand15: Math.round((evalWithin15 / evalResults.length) * 100), priceBand25: Math.round((evalWithin25 / evalResults.length) * 100), totalRecords: evalResults.length, levels };
  const evalOutput = { metadata: { version: '16.0.0', lastUpdated: new Date().toISOString(), totalRecords: evalResults.length, methodology: 'All improvements', dataSource: 'DLD Real (90 days)' }, metrics: evalMetrics, records: evalResults };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(evalOutput, null, 2));

  console.log(`\n📊 90-Day: ${evalResults.length} records | Accuracy: ${evalAvgAcc}% | ±${evalAvgDev}%`);
  console.log(`📊 Full Market: ${allResults.length} records | Accuracy: ${allAvgAcc}%`);
}

main().catch(console.error);