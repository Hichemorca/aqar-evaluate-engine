const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
}

function writeJson(name, value) {
  fs.writeFileSync(path.join(DATA_DIR, name), `${JSON.stringify(value, null, 2)}\n`);
}

function buildDistrictSummary(transactions) {
  const districts = [...new Set(transactions
    .map(row => String(row.district || '').trim())
    .filter(district => district && district !== 'Unknown'))]
    .sort((a, b) => a.localeCompare(b));
  return { source: 'dld-transactions.json', districts };
}

function buildProjectSummary(transactions) {
  const groups = new Map();
  transactions.forEach(row => {
    const propertyType = String(row.propertyType || '').trim();
    const district = String(row.district || '').trim();
    if (!propertyType || !district || district === 'Unknown') return;
    const names = new Set([row.masterProject, row.project]
      .map(value => String(value || '').trim())
      .filter(Boolean));
    if (!names.size) return;
    const key = `${propertyType}||${district}`;
    if (!groups.has(key)) groups.set(key, { propertyType, district, projects: new Map() });
    const group = groups.get(key);
    names.forEach(name => group.projects.set(name, (group.projects.get(name) || 0) + 1));
  });
  const entries = [...groups.values()]
    .sort((a, b) => a.propertyType.localeCompare(b.propertyType) || a.district.localeCompare(b.district))
    .map(group => ({
      propertyType: group.propertyType,
      district: group.district,
      projects: [...group.projects.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, transactionCount]) => ({ name, transactionCount }))
    }));
  return { source: 'dld-transactions.json', entries };
}

function buildAccuracySummary(accuracy) {
  const metrics = accuracy.metrics || {};
  const metadata = accuracy.metadata || {};
  return {
    source: 'accuracy-data.json',
    metrics: {
      totalRecords: metrics.totalRecords,
      avgAccuracy: metrics.avgAccuracy,
      avgDeviation: metrics.avgDeviation
    },
    metadata: {
      totalRecords: metadata.totalRecords,
      lastUpdated: metadata.lastUpdated
    }
  };
}

function buildSummaries() {
  const transactions = readJson('dld-transactions.json');
  const accuracy = readJson('accuracy-data.json');
  return {
    'district-list.json': buildDistrictSummary(transactions),
    'project-building-summary.json': buildProjectSummary(transactions),
    'accuracy-summary.json': buildAccuracySummary(accuracy)
  };
}

function main() {
  const summaries = buildSummaries();
  const checkOnly = process.argv.includes('--check');
  for (const [name, expected] of Object.entries(summaries)) {
    const target = path.join(DATA_DIR, name);
    if (checkOnly) {
      if (!fs.existsSync(target)) throw new Error(`Missing summary: ${name}`);
      const actual = JSON.parse(fs.readFileSync(target, 'utf8'));
      if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Summary is stale: ${name}`);
    } else {
      writeJson(name, expected);
    }
  }
  console.log(`${checkOnly ? 'Verified' : 'Generated'} ${Object.keys(summaries).length} client summaries`);
}

if (require.main === module) main();

module.exports = { buildDistrictSummary, buildProjectSummary, buildAccuracySummary, buildSummaries };
