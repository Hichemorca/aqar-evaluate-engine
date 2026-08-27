const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('Netlify headers define the required browser security protections', () => {
  const headers = read('_headers');
  for (const header of [
    'Content-Security-Policy:',
    'Referrer-Policy: strict-origin-when-cross-origin',
    'X-Content-Type-Options: nosniff',
    'X-Frame-Options: DENY',
    'Permissions-Policy:',
    'Cross-Origin-Opener-Policy: same-origin',
    'Strict-Transport-Security:'
  ]) assert.match(headers, new RegExp(header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(headers, /Access-Control-Allow-Origin:\s*\*/i);
});

test('Netlify TOML repeats the required headers for deploys that omit _headers', () => {
  const config = read('netlify.toml');
  assert.match(config, /\[\[headers\]\]/);
  for (const header of [
    'Content-Security-Policy =',
    'Referrer-Policy = "strict-origin-when-cross-origin"',
    'X-Content-Type-Options = "nosniff"',
    'X-Frame-Options = "DENY"',
    'Permissions-Policy =',
    'Cross-Origin-Opener-Policy = "same-origin"',
    'Strict-Transport-Security ='
  ]) assert.match(config, new RegExp(header.replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&')));
});

test('each public page exposes a keyboard skip link and main landmark', () => {
  for (const page of ['index.html', 'market-intelligence.html', 'accuracy-dashboard.html', 'calibration.html', 'export.html']) {
    const source = read(page);
    assert.match(source, /class="skip-link"/);
    assert.match(source, /href="#(?:app-container|main-content)"/);
    assert.match(source, /(?:role="main"|<main[^>]+id="main-content")/);
  }
});

test('dynamic statuses and interactive map are announced to assistive technology', () => {
  assert.match(read('export.html'), /id="stats" aria-live="polite"/);
  assert.match(read('index.html'), /id="gisMap" role="region" aria-label="Interactive location map"/);
  assert.match(read('index.html'), /id="gisFacilitiesList" role="status" aria-live="polite"/);
  assert.match(read('index.html'), /id="scrapeStatus" role="status" aria-live="polite"/);
});

test('skip link CSS is visible on keyboard focus', () => {
  const css = read('shared/miayaar-brand.css');
  assert.match(css, /\.skip-link:focus/);
  assert.match(css, /outline: 3px solid #00b86e/);
});
