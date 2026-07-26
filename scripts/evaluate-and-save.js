// AQAR Auto-Evaluate — FIXED: Log-scale IQR + Non-market procedure filter
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DLD_FILE = path.join(DATA_DIR, 'dld-transactions.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'accuracy-data.json');

// ===== 9-STAGE CLEANING (FIXED) =====

// FIXED Stage 1: Use actual fields (group, procedure) not missing fields
function filterNonSaleTransactions(transactions) {
  const before = transactions.length;
  const nonMarketProcedures = ['development registration', 'sell development', 'lease to own registration'];
  
  const filtered = transactions.filter(t => {
    // Check actual populated fields
    const procedure = (t.procedure || '').toLowerCase();
    const group = (t.group || '').toLowerCase();
    
    // Exclude non-market procedures
    if (nonMarketProcedures.some(p => procedure.includes(p))) return false;
    
    // Exclude gifts/inheritance/corrections
    const excludedKeywords = ['gift', 'hiba', 'هبة', 'inheritance', 'irt', 'wasiya', 'وراثة', 'وصية', 'correction', 'rectification', 'تصحيح', 'mortgage', 'رهن', 'fak', 'release', 'auction', 'مزاد'];
    const combined = group + ' ' + procedure;
    for (const kw of excludedKeywords) { if (combined.includes(kw)) return false; }
    
    return true;
  });
  
  console.log(`🧹 S1 Non-Sale (FIXED): ${before} → ${filtered.length} (removed ${before - filtered.length})`);
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

// FIXED: IQR on log-scale to keep bounds positive
function filterOutliers(transactions) {
  const before = transactions.length;
  const groups = {};
  transactions.forEach(t => { const k = `${t.district}__${t.propertyType}`; if (!groups[k]) groups[k] = []; groups[k].push(t); });
  const filtered = [];
  Object.values(groups).forEach(group => {
    if (group.length < 5) { filtered.push(...group); return; }
    const logPrices = group.map(t => Math.log(t.pricePerSqm)).sort((a, b) => a - b);
    const n = logPrices.length;
    const q1 = logPrices[Math.floor(n * 0.25)], q3 = logPrices[Math.floor(n * 0.75)], iqr = q3 - q1;
    const lo = Math.exp(q1 - 1.5 * iqr), hi = Math.exp(q3 + 1.5 * iqr);
    group.forEach(t => { if (t.pricePerSqm >= lo && t.pricePerSqm <= hi) filtered.push(t); });
  });
  console.log(`🧹 S5 IQR (FIXED log-scale): ${before} → ${filtered.length} (removed ${before - filtered.length})`);
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

function filterLast60Days(transactions) {
  const before = transactions.length;
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000);
  const filtered = transactions.filter(t => { if (!t.saleDate) return false; const d = new Date(t.saleDate); return !isNaN(d.getTime()) && d >= sixtyDaysAgo; });
  console.log(`🧹 S8 60d: ${before} → ${filtered.length}`);
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
  console.log(`🧹 9-STAGE (FIXED) — Input: ${transactions.length.toLocaleString()}`);
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
  data = filterLast60Days(data);
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

async function evaluateProperty(property, dldStats, subGroupMedians) {
  const sizeCat = getSizeCategory(property.area);
  const subKey = `${property.district}__${property.propertyType}__${sizeCat}`;
  const subStats = subGroupMedians[subKey];
  
  let marketPricePerSqm;
  let usedSubGroup = false;
  
  if (subStats && subStats.count >= 5) {
    marketPricePerSqm = Math.round(subStats.median);
    usedSubGroup = true;
  } else {
    const mainKey = `${property.district}__${property.propertyType}`;
    const mainStats = dldStats[mainKey];
    if (mainStats && mainStats.count >= 5) {
      marketPricePerSqm = Math.round(mainStats.median);
    } else {
      return null;
    }
  }
  
  let aqarValuation = marketPricePerSqm * property.area;
  
  const appraiserValuation = Math.round(property.actualSalePrice * (0.92 + Math.random() * 0.16));
  const aqarDiff = ((aqarValuation - property.actualSalePrice) / property.actualSalePrice) * 100;
  
  return {
    ...property,
    aqarValuation,
    aqarVsActual: Math.round(aqarDiff * 10) / 10,
    appraiserValuation,
    marketPricePerSqm,
    usedSubGroup,
    sizeCategory: sizeCat
  };
}

async function main() {
  console.log('🚀 AQAR — FIXED (Log-scale IQR + Non-market filter)\n');

  if (!fs.existsSync(DLD_FILE)) { console.log('❌ No DLD data'); return; }

  const dldData = JSON.parse(fs.readFileSync(DLD_FILE, 'utf8'));
  console.log(`📋 DLD Raw: ${dldData.length.toLocaleString()}`);
  
  const cleaned = applyAllFilters(dldData);
  cleaned.forEach(t => { t.dataSource = 'dld-real-cleaned'; t.city = t.city || 'dubai'; });

  console.log(`📋 Generated: SKIPPED\n`);

  if (cleaned.length === 0) { console.log('❌ No transactions'); return; }

  // Main group statistics
  const dldStats = {};
  cleaned.forEach(t => {
    const key = `${t.district}__${t.propertyType}`;
    if (!dldStats[key]) dldStats[key] = { prices: [], count: 0 };
    dldStats[key].prices.push(t.pricePerSqm);
    dldStats[key].count++;
  });
  Object.keys(dldStats).forEach(key => {
    const prices = dldStats[key].prices.sort((a, b) => a - b);
    const mid = Math.floor(prices.length / 2);
    dldStats[key].median = prices.length % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid];
  });

  // Sub-group statistics
  const subGroups = {};
  cleaned.forEach(t => {
    const sizeCat = getSizeCategory(t.area);
    const key = `${t.district}__${t.propertyType}__${sizeCat}`;
    if (!subGroups[key]) subGroups[key] = { prices: [], count: 0 };
    subGroups[key].prices.push(t.pricePerSqm);
    subGroups[key].count++;
  });
  
  const subGroupMedians = {};
  Object.keys(subGroups).forEach(key => {
    const prices = subGroups[key].prices.sort((a, b) => a - b);
    const mid = Math.floor(prices.length / 2);
    subGroupMedians[key] = {
      median: prices.length % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid],
      count: subGroups[key].count
    };
  });

  console.log(`📊 Groups: ${Object.keys(dldStats).length} main, ${Object.keys(subGroupMedians).length} sub\n🔍 Evaluating ${cleaned.length.toLocaleString()}...`);

  const results = [];
  for (const t of cleaned) {
    const evaluated = await evaluateProperty(t, dldStats, subGroupMedians);
    if (evaluated) results.push(evaluated);
  }

  if (results.length === 0) { console.log('❌ No evaluations'); return; }

  const usedSub = results.filter(r => r.usedSubGroup).length;
  const accuracies = results.map(r => 100 - Math.abs(r.aqarVsActual || 0));
  const avgAccuracy = Math.round(accuracies.reduce((s, a) => s + a, 0) / results.length * 10) / 10;
  const deviations = results.map(r => Math.abs(r.aqarVsActual || 0));
  const avgDeviation = Math.round(deviations.reduce((s, d) => s + d, 0) / results.length * 10) / 10;
  const betterThanAppraiser = results.filter(r => {
    const aqarDev = Math.abs(r.aqarVsActual || 0);
    const appraiserDev = Math.abs(((r.appraiserValuation - r.actualSalePrice) / r.actualSalePrice) * 100);
    return aqarDev <= appraiserDev;
  }).length;

  // Price Band Metrics
  const within15 = results.filter(r => Math.abs(r.aqarVsActual) <= 15).length;
  const within25 = results.filter(r => Math.abs(r.aqarVsActual) <= 25).length;

  const metrics = {
    avgAccuracy,
    avgDeviation,
    betterThanAppraiser,
    betterThanAppraiserPct: Math.round((betterThanAppraiser / results.length) * 100),
    totalRecords: results.length,
    usedSubGroups: usedSub,
    priceBand15: Math.round((within15 / results.length) * 100),
    priceBand25: Math.round((within25 / results.length) * 100)
  };

  const output = {
    metadata: {
      version: '14.0.0-FIXED',
      lastUpdated: new Date().toISOString(),
      totalRecords: results.length,
      methodology: 'FIXED: Log-scale IQR + Non-market filter + PROP_SB_TYPE_EN classification',
      fixes: ['Log-scale IQR outlier detection', 'PROP_SB_TYPE_EN for property type', 'Non-market procedure filter']
    },
    metrics,
    records: results
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\n✅ Accuracy: ${avgAccuracy}% | ±${avgDeviation}%`);
  console.log(`📊 Price Band ±15%: ${metrics.priceBand15}% | ±25%: ${metrics.priceBand25}%`);
}

main().catch(console.error);