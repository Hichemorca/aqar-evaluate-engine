#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dld = JSON.parse(fs.readFileSync(path.join(root, 'data/dld-transactions.json'), 'utf8'));
const accuracyPayload = JSON.parse(fs.readFileSync(path.join(root, 'data/accuracy-data.json'), 'utf8'));
const accuracy = Array.isArray(accuracyPayload) ? accuracyPayload : (accuracyPayload.records || accuracyPayload.data || []);
const residential = new Set(['apartment', 'villa', 'townhouse']);
const types = ['apartment', 'villa', 'townhouse', 'office', 'retail', 'warehouse', 'land'];
const present = value => value !== undefined && value !== null && String(value).trim() !== '';
const projectName = row => [row.masterProject, row.project].find(present) || '';
const key = row => String(row.propertyRef || row.transactionNumber || row.id || '').trim();

function summarize(rows) {
  const byType = {};
  for (const type of types) {
    const subset = rows.filter(row => row.propertyType === type);
    const projects = subset.filter(row => present(projectName(row)));
    const projectCounts = new Map();
    for (const row of projects) {
      const name = projectName(row).trim();
      projectCounts.set(name, (projectCounts.get(name) || 0) + 1);
    }
    const counts = [...projectCounts.values()].sort((a, b) => b - a);
    byType[type] = {
      records: subset.length,
      projectRecords: projects.length,
      projectCoveragePct: subset.length ? +(projects.length / subset.length * 100).toFixed(2) : 0,
      uniqueProjects: projectCounts.size,
      cohortsAtLeast5: counts.filter(n => n >= 5).length,
      cohortsAtLeast3: counts.filter(n => n >= 3).length,
      topProjects: [...projectCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }))
    };
  }
  return byType;
}

function fieldCoverage(rows) {
  const fields = ['bua', 'builtUpArea', 'plotArea', 'landArea', 'lastRenovationYear', 'renovationYear'];
  return Object.fromEntries(fields.map(field => [field, rows.filter(row => present(row[field])).length]));
}

const report = {
  generatedAt: new Date().toISOString(),
  scope: 'isolated-v2.1-property-fields-analysis',
  dldEligibleRecords: dld.length,
  accuracyRecords: accuracy.length,
  dldFieldCoverage: fieldCoverage(dld),
  accuracyFieldCoverage: fieldCoverage(accuracy),
  projectCoverageByType: summarize(dld),
  notes: [
    'Project/Building is measurable from DLD masterProject/project fields.',
    'The current eligible DLD schema exposes area/procedureArea, but no verified separate BUA, Plot Area, or Last Renovation Year fields.',
    'No official Accuracy artifact, evaluator formula, calibration, weights, fallback policy, raw DLD file, or historical result is modified by this runner.'
  ]
};

const output = process.argv[2] || path.join(root, 'docs/v2.1-property-fields-analysis.json');
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, dldEligibleRecords: report.dldEligibleRecords, accuracyRecords: report.accuracyRecords, dldFieldCoverage: report.dldFieldCoverage, accuracyFieldCoverage: report.accuracyFieldCoverage }, null, 2));
