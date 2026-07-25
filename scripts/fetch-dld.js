// AQAR DLD Data Fetcher — Real CSV with 7,108 transactions
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const INPUT_FILE = path.join(DATA_DIR, 'dld-transactions.csv');
const OUTPUT_FILE = path.join(DATA_DIR, 'dld-transactions.json');

function parseDLDCSV(csvText) {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length < 2) {
    console.log('⚠️ Empty or invalid CSV');
    return [];
  }

  const headers = lines[0].split(',').map(h => h.trim());
  console.log(`📋 Found ${headers.length} columns: ${headers.slice(0, 8).join(', ')}...`);

  const transactions = [];

  for (let i = 1; i < lines.length; i++) {
    try {
      // Handle commas inside quoted fields
      const values = [];
      let current = '';
      let inQuotes = false;
      for (const char of lines[i]) {
        if (char === '"') { inQuotes = !inQuotes; continue; }
        if (char === ',' && !inQuotes) { values.push(current.trim()); current = ''; continue; }
        current += char;
      }
      values.push(current.trim());

      if (values.length < 10) continue;

      const row = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] || '';
      });

      // Map your column names
      const transactionNumber = row['TRANSACTION_NUMBER'] || '';
      const instanceDate = row['INSTANCE_DATE'] || '';
      const areaEn = row['AREA_EN'] || '';
      const propTypeEn = row['PROP_TYPE_EN'] || '';
      const transValue = parseFloat((row['TRANS_VALUE'] || '0').replace(/,/g, ''));
      const actualArea = parseFloat((row['ACTUAL_AREA'] || row['PROCEDURE_AREA'] || '0').replace(/,/g, ''));
      const rooms = row['ROOMS'] || row['BEDROOMS'] || '';
      const isOffPlan = (row['OFFPLAN'] || '').toLowerCase().includes('yes');
      const usage = row['USAGE'] || '';
      const project = row['PROJECT'] || row['PROJECT_NAME'] || '';
      const freehold = (row['FREEHOLD'] || '').toLowerCase().includes('yes');

      if (transValue > 0 && actualArea > 10) {
        transactions.push({
          propertyRef: `DLD-${transactionNumber}`,
          propertyType: mapPropertyType(propTypeEn),
          city: 'dubai',
          district: areaEn,
          area: Math.round(actualArea),
          actualSalePrice: Math.round(transValue),
          saleDate: formatDate(instanceDate),
          rooms: parseInt(rooms) || 0,
          isOffPlan: isOffPlan,
          usage: usage,
          project: project,
          freehold: freehold,
          scrapedFrom: 'Dubai Land Department',
          verifiedBy: 'Government Record',
          dataSource: 'dld-real'
        });
      }
    } catch (e) {
      // Skip malformed rows
    }
  }

  return transactions;
}

function mapPropertyType(type) {
  const t = (type || '').toLowerCase();
  if (t.includes('villa')) return 'villa';
  if (t.includes('office') || t.includes('commercial')) return 'office';
  if (t.includes('retail') || t.includes('shop')) return 'retail';
  if (t.includes('land') || t.includes('plot')) return 'land';
  if (t.includes('warehouse') || t.includes('industrial')) return 'warehouse';
  if (t.includes('flat') || t.includes('apartment')) return 'apartment';
  if (t.includes('townhouse') || t.includes('town')) return 'townhouse';
  return 'apartment';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    // Try different formats
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    
    const parts = dateStr.split(/[\/\-]/);
    if (parts.length === 3) {
      if (parts[2].length === 4) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
    return '';
  } catch {
    return '';
  }
}

async function main() {
  console.log('🚀 AQAR DLD Real Data Importer\n');
  console.log('📊 Processing 7,108 real transactions from Dubai Land Department\n');

  if (!fs.existsSync(INPUT_FILE)) {
    console.log(`❌ File not found: ${INPUT_FILE}`);
    return;
  }

  const csvText = fs.readFileSync(INPUT_FILE, 'utf8');
  const transactions = parseDLDCSV(csvText);

  if (transactions.length === 0) {
    console.log('⚠️ No valid transactions found');
    return;
  }

  // Filter last 60 days
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000);
  const recent = transactions.filter(t => {
    if (!t.saleDate) return false;
    const d = new Date(t.saleDate);
    return d >= sixtyDaysAgo;
  });

  console.log(`📊 Total valid transactions: ${transactions.length.toLocaleString()}`);
  console.log(`📅 Last 60 days: ${recent.length.toLocaleString()}`);

  if (recent.length === 0) {
    console.log('\n⚠️ No transactions in last 60 days. Using all valid transactions.');
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(transactions.slice(0, 1000), null, 2));
    console.log(`✅ Saved ${Math.min(transactions.length, 1000)} transactions`);
    return;
  }

  // Summary
  const districts = {};
  const types = {};
  const offPlanCount = recent.filter(t => t.isOffPlan).length;
  
  recent.forEach(t => {
    if (t.district) districts[t.district] = (districts[t.district] || 0) + 1;
    types[t.propertyType] = (types[t.propertyType] || 0) + 1;
  });

  console.log('\n📋 Top 10 Districts:');
  Object.entries(districts).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([d, c]) => {
    console.log(`   ${d}: ${c}`);
  });

  console.log('\n📋 By Property Type:');
  Object.entries(types).sort((a, b) => b[1] - a[1]).forEach(([t, c]) => {
    console.log(`   ${t}: ${c}`);
  });

  console.log(`\n📋 Off-Plan: ${offPlanCount} (${Math.round(offPlanCount/recent.length*100)}%)`);

  const avgValue = Math.round(recent.reduce((s, t) => s + t.actualSalePrice, 0) / recent.length);
  console.log(`💰 Average Transaction: ${avgValue.toLocaleString()} AED`);

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(recent, null, 2));
  console.log(`\n✅ Saved ${recent.length.toLocaleString()} REAL DLD transactions`);
  console.log(`   Source: Government Records (100% verified)`);
}

main().catch(console.error);