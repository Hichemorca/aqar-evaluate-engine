# AQAR Calibration Console

## Purpose

`/admin-calibration` is the independent administrator interface for editing AQAR method weights and property-type coefficients. It writes the active configuration to the Netlify Blobs store and creates a versioned history entry on every save.

## Administrator access

Configure one Netlify environment variable before using the Save action:

```text
AQAR_ADMIN_TOKEN=<long-random-private-token>
```

The token is never committed to Git, embedded in the frontend, or returned by the API. The administrator enters it in the console, and the browser sends it only as an Authorization Bearer token to the same-origin API.

The public valuation engine can read the active configuration without the token because weights and coefficients are product configuration, not credentials. The write endpoint and history endpoint require the token.

## Usage

Open `/admin-calibration`, enter the administrator token, and select **Load configuration**. The page displays every supported property type, every method weight, and the coefficient groups for Sales, Income, Cost, DCF, and GIS. Edit the numeric values and press **Save and activate**.

Save is intentionally immediate as requested by the owner. The API validates finite numeric values, rejects negative or greater-than-one method weights, requires at least one positive method weight per property type, ignores unknown configuration keys, writes the active configuration, and records a new `configId` in history.

## Version behavior

The active configuration is loaded by the public valuation engine before a new valuation is enabled. The daily offline/Accuracy workflow fetches the active configuration with cache-busting before evaluation. Each new browser-side or offline valuation stores the active `configId` with its result and trace. Existing local history entries and previously generated valuation results are not rewritten. The configuration is not used to silently recalculate historical results.

## Configuration boundaries

The console controls existing AQAR weights and coefficients only. It does not change method applicability, add property types, introduce MIAYAAR functionality, or create new methodology. Applicability remains governed by `shared/aqar-policy.js`. Any future change to applicability or calculation meaning requires a separate methodology decision record.

## Current defaults

The default configuration is held in `shared/aqar-calibration-defaults.js`. It mirrors the current interactive AQAR values, including Sales, Income, Cost, DCF, View, GIS, vacancy, cap rate, depreciation, rent growth, value growth, discount, and terminal-value parameters. The shared calculation layer applies the existing methods and weights in both browser and offline paths; when a method lacks required data, it is recorded as `NOT_APPLICABLE` rather than represented by zero or fabricated data. Fallback values such as expenses, vacancy, cap rate, construction cost, and land share are recorded as assumptions. If the configuration store is empty or temporarily unavailable, the public engine uses these defaults and logs a warning rather than blocking the public page.

## Operational acceptance checks

A release is accepted when `npm test` passes, the calibration API module and shared calculation layer pass syntax validation, the public valuation page loads the shared defaults or active configuration without stale cache, the offline workflow records the active `configId`, a valid administrator save creates a new version, an invalid weight receives HTTP 400, and a request without the administrator token cannot write or read history.
