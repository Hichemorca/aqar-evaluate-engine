const calibrationDefaults = require('./aqar-calibration-defaults');

function deepMergeKnown(base, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return base;
  const output = { ...base };
  for (const [key, value] of Object.entries(input)) {
    if (!Object.prototype.hasOwnProperty.call(base, key)) continue;
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

function validateNumericLeaves(value, path, errors) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) errors.push(`${path} must be finite`);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    validateNumericLeaves(child, `${path}.${key}`, errors);
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
  for (const propertyType of calibrationDefaults.PROPERTY_TYPES) {
    validateNumericLeaves(
      config?.propertyTypes?.[propertyType]?.coefficients,
      `${propertyType}.coefficients`,
      errors,
    );
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { deepMergeKnown, validateConfig };
