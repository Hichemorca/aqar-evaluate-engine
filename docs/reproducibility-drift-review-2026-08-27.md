# PR-01 — Reproducibility and Historical Date-Drift Review

**Date:** 27 August 2026  
**Mode:** Read-only isolated replay  
**Scope:** Re-running the existing evaluator in temporary copies with a fixed system date. No official artifact, DLD record, evaluator source, calibration value, or production workflow was changed.

## Executive conclusion

The evaluator is **repeatable when the source data, source code, calibration, and fixed evaluation date are identical**. Two isolated runs at `2026-10-24T00:00:00.000Z` produced byte-identical Accuracy and market artifacts, with zero valuation or metric differences.

The evaluator is **not invariant to the evaluation date**. When the same DLD source and evaluator were replayed at different fixed dates, the full market artifact contained 23,000 common records and approximately 59.7% of their valuations changed. The mean absolute valuation difference was AED 80,214.05, while the largest observed difference was AED 23,133,523. The mean absolute error difference was 5.096 percentage points, with a maximum of 1,713.9 percentage points in an extreme record.

This confirms a real reproducibility risk caused by date-sensitive weighting. It does **not** justify changing the weighting formula immediately. The next safe step is to introduce a date parameter or a replay harness into an isolated shadow experiment, then validate the chosen policy with rolling-origin results before any production change.

## Experiment design

The harness copied the evaluator runtime, shared modules, and data artifacts into a fresh temporary directory for every run. It injected a fixed `Date` implementation into the child process and executed the existing `scripts/evaluate-and-save.js` there. The resulting `market-data.json` and `accuracy-data.json` were read from the temporary directory only.

The latest valid DLD sale date in the current source was `2026-07-26`. The experiment used three reference dates:

| Replay date | Purpose |
|---|---|
| 2026-07-27 | One day after the latest source sale date |
| 2026-10-24 | Repeated-date control and intermediate reference |
| 2027-07-26 | One year after the latest source sale date |

The **market artifact** was used for pure date-drift comparison because it contains the full cleaned market universe. The Accuracy artifact was reported separately because its production logic intentionally applies a rolling 120-day evaluation window.

## Results

### Same-date repeatability

Both runs at `2026-10-24T00:00:00.000Z` were identical.

| Artifact | Common records | Changed records | Mean valuation delta | Max valuation delta | Artifact hash equality |
|---|---:|---:|---:|---:|---|
| Full market | 23,000 | 0 | AED 0 | AED 0 | Yes |
| 120-day Accuracy | 3,104 | 0 | AED 0 | AED 0 | Yes |

This is evidence that the fixed-date harness is deterministic for the current source tree and data snapshot.

### Date-sensitive drift in the full market artifact

| Comparison | Common records | Changed records | Changed rate | Mean absolute valuation delta | Max absolute valuation delta | Mean absolute error delta |
|---|---:|---:|---:|---:|---:|---:|
| 2026-10-24 vs 2026-07-27 | 23,000 | 13,741 | 59.7435% | AED 80,214.05 | AED 23,133,523 | 5.096 pp |
| 2026-10-24 vs 2027-07-26 | 23,000 | 13,751 | 59.7870% | AED 47,815.93 | AED 12,295,069 | 1.710 pp |

The different-date comparison changes the current-date input used by age-based comparable weighting. The evaluator also has a floor of `0.15` for old sales, so the magnitude and direction of the drift are not monotonic across all records.

### Accuracy-window caveat

The 120-day Accuracy output is not a pure weighting comparison because its record universe changes with the fixed date. In the tested comparison, the `2026-10-24` run and the `2026-07-27` run had 3,104 common records, while the total-record delta was 7,956. That difference is primarily a **window-membership effect**, not evidence that 7,956 common valuations drifted.

Accordingly, the market artifact is the correct evidence for date-sensitive valuation drift, while the Accuracy-window result should not be used alone to quantify model deterioration.

## Interpretation and classification

| Observation | Classification | Decision |
|---|---|---|
| Same fixed date produces identical artifacts | Deterministic under controlled replay | PASS |
| Different dates change many full-market valuations | Reproducibility risk from current-date weighting | Confirmed risk; no immediate production change |
| Accuracy record count changes between dates | Expected rolling-window behavior | Do not interpret as pure valuation drift |
| Extreme drift in a small number of records | Performance/data-semantics review candidate | Do not exclude, cap, or alter records |
| Official files remain unchanged | Experiment isolation safeguard | PASS |

## Safeguards verified

The official `data/accuracy-data.json`, `data/dld-transactions.json`, and `data/accuracy-diagnostics.json` hashes remained unchanged. The harness wrote outputs only to temporary directories and this new diagnostic report. No records were excluded or capped, no calibration was saved, and no production workflow was executed.

## Recommendation

Do not change the production weighting formula during the pilot. Treat the current evaluator as **repeatable only when an evaluation date is fixed**. Before broad launch, implement and validate one of the following in an isolated PR:

1. a fixed `asOfDate` parameter used by the historical evaluator;
2. a replay-only date injection that is explicit in the artifact metadata; or
3. a formally approved policy that defines how historical Accuracy should be regenerated.

Any candidate change must be compared with the current evaluator over the same record universe, include rolling-origin validation, report both valuation drift and Accuracy-window membership separately, and receive explicit approval before affecting production Accuracy or calibration.

## Reproduction command

```bash
node scripts/reproducibility-drift.js --output /tmp/pr01-reproducibility-drift.json
```

The command is read-only with respect to official artifacts. It creates isolated temporary evaluator copies and writes only the requested report output.

## References

[1]: https://github.com/Hichemorca/aqar-evaluate-engine "MIAYAAR source repository"
[2]: https://aqar-valuation-engine.netlify.app/ "MIAYAAR production site"
[3]: https://github.com/Hichemorca/aqar-evaluate-engine/blob/main/scripts/evaluate-and-save.js "Current Accuracy evaluator"
