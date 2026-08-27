function displayGISResult(gisData) {
  const container = document.getElementById('gisResult'), list = document.getElementById('gisFacilitiesList'), scoreDisplay = document.getElementById('gisScoreDisplay');
  container.classList.add('is-visible');
  if (!gisData || !gisData.facilities) { list.innerHTML = 'No nearby facilities found'; scoreDisplay.textContent = 'Impact: 0%'; return; }
  let total = 0;
  for (const [k,d] of Object.entries(gisData.facilities)) if (d.count > 0) total += d.score;
  const gis = AQAR_ACTIVE_CALIBRATION.gis || {};
  const scoreCap = Number(gis.scoreCap || 1.5);
  const impactMaximumPercent = Number(gis.impactMaximumPercent || 12);
  const contributionCap = Number(gis.facilityContributionCap || 2);
  const capped = Math.min(total, scoreCap), impact = Math.round((capped/scoreCap)*impactMaximumPercent);
  let html = '';
  for (const [k,d] of Object.entries(gisData.facilities)) {
    if (d.count > 0) {
      const label = getFacilityLabel(k), icon = getFacilityIcon(k);
      const distText = d.distance !== null ? `(${d.distance}m)` : '';
      const contrib = Math.min(contributionCap, (d.score/scoreCap)*contributionCap);
      html += `<div class="gis-facility-row"><span class="label">${icon} ${label}</span><span class="value">${d.count} ${distText} • +${Math.round(contrib)}%</span></div>`;
    }
  }
  list.innerHTML = html || 'No nearby facilities found';
  window.gisImpactMultiplier = 1 + impact/100;
  window.gisImpactPercent = impact;
  scoreDisplay.innerHTML = `<span class="gis-impact-label">⭐ Location impact on valuation: +${impact}%</span><span class="gis-impact-detail">(based on ${gisData.count||0} nearby facilities)</span>`;
}
