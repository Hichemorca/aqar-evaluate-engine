const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const baseURL = process.env.MIAYAAR_BASE_URL || 'http://127.0.0.1:8765/';
(async () => {
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
const page = await context.newPage();
let osmRequests = 0;

await page.route('**/.netlify/functions/fetch-osm*', async route => {
  osmRequests += 1;
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ pois: [{ type: 'school', name: 'Mock School', lat: 25.2049, lng: 55.2709, distance: 0.1 }] })
  });
});

try {
  await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.locator('#btnLoadFacilities').waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForFunction(() => !document.querySelector('#btnLoadFacilities')?.disabled, null, { timeout: 15_000 });
  assert.equal(osmRequests, 0, 'GIS must not load before user action');

  await page.locator('#districtInput').fill('International City PH 2 & 3');
  await page.locator('#districtAutocomplete .item', { hasText: 'INTERNATIONAL CITY PH 2 & 3' }).first().click();
  await page.waitForTimeout(300);
  assert.equal(osmRequests, 0, 'District selection must not trigger GIS');

  await page.locator('#btnLoadFacilities').click();
  await page.locator('#gisLoadStatus').waitFor({ state: 'visible' });
  await page.waitForFunction(() => /Loaded 1 nearby facilities/.test(document.querySelector('#gisLoadStatus')?.textContent || ''), null, { timeout: 15_000 });
  assert.equal(osmRequests, 1, 'GIS must load once after button action');
  assert.equal(await page.locator('#btnLoadFacilities').isDisabled(), false, 'button must re-enable after load');
  assert.equal(await page.locator('#gisResult').isVisible(), true, 'facility result must be visible');
  const resultBox = await page.locator('#gisResult').boundingBox();
  const mapBox = await page.locator('#gisMap').boundingBox();
  assert.ok(resultBox && mapBox && resultBox.y > mapBox.y, 'facility result must be below map');
  console.log('Manual GIS flow: PASS — no automatic request, one request after button, result below map');
} finally {
  await context.close();
  await browser.close();
}
})().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
