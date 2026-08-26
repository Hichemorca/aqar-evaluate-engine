const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const dataDir = path.join(root, 'data');
const dld = JSON.parse(fs.readFileSync(path.join(dataDir, 'dld-transactions.json'), 'utf8'));
const accuracyPayload = JSON.parse(fs.readFileSync(path.join(dataDir, 'accuracy-data.json'), 'utf8'));
const records = Array.isArray(accuracyPayload) ? accuracyPayload : (accuracyPayload.records || accuracyPayload.data || []);
const dldRefs = new Set(dld.map(row => String(row.propertyRef || '').trim()).filter(Boolean));

test('every official Accuracy record maps to an eligible DLD record', () => {
  assert.ok(records.length > 0);
  assert.equal(records.filter(record => !record.propertyRef || !dldRefs.has(String(record.propertyRef).trim())).length, 0);
});

test('official Accuracy records carry verified government provenance', () => {
  assert.ok(records.every(record => record.dataSource === 'dld-real-cleaned'));
  assert.ok(records.every(record => record.scrapedFrom === 'Dubai Land Department'));
  assert.ok(records.every(record => record.verifiedBy === 'Government Record'));
  assert.ok(records.every(record => record.evidenceStatus === 'eligible'));
});

test('synthetic transaction generator is not part of the official update workflow', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/update-accuracy.yml'), 'utf8');
  assert.doesNotMatch(workflow, /fetch-transactions\.js/);
  assert.doesNotMatch(workflow, /fetched-transactions\.json/);
});

test('official Accuracy records contain no synthetic markers', () => {
  assert.equal(records.filter(record => /random|synthetic|estimated/i.test(JSON.stringify(record))).length, 0);
});
