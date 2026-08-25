const test = require('node:test');
const assert = require('node:assert/strict');
const { getSizeCategory, applyAllFilters } = require('../scripts/cleaning-pipeline');

test('size categories preserve current AQAR boundaries', () => {
  assert.equal(getSizeCategory(79, 'apartment'), 'small');
  assert.equal(getSizeCategory(80, 'apartment'), 'medium');
  assert.equal(getSizeCategory(200, 'apartment'), 'medium');
  assert.equal(getSizeCategory(201, 'apartment'), 'large');
  assert.equal(getSizeCategory(200, 'land'), 'land_tiny');
  assert.equal(getSizeCategory(201, 'land'), 'land_small');
});

test('cleaning pipeline removes invalid records and keeps a valid group', () => {
  const valid = [1, 2, 3].map((n) => ({
    propertyRef: `VALID-${n}`,
    district: 'Dubai Marina',
    propertyType: 'apartment',
    area: 120,
    actualSalePrice: 1_200_000,
    saleDate: `2026-06-${String(10 + n).padStart(2, '0')}`,
    procedure: 'Sale',
    group: 'Sales',
    isOffPlan: false
  }));
  const invalid = {
    propertyRef: 'INVALID-1',
    district: 'Dubai Marina',
    propertyType: 'apartment',
    area: 10,
    actualSalePrice: 0,
    saleDate: '2026-06-20',
    procedure: 'Sale',
    group: 'Sales'
  };

  const cleaned = applyAllFilters([...valid, invalid]);
  assert.equal(cleaned.length, 3);
  assert.ok(cleaned.every((record) => record.pricePerSqm === 10_000));
});
