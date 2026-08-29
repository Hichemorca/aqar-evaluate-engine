function buildDecisionEngineLink(result, propData) {
  const p = new URLSearchParams();
  p.set('price', result.finalValue); p.set('area', propData.area); p.set('type', propData.propType);
  p.set('city', propData.city); p.set('district', propData.district);
  p.set('valuation', result.finalValue); p.set('valLow', result.range.low); p.set('valHigh', result.range.high);
  p.set('confidence', result.confidencePct); p.set('methods', result.valuations.length);
  if (propData.avgPriceSqm > 0) p.set('pricePerSqm', propData.avgPriceSqm);
  if (scrapedDistrictData?.capRate) p.set('capRate', scrapedDistrictData.capRate);
  if (scrapedDistrictData?.vacancyRate) p.set('vacancy', scrapedDistrictData.vacancyRate);
  if (propData.annualRent > 0) p.set('rent', propData.annualRent);
  p.set('source', 'valuation_engine'); p.set('referrer', 'aqar_valuation');
  return `https://aqar-decision-engine.netlify.app/?${p.toString()}`;
}

function displayEvidenceOnlyState(propData) {
  const section = document.getElementById('resultSection');
  const presentation = AQAR_EVIDENCE_STATE.getEvidencePresentation(propData.evidenceState || AQAR_EVIDENCE_STATE.STATES.INSUFFICIENT);
  section.innerHTML = `<div class="result-card result-card-evidence-only"><div class="result-eyebrow">Valuation status</div><div class="evidence-state ${presentation.tone}"><strong>${presentation.title}</strong>${presentation.message}<small>Provide comparable sales or rental information to improve this estimate. The system will not display an invented market value.</small></div><button class="btn btn-s result-action-button" data-action="review-inputs">🔄 Review Inputs</button></div>`;
  section.classList.remove('hidden');
  section.scrollIntoView({ behavior: 'smooth' });
}

function displayResult(result, valuations, propData) {
  const section = document.getElementById('resultSection');
  const cc = result.confidence === 'high' ? 'high' : result.confidence === 'medium' ? 'medium' : 'low';
  const confLevel = result.confidencePct >= 80 ? 'High' : result.confidencePct >= 60 ? 'Medium' : 'Basic';
  const dldCount = Number(scrapedDistrictData?.count || 0);
  const evidenceConfidence = dldCount > 0 ? confLevel : 'Not available';
  const shadowHTML = result.shadowEnabled ? `<div class="evidence-state warning"><strong>Experimental shadow multiplier</strong>Shadow value: <b>AED ${result.shadowValue.toLocaleString()}</b> (${result.shadowMultiplier.toFixed(4)}× baseline). This is analysis-only and does not replace the official valuation.<small>${(result.shadowTrace.applied || []).map(item => `${escapeMapHtml(item.field)}: ${Number(item.multiplier).toFixed(4)}×`).join(' • ') || 'No applicable v2.1 multiplier was applied.'}</small></div>` : '';
  const methodLabels = {
    'sales-comparison': 'Sales Comparison Approach',
    income: 'Income Capitalization Approach',
    cost: 'Cost Approach (Replacement)',
    dcf: 'DCF Analysis (10-Year)'
  };
  const applicableMethods = new Set(AQAR_POLICY.getApplicableMethods(propData.propType, 'interactive'));
  const methodStatusHTML = AQAR_POLICY.METHOD_KEYS.map(method => {
    const label = methodLabels[method];
    const isApplicable = applicableMethods.has(method);
    const wasUsed = valuations.some(v => v.method === label);
    const status = !isApplicable ? 'NOT_APPLICABLE' : wasUsed ? 'USED' : 'NOT_USED — insufficient evidence or inputs';
    const statusClass = status === 'USED' ? 'used' : status === 'NOT_APPLICABLE' ? 'not-applicable' : 'not-used';
    return `<div class="result-method-row"><span>${label}</span><b class="result-method-status ${statusClass}">${status}</b></div>`;
  }).join('');
  const evidenceState = propData.evidenceState || AQAR_EVIDENCE_STATE.STATES.INSUFFICIENT;
  const evidencePresentation = AQAR_EVIDENCE_STATE.getEvidencePresentation(evidenceState);
  const evidenceStateHTML = `<div class="evidence-state ${evidencePresentation.tone}"><strong>${evidencePresentation.title}</strong>${evidencePresentation.message}${evidenceState === AQAR_EVIDENCE_STATE.STATES.LIMITED ? '<small>Review the comparable sample before relying on this result.</small>' : ''}</div>`;

  const adjustmentFacts = [
    propData.projectBuilding ? `Project / Building: ${escapeMapHtml(propData.projectBuilding)} (${propData.projectBuildingSource === 'dld-suggestion' ? 'Verified project suggestion' : 'user-entered'})` : '',
    propData.bua ? `BUA: ${escapeMapHtml(propData.bua)} sqm` : '',
    propData.plotArea ? `Plot area: ${escapeMapHtml(propData.plotArea)} sqm` : '',
    propData.lastRenovationYear ? `Last renovation: ${escapeMapHtml(propData.lastRenovationYear)}` : '',
    propData.condition ? `Condition: ${escapeMapHtml(propData.condition)}` : '',
    propData.finishQuality ? `Finish: ${escapeMapHtml(propData.finishQuality)}` : '',
    propData.viewTypes?.length ? `Views: ${escapeMapHtml(propData.viewTypes.join(', '))}` : '',
    propData.floorLevel ? `Floor: ${escapeMapHtml(propData.floorLevel)}` : '',
    propData.streetPosition ? `Street position: ${escapeMapHtml(propData.streetPosition)}` : '',
    propData.buildingCondition ? `Building condition: ${escapeMapHtml(propData.buildingCondition)}` : '',
    propData.furnishedStatus ? `Furnished status: ${escapeMapHtml(propData.furnishedStatus)}` : '',
  ].filter(Boolean);
  const adjustmentsHTML = adjustmentFacts.length ? `<div class="result-adjustments"><span class="result-label">Inputs considered</span><p>${adjustmentFacts.join(' <span aria-hidden="true">•</span> ')}</p></div>` : '';
  const marketContextHTML = buildMarketContextHTML(result, propData);
  const comparableBracket = getComparableBracket(result.finalValue, scrapedDistrictData?.comparablePrices);
  const comparableRangeHTML = '';
  const vHTML = '';
  const explanationDistrict = escapeMapHtml(propData.district || 'the selected area');
  const evidenceFacts = [
    dldCount > 0 ? `<span>Comparable sales</span><b>${dldCount} in ${explanationDistrict}</b>` : '',
    dldCount > 0 ? `<span>Evidence strength</span><b>${evidenceConfidence}</b>` : '',
    `<span>Property type</span><b>${escapeMapHtml(propData.propType)}</b>`,
    `<span>Area</span><b>${propData.area} sqm</b>`
  ].filter(Boolean).join('');
  const explain = `<div class="result-explanation"><div class="result-section-heading"><span class="result-section-kicker">Evidence & rationale</span><h3>Why this valuation?</h3></div><div class="result-evidence-facts">${evidenceFacts}</div>${evidenceStateHTML}${adjustmentsHTML}${marketContextHTML}</div>`;
  const deUrl = buildDecisionEngineLink(result, propData);
  section.innerHTML = `<div class="result-card"><div class="result-header"><div class="result-eyebrow">Estimated Market Value</div><div class="final-value">AED ${result.finalValue.toLocaleString()}</div><div class="result-property-meta">${escapeMapHtml(propData.propType)} <span aria-hidden="true">•</span> ${escapeMapHtml(propData.district || 'N/A')} <span aria-hidden="true">•</span> ${propData.area} sqm</div><div class="result-confidence-card"><div><span class="result-label">Confidence</span><strong class="result-confidence-label ${cc}">${result.confidencePct}% · ${confLevel}</strong></div><div class="confidence-bar" aria-label="Confidence ${result.confidencePct}%"><div class="confidence-fill ${cc}"></div></div></div></div>${shadowHTML}${explain}<details class="result-methodology"><summary>View applied methods</summary><div class="result-method-list">${methodStatusHTML}</div></details><div class="result-actions"><a href="${deUrl}" target="_blank" rel="noopener noreferrer" class="integration-btn">Analyze in Decision Engine <span aria-hidden="true">→</span></a><button class="btn btn-s result-action-button" data-action="new-valuation">🔄 New Valuation</button></div></div>`;
  section.querySelector('.confidence-fill')?.style.setProperty('--confidence-width', `${result.confidencePct}%`);
  section.classList.remove('hidden');
  section.scrollIntoView({ behavior: 'smooth' });
}
