const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { escapeHtml } = require('../shared/html-escape');

const root = path.join(__dirname, '..');
const readPage = name => fs.readFileSync(path.join(root, name), 'utf8');

test('html escape neutralizes markup, attributes, and quotes', () => {
  const payload = `<img src=x onerror="alert('xss')">&`;
  assert.equal(
    escapeHtml(payload),
    '&lt;img src=x onerror=&quot;alert(&#39;xss&#39;)&quot;&gt;&amp;'
  );
});

test('public valuation rendering escapes user-controlled property fields', () => {
  const source = readPage('index.html');
  assert.match(source, /escapeMapHtml\(propData\.projectBuilding\)/);
  assert.match(source, /escapeMapHtml\(propData\.district \|\| 'the selected area'\)/);
  assert.match(source, /escapeMapHtml\(propData\.propType\)/);
  assert.match(source, /escapeMapHtml\(detail\)/);
});

test('market intelligence rendering escapes artifact text fields', () => {
  const source = readPage('market-intelligence.html');
  assert.match(source, /escapeHtml\(d\.label\)/);
  assert.match(source, /escapeHtml\(w\.periodLabel\)/);
  assert.match(source, /escapeHtml\(def\.definition\)/);
  assert.match(source, /escapeHtml\(flags\.join\(' \| '\)\)/);
});

test('accuracy and calibration rendering use escaping for dynamic text', () => {
  const accuracy = readPage('accuracy-dashboard.html');
  const calibration = readPage('calibration.html');
  assert.match(accuracy, /escapeHtml\(p\.district \|\| '—'\)/);
  assert.match(accuracy, /escapeHtml\(p\.propertyType \|\| '—'\)/);
  assert.match(calibration, /function escapeHtml\(value\) \{ return AQAR_HTML_ESCAPE\.escapeHtml\(value\); \}/);
  assert.match(calibration, /escapeHtml\(item\.configId\)/);
});
