const escapeHtml = value => AQAR_HTML_ESCAPE.escapeHtml(value);
let marketData = null;

function fmtPct(v) {
  if (v === null || v === undefined) return '—';
  return (v > 0 ? '+' : '') + v + '%';
}

function warnBadge(d) {
  const flags = [];
  if (d.smallSampleWarning) flags.push('⚠ small sample (&lt;10 txns/mo avg) — treat with caution');
  if (d.anomalousMonths && d.anomalousMonths.length) flags.push('⚠ possible bulk-sale anomaly in ' + d.anomalousMonths.join(', '));
  if (!flags.length) return '';
  return `<span class="warn-flag" title="${escapeHtml(flags.join(' | '))}">⚠</span>`;
}

function renderInvestmentTable() {
  let html = '<table><thead><tr><th>#</th><th>District</th><th>Score</th><th>Growth</th><th>Volatility</th><th>Liquidity %ile</th><th>Confidence</th></tr></thead><tbody>';
  (marketData.bestInvestmentDistricts || []).forEach((d, i) => {
    html += `<tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(d.label)}${warnBadge(d)}</td>
      <td>${d.investmentScore}</td>
      <td><span class="badge ${d.growth.observedPeriodGrowthPct > 0 ? 'green' : 'red'}">${fmtPct(d.growth.observedPeriodGrowthPct)}</span></td>
      <td>${d.temporalVolatilityPct === null ? '—' : d.temporalVolatilityPct + '%'}</td>
      <td>${d.liquidityPercentile}</td>
      <td class="conf">${d.confidenceScore}/100</td>
    </tr>`;
  });
  html += '</tbody></table>';
  document.getElementById('investmentTable').innerHTML = `<div class="table-scroll" role="region" tabindex="0" aria-label="Top 10 Investment Districts table">${html}</div>`;
}

function renderGrowingTable(period) {
  const rows = [...(marketData.fastestGrowing || [])];
  // Re-sort by the selected window's observed growth when not "full", since
  // the precomputed fastestGrowing list is ranked on full-history growth.
  rows.forEach(d => { d._w = d.windowedGrowth[period]; });
  const withWindow = rows.filter(d => d._w !== null && d._w !== undefined);
  withWindow.sort((a, b) => b._w.observedPeriodGrowthPct - a._w.observedPeriodGrowthPct);
  const top = withWindow.slice(0, 10);

  let html = '<table><thead><tr><th>#</th><th>District</th><th>Growth (Observed)</th><th>Trend (Annualized)</th><th>Period</th><th>Confidence</th><th>Transactions</th></tr></thead><tbody>';
  top.forEach((d, i) => {
    const w = d._w;
    html += `<tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(d.label)}${warnBadge(d)}</td>
      <td><span class="badge green">${fmtPct(w.observedPeriodGrowthPct)}</span></td>
      <td class="conf">${fmtPct(w.annualizedPct)} (R²=${w.r2})</td>
      <td class="conf">${escapeHtml(w.periodLabel)}</td>
      <td class="conf">${d.confidenceScore}/100</td>
      <td>${d.transactionCount}</td>
    </tr>`;
  });
  html += '</tbody></table>';
  document.getElementById('growingTable').innerHTML = `<div class="table-scroll" role="region" tabindex="0" aria-label="Fastest Growing Areas table">${html}</div>`;
}

function renderRiskTable() {
  let html = '<table><thead><tr><th>#</th><th>District</th><th>Bubble Risk</th><th>Volatility</th><th>Acceleration</th><th>Confidence</th><th>Transactions</th></tr></thead><tbody>';
  (marketData.highRiskAreas || []).forEach((d, i) => {
    html += `<tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(d.label)}${warnBadge(d)}</td>
      <td><span class="badge red">${d.bubbleRiskScore}</span></td>
      <td>${d.temporalVolatilityPct}%</td>
      <td>${fmtPct(d.priceAccelerationPct)}</td>
      <td class="conf">${d.confidenceScore}/100</td>
      <td>${d.transactionCount}</td>
    </tr>`;
  });
  html += '</tbody></table>';
  document.getElementById('riskTable').innerHTML = `<div class="table-scroll" role="region" tabindex="0" aria-label="High Risk Areas table">${html}</div>`;
}

function renderMethodologyPanel() {
  const m = marketData.methodology || {};
  let html = '';
  Object.entries(m).forEach(([key, def]) => {
    html += `<div class="m-block">
      <h4>${escapeHtml(key)}</h4>
      <div><span class="m-label">Definition:</span> ${escapeHtml(def.definition)}</div>
      <div><span class="m-label">Calculation:</span> ${escapeHtml(def.calculation)}</div>
      ${def.variables && def.variables.length ? `<div><span class="m-label">Variables:</span> ${escapeHtml(def.variables.join(', '))}</div>` : ''}
      ${def.assumptions && def.assumptions.length ? `<div><span class="m-label">Assumptions:</span> ${escapeHtml(def.assumptions.join(' '))}</div>` : ''}
      ${def.limitations && def.limitations.length ? `<div class="m-limit"><span class="m-label">Limitations:</span> ${escapeHtml(def.limitations.join(' '))}</div>` : ''}
    </div>`;
  });
  document.getElementById('methodologyPanel').innerHTML = html || 'No methodology metadata available.';
}

async function loadData() {
  try {
    const res = await fetch('/data/market-intelligence.json');
    marketData = await res.json();

    document.getElementById('headerSubtitle').textContent =
      `Full market analysis based on ${marketData.totalTransactions.toLocaleString()} transactions (${marketData.dataWindow.firstTransactionDate} to ${marketData.dataWindow.lastTransactionDate}) — ${marketData.qualifyingDistricts} qualifying district/type segments`;

    const mi = marketData.marketIndicators || {};
    document.getElementById('marketCondition').textContent = mi.marketCondition || '—';
    document.getElementById('marketConditionSub').textContent = 'based on annualized trend — indicative, see Methodology';
    document.getElementById('avgGrowth').textContent = fmtPct(mi.averageObservedPeriodGrowthPct);
    document.getElementById('avgGrowthSub').textContent = `Trend (annualized): ${fmtPct(mi.averageAnnualizedTrendPct)}`;
    document.getElementById('topPerformer').textContent = mi.topPerformer || '—';
    document.getElementById('mostLiquid').textContent = mi.mostLiquid || '—';

    renderInvestmentTable();
    renderGrowingTable('full');
    renderRiskTable();
    renderMethodologyPanel();

    document.getElementById('growthPeriodFilter').addEventListener('change', (e) => renderGrowingTable(e.target.value));

  } catch (e) {
    console.error(e);
    const errorMsg = '⚠️ Could not load market data. Please check your connection or try again later.';
    document.getElementById('investmentTable').innerHTML = `<div class="loading loading-error">${errorMsg}</div>`;
    document.getElementById('growingTable').innerHTML = `<div class="loading loading-error">${errorMsg}</div>`;
    document.getElementById('riskTable').innerHTML = `<div class="loading loading-error">${errorMsg}</div>`;
  }
}

document.addEventListener('DOMContentLoaded', loadData);
