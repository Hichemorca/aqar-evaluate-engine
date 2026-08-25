const test = require('node:test');
const assert = require('node:assert/strict');
const { selectFallbackLevel } = require('../scripts/run-fallback-policy-experiment');

function record(propertyType = 'apartment', sizeCategory = 'medium') {
  return { propertyType, diagnostics: { sizeCategory } };
}

test('baseline policy keeps district_size at five to nine comparables', () => {
  const counts = { project_size: 2, project: 2, district_size: 8, district: 30 };
  assert.equal(selectFallbackLevel(record(), counts, { districtSizeMinimum: 5 }), 'district_size');
  assert.equal(selectFallbackLevel(record(), counts, { districtSizeMinimum: 10 }), 'district');
});

test('strict no-wide-fallback policy marks five to nine district_size cases unscored', () => {
  const counts = { project_size: 2, project: 2, district_size: 8, district: 30 };
  assert.equal(selectFallbackLevel(record(), counts, { districtSizeMinimum: 10, blockDistrictFallbackFor5to9: true }), null);
});

test('land xlarge protection blocks district_size while preserving higher-priority project levels', () => {
  const xlarge = record('land', 'land_xlarge');
  const districtOnly = { project_size: 2, project: 2, district_size: 20, district: 40 };
  assert.equal(selectFallbackLevel(xlarge, districtOnly, { districtSizeMinimum: 5 }), 'district_size');
  assert.equal(selectFallbackLevel(xlarge, districtOnly, { districtSizeMinimum: 5, blockLandXlargeDistrictSize: true }), null);
  assert.equal(selectFallbackLevel(xlarge, districtOnly, { districtSizeMinimum: 5, blockLandXlargeEntireFallback: true }), null);

  const projectAvailable = { project_size: 3, project: 12, district_size: 20, district: 40 };
  assert.equal(selectFallbackLevel(xlarge, projectAvailable, { districtSizeMinimum: 10, blockLandXlargeEntireFallback: true }), 'project_size');
});

test('retail retains the existing two-comparable project threshold', () => {
  const counts = { project_size: 2, project: 2, district_size: 1, district: 1 };
  assert.equal(selectFallbackLevel(record('retail'), counts, { districtSizeMinimum: 10 }), 'project');
});
