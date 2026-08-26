(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.AQAR_V21_SHADOW_MULTIPLIERS = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const RESIDENTIAL_TYPES = Object.freeze(['apartment', 'villa', 'townhouse']);
  const BUA_PLOT_TYPES = Object.freeze(['villa', 'townhouse']);
  const NEUTRAL = 1;
  const DEFAULT_MIN_EVIDENCE = 5;
  const DEFAULT_COMBINED_MIN = 0.85;
  const DEFAULT_COMBINED_MAX = 1.15;

  function numberOr(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalize(value) { return String(value || '').trim().toLowerCase(); }
  function keyForProject(input) { return `${normalize(input?.propType)}|${normalize(input?.district)}|${normalize(input?.projectBuilding)}`; }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

  function neutralBandConfig() {
    return [
      { maxRatio: 0.25, multiplier: NEUTRAL },
      { maxRatio: 0.5, multiplier: NEUTRAL },
      { maxRatio: 0.75, multiplier: NEUTRAL },
      { maxRatio: 1, multiplier: NEUTRAL },
      { maxRatio: null, multiplier: NEUTRAL }
    ];
  }

  function createNeutralConfig() {
    const propertyTypes = {};
    for (const type of ['apartment', 'villa', 'townhouse', 'office', 'retail', 'warehouse', 'land']) {
      propertyTypes[type] = {
        projectBuilding: { defaultMultiplier: NEUTRAL, projectMultipliers: {} },
        buaPlotArea: { bands: neutralBandConfig() },
        lastRenovation: { bands: [
          { maxAgeYears: 2, multiplier: NEUTRAL },
          { maxAgeYears: 5, multiplier: NEUTRAL },
          { maxAgeYears: 10, multiplier: NEUTRAL },
          { maxAgeYears: null, multiplier: NEUTRAL }
        ] }
      };
    }
    return {
      schemaVersion: 1,
      enabled: false,
      minProjectEvidence: DEFAULT_MIN_EVIDENCE,
      combinedMinimumMultiplier: DEFAULT_COMBINED_MIN,
      combinedMaximumMultiplier: DEFAULT_COMBINED_MAX,
      propertyTypes
    };
  }

  function getTypeConfig(config, type) {
    return config?.propertyTypes?.[type] || {};
  }

  function resolveBand(bands, metric, metricKey) {
    if (!Array.isArray(bands) || !Number.isFinite(metric)) return null;
    for (const band of bands) {
      const rawLimit = band?.[metricKey];
      const limit = rawLimit === null || rawLimit === undefined ? Infinity : Number(rawLimit);
      if (metric <= limit) return numberOr(band?.multiplier, NEUTRAL);
    }
    return null;
  }

  function compute(input = {}, config = createNeutralConfig()) {
    const type = normalize(input.propType);
    const typeConfig = getTypeConfig(config, type);
    const factors = { projectBuilding: NEUTRAL, buaPlotArea: NEUTRAL, lastRenovation: NEUTRAL };
    const applied = [];
    const skipped = [];
    if (!config?.enabled) return { multiplier: NEUTRAL, factors, applied, skipped: [{ field: 'all', reason: 'shadow multipliers are disabled' }] };

    if (RESIDENTIAL_TYPES.includes(type) && input.projectBuilding && input.projectBuildingSource === 'dld-suggestion') {
      const evidenceCount = numberOr(input.projectEvidenceCount, 0);
      const minimumEvidence = Math.max(1, numberOr(config.minProjectEvidence, DEFAULT_MIN_EVIDENCE));
      const projectKey = keyForProject(input);
      const configured = typeConfig.projectBuilding?.projectMultipliers?.[projectKey] ?? typeConfig.projectBuilding?.defaultMultiplier ?? NEUTRAL;
      if (evidenceCount >= minimumEvidence && Number.isFinite(Number(configured))) {
        factors.projectBuilding = numberOr(configured, NEUTRAL);
        applied.push({ field: 'projectBuilding', value: input.projectBuilding, evidenceCount, multiplier: factors.projectBuilding, source: 'DLD-project-config' });
      } else {
        skipped.push({ field: 'projectBuilding', reason: evidenceCount < minimumEvidence ? 'insufficient-project-evidence' : 'project-multiplier-not-configured', evidenceCount });
      }
    } else if (input.projectBuilding) {
      skipped.push({ field: 'projectBuilding', reason: 'project-is-not-a-verified-DLD-suggestion' });
    }

    const bua = numberOr(input.bua, NaN);
    const plotArea = numberOr(input.plotArea, NaN);
    if (BUA_PLOT_TYPES.includes(type) && bua > 0 && plotArea > 0) {
      const ratio = bua / plotArea;
      const multiplier = resolveBand(typeConfig.buaPlotArea?.bands, ratio, 'maxRatio');
      if (Number.isFinite(multiplier)) {
        factors.buaPlotArea = multiplier;
        applied.push({ field: 'buaPlotArea', ratio, multiplier });
      } else skipped.push({ field: 'buaPlotArea', reason: 'no-ratio-band' });
    } else if (bua || plotArea) skipped.push({ field: 'buaPlotArea', reason: 'requires-positive-BUA-and-Plot-Area-for-villa-or-townhouse' });

    const renovationYear = numberOr(input.lastRenovationYear, NaN);
    const currentYear = numberOr(input.currentYear, 2026);
    if (RESIDENTIAL_TYPES.includes(type) && Number.isFinite(renovationYear)) {
      const ageYears = Math.max(0, currentYear - renovationYear);
      const multiplier = resolveBand(typeConfig.lastRenovation?.bands, ageYears, 'maxAgeYears');
      if (Number.isFinite(multiplier)) {
        factors.lastRenovation = multiplier;
        applied.push({ field: 'lastRenovation', ageYears, multiplier });
      } else skipped.push({ field: 'lastRenovation', reason: 'no-renovation-age-band' });
    }

    const raw = factors.projectBuilding * factors.buaPlotArea * factors.lastRenovation;
    const minimum = numberOr(config.combinedMinimumMultiplier, DEFAULT_COMBINED_MIN);
    const maximum = numberOr(config.combinedMaximumMultiplier, DEFAULT_COMBINED_MAX);
    const multiplier = clamp(raw, Math.min(minimum, maximum), Math.max(minimum, maximum));
    return { multiplier, rawMultiplier: raw, factors, applied, skipped, bounds: { minimum, maximum } };
  }

  return Object.freeze({ RESIDENTIAL_TYPES, BUA_PLOT_TYPES, NEUTRAL, createNeutralConfig, compute, keyForProject, normalize });
});
