const fs = require('fs');
const crypto = require('crypto');

const inputPath = process.argv[2] || 'data/dld-transactions.json';
const outputPath = process.argv[3] || 'data/dld-project-evidence-index.json';
const rows = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const normalize = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const counts = new Map();
for (const row of rows) {
  const propertyType = normalize(row.propertyType);
  const district = normalize(row.district);
  if (!propertyType || !district) continue;
  for (const rawProject of [row.masterProject, row.project]) {
    const project = normalize(rawProject);
    if (!project) continue;
    const key = `${propertyType}||${district}||${project}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
}
const entries = Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, count]) => [key, { count }]));
const result = {
  schemaVersion: 1,
  source: 'data/dld-transactions.json',
  sourceSha256: crypto.createHash('sha256').update(fs.readFileSync(inputPath)).digest('hex'),
  generatedAt: new Date().toISOString(),
  projectKeyCount: Object.keys(entries).length,
  projects: entries
};
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, sourceRows: rows.length, projectKeyCount: result.projectKeyCount, sourceSha256: result.sourceSha256 }, null, 2));
