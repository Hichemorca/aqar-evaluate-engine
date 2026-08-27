const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { getComparableBracket } = require('../shared/comparable-bracket');

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const marketIntelligenceHtml = fs.readFileSync(path.join(__dirname, '..', 'market-intelligence.html'), 'utf8');

test('comparable bracket selects the nearest strict lower and upper prices', () => {
  assert.deepEqual(getComparableBracket(1802730, [1868000, 1680000, 2200000, 1500000]), {
    lower: 1680000,
    upper: 1868000
  });
});

test('comparable bracket ignores invalid values and returns null without both sides', () => {
  assert.equal(getComparableBracket(100, [0, -2, 'bad', 90, null]), null);
  assert.equal(getComparableBracket(100, [90, 100]), null);
  assert.equal(getComparableBracket(100, [100, 110]), null);
  assert.equal(getComparableBracket('bad', [90, 110]), null);
});

test('public result keeps Range hidden while retaining the internal bracket calculation', () => {
  assert.match(indexHtml, /function getComparableBracket\(targetValue, prices\)/);
  assert.match(indexHtml, /const comparableBracket = getComparableBracket\(/);
  assert.match(indexHtml, /const comparableRangeHTML = '';/);
  assert.doesNotMatch(indexHtml, /DLD suggestion/);
  assert.match(indexHtml, /Verified project suggestion/);
});

test('autocomplete lists use a body-level fixed portal', () => {
  assert.match(indexHtml, /\.autocomplete-list\.autocomplete-portal/);
  assert.match(indexHtml, /position: fixed/);
  assert.match(indexHtml, /document\.body\.appendChild\(list\)/);
  assert.match(indexHtml, /window\.addEventListener\('scroll', repositionVisibleAutocompleteLists, true\)/);
});

test('Market Intelligence tables use mobile-safe row cards', () => {
  assert.match(marketIntelligenceHtml, /\.table-scroll/);
  assert.match(marketIntelligenceHtml, /@media \(max-width: 600px\)/);
  assert.match(marketIntelligenceHtml, /\.table-scroll thead/);
  assert.match(marketIntelligenceHtml, /data-label="District"/);
  assert.match(marketIntelligenceHtml, /overflow-x: visible/);
});
