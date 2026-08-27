const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const reportPath = path.join(root, 'docs', 'reproducibility-drift-2026-08-27.json');
const scriptPath = path.join(root, 'scripts', 'reproducibility-drift.js');

test('PR-01 report proves same-date repeatability and isolates official artifacts', () => {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const script = fs.readFileSync(scriptPath, 'utf8');
  assert.equal(report.readOnly, true);
  assert.equal(report.repeatability.accuracy.identicalArtifact, true);
  assert.equal(report.repeatability.market.identicalArtifact, true);
  assert.equal(report.repeatability.accuracy.comparison.changedRecordCount, 0);
  assert.equal(report.repeatability.market.comparison.changedRecordCount, 0);
  assert.ok(report.dateDrift.fullMarketArtifact.some(item => item.changedRecordCount > 0));
  assert.equal(report.safeguards.officialAccuracyUnchanged, true);
  assert.equal(report.safeguards.officialDldUnchanged, true);
  assert.equal(report.safeguards.officialArtifactsNotWritten, true);
  assert.equal(report.safeguards.recordsExcludedOrCapped, false);
  assert.match(script, /mkdtempSync/);
  assert.match(script, /FIXED_NOW/);
  assert.doesNotMatch(script, /writeFileSync\(officialAccuracyPath/);
  assert.doesNotMatch(script, /writeFileSync\(officialDldPath/);
});
