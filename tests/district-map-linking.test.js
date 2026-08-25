const test = require('node:test');
const assert = require('node:assert/strict');
const { findNearestDistrict, distanceKm } = require('../shared/district-map-linking.js');

const coordinates = {
  'Dubai Marina': { lat: 25.0802, lng: 55.1416 },
  'Downtown Dubai': { lat: 25.1972, lng: 55.2741 },
  'Hidden Coordinate District': { lat: 25.0805, lng: 55.1420 }
};

test('matches a map point to the nearest district in the DLD list', () => {
  const result = findNearestDistrict(25.081, 55.142, ['Dubai Marina', 'Downtown Dubai'], coordinates, 3);
  assert.equal(result.name, 'Dubai Marina');
  assert.ok(result.distanceKm < 1);
});

test('does not return a district outside the configured match radius', () => {
  const result = findNearestDistrict(25.30, 55.50, ['Dubai Marina', 'Downtown Dubai'], coordinates, 3);
  assert.equal(result, null);
});

test('never returns a coordinate name absent from the DLD district list', () => {
  const result = findNearestDistrict(25.0805, 55.142, ['Dubai Marina'], coordinates, 3);
  assert.equal(result.name, 'Dubai Marina');
});

test('supports case and punctuation differences between DLD and coordinate names', () => {
  const result = findNearestDistrict(25.197, 55.274, ['DOWNTOWN-DUBAI'], coordinates, 3);
  assert.equal(result.name, 'DOWNTOWN-DUBAI');
});

test('uses haversine distance in kilometers', () => {
  const distance = distanceKm(25.0802, 55.1416, 25.0802, 55.1416);
  assert.equal(distance, 0);
});
