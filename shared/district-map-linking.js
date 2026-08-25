(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.AQAR_DISTRICT_MAP_LINKING = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function normalizeName(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[’'`]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function distanceKm(lat1, lng1, lat2, lng2) {
    const earthRadiusKm = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function findNearestDistrict(lat, lng, districtNames, coordinates, maxDistanceKm = 3) {
    const pointLat = Number(lat);
    const pointLng = Number(lng);
    if (!Number.isFinite(pointLat) || !Number.isFinite(pointLng)) return null;
    if (!Array.isArray(districtNames) || !districtNames.length || !coordinates) return null;

    const coordinateEntries = Object.entries(coordinates);
    let nearest = null;
    for (const name of districtNames) {
      const target = normalizeName(name);
      if (!target) continue;
      const entry = coordinateEntries.find(([key]) => normalizeName(key) === target)
        || coordinateEntries.find(([key]) => {
          const normalizedKey = normalizeName(key);
          return normalizedKey.includes(target) || target.includes(normalizedKey);
        });
      if (!entry) continue;
      const [coordinateName, coordinate] = entry;
      const candidateLat = Number(coordinate?.lat);
      const candidateLng = Number(coordinate?.lng);
      if (!Number.isFinite(candidateLat) || !Number.isFinite(candidateLng)) continue;
      const distance = distanceKm(pointLat, pointLng, candidateLat, candidateLng);
      if (distance <= maxDistanceKm && (!nearest || distance < nearest.distanceKm)) {
        nearest = { name, coordinateName, distanceKm: Number(distance.toFixed(3)) };
      }
    }
    return nearest;
  }

  return { normalizeName, distanceKm, findNearestDistrict };
});
