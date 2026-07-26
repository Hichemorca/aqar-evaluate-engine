// AQAR DLD Data Fetcher — Extracts ALL 22 fields from CSV
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

      // Extract ALL fields
      const transValue = parseFloat((row['TRANS_VALUE'] || '0').replace(/,/g, ''));
      const actualArea = parseFloat((row['ACTUAL_AREA'] || row['PROCEDURE_AREA'] || '0').replace(/,/g, ''));
      
      if (transValue <= 0 || actualArea <= 0) continue;

      transactions.push({
        propertyRef: `DLD-${row['TRANSACTION_NUMBER'] || i}`,
        transactionNumber: row['TRANSACTION_NUMBER'] || '',
        instanceDate: row['INSTANCE_DATE'] || '',
        saleDate: formatDate(row['INSTANCE_DATE'] || ''),
        
        // Property details
        propertyType: mapPropertyType(row['PROP_TYPE_EN'] || ''),
        propSubType: row['PROP_SB_TYPE_EN'] || '',
        usage: row['USAGE_EN'] || '',
        district: row['AREA_EN'] || '',
        area: Math.round(actualArea),
        procedureArea: parseFloat((row['PROCEDURE_AREA'] || '0').replace(/,/g, '')),
        
        // Price
        actualSalePrice: Math.round(transValue),
        
        // Features
        rooms: parseInt(row['ROOMS_EN'] || '0') || 0,
        parking: parseInt(row['PARKING'] || '0') || 0,
        
        // Location attributes
        nearestMetro: row['NEAREST_METRO_EN'] || '',
        nearestMall: row['NEAREST_MALL_EN'] || '',
        nearestLandmark: row['NEAREST_LANDMARK_EN'] || '',
        
        // Project
        masterProject: row['MASTER_PROJECT_EN'] || '',
        project: row['PROJECT_EN'] || '',
        
        // Status
        isOffPlan: (row['IS_OFFPLAN_EN'] || '').toLowerCase() === 'yes',
        isFreeHold: (row['IS_FREE_HOLD_EN'] || '').toLowerCase() === 'yes',
        group: row['GROUP_EN'] || '',
        procedure: row['PROCEDURE_EN'] || '',
        
        // Parties
        totalBuyer: parseInt(row['TOTAL_BUYER'] || '0') || 0,
        totalSeller: parseInt(row['TOTAL_SELLER'] || '0') || 0,
        
        // Source
        city: 'dubai',
        scrapedFrom: 'Dubai Land Department',
        verifiedBy: 'Government Record',
        dataSource: 'dld-real'
      });
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
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    const parts = dateStr.split(/[\/\-]/);
    if (parts.length === 3 && parts[2].length === 4) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    return '';
  } catch {
    return '';
  }
}

async function main() {
  console.log('🚀 AQAR DLD CSV Importer — All 22 Fields\n');

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

  // Summary
  const withRooms = transactions.filter(t => t.rooms > 0).length;
  const withParking = transactions.filter(t => t.parking > 0).length;
  const withMetro = transactions.filter(t => t.nearestMetro && t.nearestMetro.length > 2).length;
  const withMall = transactions.filter(t => t.nearestMall && t.nearestMall.length > 2).length;
  const withProject = transactions.filter(t => t.masterProject && t.masterProject.length > 2).length;

  console.log(`📊 Total: ${transactions.length.toLocaleString()} transactions\n`);
  console.log('📋 Field Coverage:');
  console.log(`   Rooms: ${withRooms.toLocaleString()} (${Math.round(withRooms/transactions.length*100)}%)`);
  console.log(`   Parking: ${withParking.toLocaleString()} (${Math.round(withParking/transactions.length*100)}%)`);
  console.log(`   Metro: ${withMetro.toLocaleString()} (${Math.round(withMetro/transactions.length*100)}%)`);
  console.log(`   Mall: ${withMall.toLocaleString()} (${Math.round(withMall/transactions.length*100)}%)`);
  console.log(`   Project: ${withProject.toLocaleString()} (${Math.round(withProject/transactions.length*100)}%)`);

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(transactions, null, 2));
  console.log(`\n✅ Saved ${transactions.length.toLocaleString()} transactions with ALL 22 fields`);
}

main().catch(console.error);