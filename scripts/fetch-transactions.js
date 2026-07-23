// AQAR Auto-Fetch: Dubai Land Department Transactions
// Run: node scripts/fetch-transactions.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'fetched-transactions.json');

async function fetchDLDTransactions() {
  console.log('🔍 Fetching DLD transactions...');
  
  try {
    const csvUrl = 'https://www.dubailand.gov.ae/en/open-data/real-estate-transactions-csv/';
    
    const response = await axios.get(csvUrl, { 
      responseType: 'text',
      timeout: 30000,
      headers: { 'User-Agent': 'AQAR-Engine/1.0' }
    });

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
            const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
            
            for (let i = 1; i < lines.length; i++) {
              const values = lines[i].split(',').map(v => v.trim());
              if (values.length >= 5) {
                const transaction = {};
                headers.forEach((h, idx) => {
                  transaction[h] = values[idx] || '';
                });
                transactions.push(normalizeTransaction(transaction, 'data.gov.ae'));
              }
            }
          } catch (e) {
            console.log(`⚠️ Failed to download ${resource.url}`);
          }
        }
      }
    }
    
    return transactions.filter(Boolean);
  } catch (error) {
    console.log('⚠️ data.gov.ae fetch failed:', error.message);
    return [];
  }
}

function normalizeTransaction(t, source) {
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

function generateSampleData(count) {
  // Real market prices per district (AED/sqm) - matches Valuation Engine data
  const districtPrices = {
    'Dubai Marina': { apt: 11850, villa: 14200, townhouse: 12500, office: 10500, retail: 13500 },
    'Palm Jumeirah': { apt: 16500, villa: 22000, townhouse: 18000, office: 12000, retail: 18000 },
    'Downtown Dubai': { apt: 13200, villa: 18000, townhouse: 15500, office: 12500, retail: 20000 },
    'Business Bay': { apt: 9200, villa: 12000, townhouse: 10500, office: 8800, retail: 11000 },
    'Jumeirah Village Circle': { apt: 6200, villa: 7200, townhouse: 6800, office: 5500, retail: 7000 },
    'Jumeirah Lake Towers': { apt: 7200, villa: 8500, townhouse: 7800, office: 6800, retail: 8200 },
    'Dubai Hills Estate': { apt: 8200, villa: 9500, townhouse: 8800, office: 7500, retail: 9500 },
    'Arabian Ranches': { apt: 6500, villa: 7500, townhouse: 7000, office: 5200, retail: 6800 },
    'Emirates Hills': { apt: 9500, villa: 14000, townhouse: 11500, office: 8500, retail: 12000 },
    'Emaar Beachfront': { apt: 14500, villa: 18500, townhouse: 16000, office: 11000, retail: 16000 },
    'Dubai Creek Harbour': { apt: 8800, villa: 11000, townhouse: 9800, office: 8200, retail: 10500 },
    'Al Barsha': { apt: 5500, villa: 6500, townhouse: 6000, office: 4800, retail: 6200 },
    'The Springs': { apt: 6500, villa: 7500, townhouse: 7000, office: 5200, retail: 6800 },
    'The Meadows': { apt: 7000, villa: 8200, townhouse: 7600, office: 5500, retail: 7200 },
    'Deira': { apt: 3500, villa: 4200, townhouse: 3800, office: 3200, retail: 4500 },
    'Bur Dubai': { apt: 4000, villa: 4800, townhouse: 4400, office: 3600, retail: 5200 },
    'Damac Hills': { apt: 5800, villa: 6800, townhouse: 6300, office: 4800, retail: 6500 },
    'Mirdif': { apt: 4500, villa: 5500, townhouse: 5000, office: 4000, retail: 5000 },
    'Al Furjan': { apt: 5000, villa: 6000, townhouse: 5500, office: 4200, retail: 5500 },
    'Discovery Gardens': { apt: 3800, villa: 4500, townhouse: 4200, office: 3200, retail: 4200 },
    'Motor City': { apt: 5200, villa: 6200, townhouse: 5800, office: 4400, retail: 5800 },
    'Dubai Sports City': { apt: 4800, villa: 5800, townhouse: 5300, office: 4200, retail: 5200 },
    'Dubai Silicon Oasis': { apt: 5000, villa: 6000, townhouse: 5500, office: 4500, retail: 5500 },
    'International City': { apt: 3200, villa: 4000, townhouse: 3600, office: 2800, retail: 3800 },
    'Al Nahda': { apt: 3400, villa: 4000, townhouse: 3700, office: 3000, retail: 3800 }
  };
  
  const districts = Object.keys(districtPrices);
  const types = ['apartment', 'apartment', 'apartment', 'villa', 'townhouse', 'office', 'retail'];
  const data = [];
  
  for (let i = 0; i < count; i++) {
    const district = districts[Math.floor(Math.random() * districts.length)];
    const type = types[Math.floor(Math.random() * types.length)];
    const prices = districtPrices[district];
    
    let basePrice = prices.apt;
    if (type === 'villa') basePrice = prices.villa;
    else if (type === 'townhouse') basePrice = prices.townhouse;
    else if (type === 'office') basePrice = prices.office;
    else if (type === 'retail') basePrice = prices.retail;
    
    const variation = 0.92 + Math.random() * 0.16;
    const pricePerSqm = Math.round(basePrice * variation);
    
    let sqm;
    switch(type) {
      case 'villa': sqm = Math.floor(Math.random() * 300) + 180; break;
      case 'townhouse': sqm = Math.floor(Math.random() * 200) + 120; break;
      case 'office': sqm = Math.floor(Math.random() * 350) + 80; break;
      case 'retail': sqm = Math.floor(Math.random() * 150) + 40; break;
      default: sqm = Math.floor(Math.random() * 120) + 50;
    }
    
    const daysAgo = Math.floor(Math.random() * 60);
    
    data.push({
      propertyRef: `GEN-${Date.now()}-${i}`,
      propertyType: type,
      city: 'dubai',
      district: district,
      area: sqm,
      actualSalePrice: pricePerSqm * sqm,
      saleDate: new Date(Date.now() - daysAgo * 86400000).toISOString().split('T')[0],
      scrapedFrom: 'Market Data (Estimated)'
    });
  }
  return data;
}

async function main() {
  console.log('🚀 AQAR Auto-Fetch Started');
  
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  
  let allTransactions = [];
  
  const dldData = await fetchDLDTransactions();
  allTransactions = allTransactions.concat(dldData.filter(Boolean));
  
  const govData = await fetchDataGovAe();
  allTransactions = allTransactions.concat(govData.filter(Boolean));
  
  if (allTransactions.length < 200) {
    const needed = 200 - allTransactions.length;
    console.log(`⚠️ Insufficient real data (${allTransactions.length}). Generating ${needed} supplementary records...`);
    const generated = generateSampleData(needed);
    allTransactions = allTransactions.concat(generated);
  }
  
  const unique = [];
  const seen = new Set();
  for (const t of allTransactions) {
    const key = `${t.district}-${t.area}-${Math.round(t.actualSalePrice / 1000)}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(t);
    }
  }
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(unique, null, 2));
  console.log(`✅ Saved ${unique.length} transactions to ${OUTPUT_FILE}`);
}

main().catch(console.error);