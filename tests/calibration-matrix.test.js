const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const calibrationDefaults = require('../shared/aqar-calibration-defaults');
const policy = require('../shared/aqar-policy');
const { validateConfig } = require('../netlify/functions/calibration-config');

const expectedInteractiveMethods = {
  apartment: ['sales-comparison', 'income', 'dcf'],
  villa: ['sales-comparison', 'income', 'cost', 'dcf'],
  townhouse: ['sales-comparison', 'income', 'cost', 'dcf'],
  office: ['sales-comparison', 'income', 'cost', 'dcf'],
  retail: ['sales-comparison', 'income', 'cost', 'dcf'],
  warehouse: ['sales-comparison', 'income', 'cost'],
  land: ['sales-comparison', 'income']
};

test('all property types expose the approved interactive method matrix', () => {
  const config = calibrationDefaults.createDefaultCalibrationConfig();
  for (const propertyType of calibrationDefaults.PROPERTY_TYPES) {
    const propertyConfig = config.propertyTypes[propertyType];
    assert.deepEqual(propertyConfig.applicableMethods, expectedInteractiveMethods[propertyType], propertyType);
    assert.deepEqual(policy.getApplicableMethods(propertyType, 'interactive'), expectedInteractiveMethods[propertyType], propertyType);
    const total = propertyConfig.applicableMethods.reduce((sum, method) => sum + propertyConfig.weights[method], 0);
    assert.ok(Math.abs(total - 1) <= 0.000001, `${propertyType} total is ${total}`);
    for (const method of calibrationDefaults.METHOD_KEYS) {
      if (!propertyConfig.applicableMethods.includes(method)) assert.equal(propertyConfig.weights[method], 0, `${propertyType}.${method}`);
    }
  }
  assert.equal(validateConfig(config).valid, true);
});

test('batch policy remains explicit where DCF is not part of the current offline surface', () => {
  assert.deepEqual(policy.getApplicableMethods('apartment', 'batch'), ['sales-comparison', 'income']);
  assert.deepEqual(policy.getApplicableMethods('villa', 'batch'), ['sales-comparison', 'income', 'cost']);
  assert.deepEqual(policy.getApplicableMethods('warehouse', 'batch'), ['sales-comparison', 'income', 'cost']);
  assert.deepEqual(policy.getApplicableMethods('land', 'batch'), ['sales-comparison', 'income']);
});

test('calibration console uses collapsible single-open panels and approved-method-only rendering', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'calibration.html'), 'utf8');
  assert.match(source, /<details class="type-card"/);
  assert.match(source, /data-property-type/);
  assert.match(source, /typePanels\.filter\(other => other !== panel\)/);
  assert.match(source, /class="type-total/);
  assert.match(source, /for \(const method of applicableMethods\)/);
  assert.match(source, /\$\('saveButton'\)\.disabled = !totalsValid/);
});
