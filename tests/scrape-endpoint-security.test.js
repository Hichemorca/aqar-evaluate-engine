const test = require('node:test');
const assert = require('node:assert/strict');

delete process.env.SCRAPE_ENDPOINT_ENABLED;
const { handler } = require('../netlify/functions/scrape');

test('legacy scrape endpoint is disabled by default', async () => {
  const response = await handler({ httpMethod: 'POST', body: JSON.stringify({}) });
  assert.equal(response.statusCode, 410);
  assert.equal(response.headers['Access-Control-Allow-Origin'], undefined);
  assert.match(response.body, /disabled/i);
});

test('disabled scrape endpoint does not process preflight requests', async () => {
  const response = await handler({ httpMethod: 'OPTIONS', body: '' });
  assert.equal(response.statusCode, 410);
  assert.equal(response.headers['Access-Control-Allow-Origin'], undefined);
});
