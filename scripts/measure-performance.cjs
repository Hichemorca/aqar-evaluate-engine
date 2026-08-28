const { chromium, devices } = require('playwright');

const baseURL = process.env.MIAYAAR_BASE_URL || 'https://miayaar-dxb.netlify.app/';
const runs = Number(process.env.PERF_RUNS || 3);
const scenarios = [
  { name: 'desktop', context: { viewport: { width: 1440, height: 900 } } },
  { name: 'mobile', context: { ...devices['iPhone 13'] } }
];

async function measureScenario(scenario) {
  const browser = await chromium.launch({ headless: true });
  const values = [];
  try {
    for (let run = 0; run < runs; run += 1) {
      const context = await browser.newContext({ ...scenario.context, locale: 'en-US' });
      const page = await context.newPage();
      const requests = new Map();
      page.on('request', request => {
        if (/fetch-osm|overpass-api|overpass\.kumi|overpass\.private/.test(request.url())) requests.set(request.url(), { start: Date.now() });
      });
      page.on('requestfinished', request => {
        const item = requests.get(request.url());
        if (item) item.end = Date.now();
      });
      const navigationStart = Date.now();
      await page.goto(baseURL, { waitUntil: 'load', timeout: 45_000 });
      await page.waitForFunction(() => document.querySelector('#gisMap')?.classList.contains('leaflet-container'), null, { timeout: 15_000 }).catch(() => {});
      const timing = await page.evaluate(() => {
        const entry = performance.getEntriesByType('navigation')[0];
        return {
          ttfb: entry.responseStart,
          domContentLoaded: entry.domContentLoadedEventEnd,
          load: entry.loadEventEnd,
          mapVisible: Boolean(document.querySelector('#gisMap.leaflet-container'))
        };
      });
      const gisTimings = [...requests.values()].filter(item => item.end).map(item => item.end - item.start);
      values.push({ run: run + 1, ...timing, firstGISRequest: gisTimings[0] ?? null, elapsedToLoadWallClock: Date.now() - navigationStart });
      await context.close();
    }
  } finally {
    await browser.close();
  }
  return { scenario: scenario.name, baseURL, runs: values };
}

(async () => {
  const results = [];
  for (const scenario of scenarios) results.push(await measureScenario(scenario));
  console.log(JSON.stringify({ measuredAt: new Date().toISOString(), results }, null, 2));
})().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
