#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { findUnverifiedRecords } = require('../shared/dld-provenance');

const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');
const failures = [];
const readJson = name => {
  const file = path.join(dataDir, name);
  try { return { file, value: JSON.parse(fs.readFileSync(file, 'utf8')) }; }
  catch (error) { failures.push(`${name}: missing or invalid JSON (${error.message})`); return { file, value: null }; }
};
const positive = value => Number.isFinite(Number(value)) && Number(value) > 0;
const text = value => String(value ?? '').trim();
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const { file: dldFile, value: dld } = readJson('dld-transactions.json');
const { file: accuracyFile, value: accuracy } = readJson('accuracy-data.json');
const { file: diagnosticsFile, value: diagnostics } = readJson('accuracy-diagnostics.json');
const { file: accuracySummaryFile, value: accuracySummary } = readJson('accuracy-summary.json');
const { file: districtSummaryFile, value: districtSummary } = readJson('district-list.json');
const { file: projectSummaryFile, value: projectSummary } = readJson('project-building-summary.json');

if (Array.isArray(dld)) {
  if (!dld.length) failures.push('dld-transactions.json: empty dataset');
  const unverified = findUnverifiedRecords(dld);
  if (unverified.length) failures.push(`dld-transactions.json: ${unverified.length} unverified records`);
  const rejected = dld.filter(record => record.evidenceStatus && record.evidenceStatus !== 'eligible');
  if (rejected.length) failures.push(`dld-transactions.json: ${rejected.length} rejected records in eligible artifact`);
}

const accuracyRecords = Array.isArray(accuracy?.records) ? accuracy.records : null;
if (!accuracy?.metadata || accuracy.metadata.accuracyScope !== 'verified-dld-only') failures.push('accuracy-data.json: missing verified-dld-only metadata');
if (!accuracyRecords || !accuracyRecords.length) failures.push('accuracy-data.json: records are missing or empty');
if (accuracyRecords) {
  if (accuracy.metadata.totalRecords !== accuracyRecords.length) failures.push('accuracy-data.json: metadata.totalRecords does not match records length');
  if (accuracy.metrics?.totalRecords !== accuracyRecords.length) failures.push('accuracy-data.json: metrics.totalRecords does not match records length');
  const dldByRef = new Map((Array.isArray(dld) ? dld : []).map(record => [text(record.propertyRef), record]));
  const seen = new Set();
  for (const record of accuracyRecords) {
    if (!positive(record.actualSalePrice)) failures.push(`accuracy-data.json: non-positive actualSalePrice for ${text(record.propertyRef)}`);
    if (!positive(record.aqarValuation)) failures.push(`accuracy-data.json: non-positive aqarValuation for ${text(record.propertyRef)}`);
    if (text(record.dataSource) !== 'dld-real-cleaned') failures.push(`accuracy-data.json: non-cleaned dataSource for ${text(record.propertyRef)}`);
    if (record.evidenceStatus !== 'eligible') failures.push(`accuracy-data.json: non-eligible evidenceStatus for ${text(record.propertyRef)}`);
    if (text(record.verifiedBy) !== 'Government Record') failures.push(`accuracy-data.json: invalid verifiedBy for ${text(record.propertyRef)}`);
    if (!text(record.propertyRef) || seen.has(text(record.propertyRef))) failures.push(`accuracy-data.json: missing or duplicate propertyRef ${text(record.propertyRef)}`);
    seen.add(text(record.propertyRef));
    const source = dldByRef.get(text(record.propertyRef));
    if (!source) failures.push(`accuracy-data.json: propertyRef not found in DLD ${text(record.propertyRef)}`);
    else {
      for (const field of ['actualSalePrice', 'area', 'procedureArea']) {
        if (Number(source[field]) !== Number(record[field])) failures.push(`accuracy-data.json: ${field} mismatch for ${text(record.propertyRef)}`);
      }
      if (text(source.propertyType) !== text(record.propertyType)) failures.push(`accuracy-data.json: propertyType mismatch for ${text(record.propertyRef)}`);
      if (text(source.district) !== text(record.district)) failures.push(`accuracy-data.json: district mismatch for ${text(record.propertyRef)}`);
    }
  }
}

if (diagnostics) {
  if (diagnostics.schemaVersion !== 2) failures.push('accuracy-diagnostics.json: unexpected schemaVersion');
  if (diagnostics.source?.accuracyDataSha256 !== hash(accuracyFile)) failures.push('accuracy-diagnostics.json: source hash does not match accuracy-data.json');
  if (diagnostics.counts?.recordsInArtifact !== accuracyRecords?.length) failures.push('accuracy-diagnostics.json: record count does not match Accuracy');
  if (diagnostics.quality?.recordsWithoutOfficialProvenance !== 0) failures.push('accuracy-diagnostics.json: provenance failures present');
  if (diagnostics.quality?.recordsWithoutComparableDiagnostics !== 0) failures.push('accuracy-diagnostics.json: comparable diagnostics failures present');
  if (diagnostics.checks?.errorBucketTotalMatchesScoredRecords !== true) failures.push('accuracy-diagnostics.json: error buckets do not reconcile');
}

if (accuracySummary && accuracyRecords) {
  if (accuracySummary.metrics?.totalRecords !== accuracyRecords.length) failures.push('accuracy-summary.json: totalRecords does not match Accuracy');
  if (accuracySummary.metadata?.totalRecords !== accuracyRecords.length) failures.push('accuracy-summary.json: metadata.totalRecords does not match Accuracy');
}
if (!districtSummary || districtSummary.source !== 'dld-transactions.json' || !Array.isArray(districtSummary.districts)) failures.push('district-list.json: invalid summary contract');
if (!projectSummary || projectSummary.source !== 'dld-transactions.json' || !Array.isArray(projectSummary.entries)) failures.push('project-building-summary.json: invalid summary contract');

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    ok: true,
    dldRecords: dld.length,
    accuracyRecords: accuracyRecords.length,
    accuracySha256: hash(accuracyFile),
    dldSha256: hash(dldFile),
    diagnosticsSha256: hash(diagnosticsFile),
    summaries: [accuracySummaryFile, districtSummaryFile, projectSummaryFile].map(file => path.relative(root, file))
  }, null, 2));
}
