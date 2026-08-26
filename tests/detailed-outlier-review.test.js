const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const analyzer = path.join(root, 'scripts', 'analyze-detailed-outliers.js');
const accuracyPath = path.join(root, 'data', 'accuracy-data.json');
const dldPath = path.join(root, 'data', 'dld-transactions.json');
const csvPath = path.join(root, 'data', 'dld-transactions.csv');
const outputPath = path.join('/tmp', `miayaar-detailed-outlier-review-${process.pid}.json`);

function hash(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

test.after(() => {
  if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
});

test('detailed outlier analysis is read-only and reconstructs official source links', () => {
  const before = [accuracyPath, dldPath, csvPath].map(hash);
  execFileSync(process.execPath, [analyzer, outputPath], { cwd: root, stdio: 'ignore' });
  const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(report.readOnly, true);
  assert.equal(report.source.accuracyScope, 'verified-dld-only');
  assert.equal(report.pipelineReconstruction.rawDldRecords, 26766);
  assert.equal(report.pipelineReconstruction.eligibleRecords, 26766);
  assert.equal(report.overallCoreFieldMismatches.length, 0);
  assert.equal(report.priorityRecord.accuracy.propertyRef, 'DLD-41-8610-2026');
  assert.equal(report.priorityRecord.accuracy.absErrorPct, 4211.935);
  assert.deepEqual([accuracyPath, dldPath, csvPath].map(hash), before);
});

test('International City boundary slice contains all severe cases without changing them', () => {
  const report = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'detailed-outlier-review-2026-08-26.json'), 'utf8'));
  const buckets = report.internationalCity.areaBoundaryBuckets;
  const nearBoundary = buckets.find(bucket => bucket.label === 'ratio-near-cleaning-boundary');
  const belowBoundary = buckets.find(bucket => bucket.label === 'ratio-below-boundary');
  assert.equal(report.internationalCity.dldRecords, 275);
  assert.equal(report.internationalCity.accuracySummary.records, 99);
  assert.equal(report.internationalCity.accuracySummary.severeOver100, 40);
  assert.equal(nearBoundary.records, 41);
  assert.equal(nearBoundary.severeOver100, 40);
  assert.equal(nearBoundary.areaRatios.median, 1.9997);
  assert.equal(belowBoundary.records, 58);
  assert.equal(belowBoundary.severeOver100, 0);
  assert.equal(report.safeguards.recordsExcludedOrCapped, false);
  assert.equal(report.safeguards.recommendationsAreNonOperational, true);
});
