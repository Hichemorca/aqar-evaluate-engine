const test = require('node:test');
const assert = require('node:assert/strict');
const { handler, validatePayload, normalizeObservation, isSameOriginRequest } = require('../netlify/functions/valuation-observation');

function validPayload(overrides = {}) {
  return {
    consent: { analytics: true },
    property: {
      propertyType: 'villa',
      district: 'AL FURJAN',
      yearBuilt: 2020,
      area: 420,
      bedrooms: 4,
      detailedUnitType: 'Villa',
      floor: 'G',
      parkingCount: 2,
      project: { value: 'DREAMZ', status: 'verified-dld', source: 'dld-transactions', normalizedKey: 'villa||al furjan||dreamz' },
      bua: 300,
      plotArea: 600,
      lastRenovationYear: 2024
    },
    valuation: {
      baselineValue: 5000000,
      shadowValue: 5075000,
      shadowTrace: { projectMultiplier: 1.01, buaPlotMultiplier: 1.005, renovationMultiplier: 1.002, combinedMultiplier: 1.017 },
      calibrationConfigId: 'cal-test',
      evidenceState: 'ready'
    },
    ...overrides
  };
}

test('same-origin guard accepts matching host and rejects a different origin', () => {
  assert.equal(isSameOriginRequest({ headers: { origin: 'https://aqar-valuation-engine.netlify.app', host: 'aqar-valuation-engine.netlify.app' } }), true);
  assert.equal(isSameOriginRequest({ headers: { origin: 'https://evil.example', host: 'aqar-valuation-engine.netlify.app' } }), false);
  assert.equal(isSameOriginRequest({ headers: {} }), true);
});

test('observation endpoint rejects non-POST requests without touching storage', async () => {
  const response = await handler({ httpMethod: 'GET', headers: {}, body: '' });
  assert.equal(response.statusCode, 405);
});

test('observation endpoint rejects missing consent before storage', async () => {
  const response = await handler({ httpMethod: 'POST', headers: { 'content-length': '2' }, body: '{}' });
  assert.equal(response.statusCode, 400);
  assert.match(response.body, /explicit-consent-required/);
});

test('observation requires explicit analytics consent', () => {
  const validation = validatePayload(validPayload({ consent: { analytics: false } }));
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some(error => error.code === 'explicit-consent-required'));
});

test('valid consented observation passes and optional fields are retained', () => {
  const payload = validPayload();
  const validation = validatePayload(payload);
  assert.equal(validation.valid, true);
  const observation = normalizeObservation(payload, new Date('2026-08-26T00:00:00.000Z'));
  assert.equal(observation.schemaVersion, 'v2.1-observation-1');
  assert.equal(observation.property.bua, 300);
  assert.equal(observation.property.plotArea, 600);
  assert.equal(observation.property.lastRenovationYear, 2024);
  assert.equal(observation.property.project.status, 'verified-dld');
  assert.ok(observation.property.project.evidenceCount > 0);
  assert.equal(observation.consent.analytics, true);
});

test('observation property dimensions must be valid and bounded', () => {
  const invalid = validPayload({ property: { ...validPayload().property, area: -10, bedrooms: -3, parkingCount: -2 } });
  const validation = validatePayload(invalid);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some(error => error.code === 'area-invalid'));
  assert.ok(validation.errors.some(error => error.code === 'bedrooms-invalid'));
  assert.ok(validation.errors.some(error => error.code === 'parking-count-invalid'));
});

test('apartment cannot submit BUA', () => {
  const payload = validPayload({ property: { ...validPayload().property, propertyType: 'apartment', bua: 120, plotArea: null, lastRenovationYear: 2024 } });
  const validation = validatePayload(payload);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some(error => error.code === 'field-not-applicable' && error.field === 'property.bua'));
});

test('renovation year must not precede year built', () => {
  const payload = validPayload({ property: { ...validPayload().property, lastRenovationYear: 2019 } });
  const validation = validatePayload(payload);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some(error => error.code === 'renovation-before-construction'));
});

test('verified project requires DLD source and normalized key', () => {
  const payload = validPayload({ property: { ...validPayload().property, project: { value: 'MAPLE', status: 'verified-dld' } } });
  const validation = validatePayload(payload);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some(error => error.code === 'verified-project-source-required'));
});

test('verified project key must exist in the DLD evidence index', () => {
  const base = validPayload();
  const payload = { ...base, property: { ...base.property, project: { ...base.property.project, normalizedKey: 'villa||other district||dreamz' } } };
  const validation = validatePayload(payload);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some(error => error.code === 'project-not-found-in-dld-index'));
});

test('unknown project is normalized to a neutral non-verified status', () => {
  const payload = validPayload({ property: { ...validPayload().property, project: { value: 'Unknown', status: 'unknown' } } });
  const validation = validatePayload(payload);
  assert.equal(validation.valid, true);
  const observation = normalizeObservation(payload, new Date('2026-08-26T00:00:00.000Z'));
  assert.deepEqual(observation.property.project, { value: null, status: 'unknown', source: null, normalizedKey: null, evidenceCount: 0 });
});

test('normalization does not persist identity or authorization fields', () => {
  const payload = validPayload({ name: 'Person', email: 'person@example.com', authorization: 'Bearer secret', property: { ...validPayload().property, adminToken: 'secret' } });
  const observation = normalizeObservation(payload, new Date('2026-08-26T00:00:00.000Z'));
  assert.equal(Object.prototype.hasOwnProperty.call(observation, 'name'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(observation, 'email'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(observation, 'authorization'), false);
  assert.equal(JSON.stringify(observation).includes('secret'), false);
});

test('empty optional fields remain null and preserve valid baseline observation', () => {
  const base = validPayload();
  const payload = { ...base, property: { ...base.property, project: { value: '', status: 'unknown' }, bua: '', plotArea: '', lastRenovationYear: '' } };
  const validation = validatePayload(payload);
  assert.equal(validation.valid, true);
  const observation = normalizeObservation(payload, new Date('2026-08-26T00:00:00.000Z'));
  assert.equal(observation.property.bua, null);
  assert.equal(observation.property.plotArea, null);
  assert.equal(observation.property.lastRenovationYear, null);
  assert.equal(observation.property.project.status, 'unknown');
});
