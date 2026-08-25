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
