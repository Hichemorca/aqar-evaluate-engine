const test = require('node:test');
const assert = require('node:assert/strict');
const fields = require('../shared/property-extra-fields');

test('apartment exposes project and renovation only when older than five years', () => {
  assert.deepEqual(fields.getVisibility('apartment', 2020, 2026), {
    projectBuilding: true, bua: false, plotArea: false, renovationYear: true
  });
  assert.equal(fields.getVisibility('apartment', 2021, 2026).renovationYear, false);
});

test('villa and townhouse expose BUA, plot area, project, and eligible renovation', () => {
  for (const type of ['villa', 'townhouse']) {
    assert.deepEqual(fields.getVisibility(type, 2018, 2026), {
      projectBuilding: true, bua: true, plotArea: true, renovationYear: true
    });
  }
});

test('land exposes plot area only', () => {
  assert.deepEqual(fields.getVisibility('land', 2010, 2026), {
    projectBuilding: false, bua: false, plotArea: true, renovationYear: false
  });
});

test('office retail and warehouse keep new fields hidden in v2.1', () => {
  for (const type of ['office', 'retail', 'warehouse']) {
    assert.deepEqual(fields.getVisibility(type, 2010, 2026), {
      projectBuilding: false, bua: false, plotArea: false, renovationYear: false
    });
  }
});

test('optional empty values are valid and preserve baseline behavior', () => {
  const result = fields.validate({ propType: 'villa', yearBuilt: 2020, bua: '', plotArea: '', lastRenovationYear: '' }, 2026);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('positive areas and renovation chronology are validated', () => {
  const result = fields.validate({ propType: 'villa', yearBuilt: 2010, bua: 250, plotArea: 500, lastRenovationYear: 2015 }, 2026);
  assert.equal(result.valid, true);
  const invalid = fields.validate({ propType: 'villa', yearBuilt: 2010, bua: 0, plotArea: -2, lastRenovationYear: 2005 }, 2026);
  assert.equal(invalid.valid, false);
  assert.deepEqual(invalid.errors.map(error => error.code), ['bua-must-be-positive', 'plot-area-must-be-positive', 'renovation-before-construction']);
});

test('renovation year rejects non-integers and future years', () => {
  const result = fields.validate({ propType: 'apartment', yearBuilt: 2010, lastRenovationYear: 2026.5 }, 2026);
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors.map(error => error.code), ['renovation-year-invalid']);
});
