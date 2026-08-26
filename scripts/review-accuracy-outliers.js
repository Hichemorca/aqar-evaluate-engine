#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const outputPath = process.argv[2] || path.join(root, 'docs', 'accuracy-outlier-review-2026-08-26.json');
const accuracyPath = path.join(root, 'data', 'accuracy-data.json');
const dldPath = path.join(root, 'data', 'dld-transactions.json');
const accuracyPayload = JSON.parse(fs.readFileSync(accuracyPath, 'utf8'));
const dldPayload = JSON.parse(fs.readFileSync(dldPath, 'utf8'));
const accuracy = Array.isArray(accuracyPayload) ? accuracyPayload : (accuracyPayload.records || accuracyPayload.data || []);
const dld = Array.isArray(dldPayload) ? dldPayload : (dldPayload.records || dldPayload.data || []);
const SEVERE_ERROR_PCT = 100;
const REVIEW_RATIO = 20;
const REVIEW_AREA_SQM = 10000;

const text = value => String(value ?? '').trim();
const upper = value => text(value).replace(/\s+/g, ' ').toUpperCase();
const number = value => Number.isFinite(Number(value)) ? Number(value) : null;
const positive = value => Number.isFinite(Number(value)) && Number(value) > 0;
const date = row => {
  const parsed = new Date(row.saleDate || row.instanceDate || row.transactionDate);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
};
const sourceId = row => {
  const value = text(row.sourceTransactionId || row.transactionNumber || row.id);
  if (!value) return null;
  return value.toLowerCase().startsWith('dld:') ? value.toLowerCase() : `dld:${value.toLowerCase()}`;
};
const propertyRef = row => text(row.propertyRef).toLowerCase() || null;
const recordId = row => propertyRef(row) || sourceId(row) || text(row.transactionNumber).toLowerCase() || null;
const errorPct = row => positive(row.actualSalePrice) && positive(row.aqarValuation)
  ? (number(row.aqarValuation) - number(row.actualSalePrice)) / number(row.actualSalePrice) * 100 : null;
const absErrorPct = row => { const value = errorPct(row); return value === null ? null : Math.abs(value); };
const round = (value, digits = 3) => Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const equalNumber = (a, b) => number(a) !== null && number(b) !== null && Math.abs(number(a) - number(b)) <= 1e-9;
const equalText = (a, b) => upper(a) === upper(b);
const equalDate = (a, b) => date(a) !== null && date(b) !== null && date(a) === date(b);

function indexBy(records, keyFn) {
  const index = new Map();
  for (const record of records) {
    const key = keyFn(record);
    if (key && !index.has(key)) index.set(key, record);
  }
  return index;
}

const dldByPropertyRef = indexBy(dld, propertyRef);
const dldBySourceId = indexBy(dld, sourceId);
const dldByTransactionNumber = indexBy(dld, row => text(row.transactionNumber).toLowerCase() || null);

function findDldMatch(row) {
  const candidates = [
    ['propertyRef', dldByPropertyRef.get(propertyRef(row))],
    ['sourceTransactionId', dldBySourceId.get(sourceId(row))],
    ['transactionNumber', dldByTransactionNumber.get(text(row.transactionNumber).toLowerCase() || null)]
  ];
  const found = candidates.find(([, value]) => value);
  return found ? { matchType: found[0], record: found[1] } : { matchType: null, record: null };
}

function compareFields(accuracyRow, dldRow) {
  if (!dldRow) return { flags: ['missing-dld-match'], exactCoreMatch: false };
  const flags = [];
  const checks = {
    propertyRef: propertyRef(accuracyRow) === propertyRef(dldRow),
    sourceTransactionId: sourceId(accuracyRow) === sourceId(dldRow),
    transactionNumber: text(accuracyRow.transactionNumber) === text(dldRow.transactionNumber),
    saleDate: equalDate(accuracyRow, dldRow),
    propertyType: equalText(accuracyRow.propertyType, dldRow.propertyType),
    district: equalText(accuracyRow.district, dldRow.district),
    area: equalNumber(accuracyRow.area, dldRow.area),
    procedureArea: equalNumber(accuracyRow.procedureArea, dldRow.procedureArea),
    actualSalePrice: equalNumber(accuracyRow.actualSalePrice, dldRow.actualSalePrice)
  };
  for (const [field, matches] of Object.entries(checks)) if (!matches) flags.push(`dld-field-mismatch:${field}`);
  const exactCoreMatch = ['saleDate', 'propertyType', 'district', 'area', 'actualSalePrice'].every(field => checks[field]);
  if (text(dldRow.dataSource) !== 'dld-real') flags.push('dld-data-source-not-dld-real');
  if (text(dldRow.scrapedFrom) !== 'Dubai Land Department') flags.push('dld-scraped-source-mismatch');
  if (text(dldRow.verifiedBy) !== 'Government Record') flags.push('dld-verification-mismatch');
  if (dldRow.evidenceStatus && dldRow.evidenceStatus !== 'eligible') flags.push(`dld-evidence-status:${dldRow.evidenceStatus}`);
  return { flags, exactCoreMatch, checks };
}

function classify(row, dldRow, comparison) {
  const dataIntegrityFlags = [...comparison.flags];
  const performanceFlags = [];
  const actual = number(row.actualSalePrice);
  const valuation = number(row.aqarValuation);
  const area = number(row.area);
  if (area !== null && area > REVIEW_AREA_SQM) dataIntegrityFlags.push('review-area-over-10000sqm');
  if (actual !== null && valuation !== null && valuation / actual > REVIEW_RATIO) dataIntegrityFlags.push('review-valuation-to-actual-over-20x');
  if (actual !== null && valuation !== null && actual / valuation > REVIEW_RATIO) dataIntegrityFlags.push('review-actual-to-valuation-over-20x');
  if (!comparison.exactCoreMatch) dataIntegrityFlags.push('core-source-fields-require-review');
  if (comparison.exactCoreMatch && !dataIntegrityFlags.some(flag => flag.startsWith('dld-'))) performanceFlags.push('source-fields-match-review-as-performance-case');
  if (text(row.evalLevel) === 'district_size' || text(row.evalLevel) === 'district') performanceFlags.push('district-level-evaluation');
  if (row.comparableDiagnostics?.selectedLevel && row.comparableDiagnostics.selectedLevel !== row.evalLevel) performanceFlags.push('diagnostic-level-differs-from-persisted-level');
  if (Array.isArray(row.comparableDiagnostics?.flags)) performanceFlags.push(...row.comparableDiagnostics.flags.map(flag => `comparable:${flag}`));
  return { dataIntegrityFlags: [...new Set(dataIntegrityFlags)], performanceFlags: [...new Set(performanceFlags)] };
}

const severe = accuracy.filter(row => (absErrorPct(row) ?? -1) > SEVERE_ERROR_PCT).sort((a, b) => absErrorPct(b) - absErrorPct(a));
const reviewed = severe.map(row => {
  const match = findDldMatch(row);
  const comparison = compareFields(row, match.record);
  const classification = classify(row, match.record, comparison);
  return {
    id: recordId(row), matchType: match.matchType, dldMatched: Boolean(match.record),
    date: date(row), propertyType: row.propertyType ?? null, evalLevel: row.evalLevel ?? null,
    district: row.district ?? null, project: row.project ?? null,
    actualSalePrice: number(row.actualSalePrice), aqarValuation: number(row.aqarValuation),
    absoluteErrorPct: round(absErrorPct(row)), signedErrorPct: round(errorPct(row)),
    area: number(row.area), procedureArea: number(row.procedureArea),
    accuracySource: { dataSource: row.dataSource ?? null, evidenceStatus: row.evidenceStatus ?? null, verifiedBy: row.verifiedBy ?? null, sourceTransactionId: row.sourceTransactionId ?? null },
    dldSource: match.record ? { propertyRef: match.record.propertyRef ?? null, transactionNumber: match.record.transactionNumber ?? null, dataSource: match.record.dataSource ?? null, evidenceStatus: match.record.evidenceStatus ?? null, verifiedBy: match.record.verifiedBy ?? null, sourceTransactionId: match.record.sourceTransactionId ?? null, actualSalePrice: number(match.record.actualSalePrice), area: number(match.record.area), procedureArea: number(match.record.procedureArea), saleDate: date(match.record), propertyType: match.record.propertyType ?? null, district: match.record.district ?? null } : null,
    fieldChecks: comparison.checks || null,
    comparableDiagnostics: row.comparableDiagnostics || null,
    ...classification,
    disposition: classification.dataIntegrityFlags.length ? 'data-integrity-or-label-review-first' : 'performance-review-after-source-match'
  };
});

const counts = {
  severeErrorRecords: reviewed.length,
  matchedByAnyOfficialKey: reviewed.filter(row => row.dldMatched).length,
  exactCoreSourceMatches: reviewed.filter(row => row.fieldChecks && ['saleDate', 'propertyType', 'district', 'area', 'actualSalePrice'].every(field => row.fieldChecks[field])).length,
  recordsWithDataIntegrityFlags: reviewed.filter(row => row.dataIntegrityFlags.length).length,
  recordsWithPerformanceFlags: reviewed.filter(row => row.performanceFlags.length).length,
  recordsWithDldFieldMismatch: reviewed.filter(row => row.dataIntegrityFlags.some(flag => flag.startsWith('dld-field-mismatch'))).length,
  districtLevelRecords: reviewed.filter(row => row.performanceFlags.includes('district-level-evaluation')).length
};
const flagCounts = values => values.reduce((counts, value) => { for (const flag of value) counts[flag] = (counts[flag] || 0) + 1; return counts; }, {});
const groupCounts = (records, keyFn) => {
  const counts = {};
  for (const record of records) {
    const key = keyFn(record) || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]));
};
const result = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  generatedBy: 'scripts/review-accuracy-outliers.js',
  readOnly: true,
  scope: 'severe-accuracy-outliers-over-100pct',
  thresholds: { severeAbsoluteErrorPct: SEVERE_ERROR_PCT, reviewRatio: REVIEW_RATIO, reviewAreaSqm: REVIEW_AREA_SQM },
  source: { accuracyPath: 'data/accuracy-data.json', dldPath: 'data/dld-transactions.json', accuracySha256: hash(accuracyPath), dldSha256: hash(dldPath), accuracyScope: accuracyPayload.metadata?.accuracyScope || null },
  counts: { accuracyRecords: accuracy.length, dldRecords: dld.length, ...counts },
  flagCounts: { dataIntegrity: flagCounts(reviewed.map(row => row.dataIntegrityFlags)), performance: flagCounts(reviewed.map(row => row.performanceFlags)) },
  severeSlices: {
    byPropertyType: groupCounts(reviewed, row => text(row.propertyType)),
    byEvalLevel: groupCounts(reviewed, row => text(row.evalLevel)),
    byDistrict: groupCounts(reviewed, row => text(row.district))
  },
  records: reviewed,
  safeguards: { officialAccuracyChanged: false, officialDldChanged: false, evaluatorChanged: false, calibrationChanged: false, recordsExcludedOrCapped: false, recommendationsAreNonOperational: true }
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ output: outputPath, counts: result.counts, flagCounts: result.flagCounts, safeguards: result.safeguards }, null, 2));
