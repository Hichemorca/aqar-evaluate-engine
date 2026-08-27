const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const calibrationDefaults = require('../shared/aqar-calibration-defaults');
const calibrationEngine = require('../shared/calibration-engine');

const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const resetHistorySource = fs.readFileSync(path.join(__dirname, '..', 'shared', 'index-reset-history-runtime.js'), 'utf8');
const batchSource = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'evaluate-and-save.js'), 'utf8');

test('browser and offline paths persist the active calibration identity', () => {
  assert.match(resetHistorySource, /calibrationId: AQAR_ACTIVE_CALIBRATION\.configId/);
  assert.match(batchSource, /calibrationConfigId: evalResult\.calibrationId/);
  assert.match(batchSource, /valuationMethods: evalResult\.methodResults/);
});

test('a new calibration result does not mutate a historical result identity', () => {
  const config = calibrationDefaults.createDefaultCalibrationConfig();
  const historicalResult = Object.freeze({ finalValue: 100_000, calibrationConfigId: 'cal-old' });
  const newPropertyConfig = JSON.parse(JSON.stringify(config.propertyTypes.villa));
  newPropertyConfig.weights = { 'sales-comparison': 0.75, income: 0.25, cost: 0, dcf: 0 };
  const methods = calibrationEngine.buildMethodResults({ salesValue: 120_000, annualRent: 7_000, marketValue: 120_000, area: 100 }, newPropertyConfig);
  const newResult = calibrationEngine.combineMethodResults(methods, newPropertyConfig, 'cal-new');

  assert.equal(historicalResult.finalValue, 100_000);
  assert.equal(historicalResult.calibrationConfigId, 'cal-old');
  assert.equal(newResult.calibrationId, 'cal-new');
  assert.notEqual(newResult.calibrationId, historicalResult.calibrationConfigId);
});
