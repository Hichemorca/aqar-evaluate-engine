const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

for (const fileName of ['accuracy-data.json', 'market-data.json']) {
  test(`${fileName} is verified-only and appraiser-free`, () => {
    const data = JSON.parse(fs.readFileSync(`data/${fileName}`, 'utf8'));
    assert.equal(data.metadata.accuracyScope, 'verified-dld-only');
    assert.equal(data.metadata.comparison, 'AQAR vs actual sale price');
    assert.ok(Array.isArray(data.records));
    assert.ok(data.records.length > 0);
    assert.ok(data.records.every(record => record.dataSource === 'dld-real-cleaned'));
    assert.ok(data.records.every(record => record.appraiserValuation === undefined));
    assert.ok(data.records.every(record => record.aqarVsAppraiser === undefined));
  });
}
