const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { getComparableBracket } = require('../shared/comparable-bracket');

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const indexAccuracyMetaJs = fs.readFileSync(path.join(__dirname, '..', 'shared', 'index-accuracy-meta.js'), 'utf8');
const indexMarketContextJs = fs.readFileSync(path.join(__dirname, '..', 'shared', 'index-market-context.js'), 'utf8');
const indexDistrictContextJs = fs.readFileSync(path.join(__dirname, '..', 'shared', 'index-district-context.js'), 'utf8');
const marketIntelligenceHtml = fs.readFileSync(path.join(__dirname, '..', 'market-intelligence.html'), 'utf8');
const marketIntelligenceJs = fs.readFileSync(path.join(__dirname, '..', 'shared', 'market-intelligence.js'), 'utf8');
const accuracyDashboardHtml = fs.readFileSync(path.join(__dirname, '..', 'accuracy-dashboard.html'), 'utf8');
const accuracyDashboardJs = fs.readFileSync(path.join(__dirname, '..', 'shared', 'accuracy-dashboard.js'), 'utf8');
const calibrationHtml = fs.readFileSync(path.join(__dirname, '..', 'calibration.html'), 'utf8');
const calibrationJs = fs.readFileSync(path.join(__dirname, '..', 'shared', 'calibration.js'), 'utf8');
const exportHtml = fs.readFileSync(path.join(__dirname, '..', 'export.html'), 'utf8');
const exportJs = fs.readFileSync(path.join(__dirname, '..', 'shared', 'export.js'), 'utf8');

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
  assert.match(indexMarketContextJs, /function getComparableBracket\(targetValue, prices\)/);
  assert.match(indexHtml, /const comparableBracket = getComparableBracket\(/);
  assert.match(indexHtml, /const comparableRangeHTML = '';/);
  assert.doesNotMatch(indexHtml, /DLD suggestion/);
  assert.match(indexHtml, /Verified project suggestion/);
});

test('autocomplete controls expose keyboard and listbox semantics', () => {
  assert.match(indexHtml, /role="combobox" aria-autocomplete="list" aria-controls="districtAutocomplete" aria-expanded="false"/);
  assert.match(indexHtml, /id="districtAutocomplete" role="listbox"/);
  assert.match(indexHtml, /id="projectBuildingAutocomplete" role="listbox"/);
  assert.match(indexDistrictContextJs, /function setAutocompleteItem\(item, onSelect\)/);
  assert.match(indexDistrictContextJs, /item\.tabIndex = 0/);
  assert.match(indexDistrictContextJs, /event\.key === 'Enter' \|\| event\.key === ' '/);
});

test('autocomplete lists use a body-level fixed portal', () => {
  assert.match(indexHtml, /\.autocomplete-list\.autocomplete-portal/);
  assert.match(indexHtml, /position: fixed/);
  assert.match(indexDistrictContextJs, /document\.body\.appendChild\(list\)/);
  assert.match(indexDistrictContextJs, /window\.addEventListener\('scroll', repositionVisibleAutocompleteLists, true\)/);
  assert.match(indexDistrictContextJs, /window\.addEventListener\('resize', repositionVisibleAutocompleteLists\)/);
  assert.doesNotMatch(indexHtml, /function setAutocompleteItem\(item, onSelect\)/);
});

test('custom checkboxes preserve native focusability', () => {
  assert.match(indexHtml, /\.checkbox-item:focus-within/);
  assert.match(indexHtml, /\.checkbox-item input \{ position: absolute; width: 1px; height: 1px; opacity: 0; \}/);
  assert.doesNotMatch(indexHtml, /\.checkbox-item input \{ display: none; \}/);
});

test('public pages use semantic headings and safe external links', () => {
  for (const source of [indexHtml, accuracyDashboardHtml, marketIntelligenceHtml]) {
    assert.match(source, /target="_blank" rel="noopener noreferrer"/);
    assert.doesNotMatch(source, /target="_blank"(?! rel="noopener noreferrer")/);
  }
  assert.ok(indexHtml.includes('<script src="/shared/index-accuracy-meta.js"></script>'));
  assert.doesNotMatch(indexHtml, /let AQAR_ACTIVE_CALIBRATION\s*=/);
  assert.ok(indexAccuracyMetaJs.includes('AQAR_ACTIVE_CALIBRATION = AQAR_CALIBRATION_DEFAULTS.createDefaultCalibrationConfig()'));
  assert.ok(indexAccuracyMetaJs.includes('AQAR_V21_SHADOW_CONFIG = AQAR_V21_SHADOW_MULTIPLIERS.createNeutralConfig()'));
  assert.ok(indexHtml.includes('<script src="/shared/index-market-context.js"></script>'));
  assert.ok(indexHtml.includes('<script src="/shared/index-district-context.js"></script>'));
  assert.ok(indexDistrictContextJs.includes('async function loadDistrictsFromDLD()'));
  assert.ok(indexDistrictContextJs.includes('function filterDistricts(q)'));
  assert.ok(indexDistrictContextJs.includes('function filterProjectBuildings(q)'));
  assert.doesNotMatch(indexHtml, /function loadDistrictsFromDLD\(\)/);
  assert.doesNotMatch(indexHtml, /function filterDistricts\(q\)/);
  assert.ok(indexMarketContextJs.includes('function buildMarketContextHTML(result, propData)'));
  assert.ok(indexMarketContextJs.includes('function renderEvidenceState(state, container, detail = \'\')'));
  assert.ok(indexMarketContextJs.includes('escapeMapHtml(propData.district || \'the selected area\')'));
  assert.doesNotMatch(indexHtml, /function buildMarketContextHTML\(result, propData\)/);
  assert.ok(accuracyDashboardHtml.includes('<h1 class="miayaar-page-title">Accuracy Dashboard</h1>'));
  assert.ok(accuracyDashboardHtml.includes('<script src="/shared/accuracy-dashboard.js"></script>'));
  assert.ok(accuracyDashboardHtml.includes('id="loadSavedDataButton"'));
  assert.doesNotMatch(accuracyDashboardHtml, /<script>\s*[\s\S]*<\/script>/);
  assert.ok(accuracyDashboardJs.includes('function updateTable(properties)'));
  assert.ok(accuracyDashboardJs.includes("document.getElementById('loadSavedDataButton')?.addEventListener"));
  assert.ok(calibrationHtml.includes('<script src="/shared/calibration.js"></script>'));
  assert.doesNotMatch(calibrationHtml, /<script>\s*[\s\S]*<\/script>/);
  assert.doesNotMatch(calibrationHtml, /onclick=/);
  assert.ok(calibrationJs.includes('async function request(method=\'GET\', body)'));
  assert.ok(calibrationJs.includes('data-action="add-project-multiplier"'));
  assert.ok(calibrationJs.includes("$('saveButton').addEventListener('click', saveConfig)"));
  assert.ok(marketIntelligenceHtml.includes('<h1 class="miayaar-page-title">Market Intelligence</h1>'));
  assert.ok(marketIntelligenceHtml.includes('<script src="/shared/market-intelligence.js"></script>'));
  assert.doesNotMatch(marketIntelligenceHtml, /<script>\s*[\s\S]*<\/script>/);
  assert.ok(marketIntelligenceJs.includes('function renderInvestmentTable()'));
  assert.ok(marketIntelligenceJs.includes("document.getElementById('growthPeriodFilter').addEventListener"));
  assert.ok(exportHtml.includes('<h1 class="miayaar-page-title">Data Export</h1>'));
  assert.match(exportHtml, /<meta name="viewport" content="width=device-width, initial-scale=1\.0">/);
  assert.ok(exportHtml.includes('<script src="/shared/export.js"></script>'));
  assert.ok(exportHtml.includes('id="exportCsvButton"'));
  assert.ok(exportHtml.includes('id="exportJsonButton"'));
  assert.doesNotMatch(exportHtml, /<script>\s*[\s\S]*<\/script>/);
  assert.ok(exportJs.includes('function csvCell(value)'));
  assert.ok(exportJs.includes("typeof value === 'string'"));
  assert.ok(exportJs.includes("safeText.replace(/\"/g, '\"\"')"));
  assert.ok(exportJs.includes('/^[=+\\-@]/.test(text)'));
});

test('Market Intelligence tables stay intact inside horizontally scrollable cards', () => {
  assert.match(marketIntelligenceHtml, /\.table-scroll/);
  assert.match(marketIntelligenceHtml, /overflow-x: auto/);
  assert.match(marketIntelligenceHtml, /\.table-scroll table \{ min-width: 520px; \}/);
  assert.match(marketIntelligenceJs, /role="region" tabindex="0" aria-label="Top 10 Investment Districts table"/);
  assert.doesNotMatch(marketIntelligenceHtml, /\.table-scroll thead \{/);
  assert.doesNotMatch(marketIntelligenceHtml, /data-label="District"/);
});
