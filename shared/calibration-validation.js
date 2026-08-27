const calibrationDefaults = require('./aqar-calibration-defaults');

function deepMergeKnown(base, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return base;
  const output = { ...base };
  for (const [key, value] of Object.entries(input)) {
    if (!Object.prototype.hasOwnProperty.call(base, key)) continue;
    if (key === 'projectMultipliers' && value && typeof value === 'object' && !Array.isArray(value) && base[key] && typeof base[key] === 'object') {
      output[key] = { ...base[key], ...value };
      continue;
    }
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      base[key] &&
      typeof base[key] === 'object' &&
      !Array.isArray(base[key])
    ) {
      output[key] = deepMergeKnown(base[key], value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

function validateDomain(path, value, errors) {
  const fail = (message) => errors.push(`${path} ${message}`);
  const range = (minimum, maximum) => {
    if (value < minimum || value > maximum) fail(`must be between ${minimum} and ${maximum}`);
  };

  if (path.startsWith('gis.')) {
    if (path.startsWith('gis.facilityWeights.')) return range(0, 100);
    if (path === 'gis.distanceRadiusMeters') return range(100, 5000);
    if (path === 'gis.scoreCap') return range(0.01, 10);
    if (path === 'gis.impactMaximumPercent') return range(0, 100);
    if (path === 'gis.facilityContributionCap') return range(0.01, 10);
    if (path === 'gis.distanceDecayBaseKm') return range(0.01, 20);
    if (path === 'gis.proximityFactorPerScore') return range(-1, 1);
    if (path === 'gis.proximityMinimumMultiplier' || path === 'gis.proximityMaximumMultiplier') return range(0.01, 2);
  }

  if (path.includes('.coefficients.')) {
    const field = path.split('.').at(-1);
    if (field === 'years') {
      if (!Number.isInteger(value) || value < 1 || value > 50) fail('must be an integer between 1 and 50');
      return;
    }
    if (['vacancyRatePercent', 'capRatePercent'].includes(field)) return range(0, 100);
    if ([
      'ageDepreciation', 'expenseRate', 'landValueFromMarketShare', 'landValueFromBuildShare',
      'depreciationPerYear', 'maximumDepreciation', 'rentGrowthRate', 'valueGrowthRate',
      'netOperatingIncomeRate', 'terminalValueRate', 'discountRate', 'fallbackCapRate'
    ].includes(field)) return range(0, 1);
    if (['maxPricePerSqm', 'featureBonusPerSqm', 'constructionCostPerSqm'].includes(field)) return range(0, 100000000);
    if (path.includes('Factors.') || field.includes('Multiplier') || field.includes('Factor')) return range(0.01, 5);
    if (value < 0) fail('must not be negative');
  }
}

function validateNumericLeaves(value, path, errors) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) errors.push(`${path} must be finite`);
    else validateDomain(path, value, errors);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    validateNumericLeaves(child, `${path}.${key}`, errors);
  }
}

function validateV21ShadowConfig(shadow, errors) {
  if (!shadow || typeof shadow !== 'object') { errors.push('v21ShadowMultipliers must be an object'); return; }
  if (typeof shadow.enabled !== 'boolean') errors.push('v21ShadowMultipliers.enabled must be boolean');
  if (!Number.isInteger(Number(shadow.minProjectEvidence)) || Number(shadow.minProjectEvidence) < 1) errors.push('v21ShadowMultipliers.minProjectEvidence must be a positive integer');
  const minimum = Number(shadow.combinedMinimumMultiplier);
  const maximum = Number(shadow.combinedMaximumMultiplier);
  if (!Number.isFinite(minimum) || minimum <= 0) errors.push('v21ShadowMultipliers.combinedMinimumMultiplier must be positive');
  if (!Number.isFinite(maximum) || maximum <= 0 || maximum < minimum) errors.push('v21ShadowMultipliers.combinedMaximumMultiplier must be >= minimum');
  for (const propertyType of calibrationDefaults.PROPERTY_TYPES) {
    const typeConfig = shadow.propertyTypes?.[propertyType];
    if (!typeConfig) { errors.push(`v21ShadowMultipliers missing property type: ${propertyType}`); continue; }
    const project = typeConfig.projectBuilding || {};
    for (const [key, value] of Object.entries(project.projectMultipliers || {})) {
      if (!Number.isFinite(Number(value)) || Number(value) <= 0) errors.push(`${propertyType}.projectBuilding.projectMultipliers.${key} must be positive`);
    }
    if (!Number.isFinite(Number(project.defaultMultiplier)) || Number(project.defaultMultiplier) <= 0) errors.push(`${propertyType}.projectBuilding.defaultMultiplier must be positive`);
    for (const [group, metricKey] of [['buaPlotArea', 'maxRatio'], ['lastRenovation', 'maxAgeYears']]) {
      const bands = typeConfig[group]?.bands;
      if (!Array.isArray(bands) || !bands.length) { errors.push(`${propertyType}.${group}.bands must be a non-empty array`); continue; }
      let previous = -Infinity;
      bands.forEach((band, index) => {
        const limit = band?.[metricKey] === null ? Infinity : Number(band?.[metricKey]);
        if (!Number.isFinite(limit) && limit !== Infinity) errors.push(`${propertyType}.${group}.bands[${index}].${metricKey} must be finite or null`);
        if (limit < previous) errors.push(`${propertyType}.${group}.bands must be ordered`);
        previous = limit;
        if (!Number.isFinite(Number(band?.multiplier)) || Number(band.multiplier) <= 0) errors.push(`${propertyType}.${group}.bands[${index}].multiplier must be positive`);
      });
    }
  }
}

function validateConfig(config) {
  const errors = [];
  if (!config || typeof config !== 'object') errors.push('configuration must be an object');
  if (config?.schemaVersion !== 1) errors.push('schemaVersion must be 1');

  for (const propertyType of calibrationDefaults.PROPERTY_TYPES) {
    const property = config?.propertyTypes?.[propertyType];
    if (!property) {
      errors.push(`missing property type: ${propertyType}`);
      continue;
    }

    for (const method of calibrationDefaults.METHOD_KEYS) {
      const weight = property.weights?.[method];
      if (!Number.isFinite(Number(weight)) || Number(weight) < 0 || Number(weight) > 1) {
        errors.push(`${propertyType}.weights.${method} must be between 0 and 1`);
      }
    }

    const applicable = new Set(property.applicableMethods || []);
    if ([...applicable].some((method) => !calibrationDefaults.METHOD_KEYS.includes(method))) {
      errors.push(`${propertyType}.applicableMethods contains an unknown method`);
    }

    const applicableWeightTotal = [...applicable].reduce(
      (sum, method) => sum + Number(property.weights?.[method] || 0),
      0,
    );
    if (Math.abs(applicableWeightTotal - 1) > 0.000001) {
      errors.push(`${propertyType} approved method weights must total 1.0 (received ${applicableWeightTotal})`);
    }
    for (const method of calibrationDefaults.METHOD_KEYS) {
      if (!applicable.has(method) && Number(property.weights?.[method] || 0) !== 0) {
        errors.push(`${propertyType}.weights.${method} must be 0 because the method is not applicable`);
      }
    }
  }

  validateNumericLeaves(config?.gis, 'gis', errors);
  const minimumProximity = Number(config?.gis?.proximityMinimumMultiplier);
  const maximumProximity = Number(config?.gis?.proximityMaximumMultiplier);
  if (Number.isFinite(minimumProximity) && Number.isFinite(maximumProximity) && maximumProximity < minimumProximity) {
    errors.push('gis.proximityMaximumMultiplier must be >= proximityMinimumMultiplier');
  }
  validateV21ShadowConfig(config?.v21ShadowMultipliers, errors);
  for (const propertyType of calibrationDefaults.PROPERTY_TYPES) {
    validateNumericLeaves(
      config?.propertyTypes?.[propertyType]?.coefficients,
      `${propertyType}.coefficients`,
      errors,
    );
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { deepMergeKnown, validateConfig, validateV21ShadowConfig };
