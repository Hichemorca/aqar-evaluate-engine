const test = require('node:test');
const assert = require('node:assert/strict');
const calibrationDefaults = require('../shared/aqar-calibration-defaults');
const calibrationEngine = require('../shared/calibration-engine');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('calibration engine preserves Land applicability and returns explicit NOT_APPLICABLE methods', () => {
  const config = calibrationDefaults.createDefaultCalibrationConfig();
  const propertyConfig = config.propertyTypes.land;
  const methods = calibrationEngine.buildMethodResults({ salesValue: 1_000_000, area: 200 }, propertyConfig);

  assert.equal(methods.find((method) => method.method === 'sales-comparison').status, 'APPLIED');
  assert.equal(methods.find((method) => method.method === 'income').status, 'NOT_APPLICABLE');
  assert.equal(methods.find((method) => method.method === 'cost').status, 'NOT_APPLICABLE');
  assert.equal(methods.find((method) => method.method === 'dcf').status, 'NOT_APPLICABLE');

  const combined = calibrationEngine.combineMethodResults(methods, propertyConfig, 'cal-test-land');
  assert.equal(combined.status, 'APPLIED');
  assert.equal(combined.value, 1_000_000);
  assert.equal(combined.calibrationId, 'cal-test-land');
});

test('calibration engine applies active method weights and income coefficients', () => {
  const config = calibrationDefaults.createDefaultCalibrationConfig();
  const propertyConfig = clone(config.propertyTypes.villa);
  propertyConfig.weights = { 'sales-comparison': 0.5, income: 0.5, cost: 0, dcf: 0 };

  const methods = calibrationEngine.buildMethodResults({
    salesValue: 100_000,
    marketValue: 100_000,
    annualRent: 7_000,
    area: 100
  }, propertyConfig);
  const combined = calibrationEngine.combineMethodResults(methods, propertyConfig, 'cal-test-weighted');

  assert.equal(methods.find((method) => method.method === 'income').status, 'APPLIED');
  assert.equal(methods.find((method) => method.method === 'income').value, 70_000);
  assert.equal(combined.value, 85_000);
  assert.equal(combined.calibrationId, 'cal-test-weighted');

  propertyConfig.coefficients.income.capRatePercent = 8;
  const changedMethods = calibrationEngine.buildMethodResults({ salesValue: 100_000, marketValue: 100_000, annualRent: 7_000, area: 100 }, propertyConfig);
  assert.equal(changedMethods.find((method) => method.method === 'income').value, 61_250);
});

test('calibration engine exposes assumptions rather than treating fallbacks as source facts', () => {
  const config = calibrationDefaults.createDefaultCalibrationConfig();
  const propertyConfig = config.propertyTypes.villa;
  const methods = calibrationEngine.buildMethodResults({ annualRent: 100_000, area: 200 }, propertyConfig);
  const income = methods.find((method) => method.method === 'income');

  assert.equal(income.status, 'APPLIED');
  assert.ok(income.assumptions.some((assumption) => assumption.field === 'annualExpenses' && assumption.source === 'ASSUMPTION'));
  assert.ok(income.assumptions.some((assumption) => assumption.field === 'capRatePercent' && assumption.source === 'ASSUMPTION'));
});
