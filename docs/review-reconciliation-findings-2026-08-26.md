# Reconciliation Findings — Claude Review vs Current MIAYAAR Branch

The attached Claude review was performed against an older `main` commit (`49b377f`). The current working branch is `feature/v2.1-property-fields`, HEAD `1f95e32`.

The current project has 78 passing automated tests, not 37 tests with 3 failures. `@netlify/blobs@11.0.1` is declared in `package.json`, present in `package-lock.json`, and resolves successfully. A clean temporary `npm ci --ignore-scripts` completed successfully. However, 1,615 `node_modules` files remain tracked despite `.gitignore`.

Current production verification shows the MIAYAAR title and branding, the Project / Building Name field, and the new `Range` behavior. A live ARJAN test produced `Range: 1,680,000 — 1,868,000 AED`, which is based on the nearest comparable prices bracketing the estimated value. The autocomplete portal is body-level fixed and passes pointer hit-tests.

Still confirmed or partially confirmed: absolute machine-specific paths remain in `scripts/run-fallback-policy-experiment.js`; CI still lacks a clean install and `npm test`; the homepage still fetches the full 26MB DLD transaction file and 27MB accuracy file for lightweight metadata; `scrape.js` still returns `Access-Control-Allow-Origin: *` and uses the optional ScrapingBee key without rate limiting. The public result hides method labels, but when a project is selected it still displays `DLD suggestion` inside Inputs considered. This is a residual public-text issue.

The report’s claims that MIAYAAR branding and Project / Building Name are absent, and that the range is still the old synthetic method range, are stale for the current branch/deployment. The report’s claim that `@netlify/blobs` is missing is also stale; the remaining repository hygiene issue is tracked `node_modules`.
