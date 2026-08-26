#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const files = {
  dld: JSON.parse(fs.readFileSync(path.join(root, 'data/dld-transactions.json'), 'utf8')),
  accuracy: JSON.parse(fs.readFileSync(path.join(root, 'data/accuracy-data.json'), 'utf8'))
};
function rows(value) { return Array.isArray(value) ? value : (value.records || value.data || []); }
function date(row) { const parsed = new Date(row.saleDate || row.instanceDate); return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null; }
function summary(name, raw) {
  const data = rows(raw).map(row => date(row)).filter(Boolean).sort();
  const months = {};
  for (const value of data) { const month = value.slice(0, 7); months[month] = (months[month] || 0) + 1; }
  return { name, records: data.length, min: data[0] || null, max: data.at(-1) || null, months };
}
console.log(JSON.stringify({ dld: summary('dld', files.dld), accuracy: summary('accuracy', files.accuracy) }, null, 2));
