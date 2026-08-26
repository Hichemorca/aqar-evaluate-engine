const test = require('node:test');
const assert = require('node:assert/strict');
const { handler } = require('../netlify/functions/scrape-sold');

test('legacy accuracy endpoint is disabled by default', async () => {
  const response = await handler({
    httpMethod: 'POST',
    body: JSON.stringify({ city: 'dubai', days: 60 })
  });
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 410);
  assert.equal(response.headers['Access-Control-Allow-Origin'], undefined);
  assert.match(body.error, /disabled/i);
});

test('disabled legacy accuracy endpoint rejects preflight requests', async () => {
  const response = await handler({ httpMethod: 'OPTIONS', body: '' });
  assert.equal(response.statusCode, 410);
  assert.equal(response.headers['Access-Control-Allow-Origin'], undefined);
});
