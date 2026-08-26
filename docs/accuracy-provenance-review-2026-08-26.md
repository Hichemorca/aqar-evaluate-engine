# Accuracy Provenance Review — 2026-08-26

## Conclusion

The current official Accuracy artifact is backed by the eligible DLD dataset. All 8,221 Accuracy records have a `propertyRef` that exists in `data/dld-transactions.json`, and zero Accuracy records were missing from the DLD reference set.

The current distributions are consistent across the official records: `dataSource = dld-real-cleaned`, `scrapedFrom = Dubai Land Department`, `verifiedBy = Government Record`, and `evidenceStatus = eligible` for all 8,221 records. No record contained `random`, `synthetic`, or `estimated` markers.

## Legacy and experimental paths

`netlify/functions/scrape-sold.js` does not manufacture records. Its verified-source adapter is deliberately unconfigured and returns unavailable-source behavior instead of fabricating Accuracy data. `scripts/fetch-transactions.js` is a separate legacy/demo generator that writes `data/fetched-transactions.json`; it contains randomized estimated values but is not referenced by the official update workflow and does not write `dld-transactions.json` or `accuracy-data.json`. The workflow uses `scripts/fetch-dld.js` and `scripts/evaluate-and-save.js` instead.

`netlify/functions/scrape.js` also contains a legacy synthetic fallback, but the endpoint is disabled by default in production and is not part of the current valuation flow.

## Protection added

Added provenance regression tests that verify Accuracy records map to DLD records, carry the expected verified source fields, contain no synthetic markers, and that the official workflow does not invoke the legacy generator.

## Verification

The complete test suite passed 88/88 tests. No Accuracy artifact or valuation logic was regenerated or changed in this review.
