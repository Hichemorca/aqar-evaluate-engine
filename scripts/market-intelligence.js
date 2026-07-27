// AQAR Market Intelligence Engine v2.0 — Unified Cleaning
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const INPUT_FILE = path.join(DATA_DIR, 'dld-transactions.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'market-intelligence.json');

function cleanData(data) {
  // Same 9-stage cleaning as evaluate-and-save.js
  const nonMarketProcedures = ['development registration', 'sell development', 'lease to own registration'];
  
  let cleaned = data.filter(t => {
    const procedure = (t.procedure || '').toLowerCase();
    if (nonMarketProcedures.some(p => procedure.includes(p))) return false;
    if (!t.district || t.district === 'Unknown') return false;
    if (!t.propertyType || t.propertyType === 'Unknown') return false;
    if (!t.area || t.area <= 0) return false;
    if (!t.actualSalePrice || t.actualSalePrice <= 0) return false;
    if (t.isOffPlan === true) return false;
    return true;
  });

  // IQR on log-scale per district+type
  const groups = {};
  cleaned.forEach(t => {
    const k = `${t.district}__${t.propertyType}`;
    if (!groups[k]) groups[k] = [];
    groups[k].push(t);
  });

  const filtered = [];
  Object.values(groups).forEach(group => {
    if (group.length < 5) { filtered.push(...group); return; }
    const logPrices = group.map(t => Math.log(t.actualSalePrice / t.area)).sort((a, b) => a - b);
    const n = logPrices.length;
    const q1 = logPrices[Math.floor(n * 0.25)], q3 = logPrices[Math.floor(n * 0.75)], iqr = q3 - q1;
    const lo = Math.exp(q1 - 1.5 * iqr), hi = Math.exp(q3 + 1.5 * iqr);
    group.forEach(t => {
      const ppsm = t.actualSalePrice / t.area;
      if (ppsm >= lo && ppsm <= hi) filtered.push(t);
    });
  });

  return filtered;
}

function analyzeMarket(data) {
  const results = {
    generatedAt: new Date().toISOString(),
    totalTransactions: data.length,
    bestInvestmentDistricts: [],
    fastestGrowing: [],
    highRiskAreas: [],
    liquidityIndex: [],
    marketIndicators: {}
  };

  const districts = {};
  data.forEach(t => {
    const d = t.district || 'Unknown';
    if (!districts[d]) districts[d] = [];
    districts[d].push(t);
  });

  let districtMetrics = [];

  Object.entries(districts).forEach(([district, transactions]) => {
    if (transactions.length < 30) return;

    const prices = transactions.map(t => t.actualSalePrice / t.area);
    const median = prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)];
    const avg = prices.reduce((s, p) => s + p, 0) / prices.length;

    const now = new Date();
    const thirtyDaysAgo = new Date(now - 30 * 86400000);
    const sixtyDaysAgo = new Date(now - 60 * 86400000);

    const recent = transactions.filter(t => new Date(t.saleDate) >= thirtyDaysAgo);
    const older = transactions.filter(t => {
      const d = new Date(t.saleDate);
      return d >= sixtyDaysAgo && d < thirtyDaysAgo;
    });

    // Minimum sample per window
    if (recent.length < 15 || older.length < 15) return;

    const recentMedian = recent.map(t => t.actualSalePrice / t.area).sort((a, b) => a - b)[Math.floor(recent.length / 2)];
    const olderMedian = older.map(t => t.actualSalePrice / t.area).sort((a, b) => a - b)[Math.floor(older.length / 2)];

    const momentum = olderMedian > 0 ? ((recentMedian - olderMedian) / olderMedian) * 100 : 0;

    const stdDev = Math.sqrt(prices.reduce((s, p) => s + Math.pow(p - avg, 2), 0) / prices.length);
    const volatility = (stdDev / median) * 100;

    const totalCount = transactions.length;
    const recentCount = recent.length;
    const activityRatio = totalCount > 0 ? recentCount / totalCount : 0;

    districtMetrics.push({
      district,
      medianPricePerSqm: Math.round(median),
      transactionCount: totalCount,
      recentTransactions: recentCount,
      priceMomentum: Math.round(momentum * 10) / 10,
      volatility: Math.round(volatility * 10) / 10,
      activityRatio: Math.round(activityRatio * 100)
    });
  });

  districtMetrics = districtMetrics.filter(d =>
    d.transactionCount >= 30 &&
    Math.abs(d.priceMomentum) < 100 &&
    d.volatility < 100
  );

  districtMetrics.sort((a, b) => b.transactionCount - a.transactionCount);

  results.bestInvestmentDistricts = districtMetrics
    .filter(d => d.priceMomentum > 1 && d.volatility < 30 && d.transactionCount > 20)
    .sort((a, b) => b.priceMomentum - a.priceMomentum)
    .slice(0, 10)
    .map(d => ({ ...d, investmentScore: Math.round((d.priceMomentum * 2 + d.activityRatio - d.volatility * 0.3) * 10) / 10 }));

  results.fastestGrowing = districtMetrics
    .filter(d => d.transactionCount > 20)
    .sort((a, b) => b.priceMomentum - a.priceMomentum)
    .slice(0, 10);

  results.highRiskAreas = districtMetrics
    .filter(d => d.volatility > 25)
    .sort((a, b) => b.volatility - a.volatility)
    .slice(0, 10)
    .map(d => ({ ...d, bubbleRiskScore: Math.round(d.volatility * 2 * 10) / 10 }));

  results.liquidityIndex = districtMetrics
    .sort((a, b) => b.transactionCount - a.transactionCount)
    .slice(0, 15)
    .map(d => ({ district: d.district, transactionCount: d.transactionCount, liquidityScore: Math.round((d.transactionCount / 100) * 10) / 10 }));

  const allMomentum = districtMetrics.map(d => d.priceMomentum);
  const avgMomentum = allMomentum.reduce((s, m) => s + m, 0) / allMomentum.length;

  results.marketIndicators = {
    averagePriceMomentum: Math.round(avgMomentum * 10) / 10,
    totalActiveDistricts: districtMetrics.length,
    totalTransactions: data.length,
    marketCondition: avgMomentum > 3 ? 'Strong Seller Market' : avgMomentum > 1 ? 'Moderate Seller Market' : avgMomentum > -1 ? 'Balanced Market' : avgMomentum > -3 ? 'Moderate Buyer Market' : 'Strong Buyer Market',
    topPerformer: results.fastestGrowing[0]?.district || 'N/A',
    mostLiquid: results.liquidityIndex[0]?.district || 'N/A',
    highestRisk: results.highRiskAreas[0]?.district || 'N/A'
  };

  return results;
}

function main() {
  console.log('🚀 AQAR Market Intelligence Engine v2.0 (Unified Cleaning)\n');

  if (!fs.existsSync(INPUT_FILE)) { console.log('❌ No DLD data'); return; }

  const rawData = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  console.log(`📋 Raw: ${rawData.length.toLocaleString()}`);

  const data = cleanData(rawData);
  console.log(`📊 Cleaned: ${data.length.toLocaleString()}\n`);

  const intelligence = analyzeMarket(data);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(intelligence, null, 2));

  console.log('📊 MARKET INTELLIGENCE REPORT');
  console.log('='.repeat(50));
  console.log(`\n📈 Market Condition: ${intelligence.marketIndicators.marketCondition}`);
  console.log(`📊 Avg Price Momentum: ${intelligence.marketIndicators.averagePriceMomentum}%`);
  console.log(`🏆 Top Performer: ${intelligence.marketIndicators.topPerformer}`);
  console.log(`💧 Most Liquid: ${intelligence.marketIndicators.mostLiquid}`);

  console.log('\n📋 Top 5 Investment Districts:');
  intelligence.bestInvestmentDistricts.slice(0, 5).forEach((d, i) => {
    console.log(`   ${i + 1}. ${d.district} — Score: ${d.investmentScore} (Momentum: ${d.priceMomentum}%)`);
  });

  console.log('\n⚠️ Top 5 High Risk Areas:');
  intelligence.highRiskAreas.slice(0, 5).forEach((d, i) => {
    console.log(`   ${i + 1}. ${d.district} — Bubble Risk: ${d.bubbleRiskScore} (Volatility: ${d.volatility}%)`);
  });

  console.log(`\n✅ Saved to ${OUTPUT_FILE}`);
}

try { main(); } catch (e) { console.error(e); }