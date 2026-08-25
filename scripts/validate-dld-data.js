const fs = require('fs');
const path = require('path');
const { findUnverifiedRecords } = require('../shared/dld-provenance');

const dataPath = path.join(__dirname, '..', 'data', 'dld-transactions.json');
const cleaningReportPath = path.join(__dirname, '..', 'data', 'dld-cleaning-report.json');

function fail(message) {
  console.error(`❌ DLD validation failed: ${message}`);
  process.exitCode = 1;
}

if (!fs.existsSync(dataPath)) {
  fail('data/dld-transactions.json is missing');
} else {
  const raw = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  if (!Array.isArray(raw) || raw.length === 0) {
    fail('no verified transactions are available');
  } else {
    const unverified = findUnverifiedRecords(raw);
    if (unverified.length > 0) fail(`${unverified.length} records are not verified DLD records or contain prohibited comparison fields`);
    const rejectedInEligible = raw.filter(record => record.evidenceStatus && record.evidenceStatus !== 'eligible');
    if (rejectedInEligible.length > 0) fail(`${rejectedInEligible.length} rejected records leaked into eligible DLD data`);
    if (!fs.existsSync(cleaningReportPath)) fail('dld-cleaning-report.json is missing');
    else {
      const report = JSON.parse(fs.readFileSync(cleaningReportPath, 'utf8'));
      if (!report.sourceChecksum || report.eligible !== raw.length) fail('DLD cleaning report does not match eligible data');
    }
    if (process.exitCode !== 1) console.log(`✅ Verified DLD data: ${raw.length.toLocaleString()} eligible records with cleaning report`);
  }
}
