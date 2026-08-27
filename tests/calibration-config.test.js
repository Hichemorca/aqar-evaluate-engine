const test = require('node:test');
const assert = require('node:assert/strict');
const calibrationDefaults = require('../shared/aqar-calibration-defaults');
const { validateConfig, deepMergeKnown } = require('../netlify/functions/calibration-config');

test('default calibration configuration is valid', () => {
  const config = calibrationDefaults.createDefaultCalibrationConfig();
  assert.equal(validateConfig(config).valid, true);
  assert.deepEqual(config.propertyTypes.land.applicableMethods, ['sales-comparison', 'income']);
});

test('calibration validation rejects negative weights', () => {
  const config = calibrationDefaults.createDefaultCalibrationConfig();
  config.propertyTypes.villa.weights.income = -0.1;
  const result = validateConfig(config);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.includes('villa.weights.income')));
});

test('calibration validation rejects invalid GIS and coefficient ranges', () => {
  const config = calibrationDefaults.createDefaultCalibrationConfig();
  config.gis.scoreCap = -1;
  config.gis.proximityMaximumMultiplier = 0.9;
  config.gis.proximityMinimumMultiplier = 1.1;
  config.propertyTypes.apartment.coefficients.income.capRatePercent = -5;
  config.propertyTypes.villa.coefficients.sales.maxPricePerSqm = -100;
  const result = validateConfig(config);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.includes('gis.scoreCap')));
  assert.ok(result.errors.some(error => error.includes('gis.proximityMaximumMultiplier')));
  assert.ok(result.errors.some(error => error.includes('apartment.coefficients.income.capRatePercent')));
  assert.ok(result.errors.some(error => error.includes('villa.coefficients.sales.maxPricePerSqm')));
});

test('calibration merge ignores unknown keys', () => {
  const defaults = calibrationDefaults.createDefaultCalibrationConfig();
  const merged = deepMergeKnown(defaults, { unknown: 123, gis: { scoreCap: 2 } });
  assert.equal(merged.unknown, undefined);
  assert.equal(merged.gis.scoreCap, 2);
});

test('calibration validation rejects approved-method totals other than 100 percent', () => {
  const config = calibrationDefaults.createDefaultCalibrationConfig();
  config.propertyTypes.land.weights.income = 0.35;
  const result = validateConfig(config);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.includes('land approved method weights must total 1.0')));
});

test('calibration validation rejects non-applicable method weights', () => {
  const config = calibrationDefaults.createDefaultCalibrationConfig();
  config.propertyTypes.apartment.weights.cost = 0.1;
  const result = validateConfig(config);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.includes('apartment.weights.cost must be 0')));
});

test('default calibration includes neutral disabled v2.1 shadow multipliers', () => {
  const config = calibrationDefaults.createDefaultCalibrationConfig();
  assert.equal(config.v21ShadowMultipliers.enabled, false);
  assert.equal(config.v21ShadowMultipliers.propertyTypes.villa.buaPlotArea.bands.at(-1).maxRatio, null);
  assert.equal(validateConfig(config).valid, true);
});

test('calibration merge preserves dynamic DLD project multiplier keys', () => {
  const defaults = calibrationDefaults.createDefaultCalibrationConfig();
  const key = 'apartment|burj khalifa|bahwan tower';
  const merged = deepMergeKnown(defaults, { v21ShadowMultipliers: { enabled: true, propertyTypes: { apartment: { projectBuilding: { projectMultipliers: { [key]: 1.04 } } } } } });
  assert.equal(merged.v21ShadowMultipliers.enabled, true);
  assert.equal(merged.v21ShadowMultipliers.propertyTypes.apartment.projectBuilding.projectMultipliers[key], 1.04);
  assert.equal(validateConfig(merged).valid, true);
});

test('calibration validation rejects non-positive v2.1 multipliers', () => {
  const config = calibrationDefaults.createDefaultCalibrationConfig();
  config.v21ShadowMultipliers.propertyTypes.villa.buaPlotArea.bands[0].multiplier = 0;
  const result = validateConfig(config);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.includes('villa.buaPlotArea.bands[0].multiplier')));
});
