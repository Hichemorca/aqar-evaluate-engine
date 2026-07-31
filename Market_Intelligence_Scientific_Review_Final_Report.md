# AQAR Market Intelligence Engine — Scientific Review & Correction, Final Report

**Scope:** `market-intelligence.html`, `scripts/market-intelligence.js`, and the `data/market-intelligence.json` output they produce.
**Not touched:** UI visual design, CSS, page layout, the Valuation Engine, or any other file.

---

## Files Modified

| File | Change type |
|---|---|
| `scripts/market-intelligence.js` | Full rewrite (190 → 610 lines). Cleaning pipeline (stages 1–2 of the file) is unchanged; every metric downstream of it is new. |
| `market-intelligence.html` | Updated to consume the new data shape (278 lines, up from 139). Same CSS, same color system, same card/table/badge visual language — no new visual components beyond what the corrected methodology required (a period filter dropdown, confidence/warning badges, and a collapsible methodology panel). |

Both files are attached above. Originals were preserved on disk before editing for your own diffing if needed.

---

## Phase 1 — Audit Findings (what was wrong, metric by metric)

| Metric | What it measured (v2.0) | Weakness | 
|---|---|---|
| **"Momentum" (used for Fastest Growing)** | % change between the median price/sqm of the last 30 days and the prior 30 days | Two 30-day snapshots, each requiring only 15 transactions, is a noisy endpoint comparison. It used ~2 months of a district's history and ignored the other 5, and was hard-coded to a 60-day lookback regardless of how much history existed. |
| **"Volatility"** | Cross-sectional coefficient of variation (stdDev ÷ median) of price/sqm across *all* of a district's transactions | This is a measure of price **dispersion at a point in time** (how heterogeneous the properties are), not a measure of how much price **moves over time**. It was mislabeled as volatility and then used directly as the entire Bubble Risk score. |
| **Bubble Risk Score** | `volatility × 2` | A single-variable proxy — exactly what this review was commissioned to fix — built from a metric that wasn't actually measuring price instability at all. |
| **Investment Score** | `priceMomentum×2 + activityRatio − volatility×0.3` | An ungrounded, undocumented linear formula mixing a noisy momentum figure, a raw count ratio, and the same mislabeled dispersion metric. No liquidity, confidence, or valuation-consistency dimension. |
| **Liquidity Index** | `transactionCount ÷ 100 × 10` | A raw count rescaling with no cross-district comparison and no relationship to actual liquidity (time-to-sell, bid-ask spread) — flagged previously in the Architecture Review as conflicting with the Notion-documented ALI definition. |
| **District grouping** | All property types (apartment, villa, office, retail, land) pooled into one "district" series | Not previously identified — found during this review (see Phase 2 below): this pooling created a **composition-mix artifact** that produced a spurious 455%+ "acceleration" reading in at least one mixed-use district, purely from the type mix shifting month to month. |

---

## Phase 2 — Methodology Corrections

### 1. Fastest Growing Areas

**Removed** the hard 60-day dependency entirely. The engine now:
- Builds a **monthly time series** (median price/sqm per month) using the complete available history for each district/type segment.
- Fits an **OLS trend line** on ln(median price) vs. month index, using every qualifying month — not just two endpoints. This is more statistically robust than a naive endpoint-to-endpoint CAGR precisely because it isn't sensitive to noise in any single month.
- Reports **two figures, not one**, and this distinction matters:
  - `observedPeriodGrowthPct` — the actual, non-extrapolated % change over the real observed window. **This is the headline number** used for ranking and display.
  - `annualizedPct` — the OLS slope extrapolated to a 12-month rate, shown only as supplementary context, always alongside its R² and months-used.

**Why not use CAGR as originally suggested:** the available history is **~7 months (Jan 2 – Jul 26, 2026), not a year** — I want to flag this precisely rather than assume, since the brief referenced "approximately one year." Annualizing a 7-month trend to a 12-month rate is an extrapolation regardless of method, and in this dataset it initially produced a district-average "growth" figure of **76%**, which is not a defensible number to put in front of an executive audience. Reporting the real observed change (**~-4% average, given the current buyer's-market data window**) alongside a clearly-labeled trend rate is the more scientifically honest choice, and is what the shipped version does.

**User filtering:** since this is a static-JSON pipeline (no live backend query), "filtering" is implemented by precomputing growth over three standard windows (full history / last 6 months / last 3 months) for every qualifying segment, with a dropdown in the dashboard that switches which window's figures are displayed and re-sorts the table — this satisfies "allow filtering by user" without a live backend.

### 2. High Risk Areas (Bubble Risk)

The old formula (`volatility × 2`) is replaced with a **four-dimension composite**, each independently computed and documented:

| Dimension | Weight | What it captures |
|---|---|---|
| Temporal volatility | 35% | Std. dev. of month-over-month price returns, annualized — a genuine time-series volatility, not the old cross-sectional dispersion |
| Price acceleration | 30% | Whether the most recent 3 months' trend is growing faster than the prior months' trend (only *positive* acceleration counts as risk) |
| Cross-district outlier status | 20% | Z-score of a segment's growth rate relative to all other qualifying segments — catches an anomalous segment even if its own volatility looks moderate |
| Volume instability | 15% | Magnitude of the transaction-count trend (rapid increase or decrease in monthly activity) |

The raw composite is then **scaled by a confidence factor** (floor 50%, ceiling 100%) so that a high score built on thin data cannot register as full-strength risk.

**What was NOT added, and why:** inventory/listing behavior and price-to-rent or price-to-income valuation extremes — both explicitly requested dimensions — are **not implemented**, because no inventory, listing, or rental dataset exists anywhere in the current pipeline. The only available proxy (the consultancy-sourced cap rate/vacancy dataset) was independently flagged in the prior Architecture Review as an unverified, uncited static dataset — using it here to fill the gap would have reintroduced exactly the kind of unsupported assumption this review was commissioned to remove. This is stated as an explicit limitation in the shipped `methodology.bubbleRiskScore.limitations`, not silently omitted.

### 3. Top Investment Districts

Replaced with a documented five-factor composite, each weight justified:

- **Growth 30%** — the primary return driver, and what investors ask for first.
- **Liquidity 25%** — ease of entry/exit; an investment that can't be transacted isn't a realized return.
- **Volatility (inverted) 20%** — risk-adjustment, consistent with the platform's existing Statistical Standards preference for risk-adjusted comparison.
- **Valuation Consistency (inverted) 10%** — a market-maturity/appraisal-reliability proxy; weighted lowest as the least direct investment consideration.
- **Confidence 15%** — a district scoring well on thin data should not outrank a well-covered, moderately-performing one; made an explicit weight rather than a silent gate.

**Rental strength is NOT included** — no rental transaction data exists in the pipeline, and the only proxy (consultancy cap rates) has the same unverified-sourcing problem noted above. **Historical multi-year performance is NOT included** — the available history (~7 months) is too short to assess multi-year consistency. Both are logged as explicit limitations rather than approximated.

---

## Phase 3 — Unsupported Assumptions Removed

- The 60-day hard dependency (replaced with full-history trend fitting).
- The single-variable Bubble Risk formula (replaced with a 4-dimension composite).
- The implicit assumption that all property types in a district behave as one market (see the composition-mix finding below — this was discovered during implementation, not in the original brief, and is arguably the most consequential fix in this review).
- No indicator was fabricated to fill a requested-but-unavailable dimension (inventory, rental strength). Each is explicitly named as unavailable in the shipped `methodology` block rather than estimated.

### An additional finding surfaced during implementation: district/property-type composition mix

While validating the corrected engine against the real data, I found that pooling all property types (apartment, villa, office, retail, land) into a single "district" monthly median created a **composition-mix artifact**: one mixed-use district showed a mechanically spurious **455%+ "acceleration"** purely because its office-vs-apartment transaction mix shifted month to month — offices and apartments do not sell at the same price/sqm, so a shift in *what* sold, not a change in *price*, was being read as extreme price acceleration.

**Correction:** the engine now segments by **district × property type** (e.g. "Business Bay (Apartment)"), matching the granularity already used by the canonical Data Cleaning Methodology's outlier detection. It is also scoped to **residential types only** (apartment, villa, townhouse) — office, retail, land, and warehouse are excluded from this dashboard version, because their platform-wide sample sizes (1,021 / 379 / 7,838 / 6 transactions) are too concentrated in too few districts to support the same monthly-trend approach reliably. A commercial/land-specific Market Intelligence view is logged as a Future Research item rather than approximated here.

A second, smaller anomaly was found and flagged (not silently removed): one segment showed a transaction-count spike roughly 5-8x its normal monthly volume alongside a sharp price collapse in a single month — consistent with a bulk/portfolio sale that the existing procedure-based cleaning filter did not catch. This is now surfaced via an `anomalousMonths` flag in the output (any month exceeding 3x a segment's own average count) rather than corrected in the underlying data, since altering it without further investigation would itself be an unsupported assumption.

---

## Phase 4 — Alignment with AQAR Research Standards

Every indicator's `definition`, `calculation`, `variables`, `assumptions`, and `limitations` is written directly into `market-intelligence.json`'s `methodology` object — the same five-field template used in the Valuation Engine's documentation in the AQAR Research Institute. The dashboard surfaces this through a new "ⓘ Methodology" collapsible panel that renders the JSON's methodology block directly, so the in-app documentation and the underlying data are generated from the same source and cannot drift apart silently.

**Recommended next step (not yet done, pending your confirmation):** promote this `methodology` block into a formal **AQAR Market Intelligence Methodology v1.0** page under the Market Intelligence Program in the Research Institute, the same way the Valuation Engine's methodology was documented — I did not do this automatically this time since the task was scoped to code, but the content is ready to migrate as-is if you'd like it there before the presentation.

---

## Phase 5 — Code Changes Summary

- **`scripts/market-intelligence.js`:** cleaning pipeline unchanged; everything downstream rewritten — monthly time-series construction, OLS trend fitting (shared helper used for both price and volume trends), temporal volatility, valuation dispersion (renamed and correctly scoped), price acceleration, volume trend, a genuine data-derived confidence score, the four-factor Bubble Risk composite, the five-factor Investment Score, district×property-type segmentation, small-sample and anomalous-month transparency flags, and the embedded `methodology` documentation block. No duplicated logic was introduced — the OLS helper, percentile/z-score helpers, and confidence computation are each written once and reused everywhere they're needed.
- **`market-intelligence.html`:** field bindings updated to the new JSON shape; added a period-filter dropdown (Fastest Growing), confidence and small-sample/anomaly badges (all three tables), and a collapsible methodology panel. CSS and page structure otherwise untouched.

---

## Remaining Limitations (stated, not hidden)

1. **~7 months of history, not a year.** Every trend-based figure will become more stable as more months accumulate; nothing in the code assumes a fixed 12-month window, so this improves automatically over time.
2. **No inventory, listing, or rental data exists in the pipeline.** Bubble Risk and Investment Score are both explicitly scoped as *price-and-volume-behavior* indicators, not complete assessments, until this data exists.
3. **Commercial and land assets are out of scope** for this dashboard version, for the sample-size reason described above.
4. **Small-sample segments can still pass the minimum-sample gates yet show large, noisy swings** (e.g. one segment's `priceAccelerationPct` is a real but noisy 944%, driven by 6–19 transactions/month). This is flagged via `smallSampleWarning` rather than hidden, smoothed, or excluded.
5. **The consultancy-sourced cap rate/vacancy dataset remains unverified** (per the prior Architecture Review) and was deliberately not used anywhere in this correction to avoid laundering an unverified estimate into a "corrected" methodology.

## Future Improvements

- Once rental/listing data exists: add rental strength to Investment Score and inventory-behavior/price-to-rent dimensions to Bubble Risk, per the original request.
- Investigate the flagged bulk-sale anomaly at the data-ingestion layer rather than only flagging it downstream.
- As history extends past 12 months, revisit whether `annualizedPct` should become the primary headline figure (once a full year of real, non-extrapolated annual data exists, true CAGR becomes defensible without extrapolation).
- Consider extending the district×property-type segmentation approach to commercial/land assets once sample sizes support it, per the Future Research backlog.
