const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');

const root = path.join(__dirname, '..');
const accuracyRaw = fs.readFileSync(path.join(root, 'data', 'accuracy-data.json'), 'utf8');
const accuracy = JSON.parse(accuracyRaw);
const diagnostics = JSON.parse(fs.readFileSync(path.join(root, 'data', 'accuracy-diagnostics.json'), 'utf8'));

const accuracyHash = crypto.createHash('sha256').update(accuracyRaw).digest('hex');

test('Accuracy diagnostics are tied to the current official artifact', () => {
  assert.equal(diagnostics.schemaVersion, 2);
  assert.equal(diagnostics.generatedFrom, 'official-accuracy-artifact-only');
  assert.equal(diagnostics.source.accuracyDataSha256, accuracyHash);
  assert.equal(diagnostics.source.accuracyScope, 'verified-dld-only');
  assert.equal(diagnostics.counts.recordsInArtifact, accuracy.records.length);
  assert.equal(diagnostics.counts.scoredRecords, accuracy.records.length);
});

test('Accuracy diagnostics preserve official provenance and reconcile error buckets', () => {
  assert.equal(diagnostics.quality.recordsWithoutOfficialProvenance, 0);
  assert.equal(diagnostics.quality.recordsWithoutComparableDiagnostics, 0);
  assert.equal(diagnostics.checks.artifactUsesVerifiedDldOnly, true);
  assert.equal(diagnostics.checks.allRecordsHaveOfficialProvenance, true);
  assert.equal(diagnostics.checks.errorBucketTotalMatchesScoredRecords, true);
  assert.equal(
    Object.values(diagnostics.errorBuckets).reduce((sum, value) => sum + value, 0),
    diagnostics.counts.scoredRecords
  );
});

test('Accuracy diagnostics expose risk slices without changing the published average', () => {
  assert.ok(diagnostics.byPropertyType.apartment);
  assert.ok(diagnostics.byEvaluationLevel.project_size);
  assert.ok(diagnostics.bySaleMonth);
  assert.ok(diagnostics.worstPropertyTypeEvaluationGroups.length > 0);
  assert.ok(diagnostics.topAbsoluteErrors.length <= 25);
  assert.equal(accuracy.metrics.totalRecords, accuracy.records.length);
});
