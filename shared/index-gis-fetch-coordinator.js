async function fetchGISData() {
  const lat = document.getElementById('gisLat').value.trim(), lng = document.getElementById('gisLng').value.trim();
  if (!lat || !lng) return;
  const requestId = ++gisRequestId;
  if (gisAbortController) gisAbortController.abort();
  gisAbortController = new AbortController();
  const requestSignal = gisAbortController.signal;
  gisLoading = true;
  try {
    const a = parseFloat(lat), b = parseFloat(lng);
    if (isNaN(a) || isNaN(b)) return;
    const radius = getGISRadiusMeters();
    updateGISRadiusContext(radius, null);
    const result = await fetchPOIsFromOSM(a, b, radius, requestSignal);
    if (requestId !== gisRequestId || requestSignal.aborted) return;
    if (result && result.count > 0) {
      gisData = { facilities: result.facilities, count: result.count, totalScore: result.totalScore, lat: a, lng: b, pois: result.pois };
      updateGISRadiusContext(radius, result.count);
      displayGISResult(gisData);
      addPOIsToMap(result.pois);
    } else {
      gisData = null;
      window.gisImpactMultiplier = 1;
      window.gisImpactPercent = 0;
      document.getElementById('gisResult').classList.remove('is-visible');
      poiMarkers.forEach(m => gisMapInstance.removeLayer(m));
      poiMarkers = [];
      updateGISRadiusContext(radius, result ? 0 : null);
      if (!result) document.getElementById('gisRadiusContext').textContent = `Facility data is temporarily unavailable. Please try again; the map does not invent facilities.`;
    }
  } catch(e) {
    if (requestId !== gisRequestId || requestSignal.aborted) return;
    console.error('GIS Error:', e);
    gisData = null;
    window.gisImpactMultiplier = 1;
    window.gisImpactPercent = 0;
    document.getElementById('gisResult').classList.remove('is-visible');
    poiMarkers.forEach(m => gisMapInstance.removeLayer(m));
    poiMarkers = [];
    updateGISRadiusContext(getGISRadiusMeters(), 0);
  } finally {
    if (requestId === gisRequestId) { gisLoading = false; gisAbortController = null; }
  }
}
