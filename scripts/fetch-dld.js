// AQAR DLD Data Fetcher — FIXED v2: Land classification + PROP_SB_TYPE_EN
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

      const transValue = parseFloat((row['TRANS_VALUE'] || '0').replace(/,/g, ''));
      const actualArea = parseFloat((row['ACTUAL_AREA'] || row['PROCEDURE_AREA'] || '0').replace(/,/g, ''));
      
      if (transValue <= 0 || actualArea <= 0) continue;

      const subType = row['PROP_SB_TYPE_EN'] || '';
      const mainType = row['PROP_TYPE_EN'] || '';

      transactions.push({
        propertyRef: `DLD-${row['TRANSACTION_NUMBER'] || i}`,
        transactionNumber: row['TRANSACTION_NUMBER'] || '',
        instanceDate: row['INSTANCE_DATE'] || '',
        saleDate: formatDate(row['INSTANCE_DATE'] || ''),
        
        // FIXED v2: If main type is Land, classify as land regardless of sub-type
        propertyType: mapPropertyType(mainType, subType),
        propSubType: subType || mainType,
        usage: row['USAGE_EN'] || '',
        district: row['AREA_EN'] || '',
        area: Math.round(actualArea),
        procedureArea: parseFloat((row['PROCEDURE_AREA'] || '0').replace(/,/g, '')),
        
        actualSalePrice: Math.round(transValue),
        
        rooms: parseInt(row['ROOMS_EN'] || '0') || 0,
        parking: parseInt(row['PARKING'] || '0') || 0,
        
        nearestMetro: row['NEAREST_METRO_EN'] || '',
        nearestMall: row['NEAREST_MALL_EN'] || '',
        nearestLandmark: row['NEAREST_LANDMARK_EN'] || '',
        
        masterProject: row['MASTER_PROJECT_EN'] || '',
        project: row['PROJECT_EN'] || '',
        
        isOffPlan: (row['IS_OFFPLAN_EN'] || '').toLowerCase() === 'yes',
        isFreeHold: (row['IS_FREE_HOLD_EN'] || '').toLowerCase() === 'yes',
        group: row['GROUP_EN'] || '',
        procedure: row['PROCEDURE_EN'] || '',
        
        totalBuyer: parseInt(row['TOTAL_BUYER'] || '0') || 0,
        totalSeller: parseInt(row['TOTAL_SELLER'] || '0') || 0,
        
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

// FIXED v2: Check mainType first — if it's Land, return land immediately
function mapPropertyType(mainType, subType) {
  const main = (mainType || '').toLowerCase();
  const sub = (subType || '').toLowerCase();
  
  // If main type is Land, it's land regardless of sub-type (zoning)
  if (main === 'land') return 'land';
  
  // Otherwise, use sub-type for accurate classification
  if (sub.includes('villa')) return 'villa';
  if (sub.includes('office') || sub.includes('commercial')) return 'office';
  if (sub.includes('retail') || sub.includes('shop')) return 'retail';
  if (sub.includes('warehouse') || sub.includes('industrial') || sub.includes('workshop')) return 'warehouse';
  if (sub.includes('flat') || sub.includes('apartment') || sub.includes('hotel apartment') || sub.includes('hotel room')) return 'apartment';
  if (sub.includes('townhouse') || sub.includes('town')) return 'townhouse';
  
  // Fallback to main type
  if (main === 'building') return 'office';
  if (main === 'unit') return 'apartment';
  
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
  console.log('🚀 AQAR DLD CSV Importer — FIXED v2 (Land + PROP_SB_TYPE_EN)\n');

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

  // Summary by property type
  const typeCount = {};
  transactions.forEach(t => {
    typeCount[t.propertyType] = (typeCount[t.propertyType] || 0) + 1;
  });

  const withProject = transactions.filter(t => t.project && t.project.length > 2).length;

  console.log(`📊 Total: ${transactions.length.toLocaleString()} transactions\n`);
  console.log('📋 By Property Type (FIXED v2):');
  Object.entries(typeCount).sort((a, b) => b[1] - a[1]).forEach(([t, c]) => {
    console.log(`   ${t}: ${c.toLocaleString()}`);
  });
  console.log(`\n📋 With Project: ${withProject.toLocaleString()} (${Math.round(withProject/transactions.length*100)}%)`);

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(transactions, null, 2));
  console.log(`\n✅ Saved ${transactions.length.toLocaleString()} transactions`);
}

main().catch(console.error);