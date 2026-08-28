function updateProjectMapLabel() {
  const label = document.getElementById('gisProjectLabel');
  const input = document.getElementById('projectBuildingInput');
  const value = input?.value.trim() || '';
  const district = document.getElementById('selectedDistrict')?.value || document.getElementById('districtInput')?.value || '';
  if (!label || !gisMapInstance || !value) {
    if (projectMapLabelMarker && gisMapInstance) gisMapInstance.removeLayer(projectMapLabelMarker);
    projectMapLabelMarker = null;
    if (label) { label.classList.remove('is-visible'); label.textContent = ''; }
    return;
  }
  const verified = Boolean(selectedProjectBuilding && selectedProjectBuilding.toLowerCase() === value.toLowerCase() && getProjectEvidence(value).verified);
  const sourceText = verified ? 'Project name; map point is the current selected marker.' : 'User-entered name; not verified and not used to invent a project location.';
  const a = parseFloat(document.getElementById('gisLat')?.value), b = parseFloat(document.getElementById('gisLng')?.value);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return;
  const html = `<div class="project-map-label">${escapeMapHtml(value)}</div>`;
  const popup = `<strong>Project / Building</strong><br>${escapeMapHtml(value)}<br><span class="project-map-popup-source">${escapeMapHtml(sourceText)}${district ? `<br>District: ${escapeMapHtml(district)}` : ''}</span>`;
  const icon = L.divIcon({ className: 'project-map-label-icon', html, iconSize: [1, 1], iconAnchor: [-8, 18], popupAnchor: [8, -18] });
  if (!projectMapLabelMarker) projectMapLabelMarker = L.marker([a, b], { icon, interactive: true, zIndexOffset: 500 }).addTo(gisMapInstance);
  else projectMapLabelMarker.setLatLng([a, b]).setIcon(icon);
  projectMapLabelMarker.bindPopup(popup);
  label.innerHTML = `🏢 <b>${escapeMapHtml(value)}</b> <span class="project-map-source">— ${escapeMapHtml(sourceText)}</span>`;
  label.classList.add('is-visible');
}

async function resolveDistrictCoords(district) {
  const cached = resolvedDistrictCoords[AQAR_DISTRICT_MAP_LINKING.normalizeName(district)];
  if (cached) return cached;
  const local = getDistrictCoords(district);
  if (local) return local;
  try {
    const query = encodeURIComponent(`${district}, Dubai, United Arab Emirates`);
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ae&q=${query}`, { headers: { 'Accept-Language': 'en' } });
    if (!response.ok) return null;
    const results = await response.json();
    const result = results?.[0];
    const lat = Number(result?.lat), lng = Number(result?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 24.5 || lat > 25.8 || lng < 54.7 || lng > 55.8) return null;
    const coords = { lat, lng };
    resolvedDistrictCoords[AQAR_DISTRICT_MAP_LINKING.normalizeName(district)] = coords;
    districtCoordsMap[district] = coords;
    return coords;
  } catch (error) {
    console.warn('District geocoding unavailable:', error.message);
    return null;
  }
}

async function selectDistrict(d) {
  document.getElementById('districtInput').value = d;
  document.getElementById('selectedDistrict').value = d;
  document.getElementById('selectedDistrictDisplay').textContent = d;
  hideAutocompleteList(document.getElementById('districtAutocomplete'));
  refreshProjectSuggestions();
  const requestId = ++districtResolveRequestId;
  const c = await resolveDistrictCoords(d);
  if (requestId !== districtResolveRequestId) return;
  if (c) {
    updateMapMarker(c.lat, c.lng);
    if (gisMapInstance) gisMapInstance.setView([c.lat, c.lng], 14);
    prepareGISRefresh();
  } else {
    document.getElementById('selectedDistrictDisplay').textContent = `${d} (map location unavailable)`;
    showToast('Map location unavailable for this district');
  }
}

function updateDistrictFromMapPoint(lat, lng) {
  const match = AQAR_DISTRICT_MAP_LINKING?.findNearestDistrict(
    lat,
    lng,
    dubaiDistrictsList,
    districtCoordsMap,
    MAP_DISTRICT_MATCH_MAX_KM
  );
  const input = document.getElementById('districtInput');
  const hidden = document.getElementById('selectedDistrict');
  const display = document.getElementById('selectedDistrictDisplay');
  if (match) {
    input.value = match.name;
    hidden.value = match.name;
    display.textContent = match.name;
    refreshProjectSuggestions();
    return match;
  }
  const previousDistrict = hidden.value || input.value.trim();
  if (previousDistrict) {
    input.value = previousDistrict;
    hidden.value = previousDistrict;
    display.textContent = `${previousDistrict} (map point outside matched DLD radius)`;
    refreshProjectSuggestions();
    return null;
  }
  input.value = '';
  hidden.value = '';
  display.textContent = 'No matching area';
  selectedProjectBuilding = '';
  const projectInput = document.getElementById('projectBuildingInput');
  if (projectInput) projectInput.value = '';
  refreshProjectSuggestions();
  return null;
}
