// Small GIS helpers shared by the public valuation page.
function getGISRadiusMeters() {
  return Number(AQAR_ACTIVE_CALIBRATION.gis?.distanceRadiusMeters || 1000);
}

function updateGISRadiusContext(radius = getGISRadiusMeters(), count = null) {
  const context = document.getElementById('gisRadiusContext');
  if (!context) return;
  const roundedRadius = Math.round(Number(radius) || 0);
  if (count === null) context.textContent = `Searching for vital facilities within ${roundedRadius}m of the current map marker…`;
  else if (count > 0) context.textContent = `Showing ${count} vital facilities within ${roundedRadius}m of the current map marker.`;
  else context.textContent = `No mapped vital facilities found within ${roundedRadius}m of the current map marker.`;
}

function getFacilityLabel(k) { const labels = { metro:'Metro', supermarket:'Supermarket', school:'School', hospital:'Hospital', park:'Park', gym:'Gym / Fitness Center', cafe:'Cafe', restaurant:'Restaurant' }; return labels[k]||k; }

function getFacilityIcon(k) { const icons = { metro:'🚇', supermarket:'🛒', school:'🏫', hospital:'🏥', park:'🌳', gym:'🏋️', cafe:'☕', restaurant:'🍽️' }; return icons[k]||'📍'; }

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
