function setEvidenceState(input = {}) {
  currentEvidenceState = AQAR_EVIDENCE_STATE.classifyEvidenceState(input);
  window.aqarEvidenceState = currentEvidenceState;
  return currentEvidenceState;
}
function renderEvidenceState(state, container, detail = '') {
  if (!container) return;
  const presentation = AQAR_EVIDENCE_STATE.getEvidencePresentation(state);
  const detailHTML = detail ? `<small>${escapeMapHtml(detail)}</small>` : '';
  container.innerHTML = `<div class="evidence-state ${presentation.tone}"><strong>${presentation.title}</strong>${presentation.message}${detailHTML}</div>`;
}
function getCurrentEvidenceState(data = {}) {
  return setEvidenceState({
    found: Boolean(data.found),
    count: data.count || data.scrapedData?.count || 0,
    reason: data.reason || '',
    error: Boolean(data.error)
  });
}
function normalizeMarketLabel(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
function findMarketSegment(district, propertyType) {
  const targetDistrict = normalizeMarketLabel(district);
  const targetType = String(propertyType || '').toLowerCase();
  return (marketIntelligenceData?.districtSegments || []).find(segment =>
    normalizeMarketLabel(segment.district) === targetDistrict && String(segment.propertyType || '').toLowerCase() === targetType
  ) || null;
}
async function loadMarketIntelligence() {
  try {
    const response = await fetch(`/data/market-intelligence.json?_market_context=${Date.now()}`, { cache: 'no-store' });
    if (response.ok) marketIntelligenceData = await response.json();
  } catch (error) {
    console.warn('Could not load market intelligence context:', error.message);
    marketIntelligenceData = null;
  }
  return marketIntelligenceData;
}
function getComparableBracket(targetValue, prices) {
  return AQAR_COMPARABLE_BRACKET.getComparableBracket(targetValue, prices);
}
function buildMarketContextHTML(result, propData) {
  const segment = findMarketSegment(propData.district, propData.propType);
  const avgPpsm = Number(scrapedDistrictData?.avgPricePerSqm || propData.avgPriceSqm || 0);
  const estimatedPpsm = propData.area > 0 ? Number(result.finalValue) / Number(propData.area) : 0;
  const relativeToMedian = avgPpsm > 0 && estimatedPpsm > 0 ? ((estimatedPpsm / avgPpsm) - 1) * 100 : null;
  const localGrowth = segment?.growth?.observedPeriodGrowthPct;
  const localR2 = Number(segment?.growth?.r2);
  const direction = Number.isFinite(Number(localGrowth)) && Number.isFinite(localR2) && localR2 >= 0.3
    ? Number(localGrowth) > 3 ? 'leans upward' : Number(localGrowth) < -3 ? 'leans softer' : 'looks broadly stable'
    : 'has a mixed or uncertain direction';
  const comparisonText = Number.isFinite(relativeToMedian)
    ? `The estimated unit value is <b>${Math.abs(relativeToMedian).toFixed(1)}% ${relativeToMedian >= 0 ? 'above' : 'below'}</b> the comparable median for this search.`
    : '';
  const periodText = segment?.growth?.periodLabel || (scrapedDistrictData?.timeWindow ? `the last ${scrapedDistrictData.timeWindow} days` : 'the available evidence window');
  const segmentText = segment
    ? `In <b>${escapeMapHtml(propData.district || 'the selected area')}</b>, comparable ${escapeMapHtml(propData.propType)} prices ${Number(localGrowth) >= 0 ? 'rose' : 'fell'} <b>${Math.abs(Number(localGrowth || 0)).toFixed(1)}%</b> over ${escapeMapHtml(periodText)}. The near-term direction ${direction}; this is a data-based signal, not a guaranteed forecast.`
    : 'A reliable district-and-property-type Market Intelligence segment was not available for this selection, so no unsupported local forecast is shown.';
  const qualityText = segment
    ? `The local signal uses ${Number(segment.transactionCount || scrapedDistrictData?.count || 0).toLocaleString()} transactions, ${segment.monthsOfData || 'several'} months of data, and a ${segment.confidenceScore}/100 context score.`
    : '';
  if (!comparisonText && !segmentText) return '';
  return `<div class="market-indicators"><b>📈 Market indicators</b><br>${comparisonText}${comparisonText && segmentText ? '<br>' : ''}${segmentText}${qualityText ? `<small>${qualityText}</small>` : ''}</div>`;
}
