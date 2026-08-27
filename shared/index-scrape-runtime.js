async function scrapeRealData() {
  const city = document.getElementById('city').value, district = document.getElementById('districtInput').value.trim(), propType = document.getElementById('propType').value;
  const area = parseFloat(document.getElementById('area').value)||0, btn = document.getElementById('btnScrape'), status = document.getElementById('scrapeStatus');
  if (!city || !district) { status.innerHTML = '<span class="status-badge error">⚠️ Select city and enter district</span>'; showToast('Please select a city and enter a district name'); return; }
  if (area < 10) { status.innerHTML = '<span class="status-badge error">⚠️ Please enter a valid area</span>'; showToast('Please enter a valid area'); return; }
  btn.disabled = true; btn.innerHTML = '<span class="loading"></span> Analyzing market...'; status.innerHTML = '<span class="market-status-detail">🔍 Checking market data...</span>';
  document.getElementById('resultSection').classList.add('hidden');
  document.getElementById('resultSection').innerHTML = '';
  const lat = document.getElementById('gisLat').value.trim(), lng = document.getElementById('gisLng').value.trim();
  try {
    const params = new URLSearchParams({ district, propertyType: propType || 'apartment', area });
    if (lat && lng) { params.append('lat', lat); params.append('lng', lng); }
    const resp = await fetch(`/.netlify/functions/dld-lookup?${params.toString()}`);
    const data = await resp.json();
    if (data.found) {
      document.getElementById('avgPriceSqm').value = data.avgPricePerSqm;
      document.getElementById('recentSalesCount').value = data.count;
      document.getElementById('lastDataRefresh').textContent = new Date().toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
      const evidenceState = getCurrentEvidenceState(data);
      scrapedDistrictData = { avgPricePerSqm: data.avgPricePerSqm, minComparablePrice: data.minComparablePrice, maxComparablePrice: data.maxComparablePrice, comparablePrices: data.comparablePrices || [], comparablePriceBasis: data.comparablePriceBasis || 'actual_sale_price', count: data.count, dataSource: 'dld', level: data.level, source: 'dld', confidence: data.confidence || 'medium', timeWindow: data.timeWindow || 'N/A', monthlyGrowthRate: data.monthlyGrowthRate, evidenceState };
            const presentation = AQAR_EVIDENCE_STATE.getEvidencePresentation(evidenceState);
      status.innerHTML = `<span class="status-badge ${presentation.tone}">${presentation.title} — ${data.count} comparable sales</span>${evidenceState === AQAR_EVIDENCE_STATE.STATES.LIMITED ? '<br><span class="market-status-review">Review this limited sample before relying on the result.</span>' : ''}`;
      showToast(`${data.count} comparable sales found in ${district}`);
    } else {
      const evidenceState = getCurrentEvidenceState(data);
      status.innerHTML = `<span class="status-badge warning">Insufficient market evidence — no reliable estimate from sales</span><br><span class="market-status-detail">Provide more market information to improve the estimate.</span>`;
      document.getElementById('avgPriceSqm').value = ''; document.getElementById('recentSalesCount').value = ''; scrapedDistrictData = { evidenceState, count: 0, dataSource: 'dld', reason: data.reason || 'no-sufficient-data' };
    }
  } catch(e) { console.error('Scrape error:', e); const evidenceState = getCurrentEvidenceState({ found: false, error: true }); status.innerHTML = `<span class="status-badge error">Market data unavailable</span><br><span class="market-status-detail">${AQAR_EVIDENCE_STATE.getEvidencePresentation(evidenceState).message}</span>`; scrapedDistrictData = { evidenceState, count: 0, dataSource: 'dld', reason: 'service-unavailable' }; }
  btn.disabled = false; btn.innerHTML = '🔄 Refresh market data';
}
