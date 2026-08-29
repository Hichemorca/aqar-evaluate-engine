const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const accuracyPath = path.join(root, 'data', 'accuracy-data.json');
const dldPath = path.join(root, 'data', 'dld-transactions.json');
const rollingPath = path.join(root, 'docs', 'accuracy-stability-rolling-origin-2026-08-26.json');
const analyzerPath = path.join(root, 'scripts', 'analyze-accuracy-stability.js');
const outputPath = path.join('/tmp', `miayaar-accuracy-stability-${process.pid}.json`);

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

test.after(() => {
  if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
});

test('accuracy stability analyzer produces read-only, provenance-bound output', () => {
  const accuracyHashBefore = sha256(accuracyPath);
  const dldHashBefore = sha256(dldPath);
  execFileSync(process.execPath, [analyzerPath, outputPath, rollingPath], { cwd: root, stdio: 'ignore' });
  const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(report.readOnly, true);
  assert.equal(report.scope, 'official-accuracy-artifact-only');
  assert.equal(report.source.accuracySha256, accuracyHashBefore);
  assert.equal(report.source.dldSha256, dldHashBefore);
  assert.equal(report.source.accuracyScope, 'verified-dld-only');
  assert.equal(report.sourceCounts.accuracy.records, 8108);
  assert.equal(report.scored.scoredRecords, 8108);
  assert.equal(report.safeguards.officialAccuracyChanged, false);
  assert.equal(report.safeguards.officialDldChanged, false);
  assert.equal(report.safeguards.recordsExcludedOrCapped, false);
  assert.equal(sha256(accuracyPath), accuracyHashBefore);
  assert.equal(sha256(dldPath), dldHashBefore);
});

test('accuracy stability report exposes explicit outlier thresholds and risk slices', () => {
  const report = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'accuracy-stability-analysis-2026-08-26.json'), 'utf8'));
  assert.deepEqual(report.thresholds, {
    moderateErrorAbsPct: 25,
    highErrorAbsPct: 50,
    severeErrorAbsPct: 100,
    minimumGroupRecordsForSectorSlices: 20
  });
  assert.equal(report.outliers.top50.length, 50);
  assert.equal(report.outliers.integrityFlags.length, 3);
  assert.ok(report.slices.byPropertyType.some(value => value.propertyType === 'land'));
  assert.ok(report.slices.byEvaluationLevel.some(value => value.evaluationLevel === 'district_size'));
  assert.ok(report.slices.bySaleMonth.length >= 4);
});

test('rolling-origin input remains chronological and shadow-only', () => {
  const report = JSON.parse(fs.readFileSync(rollingPath, 'utf8'));
  assert.equal(report.results.length, 4);
  for (let index = 1; index < report.results.length; index += 1) {
    assert.ok(report.results[index - 1].testStart <= report.results[index].testStart);
  }
  for (const window of report.results) {
    assert.ok(window.trainEndExclusive <= window.testStart);
    assert.ok(window.testStart < window.testEndExclusive);
    assert.ok(window.trainDldRecords > 0);
    assert.ok(window.testAccuracyRecords > 0);
    assert.equal(window.aggregate.baseline.records, window.testAccuracyRecords);
    assert.equal(window.aggregate.shadow.records, window.testAccuracyRecords);
  }
});
