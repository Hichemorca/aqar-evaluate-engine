// ============================================================
// AQAR CLEANING PIPELINE - Shared across all modules
// ============================================================
// This is the SINGLE SOURCE OF TRUTH for all cleaning functions.
// DO NOT duplicate these functions anywhere else.
// Import this module instead.
// ============================================================

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

// ===== 10-STAGE CLEANING =====
function filterNonSaleTransactions(transactions) {
  const nonMarketProcedures = ['development registration', 'sell development', 'lease to own registration'];
  const excludedKeywords = ['gift', 'hiba', 'inheritance', 'irt', 'wasiya', 'correction', 'rectification', 'mortgage', 'رهن', 'auction', 'مزاد'];
  return transactions.filter(t => {
    const procedure = (t.procedure || '').toLowerCase();
    const group = (t.group || '').toLowerCase();
    if (nonMarketProcedures.some(p => procedure.includes(p))) return false;
    const combined = group + ' ' + procedure;
    for (const kw of excludedKeywords) { if (combined.includes(kw)) return false; }
    return true;
  });
}

function filterMissingData(transactions) {
  return transactions.filter(t => 
    t.district && t.district !== 'Unknown' && 
    t.propertyType && t.propertyType !== 'Unknown' && 
    t.area > 0 && t.actualSalePrice > 0
  );
}

function filterAreaMismatch(transactions) {
  return transactions.filter(t => {
    if (t.procedureArea && t.procedureArea > 0) {
      const ratio = t.area / t.procedureArea;
      return ratio >= 0.5 && ratio <= 2.0;
    }
    return true;
  });
}

function filterInvalidAreas(transactions) {
  const limits = { 
    apartment: { min: 30, max: 1000 }, 
    villa: { min: 100, max: 5000 }, 
    townhouse: { min: 80, max: 2000 }, 
    office: { min: 30, max: 10000 }, 
    retail: { min: 20, max: 5000 }, 
    warehouse: { min: 100, max: 50000 }, 
    land: { min: 100, max: 100000 } 
  };
  return transactions.filter(t => { 
    const l = limits[t.propertyType] || { min: 30, max: 5000 }; 
    return t.area >= l.min && t.area <= l.max; 
  });
}

function filterInvalidPrices(transactions) {
  transactions.forEach(t => { t.pricePerSqm = t.actualSalePrice / Math.max(1, t.area); });
  return transactions.filter(t => t.pricePerSqm > 0);
}

function filterOutliers(transactions) {
  const groups = {};
  transactions.forEach(t => { 
    const k = `${t.district}__${t.propertyType}`; 
    if (!groups[k]) groups[k] = []; 
    groups[k].push(t); 
  });
  const filtered = [];
  Object.values(groups).forEach(group => {
    if (group.length < 5) { filtered.push(...group); return; }
    const logPrices = group.map(t => Math.log(t.pricePerSqm)).sort((a, b) => a - b);
    const n = logPrices.length, q1 = logPrices[Math.floor(n * 0.25)], q3 = logPrices[Math.floor(n * 0.75)], iqr = q3 - q1;
    const lo = Math.exp(q1 - 1.5 * iqr), hi = Math.exp(q3 + 1.5 * iqr);
    group.forEach(t => { if (t.pricePerSqm >= lo && t.pricePerSqm <= hi) filtered.push(t); });
  });
  return filtered;
}

function filterReadyOnly(transactions) {
  return transactions.filter(t => {
    if (t.isOffPlan === true) return false;
    const status = (t.status || t.projectStatus || '').toLowerCase();
    return !status.includes('off-plan') && 
           !status.includes('offplan') && 
           !status.includes('under construction') && 
           !status.includes('launched');
  });
}

function filterDuplicates(transactions) {
  const seen = new Set();
  return transactions.filter(t => {
    if (t.propertyRef && seen.has(t.propertyRef)) return false;
    if (t.propertyRef) seen.add(t.propertyRef);
    const key = `${t.district}__${t.area}__${Math.round(t.actualSalePrice / 1000)}__${t.saleDate}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function filterUltraLuxury(transactions) {
  return transactions.filter(t => {
    const pricePerSqm = t.actualSalePrice / Math.max(1, t.area);
    return pricePerSqm <= 50000 && t.actualSalePrice <= 50000000;
  });
}

function validateGroupCounts(transactions) {
  const groups = {};
  transactions.forEach(t => { 
    const k = `${t.district}__${t.propertyType}`; 
    if (!groups[k]) groups[k] = []; 
    groups[k].push(t); 
  });
  const filtered = [];
  Object.entries(groups).forEach(([k, g]) => { if (g.length >= 3) filtered.push(...g); });
  return filtered;
}

function applyAllFilters(transactions) {
  console.log(`🧹 Cleaning: ${transactions.length} input`);
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
  console.log(`✅ Cleaned: ${data.length} transactions`);
  return data;
}

// ===== EXPORT =====
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getSizeCategory,
    applyAllFilters
  };
}