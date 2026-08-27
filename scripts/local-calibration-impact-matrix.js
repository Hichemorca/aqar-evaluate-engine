#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const calibrationDefaults = require('../shared/aqar-calibration-defaults');
const { validateConfig, deepMergeKnown } = require('../shared/calibration-validation');
const calibrationEngine = require('../shared/calibration-engine');
const shadowEngine = require('../shared/v21-shadow-multiplier-engine');

const repoRoot = path.join(__dirname, '..');
const activePath = path.join(repoRoot, 'data', 'active-calibration.json');
const accuracyPath = path.join(repoRoot, 'data', 'accuracy-data.json');
const dldPath = path.join(repoRoot, 'data', 'dld-transactions.json');
const defaultOutput = path.join(os.tmpdir(), 'miayaar-calibration-impact-matrix.json');

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function sha256(filePath) { return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'); }
function numberOr(value, fallback = null) { return Number.isFinite(Number(value)) ? Number(value) : fallback; }
function getAt(object, segments) { return segments.reduce((current, key) => current?.[key], object); }
function setAt(object, segments, value) {
  let current = object;
  for (const segment of segments.slice(0, -1)) current = current[segment];
  current[segments[segments.length - 1]] = value;
}
function parseArgs(argv) {
  const args = { output: process.env.CALIBRATION_MATRIX_OUTPUT || defaultOutput };
  for (let i = 2; i < argv.length; i += 1) if (argv[i] === '--output') args.output = path.resolve(argv[++i]);
  return args;
}
function walk(value, segments, output = []) {
  if (!value || typeof value !== 'object') return output;
  for (const [key, child] of Object.entries(value)) {
    const next = [...segments, key];
    if (typeof child === 'number') output.push({ path: next, value: child });
    else if (child && typeof child === 'object' && !Array.isArray(child)) walk(child, next, output);
    else if (Array.isArray(child)) child.forEach((item, index) => walk(item, [...next, String(index)], output));
  }
  return output;
}
function fixture(propertyType) {
  return {
    propType: propertyType,
    salesValue: 1_000_000,
    annualRent: 84_000,
    annualExpenses: 10_000,
    marketValue: 1_200_000,
    area: 120,
    constructionCost: 3_000,
    landValue: 400_000,
    yearBuilt: 2018,
    currentYear: 2026,
    condition: 'good',
    finishQuality: 'good',
    viewType: 'sea',
    floorLevel: 'high',
    streetPosition: 'main',
    buildingCondition: 'good',
    furnishedStatus: 'furnished',
    bua: 80,
    plotArea: 120,
    lastRenovationYear: 2024,
    district: 'business bay',
    projectBuilding: 'test project',
    projectBuildingSource: 'dld-suggestion',
    projectEvidenceCount: 10
  };
}
function officialResult(config, propertyType) {
  const propertyConfig = config.propertyTypes[propertyType];
  const methods = calibrationEngine.buildMethodResults(fixture(propertyType), propertyConfig);
  const combined = calibrationEngine.combineMethodResults(methods, propertyConfig, config.configId || 'local-test');
  return { value: combined.value, methods, status: combined.status, calibrationId: combined.calibrationId };
}
function shadowResult(config, propertyType, officialValue) {
  const trace = shadowEngine.compute(fixture(propertyType), config.v21ShadowMultipliers);
  return { multiplier: trace.multiplier, shadowValue: officialValue === null ? null : Math.round(officialValue * trace.multiplier), trace };
}
function activeNumericPaths(config) {
  const paths = [];
  for (const [propertyType, propertyConfig] of Object.entries(config.propertyTypes || {})) {
    for (const method of propertyConfig.applicableMethods || []) {
      const weightPath = ['propertyTypes', propertyType, 'weights', method];
      if (typeof propertyConfig.weights?.[method] === 'number') paths.push({ path: weightPath, value: propertyConfig.weights[method] });
      const group = { 'sales-comparison': 'sales', income: 'income', cost: 'cost', dcf: 'dcf' }[method];
      for (const item of walk(propertyConfig.coefficients?.[group], ['propertyTypes', propertyType, 'coefficients', group], [])) paths.push(item);
    }
  }
  for (const item of walk(config.gis, ['gis'], [])) paths.push(item);
  for (const propertyType of ['apartment', 'villa', 'townhouse']) {
    for (const item of walk(config.v21ShadowMultipliers?.propertyTypes?.[propertyType], ['v21ShadowMultipliers', 'propertyTypes', propertyType], [])) paths.push(item);
  }
  for (const key of ['minProjectEvidence', 'combinedMinimumMultiplier', 'combinedMaximumMultiplier']) {
    if (typeof config.v21ShadowMultipliers?.[key] === 'number') paths.push({ path: ['v21ShadowMultipliers', key], value: config.v21ShadowMultipliers[key] });
  }
  return paths;
}
function mutateConfig(config, item) {
  const next = clone(config);
  const { path: segments, value } = item;
  const propertyType = segments[0] === 'v21ShadowMultipliers' ? segments[2] : segments[1];
  const isWeight = segments[2] === 'weights';
  const isShadow = segments[0] === 'v21ShadowMultipliers';
  if (isWeight) {
    const methods = next.propertyTypes[propertyType].applicableMethods || [];
    const target = segments[3];
    const companion = methods.find(method => method !== target && Number(next.propertyTypes[propertyType].weights?.[method]) > 0);
    if (!companion) return { config: null, mutation: null, skip: 'no-positive-companion-weight' };
    const delta = Math.min(0.05, Number(next.propertyTypes[propertyType].weights[companion]) / 2);
    next.propertyTypes[propertyType].weights[target] = Number((Number(value) + delta).toFixed(6));
    next.propertyTypes[propertyType].weights[companion] = Number((Number(next.propertyTypes[propertyType].weights[companion]) - delta).toFixed(6));
    return { config: next, mutation: { type: 'paired-weight', target, companion, delta } };
  }
  if (isShadow) {
    if (segments.at(-1) === 'multiplier' || segments.at(-1) === 'defaultMultiplier') setAt(next, segments, Number((Number(value) + 0.05).toFixed(6)));
    else if (segments.at(-1) === 'maxRatio') setAt(next, segments, Number((Number(value) + 0.05).toFixed(6)));
    else if (segments.at(-1) === 'maxAgeYears') setAt(next, segments, Number(value) + 1);
    else if (segments.at(-1) === 'minProjectEvidence') setAt(next, segments, Math.max(1, Number(value) + 1));
    else if (segments.at(-1) === 'combinedMinimumMultiplier') setAt(next, segments, Number((Number(value) + 0.01).toFixed(6)));
    else if (segments.at(-1) === 'combinedMaximumMultiplier') setAt(next, segments, Number((Number(value) + 0.01).toFixed(6)));
    else setAt(next, segments, Number(value) + (Number(value) === 0 ? 1 : Math.abs(Number(value) * 0.1)));
    next.v21ShadowMultipliers.enabled = true;
    const minimum = Number(next.v21ShadowMultipliers.combinedMinimumMultiplier);
    const maximum = Number(next.v21ShadowMultipliers.combinedMaximumMultiplier);
    if (minimum >= maximum) next.v21ShadowMultipliers.combinedMaximumMultiplier = Number((minimum + 0.01).toFixed(6));
    return { config: next, mutation: { type: 'shadow-value', from: value, to: getAt(next, segments) } };
  }
  const current = Number(value);
  const delta = current === 0 ? 1 : Math.max(Math.abs(current) * 0.1, 0.000001);
  setAt(next, segments, Number((current + delta).toFixed(6)));
  return { config: next, mutation: { type: 'numeric-value', from: value, to: getAt(next, segments) } };
}
function classify(item, baseOfficial, changedOfficial, baseShadow, changedShadow) {
  const officialDelta = baseOfficial.value === null || changedOfficial.value === null ? null : changedOfficial.value - baseOfficial.value;
  const shadowDelta = baseShadow.shadowValue === null || changedShadow.shadowValue === null ? null : changedShadow.shadowValue - baseShadow.shadowValue;
  const path = item.path.join('.');
  if (path.startsWith('v21ShadowMultipliers')) return Math.abs(Number(shadowDelta || 0)) > 0 ? 'shadow-only' : 'shadow-no-observable-effect';
  if (Math.abs(Number(officialDelta || 0)) > 0) return 'official-value-changed';
  if (path.startsWith('gis.')) return 'interactive-only-not-exercised-by-shared-engine';
  if (path.includes('.coefficients.sales.')) return 'interactive-sales-path-not-exercised-by-shared-engine';
  return 'no-observable-effect-in-fixture';
}
function main() {
  const args = parseArgs(process.argv);
  const config = deepMergeKnown(calibrationDefaults.createDefaultCalibrationConfig(), JSON.parse(fs.readFileSync(activePath, 'utf8')));
  const officialBefore = { accuracySha256: sha256(accuracyPath), dldSha256: sha256(dldPath) };
  const baseByType = {};
  for (const propertyType of Object.keys(config.propertyTypes || {})) {
    const official = officialResult(config, propertyType);
    baseByType[propertyType] = { official, shadow: shadowResult(config, propertyType, official.value) };
  }
  const items = activeNumericPaths(config);
  const results = [];
  for (const item of items) {
    const propertyType = item.path[1] && config.propertyTypes[item.path[1]] ? item.path[1] : 'apartment';
    const base = baseByType[propertyType];
    const mutated = mutateConfig(config, item);
    if (mutated.skip) {
      results.push({ path: item.path.join('.'), originalValue: item.value, skipped: mutated.skip });
      continue;
    }
    const validation = validateConfig(mutated.config);
    if (!validation.valid) {
      results.push({ path: item.path.join('.'), originalValue: item.value, mutation: mutated.mutation, skipped: 'invalid-mutated-config', validationErrors: validation.errors });
      continue;
    }
    const changedOfficial = officialResult(mutated.config, propertyType);
    const changedShadow = shadowResult(mutated.config, propertyType, changedOfficial.value);
    results.push({
      path: item.path.join('.'),
      propertyType,
      originalValue: item.value,
      mutation: mutated.mutation,
      classification: classify(item, base.official, changedOfficial, base.shadow, changedShadow),
      baseline: { officialValue: base.official.value, shadowValue: base.shadow.shadowValue, shadowMultiplier: base.shadow.multiplier, calibrationId: base.official.calibrationId },
      changed: { officialValue: changedOfficial.value, shadowValue: changedShadow.shadowValue, shadowMultiplier: changedShadow.multiplier, calibrationId: `local-mutated-${propertyType}` },
      deltas: { officialValue: changedOfficial.value === null || base.official.value === null ? null : changedOfficial.value - base.official.value, shadowValue: changedShadow.shadowValue === null || base.shadow.shadowValue === null ? null : changedShadow.shadowValue - base.shadow.shadowValue }
    });
  }
  const counts = results.reduce((acc, row) => { const key = row.skipped || row.classification || 'unknown'; acc[key] = (acc[key] || 0) + 1; return acc; }, {});
  const report = {
    schemaVersion: 1,
    readOnly: true,
    scope: 'local-in-memory-calibration-impact-matrix',
    configId: config.configId,
    numericScenarioCount: items.length,
    resultCount: results.length,
    counts,
    officialBaseline: { accuracySha256: officialBefore.accuracySha256, dldSha256: officialBefore.dldSha256 },
    safeguards: { officialAccuracyUnchanged: sha256(accuracyPath) === officialBefore.accuracySha256, officialDldUnchanged: sha256(dldPath) === officialBefore.dldSha256, noNetlifyRequests: true, noCalibrationSave: true, noOfficialArtifactsWritten: true },
    results
  };
  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ output: args.output, configId: report.configId, numericScenarioCount: report.numericScenarioCount, counts: report.counts, safeguards: report.safeguards }, null, 2));
}
main();
