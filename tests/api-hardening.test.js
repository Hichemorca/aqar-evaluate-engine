const { test } = require('node:test');
const assert = require('node:assert/strict');
const dld = require('../netlify/functions/dld-lookup');
const osm = require('../netlify/functions/fetch-osm');

const parseBody = response => JSON.parse(response.body);
const requiredSecurityHeaders = {
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin'
};

function assertSecurityHeaders(response) {
  for (const [name, value] of Object.entries(requiredSecurityHeaders)) assert.equal(response.headers[name], value);
  assert.match(response.headers['Strict-Transport-Security'], /max-age=31536000/);
}

test('active API responses carry shared security headers', async () => {
  const dldResponse = await dld.handler({ httpMethod: 'POST', headers: { 'x-nf-client-connection-ip': 'test-security-dld' }, queryStringParameters: {} });
  const osmResponse = await osm.handler({ httpMethod: 'POST', headers: { 'x-nf-client-connection-ip': 'test-security-osm' }, queryStringParameters: {} });
  assertSecurityHeaders(dldResponse);
  assertSecurityHeaders(osmResponse);
});

test('dld lookup rejects non-GET requests and does not expose wildcard CORS', async () => {
  const response = await dld.handler({
    httpMethod: 'POST',
    headers: { origin: 'https://evil.example', 'x-nf-client-connection-ip': 'test-dld-method' },
    queryStringParameters: {}
  });
  assert.equal(response.statusCode, 405);
  assert.equal(response.headers['Access-Control-Allow-Origin'], undefined);
  assert.equal(parseBody(response).error, 'Method not allowed');
});

test('dld lookup allows only the official origin when an origin is supplied', async () => {
  const official = await dld.handler({
    httpMethod: 'GET',
    headers: { origin: 'https://aqar-valuation-engine.netlify.app', 'x-nf-client-connection-ip': 'test-dld-official' },
    queryStringParameters: {}
  });
  const external = await dld.handler({
    httpMethod: 'GET',
    headers: { origin: 'https://evil.example', 'x-nf-client-connection-ip': 'test-dld-external' },
    queryStringParameters: {}
  });
  assert.equal(official.statusCode, 400);
  assert.equal(official.headers['Access-Control-Allow-Origin'], 'https://aqar-valuation-engine.netlify.app');
  assert.equal(external.statusCode, 400);
  assert.equal(external.headers['Access-Control-Allow-Origin'], undefined);
});

test('dld lookup rejects oversized district input before fetching the dataset', async () => {
  const response = await dld.handler({
    httpMethod: 'GET',
    headers: { 'x-nf-client-connection-ip': 'test-dld-size' },
    queryStringParameters: { district: 'x'.repeat(121), propertyType: 'apartment', area: '120' }
  });
  assert.equal(response.statusCode, 400);
  assert.equal(parseBody(response).found, false);
});

test('GIS handler rejects unsupported coordinates without querying Overpass', async () => {
  const response = await osm.handler({
    httpMethod: 'GET',
    headers: { 'x-nf-client-connection-ip': 'test-gis-bounds' },
    queryStringParameters: { lat: '0', lng: '0', radius: '1000' }
  });
  assert.equal(response.statusCode, 400);
  assert.equal(parseBody(response).error, 'Coordinates must be within the supported Dubai service area');
});

test('GIS handler rejects non-GET requests', async () => {
  const response = await osm.handler({
    httpMethod: 'POST',
    headers: { 'x-nf-client-connection-ip': 'test-gis-method' },
    queryStringParameters: {}
  });
  assert.equal(response.statusCode, 405);
  assert.equal(parseBody(response).error, 'Method not allowed');
});

test('GIS cache is bounded and Dubai bounds are explicit', () => {
  assert.equal(osm.isWithinSupportedBounds(25.2, 55.3), true);
  assert.equal(osm.isWithinSupportedBounds(0, 0), false);
  for (let index = 0; index < osm.MAX_CACHE_ENTRIES + 10; index += 1) {
    osm.setCache(`test-cache-${index}`, { index });
  }
  assert.ok(osm.gisCache.size <= osm.MAX_CACHE_ENTRIES);
});

test('GIS rate limit blocks requests after the configured per-window maximum', () => {
  const event = { headers: { 'x-nf-client-connection-ip': `test-gis-rate-${Date.now()}` } };
  const decisions = Array.from({ length: 31 }, () => osm.isRateLimited(event));
  assert.equal(decisions[0], false);
  assert.equal(decisions[29], false);
  assert.equal(decisions[30], true);
});

test('dld rate limit blocks repeated requests from the same client window', async () => {
  const client = `test-dld-rate-${Date.now()}`;
  const event = {
    httpMethod: 'GET',
    headers: { 'x-nf-client-connection-ip': client },
    queryStringParameters: {}
  };
  const responses = [];
  for (let index = 0; index < 61; index += 1) responses.push(await dld.handler(event));
  assert.equal(responses[0].statusCode, 400);
  assert.equal(responses[59].statusCode, 400);
  assert.equal(responses[60].statusCode, 429);
  assert.equal(parseBody(responses[60]).error, 'Too many requests');
});
