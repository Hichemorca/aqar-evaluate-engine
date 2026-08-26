#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dld = JSON.parse(fs.readFileSync(path.join(root, 'data/dld-transactions.json'), 'utf8'));
const accuracyPayload = JSON.parse(fs.readFileSync(path.join(root, 'data/accuracy-data.json'), 'utf8'));
const accuracy = Array.isArray(accuracyPayload) ? accuracyPayload : (accuracyPayload.records || accuracyPayload.data || []);
const residentialTypes = ['apartment', 'villa', 'townhouse'];
const MIN_PROJECT_TRANSACTIONS = 5;
const SHRINKAGE_PRIOR_TRANSACTIONS = 20;
const CANDIDATE_MIN = 0.95;
const CANDIDATE_MAX = 1.05;
const HOLDOUT_TRAIN_FRACTION = 0.8;

const present = value => value !== undefined && value !== null && String(value).trim() !== '';
const finitePositive = value => Number.isFinite(Number(value)) && Number(value) > 0;
const projectName = row => [row.masterProject, row.project].find(present)?.toString().trim() || '';
const normalize = value => String(value || '').trim().toLowerCase();
const pricePerSqm = row => {
  if (finitePositive(row.pricePerSqm)) return Number(row.pricePerSqm);
  if (finitePositive(row.actualSalePrice) && finitePositive(row.area)) return Number(row.actualSalePrice) / Number(row.area);
  if (finitePositive(row.actualSalePrice) && finitePositive(row.procedureArea)) return Number(row.actualSalePrice) / Number(row.procedureArea);
  return null;
};
const median = values => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const quantile = (values, fraction) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round = (value, decimals = 4) => Number.isFinite(value) ? Number(value.toFixed(decimals)) : null;
const cohortKey = row => `${normalize(row.propertyType)}||${normalize(row.district)}||${normalize(projectName(row))}`;
const districtKey = row => `${normalize(row.propertyType)}||${normalize(row.district)}`;

function buildProjectCandidates(rows) {
  const valid = rows.filter(row => residentialTypes.includes(row.propertyType) && present(row.district) && present(projectName(row)) && finitePositive(pricePerSqm(row)));
  const districtRows = new Map();
  for (const row of valid) {
    const key = districtKey(row);
    if (!districtRows.has(key)) districtRows.set(key, []);
    districtRows.get(key).push(row);
  }
  const projects = new Map();
  for (const row of valid) {
    const key = cohortKey(row);
    if (!projects.has(key)) projects.set(key, { propertyType: row.propertyType, district: row.district, project: projectName(row), rows: [], ppsm: [] });
    projects.get(key).rows.push(row);
    projects.get(key).ppsm.push(pricePerSqm(row));
  }
  const candidates = [];
  for (const cohort of projects.values()) {
    if (cohort.ppsm.length < MIN_PROJECT_TRANSACTIONS) continue;
    const comparisonRows = (districtRows.get(districtKey(cohort)) || []).filter(row => cohortKey(row) !== cohortKey(cohort));
    const benchmarkValues = comparisonRows.map(pricePerSqm).filter(Number.isFinite);
    const benchmarkMedian = median(benchmarkValues);
    const projectMedian = median(cohort.ppsm);
    if (!(benchmarkMedian > 0) || !(projectMedian > 0)) continue;
    const relativeIndex = projectMedian / benchmarkMedian;
    const shrinkage = cohort.ppsm.length / (cohort.ppsm.length + SHRINKAGE_PRIOR_TRANSACTIONS);
    const candidateMultiplier = clamp(1 + (relativeIndex - 1) * shrinkage, CANDIDATE_MIN, CANDIDATE_MAX);
    const p25 = quantile(cohort.ppsm, 0.25);
    const p75 = quantile(cohort.ppsm, 0.75);
    const dispersionRatio = p25 > 0 ? p75 / p25 : null;
    candidates.push({
      propertyType: cohort.propertyType,
      district: cohort.district,
      project: cohort.project,
      transactions: cohort.ppsm.length,
      projectMedianPricePerSqm: round(projectMedian, 2),
      districtMedianExcludingProjectPricePerSqm: round(benchmarkMedian, 2),
      relativePriceIndex: round(relativeIndex),
      p25PricePerSqm: round(p25, 2),
      p75PricePerSqm: round(p75, 2),
      dispersionRatio: round(dispersionRatio),
      highDispersionFlag: Number.isFinite(dispersionRatio) && dispersionRatio > 2,
      shrinkage: round(shrinkage),
      candidateMultiplier: round(candidateMultiplier),
      candidateStatus: Math.abs(candidateMultiplier - 1) < 0.005 ? 'neutral-candidate' : candidateMultiplier > 1 ? 'positive-candidate' : 'negative-candidate'
    });
  }
  return candidates.sort((a, b) => b.relativePriceIndex - a.relativePriceIndex);
}

function groupSummary(candidates, rows) {
  return Object.fromEntries(residentialTypes.map(type => {
    const typeCandidates = candidates.filter(candidate => candidate.propertyType === type);
    const typeRows = rows.filter(row => row.propertyType === type && present(projectName(row)) && finitePositive(pricePerSqm(row)));
    return [type, {
      eligibleDldRowsWithProjectAndPrice: typeRows.length,
      cohortsAtLeast5: typeCandidates.length,
      positiveCandidates: typeCandidates.filter(c => c.candidateStatus === 'positive-candidate').length,
      negativeCandidates: typeCandidates.filter(c => c.candidateStatus === 'negative-candidate').length,
      neutralCandidates: typeCandidates.filter(c => c.candidateStatus === 'neutral-candidate').length,
      highDispersionCandidates: typeCandidates.filter(c => c.highDispersionFlag).length,
      topPremiums: typeCandidates.slice(0, 15),
      topDiscounts: [...typeCandidates].sort((a, b) => a.relativePriceIndex - b.relativePriceIndex).slice(0, 15)
    }];
  }));
}

function chooseHoldoutCutoff(rows) {
  const dates = rows.map(row => new Date(row.saleDate || row.instanceDate).getTime()).filter(Number.isFinite).sort((a, b) => a - b);
  if (!dates.length) return null;
  return new Date(dates[Math.min(dates.length - 1, Math.floor((dates.length - 1) * HOLDOUT_TRAIN_FRACTION))]).toISOString().slice(0, 10);
}

function errorMetrics(rows, predictionField) {
  const valid = rows.filter(row => finitePositive(row.actualSalePrice) && finitePositive(row[predictionField]));
  if (!valid.length) return { records: 0, maePct: null, biasPct: null, p90AbsPct: null, within15Pct: null };
  const errors = valid.map(row => (Number(row[predictionField]) - Number(row.actualSalePrice)) / Number(row.actualSalePrice) * 100);
  const absolute = errors.map(value => Math.abs(value));
  return {
    records: valid.length,
    maePct: round(absolute.reduce((sum, value) => sum + value, 0) / absolute.length, 3),
    biasPct: round(errors.reduce((sum, value) => sum + value, 0) / errors.length, 3),
    p90AbsPct: round(quantile(absolute, 0.9), 3),
    within15Pct: round(absolute.filter(value => value <= 15).length / absolute.length * 100, 3)
  };
}

function runHoldoutShadow() {
  const eligibleAccuracy = accuracy.filter(row => residentialTypes.includes(row.propertyType) && present(row.district) && present(projectName(row)) && finitePositive(row.actualSalePrice) && finitePositive(row.aqarValuation));
  const cutoff = chooseHoldoutCutoff(eligibleAccuracy);
  if (!cutoff) return { cutoff, trainRecords: 0, testRecords: 0, byType: {}, aggregate: {} };
  const trainAccuracy = eligibleAccuracy.filter(row => String(row.saleDate || row.instanceDate || '').slice(0, 10) < cutoff);
  const testAccuracy = eligibleAccuracy.filter(row => String(row.saleDate || row.instanceDate || '').slice(0, 10) >= cutoff);
  const trainingDld = dld.filter(row => String(row.saleDate || row.instanceDate || '').slice(0, 10) < cutoff);
  const candidates = buildProjectCandidates(trainingDld);
  const map = new Map(candidates.map(candidate => [cohortKey(candidate), candidate]));
  const scored = testAccuracy.map(row => {
    const candidate = map.get(cohortKey(row));
    const baseline = Number(row.aqarValuation);
    const shadow = candidate ? baseline * candidate.candidateMultiplier : baseline;
    return { ...row, baselinePrediction: baseline, shadowPrediction: shadow, projectMultiplier: candidate?.candidateMultiplier || 1, matchedProjectCandidate: Boolean(candidate) };
  });
  const byType = Object.fromEntries(residentialTypes.map(type => {
    const rows = scored.filter(row => row.propertyType === type);
    const matched = rows.filter(row => row.matchedProjectCandidate);
    return [type, {
      testRecords: rows.length,
      matchedProjectCohortRecords: matched.length,
      coveragePct: rows.length ? round(matched.length / rows.length * 100, 3) : 0,
      fallbackUnchangedRecords: rows.length - matched.length,
      baseline: errorMetrics(rows, 'baselinePrediction'),
      shadow: errorMetrics(rows, 'shadowPrediction'),
      matchedOnlyBaseline: errorMetrics(matched, 'baselinePrediction'),
      matchedOnlyShadow: errorMetrics(matched, 'shadowPrediction')
    }];
  }));
  return {
    cutoff,
    trainRecords: trainAccuracy.length,
    testRecords: testAccuracy.length,
    candidateCohorts: candidates.length,
    byType,
    aggregate: {
      testRecords: scored.length,
      matchedProjectCohortRecords: scored.filter(row => row.matchedProjectCandidate).length,
      coveragePct: scored.length ? round(scored.filter(row => row.matchedProjectCandidate).length / scored.length * 100, 3) : 0,
      baseline: errorMetrics(scored, 'baselinePrediction'),
      shadow: errorMetrics(scored, 'shadowPrediction'),
      matchedOnlyBaseline: errorMetrics(scored.filter(row => row.matchedProjectCandidate), 'baselinePrediction'),
      matchedOnlyShadow: errorMetrics(scored.filter(row => row.matchedProjectCandidate), 'shadowPrediction')
    },
    methodologyNote: 'Temporal shadow split. Candidates are trained only on pre-cutoff DLD transactions and applied to post-cutoff verified Accuracy records. This is diagnostic, not a production change.'
  };
}

const allCandidates = buildProjectCandidates(dld);
const report = {
  generatedAt: new Date().toISOString(),
  scope: 'isolated-v2.1-project-multiplier-comparison',
  dldRecords: dld.length,
  accuracyRecords: accuracy.length,
  accuracyRecordsWithResidentialProject: accuracy.filter(row => residentialTypes.includes(row.propertyType) && present(projectName(row))).length,
  methodology: {
    priceMeasure: 'actualSalePrice / area (or procedureArea fallback), using median price per sqm',
    benchmark: 'median price per sqm for the same property type and DLD district, excluding the project cohort itself',
    minimumProjectTransactions: MIN_PROJECT_TRANSACTIONS,
    shrinkagePriorTransactions: SHRINKAGE_PRIOR_TRANSACTIONS,
    candidateMultiplier: 'clamp(1 + (projectMedian / districtMedianExcludingProject - 1) × n/(n+20), 0.95, 1.05)',
    highDispersionFlag: 'p75 / p25 > 2',
    status: 'candidate only; not approved and not applied to production or official Accuracy'
  },
  projectComparison: groupSummary(allCandidates, dld),
  holdoutShadow: runHoldoutShadow(),
  notes: [
    'Project labels are taken only from DLD masterProject/project fields.',
    'A district-relative project index is descriptive and not a causal estimate; price mix, dates, unit quality, and size composition can confound it.',
    'The shadow test applies the candidate multiplier to the existing official aqarValuation only for measurement. It does not rewrite accuracy-data.json.',
    'BUA, Plot Area, and Last Renovation Year remain unavailable in current DLD and Accuracy records; no synthetic values are used.'
  ]
};

const output = process.argv[2] || path.join(root, 'docs/v2.1-project-multiplier-analysis.json');
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, holdoutShadow: report.holdoutShadow, byType: Object.fromEntries(Object.entries(report.projectComparison).map(([type, value]) => [type, { rows: value.eligibleDldRowsWithProjectAndPrice, cohortsAtLeast5: value.cohortsAtLeast5, positiveCandidates: value.positiveCandidates, negativeCandidates: value.negativeCandidates, neutralCandidates: value.neutralCandidates, topPremium: value.topPremiums[0] || null, topDiscount: value.topDiscounts[0] || null }])) }, null, 2));
