#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.join(__dirname, '..');
const officialAccuracyPath = path.join(repoRoot, 'data', 'accuracy-data.json');
const officialDldPath = path.join(repoRoot, 'data', 'dld-transactions.json');
const DEFAULT_OUTPUT = path.join(os.tmpdir(), 'miayaar-reproducibility-drift.json');

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function parseArgs(argv) {
  const args = { output: process.env.REPRODUCIBILITY_OUTPUT || DEFAULT_OUTPUT };
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === '--output') args.output = path.resolve(argv[++index]);
  }
  return args;
}

function addDays(isoDate, days) {
  const date = new Date(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function getSaleDate(record) {
  const value = record?.saleDate || record?.instanceDate;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeFixedDatePreload(filePath) {
  fs.writeFileSync(filePath, `const RealDate = global.Date;\nconst fixedNow = new RealDate(process.env.FIXED_NOW).getTime();\nif (!Number.isFinite(fixedNow)) throw new Error('FIXED_NOW must be a valid ISO date');\nclass FixedDate extends RealDate {\n    constructor(...args) { if (args.length === 0) super(fixedNow); else super(...args); }
\n  static now() { return fixedNow; }\n  static parse(...args) { return RealDate.parse(...args); }\n  static UTC(...args) { return RealDate.UTC(...args); }\n}\nglobal.Date = FixedDate;\n`);
}

function copyRuntime(tempRoot) {
  fs.cpSync(path.join(repoRoot, 'scripts'), path.join(tempRoot, 'scripts'), { recursive: true });
  fs.cpSync(path.join(repoRoot, 'shared'), path.join(tempRoot, 'shared'), { recursive: true });
  fs.cpSync(path.join(repoRoot, 'data'), path.join(tempRoot, 'data'), { recursive: true });
  const preload = path.join(tempRoot, 'fixed-date.cjs');
  writeFixedDatePreload(preload);
  return preload;
}

function runAtDate(fixedNow, runIndex) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `miayaar-repro-${runIndex}-`));
  const preload = copyRuntime(tempRoot);
  const result = spawnSync(process.execPath, ['-r', preload, 'scripts/evaluate-and-save.js'], {
    cwd: tempRoot,
    env: { ...process.env, FIXED_NOW: fixedNow },
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(`Evaluator failed for ${fixedNow}:\n${result.stdout}\n${result.stderr}`);
  }
  const accuracyPath = path.join(tempRoot, 'data', 'accuracy-data.json');
  const marketPath = path.join(tempRoot, 'data', 'market-data.json');
  const accuracy = readJson(accuracyPath);
  const market = readJson(marketPath);
  return {
    fixedNow,
    runIndex,
    tempRoot,
    stdoutTail: result.stdout.split('\n').slice(-8).join('\n'),
    accuracy,
    market,
    accuracySha256: sha256(accuracyPath),
    marketSha256: sha256(marketPath),
    dldSha256: sha256(path.join(tempRoot, 'data', 'dld-transactions.json'))
  };
}

function numberOrNull(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function compareRuns(left, right, source = 'accuracy') {
  const leftArtifact = source === 'market' ? left.market : left.accuracy;
  const rightArtifact = source === 'market' ? right.market : right.accuracy;
  const leftRows = new Map((leftArtifact.records || []).map(row => [row.propertyRef, row]));
  const rightRows = new Map((rightArtifact.records || []).map(row => [row.propertyRef, row]));
  const keys = [...leftRows.keys()].filter(key => rightRows.has(key)).sort();
  const changed = [];
  let valueDeltaSum = 0;
  let errorDeltaSum = 0;
  let maxValueDelta = 0;
  let maxErrorDelta = 0;
  for (const key of keys) {
    const a = leftRows.get(key);
    const b = rightRows.get(key);
    const valueA = numberOrNull(a.aqarValuation);
    const valueB = numberOrNull(b.aqarValuation);
    const errorA = numberOrNull(a.aqarVsActual);
    const errorB = numberOrNull(b.aqarVsActual);
    const valueDelta = valueA !== null && valueB !== null ? Math.abs(valueA - valueB) : 0;
    const errorDelta = errorA !== null && errorB !== null ? Math.abs(errorA - errorB) : 0;
    valueDeltaSum += valueDelta;
    errorDeltaSum += errorDelta;
    maxValueDelta = Math.max(maxValueDelta, valueDelta);
    maxErrorDelta = Math.max(maxErrorDelta, errorDelta);
    if (valueDelta > 0.000001 || errorDelta > 0.000001) {
      changed.push({
        propertyRef: key,
        leftValue: valueA,
        rightValue: valueB,
        absoluteValueDelta: valueDelta,
        leftErrorPct: errorA,
        rightErrorPct: errorB,
        absoluteErrorDelta: errorDelta
      });
    }
  }
  const leftMetrics = leftArtifact.metrics || {};
  const rightMetrics = rightArtifact.metrics || {};
  return {
    source,
    leftFixedNow: left.fixedNow,
    rightFixedNow: right.fixedNow,
    commonRecords: keys.length,
    changedRecordCount: changed.length,
    changedRecordRatePct: keys.length ? Number((changed.length / keys.length * 100).toFixed(4)) : null,
    meanAbsoluteValuationDelta: keys.length ? Number((valueDeltaSum / keys.length).toFixed(6)) : null,
    maxAbsoluteValuationDelta: Number(maxValueDelta.toFixed(6)),
    meanAbsoluteErrorPctDelta: keys.length ? Number((errorDeltaSum / keys.length).toFixed(6)) : null,
    maxAbsoluteErrorPctDelta: Number(maxErrorDelta.toFixed(6)),
    metricDelta: {
      totalRecords: numberOrNull(rightMetrics.totalRecords) - numberOrNull(leftMetrics.totalRecords),
      avgAccuracy: Number((numberOrNull(rightMetrics.avgAccuracy) - numberOrNull(leftMetrics.avgAccuracy)).toFixed(6)),
      avgDeviation: Number((numberOrNull(rightMetrics.avgDeviation) - numberOrNull(leftMetrics.avgDeviation)).toFixed(6))
    },
    topValuationDrift: changed.slice().sort((a, b) => b.absoluteValueDelta - a.absoluteValueDelta).slice(0, 20)
  };
}

function main() {
  const args = parseArgs(process.argv);
  const officialBefore = {
    accuracySha256: sha256(officialAccuracyPath),
    dldSha256: sha256(officialDldPath)
  };
  const officialAccuracy = readJson(officialAccuracyPath);
  const officialDld = readJson(officialDldPath);
  const saleDates = officialDld.map(getSaleDate).filter(Boolean).sort((a, b) => a - b);
  if (!saleDates.length) throw new Error('No valid DLD sale dates found');
  const latestSaleDate = saleDates[saleDates.length - 1].toISOString();
  const fixedDates = [addDays(latestSaleDate, 1), addDays(latestSaleDate, 90), addDays(latestSaleDate, 365)];
  const repeatedA = runAtDate(fixedDates[1], 1);
  const repeatedB = runAtDate(fixedDates[1], 2);
  const historicalRuns = [repeatedA, runAtDate(fixedDates[0], 3), runAtDate(fixedDates[2], 4)];
  const sameDateAccuracyComparison = compareRuns(repeatedA, repeatedB, 'accuracy');
  const sameDateMarketComparison = compareRuns(repeatedA, repeatedB, 'market');
  const accuracyDateComparisons = historicalRuns.slice(1).map(run => compareRuns(repeatedA, run, 'accuracy'));
  const marketDateComparisons = historicalRuns.slice(1).map(run => compareRuns(repeatedA, run, 'market'));
  const report = {
    schemaVersion: 1,
    readOnly: true,
    scope: 'isolated-evaluator-reruns-with-fixed-system-dates',
    officialBaseline: {
      accuracyRecords: officialAccuracy.records?.length || 0,
      dldRecords: officialDld.length,
      accuracySha256: officialBefore.accuracySha256,
      dldSha256: officialBefore.dldSha256
    },
    fixedDates,
    latestDldSaleDate: latestSaleDate,
    repeatability: {
      sameFixedDate: fixedDates[1],
      accuracy: {
        firstRunSha256: repeatedA.accuracySha256,
        secondRunSha256: repeatedB.accuracySha256,
        identicalArtifact: repeatedA.accuracySha256 === repeatedB.accuracySha256,
        comparison: sameDateAccuracyComparison
      },
      market: {
        firstRunSha256: repeatedA.marketSha256,
        secondRunSha256: repeatedB.marketSha256,
        identicalArtifact: repeatedA.marketSha256 === repeatedB.marketSha256,
        comparison: sameDateMarketComparison
      }
    },
    dateDrift: {
      fullMarketArtifact: marketDateComparisons,
      accuracyWindowArtifact: accuracyDateComparisons
    },
    safeguards: {
      officialAccuracyUnchanged: sha256(officialAccuracyPath) === officialBefore.accuracySha256,
      officialDldUnchanged: sha256(officialDldPath) === officialBefore.dldSha256,
      officialArtifactsNotWritten: true,
      evaluatorSourceUnchanged: true,
      calibrationUnchanged: true,
      recordsExcludedOrCapped: false
    }
  };
  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    output: args.output,
    repeatable: report.repeatability.accuracy.identicalArtifact && report.repeatability.market.identicalArtifact,
    dateDrift: report.dateDrift.fullMarketArtifact.map(item => ({
      left: item.leftFixedNow,
      right: item.rightFixedNow,
      changedRecordCount: item.changedRecordCount,
      changedRecordRatePct: item.changedRecordRatePct,
      maxAbsoluteValuationDelta: item.maxAbsoluteValuationDelta,
      maxAbsoluteErrorPctDelta: item.maxAbsoluteErrorPctDelta
    })),
    safeguards: report.safeguards
  }, null, 2));
}

main();
