const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const accuracyPath = path.join(root, 'data', 'accuracy-data.json');
const dldPath = path.join(root, 'data', 'dld-transactions.json');
const analyzerPath = path.join(root, 'scripts', 'review-accuracy-outliers.js');
const outputPath = path.join('/tmp', `miayaar-outlier-review-${process.pid}.json`);

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

test.after(() => {
  if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
});

test('severe Accuracy outliers all map to official DLD records without core mismatches', () => {
  const accuracyHashBefore = sha256(accuracyPath);
  const dldHashBefore = sha256(dldPath);
  execFileSync(process.execPath, [analyzerPath, outputPath], { cwd: root, stdio: 'ignore' });
  const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(report.readOnly, true);
  assert.equal(report.scope, 'severe-accuracy-outliers-over-100pct');
  assert.equal(report.source.accuracyScope, 'verified-dld-only');
  assert.equal(report.counts.severeErrorRecords, 66);
  assert.equal(report.counts.matchedByAnyOfficialKey, 66);
  assert.equal(report.counts.exactCoreSourceMatches, 66);
  assert.equal(report.counts.recordsWithDldFieldMismatch, 0);
  assert.equal(report.counts.recordsWithDataIntegrityFlags, 1);
  assert.equal(report.safeguards.recordsExcludedOrCapped, false);
  assert.equal(report.safeguards.officialAccuracyChanged, false);
  assert.equal(report.safeguards.officialDldChanged, false);
  assert.equal(sha256(accuracyPath), accuracyHashBefore);
  assert.equal(sha256(dldPath), dldHashBefore);
});

test('outlier review distinguishes source review from performance review', () => {
  const report = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'accuracy-outlier-review-2026-08-26.json'), 'utf8'));
  assert.equal(report.records.length, 66);
  assert.equal(report.severeSlices.byPropertyType.land, 10);
  assert.equal(report.severeSlices.byPropertyType.apartment, 54);
  assert.equal(report.severeSlices.byEvalLevel.district_size, 47);
  assert.equal(report.flagCounts.dataIntegrity['review-area-over-10000sqm'], 1);
  assert.equal(report.flagCounts.dataIntegrity['review-valuation-to-actual-over-20x'], 1);
  assert.equal(report.flagCounts.performance['source-fields-match-review-as-performance-case'], 66);
  assert.equal(report.records[0].disposition, 'data-integrity-or-label-review-first');
  assert.equal(report.records.slice(1).every(record => record.disposition === 'performance-review-after-source-match'), true);
});
