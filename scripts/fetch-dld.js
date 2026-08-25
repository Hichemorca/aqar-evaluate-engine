// AQAR DLD Data Fetcher — governed normalization and evidence cleaning
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { cleanDldRecords } = require('../shared/dld-evidence-cleaning');

const DATA_DIR = path.join(__dirname, '..', 'data');
const INPUT_FILE = path.join(DATA_DIR, 'dld-transactions.csv');
const OUTPUT_FILE = path.join(DATA_DIR, 'dld-transactions.json');
const REJECTED_FILE = path.join(DATA_DIR, 'dld-transactions-rejected.json');
const REPORT_FILE = path.join(DATA_DIR, 'dld-cleaning-report.json');

function parseDLDCSV(csvText) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index];
    const next = csvText[index + 1];
    if (character === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1;
      row.push(cell.trim());
      cell = '';
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
    } else {
      cell += character;
    }
  }
  if (cell !== '' || row.length) {
    row.push(cell.trim());
    if (row.some(value => value !== '')) rows.push(row);
  }

  if (rows.length < 2) return [];
  const headers = rows[0].map(header => header.trim());
  return rows.slice(1).map(values => {
    const rowObject = {};
    headers.forEach((header, index) => { rowObject[header] = values[index] || ''; });
    return rowObject;
  });
}

function mapPropertyType(mainType, subType) {
  const main = String(mainType || '').toLowerCase();
  const sub = String(subType || '').toLowerCase();
  if (main === 'land' || main.includes('land')) return 'land';
  if (sub.includes('villa')) return 'villa';
  if (sub.includes('office') || sub.includes('commercial')) return 'office';
  if (sub.includes('retail') || sub.includes('shop')) return 'retail';
  if (sub.includes('warehouse') || sub.includes('industrial') || sub.includes('workshop')) return 'warehouse';
  if (sub.includes('flat') || sub.includes('apartment') || sub.includes('hotel apartment') || sub.includes('hotel room')) return 'apartment';
  if (sub.includes('townhouse') || sub.includes('town')) return 'townhouse';
  if (main === 'building') return 'office';
  if (main === 'unit') return 'apartment';
  return undefined;
}

function formatDate(dateString) {
  if (!dateString) return '';
  const parsed = new Date(dateString);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  const parts = String(dateString).split(/[\/-]/);
  if (parts.length === 3 && parts[2].length === 4) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  return '';
}

function mapDldRow(row, rowIndex) {
  const transactionNumber = String(row.TRANSACTION_NUMBER || '').trim();
  const mainType = String(row.PROP_TYPE_EN || '').trim();
  const subType = String(row.PROP_SB_TYPE_EN || '').trim();
  const propertyType = mapPropertyType(mainType, subType);
  const rawDate = String(row.INSTANCE_DATE || '').trim();
  const area = Number(String(row.ACTUAL_AREA || row.PROCEDURE_AREA || '').replace(/,/g, ''));
  const price = Number(String(row.TRANS_VALUE || '').replace(/,/g, ''));
  return {
    propertyRef: transactionNumber ? `DLD-${transactionNumber}` : `DLD-row-${rowIndex}`,
    transactionNumber,
    instanceDate: rawDate,
    saleDate: formatDate(rawDate),
    propertyType,
    propType: mainType,
    propSubType: subType,
    usage: row.USAGE_EN || '',
    district: row.AREA_EN || '',
    area,
    procedureArea: Number(String(row.PROCEDURE_AREA || '').replace(/,/g, '')) || area,
    actualSalePrice: price,
    rooms: parseInt(row.ROOMS_EN || '0', 10) || 0,
    parking: parseInt(row.PARKING || '0', 10) || 0,
    nearestMetro: row.NEAREST_METRO_EN || '',
    nearestMall: row.NEAREST_MALL_EN || '',
    nearestLandmark: row.NEAREST_LANDMARK_EN || '',
    masterProject: row.MASTER_PROJECT_EN || '',
    project: row.PROJECT_EN || '',
    isOffPlan: String(row.IS_OFFPLAN_EN || '').toLowerCase() === 'yes',
    isFreeHold: String(row.IS_FREE_HOLD_EN || '').toLowerCase() === 'yes',
    group: row.GROUP_EN || '',
    procedure: row.PROCEDURE_EN || '',
    totalBuyer: parseInt(row.TOTAL_BUYER || '0', 10) || 0,
    totalSeller: parseInt(row.TOTAL_SELLER || '0', 10) || 0,
    city: 'dubai',
    scrapedFrom: 'Dubai Land Department',
    verifiedBy: 'Government Record',
    dataSource: 'dld-real'
  };
}

function buildCleaningArtifacts(csvText) {
  const checksum = crypto.createHash('sha256').update(csvText).digest('hex');
  const sourceRows = parseDLDCSV(csvText);
  const mappedRecords = sourceRows.map((row, index) => mapDldRow(row, index + 2));
  const cleaned = cleanDldRecords(mappedRecords);
  const report = {
    source: 'Dubai Land Department',
    sourceFile: 'data/dld-transactions.csv',
    sourceChecksum: checksum,
    generatedAt: new Date().toISOString(),
    ...cleaned.summary,
    issueLedgerFile: 'data/dld-transactions-rejected.json'
  };
  return { checksum, cleaned, report };
}

function main() {
  console.log('🚀 AQAR DLD importer — governed normalization and evidence cleaning\n');
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ File not found: ${INPUT_FILE}`);
    process.exitCode = 1;
    return;
  }
  const csvText = fs.readFileSync(INPUT_FILE, 'utf8');
  const { checksum, cleaned, report } = buildCleaningArtifacts(csvText);
  const eligible = cleaned.eligibleRecords;
  const rejected = cleaned.rejectedRecords;
  const typeCount = {};
  eligible.forEach(record => { typeCount[record.propertyType] = (typeCount[record.propertyType] || 0) + 1; });

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(eligible, null, 2));
  fs.writeFileSync(REJECTED_FILE, JSON.stringify({ sourceChecksum: checksum, records: rejected, issues: cleaned.issues }, null, 2));
  const issueCountsByReason = cleaned.issues.reduce((counts, issue) => {
    const key = issue.issueType === 'duplicate' ? 'duplicate_transaction_id' : issue.reason;
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  fs.writeFileSync(REPORT_FILE, JSON.stringify({ ...report, issueCountsByReason }, null, 2));

  console.log(JSON.stringify({ ...report, eligibleFile: 'data/dld-transactions.json', rejectedFile: 'data/dld-transactions-rejected.json', propertyTypes: typeCount }, null, 2));
}

if (require.main === module) main();

module.exports = { parseDLDCSV, mapPropertyType, mapDldRow, buildCleaningArtifacts, formatDate };
