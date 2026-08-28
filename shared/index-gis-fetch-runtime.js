// GIS refresh and POI fetch runtime for the public valuation page.

function setGISLoadButtonState(loading) {
  const button = document.getElementById('btnLoadFacilities');
  const label = document.getElementById('gisLoadButtonLabel');
  const spinner = document.getElementById('gisLoadButtonSpinner');
  if (!button) return;
  button.disabled = loading || !mapInitialized;
  button.setAttribute('aria-busy', String(loading));
  if (label) label.textContent = loading ? 'Loading nearby facilities…' : 'Load Nearby Facilities';
  if (spinner) spinner.classList.toggle('js-hidden', !loading);
}

function setGISLoadStatus(message) {
  const status = document.getElementById('gisLoadStatus');
  if (status) status.textContent = message || '';
}

async function loadNearbyFacilities() {
  if (!mapInitialized || gisLoading) return;
  setGISLoadButtonState(true);
  setGISLoadStatus('Loading nearby facilities…');
  try {
    await fetchGISData();
    if (gisData?.count > 0) setGISLoadStatus(`Loaded ${gisData.count} nearby facilities.`);
    else setGISLoadStatus('No mapped vital facilities found in the selected radius.');
  } finally {
    setGISLoadButtonState(false);
  }
}

function prepareGISRefresh() {
  gisRequestId++;
  if (gisAbortController) gisAbortController.abort();
  gisAbortController = null;
  gisLoading = false;
  gisData = null;
  window.gisImpactMultiplier = 1;
  window.gisImpactPercent = 0;
  poiMarkers.forEach(marker => gisMapInstance?.removeLayer(marker));
  poiMarkers = [];
  const radius = getGISRadiusMeters();
  const context = document.getElementById('gisRadiusContext');
  if (context) context.textContent = `Facilities will be searched within ${Math.round(radius)}m of the marker.`;
  setGISLoadStatus('');
  setGISLoadButtonState(false);
  const result = document.getElementById('gisResult');
  if (result) result.classList.remove('is-visible');
}
function debouncedFetchGISData() { if (gisFetchTimeout) clearTimeout(gisFetchTimeout); gisFetchTimeout = setTimeout(() => fetchGISData(), 800); }
async function fetchPOIsFromOSM(lat, lng, radius = 1000, requestSignal = null) {
  const buildResultFromServer = payload => {
    const keys = ['school', 'hospital', 'supermarket', 'metro', 'park', 'gym', 'cafe', 'restaurant'];
    const facilities = Object.fromEntries(keys.map(key => [key, { count: 0, distance: null, score: 0 }]));
    const pois = [];
    for (const poi of Array.isArray(payload?.pois) ? payload.pois : []) {
      if (!facilities[poi.type] || !Number.isFinite(Number(poi.lat)) || !Number.isFinite(Number(poi.lng))) continue;
      const distanceKm = Number(poi.distance);
      const distance = Number.isFinite(distanceKm) ? distanceKm : haversineDistance(lat, lng, Number(poi.lat), Number(poi.lng));
      if (distance > radius / 1000) continue;
      pois.push({ type: poi.type, name: String(poi.name || `${poi.type} (${pois.length + 1})`), lat: Number(poi.lat), lng: Number(poi.lng), distance });
      facilities[poi.type].count += 1;
      const distanceMeters = Math.round(distance * 1000);
      if (facilities[poi.type].distance === null || distanceMeters < facilities[poi.type].distance) facilities[poi.type].distance = distanceMeters;
    }
    const weights = AQAR_ACTIVE_CALIBRATION.gis?.facilityWeights || { school: 15, hospital: 20, supermarket: 12, metro: 25, park: 10, gym: 8, cafe: 5, restaurant: 5 };
    let totalScore = 0;
    for (const [type, details] of Object.entries(facilities)) {
      if (details.count > 0) {
        const score = Math.round((weights[type] || 5) * Math.max(0, 1 - (details.distance / 1000)) * 10) / 10;
        details.score = score;
        totalScore += score;
      }
    }
    return { pois, facilities, totalScore, count: pois.length };
  };
  const serverTimeoutController = new AbortController();
  const serverTimeout = setTimeout(() => serverTimeoutController.abort(), 10000);
  try {
    const serverSignal = requestSignal && typeof AbortSignal !== 'undefined' && AbortSignal.any
      ? AbortSignal.any([requestSignal, serverTimeoutController.signal])
      : serverTimeoutController.signal;
    const serverResponse = await fetch(`/.netlify/functions/fetch-osm?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&radius=${encodeURIComponent(radius)}`, { cache: 'no-store', signal: serverSignal });
    if (serverResponse.ok) {
      const serverPayload = await serverResponse.json();
      if (Array.isArray(serverPayload.pois)) return buildResultFromServer(serverPayload);
    }
  } catch (error) {
    if (!requestSignal?.aborted) console.warn('⚠️ Same-origin OSM function failed; trying public Overpass endpoints:', error.message);
  } finally {
    clearTimeout(serverTimeout);
  }
  const qs = [
    `node["amenity"="school"](around:${radius},${lat},${lng});`,
    `way["amenity"="school"](around:${radius},${lat},${lng});`,
    `node["amenity"="hospital"](around:${radius},${lat},${lng});`,
    `way["amenity"="hospital"](around:${radius},${lat},${lng});`,
    `node["shop"="supermarket"](around:${radius},${lat},${lng});`,
    `way["shop"="supermarket"](around:${radius},${lat},${lng});`,
    `node["railway"="station"](around:${radius},${lat},${lng});`,
    `way["railway"="station"](around:${radius},${lat},${lng});`,
    `node["leisure"="park"](around:${radius},${lat},${lng});`,
    `way["leisure"="park"](around:${radius},${lat},${lng});`,
    `node["leisure"="fitness_centre"](around:${radius},${lat},${lng});`,
    `way["leisure"="fitness_centre"](around:${radius},${lat},${lng});`,
    `node["amenity"="cafe"](around:${radius},${lat},${lng});`,
    `way["amenity"="cafe"](around:${radius},${lat},${lng});`,
    `node["amenity"="restaurant"](around:${radius},${lat},${lng});`,
    `way["amenity"="restaurant"](around:${radius},${lat},${lng});`
  ];
  const query = `[out:json][timeout:25];(${qs.join('')});out center;`;
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter'
  ];
  let data = null;
  for (const endpoint of endpoints) {
          const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 18000);
      const signal = requestSignal && typeof AbortSignal !== 'undefined' && AbortSignal.any ? AbortSignal.any([requestSignal, controller.signal]) : controller.signal;
      try {
        const resp = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `data=${encodeURIComponent(query)}`, signal });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      data = await resp.json();
      if (data && Array.isArray(data.elements)) break;
      throw new Error('Invalid Overpass response');
    } catch (error) {
      console.warn(`⚠️ Overpass endpoint failed (${endpoint}):`, error.name === 'AbortError' ? 'timeout' : error.message);
    } finally {
      clearTimeout(timeout);
    }
  }
  if (!data || !Array.isArray(data.elements)) return null;
  try {
    const pois = [], facilities = { school: { count: 0, distance: null, score: 0 }, hospital: { count: 0, distance: null, score: 0 }, supermarket: { count: 0, distance: null, score: 0 }, metro: { count: 0, distance: null, score: 0 }, park: { count: 0, distance: null, score: 0 }, gym: { count: 0, distance: null, score: 0 }, cafe: { count: 0, distance: null, score: 0 }, restaurant: { count: 0, distance: null, score: 0 } };
    const weights = AQAR_ACTIVE_CALIBRATION.gis?.facilityWeights || { school: 15, hospital: 20, supermarket: 12, metro: 25, park: 10, gym: 8, cafe: 5, restaurant: 5 };
    const typeMap = { 'school':'school','hospital':'hospital','supermarket':'supermarket','station':'metro','park':'park','fitness_centre':'gym','cafe':'cafe','restaurant':'restaurant' };
    data.elements.forEach(el => {
      const lat2 = el.lat || el.center?.lat, lng2 = el.lon || el.center?.lng;
      if (!lat2 || !lng2) return;
      const tags = el.tags || {};
      let type = null;
      if (tags.amenity === 'school' || tags.amenity === 'hospital' || tags.amenity === 'cafe' || tags.amenity === 'restaurant') type = typeMap[tags.amenity] || tags.amenity;
      else if (tags.shop === 'supermarket') type = 'supermarket';
      else if (tags.railway === 'station') type = 'metro';
      else if (tags.leisure === 'park' || tags.leisure === 'fitness_centre') type = typeMap[tags.leisure] || tags.leisure;
      if (!type || !facilities[type]) return;
      const dist = haversineDistance(lat, lng, lat2, lng2);
      if (dist <= radius/1000) {
        const name = tags.name || tags['name:en'] || `${type} (${el.id})`;
        pois.push({ type, name, lat: lat2, lng: lng2, distance: dist });
        facilities[type].count++;
        if (facilities[type].distance === null || dist < facilities[type].distance) facilities[type].distance = Math.round(dist*1000);
      }
    });
    let totalScore = 0;
    for (const [t,d] of Object.entries(facilities)) { if (d.count > 0) { const w = weights[t]||5; const df = Math.max(0,1-(d.distance/1000)); d.score = Math.round((w*df)*10)/10; totalScore += d.score; } }
    return { pois, facilities, totalScore, count: pois.length };
  } catch(e) { console.warn('⚠️ Overpass API error:', e.message); return null; }
}

