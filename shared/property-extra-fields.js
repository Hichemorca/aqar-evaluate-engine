(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.AQAR_PROPERTY_EXTRA_FIELDS = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const PROJECT_TYPES = Object.freeze(['apartment', 'villa', 'townhouse']);
  const BUA_TYPES = Object.freeze(['villa', 'townhouse']);
  const PLOT_TYPES = Object.freeze(['villa', 'townhouse', 'land']);
  const RENOVATION_TYPES = Object.freeze(['apartment', 'villa', 'townhouse']);
  const CURRENT_YEAR = 2026;

  function isTypeIn(type, list) { return list.includes(String(type || '').toLowerCase()); }

  function getVisibility(propertyType, yearBuilt, currentYear = CURRENT_YEAR) {
    const type = String(propertyType || '').toLowerCase();
    const year = Number(yearBuilt);
    return Object.freeze({
      projectBuilding: isTypeIn(type, PROJECT_TYPES),
      bua: isTypeIn(type, BUA_TYPES),
      plotArea: isTypeIn(type, PLOT_TYPES),
      renovationYear: isTypeIn(type, RENOVATION_TYPES) && Number.isFinite(year) && currentYear - year > 5
    });
  }

  function cleanOptionalNumber(value) {
    if (value === '' || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function validate(input = {}, currentYear = CURRENT_YEAR) {
    const errors = [];
    const type = String(input.propType || '').toLowerCase();
    const yearBuilt = cleanOptionalNumber(input.yearBuilt);
    const renovationYear = cleanOptionalNumber(input.lastRenovationYear);
    const visibility = getVisibility(type, yearBuilt, currentYear);
    const bua = cleanOptionalNumber(input.bua);
    const plotArea = cleanOptionalNumber(input.plotArea);

    if (visibility.bua && bua !== null && bua <= 0) errors.push({ field: 'bua', code: 'bua-must-be-positive' });
    if (visibility.plotArea && plotArea !== null && plotArea <= 0) errors.push({ field: 'plotArea', code: 'plot-area-must-be-positive' });
    if (visibility.renovationYear && renovationYear !== null) {
      if (!Number.isInteger(renovationYear) || renovationYear < 1900 || renovationYear > currentYear) errors.push({ field: 'lastRenovationYear', code: 'renovation-year-invalid' });
      if (yearBuilt !== null && renovationYear < yearBuilt) errors.push({ field: 'lastRenovationYear', code: 'renovation-before-construction' });
    }
    return Object.freeze({ valid: errors.length === 0, errors, visibility });
  }

  return Object.freeze({ CURRENT_YEAR, PROJECT_TYPES, BUA_TYPES, PLOT_TYPES, RENOVATION_TYPES, getVisibility, validate, cleanOptionalNumber });
});
