const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const reportPath = path.join(root, 'docs', 'calibration-impact-matrix-2026-08-27.json');
const scriptPath = path.join(root, 'scripts', 'local-calibration-impact-matrix.js');

test('local calibration impact matrix covers every enumerated scenario safely', () => {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const script = fs.readFileSync(scriptPath, 'utf8');
  assert.equal(report.readOnly, true);
  assert.ok(report.numericScenarioCount > 400);
  assert.equal(report.resultCount, report.numericScenarioCount);
  assert.ok(report.counts['official-value-changed'] >= 40);
  assert.ok(report.counts['interactive-sales-path-not-exercised-by-shared-engine'] >= 200);
  assert.ok(report.counts['interactive-only-not-exercised-by-shared-engine'] >= 10);
  assert.ok(report.counts['shadow-only'] >= 1);
  assert.equal(Object.values(report.counts).reduce((sum, count) => sum + count, 0), report.resultCount);
  assert.equal(report.safeguards.officialAccuracyUnchanged, true);
  assert.equal(report.safeguards.officialDldUnchanged, true);
  assert.equal(report.safeguards.noNetlifyRequests, true);
  assert.equal(report.safeguards.noCalibrationSave, true);
  assert.equal(report.safeguards.noOfficialArtifactsWritten, true);
  assert.match(script, /deepMergeKnown/);
  assert.match(script, /validateConfig/);
  assert.match(script, /createDefaultCalibrationConfig/);
  assert.match(script, /noCalibrationSave/);
  assert.doesNotMatch(script, /\bfetch\s*\(/);
  assert.doesNotMatch(script, /\bhttps?:\/\//);
  assert.doesNotMatch(script, /\bgetStore\s*\(/);
});

test('local matrix contains no invalid mutated configurations', () => {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.equal(report.results.some(row => row.skipped === 'invalid-mutated-config'), false);
  assert.equal(report.results.filter(row => row.path.startsWith('v21ShadowMultipliers.')).every(row => row.deltas.officialValue === 0), true);
});
