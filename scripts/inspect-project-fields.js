const fs = require('fs');
const rows = JSON.parse(fs.readFileSync('data/dld-transactions.json', 'utf8'));
const typeCounts = {};
const projectCounts = {};
for (const row of rows) {
  const type = String(row.propertyType || '').trim();
  typeCounts[type] = (typeCounts[type] || 0) + 1;
  const project = String(row.masterProject || row.project || '').trim();
  if (project) {
    const key = `${type}||${String(row.district || '').trim()}||${project}`.toLowerCase();
    projectCounts[key] = (projectCounts[key] || 0) + 1;
  }
}
console.log(JSON.stringify({ rows: rows.length, typeCounts, projectKeys: Object.keys(projectCounts).length, sampleProjectKeys: Object.entries(projectCounts).sort((a,b)=>b[1]-a[1]).slice(0,10) }, null, 2));
