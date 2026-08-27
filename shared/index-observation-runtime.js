function buildObservationPayload(propData, result) {
  const verifiedProject = Boolean(selectedProjectBuilding && propData.projectBuildingSource === 'dld-suggestion' && propData.projectEvidenceCount >= Number(AQAR_V21_SHADOW_CONFIG.minProjectEvidence || 5));
  const projectValue = verifiedProject ? propData.projectBuilding : null;
  const trace = result.shadowTrace || {};
  return {
    consent: { analytics: true },
    property: {
      propertyType: propData.propType,
      district: propData.district,
      yearBuilt: propData.yearBuilt,
      area: propData.area,
      bedrooms: propData.bedrooms,
      detailedUnitType: propData.detailedUnitType,
      floor: propData.floor,
      parkingCount: propData.parkingCount,
      project: { value: projectValue, status: verifiedProject ? 'verified-dld' : 'unknown', source: verifiedProject ? 'dld-transactions' : null, normalizedKey: verifiedProject ? `${propData.propType}||${propData.district}||${propData.projectBuilding}`.toLowerCase() : null },
      bua: propData.bua,
      plotArea: propData.plotArea,
      lastRenovationYear: propData.lastRenovationYear
    },
    valuation: {
      baselineValue: result.finalValue,
      shadowValue: result.shadowValue || result.finalValue,
      shadowTrace: {
        projectMultiplier: trace.factors?.projectBuilding ?? 1,
        buaPlotMultiplier: trace.factors?.buaPlotArea ?? 1,
        renovationMultiplier: trace.factors?.lastRenovation ?? 1,
        combinedMultiplier: trace.multiplier ?? 1
      },
      calibrationConfigId: AQAR_ACTIVE_CALIBRATION.configId || 'base-22.1',
      evidenceState: propData.evidenceState
    }
  };
}
async function recordValuationObservation(propData, result) {
  const checkbox = document.getElementById('observationConsent');
  const status = document.getElementById('observationStatus');
  if (!checkbox?.checked) { if (status) { status.className = 'observation-status'; status.textContent = ''; } return; }
  if (status) { status.className = 'observation-status'; status.classList.add('loading'); status.textContent = 'Saving anonymous observation…'; }
  try {
    const response = await fetch('/api/valuation-observation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildObservationPayload(propData, result)) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    if (status) { status.className = 'observation-status success'; status.textContent = 'Thank you. Your anonymous observation was saved for analysis.'; }
    window.aqarLastObservationId = payload.observationId || null;
  } catch (error) {
    console.warn('Observation was not saved:', error.message);
    if (status) { status.className = 'observation-status warning'; status.textContent = 'Observation was not saved; your valuation is unaffected.'; }
  }
}
