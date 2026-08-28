const GIS_CACHE_PREFIX = 'miayaar:gis:v1:';
const GIS_CACHE_TTL_MS = 15 * 60 * 1000;
let gisInFlightKey = null;

function getGISCacheKey(lat, lng, radius) {
  const weights = AQAR_ACTIVE_CALIBRATION.gis?.facilityWeights || {};
  const weightKey = Object.entries(weights)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, weight]) => `${type}:${weight}`)
    .join('|');
  return `${GIS_CACHE_PREFIX}${lat.toFixed(6)}:${lng.toFixed(6)}:${radius}:${weightKey}`;
}

function readGISCache(key) {
  try {
    if (typeof sessionStorage === 'undefined') return undefined;
    const cached = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (!cached || !Number.isFinite(cached.cachedAt)) return undefined;
    if (Date.now() - cached.cachedAt > GIS_CACHE_TTL_MS) {
      sessionStorage.removeItem(key);
      return undefined;
    }
    return cached.result;
  } catch (error) {
    return undefined;
  }
}

function writeGISCache(key, result) {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(key, JSON.stringify({ cachedAt: Date.now(), result }));
  } catch (error) {
    // Storage may be unavailable or full; GIS remains fully functional without cache.
  }
}

function applyGISResult(result, lat, lng, radius) {
  if (result && result.count > 0) {
    gisData = { facilities: result.facilities, count: result.count, totalScore: result.totalScore, lat, lng, pois: result.pois };
    updateGISRadiusContext(radius, result.count);
    displayGISResult(gisData);
    addPOIsToMap(result.pois);
    return;
  }
  gisData = null;
  window.gisImpactMultiplier = 1;
  window.gisImpactPercent = 0;
  document.getElementById('gisResult').classList.remove('is-visible');
  poiMarkers.forEach(m => gisMapInstance.removeLayer(m));
  poiMarkers = [];
  updateGISRadiusContext(radius, result ? 0 : null);
  if (!result) document.getElementById('gisRadiusContext').textContent = 'Facility data is temporarily unavailable. Please try again; the map does not invent facilities.';
}

async function fetchGISData() {
  const lat = document.getElementById('gisLat').value.trim(), lng = document.getElementById('gisLng').value.trim();
  if (!lat || !lng) return;
  const a = parseFloat(lat), b = parseFloat(lng);
  if (isNaN(a) || isNaN(b)) return;
  const radius = getGISRadiusMeters();
  const cacheKey = getGISCacheKey(a, b, radius);
  if (gisInFlightKey === cacheKey) return;
  const requestId = ++gisRequestId;
  if (gisAbortController) gisAbortController.abort();
  const cachedResult = readGISCache(cacheKey);
  if (cachedResult !== undefined) {
    gisLoading = false;
    applyGISResult(cachedResult, a, b, radius);
    return;
  }
  gisAbortController = new AbortController();
  const requestSignal = gisAbortController.signal;
  gisInFlightKey = cacheKey;
  gisLoading = true;
  try {
    updateGISRadiusContext(radius, null);
    const result = await fetchPOIsFromOSM(a, b, radius, requestSignal);
    if (requestId !== gisRequestId || requestSignal.aborted) return;
    if (result) writeGISCache(cacheKey, result);
    applyGISResult(result, a, b, radius);
  } catch(e) {
    if (requestId !== gisRequestId || requestSignal.aborted) return;
    console.error('GIS Error:', e);
    applyGISResult(null, a, b, radius);
  } finally {
    if (requestId === gisRequestId) {
      gisLoading = false;
      gisAbortController = null;
      gisInFlightKey = null;
    }
  }
}
