// AQAR Auto-Fetch: Dubai Land Department Transactions
// Run: node scripts/fetch-transactions.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'fetched-transactions.json');

// قائمة مصادر البيانات
const SOURCES = [
  {
    name: 'Dubai Land Department',
    url: 'https://www.dubailand.gov.ae/en/open-data/real-estate-transactions/',
    type: 'csv'
  },
  {
    name: 'data.gov.ae',
    url: 'https://data.gov.ae/api/3/action/package_search?q=real+estate+transactions',
    type: 'api'
  }
];

async function fetchDLDTransactions() {
  console.log('🔍 Fetching DLD transactions...');
  
  // DLD يوفر ملفات CSV للتحميل. نحاول تحميل أحدث ملف
  try {
    // الرابط المباشر لملف CSV (قد يتغير، يحتاج تحديث دوري)
    const csvUrl = 'https://www.dubailand.gov.ae/en/open-data/real-estate-transactions-csv/';
    
    const response = await axios.get(csvUrl, { 
      responseType: 'text',
      timeout: 30000,
      headers: { 'User-Agent': 'AQAR-Engine/1.0' }
    });

    // تحويل CSV إلى JSON
    const lines = response.data.split('\n').filter(line => line.trim());
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    
    const transactions = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      if (values.length >= 5) {
        const transaction = {};
        headers.forEach((h, idx) => {
          transaction[h] = values[idx] || '';
        });
        transactions.push(transaction);
      }
    }

    return transactions.map(t => normalizeTransaction(t, 'DLD'));
  } catch (error) {
    console.log('⚠️ DLD CSV download failed:', error.message);
    return [];
  }
}

async function fetchDataGovAe() {
  console.log('🔍 Fetching data.gov.ae...');
  
  try {
    const response = await axios.get(
      'https://data.gov.ae/api/3/action/package_search?q=real+estate+transactions',
      { timeout: 15000 }
    );
    
    const datasets = response.data?.result?.results || [];
    const transactions = [];
    
    for (const dataset of datasets.slice(0, 3)) {
      for (const resource of dataset.resources) {
        if (resource.format?.toLowerCase() === 'csv' && resource.url) {
          try {
            const csvResp = await axios.get(resource.url, { 
              responseType: 'text',
              timeout: 15000 
            });
            const lines = csvResp.data.split('\n').filter(l => l.trim());
            // Parse similar to DLD
            // ... (نفس منطق تحويل CSV)
          } catch (e) {
            console.log(`⚠️ Failed to download ${resource.url}`);
          }
        }
      }
    }
    
    return transactions;
  } catch (error) {
    console.log('⚠️ data.gov.ae fetch failed:', error.message);
    return [];
  }
}

function normalizeTransaction(t, source) {
  // توحيد أسماء الحقول من مصادر مختلفة
  const district = t['area_name'] || t['district'] || t['location'] || 'Unknown';
  const propertyType = t['property_type'] || t['type'] || 'apartment';
  const area = parseFloat(t['area_sqm'] || t['area'] || t['size'] || '0');
  const price = parseFloat(t['sale_price'] || t['price'] || t['amount'] || '0');
  const date = t['transaction_date'] || t['date'] || t['sale_date'] || '';
  
  if (area > 0 && price > 0) {
    return {
      propertyRef: `${source}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      propertyType: mapPropertyType(propertyType),
      city: 'dubai',
      district: district,
      area: area,
      actualSalePrice: price,
      saleDate: formatDate(date),
      scrapedFrom: source
    };
  }
  return null;
}

function mapPropertyType(type) {
  const t = type.toLowerCase();
  if (t.includes('villa')) return 'villa';
  if (t.includes('office') || t.includes('commercial')) return 'office';
  if (t.includes('retail') || t.includes('shop')) return 'retail';
  if (t.includes('land') || t.includes('plot')) return 'land';
  if (t.includes('warehouse')) return 'warehouse';
  return 'apartment';
}

function formatDate(dateStr) {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  try {
    const d = new Date(dateStr);
    return d.toISOString().split('T')[0];
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

async function main() {
  console.log('🚀 AQAR Auto-Fetch Started');
  
  // إنشاء مجلد data إذا لم يكن موجوداً
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  
  let allTransactions = [];
  
  // 1. DLD
  const dldData = await fetchDLDTransactions();
  allTransactions = allTransactions.concat(dldData.filter(Boolean));
  
  // 2. data.gov.ae
  const govData = await fetchDataGovAe();
  allTransactions = allTransactions.concat(govData.filter(Boolean));
  
  // إذا لم نجد بيانات حقيقية، استخدم البيانات المولدة للمرحلة الانتقالية
  if (allTransactions.length < 10) {
    console.log('⚠️ Insufficient real data. Generating supplementary data...');
    const generated = generateSampleData(30);
    allTransactions = allTransactions.concat(generated);
  }
  
  // إزالة التكرار
  const unique = [];
  const seen = new Set();
  for (const t of allTransactions) {
    const key = `${t.district}-${t.area}-${t.actualSalePrice}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(t);
    }
  }
  
  // حفظ
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(unique, null, 2));
  console.log(`✅ Saved ${unique.length} transactions to ${OUTPUT_FILE}`);
}

function generateSampleData(count) {
  const districts = ['Dubai Marina', 'Business Bay', 'Jumeirah Village Circle', 'Downtown Dubai', 'Palm Jumeirah', 'Arabian Ranches'];
  const types = ['apartment', 'villa', 'office'];
  const data = [];
  
  for (let i = 0; i < count; i++) {
    const type = types[Math.floor(Math.random() * types.length)];
    const district = districts[Math.floor(Math.random() * districts.length)];
    const sqm = type === 'villa' ? Math.floor(Math.random() * 300) + 180 : Math.floor(Math.random() * 120) + 50;
    const pricePerSqm = 4000 + Math.floor(Math.random() * 8000);
    const daysAgo = Math.floor(Math.random() * 60);
    
    data.push({
      propertyRef: `GEN-${Date.now()}-${i}`,
      propertyType: type,
      city: 'dubai',
      district: district,
      area: sqm,
      actualSalePrice: pricePerSqm * sqm,
      saleDate: new Date(Date.now() - daysAgo * 86400000).toISOString().split('T')[0],
      scrapedFrom: 'Generated (No live data)'
    });
  }
  return data;
}

main().catch(console.error);