const test = require('node:test');
const assert = require('node:assert/strict');
const { handler } = require('../netlify/functions/scrape-sold');

test('accuracy endpoint does not manufacture data when verified source is unavailable', async () => {
  const response = await handler({
    httpMethod: 'POST',
    body: JSON.stringify({ city: 'dubai', days: 60 })
  });
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 503);
  assert.equal(body.success, false);
  assert.equal(body.dataSource, 'unavailable');
  assert.match(body.error, /Verified transaction source unavailable/);
});
