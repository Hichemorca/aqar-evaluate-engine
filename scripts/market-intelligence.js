// AQAR Market Intelligence Engine v3.0 — Scientific Review & Correction
//
// This version replaces the v2.0 engine's short-window, single-variable metrics
// with methodology that (a) uses the full available transaction history rather
// than a hard-coded 60-day snapshot, (b) builds Bubble Risk from multiple
// independent dimensions rather than one proxy, and (c) documents every
// weighting decision inline, per the AQAR Research Standards template.
//
// See the `methodology` block written into market-intelligence.json for the
// user-facing definition/calculation/variables/assumptions/limitations of
// every indicator below — this comment block is the code-level mirror of it.
//
// IMPORTANT DATA NOTE: as of this revision, the available DLD transaction
// history spans 2026-01-02 to 2026-07-26 — approximately 7 months, not the
// "~1 year" assumed in the correction brief. All windows below are computed
// dynamically from whatever history is actually present, so this engine will
// automatically use more months as more data accumulates without further
// code changes. Nothing here hard-codes "12 months."

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const INPUT_FILE = path.join(DATA_DIR, 'dld-transactions.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'market-intelligence.json');

// ---------------------------------------------------------------------------
// Thresholds (documented, not arbitrary — see methodology.assumptions in output)
// ---------------------------------------------------------------------------
const MIN_TOTAL_TRANSACTIONS = 30;   // minimum sample size for a district to be scored at all
const MIN_MONTHS_WITH_DATA = 4;      // minimum distinct months for a trend/volatility fit (need >2 for regression + slack for robustness)
const MIN_TXNS_PER_MONTH_BUCKET = 5; // a month-bucket with fewer than this is dropped before trend fitting (too noisy)
const RECENT_WINDOW_MONTHS = 3;      // "recent" sub-period used for acceleration comparison

// ---------------------------------------------------------------------------
// Cleaning (unchanged — the canonical pipeline; see
// AQAR Data Cleaning & Outlier Methodology v1.0)
// ---------------------------------------------------------------------------
function cleanData(data) {
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

// ---------------------------------------------------------------------------
// Statistical helpers
// ---------------------------------------------------------------------------
function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 === 1 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

function mean(arr) { return arr.reduce((s, v) => s + v, 0) / arr.length; }

function stdDev(arr) {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + Math.pow(v - m, 2), 0) / arr.length);
}

// Ordinary least squares slope of y on x (x = month index 0,1,2...). Returns
// { slope, intercept, r2 }. Used for both price-trend and volume-trend fitting
// so that every month in the available history contributes to the estimate,
// rather than only the first and last data points (as a naive CAGR would).
function olsSlope(xs, ys) {
  const n = xs.length;
  const mx = mean(xs), my = mean(ys);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  const slope = den === 0 ? 0 : num / den;
  const intercept = my - slope * mx;
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    const pred = intercept + slope * xs[i];
    ssRes += (ys[i] - pred) ** 2;
    ssTot += (ys[i] - my) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  return { slope, intercept, r2 };
}

function percentileRank(value, allValues) {
  if (allValues.length <= 1) return 50;
  const below = allValues.filter(v => v < value).length;
  return Math.round((below / (allValues.length - 1)) * 100);
}

function zScore(value, allValues) {
  const m = mean(allValues), sd = stdDev(allValues);
  return sd === 0 ? 0 : (value - m) / sd;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ---------------------------------------------------------------------------
// Monthly time series construction — the foundation every trend/volatility/
// acceleration metric below is built from, replacing the old 30-vs-30-day
// snapshot comparison with a series that uses the complete available history.
// ---------------------------------------------------------------------------
function monthKey(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function buildMonthlySeries(transactions) {
  const byMonth = {};
  transactions.forEach(t => {
    const k = monthKey(t.saleDate);
    if (!byMonth[k]) byMonth[k] = [];
    byMonth[k].push(t.actualSalePrice / t.area);
  });

  const months = Object.keys(byMonth).sort();
  const series = months
    .map((k, idx) => ({
      month: k,
      index: idx,
      count: byMonth[k].length,
      medianPpsm: median(byMonth[k])
    }))
    .filter(m => m.count >= MIN_TXNS_PER_MONTH_BUCKET);

  // Re-index after dropping thin months so regression x-values stay contiguous
  return series.map((m, i) => ({ ...m, index: i }));
}

// ---------------------------------------------------------------------------
// Per-district metric computation
// ---------------------------------------------------------------------------
function computeDistrictMetrics(district, transactions) {
  const totalCount = transactions.length;
  if (totalCount < MIN_TOTAL_TRANSACTIONS) return null;

  const series = buildMonthlySeries(transactions);
  if (series.length < MIN_MONTHS_WITH_DATA) return null;

  const allPrices = transactions.map(t => t.actualSalePrice / t.area);
  const medianPricePerSqm = median(allPrices);

  // --- Valuation Dispersion (renamed from the old, misleading "volatility")
  // Cross-sectional coefficient of variation of price/sqm across all
  // transactions in the district's full history. This measures how
  // heterogeneous pricing is across properties in the district — a property-
  // mix / appraisal-consistency signal — NOT a measure of price movement
  // over time. Conflating the two was the core defect in v2.0.
  const dispersionCV = (stdDev(allPrices) / medianPricePerSqm) * 100;

  // --- Price Trend (replaces the 30-vs-30-day momentum comparison)
  // OLS regression of ln(median monthly price/sqm) on month index, using
  // every available month rather than only the two endpoints. The slope is
  // a monthly log-return; annualizing it (x12) gives a growth rate that
  // behaves like CAGR when the fit is good, but is far less sensitive to
  // noise in any single month than an endpoint-to-endpoint calculation.
  const logSeries = series.map(m => Math.log(m.medianPpsm));
  const xs = series.map(m => m.index);
  const trend = olsSlope(xs, logSeries);
  const annualizedGrowthPct = (Math.exp(trend.slope * 12) - 1) * 100;

  // --- Observed Period Growth (the actual, non-extrapolated headline number)
  // Simple % change from the first to the last available month's median
  // price/sqm, over whatever period is actually observed (currently ~7
  // months). This is the number that should be presented as "growth" in an
  // executive setting: annualizing a 7-month trend to a 12-month rate (see
  // annualizedGrowthPct above) extrapolates beyond the observed data and, in
  // this dataset, produces implausibly large figures (e.g. 70-100%+) purely
  // as a mechanical consequence of compounding a short trend. The annualized
  // figure is retained as a supplementary "trend pace" statistic (always
  // shown with R2 and months-used so its extrapolated nature is visible),
  // but it is not the number this engine sorts or ranks districts by.
  const firstMedian = series[0].medianPpsm;
  const lastMedian = series[series.length - 1].medianPpsm;
  const observedPeriodGrowthPct = firstMedian > 0 ? ((lastMedian - firstMedian) / firstMedian) * 100 : 0;

  // --- Temporal Volatility (a genuine time-series volatility, replacing the
  // cross-sectional CV that v2.0 mislabeled as "volatility")
  // Standard deviation of month-over-month log returns of the median price,
  // annualized by sqrt(12) — the standard financial-time-series convention.
  const monthlyReturns = [];
  for (let i = 1; i < series.length; i++) monthlyReturns.push(logSeries[i] - logSeries[i - 1]);
  const temporalVolatilityPct = monthlyReturns.length >= 2
    ? stdDev(monthlyReturns) * Math.sqrt(12) * 100
    : null; // fewer than 2 returns available — do not fabricate a number

  // --- Price Acceleration (recent trend vs. longer-run trend)
  // Splits the series into a "recent" window (last RECENT_WINDOW_MONTHS
  // months) and the remaining prior months, fits each independently, and
  // reports the difference in annualized growth. A large positive gap means
  // growth is accelerating abnormally relative to its own recent history —
  // a genuine early-warning signal, distinct from the level of growth itself.
  let priceAccelerationPct = null;
  if (series.length >= MIN_MONTHS_WITH_DATA + RECENT_WINDOW_MONTHS) {
    const splitAt = series.length - RECENT_WINDOW_MONTHS;
    const priorSeries = series.slice(0, splitAt);
    const recentSeries = series.slice(splitAt);
    const priorTrend = olsSlope(priorSeries.map(m => m.index), priorSeries.map(m => Math.log(m.medianPpsm)));
    const recentTrend = olsSlope(recentSeries.map(m => m.index), recentSeries.map(m => Math.log(m.medianPpsm)));
    const priorAnnualized = (Math.exp(priorTrend.slope * 12) - 1) * 100;
    const recentAnnualized = (Math.exp(recentTrend.slope * 12) - 1) * 100;
    priceAccelerationPct = Math.round((recentAnnualized - priorAnnualized) * 10) / 10;
  }

  // --- Volume Trend (transaction-count trend, a demand-behavior signal)
  // OLS slope of monthly transaction counts vs. month index, expressed as a
  // % change per month relative to the series average count. Large swings in
  // either direction (rapid inflow of speculative activity, or rapid buyer
  // withdrawal while prices are still rising) are both destabilizing.
  const counts = series.map(m => m.count);
  const countTrend = olsSlope(xs, counts);
  const avgMonthlyCount = mean(counts);
  const volumeTrendPctPerMonth = avgMonthlyCount > 0 ? (countTrend.slope / avgMonthlyCount) * 100 : 0;

  // --- Anomalous-month detection
  // Data inspection during this review found at least one segment
  // (International City Ph 2 & 3 — Apartment) with a single month showing a
  // transaction count roughly 5-8x its other months, coinciding with a
  // sharp median-price collapse — consistent with a bulk/portfolio sale
  // event that the procedure-based cleaning filter did not catch. Rather
  // than silently dropping or reweighting these months (which risks masking
  // a real data-quality issue instead of surfacing it), any month whose
  // count exceeds 3x the segment's own average monthly count is flagged for
  // visibility; the month is NOT removed from the trend/volatility
  // calculations.
  const avgCountForAnomalyCheck = mean(counts);
  const anomalousMonths = series.filter(m => m.count > 3 * avgCountForAnomalyCheck).map(m => m.month);

  // --- Data coverage (needed for the Confidence score below)
  const firstDate = new Date(Math.min(...transactions.map(t => new Date(t.saleDate))));
  const lastDate = new Date(Math.max(...transactions.map(t => new Date(t.saleDate))));
  const elapsedMonths = Math.max(1, Math.round((lastDate - firstDate) / (30.44 * 86400000)) + 1);
  const monthCoverageRatio = clamp(series.length / elapsedMonths, 0, 1);
  const daysSinceLastTxn = Math.round((new Date() - lastDate) / 86400000);

  return {
    district,
    transactionCount: totalCount,
    monthsOfData: series.length,
    monthCoverageRatio: Math.round(monthCoverageRatio * 100) / 100,
    firstMonth: series[0].month,
    lastMonth: series[series.length - 1].month,
    daysSinceLastTransaction: daysSinceLastTxn,
    medianPricePerSqm: Math.round(medianPricePerSqm),
    growth: {
      observedPeriodGrowthPct: Math.round(observedPeriodGrowthPct * 10) / 10,
      annualizedPct: Math.round(annualizedGrowthPct * 10) / 10,
      method: 'ols_trend_full_history',
      r2: Math.round(trend.r2 * 100) / 100,
      monthsUsed: series.length,
      periodLabel: `${series[0].month} to ${series[series.length - 1].month}`
    },
    temporalVolatilityPct: temporalVolatilityPct === null ? null : Math.round(temporalVolatilityPct * 10) / 10,
    valuationDispersionCV: Math.round(dispersionCV * 10) / 10,
    priceAccelerationPct,
    volumeTrendPctPerMonth: Math.round(volumeTrendPctPerMonth * 10) / 10,
    avgMonthlyTransactions: Math.round(avgMonthlyCount * 10) / 10,
    smallSampleWarning: avgMonthlyCount < 10, // fewer than ~10 transactions/month is enough to pass the gates above but can still produce large, noisy swings in a trend fit — flagged rather than hidden or smoothed away
    anomalousMonths: anomalousMonths.length ? anomalousMonths : null, // months with a transaction-count spike >3x the segment's average — a possible bulk-sale/data-quality event; not removed, only flagged
    _series: series // retained internally for the multi-window growth precompute below; stripped before writing to district's public record
  };
}

// Precompute growth over a few standard windows (full history, last 6m, last
// 3m) so the front-end can offer a period filter without a live backend —
// this directly implements the correction brief's "allow filtering by user
// when needed" requirement on top of a static JSON pipeline.
function computeWindowedGrowth(series) {
  const windows = {};
  const specs = [
    { key: 'full', months: series.length },
    { key: 'last6m', months: 6 },
    { key: 'last3m', months: 3 }
  ];
  specs.forEach(spec => {
    const n = Math.min(spec.months, series.length);
    if (n < 3) { windows[spec.key] = null; return; } // need >=3 points for a meaningful trend
    const sub = series.slice(series.length - n);
    const t = olsSlope(sub.map(m => m.index), sub.map(m => Math.log(m.medianPpsm)));
    const firstM = sub[0].medianPpsm, lastM = sub[sub.length - 1].medianPpsm;
    windows[spec.key] = {
      observedPeriodGrowthPct: firstM > 0 ? Math.round(((lastM - firstM) / firstM) * 1000) / 10 : 0,
      annualizedPct: Math.round(((Math.exp(t.slope * 12) - 1) * 100) * 10) / 10,
      monthsUsed: n,
      r2: Math.round(t.r2 * 100) / 100,
      periodLabel: `${sub[0].month} to ${sub[sub.length - 1].month}`
    };
  });
  return windows;
}

// ---------------------------------------------------------------------------
// Confidence Score — a genuine, data-derived reliability measure (0-100),
// composed only of quantities we can actually observe: sample size adequacy,
// temporal coverage completeness, and recency. This is deliberately narrower
// than the full 5-component AQAR Confidence Index Framework specified for
// Market Intelligence indices (which also calls for source-reliability and
// completeness dimensions not applicable to a single-source DLD panel) — see
// methodology.limitations in the output file.
// ---------------------------------------------------------------------------
function computeConfidence(d) {
  const sampleAdequacy = clamp(d.transactionCount / 100, 0, 1);          // saturates at 100 txns
  const coverageCompleteness = d.monthCoverageRatio;                      // months with data / months elapsed
  const recency = d.daysSinceLastTransaction <= 30 ? 1
    : d.daysSinceLastTransaction <= 60 ? 0.7
      : d.daysSinceLastTransaction <= 90 ? 0.4
        : 0.1;

  // Weights: sample size and temporal coverage matter most because every
  // other metric in this file is a regression fit that degrades with too
  // few, too sparse, or too old data points; recency matters less because a
  // district can still be well-characterized even if its most recent sale
  // was 6 weeks ago.
  const score = sampleAdequacy * 45 + coverageCompleteness * 35 + recency * 20;
  return Math.round(score);
}

// ---------------------------------------------------------------------------
// Bubble Risk Composite — replaces the v2.0 single-variable score
// (volatility × 2) with four independent, weighted dimensions. Two
// dimensions requested in the correction brief (inventory/listing behavior,
// and price-to-rent / price-to-income based valuation extremes) are NOT
// implemented because no inventory, listing, or rental data exists anywhere
// in the current pipeline — see methodology.limitations rather than
// approximating them from the unverified consultancy dataset.
// ---------------------------------------------------------------------------
function computeBubbleRisk(d, allDistricts) {
  if (d.temporalVolatilityPct === null || d.priceAccelerationPct === null) return null;

  const volatilityScore = clamp(d.temporalVolatilityPct / 40, 0, 1);             // 40%+ annualized volatility → max score
  const accelerationScore = clamp(Math.max(0, d.priceAccelerationPct) / 30, 0, 1); // only accelerating growth is a risk signal, not decelerating
  const momentumZ = zScore(d.growth.observedPeriodGrowthPct, allDistricts.map(x => x.growth.observedPeriodGrowthPct));
  const outlierScore = clamp(Math.max(0, momentumZ) / 2.5, 0, 1);                // >2.5 SD above peer mean → max score
  const volumeInstabilityScore = clamp(Math.abs(d.volumeTrendPctPerMonth) / 15, 0, 1); // rapid change either direction

  // Weights: temporal volatility and abnormal acceleration are the two most
  // direct, literature-standard bubble signals (rapid, unstable price
  // movement); the cross-district outlier check catches a district whose
  // growth rate is anomalous even if its own volatility looks moderate;
  // volume instability is weighted lowest because count-trend noise is high
  // in districts near the minimum sample thresholds.
  const rawScore = volatilityScore * 35 + accelerationScore * 30 + outlierScore * 20 + volumeInstabilityScore * 15;

  // Confidence gating: a high risk score built on thin, poorly-covered data
  // is not trustworthy enough to publish as-is. Rather than hard-excluding
  // low-confidence districts, the raw score is scaled down proportionally to
  // confidence and the confidence value is always shown alongside it.
  const confidenceFactor = d.confidenceScore / 100;
  const adjustedScore = rawScore * (0.5 + 0.5 * confidenceFactor); // floor of 50% weight even at zero confidence, since the underlying data still passed the minimum sample gate

  return Math.round(adjustedScore * 10) / 10;
}

// ---------------------------------------------------------------------------
// Investment Score — replaces the v2.0 formula (priceMomentum*2 + activityRatio
// - volatility*0.3) with a documented multi-factor composite. Rental strength
// is NOT included: the codebase has no rental transaction data, and the only
// available proxy (consultancy-sourced cap rates) was already flagged in the
// Research Assets audit as an unverified static dataset — using it here would
// reintroduce exactly the kind of unsupported assumption this review is
// meant to remove.
// ---------------------------------------------------------------------------
function computeInvestmentScore(d, allDistricts) {
  const growthPctile = percentileRank(d.growth.observedPeriodGrowthPct, allDistricts.map(x => x.growth.observedPeriodGrowthPct));
  const liquidityPctile = percentileRank(d.avgMonthlyTransactions, allDistricts.map(x => x.avgMonthlyTransactions));
  const volatilityPctile = d.temporalVolatilityPct === null ? 50
    : 100 - percentileRank(d.temporalVolatilityPct, allDistricts.filter(x => x.temporalVolatilityPct !== null).map(x => x.temporalVolatilityPct));
  const consistencyPctile = 100 - percentileRank(d.valuationDispersionCV, allDistricts.map(x => x.valuationDispersionCV));

  // Weights, documented:
  // Growth 30% — the primary return driver and the metric investors ask for first.
  // Liquidity 25% — ease of entry/exit; an investment that cannot be transacted is not a realized return.
  // Volatility (inverted) 20% — risk-adjustment; matches the Statistical Standards' general preference for risk-adjusted comparison over raw return.
  // Valuation Consistency (inverted) 10% — proxies market maturity / appraisal reliability; weighted lowest because it is the least direct investment consideration of the four.
  // Confidence 15% — a district that scores well on thin or poorly-covered data should not outrank a well-covered, moderately-performing one; folded in as its own explicit weight rather than a silent gate.
  const score = growthPctile * 0.30 + liquidityPctile * 0.25 + volatilityPctile * 0.20 + consistencyPctile * 0.10 + d.confidenceScore * 0.15;
  return Math.round(score * 10) / 10;
}

// ---------------------------------------------------------------------------
// Main analysis
// ---------------------------------------------------------------------------
function analyzeMarket(data) {
  // Segments are grouped by district x property type, not district alone.
  // Data inspection during this review found that pooling all property types
  // into a single district-level monthly median created a composition-mix
  // artifact: e.g. Barsha Heights showed a spurious 455% "acceleration"
  // purely because its office-vs-apartment transaction mix shifted from
  // month to month (offices and apartments do not sell at the same
  // price/sqm), not because of genuine price movement. Segmenting by
  // district x property type — the same granularity already used by the
  // canonical cleaning pipeline's outlier detection — removes this
  // confound. Segments therefore represent e.g. "Business Bay — Apartment"
  // rather than a blended "Business Bay".
  const RESIDENTIAL_TYPES = new Set(['apartment', 'villa', 'townhouse']);
  const segments = {};
  data.forEach(t => {
    if (!RESIDENTIAL_TYPES.has(t.propertyType)) return; // see methodology.scope note below
    const key = `${t.district}__${t.propertyType}`;
    if (!segments[key]) segments[key] = { district: t.district, propertyType: t.propertyType, transactions: [] };
    segments[key].transactions.push(t);
  });

  const excluded = [];
  let districtMetrics = [];

  Object.values(segments).forEach(({ district, propertyType, transactions }) => {
    const label = `${district} (${propertyType[0].toUpperCase()}${propertyType.slice(1)})`;
    const m = computeDistrictMetrics(label, transactions);
    if (!m) {
      excluded.push({ district: label, transactionCount: transactions.length, reason: transactions.length < MIN_TOTAL_TRANSACTIONS ? 'below minimum transaction count' : 'fewer than minimum months of data for a reliable trend fit' });
      return;
    }
    m.label = label;
    m.district = district;
    m.propertyType = propertyType;
    m.windowedGrowth = computeWindowedGrowth(m._series);
    delete m._series;
    m.confidenceScore = computeConfidence(m);
    districtMetrics.push(m);
  });

  districtMetrics.forEach(d => {
    d.bubbleRiskScore = computeBubbleRisk(d, districtMetrics);
    d.investmentScore = computeInvestmentScore(d, districtMetrics);
    d.liquidityPercentile = percentileRank(d.avgMonthlyTransactions, districtMetrics.map(x => x.avgMonthlyTransactions));
  });

  const fastestGrowing = [...districtMetrics]
    .sort((a, b) => b.growth.observedPeriodGrowthPct - a.growth.observedPeriodGrowthPct)
    .slice(0, 10);

  const bestInvestmentDistricts = [...districtMetrics]
    .filter(d => d.investmentScore !== null)
    .sort((a, b) => b.investmentScore - a.investmentScore)
    .slice(0, 10);

  const highRiskAreas = [...districtMetrics]
    .filter(d => d.bubbleRiskScore !== null)
    .sort((a, b) => b.bubbleRiskScore - a.bubbleRiskScore)
    .slice(0, 10);

  const liquidityIndex = [...districtMetrics]
    .sort((a, b) => b.avgMonthlyTransactions - a.avgMonthlyTransactions)
    .slice(0, 15)
    .map(d => ({ district: d.district, transactionCount: d.transactionCount, avgMonthlyTransactions: d.avgMonthlyTransactions, liquidityPercentile: d.liquidityPercentile }));

  const allObservedGrowth = districtMetrics.map(d => d.growth.observedPeriodGrowthPct);
  const allAnnualizedTrend = districtMetrics.map(d => d.growth.annualizedPct);
  const avgObservedGrowth = allObservedGrowth.length ? mean(allObservedGrowth) : 0;
  const avgAnnualizedTrend = allAnnualizedTrend.length ? mean(allAnnualizedTrend) : 0;

  return {
    generatedAt: new Date().toISOString(),
    dataWindow: {
      firstTransactionDate: districtMetrics.length ? districtMetrics.reduce((min, d) => d.firstMonth < min ? d.firstMonth : min, districtMetrics[0].firstMonth) : null,
      lastTransactionDate: districtMetrics.length ? districtMetrics.reduce((max, d) => d.lastMonth > max ? d.lastMonth : max, districtMetrics[0].lastMonth) : null,
      note: 'All growth, volatility, and risk metrics use the complete available transaction history for each district, not a fixed lookback window. This window will grow automatically as more data accumulates.'
    },
    totalTransactions: data.length,
    qualifyingDistricts: districtMetrics.length,
    excludedDistricts: excluded,
    bestInvestmentDistricts,
    fastestGrowing,
    highRiskAreas,
    liquidityIndex,
    marketIndicators: {
      averageObservedPeriodGrowthPct: Math.round(avgObservedGrowth * 10) / 10,
      averageAnnualizedTrendPct: Math.round(avgAnnualizedTrend * 10) / 10,
      marketConditionBasis: 'Classification below uses the annualized trend rate (a rate concept), not the raw observed-period growth (a cumulative concept whose magnitude grows mechanically as more history accumulates). The annualized figure is a trend extrapolation from ~7 months of data — see methodology.growth.limitations.',
      totalActiveDistricts: districtMetrics.length,
      totalTransactions: data.length,
      marketCondition: avgAnnualizedTrend > 15 ? 'Strong Seller Market' : avgAnnualizedTrend > 5 ? 'Moderate Seller Market' : avgAnnualizedTrend > -5 ? 'Balanced Market' : avgAnnualizedTrend > -15 ? 'Moderate Buyer Market' : 'Strong Buyer Market',
      topPerformer: fastestGrowing[0]?.district || 'N/A',
      mostLiquid: liquidityIndex[0]?.district || 'N/A',
      highestRisk: highRiskAreas[0]?.district || 'N/A'
    },
    methodology: {
      scope: {
        definition: "Every 'district' shown in this dashboard is actually a district x property-type segment (e.g. 'Business Bay (Apartment)'), and is restricted to residential types: apartment, villa, townhouse.",
        calculation: "Segments are formed by grouping transactions on district + propertyType before any trend, volatility, or risk calculation.",
        variables: ["district", "propertyType"],
        assumptions: [],
        limitations: ["Data inspection during this review found that the prior version (v2.0, and the first draft of v3.0) pooled all property types — including office, retail, and land — into a single district-level median. Because these asset classes trade at structurally different price/sqm levels, a shift in a district's month-to-month transaction mix (e.g. more offices sold in one month than another) produced spurious price swings with no connection to genuine market movement — observed directly in this dataset as a 455% 'acceleration' in one mixed-use district that was actually a type-mix artifact. Segmenting by district x property type removes this confound. Office, retail, land, and warehouse transactions are excluded from this dashboard version entirely rather than segmented, because their sample sizes in the current dataset (1,021 / 379 / 7,838 / 6 transactions platform-wide) are too concentrated in too few districts to support the same monthly-trend methodology reliably; a commercial/land-specific Market Intelligence view is a Future Research item, not something this review approximates."]
      },
      growth: {
        definition: "Two related but distinct figures are reported for every district: (1) observedPeriodGrowthPct — the actual, non-extrapolated % change in median price/sqm across the available history, and (2) annualizedPct — an OLS trend rate extrapolated to a 12-month equivalent. Rankings and headline figures use (1); (2) is supplementary context only.",
        calculation: "Monthly median price/sqm is computed per district. observedPeriodGrowthPct = % change from the first to the last qualifying month's median. annualizedPct: an OLS trend line is fit to ln(median price) vs. month index across every qualifying month; the slope is annualized as (e^(slope times 12) minus 1) times 100.",
        variables: ["saleDate", "actualSalePrice", "area"],
        assumptions: ["Requires >=4 distinct months with >=3 transactions each; months with fewer than 3 transactions are dropped before fitting."],
        limitations: ["Available history is ~7 months (Jan-Jul 2026), not a full year. annualizedPct extrapolates a ~7-month trend to a 12-month rate and can produce implausibly large figures purely from compounding a short trend — it is reported for context (always alongside R-squared and monthsUsed) but is deliberately NOT the number this engine sorts, ranks, or headlines districts by. observedPeriodGrowthPct avoids this extrapolation but will mechanically grow in magnitude as the observed window lengthens over time, so it should always be read together with its periodLabel."]
      },
      temporalVolatility: {
        definition: "How much a district's monthly median price fluctuates over time.",
        calculation: "Standard deviation of month-over-month log returns of the median price series, annualized by multiplying by sqrt(12).",
        variables: ["saleDate", "actualSalePrice", "area"],
        assumptions: ["Requires >=2 month-over-month returns (>=3 qualifying months)."],
        limitations: ["With only ~7 months of history, this is a short time series; the estimate will stabilize as more months accumulate."]
      },
      valuationDispersionCV: {
        definition: "How heterogeneous sale prices are across properties within a district at a point in time (not a time-series measure).",
        calculation: "Coefficient of variation (stdDev / median) of price/sqm across all qualifying transactions in the district's full history.",
        variables: ["actualSalePrice", "area"],
        assumptions: [],
        limitations: ["Mixes genuine valuation inconsistency with legitimate property-mix heterogeneity (e.g. a district with both older and newly-handed-over towers will show higher dispersion for structural reasons unrelated to market risk)."]
      },
      priceAcceleration: {
        definition: "Whether a district's growth rate is speeding up relative to its own recent history.",
        calculation: "Difference between the annualized trend growth of the most recent " + RECENT_WINDOW_MONTHS + " months and the annualized trend growth of all prior months.",
        variables: ["saleDate", "actualSalePrice", "area"],
        assumptions: ["Requires >=" + (MIN_MONTHS_WITH_DATA + RECENT_WINDOW_MONTHS) + " total qualifying months; districts with less history do not receive an acceleration figure."],
        limitations: ["With ~7 months of total history, the \"prior\" period is itself short, so this is an early-stage signal, not a multi-year cycle comparison."]
      },
      volumeTrend: {
        definition: "Whether transaction activity in a district is expanding or contracting over time.",
        calculation: "OLS slope of monthly transaction counts vs. month index, expressed as a % of the average monthly count.",
        variables: ["saleDate"],
        assumptions: [],
        limitations: ["Sensitive to one unusually large or small month when total months of history is low."]
      },
      confidenceScore: {
        definition: "How much statistical confidence to place in a district's other metrics.",
        calculation: "Weighted combination of sample-size adequacy (45%, saturating at 100 transactions), temporal coverage completeness — months with qualifying data divided by months elapsed (35%), and recency of the most recent transaction (20%).",
        variables: ["transactionCount", "monthsOfData", "daysSinceLastTransaction"],
        assumptions: [],
        limitations: ["This is a narrower proxy than the full 5-component AQAR Confidence Index Framework specified for Market Intelligence indices (which also calls for source-reliability and cross-source completeness dimensions) — those do not apply here because every input comes from a single DLD source rather than multiple reconciled sources."]
      },
      bubbleRiskScore: {
        definition: "Composite early-warning score for speculative or unstable price behavior in a district — deliberately not based on a single variable.",
        calculation: "Weighted combination of temporal volatility (35%), positive price acceleration (30%), cross-district growth-rate outlier status via z-score (20%), and volume instability (15%); the raw score is then scaled by a confidence factor (floor 50%, ceiling 100%) so low-confidence districts cannot register as high-risk purely on noise.",
        variables: ["saleDate", "actualSalePrice", "area"],
        assumptions: ["Only positive acceleration (speeding-up growth) contributes to risk; deceleration does not."],
        limitations: ["Inventory/listing supply behavior and price-to-rent or price-to-income based valuation extremes — both requested dimensions — are NOT included because no inventory, listing, or rental dataset exists anywhere in the current pipeline. The only available proxy (consultancy-sourced cap rates) was independently flagged in the AQAR Research Assets audit as an unverified, uncited static dataset, and using it here would reintroduce exactly the kind of unsupported assumption this review is intended to remove. This score should be read as a price-and-volume-behavior risk indicator, not a complete bubble-risk assessment. Segments averaging fewer than 10 transactions/month (flagged via smallSampleWarning) can still pass the minimum-sample gates yet produce large, noisy swings in priceAccelerationPct purely from sampling variation in a thin micro-market — these raw values are reported as-observed rather than smoothed or capped, but should be read alongside the warning flag, not in isolation."]
      },
      investmentScore: {
        definition: "Composite ranking of districts by overall investment attractiveness.",
        calculation: "Weighted combination of growth percentile (30%), liquidity percentile — average monthly transactions (25%), inverted volatility percentile (20%), inverted valuation-dispersion percentile (10%), and confidence score (15%), all computed relative to the qualifying district panel.",
        variables: ["growth.observedPeriodGrowthPct", "avgMonthlyTransactions", "temporalVolatilityPct", "valuationDispersionCV", "confidenceScore"],
        assumptions: [],
        limitations: ["Rental strength and historical multi-year performance are NOT included: no rental transaction data exists in the current pipeline, and the available history (~7 months) is too short to assess multi-year performance consistency. Both should be added once the underlying data exists, rather than approximated now."]
      }
    }
  };
}

function main() {
  console.log('AQAR Market Intelligence Engine v3.0 (Scientific Review & Correction)\n');

  if (!fs.existsSync(INPUT_FILE)) { console.log('No DLD data'); return; }

  const rawData = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  console.log(`Raw: ${rawData.length.toLocaleString()}`);

  const data = cleanData(rawData);
  console.log(`Cleaned: ${data.length.toLocaleString()}\n`);

  const intelligence = analyzeMarket(data);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(intelligence, null, 2));

  console.log('MARKET INTELLIGENCE REPORT');
  console.log('='.repeat(50));
  console.log(`\nData window: ${intelligence.dataWindow.firstTransactionDate} -> ${intelligence.dataWindow.lastTransactionDate}`);
  console.log(`Market Condition: ${intelligence.marketIndicators.marketCondition}`);
  console.log(`Avg Observed Period Growth: ${intelligence.marketIndicators.averageObservedPeriodGrowthPct}% | Avg Annualized Trend: ${intelligence.marketIndicators.averageAnnualizedTrendPct}%`);
  console.log(`Top Performer: ${intelligence.marketIndicators.topPerformer}`);
  console.log(`Most Liquid: ${intelligence.marketIndicators.mostLiquid}`);
  console.log(`Qualifying districts: ${intelligence.qualifyingDistricts} (${intelligence.excludedDistricts.length} excluded - see excludedDistricts for reasons)`);

  console.log('\nTop 5 Investment Districts:');
  intelligence.bestInvestmentDistricts.slice(0, 5).forEach((d, i) => {
    console.log(`   ${i + 1}. ${d.district} - Score: ${d.investmentScore} (Observed Growth: ${d.growth.observedPeriodGrowthPct}%, Trend(annualized): ${d.growth.annualizedPct}%, Confidence: ${d.confidenceScore})`);
  });

  console.log('\nTop 5 High Risk Areas:');
  intelligence.highRiskAreas.slice(0, 5).forEach((d, i) => {
    console.log(`   ${i + 1}. ${d.district} - Bubble Risk: ${d.bubbleRiskScore} (Volatility: ${d.temporalVolatilityPct}%, Acceleration: ${d.priceAccelerationPct}%, Confidence: ${d.confidenceScore})`);
  });

  console.log(`\nSaved to ${OUTPUT_FILE}`);
}

try { main(); } catch (e) { console.error(e); }
