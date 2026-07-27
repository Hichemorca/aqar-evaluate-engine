// AQAR Market Intelligence Engine v1.0
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const INPUT_FILE = path.join(DATA_DIR, 'dld-transactions.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'market-intelligence.json');

function loadData() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.log('❌ No DLD data found');
    return [];
  }
  return JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
}

function analyzeMarket(data) {
  const results = {
    generatedAt: new Date().toISOString(),
    totalTransactions: data.length,
    
    // 1. Best Investment Districts
    bestInvestmentDistricts: [],
    
    // 2. Fastest Growing Areas
    fastestGrowing: [],
    
    // 3. High Risk Areas (Bubble Risk)
    highRiskAreas: [],
    
    // 4. Recovery Zones
    recoveryZones: [],
    
    // 5. Market Liquidity
    liquidityIndex: [],
    
    // 6. Buyer vs Seller Strength
    buyerSellerIndex: [],
    
    // 7. Overall Market Indicators
    marketIndicators: {}
  };

  // Group by district
  const districts = {};
  data.forEach(t => {
    const d = t.district || 'Unknown';
    if (!districts[d]) districts[d] = [];
    districts[d].push(t);
  });

  // Calculate metrics per district
  const districtMetrics = [];
  
  Object.entries(districts).forEach(([district, transactions]) => {
    if (transactions.length < 30) return; // Skip districts with fewer than 30 transactions
    
    const prices = transactions.map(t => t.actualSalePrice / t.area);
    const median = prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)];
    const avg = prices.reduce((s, p) => s + p, 0) / prices.length;
    
    // Price momentum (compare last 30 days vs previous 30 days)
    const now = new Date();
    const thirtyDaysAgo = new Date(now - 30 * 86400000);
    const sixtyDaysAgo = new Date(now - 60 * 86400000);
    
    const recent = transactions.filter(t => new Date(t.saleDate) >= thirtyDaysAgo);
    const older = transactions.filter(t => {
      const d = new Date(t.saleDate);
      return d >= sixtyDaysAgo && d < thirtyDaysAgo;
    });
    
    const recentMedian = recent.length > 0 
      ? recent.map(t => t.actualSalePrice / t.area).sort((a, b) => a - b)[Math.floor(recent.length / 2)]
      : median;
    
    const olderMedian = older.length > 0
      ? older.map(t => t.actualSalePrice / t.area).sort((a, b) => a - b)[Math.floor(older.length / 2)]
      : median;
    
    const momentum = olderMedian > 0 ? ((recentMedian - olderMedian) / olderMedian) * 100 : 0;
    
    // Volatility
    const stdDev = Math.sqrt(prices.reduce((s, p) => s + Math.pow(p - avg, 2), 0) / prices.length);
    const volatility = (stdDev / median) * 100;
    
    // Transaction count
    const totalCount = transactions.length;
    const recentCount = recent.length;
    
    // Activity ratio (recent vs total)
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

  // Sort and categorize
  districtMetrics.sort((a, b) => b.transactionCount - a.transactionCount);
  // Filter out extreme outliers (districts with < 30 transactions or > 500% momentum)
districtMetrics = districtMetrics.filter(d => 
  d.transactionCount >= 30 && 
  Math.abs(d.priceMomentum) < 200 && 
  d.volatility < 200
);
  // Best Investment Districts (high momentum + high activity + moderate volatility)
  results.bestInvestmentDistricts = districtMetrics
    .filter(d => d.priceMomentum > 2 && d.volatility < 25 && d.transactionCount > 20)
    .sort((a, b) => b.priceMomentum - a.priceMomentum)
    .slice(0, 10)
    .map(d => ({
      ...d,
      investmentScore: Math.round((d.priceMomentum * 3 + d.activityRatio - d.volatility * 0.5) * 10) / 10
    }));

  // Fastest Growing (highest momentum)
  results.fastestGrowing = districtMetrics
    .filter(d => d.transactionCount > 10)
    .sort((a, b) => b.priceMomentum - a.priceMomentum)
    .slice(0, 10);

  // High Risk / Bubble Risk (high volatility + high momentum + high prices)
  results.highRiskAreas = districtMetrics
    .filter(d => d.volatility > 20 && d.priceMomentum > 3)
    .sort((a, b) => b.volatility - a.volatility)
    .slice(0, 10)
    .map(d => ({
      ...d,
      bubbleRiskScore: Math.round((d.volatility * 2 + Math.abs(d.priceMomentum) * 2) * 10) / 10
    }));

  // Recovery Zones (was negative, now positive momentum)
  results.recoveryZones = districtMetrics
    .filter(d => d.priceMomentum > 1 && d.priceMomentum < 5 && d.volatility < 20)
    .sort((a, b) => a.priceMomentum - b.priceMomentum)
    .slice(0, 10);

  // Liquidity Index (based on transaction count and activity)
  results.liquidityIndex = districtMetrics
    .sort((a, b) => b.transactionCount - a.transactionCount)
    .slice(0, 15)
    .map(d => ({
      district: d.district,
      transactionCount: d.transactionCount,
      liquidityScore: Math.round((d.transactionCount / 100) * 10) / 10
    }));

  // Buyer vs Seller Strength
  const buyerSellerRatio = districtMetrics.map(d => ({
    district: d.district,
    activityRatio: d.activityRatio,
    marketCondition: d.priceMomentum > 5 ? 'Seller Market' : 
                     d.priceMomentum < -2 ? 'Buyer Market' : 'Balanced',
    strength: d.priceMomentum > 5 ? 'Sellers' : d.priceMomentum < -2 ? 'Buyers' : 'Neutral'
  }));
  
  results.buyerSellerIndex = buyerSellerRatio;

  // Overall Market Indicators
  const allMomentum = districtMetrics.map(d => d.priceMomentum);
  const avgMomentum = allMomentum.reduce((s, m) => s + m, 0) / allMomentum.length;
  
  results.marketIndicators = {
    averagePriceMomentum: Math.round(avgMomentum * 10) / 10,
    totalActiveDistricts: districtMetrics.length,
    totalTransactions: data.length,
    marketCondition: avgMomentum > 3 ? 'Strong Seller Market' :
                     avgMomentum > 1 ? 'Moderate Seller Market' :
                     avgMomentum > -1 ? 'Balanced Market' :
                     avgMomentum > -3 ? 'Moderate Buyer Market' : 'Strong Buyer Market',
    topPerformer: results.fastestGrowing[0]?.district || 'N/A',
    mostLiquid: results.liquidityIndex[0]?.district || 'N/A',
    highestRisk: results.highRiskAreas[0]?.district || 'N/A'
  };

  return results;
}

function main() {
  console.log('🚀 AQAR Market Intelligence Engine v1.0\n');
  
  const data = loadData();
  if (data.length === 0) {
    console.log('❌ No data to analyze');
    return;
  }
  
  console.log(`📊 Analyzing ${data.length.toLocaleString()} transactions...`);
  
  const intelligence = analyzeMarket(data);
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(intelligence, null, 2));
  
  console.log('\n📊 MARKET INTELLIGENCE REPORT');
  console.log('='.repeat(50));
  console.log(`\n📈 Market Condition: ${intelligence.marketIndicators.marketCondition}`);
  console.log(`📊 Avg Price Momentum: ${intelligence.marketIndicators.averagePriceMomentum}%`);
  console.log(`🏆 Top Performer: ${intelligence.marketIndicators.topPerformer}`);
  console.log(`💧 Most Liquid: ${intelligence.marketIndicators.mostLiquid}`);
  console.log(`⚠️ Highest Risk: ${intelligence.marketIndicators.highestRisk}`);
  
  console.log('\n📋 Top 5 Investment Districts:');
  intelligence.bestInvestmentDistricts.slice(0, 5).forEach((d, i) => {
    console.log(`   ${i+1}. ${d.district} — Score: ${d.investmentScore} (Momentum: ${d.priceMomentum}%)`);
  });
  
  console.log('\n📋 Top 5 Fastest Growing:');
  intelligence.fastestGrowing.slice(0, 5).forEach((d, i) => {
    console.log(`   ${i+1}. ${d.district} — ${d.priceMomentum}% growth`);
  });
  
  console.log('\n⚠️ Top 5 High Risk Areas:');
  intelligence.highRiskAreas.slice(0, 5).forEach((d, i) => {
    console.log(`   ${i+1}. ${d.district} — Bubble Risk: ${d.bubbleRiskScore} (Volatility: ${d.volatility}%)`);
  });
  
  console.log(`\n✅ Saved to ${OUTPUT_FILE}`);
}

try {
  main();
} catch(e) {
  console.error(e);
}