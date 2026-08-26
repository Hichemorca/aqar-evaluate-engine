#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const report = JSON.parse(fs.readFileSync(process.argv[2] || path.join(root, 'docs/v2.1-project-multiplier-rolling-origin.json'), 'utf8'));
const compact = value => ({ records: value.records, maePct: value.maePct, biasPct: value.biasPct, p90AbsPct: value.p90AbsPct, within15Pct: value.within15Pct });
console.log(JSON.stringify({
  windows: report.results.map(window => ({ id: window.id, trainEndExclusive: window.trainEndExclusive, testStart: window.testStart, testEndExclusive: window.testEndExclusive, trainDldRecords: window.trainDldRecords, testAccuracyRecords: window.testAccuracyRecords, candidateCohorts: window.candidateCohorts, aggregate: { coveragePct: window.aggregate.coveragePct, baseline: compact(window.aggregate.baseline), shadow: compact(window.aggregate.shadow) }, byType: Object.fromEntries(Object.entries(window.byType).map(([type, value]) => [type, { testRecords: value.testRecords, coveragePct: value.coveragePct, fallbackUnchangedRecords: value.fallbackUnchangedRecords, baseline: compact(value.baseline), shadow: compact(value.shadow), multiplierDistribution: value.multiplierDistribution }])) })),
  stability: report.stability
}, null, 2));
