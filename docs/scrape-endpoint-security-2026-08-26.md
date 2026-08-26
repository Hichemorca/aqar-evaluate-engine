# Legacy Scrape Endpoint Security — 2026-08-26

## Finding

The current public valuation flow does not call `netlify/functions/scrape.js`. The homepage calls `dld-lookup` for comparable market data and `fetch-osm` for GIS facilities. The scheduled Accuracy workflow also does not invoke `scrape.js`. The endpoint therefore appears to be a legacy path from the perspective of the current product flow.

Before this change, `scrape.js` returned `Access-Control-Allow-Origin: *` and could use the optional `SCRAPINGBEE_KEY` without endpoint-level rate limiting. That combination exposed a paid scraping capability to arbitrary callers.

## Action

The handler now requires `SCRAPE_ENDPOINT_ENABLED=true` before processing any request. The default behavior is disabled and returns HTTP `410 Gone` with `Cache-Control: no-store`. The public wildcard CORS header was removed. Re-enabling the endpoint remains possible, but only after a separate access-control and rate-limiting review.

## Verification

The new unit tests cover disabled POST and OPTIONS requests. The full suite passed 84/84 tests. Node syntax validation, inline JavaScript validation, and `git diff --check` passed. The production endpoint returned HTTP 410 and did not include `Access-Control-Allow-Origin`.

## Scope protection

No valuation formula, calibration, weights, fallback policy, shadow multiplier, Accuracy artifact, DLD data, or active frontend request path was changed.
