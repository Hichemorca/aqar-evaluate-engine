function resetAll() {
  document.getElementById('city').value = 'dubai';
  document.getElementById('districtInput').value = '';
  document.getElementById('selectedDistrict').value = '';
  document.getElementById('selectedDistrictDisplay').textContent = 'None';
  districtResolveRequestId++;
  document.getElementById('districtAutocomplete').classList.remove('is-visible');
  document.getElementById('propType').value = 'apartment';
  document.getElementById('area').value = '120';
  document.getElementById('bedrooms').value = '2';
  document.getElementById('yearBuilt').value = '2020';
  document.getElementById('condition').value = 'good';
  document.getElementById('avgPriceSqm').value = '';
  document.getElementById('recentSalesCount').value = '';
  document.getElementById('annualRent').value = '';
  document.getElementById('annualExpenses').value = '';
  document.getElementById('landValue').value = '';
  document.getElementById('constructionCost').value = '';
  document.getElementById('projectBuildingInput').value = '';
  document.getElementById('bua').value = '';
  document.getElementById('plotArea').value = '';
  document.getElementById('lastRenovationYear').value = '';
  selectedProjectBuilding = '';
  document.getElementById('finishQuality').value = '';
  document.querySelectorAll('#viewTypeGroup input[type="checkbox"]').forEach(cb => { cb.checked = false; cb.closest('.checkbox-item').classList.remove('checked'); });
  document.getElementById('floorLevel').value = '';
  document.getElementById('streetPosition').value = '';
  document.getElementById('buildingCondition').value = '';
  document.getElementById('furnishedStatus').value = '';
  document.getElementById('gisLat').value = '';
  document.getElementById('gisLng').value = '';
  document.getElementById('gisCoordsRow').classList.add('js-hidden');
  document.getElementById('gisResult').classList.remove('is-visible');
  if (mapInitialized && gisMapInstance) {
    const dLat = 25.2048, dLng = 55.2708;
    gisMapInstance.setView([dLat, dLng], 11);
    if (gisMarker) gisMarker.setLatLng([dLat, dLng]);
    if (gisCircleLayer) gisCircleLayer.setLatLng([dLat, dLng]);
    document.getElementById('gisLat').value = dLat.toFixed(6);
    document.getElementById('gisLng').value = dLng.toFixed(6);
    document.getElementById('gisCoordsRow').classList.add('js-hidden');
    poiMarkers.forEach(m => gisMapInstance.removeLayer(m)); poiMarkers = [];
  }
  document.getElementById('scrapeStatus').innerHTML = '';
  document.getElementById('scrapedComps').innerHTML = '';
  document.getElementById('resultSection').classList.add('hidden');
  document.getElementById('resultSection').innerHTML = '';
  const observationConsent = document.getElementById('observationConsent');
  if (observationConsent) observationConsent.checked = false;
  const observationStatus = document.getElementById('observationStatus');
  if (observationStatus) observationStatus.textContent = '';
  document.querySelectorAll('#featuresGroup input:checked').forEach(cb => { cb.checked = false; cb.closest('.checkbox-item').classList.remove('checked'); });
  scrapedDistrictData = null;
  currentEvidenceState = AQAR_EVIDENCE_STATE.STATES.INSUFFICIENT;
  window.aqarEvidenceState = currentEvidenceState;
  gisData = null;
  window.gisImpactMultiplier = 1;
  window.gisImpactPercent = 0;
  onPropertyTypeChange();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  showToast('All fields cleared');
}
function saveToHistory(result, propData) {
  try {
    const h = JSON.parse(localStorage.getItem('aqar_history')||'[]');
    h.unshift({ date: new Date().toISOString(), value: result.finalValue, district: propData.district, type: propData.propType, area: propData.area, calibrationId: AQAR_ACTIVE_CALIBRATION.configId, calibrationUpdatedAt: AQAR_ACTIVE_CALIBRATION.updatedAt });
    localStorage.setItem('aqar_history', JSON.stringify(h.slice(0,5)));
  } catch(e) {}
}
