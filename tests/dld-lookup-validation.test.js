const test = require('node:test');
const assert = require('node:assert/strict');
const { handler } = require('../netlify/functions/dld-lookup');

async function invoke(queryStringParameters) {
  const response = await handler({ queryStringParameters });
  return { statusCode: response.statusCode, body: JSON.parse(response.body) };
}

test('dld lookup rejects unsupported property types server-side', async () => {
  const result = await invoke({ district: 'Dubai Marina', propertyType: 'not-supported', area: '120' });
  assert.equal(result.statusCode, 400);
  assert.equal(result.body.found, false);
});

test('dld lookup rejects non-positive or non-numeric areas server-side', async () => {
  for (const area of ['0', '-10', 'not-a-number']) {
    const result = await invoke({ district: 'Dubai Marina', propertyType: 'apartment', area });
    assert.equal(result.statusCode, 400);
    assert.equal(result.body.found, false);
  }
});
