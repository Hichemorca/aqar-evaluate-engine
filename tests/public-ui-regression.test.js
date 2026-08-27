const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { getComparableBracket } = require('../shared/comparable-bracket');

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const marketIntelligenceHtml = fs.readFileSync(path.join(__dirname, '..', 'market-intelligence.html'), 'utf8');
const accuracyDashboardHtml = fs.readFileSync(path.join(__dirname, '..', 'accuracy-dashboard.html'), 'utf8');
const exportHtml = fs.readFileSync(path.join(__dirname, '..', 'export.html'), 'utf8');

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

test('public pages use semantic headings and safe external links', () => {
  for (const source of [indexHtml, accuracyDashboardHtml, marketIntelligenceHtml]) {
    assert.match(source, /target="_blank" rel="noopener noreferrer"/);
    assert.doesNotMatch(source, /target="_blank"(?! rel="noopener noreferrer")/);
  }
  assert.ok(accuracyDashboardHtml.includes('<h1 class="miayaar-page-title">Accuracy Dashboard</h1>'));
  assert.ok(marketIntelligenceHtml.includes('<h1 class="miayaar-page-title">Market Intelligence</h1>'));
  assert.ok(exportHtml.includes('<h1 class="miayaar-page-title">Data Export</h1>'));
  assert.ok(exportHtml.includes('function csvCell(value)'));
  assert.ok(exportHtml.includes("typeof value === 'string'"));
  assert.ok(exportHtml.includes("safeText.replace(/\"/g, '\"\"')"));
  assert.ok(exportHtml.includes('/^[=+\\-@]/.test(text)'));
});

test('Market Intelligence tables stay intact inside horizontally scrollable cards', () => {
  assert.match(marketIntelligenceHtml, /\.table-scroll/);
  assert.match(marketIntelligenceHtml, /overflow-x: auto/);
  assert.match(marketIntelligenceHtml, /\.table-scroll table \{ min-width: 520px; \}/);
  assert.match(marketIntelligenceHtml, /role="region" tabindex="0" aria-label="Top 10 Investment Districts table"/);
  assert.doesNotMatch(marketIntelligenceHtml, /\.table-scroll thead \{/);
  assert.doesNotMatch(marketIntelligenceHtml, /data-label="District"/);
});
