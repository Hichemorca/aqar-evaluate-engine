const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const ACCURACY_PATH = path.join(ROOT, 'data', 'accuracy-data.json');
const OUTPUT_PATH = path.join(ROOT, 'data', 'accuracy-diagnostics.json');

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function percentile(values, percentile) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * percentile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return round(sorted[lower]);
  return round(sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower));
}

function groupBy(records, selector) {
  const groups = new Map();
  for (const record of records) {
    const key = selector(record) || 'unknown';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  return groups;
}

function summarize(records) {
  const signedErrors = records.map(record => Number(record.aqarVsActual)).filter(Number.isFinite);
  const absoluteErrors = signedErrors.map(value => Math.abs(value));
  const count = absoluteErrors.length;
  const within = limit => count ? round(100 * absoluteErrors.filter(value => value <= limit).length / count) : null;
  return {
    count,
    avgAccuracy: count ? round(100 - absoluteErrors.reduce((sum, value) => sum + value, 0) / count) : null,
    avgAbsoluteError: count ? round(absoluteErrors.reduce((sum, value) => sum + value, 0) / count) : null,
    medianAbsoluteError: percentile(absoluteErrors, 0.5),
    p90AbsoluteError: percentile(absoluteErrors, 0.9),
    p95AbsoluteError: percentile(absoluteErrors, 0.95),
    maxAbsoluteError: absoluteErrors.length ? round(Math.max(...absoluteErrors)) : null,
    bias: count ? round(signedErrors.reduce((sum, value) => sum + value, 0) / count) : null,
    within10: within(10),
    within15: within(15),
    within25: within(25),
    over25: within(25) === null ? null : round(100 - within(25)),
    over50: count ? round(100 * absoluteErrors.filter(value => value > 50).length / count) : null,
    over100: count ? round(100 * absoluteErrors.filter(value => value > 100).length / count) : null
  };
}

function summarizeGroups(records, selector) {
  return Object.fromEntries([...groupBy(records, selector).entries()]
    .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))
    .map(([key, group]) => [key, summarize(group)]));
}

function summarizeMonths(records) {
  return summarizeGroups(records, record => {
    const value = String(record.saleDate || '');
    return /^\d{4}-\d{2}/.test(value) ? value.slice(0, 7) : 'unknown';
  });
}

function qualitySummary(records) {
  const countValues = field => Object.fromEntries([...groupBy(records, record => record[field]).entries()]
    .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))
    .map(([key, group]) => [key, group.length]));
  const unique = field => [...new Set(records.map(record => record[field]).filter(Boolean))].sort();
  return {
    evidenceStatusCounts: countValues('evidenceStatus'),
    dataSourceCounts: countValues('dataSource'),
    verifiedByCounts: countValues('verifiedBy'),
    calibrationConfigIds: unique('calibrationConfigId'),
    recordsWithoutOfficialProvenance: records.filter(record => record.dataSource !== 'dld-real-cleaned' || record.verifiedBy !== 'Government Record' || record.evidenceStatus !== 'eligible').length,
    recordsWithoutComparableDiagnostics: records.filter(record => !record.comparableDiagnostics || record.comparableDiagnostics.diagnosticsOnly !== true).length
  };
}

function buildDiagnostics(data, accuracyDataSha256) {
  const records = Array.isArray(data.records) ? data.records : [];
  const scored = records.filter(record => Number.isFinite(Number(record.aqarVsActual)));
  const byPropertyType = summarizeGroups(scored, record => record.propertyType);
  const byEvaluationLevel = summarizeGroups(scored, record => record.evalLevel);
  const byAreaBand = summarizeGroups(scored, record => {
    const area = Number(record.area);
    if (!Number.isFinite(area)) return 'unknown';
    if (area < 80) return '<80 sqm';
    if (area <= 150) return '80–150 sqm';
    if (area <= 250) return '151–250 sqm';
    return '>250 sqm';
  });
  const groupDiagnostics = groupBy(scored, record => `${record.propertyType || 'unknown'} | ${record.evalLevel || 'unknown'}`);
  const worstGroups = [...groupDiagnostics.entries()]
    .filter(([, group]) => group.length >= 30)
    .map(([key, group]) => ({ group: key, ...summarize(group) }))
    .sort((left, right) => right.avgAbsoluteError - left.avgAbsoluteError || right.count - left.count)
    .slice(0, 20);
  const topErrors = [...scored]
    .map(record => ({
      propertyRef: record.propertyRef || null,
      saleDate: record.saleDate || null,
      propertyType: record.propertyType || null,
      district: record.district || null,
      evalLevel: record.evalLevel || null,
      evalCount: Number(record.evalCount) || 0,
      signedError: round(Number(record.aqarVsActual)),
      absoluteError: round(Math.abs(Number(record.aqarVsActual))),
      actualSalePrice: Number(record.actualSalePrice) || null,
      aqarValuation: Number(record.aqarValuation) || null
    }))
    .sort((left, right) => right.absoluteError - left.absoluteError || String(left.propertyRef).localeCompare(String(right.propertyRef)))
    .slice(0, 25);
  const absErrors = scored.map(record => Math.abs(Number(record.aqarVsActual)));
  const source = {
    artifact: 'data/accuracy-data.json',
    accuracyDataSha256,
    accuracyScope: data.metadata?.accuracyScope || null,
    calibrationConfigId: data.metadata?.calibrationConfigId || null,
    lastUpdated: data.metadata?.lastUpdated || null,
    methodology: data.metadata?.methodology || null,
    dataSource: data.metadata?.dataSource || null
  };
  return {
    schemaVersion: 2,
    generatedFrom: 'official-accuracy-artifact-only',
    source,
    counts: {
      recordsInArtifact: records.length,
      scoredRecords: scored.length,
      unscoredRecords: records.length - scored.length,
      recordsWithAbsErrorOver25: absErrors.filter(value => value > 25).length,
      recordsWithAbsErrorOver50: absErrors.filter(value => value > 50).length,
      recordsWithAbsErrorOver100: absErrors.filter(value => value > 100).length
    },
    overall: summarize(scored),
    errorBuckets: {
      '0-10%': absErrors.filter(value => value <= 10).length,
      '10-25%': absErrors.filter(value => value > 10 && value <= 25).length,
      '25-50%': absErrors.filter(value => value > 25 && value <= 50).length,
      '50-100%': absErrors.filter(value => value > 50 && value <= 100).length,
      '>100%': absErrors.filter(value => value > 100).length
    },
    byPropertyType,
    byEvaluationLevel,
    byAreaBand,
    bySaleMonth: summarizeMonths(scored),
    worstPropertyTypeEvaluationGroups: worstGroups,
    topAbsoluteErrors: topErrors,
    quality: qualitySummary(records),
    checks: {
      artifactUsesVerifiedDldOnly: data.metadata?.accuracyScope === 'verified-dld-only',
      allRecordsHaveOfficialProvenance: records.every(record => record.dataSource === 'dld-real-cleaned' && record.verifiedBy === 'Government Record' && record.evidenceStatus === 'eligible'),
      errorBucketTotalMatchesScoredRecords: Object.values({
        a: absErrors.filter(value => value <= 10).length,
        b: absErrors.filter(value => value > 10 && value <= 25).length,
        c: absErrors.filter(value => value > 25 && value <= 50).length,
        d: absErrors.filter(value => value > 50 && value <= 100).length,
        e: absErrors.filter(value => value > 100).length
      }).reduce((sum, value) => sum + value, 0) === scored.length
    }
  };
}

function main() {
  const raw = fs.readFileSync(ACCURACY_PATH, 'utf8');
  const data = JSON.parse(raw);
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const diagnostics = buildDiagnostics(data, hash);
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(diagnostics, null, 2)}\n`);
  console.log(`Generated ${path.relative(ROOT, OUTPUT_PATH)} from ${diagnostics.counts.scoredRecords} official Accuracy records`);
}

if (require.main === module) main();

module.exports = { buildDiagnostics, summarize, percentile };
