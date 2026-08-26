# Summary Performance Live Verification — 2026-08-26

The production page was tested after deployment `6a8e9c06469558ac1ef376e8`.

The homepage loaded `data/district-list.json`, `data/project-building-summary.json`, and `data/accuracy-summary.json`. It did not load `data/dld-transactions.json` or `data/accuracy-data.json` during the initial page load.

The live UI displayed `204 districts available`, `85.2` accuracy, and `8,221` evaluated records. The ARJAN project context returned 45 project suggestions, with `2020 Marquis` present, and `getProjectEvidence('2020 Marquis')` returned count 7 and `verified: true`. The client-side `dldTransactionsCache` remained empty, confirming that the full DLD transaction file was not downloaded to build project suggestions.

Current summary sizes are approximately 4.6KB for the district list, 180.7KB for project suggestions/evidence counts, and 226 bytes for Accuracy metadata, versus approximately 26MB for the full DLD file and 27MB for the full Accuracy file.
