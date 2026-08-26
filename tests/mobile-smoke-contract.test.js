const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('mobile smoke command and workflow are present and pinned', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
  const smoke = fs.readFileSync(path.join(root, 'tests', 'mobile-smoke.cjs'), 'utf8');
  assert.equal(packageJson.scripts['mobile-smoke'], 'node tests/mobile-smoke.cjs');
  assert.match(workflow, /actions\/checkout@v4/);
  assert.match(workflow, /actions\/setup-node@v4/);
  assert.match(workflow, /playwright install --with-deps chromium/);
  assert.match(workflow, /npm run mobile-smoke/);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'mobile-smoke.yml')), false);
  assert.match(smoke, /Pixel 5/);
  assert.match(smoke, /iPhone 13/);
  assert.match(smoke, /valuation-observation/);
});
