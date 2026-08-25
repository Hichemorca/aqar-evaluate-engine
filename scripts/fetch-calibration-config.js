const fs = require('fs');
const path = require('path');

const publicUrl = process.env.AQAR_PUBLIC_URL || 'https://aqar-valuation-engine.netlify.app';
const outputFile = path.join(__dirname, '..', 'data', 'active-calibration.json');

async function main() {
  const endpoint = new URL('/api/calibration-config', publicUrl);
  endpoint.searchParams.set('_calibration_fetch', Date.now().toString());
  const response = await fetch(endpoint, { headers: { 'cache-control': 'no-cache' } });
  if (!response.ok) throw new Error(`Calibration API returned HTTP ${response.status}`);
  const payload = await response.json();
  const config = payload.config;
  if (!config || config.schemaVersion !== 1 || !config.propertyTypes || !config.gis) {
    throw new Error('Calibration API returned an invalid configuration');
  }
  fs.writeFileSync(outputFile, JSON.stringify(config, null, 2) + '\n');
  console.log(`✅ Saved active calibration ${config.configId || 'unknown'} to data/active-calibration.json`);
}

main().catch(error => {
  console.error(`❌ Could not fetch active calibration: ${error.message}`);
  process.exitCode = 1;
});
