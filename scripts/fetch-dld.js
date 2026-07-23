// AQAR DLD Data Fetcher — Dubai Land Department Open Data
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'dld-transactions.json');

// DLD Open Data URL (CSV format)
const DLD_CSV_URL = 'https://www.dubailand.gov.ae/en/open-data/real-estate-transactions-csv/';

function parseDLDCSV(csvText) {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length < 2) {
    console.log('⚠️ Empty or invalid CSV');
    return [];
  }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  console.log(`📋 Found columns: ${headers.join(', ')}`);

  const transactions = [];

  for (let i = 1; i < lines.length; i++) {
    try {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      if (values.length < 5) continue;

      const row = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] || '';
      });

      // Extract key fields (DLD column names vary)
      const area = parseFloat(row['area_sqm'] || row['area'] || row['size'] || '0');
      const price = parseFloat(row['sale_price'] || row['price'] || row['amount'] || row['transaction_value'] || '0');
      const date = row['transaction_date'] || row['date'] || row['sale_date'] || '';
      const district = row['area_name'] || row['district'] || row['location'] || row['community'] || '';
      const propType = row['property_type'] || row['type'] || row['usage'] || '';

      if (area > 0 && price > 0) {
        transactions.push({
          propertyRef: `DLD-${date}-${i}`,
          propertyType: mapDLDType(propType),
          city: 'dubai',
          district: district,
          area: area,
          actualSalePrice: price,
          saleDate: formatDate(date),
          scrapedFrom: 'Dubai Land Department',
          verifiedBy: 'Government Record'
        });
      }
    } catch (e) {
      // Skip malformed rows
    }
  }

  return transactions;
}

function mapDLDType(type) {
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
    // DLD format: DD/MM/YYYY or YYYY-MM-DD
    const parts = dateStr.split(/[\/\-]/);
    if (parts.length === 3) {
      if (parts[2].length === 4) {
        // DD/MM/YYYY
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      } else {
        // YYYY-MM-DD
        return dateStr;
      }
    }
    return new Date(dateStr).toISOString().split('T')[0];
  } catch {
    return '';
  }
}

async function fetchDLDData() {
  console.log('🔍 Fetching Dubai Land Department Open Data...');
  console.log(`📡 URL: ${DLD_CSV_URL}`);

  try {
    const response = await axios.get(DLD_CSV_URL, {
      responseType: 'text',
      timeout: 30000,
      headers: {
        'User-Agent': 'AQAR-Engine/1.0 (market research)',
        'Accept': 'text/csv, text/plain'
      }
    });

    const transactions = parseDLDCSV(response.data);
    console.log(`✅ DLD: ${transactions.length} real transactions found`);

    // Keep only last 60 days
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000);
    const recent = transactions.filter(t => {
      if (!t.saleDate) return false;
      const d = new Date(t.saleDate);
      return d >= sixtyDaysAgo;
    });

    console.log(`📅 Recent (60 days): ${recent.length} transactions`);
    return recent;

  } catch (error) {
    console.log('⚠️ DLD fetch failed:', error.message);
    console.log('💡 Tip: DLD website may have changed. Try: https://dxbinteract.ae/');
    return [];
  }
}

async function main() {
  console.log('🚀 AQAR DLD Data Fetcher Started\n');

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const transactions = await fetchDLDData();

  if (transactions.length > 0) {
    // Summary
    const districts = {};
    const types = {};
    transactions.forEach(t => {
      districts[t.district] = (districts[t.district] || 0) + 1;
      types[t.propertyType] = (types[t.propertyType] || 0) + 1;
    });

    console.log('\n📊 Summary:');
    console.log(`   Total: ${transactions.length} transactions`);
    console.log('\n   By District:');
    Object.entries(districts).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([d, c]) => {
      console.log(`     ${d}: ${c}`);
    });
    console.log('\n   By Type:');
    Object.entries(types).forEach(([t, c]) => {
      console.log(`     ${t}: ${c}`);
    });

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(transactions, null, 2));
    console.log(`\n✅ Saved to ${OUTPUT_FILE}`);
  } else {
    console.log('\n⚠️ No transactions found. Possible reasons:');
    console.log('   1. DLD website structure changed');
    console.log('   2. No transactions in last 60 days');
    console.log('   3. Network issue');
    console.log('\n💡 Alternative: Visit https://dxbinteract.ae/ for manual download');
  }
}

main().catch(console.error);