const assert = require('node:assert/strict');
const { chromium, devices } = require('playwright');

const baseURL = process.env.MIAYAAR_BASE_URL || 'https://aqar-valuation-engine.netlify.app/';
const pages = [
  { name: 'Valuation', path: '/', marker: '#propType' },
  { name: 'Accuracy Dashboard', path: '/accuracy-dashboard', marker: '#main-content' },
  { name: 'Market Intelligence', path: '/market-intelligence', marker: '#main-content' },
  { name: 'Data Export', path: '/export', marker: '#main-content', exportButtons: true },
  { name: 'Calibration', path: '/calibration', marker: '#main-content' }
];

async function runPage(browser, definition) {
  const context = await browser.newContext({ ...devices['iPhone 13'], locale: 'en-US' });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const firstPartyFailures = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => {
    if (request.url().startsWith(new URL(baseURL).origin)) {
      firstPartyFailures.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText || 'failed'}`);
    }
  });

  try {
    const response = await page.goto(new URL(definition.path, baseURL).href, {
      waitUntil: 'commit',
      timeout: 30_000
    });
    assert.equal(response?.status(), 200, `${definition.name}: expected HTTP 200`);
    assert.ok(page.viewportSize().width <= 430, `${definition.name}: expected mobile viewport`);
    await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => {});
    await page.locator(definition.marker).first().waitFor({ state: 'visible', timeout: 15_000 });
    await page.waitForTimeout(750);
    if (definition.exportButtons && (process.env.MIAYAAR_EXPECT_EXPORT_DOWNLOADS === '1' || await page.locator('#exportCsvButton').count())) {
      await page.waitForFunction(() => /transactions loaded/.test(document.querySelector('#stats')?.textContent || ''), null, { timeout: 15_000 });
      for (const [selector, filename] of [['#exportCsvButton', 'miayaar-accuracy-data.csv'], ['#exportJsonButton', 'miayaar-accuracy-data.json']]) {
        const downloadPromise = page.waitForEvent('download', { timeout: 15_000 });
        await page.locator(selector).click();
        const download = await downloadPromise;
        assert.equal(download.suggestedFilename(), filename, `Data Export: unexpected filename for ${selector}`);
      }
    }

    const layout = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth
    }));
    assert.ok(layout.documentWidth <= layout.innerWidth + 1, `${definition.name}: document overflow ${layout.documentWidth}px > ${layout.innerWidth}px`);
    assert.ok(layout.bodyWidth <= layout.innerWidth + 1, `${definition.name}: body overflow ${layout.bodyWidth}px > ${layout.innerWidth}px`);
    assert.deepEqual(pageErrors, [], `${definition.name}: uncaught page errors`);
    assert.deepEqual(firstPartyFailures, [], `${definition.name}: first-party request failures`);
    assert.deepEqual(consoleErrors, [], `${definition.name}: console errors`);
    console.log(`${definition.name}: PASS — ${layout.innerWidth}px viewport, no horizontal overflow`);
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const definition of pages) await runPage(browser, definition);
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
