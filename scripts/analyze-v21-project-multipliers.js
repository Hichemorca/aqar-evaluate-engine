#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dld = JSON.parse(fs.readFileSync(path.join(root, 'data/dld-transactions.json'), 'utf8'));
const accuracyPayload = JSON.parse(fs.readFileSync(path.join(root, 'data/accuracy-data.json'), 'utf8'));
const accuracy = Array.isArray(accuracyPayload) ? accuracyPayload : (accuracyPayload.records || accuracyPayload.data || []);
const residentialTypes = ['apartment', 'villa', 'townhouse'];
const CUTOFF = '2026-07-09';
const CANDIDATE_MIN = 0.95;
const CANDIDATE_MAX = 1.05;

const present = value => value !== undefined && value !== null && String(value).trim() !== '';
const positive = value => Number.isFinite(Number(value)) && Number(value) > 0;
const text = value => String(value || '').trim();
const norm = value => text(value).toLowerCase();
const projectName = row => [row.masterProject, row.project].find(present)?.toString().trim() || '';
const pricePerSqm = row => {
  if (positive(row.pricePerSqm)) return Number(row.pricePerSqm);
  if (positive(row.actualSalePrice) && positive(row.area)) return Number(row.actualSalePrice) / Number(row.area);
  if (positive(row.actualSalePrice) && positive(row.procedureArea)) return Number(row.actualSalePrice) / Number(row.procedureArea);
  return null;
};
const dateValue = row => new Date(row.saleDate || row.instanceDate).getTime();
const dateText = row => { const value = dateValue(row); return Number.isFinite(value) ? new Date(value).toISOString().slice(0, 10) : ''; };
const median = values => { const sorted = values.filter(Number.isFinite).sort((a, b) => a - b); if (!sorted.length) return null; const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; };
const quantile = (values, fraction) => { const sorted = values.filter(Number.isFinite).sort((a, b) => a - b); if (!sorted.length) return null; const position = (sorted.length - 1) * fraction; const lower = Math.floor(position); const upper = Math.ceil(position); return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower); };
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round = (value, decimals = 4) => Number.isFinite(value) ? Number(value.toFixed(decimals)) : null;
const key = row => `${norm(row.propertyType)}||${norm(row.district)}||${norm(projectName(row))}`;
const districtKey = row => `${norm(row.propertyType)}||${norm(row.district)}`;

function buildTrendModels(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const date = dateValue(row); const ppsm = pricePerSqm(row);
    if (!residentialTypes.includes(row.propertyType) || !text(row.district) || !Number.isFinite(date) || !positive(ppsm)) continue;
    const groupKey = districtKey(row);
    if (!grouped.has(groupKey)) grouped.set(groupKey, []);
    grouped.get(groupKey).push({ date, ppsm });
  }
  const models = new Map();
  for (const [groupKey, points] of grouped) {
    const referenceDate = Math.max(...points.map(point => point.date));
    const x = points.map(point => (point.date - referenceDate) / 86400000);
    const y = points.map(point => Math.log(point.ppsm));
    const meanX = x.reduce((sum, value) => sum + value, 0) / x.length;
    const meanY = y.reduce((sum, value) => sum + value, 0) / y.length;
    const denominator = x.reduce((sum, value) => sum + (value - meanX) ** 2, 0);
    const slope = denominator > 0 ? x.reduce((sum, value, index) => sum + (value - meanX) * (y[index] - meanY), 0) / denominator : 0;
    models.set(groupKey, { referenceDate, slope: clamp(slope, -0.01, 0.01), points: points.length });
  }
  return models;
}

function adjustedPrice(row, trendModel, useTimeNormalization) {
  const base = pricePerSqm(row); if (!positive(base)) return null;
  if (!useTimeNormalization || !trendModel || !Number.isFinite(dateValue(row))) return base;
  const daysFromReference = (dateValue(row) - trendModel.referenceDate) / 86400000;
  return base * Math.exp(-trendModel.slope * daysFromReference);
}

function selectPeerRows(projectRows, peerRows, options) {
  if (!options.matchSizeAndRooms) return peerRows;
  const targetArea = median(projectRows.map(row => Number(row.area)).filter(positive));
  const targetRooms = median(projectRows.map(row => Number(row.rooms)).filter(Number.isFinite));
  const roomMatched = Number.isFinite(targetRooms) ? peerRows.filter(row => Number(row.rooms) === targetRooms) : [];
  const areaMatched = rows => Number.isFinite(targetArea) ? rows.filter(row => positive(row.area) && Number(row.area) >= targetArea * 0.75 && Number(row.area) <= targetArea * 1.25) : rows;
  const roomAndArea = areaMatched(roomMatched);
  if (roomAndArea.length >= options.minimumPeerTransactions) return roomAndArea;
  const areaOnly = areaMatched(peerRows);
  if (areaOnly.length >= options.minimumPeerTransactions) return areaOnly;
  return peerRows;
}

function buildCandidates(rows, options) {
  const valid = rows.filter(row => residentialTypes.includes(row.propertyType) && text(row.district) && text(projectName(row)) && positive(pricePerSqm(row)) && Number.isFinite(dateValue(row)));
  const trendModels = buildTrendModels(rows);
  const districtRows = new Map();
  for (const row of valid) { const groupKey = districtKey(row); if (!districtRows.has(groupKey)) districtRows.set(groupKey, []); districtRows.get(groupKey).push(row); }
  const projects = new Map();
  for (const row of valid) { const groupKey = key(row); if (!projects.has(groupKey)) projects.set(groupKey, { propertyType: row.propertyType, district: row.district, project: projectName(row), rows: [] }); projects.get(groupKey).rows.push(row); }
  const candidates = [];
  for (const [groupKey, cohort] of projects) {
    if (cohort.rows.length < options.minimumProjectTransactions) continue;
    const allPeers = (districtRows.get(districtKey(cohort.rows[0])) || []).filter(row => key(row) !== groupKey);
    const peers = selectPeerRows(cohort.rows, allPeers, options);
    if (peers.length < options.minimumPeerTransactions) continue;
    const model = trendModels.get(districtKey(cohort.rows[0]));
    const projectValues = cohort.rows.map(row => adjustedPrice(row, model, options.timeNormalize)).filter(Number.isFinite);
    const peerValues = peers.map(row => adjustedPrice(row, model, options.timeNormalize)).filter(Number.isFinite);
    const projectMedian = median(projectValues); const peerMedian = median(peerValues);
    if (!(projectMedian > 0) || !(peerMedian > 0)) continue;
    const projectP25 = quantile(projectValues, 0.25); const projectP75 = quantile(projectValues, 0.75);
    const peerP25 = quantile(peerValues, 0.25); const peerP75 = quantile(peerValues, 0.75);
    const projectDispersion = projectP25 > 0 ? projectP75 / projectP25 : null;
    const peerDispersion = peerP25 > 0 ? peerP75 / peerP25 : null;
    const highDispersion = (Number.isFinite(projectDispersion) && projectDispersion > 2) || (Number.isFinite(peerDispersion) && peerDispersion > 2);
    if (options.excludeHighDispersion && highDispersion) continue;
    const relativeIndex = projectMedian / peerMedian;
    const shrinkage = cohort.rows.length / (cohort.rows.length + options.shrinkagePriorTransactions);
    const raw = Math.abs(relativeIndex - 1) <= options.neutralIndexBand ? 1 : 1 + (relativeIndex - 1) * shrinkage;
    const candidateMultiplier = clamp(raw, options.candidateMin, options.candidateMax);
    candidates.push({ propertyType: cohort.propertyType, district: cohort.district, project: cohort.project, transactions: cohort.rows.length, peerTransactions: peers.length, projectMedianPricePerSqm: round(projectMedian, 2), peerMedianPricePerSqm: round(peerMedian, 2), relativePriceIndex: round(relativeIndex), projectDispersion: round(projectDispersion), peerDispersion: round(peerDispersion), highDispersion, timeNormalized: options.timeNormalize, matchedSizeAndRooms: options.matchSizeAndRooms, candidateMultiplier: round(candidateMultiplier), candidateStatus: candidateMultiplier === 1 ? 'neutral-candidate' : candidateMultiplier > 1 ? 'positive-candidate' : 'negative-candidate' });
  }
  return candidates.sort((a, b) => b.relativePriceIndex - a.relativePriceIndex);
}

function errorMetrics(rows, predictionField) {
  const valid = rows.filter(row => positive(row.actualSalePrice) && positive(row[predictionField]));
  if (!valid.length) return { records: 0, maePct: null, biasPct: null, p90AbsPct: null, within15Pct: null };
  const errors = valid.map(row => (Number(row[predictionField]) - Number(row.actualSalePrice)) / Number(row.actualSalePrice) * 100);
  const absolute = errors.map(value => Math.abs(value));
  return { records: valid.length, maePct: round(absolute.reduce((sum, value) => sum + value, 0) / absolute.length, 3), biasPct: round(errors.reduce((sum, value) => sum + value, 0) / errors.length, 3), p90AbsPct: round(quantile(absolute, 0.9), 3), within15Pct: round(absolute.filter(value => value <= 15).length / absolute.length * 100, 3) };
}

function runHoldoutScenario(name, options, testStart = CUTOFF, testEnd = null, trainCutoff = testStart) {
  const eligibleAccuracy = accuracy.filter(row => residentialTypes.includes(row.propertyType) && text(row.district) && text(projectName(row)) && dateText(row) >= testStart && (!testEnd || dateText(row) < testEnd) && positive(row.actualSalePrice) && positive(row.aqarValuation));
  const trainAccuracy = accuracy.filter(row => residentialTypes.includes(row.propertyType) && dateText(row) < trainCutoff);
  const trainingDld = dld.filter(row => dateText(row) < trainCutoff);
  const candidates = buildCandidates(trainingDld, options);
  const candidateMap = new Map(candidates.map(candidate => [key(candidate), candidate]));
  const scored = eligibleAccuracy.map(row => { const candidate = candidateMap.get(key(row)); const baseline = Number(row.aqarValuation); const shadow = candidate ? baseline * candidate.candidateMultiplier : baseline; return { ...row, baselinePrediction: baseline, shadowPrediction: shadow, matchedProjectCandidate: Boolean(candidate), projectMultiplier: candidate?.candidateMultiplier || 1 }; });
  const byType = Object.fromEntries(residentialTypes.map(type => { const rows = scored.filter(row => row.propertyType === type); const matched = rows.filter(row => row.matchedProjectCandidate); return [type, { testRecords: rows.length, matchedProjectCohortRecords: matched.length, coveragePct: rows.length ? round(matched.length / rows.length * 100, 3) : 0, fallbackUnchangedRecords: rows.length - matched.length, baseline: errorMetrics(rows, 'baselinePrediction'), shadow: errorMetrics(rows, 'shadowPrediction'), matchedOnlyBaseline: errorMetrics(matched, 'baselinePrediction'), matchedOnlyShadow: errorMetrics(matched, 'shadowPrediction') }]; }));
  const matchedRows = scored.filter(row => row.matchedProjectCandidate);
  return { name, options, trainCutoff, testStart, testEnd, trainRecords: trainAccuracy.length, testRecords: scored.length, candidateCohorts: candidates.length, byType, aggregate: { testRecords: scored.length, matchedProjectCohortRecords: matchedRows.length, coveragePct: scored.length ? round(matchedRows.length / scored.length * 100, 3) : 0, baseline: errorMetrics(scored, 'baselinePrediction'), shadow: errorMetrics(scored, 'shadowPrediction'), matchedOnlyBaseline: errorMetrics(matchedRows, 'baselinePrediction'), matchedOnlyShadow: errorMetrics(matchedRows, 'shadowPrediction') }, topCandidates: candidates.slice(0, 15), lowCandidates: [...candidates].sort((a, b) => a.relativePriceIndex - b.relativePriceIndex).slice(0, 15), methodologyNote: 'Candidates use only pre-cutoff DLD transactions and are applied to a later verified Accuracy period. This is diagnostic and does not modify official artifacts.' };
}

function buildAccuracyResidualCandidates(rows, options) {
  const groups = new Map();
  for (const row of rows.filter(row => residentialTypes.includes(row.propertyType) && text(row.district) && text(projectName(row)) && positive(row.actualSalePrice) && positive(row.aqarValuation))) {
    const groupKey = key(row);
    if (!groups.has(groupKey)) groups.set(groupKey, { propertyType: row.propertyType, district: row.district, project: projectName(row), residuals: [] });
    groups.get(groupKey).residuals.push(Number(row.actualSalePrice) / Number(row.aqarValuation));
  }
  const candidates = [];
  for (const cohort of groups.values()) {
    if (cohort.residuals.length < options.minimumProjectTransactions) continue;
    const p25 = quantile(cohort.residuals, 0.25); const p75 = quantile(cohort.residuals, 0.75);
    const dispersion = p25 > 0 ? p75 / p25 : null;
    if (options.excludeHighDispersion && Number.isFinite(dispersion) && dispersion > 2) continue;
    const residualMedian = median(cohort.residuals);
    const shrinkage = cohort.residuals.length / (cohort.residuals.length + options.shrinkagePriorTransactions);
    const raw = Math.abs(residualMedian - 1) <= options.neutralIndexBand ? 1 : 1 + (residualMedian - 1) * shrinkage;
    const candidateMultiplier = clamp(raw, options.candidateMin, options.candidateMax);
    candidates.push({ propertyType: cohort.propertyType, district: cohort.district, project: cohort.project, transactions: cohort.residuals.length, medianActualToBaseline: round(residualMedian), dispersion: round(dispersion), candidateMultiplier: round(candidateMultiplier), candidateStatus: candidateMultiplier === 1 ? 'neutral-candidate' : candidateMultiplier > 1 ? 'positive-candidate' : 'negative-candidate', source: 'verified-Accuracy-residual' });
  }
  return candidates.sort((a, b) => b.medianActualToBaseline - a.medianActualToBaseline);
}

function runAccuracyResidualScenario(name, options, testStart = CUTOFF, testEnd = null, trainCutoff = testStart) {
  const trainRows = accuracy.filter(row => dateText(row) < trainCutoff);
  const testRows = accuracy.filter(row => residentialTypes.includes(row.propertyType) && text(row.district) && text(projectName(row)) && dateText(row) >= testStart && (!testEnd || dateText(row) < testEnd) && positive(row.actualSalePrice) && positive(row.aqarValuation));
  const candidates = buildAccuracyResidualCandidates(trainRows, options);
  const candidateMap = new Map(candidates.map(candidate => [key(candidate), candidate]));
  const scored = testRows.map(row => { const candidate = candidateMap.get(key(row)); const applicable = !Array.isArray(options.applyTypes) || options.applyTypes.includes(row.propertyType); const baseline = Number(row.aqarValuation); return { ...row, baselinePrediction: baseline, shadowPrediction: applicable && candidate ? baseline * candidate.candidateMultiplier : baseline, matchedProjectCandidate: applicable && Boolean(candidate) }; });
  const byType = Object.fromEntries(residentialTypes.map(type => { const rows = scored.filter(row => row.propertyType === type); const matched = rows.filter(row => row.matchedProjectCandidate); return [type, { testRecords: rows.length, matchedProjectCohortRecords: matched.length, coveragePct: rows.length ? round(matched.length / rows.length * 100, 3) : 0, fallbackUnchangedRecords: rows.length - matched.length, baseline: errorMetrics(rows, 'baselinePrediction'), shadow: errorMetrics(rows, 'shadowPrediction'), matchedOnlyBaseline: errorMetrics(matched, 'baselinePrediction'), matchedOnlyShadow: errorMetrics(matched, 'shadowPrediction') }]; }));
  const matchedRows = scored.filter(row => row.matchedProjectCandidate);
  return { name, source: 'verified-Accuracy-residual', options, trainCutoff, testStart, testEnd, trainRecords: trainRows.length, testRecords: scored.length, candidateCohorts: candidates.length, byType, aggregate: { testRecords: scored.length, matchedProjectCohortRecords: matchedRows.length, coveragePct: scored.length ? round(matchedRows.length / scored.length * 100, 3) : 0, baseline: errorMetrics(scored, 'baselinePrediction'), shadow: errorMetrics(scored, 'shadowPrediction'), matchedOnlyBaseline: errorMetrics(matchedRows, 'baselinePrediction'), matchedOnlyShadow: errorMetrics(matchedRows, 'shadowPrediction') }, topCandidates: candidates.slice(0, 15), lowCandidates: [...candidates].sort((a, b) => a.medianActualToBaseline - b.medianActualToBaseline).slice(0, 15), methodologyNote: 'Project residual candidates are trained from earlier verified Accuracy records and applied to a later verified Accuracy period. This remains a diagnostic shadow experiment.' };
}

const scenarioBase = { minimumPeerTransactions: 5, shrinkagePriorTransactions: 20, candidateMin: CANDIDATE_MIN, candidateMax: CANDIDATE_MAX, neutralIndexBand: 0, timeNormalize: false, matchSizeAndRooms: false, excludeHighDispersion: false };
const scenarios = [
  runHoldoutScenario('legacy-simple', { ...scenarioBase, minimumProjectTransactions: 5 }),
  runHoldoutScenario('time-normalized-matched', { ...scenarioBase, minimumProjectTransactions: 5, timeNormalize: true, matchSizeAndRooms: true }),
  runHoldoutScenario('robust-time-matched', { ...scenarioBase, minimumProjectTransactions: 8, timeNormalize: true, matchSizeAndRooms: true, excludeHighDispersion: true, neutralIndexBand: 0.05 }),
  runHoldoutScenario('robust-time-matched-n10', { ...scenarioBase, minimumProjectTransactions: 10, timeNormalize: true, matchSizeAndRooms: true, excludeHighDispersion: true, neutralIndexBand: 0.05 })
];

const validationStart = '2026-05-01';
const tuningGrid = [0, 0.01, 0.02, 0.03, 0.05].flatMap(maxShift => [0, 0.03, 0.05].map(neutralIndexBand => ({
  ...scenarioBase,
  minimumProjectTransactions: 8,
  timeNormalize: true,
  matchSizeAndRooms: true,
  excludeHighDispersion: true,
  neutralIndexBand,
  candidateMin: 1 - maxShift,
  candidateMax: 1 + maxShift
})));
const validationScenarios = tuningGrid.map((options, index) => runHoldoutScenario(`tuning-${index + 1}`, options, validationStart, CUTOFF, validationStart));
const usableValidationScenarios = validationScenarios.filter(scenario => scenario.aggregate.shadow.records >= 50 && Number.isFinite(scenario.aggregate.shadow.maePct));
const selectedValidation = [...usableValidationScenarios].sort((a, b) => a.aggregate.shadow.maePct - b.aggregate.shadow.maePct || b.aggregate.shadow.within15Pct - a.aggregate.shadow.within15Pct)[0] || null;
const nestedSelected = selectedValidation ? runHoldoutScenario('nested-selected', selectedValidation.options, CUTOFF, null, CUTOFF) : null;
if (nestedSelected) scenarios.push(nestedSelected);
const residualBase = { minimumProjectTransactions: 8, shrinkagePriorTransactions: 20, candidateMin: 0.95, candidateMax: 1.05, neutralIndexBand: 0.05, excludeHighDispersion: true };
const residualScenario = runAccuracyResidualScenario('accuracy-residual-project', residualBase);
const residualVillaOnly = runAccuracyResidualScenario('accuracy-residual-villa-only', { ...residualBase, applyTypes: ['villa'] });
const residualApartmentOnly = runAccuracyResidualScenario('accuracy-residual-apartment-only', { ...residualBase, applyTypes: ['apartment'] });
const residualVillaSensitivity = [0, 0.01, 0.02, 0.03, 0.04, 0.05].map(shift => runAccuracyResidualScenario(`accuracy-residual-villa-cap-${(1 + shift).toFixed(2)}`, { ...residualBase, candidateMin: 1 - shift, candidateMax: 1 + shift, applyTypes: ['villa'] }));
const residualValidationGrid = [0.01, 0.02, 0.03, 0.05].flatMap(maxShift => [0, 0.03, 0.05].map(neutralIndexBand => ({ ...residualBase, candidateMin: 1 - maxShift, candidateMax: 1 + maxShift, neutralIndexBand })));
const residualValidation = residualValidationGrid.map((options, index) => runAccuracyResidualScenario(`accuracy-residual-tuning-${index + 1}`, options, validationStart, CUTOFF, validationStart));
const selectedResidualValidation = [...residualValidation].filter(scenario => scenario.aggregate.shadow.records >= 50 && scenario.candidateCohorts > 0 && scenario.aggregate.matchedProjectCohortRecords > 0).sort((a, b) => a.aggregate.shadow.maePct - b.aggregate.shadow.maePct || b.aggregate.shadow.within15Pct - a.aggregate.shadow.within15Pct)[0] || null;
const nestedResidual = selectedResidualValidation ? runAccuracyResidualScenario('accuracy-residual-nested-selected', selectedResidualValidation.options, CUTOFF, null, CUTOFF) : null;
if (nestedResidual) scenarios.push(nestedResidual);

const report = { generatedAt: new Date().toISOString(), scope: 'isolated-v2.1-project-multiplier-estimator-improvement', dldRecords: dld.length, accuracyRecords: accuracy.length, tuning: { validationStart, validationEnd: CUTOFF, candidateCount: tuningGrid.length, selectedValidation: selectedValidation ? { name: selectedValidation.name, options: selectedValidation.options, aggregate: selectedValidation.aggregate } : null, validationScenarios: validationScenarios.map(scenario => ({ name: scenario.name, options: scenario.options, testRecords: scenario.testRecords, candidateCohorts: scenario.candidateCohorts, aggregate: scenario.aggregate })), residual: { selectedValidation: selectedResidualValidation ? { name: selectedResidualValidation.name, options: selectedResidualValidation.options, aggregate: selectedResidualValidation.aggregate } : null, validationScenarios: residualValidation.map(scenario => ({ name: scenario.name, options: scenario.options, testRecords: scenario.testRecords, candidateCohorts: scenario.candidateCohorts, aggregate: scenario.aggregate })) } }, scenarios: [...scenarios, residualScenario, residualVillaOnly, residualApartmentOnly, ...residualVillaSensitivity], notes: ['All scenarios use observed eligible DLD and verified Accuracy values only.', 'Time normalization is a descriptive adjustment based on district/type log-price trend in the pre-cutoff training set.', 'Size/room matching and dispersion filters are safeguards against composition bias, not causal proof.', 'No official Accuracy artifact, evaluator, calibration, weights, fallback policy, raw DLD file, or historical result is modified.'] };
const output = process.argv[2] || path.join(root, 'docs/v2.1-project-multiplier-improved-analysis.json');
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, selectedValidation: selectedValidation ? { name: selectedValidation.name, options: selectedValidation.options, aggregate: selectedValidation.aggregate } : null, scenarios: [...scenarios, residualScenario, residualVillaOnly, residualApartmentOnly, ...residualVillaSensitivity].map(s => ({ name: s.name, candidateCohorts: s.candidateCohorts, coveragePct: s.aggregate.coveragePct, baseline: s.aggregate.baseline, shadow: s.aggregate.shadow })) }, null, 2));
