# AQAR live smoke-test report — 25 August 2026

## Executive result

The public AQAR site loaded successfully and the evidence-state behavior was verified against the deployed Netlify site. The final deployed build is `fb9931a`. No administrator action, calibration Save, payment, or sensitive account operation was performed.

| Scenario | Build verified | Result | Status |
|---|---|---|---|
| Dubai Marina apartment, 120 sqm, sufficient DLD evidence | `fb9931a` | 82 comparables, `district_size`, 60 days, high confidence; valuation AED 2,566,685 remained available. | PASS |
| Sobha Heartland land, 745.86 sqm, limited evidence | `fed1c85` | 6 comparables, `district_size`, 180 days, medium confidence; the UI displayed `Limited DLD evidence` and the review warning. | PASS |
| Unknown test district without DLD evidence | `fb9931a` | The UI displayed `Insufficient DLD evidence`; no fallback price was invented. | PASS |
| No DLD evidence with annual rent and expenses | `fb9931a` | Income-based value AED 1,047,619 was produced from available non-sales methods; the result explicitly showed zero DLD comparables and unavailable DLD confidence. | PASS |
| Previous result after changing the property and starting a new lookup | `fed1c85` | The stale previous valuation was cleared before the new lookup/result flow. | PASS |

## Notes

The limited-data flow was verified on build `fed1c85`, before the final wording-only correction. The final build `fb9931a` reverified the sufficient-DLD and no-DLD paths. The final no-DLD result no longer says “Based on multiple comparable sales” and instead shows `DLD comparable sales: None available` and `DLD evidence confidence: Not available`.

A transient `ECONNRESET` occurred during one isolated Al Furjan lookup request. An alternative real limited-data request for Sobha Heartland succeeded, and the incident did not change any repository or production data.

The current fallback policy, active calibration, weights, and historical result identities were not changed. The smoke test only verified presentation and existing valuation behavior.

## Automated verification

The repository checks passed after the changes: **39 tests passed, 0 failed**, the inline JavaScript syntax check passed, the shared evidence-state module passed `node --check`, and `git diff --check` passed.

## References

[1]: https://aqar-valuation-engine.netlify.app/ "AQAR deployed valuation page"

[2]: https://github.com/Hichemorca/aqar-evaluate-engine/blob/main/index.html "AQAR valuation page source"

[3]: https://github.com/Hichemorca/aqar-evaluate-engine/blob/main/shared/evidence-state.js "Shared evidence-state helper"
