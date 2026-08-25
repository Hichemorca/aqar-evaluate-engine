const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../shared/aqar-policy');

test('all existing AQAR property types are supported', () => {
  assert.deepEqual(policy.PROPERTY_TYPES, [
    'apartment', 'villa', 'townhouse', 'office', 'retail', 'warehouse', 'land'
  ]);
  for (const propertyType of policy.PROPERTY_TYPES) {
    assert.equal(policy.isSupportedPropertyType(propertyType), true);
    assert.ok(policy.getPropertyPolicy(propertyType));
  }
  assert.equal(policy.isSupportedPropertyType('unknown-type'), false);
});

test('each property type exposes explicit field categories', () => {
  for (const propertyType of policy.PROPERTY_TYPES) {
    const definition = policy.getPropertyPolicy(propertyType);
    assert.ok(Array.isArray(definition.requiredFields));
    assert.ok(Array.isArray(definition.optionalFields));
    assert.ok(Array.isArray(definition.irrelevantFields));
    assert.equal(new Set([...definition.requiredFields, ...definition.optionalFields, ...definition.irrelevantFields]).size,
      definition.requiredFields.length + definition.optionalFields.length + definition.irrelevantFields.length);
  }
  assert.deepEqual(policy.getPropertyPolicy('land').requiredFields, ['area']);
  assert.ok(policy.getPropertyPolicy('land').irrelevantFields.includes('yearBuilt'));
});

test('interactive applicability preserves the current AQAR method surface', () => {
  assert.deepEqual(policy.getApplicableMethods('apartment', 'interactive'), ['sales-comparison', 'income', 'dcf']);
  assert.deepEqual(policy.getApplicableMethods('land', 'interactive'), ['sales-comparison', 'income']);
  assert.deepEqual(policy.getApplicableMethods('warehouse', 'interactive'), ['sales-comparison', 'income', 'cost']);
  assert.equal(policy.getMethodStatus('apartment', 'cost', 'interactive'), 'NOT_APPLICABLE');
  assert.equal(policy.getMethodStatus('apartment', 'dcf', 'interactive'), 'APPLICABLE');
  assert.equal(policy.getMethodStatus('villa', 'dcf', 'interactive'), 'APPLICABLE');
});

test('shared input validation rejects invalid primary fields', () => {
  assert.equal(policy.validatePropertyInput({ propType: 'apartment', area: 120 }).valid, true);
  assert.equal(policy.validatePropertyInput({ propType: 'apartment', area: 9 }).valid, false);
  assert.equal(policy.validatePropertyInput({ propType: 'not-supported', area: 120 }).valid, false);
  assert.deepEqual(policy.validatePropertyInput({ propType: 'apartment', area: 9 }).errors, [
    { field: 'area', code: 'AREA_MUST_BE_AT_LEAST_10_SQM' }
  ]);
});

test('batch applicability preserves the current offline policy', () => {
  assert.deepEqual(policy.getApplicableMethods('apartment', 'batch'), ['sales-comparison', 'income']);
  assert.deepEqual(policy.getApplicableMethods('villa', 'batch'), ['sales-comparison', 'income', 'cost']);
  assert.deepEqual(policy.getApplicableMethods('land', 'batch'), ['sales-comparison', 'income']);
  assert.equal(policy.getMethodStatus('villa', 'dcf', 'batch'), 'NOT_APPLICABLE');
  assert.equal(policy.getMethodStatus('not-a-type', 'income', 'batch'), 'NOT_APPLICABLE');
});
