#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outputPath = process.argv[2] || path.join(root, 'docs', 'accuracy-stability-analysis.json');
const rollingPath = process.argv[3] || path.join(root, 'docs', 'accuracy-stability-rolling-origin.json');
const accuracyPath = path.join(root, 'data', 'accuracy-data.json');
const dldPath = path.join(root, 'data', 'dld-transactions.json');

const accuracyPayload = JSON.parse(fs.readFileSync(accuracyPath, 'utf8'));
const dldPayload = JSON.parse(fs.readFileSync(dldPath, 'utf8'));
const rolling = JSON.parse(fs.readFileSync(rollingPath, 'utf8'));
const rows = value => Array.isArray(value) ? value : (value.records || value.data || []);
const accuracy = rows(accuracyPayload);
const dld = rows(dldPayload);
const number = value => Number.isFinite(Number(value)) ? Number(value) : null;
const positive = value => Number.isFinite(Number(value)) && Number(value) > 0;
const text = value => String(value ?? '').trim();
const norm = value => text(value).toLowerCase();
const date = row => {
  const parsed = new Date(row.saleDate || row.instanceDate);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
};
const project = row => text(row.masterProject || row.project);
const type = row => norm(row.propertyType) || 'unknown';
const evaluationLevel = row => norm(row.evalLevel || row.evaluationLevel || row.valuationLevel) || 'unknown';
const district = row => text(row.district || row.districtArea || row.areaName) || 'unknown';
const recordId = row => text(row.propertyRef || row.transactionNumber || row.id || row.transactionId || row.referenceNumber) || null;
const errorPct = row => positive(row.actualSalePrice) && positive(row.aqarValuation)
  ? (number(row.aqarValuation) - number(row.actualSalePrice)) / number(row.actualSalePrice) * 100
  : null;
const absoluteErrorPct = row => {
  const value = errorPct(row);
  return value === null ? null : Math.abs(value);
};
const quantile = (values, q) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
};
const median = values => quantile(values, 0.5);
const round = (value, digits = 3) => Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
const hash = file => require('crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function groupSummary(groupRows, keyName, keyFn) {
  const groups = new Map();
  for (const row of groupRows) {
    const key = keyFn(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups].map(([key, group]) => {
    const errors = group.map(absoluteErrorPct).filter(Number.isFinite);
    const signed = group.map(errorPct).filter(Number.isFinite);
    return {
      [keyName]: key,
      records: group.length,
      scoredRecords: errors.length,
      maePct: round(errors.length ? errors.reduce((sum, value) => sum + value, 0) / errors.length : null),
      medianAbsErrorPct: round(median(errors)),
      p90AbsErrorPct: round(quantile(errors, 0.9)),
      maxAbsErrorPct: round(errors.length ? Math.max(...errors) : null),
      biasPct: round(signed.length ? signed.reduce((sum, value) => sum + value, 0) / signed.length : null),
      within15Pct: round(errors.length ? errors.filter(value => value <= 15).length / errors.length * 100 : null),
      over100Pct: round(errors.length ? errors.filter(value => value > 100).length / errors.length * 100 : null)
    };
  }).sort((a, b) => (b.scoredRecords - a.scoredRecords) || ((b.maePct ?? -1) - (a.maePct ?? -1)));
}

const scored = accuracy.filter(row => Number.isFinite(absoluteErrorPct(row)));
const topOutliers = [...scored]
  .sort((a, b) => absoluteErrorPct(b) - absoluteErrorPct(a))
  .slice(0, 50)
  .map(row => ({
    id: recordId(row), date: date(row), propertyType: row.propertyType ?? null,
    evaluationLevel: row.evalLevel ?? row.evaluationLevel ?? row.valuationLevel ?? null,
    district: row.district ?? row.districtArea ?? null, project: row.masterProject || row.project || null,
    actualSalePrice: number(row.actualSalePrice), aqarValuation: number(row.aqarValuation),
    absoluteErrorPct: round(absoluteErrorPct(row)), signedErrorPct: round(errorPct(row)),
    area: number(row.area), procedureArea: number(row.procedureArea), pricePerSqm: number(row.pricePerSqm),
    dataSource: row.dataSource ?? null, evidenceStatus: row.evidenceStatus ?? null,
    verifiedBy: row.verifiedBy ?? null, sourceTransactionId: row.sourceTransactionId ?? null
  }));

const integrityFlags = scored.map(row => {
  const flags = [];
  const actual = number(row.actualSalePrice);
  const valuation = number(row.aqarValuation);
  const area = number(row.area);
  const pricePerSqm = number(row.pricePerSqm);
  if (valuation && valuation > 100000000) flags.push('valuation-over-100m');
  if (area && area > 10000) flags.push('area-over-10000sqm');
  if (actual && valuation && actual / valuation > 20) flags.push('actual-to-valuation-over-20x');
  if (actual && valuation && valuation / actual > 20) flags.push('valuation-to-actual-over-20x');
  if (pricePerSqm && (pricePerSqm < 100 || pricePerSqm > 100000)) flags.push('price-per-sqm-extreme');
  if (!date(row)) flags.push('missing-or-invalid-date');
  if (!text(row.propertyType)) flags.push('missing-property-type');
  return { id: recordId(row), date: date(row), propertyType: row.propertyType ?? null, district: row.district ?? null, project: project(row) || null, absoluteErrorPct: round(absoluteErrorPct(row)), flags };
}).filter(row => row.flags.length);

const performanceFlags = topOutliers.map(row => ({
  ...row,
  flag: row.absoluteErrorPct > 100 ? 'model-performance-or-label-review-over-100pct'
    : row.absoluteErrorPct > 50 ? 'high-error-review-over-50pct'
      : 'moderate-error-review-over-25pct'
}));

const counts = values => ({
  records: values.length,
  scoredRecords: values.filter(row => Number.isFinite(absoluteErrorPct(row))).length,
  over25: values.filter(row => (absoluteErrorPct(row) ?? -1) > 25).length,
  over50: values.filter(row => (absoluteErrorPct(row) ?? -1) > 50).length,
  over100: values.filter(row => (absoluteErrorPct(row) ?? -1) > 100).length
});
const dateSummary = raw => {
  const dates = raw.map(date).filter(Boolean).sort();
  return { records: raw.length, datedRecords: dates.length, min: dates[0] || null, max: dates.at(-1) || null };
};

const typeMonthRows = scored.filter(row => date(row));
const byDistrict = groupSummary(scored, 'district', district).filter(row => row.scoredRecords >= 20);
const result = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  generatedBy: 'scripts/analyze-accuracy-stability.js',
  readOnly: true,
  scope: 'official-accuracy-artifact-only',
  source: {
    accuracyPath: 'data/accuracy-data.json',
    dldPath: 'data/dld-transactions.json',
    accuracySha256: hash(accuracyPath),
    dldSha256: hash(dldPath),
    accuracyMetadata: accuracyPayload.metadata || null,
    accuracyScope: accuracyPayload.metadata?.accuracyScope || null
  },
  sourceCounts: { accuracy: dateSummary(accuracy), dld: dateSummary(dld) },
  scored: counts(scored),
  thresholds: { moderateErrorAbsPct: 25, highErrorAbsPct: 50, severeErrorAbsPct: 100, minimumGroupRecordsForSectorSlices: 20 },
  outliers: { top50: topOutliers, integrityFlags, performanceFlags },
  slices: {
    byPropertyType: groupSummary(scored, 'propertyType', type),
    byEvaluationLevel: groupSummary(scored, 'evaluationLevel', evaluationLevel),
    bySaleMonth: groupSummary(scored.filter(row => date(row)), 'month', row => date(row).slice(0, 7)),
    byPropertyTypeAndMonth: groupSummary(typeMonthRows, 'propertyTypeMonth', row => `${type(row)}|${date(row).slice(0, 7)}`).filter(row => row.scoredRecords >= 20),
    topDistrictsByMae: [...byDistrict].sort((a, b) => (b.maePct ?? -1) - (a.maePct ?? -1)).slice(0, 20)
  },
  rollingOrigin: {
    input: path.relative(root, rollingPath),
    windows: rolling.results.map(window => ({
      id: window.id, trainEndExclusive: window.trainEndExclusive, testStart: window.testStart, testEndExclusive: window.testEndExclusive,
      trainDldRecords: window.trainDldRecords, testAccuracyRecords: window.testAccuracyRecords, candidateCohorts: window.candidateCohorts,
      coveragePct: window.aggregate.coveragePct, baseline: window.aggregate.baseline, shadow: window.aggregate.shadow,
      byType: Object.fromEntries(Object.entries(window.byType).map(([key, value]) => [key, {
        testRecords: value.testRecords, matchedRecords: value.matchedRecords, coveragePct: value.coveragePct,
        baseline: value.baseline, shadow: value.shadow
      }]))
    })),
    stability: rolling.stability
  },
  safeguards: {
    officialAccuracyChanged: false, officialDldChanged: false, calibrationChanged: false,
    evaluatorChanged: false, recordsExcludedOrCapped: false, shadowOnly: true
  }
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ output: outputPath, sourceCounts: result.sourceCounts, scored: result.scored, integrityFlagCount: integrityFlags.length, rollingWindows: result.rollingOrigin.windows.length }, null, 2));
