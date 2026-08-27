const assert = require('node:assert/strict');
const { chromium, devices } = require('playwright');

const baseURL = process.env.MIAYAAR_BASE_URL || 'https://aqar-valuation-engine.netlify.app/';
const normalizeText = value => String(value || '').replace(/\s+/g, ' ').trim();

const scenarios = [
  { name: 'Android Chrome emulation', device: 'Pixel 5' },
  { name: 'iPhone Safari emulation', device: 'iPhone 13' }
];

async function expectVisible(page, selector) {
  await page.locator(selector).waitFor({ state: 'visible', timeout: 15_000 });
}

async function runScenario({ name, device }) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ...devices[device], locale: 'en-US' });
  const page = await context.newPage();
  const requests = [];
  page.on('request', request => requests.push(`${request.method()} ${request.url()}`));

  try {
    await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    assert.ok(page.viewportSize().width <= 430, `${name}: expected mobile viewport`);
    await expectVisible(page, '#propType');
    await expectVisible(page, '#gisMap');
    await page.locator('#districtCount').waitFor({ state: 'visible', timeout: 15_000 });
    await page.waitForFunction(() => /districts available/.test(document.querySelector('#districtCount')?.textContent || ''), null, { timeout: 15_000 });
    assert.equal(await page.locator('#observationConsent').isChecked(), false, `${name}: consent must be off by default`);

    await page.selectOption('#propType', 'land');
    await expectVisible(page, '#plotArea');
    assert.equal(await page.locator('#bedrooms').isVisible(), false, `${name}: bedrooms must be hidden for land`);

    await page.locator('#districtInput').fill('International City PH 2 & 3');
    const districtSuggestion = page.locator('#districtAutocomplete .item', { hasText: 'INTERNATIONAL CITY PH 2 & 3' }).first();
    await districtSuggestion.waitFor({ state: 'visible', timeout: 15_000 });
    await districtSuggestion.click();
    assert.equal(await page.locator('#selectedDistrict').inputValue(), 'INTERNATIONAL CITY PH 2 & 3');

    await page.selectOption('#propType', 'apartment');
    await expectVisible(page, '#projectBuildingInput');
    await page.locator('#projectBuildingInput').fill('AL HELAL');
    const projectSuggestion = page.locator('#projectBuildingAutocomplete .item', { hasText: 'AL HELAL AL ZAHABY 2' }).first();
    await projectSuggestion.waitFor({ state: 'visible', timeout: 15_000 });
    await projectSuggestion.click();
    assert.equal(normalizeText(await page.locator('#projectBuildingInput').inputValue()), 'AL HELAL AL ZAHABY 2');

    await page.locator('#avgPriceSqm').waitFor({ state: 'visible' });
    await page.locator('#btnScrape').click();
    await page.waitForFunction(() => document.querySelector('#avgPriceSqm')?.value && document.querySelector('#recentSalesCount')?.value, null, { timeout: 30_000 });
    assert.ok(Number(await page.locator('#avgPriceSqm').inputValue()) > 0, `${name}: market price should load`);
    assert.ok(Number(await page.locator('#recentSalesCount').inputValue()) > 0, `${name}: comparable count should load`);

    await page.selectOption('#bedrooms', '2');
    await page.locator('#yearBuilt').fill('2020');
    await page.selectOption('#condition', 'good');
    await page.locator('#area').fill('120');
    await page.locator('#btnScrape').click();
    await page.waitForFunction(() => document.querySelector('#avgPriceSqm')?.value && document.querySelector('#recentSalesCount')?.value, null, { timeout: 30_000 });
    await page.locator('#btnValuate').click();
    await page.locator('#resultSection .result-card').waitFor({ state: 'visible', timeout: 30_000 });
    const resultText = await page.locator('#resultSection').innerText();
    assert.match(resultText, /Estimated Market Value/i);
    assert.match(resultText, /Why this valuation/i);
    assert.doesNotMatch(resultText, /Range|\bDLD\b|Valuation Methods|Methods Used/);
    assert.equal(await page.locator('#observationConsent').isChecked(), false, `${name}: consent must stay off`);
    assert.equal(requests.some(request => request.includes('valuation-observation')), false, `${name}: no observation request without consent`);

    console.log(`${name}: PASS — viewport=${page.viewportSize().width}x${page.viewportSize().height}, comparables=${await page.locator('#recentSalesCount').inputValue()}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

(async () => {
  for (const scenario of scenarios) await runScenario(scenario);
})().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
