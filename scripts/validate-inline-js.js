#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const htmlFiles = fs.readdirSync(root)
  .filter(file => file.endsWith('.html'))
  .sort();
const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let checked = 0;

for (const file of htmlFiles) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  let match;
  let block = 0;
  while ((match = scriptPattern.exec(source)) !== null) {
    block += 1;
    if (/\bsrc\s*=\s*/i.test(match[1])) continue;
    const code = match[2].trim();
    if (!code) continue;
    checked += 1;
    new vm.Script(code, { filename: `${file}#inline-${block}` });
  }
}

console.log(`Inline JavaScript syntax OK: ${checked} block(s) across ${htmlFiles.length} HTML page(s)`);
