#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { cleanDldRecords } = require('../shared/dld-evidence-cleaning');
const { applyAllFilters } = require('../scripts/cleaning-pipeline');
const { buildComparableGroups, comparableKey } = require('../shared/comparable-diagnostics');

const root = path.resolve(__dirname, '..');
const outputPath = process.argv[2] || path.join(root, 'docs', 'detailed-outlier-review-2026-08-26.json');
const accuracyPath = path.join(root, 'data', 'accuracy-data.json');
const dldPath = path.join(root, 'data', 'dld-transactions.json');
const csvPath = path.join(root, 'data', 'dld-transactions.csv');
const accuracyPayload = JSON.parse(fs.readFileSync(accuracyPath, 'utf8'));
const accuracy = accuracyPayload.records;
const dld = JSON.parse(fs.readFileSync(dldPath, 'utf8'));
const csv = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');
const targetDistrict = 'INTERNATIONAL CITY PH 2 & 3';
const priorityRef = 'DLD-41-8610-2026';
const severeThreshold = 100;
const nearBoundaryThreshold = 1.95;

const text = value => String(value ?? '').trim();
const upper = value => text(value).replace(/\s+/g, ' ').toUpperCase();
const number = value => Number.isFinite(Number(value)) ? Number(value) : null;
const positive = value => Number.isFinite(Number(value)) && Number(value) > 0;
const date = row => { const parsed = new Date(row.saleDate || row.instanceDate); return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null; };
const round = (value, digits = 3) => Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const ppsm = row => positive(row.actualSalePrice) && positive(row.area) ? number(row.actualSalePrice) / number(row.area) : null;
const predictedPpsm = row => positive(row.aqarValuation) && positive(row.area) ? number(row.aqarValuation) / number(row.area) : null;
const areaRatio = row => positive(row.area) && positive(row.procedureArea) ? number(row.area) / number(row.procedureArea) : null;
const absoluteError = row => positive(row.actualSalePrice) && positive(row.aqarValuation) ? Math.abs((number(row.aqarValuation) - number(row.actualSalePrice)) / number(row.actualSalePrice) * 100) : null;
const signedError = row => positive(row.actualSalePrice) && positive(row.aqarValuation) ? (number(row.aqarValuation) - number(row.actualSalePrice)) / number(row.actualSalePrice) * 100 : null;
const quantile = (values, q) => { const sorted = values.filter(Number.isFinite).sort((a, b) => a - b); if (!sorted.length) return null; const p = (sorted.length - 1) * q; const lower = Math.floor(p); const upper = Math.ceil(p); return sorted[lower] + (sorted[upper] - sorted[lower]) * (p - lower); };
const median = values => quantile(values, 0.5);
const groupRows = (rows, keyFn) => { const groups = new Map(); for (const row of rows) { const key = keyFn(row); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row); } return groups; };
const summary = rows => { const abs = rows.map(absoluteError).filter(Number.isFinite); const signed = rows.map(signedError).filter(Number.isFinite); const actual = rows.map(ppsm).filter(Number.isFinite); const predicted = rows.map(predictedPpsm).filter(Number.isFinite); return { records: rows.length, minDate: rows.map(date).filter(Boolean).sort()[0] || null, maxDate: rows.map(date).filter(Boolean).sort().at(-1) || null, maePct: round(abs.length ? abs.reduce((a, b) => a + b, 0) / abs.length : null), medianAbsErrorPct: round(median(abs)), p90AbsErrorPct: round(quantile(abs, 0.9)), maxAbsErrorPct: round(abs.length ? Math.max(...abs) : null), biasPct: round(signed.length ? signed.reduce((a, b) => a + b, 0) / signed.length : null), within15Pct: round(abs.length ? abs.filter(value => value <= 15).length / abs.length * 100 : null), severeOver100: abs.filter(value => value > severeThreshold).length, actualPpsm: { p25: round(quantile(actual, 0.25), 2), median: round(median(actual), 2), p75: round(quantile(actual, 0.75), 2), max: round(actual.length ? Math.max(...actual) : null, 2) }, predictedPpsm: { p25: round(quantile(predicted, 0.25), 2), median: round(median(predicted), 2), p75: round(quantile(predicted, 0.75), 2), max: round(predicted.length ? Math.max(...predicted) : null, 2) } }; };

function parseCsvLine(line) {
  const fields = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"' && quoted) { field += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { fields.push(field); field = ''; }
    else field += char;
  }
  fields.push(field);
  return fields;
}
function parseCsv(content) {
  const lines = content.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines.shift());
  return lines.map(line => Object.fromEntries(parseCsvLine(line).map((value, index) => [headers[index], value])));
}
const csvRows = parseCsv(csv);
const csvByTransaction = new Map(csvRows.map(row => [text(row.TRANSACTION_NUMBER).toLowerCase(), row]));
const dldByRef = new Map(dld.map(row => [upper(row.propertyRef), row]));
const cleaned = cleanDldRecords(JSON.parse(JSON.stringify(dld)));
const filtered = applyAllFilters(JSON.parse(JSON.stringify(cleaned.eligibleRecords)));
const comparableGroups = buildComparableGroups(filtered);
const accuracyByTargetDistrict = accuracy.filter(row => upper(row.district) === targetDistrict);
const targetDld = dld.filter(row => upper(row.district) === targetDistrict);
const priority = accuracy.find(row => upper(row.propertyRef) === priorityRef);

function reconstructedPeerCounts(row) {
  return Object.fromEntries(['project_size', 'project', 'district_size', 'district'].map(level => {
    const key = comparableKey(row, level);
    const peers = key && comparableGroups[level]?.[key] ? comparableGroups[level][key].filter(peer => peer.propertyRef !== row.propertyRef) : [];
    return [level, peers.length];
  }));
}
function compact(row) {
  const dldRow = dldByRef.get(upper(row.propertyRef));
  const raw = csvByTransaction.get(text(row.transactionNumber).toLowerCase());
  return { propertyRef: row.propertyRef, transactionNumber: row.transactionNumber, date: date(row), propertyType: row.propertyType, evalLevel: row.evalLevel, evalCount: row.evalCount, district: row.district, project: row.project || null, area: number(row.area), procedureArea: number(row.procedureArea), areaRatio: round(areaRatio(row), 4), actualSalePrice: number(row.actualSalePrice), aqarValuation: number(row.aqarValuation), actualPpsm: round(ppsm(row), 2), predictedPpsm: round(predictedPpsm(row), 2), absErrorPct: round(absoluteError(row)), signedErrorPct: round(signedError(row)), accuracySource: { dataSource: row.dataSource, evidenceStatus: row.evidenceStatus, verifiedBy: row.verifiedBy, sourceTransactionId: row.sourceTransactionId }, dldMatch: dldRow ? { propertyRef: dldRow.propertyRef, transactionNumber: dldRow.transactionNumber, actualSalePrice: number(dldRow.actualSalePrice), area: number(dldRow.area), procedureArea: number(dldRow.procedureArea), dataSource: dldRow.dataSource, evidenceStatus: dldRow.evidenceStatus } : null, rawCsv: raw ? { transactionNumber: raw.TRANSACTION_NUMBER, instanceDate: raw.INSTANCE_DATE, group: raw.GROUP_EN, procedure: raw.PROCEDURE_EN, status: raw.IS_OFFPLAN_EN, usage: raw.USAGE_EN, district: raw.AREA_EN, propType: raw.PROP_TYPE_EN, propSubType: raw.PROP_SB_TYPE_EN, transactionValue: number(raw.TRANS_VALUE), procedureArea: number(raw.PROCEDURE_AREA), actualArea: number(raw.ACTUAL_AREA), rooms: raw.ROOMS_EN, project: raw.PROJECT_EN } : null, comparableDiagnostics: row.comparableDiagnostics || null, reconstructedPeerCounts: reconstructedPeerCounts(row) };
}
function dldTypeSummary(rows) { return Object.fromEntries([...groupRows(rows, row => text(row.propertyType)).entries()].map(([key, values]) => [key, { records: values.length, medianPpsm: round(median(values.map(ppsm)), 2), p25Ppsm: round(quantile(values.map(ppsm), 0.25), 2), p75Ppsm: round(quantile(values.map(ppsm), 0.75), 2), minPpsm: round(Math.min(...values.map(ppsm)), 2), maxPpsm: round(Math.max(...values.map(ppsm)), 2) }])); }
function areaBucket(rows, label, predicate) { const values = rows.filter(predicate); return { label, ...summary(values), areaRatios: { min: round(Math.min(...values.map(areaRatio)), 4), p25: round(quantile(values.map(areaRatio), 0.25), 4), median: round(median(values.map(areaRatio)), 4), p75: round(quantile(values.map(areaRatio), 0.75), 4), max: round(Math.max(...values.map(areaRatio)), 4) } }; }
const boundaryRows = accuracyByTargetDistrict.filter(row => areaRatio(row) !== null);
const severityRows = accuracy.filter(row => (absoluteError(row) ?? -1) > severeThreshold);
const mismatches = [];
for (const row of accuracy) {
  const source = dldByRef.get(upper(row.propertyRef));
  if (!source) { mismatches.push({ propertyRef: row.propertyRef, reason: 'missing-dld' }); continue; }
  for (const field of ['actualSalePrice', 'area', 'procedureArea']) if (number(row[field]) !== number(source[field])) mismatches.push({ propertyRef: row.propertyRef, field, accuracy: row[field], dld: source[field] });
  for (const field of ['propertyType', 'district']) if (upper(row[field]) !== upper(source[field])) mismatches.push({ propertyRef: row.propertyRef, field, accuracy: row[field], dld: source[field] });
}
const result = { schemaVersion: 1, generatedAt: new Date().toISOString(), generatedBy: 'scripts/analyze-detailed-outliers.js', readOnly: true, scope: ['priorityRef', targetDistrict], thresholds: { severeAbsoluteErrorPct: severeThreshold, nearBoundaryAreaRatio: nearBoundaryThreshold, cleaningMaximumAreaRatio: 2 }, source: { accuracyPath: 'data/accuracy-data.json', dldPath: 'data/dld-transactions.json', csvPath: 'data/dld-transactions.csv', accuracySha256: hash(accuracyPath), dldSha256: hash(dldPath), csvSha256: hash(csvPath), accuracyScope: accuracyPayload.metadata?.accuracyScope || null }, pipelineReconstruction: { rawDldRecords: dld.length, cleanedRecords: cleaned.cleanedRecords.length, eligibleRecords: cleaned.eligibleRecords.length, filteredComparableRecords: filtered.length, cleaningSummary: cleaned.summary }, overallCoreFieldMismatches: mismatches, priorityRecord: priority ? { accuracy: compact(priority), reconstructedPeers: [...(comparableGroups.district_size?.[comparableKey(priority, 'district_size')] || [])].filter(peer => peer.propertyRef !== priority.propertyRef).map(peer => ({ propertyRef: peer.propertyRef, date: date(peer), actualSalePrice: number(peer.actualSalePrice), area: number(peer.area), pricePerSqm: round(ppsm(peer), 2), project: peer.project || null, propertyType: peer.propertyType, district: peer.district })).sort((a, b) => a.pricePerSqm - b.pricePerSqm) } : null, internationalCity: { dldRecords: targetDld.length, dldByType: dldTypeSummary(targetDld), accuracySummary: summary(accuracyByTargetDistrict), accuracyByType: Object.fromEntries([...groupRows(accuracyByTargetDistrict, row => text(row.propertyType)).entries()].map(([key, values]) => [key, { all: summary(values), severeCount: values.filter(row => (absoluteError(row) ?? -1) > severeThreshold).length }])), accuracyByEvalLevel: Object.fromEntries([...groupRows(accuracyByTargetDistrict, row => text(row.evalLevel)).entries()].map(([key, values]) => [key, { all: summary(values), severeCount: values.filter(row => (absoluteError(row) ?? -1) > severeThreshold).length }])), areaBoundaryBuckets: [areaBucket(boundaryRows, 'ratio-near-cleaning-boundary', row => areaRatio(row) >= nearBoundaryThreshold), areaBucket(boundaryRows, 'ratio-below-boundary', row => areaRatio(row) < 1.5)], severeRecords: severityRows.filter(row => upper(row.district) === targetDistrict).sort((a, b) => absoluteError(b) - absoluteError(a)).map(compact) }, safeguards: { officialAccuracyChanged: false, officialDldChanged: false, evaluatorChanged: false, calibrationChanged: false, recordsExcludedOrCapped: false, recommendationsAreNonOperational: true } };
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ output: outputPath, source: result.source, pipelineReconstruction: result.pipelineReconstruction, overallCoreFieldMismatches: mismatches.length, priorityRef: priority ? { propertyRef: priority.propertyRef, area: priority.area, procedureArea: priority.procedureArea, actualPpsm: round(ppsm(priority), 2), predictedPpsm: round(predictedPpsm(priority), 2), absErrorPct: round(absoluteError(priority)), comparableCounts: priority.comparableDiagnostics?.comparableCounts || null } : null, internationalCity: { dldRecords: targetDld.length, accuracyRecords: accuracyByTargetDistrict.length, severeRecords: accuracyByTargetDistrict.filter(row => (absoluteError(row) ?? -1) > severeThreshold).length, areaBoundaryBuckets: result.internationalCity.areaBoundaryBuckets.map(bucket => ({ label: bucket.label, records: bucket.records, maePct: bucket.maePct, severeOver100: bucket.severeOver100, ratioMedian: bucket.areaRatios.median })), byType: result.internationalCity.accuracyByType, byEvalLevel: result.internationalCity.accuracyByEvalLevel }, safeguards: result.safeguards }, null, 2));
