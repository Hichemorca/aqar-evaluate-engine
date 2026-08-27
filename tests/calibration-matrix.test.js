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

test('calibration console groups controls by property type and user-facing fields', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'shared', 'calibration.js'), 'utf8');
  assert.match(source, /<details class="type-card"/);
  assert.match(source, /data-property-type/);
  assert.match(source, /const propertyTypeLabels = \{ apartment: 'Apartment'/);
  assert.match(source, /propertyTypeLabels\[propertyType\] \|\| propertyType/);
  assert.match(source, /typePanels\.filter\(other => other !== panel\)/);
  assert.match(source, /class="type-total/);
  assert.match(source, /\(propertyConfig\.applicableMethods \|\| \[\]\)/);
  assert.match(source, /function renderValuationMethods\(propertyType, propertyConfig\)/);
  assert.match(source, /function renderValuationFactors\(propertyType, propertyConfig\)/);
  assert.match(source, /function renderAdvancedCalibration\(propertyType, propertyConfig\)/);
  assert.match(source, /function renderFieldCard\(title, groups, cardClass = ''\)/);
  assert.match(source, /Grouped by user-facing fields/);
  assert.match(source, /Applicable methods only/);
  assert.match(source, /Additional method controls/);
  assert.doesNotMatch(source, /function renderNumericSection/);
  assert.match(source, /\$\('saveButton'\)\.disabled = !totalsValid/);
});

test('calibration console uses the public field names for factor cards', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'shared', 'calibration.js'), 'utf8');
  for (const fieldName of [
    'Total Area (sqm)', 'Bedrooms', 'Features & Amenities', 'Year Built', 'Condition',
    'Finish Quality', 'View Type', 'Floor Level', 'Street Position', 'Building Condition',
    'Furnished Status', 'Annual Rent (AED)', 'Annual Expenses (AED)', 'Project / Building Name',
    'BUA / Plot Area', 'Last Renovation Year', 'Location & Facilities'
  ]) assert.match(source, new RegExp(fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('property-specific factor rendering filters by applicable method', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'shared', 'calibration.js'), 'utf8');
  assert.match(source, /definition\.groups\.filter\(definitionGroup => \(propertyConfig\.applicableMethods \|\| \[\]\)\.includes\(definitionGroup\.method\)\)/);
  assert.match(source, /const used = new Set\(valuationFieldDefinitions\.flatMap/);
  assert.match(source, /const group = methodGroups\[method\]/);
});
