function updateMapMarker(lat, lng) {
  if (!mapInitialized) return;
  const a = parseFloat(lat), b = parseFloat(lng);
  if (isNaN(a) || isNaN(b)) return;
  if (gisMarker) gisMarker.setLatLng([a, b]);
  if (gisCircleLayer) gisCircleLayer.setLatLng([a, b]);
  if (projectMapLabelMarker) projectMapLabelMarker.setLatLng([a, b]);
  document.getElementById('gisLat').value = a.toFixed(6);
  document.getElementById('gisLng').value = b.toFixed(6);
  document.getElementById('gisCoordsRow').classList.add('js-hidden');
  updateProjectMapLabel();
}

function addPOIsToMap(pois) {
  poiMarkers.forEach(m => gisMapInstance.removeLayer(m)); poiMarkers = [];
  if (!pois || !pois.length) return;
  const emojis = { school: '🏫', hospital: '🏥', supermarket: '🛒', metro: '🚇', park: '🌳', gym: '🏋️', cafe: '☕', restaurant: '🍽️' };
  const colors = { school: '#f39c12', hospital: '#e74c3c', supermarket: '#2ecc71', metro: '#3498db', park: '#27ae60', gym: '#9b59b6', cafe: '#f1c40f', restaurant: '#e67e22' };
  pois.slice(0,30).forEach(p => {
    const poiClass = colors[p.type] ? `poi-${p.type}` : 'poi-default';
    const icon = L.divIcon({ className: 'custom-poi-icon', html: `<div class="poi-marker ${poiClass}">${emojis[p.type]||'📍'}</div>`, iconSize: [22,22], iconAnchor: [11,11], popupAnchor: [0,-11] });
    const marker = L.marker([p.lat, p.lng], { icon, zIndexOffset: 700 }).addTo(gisMapInstance).bindPopup(`<strong>${p.type.charAt(0).toUpperCase()+p.type.slice(1)}</strong><br>${p.name}<br><span class="poi-popup-distance">${(p.distance*1000).toFixed(0)}m away</span>`);
    poiMarkers.push(marker);
  });
}

function initGISMap() {
  try {
    const container = document.getElementById('gisMap');
    if (!container) { console.warn('GIS Map container not found'); return; }
    const dLat = 25.2048, dLng = 55.2708;
    gisMapInstance = L.map('gisMap').setView([dLat, dLng], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(gisMapInstance);
    gisMarker = L.marker([dLat, dLng], { draggable: true }).addTo(gisMapInstance);
    const gisRadiusMeters = getGISRadiusMeters();
    document.getElementById('gisRadius').value = String(gisRadiusMeters);
    gisCircleLayer = L.circle([dLat, dLng], { radius: gisRadiusMeters, color: '#d4920e', fillColor: '#d4920e', fillOpacity: 0.1, weight: 2 }).addTo(gisMapInstance);
    document.getElementById('gisLat').value = dLat.toFixed(6);
    document.getElementById('gisLng').value = dLng.toFixed(6);
    document.getElementById('gisCoordsRow').classList.add('js-hidden');
    gisMapInstance.on('click', e => {
      updateMapMarker(e.latlng.lat, e.latlng.lng);
      updateDistrictFromMapPoint(e.latlng.lat, e.latlng.lng);
      prepareGISRefresh();
      debouncedFetchGISData();
    });
    gisMarker.on('dragend', e => {
      const p = e.target.getLatLng();
      updateMapMarker(p.lat, p.lng);
      updateDistrictFromMapPoint(p.lat, p.lng);
      prepareGISRefresh();
      debouncedFetchGISData();
    });
    mapInitialized = true;
    updateProjectMapLabel();
    setTimeout(() => debouncedFetchGISData(), 500);
  } catch(e) { console.warn('Leaflet map init failed:', e); document.getElementById('gisMap').innerHTML = '<div class="gis-map-unavailable">🗺️ Map unavailable</div>'; }
}
