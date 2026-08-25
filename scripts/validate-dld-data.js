const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', 'data', 'dld-transactions.json');

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
    const synthetic = raw.filter(record =>
      record.dataSource !== 'dld-real' ||
      record.scrapedFrom !== 'Dubai Land Department' ||
      record.verifiedBy !== 'Government Record'
    );
    const appraiserFields = raw.filter(record =>
      Object.prototype.hasOwnProperty.call(record, 'appraiserValuation') ||
      Object.prototype.hasOwnProperty.call(record, 'aqarVsAppraiser')
    );
    if (synthetic.length > 0) fail(`${synthetic.length} records are not verified DLD records`);
    if (appraiserFields.length > 0) fail(`${appraiserFields.length} records contain Appraiser comparison fields`);
    if (process.exitCode !== 1) console.log(`✅ Verified DLD data: ${raw.length.toLocaleString()} records`);
  }
}
