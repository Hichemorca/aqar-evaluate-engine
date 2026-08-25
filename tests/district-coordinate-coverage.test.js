const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repo = path.join(__dirname, '..');
const districts = JSON.parse(fs.readFileSync(path.join(repo, 'data/dld-transactions.json'), 'utf8'));
const coordinates = JSON.parse(fs.readFileSync(path.join(repo, 'data/district-coordinates.json'), 'utf8'));
const normalize = value => String(value || '').trim().toLowerCase().replace(/[’'`]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
const districtNames = [...new Set(districts.map(row => row.district).filter(name => name && name !== 'Unknown'))];

function coordinateForDistrict(name) {
  const target = normalize(name);
  const entry = Object.entries(coordinates).find(([key]) => normalize(key) === target)
    || Object.entries(coordinates).find(([key]) => {
      const candidate = normalize(key);
      return candidate.includes(target) || target.includes(candidate);
    });
  return entry ? entry[1] : null;
}

test('every current DLD district has a map coordinate', () => {
  const missing = districtNames.filter(name => !coordinateForDistrict(name));
  assert.deepEqual(missing, []);
  assert.equal(districtNames.length, 204);
});

test('every district coordinate is inside the Dubai/UAE map bounds', () => {
  for (const [name, coordinate] of Object.entries(coordinates)) {
    assert.ok(Number.isFinite(Number(coordinate.lat)), `${name} latitude is invalid`);
    assert.ok(Number.isFinite(Number(coordinate.lng)), `${name} longitude is invalid`);
    assert.ok(Number(coordinate.lat) >= 24.5 && Number(coordinate.lat) <= 25.8, `${name} latitude is outside Dubai bounds`);
    assert.ok(Number(coordinate.lng) >= 54.7 && Number(coordinate.lng) <= 55.8, `${name} longitude is outside Dubai bounds`);
  }
});
