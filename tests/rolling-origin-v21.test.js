const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const report = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs/v2.1-project-multiplier-rolling-origin.json'), 'utf8'));

test('rolling-origin report contains four chronological windows', () => {
  assert.equal(report.results.length, 4);
  for (let index = 1; index < report.results.length; index += 1) {
    assert.ok(report.results[index - 1].testStart <= report.results[index].testStart);
  }
});

test('each rolling-origin window trains before its test period', () => {
  for (const window of report.results) {
    assert.ok(window.trainEndExclusive <= window.testStart);
    assert.ok(window.testStart < window.testEndExclusive);
    assert.ok(window.trainDldRecords > 0);
    assert.ok(window.testAccuracyRecords > 0);
  }
});

test('rolling-origin project multipliers stay within configured bounds', () => {
  for (const window of report.results) {
    for (const candidate of window.candidates) {
      assert.ok(candidate.multiplier >= report.options.candidateMin && candidate.multiplier <= report.options.candidateMax);
    }
  }
});

test('rolling-origin records unchanged fallback coverage explicitly', () => {
  for (const window of report.results) {
    for (const value of Object.values(window.byType)) {
      assert.equal(value.testRecords, value.matchedRecords + value.fallbackUnchangedRecords);
    }
  }
});

test('rolling-origin stability report contains pairwise transitions and repeated cohorts', () => {
  assert.equal(report.stability.pairwise.length, 3);
  assert.ok(report.stability.cohortsSeenAtLeast2 > 0);
  for (const transition of report.stability.pairwise) {
    assert.ok(transition.commonCohorts > 0);
    assert.ok(transition.signStabilityPct >= 0 && transition.signStabilityPct <= 100);
  }
});
