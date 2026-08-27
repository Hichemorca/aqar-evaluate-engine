// District coordinate loading and map-safe HTML helpers for the public valuation page.
async function loadDistrictCoords() {
  try {
    const response = await fetch(`/data/district-coordinates.json?_district_coords=${Date.now()}`, { cache: 'no-store' });
    if (response.ok) {
      const data = await response.json();
      districtCoordsMap = data;
      console.log(`✅ Loaded ${Object.keys(districtCoordsMap).length} district coordinates`);
      return;
    }
  } catch (e) {
    console.warn('⚠️ Could not load district coordinates:', e.message);
  }
  districtCoordsMap = FALLBACK_COORDS;
  console.log(`📋 Using ${Object.keys(districtCoordsMap).length} fallback coordinates`);
}

function getDistrictCoords(district) {
  if (!district) return null;
  if (districtCoordsMap[district]) return districtCoordsMap[district];
  const lower = district.toLowerCase();
  for (const [key, value] of Object.entries(districtCoordsMap)) {
    if (key.toLowerCase() === lower) return value;
  }
  for (const [key, value] of Object.entries(districtCoordsMap)) {
    if (key.toLowerCase().includes(lower) || lower.includes(key.toLowerCase())) return value;
  }
  return null;
}

function escapeMapHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }
