const test = require('node:test');
const assert = require('node:assert/strict');
const { buildComparableGroups, createComparableDiagnostics } = require('../shared/comparable-diagnostics');

function apartment(ref, pricePerSqm, area = 70) {
  return {
    propertyRef: ref,
    propertyType: 'apartment',
    project: 'TEST PROJECT',
    district: 'TEST DISTRICT',
    area,
    pricePerSqm
  };
}

test('comparable diagnostics records counts and selected project-size level', () => {
  const records = [apartment('a1', 10000), apartment('a2', 10500), apartment('a3', 11000), apartment('a4', 11500)];
  const groups = buildComparableGroups(records);
  const diagnostics = createComparableDiagnostics(records[0], groups);
  assert.equal(diagnostics.selectedLevel, 'project_size');
  assert.equal(diagnostics.selectedComparableCount, 3);
  assert.equal(diagnostics.comparableCounts.project_size, 3);
  assert.equal(diagnostics.diagnosticsOnly, true);
  assert.deepEqual(diagnostics.flags, []);
});

test('comparable diagnostics flags moderate peer dispersion without changing the selected level', () => {
  const records = [apartment('a1', 8000), apartment('a2', 12000), apartment('a3', 18000), apartment('a4', 26000)];
  const groups = buildComparableGroups(records);
  const diagnostics = createComparableDiagnostics(records[0], groups);
  assert.equal(diagnostics.selectedLevel, 'project_size');
  assert.equal(diagnostics.selectedComparableCount, 3);
  assert.match(diagnostics.flags.join(','), /peer_dispersion/);
});

test('comparable diagnostics flags land_xlarge and no qualifying level', () => {
  const record = { propertyRef: 'l1', propertyType: 'land', project: '', district: 'SPARSE', area: 15760, pricePerSqm: 200 };
  const groups = buildComparableGroups([record]);
  const diagnostics = createComparableDiagnostics(record, groups);
  assert.equal(diagnostics.sizeCategory, 'land_xlarge');
  assert.equal(diagnostics.selectedLevel, null);
  assert.ok(diagnostics.flags.includes('land_xlarge'));
  assert.ok(diagnostics.flags.includes('no_qualifying_comparable_level'));
});
