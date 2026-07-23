// AQAR DXB Interact Data Fetcher — Real Dubai Transactions
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'dld-transactions.json');

// DXB Interact API endpoint (free, no key required)
const DXB_API_URL = 'https://dxbinteract.ae/api/transactions';

async function fetchDXBTransactions() {
  console.log('🔍 Fetching DXB Interact real transactions...');

  const allTransactions = [];

  // Try multiple pages
  for (let page = 1; page <= 5; page++) {
    try {
      console.log(`📄 Page ${page}...`);
      
      const response = await axios.get(DXB_API_URL, {
        params: {
          page: page,
          limit: 50,
          sort: 'date_desc'
        },
        headers: {
          'User-Agent': 'AQAR-Engine/1.0 (market research)',
          'Accept': 'application/json'
        },
        timeout: 15000
      });

      const data = response.data;
      
      if (data && data.transactions && data.transactions.length > 0) {
        const parsed = data.transactions.map(t => ({
          propertyRef: `DXB-${t.id || t.transaction_id || ''}`,
          propertyType: mapDXBType(t.property_type || t.type || ''),
          city: 'dubai',
          district: t.area_name || t.community || t.district || '',
          area: parseFloat(t.area_sqm || t.area || t.size || '0'),
          actualSalePrice: parseFloat(t.price || t.sale_price || t.amount || '0'),
          saleDate: t.date || t.transaction_date || '',
          scrapedFrom: 'DXB Interact',
          verifiedBy: 'Dubai Land Department'
        })).filter(t => t.area > 0 && t.actualSalePrice > 0);

        allTransactions.push(...parsed);
        console.log(`   ✅ ${parsed.length} transactions`);
      } else {
        break; // No more pages
      }
    } catch (error) {
      console.log(`   ⚠️ Page ${page} failed: ${error.message}`);
      break;
    }
  }

  return allTransactions;
}

function mapDXBType(type) {
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

// Fallback: Try direct DLD CSV
async function fetchDLDDirect() {
  console.log('🔍 Trying DLD direct CSV...');

  const urls = [
    'https://www.dubailand.gov.ae/en/open-data/real-estate-transactions-csv/',
    'https://www.dubailand.gov.ae/opendata/realestate/transactions.csv',
    'https://data.dubailand.gov.ae/transactions.csv'
  ];

  for (const url of urls) {
    try {
      console.log(`📡 Trying: ${url}`);
      const response = await axios.get(url, {
        responseType: 'text',
        timeout: 15000,
        headers: { 'User-Agent': 'AQAR-Engine/1.0' }
      });

      const lines = response.data.split('\n').filter(l => l.trim());
      if (lines.length > 1) {
        console.log(`✅ Found CSV with ${lines.length - 1} rows`);
        // Parse CSV similar to original code
        return parseCSV(response.data);
      }
    } catch (e) {
      console.log(`   ❌ Failed: ${e.message}`);
    }
  }

  return [];
}

function parseCSV(csvText) {
  const lines = csvText.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const transactions = [];

  for (let i = 1; i < lines.length; i++) {
    try {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      if (values.length < 5) continue;

      const row = {};
      headers.forEach((h, idx) => { row[h] = values[idx] || ''; });

      const area = parseFloat(row['area_sqm'] || row['area'] || '0');
      const price = parseFloat(row['sale_price'] || row['price'] || row['amount'] || '0');

      if (area > 0 && price > 0) {
        transactions.push({
          propertyRef: `DLD-${i}`,
          propertyType: mapDXBType(row['property_type'] || row['type'] || ''),
          city: 'dubai',
          district: row['area_name'] || row['district'] || row['community'] || '',
          area: area,
          actualSalePrice: price,
          saleDate: row['transaction_date'] || row['date'] || '',
          scrapedFrom: 'Dubai Land Department',
          verifiedBy: 'Government Record'
        });
      }
    } catch (e) {}
  }

  return transactions;
}

async function main() {
  console.log('🚀 AQAR Real Data Fetcher Started\n');

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  let transactions = [];

  // Try DXB Interact first
  console.log('📍 Method 1: DXB Interact API');
  transactions = await fetchDXBTransactions();

  // If DXB Interact fails, try DLD direct
  if (transactions.length === 0) {
    console.log('\n📍 Method 2: DLD Direct CSV');
    transactions = await fetchDLDDirect();
  }

  if (transactions.length > 0) {
    // Filter last 60 days
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000);
    const recent = transactions.filter(t => {
      if (!t.saleDate) return true; // Keep if no date
      const d = new Date(t.saleDate);
      return !isNaN(d.getTime()) ? d >= sixtyDaysAgo : true;
    });

    console.log(`\n📊 Total real transactions: ${transactions.length}`);
    console.log(`📅 Recent (60 days): ${recent.length}`);

    // Summary
    const districts = {};
    recent.forEach(t => {
      if (t.district) districts[t.district] = (districts[t.district] || 0) + 1;
    });

    console.log('\n📋 Top Districts:');
    Object.entries(districts).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([d, c]) => {
      console.log(`   ${d}: ${c}`);
    });

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(recent, null, 2));
    console.log(`\n✅ Saved ${recent.length} real transactions to ${OUTPUT_FILE}`);
  } else {
    console.log('\n❌ No real transactions found from any source.');
    console.log('💡 Tip: Download CSV manually from:');
    console.log('   https://dxbinteract.ae/');
    console.log('   Save as: data/dld-transactions.json');
  }
}

main().catch(console.error);