# Local Calibration Impact Matrix Review

**Date:** 27 August 2026
**Mode:** Local, isolated, read-only
**Scope:** Temporary in-memory configuration mutations against the shared calibration engine. No Admin token, Netlify API, calibration save, production request, Accuracy artifact, or DLD artifact was used or changed.

## Executive conclusion

The local matrix confirms that the calibration path applies changed values to new calculations when the changed field is used by the tested property type and method. The test covered **480 numeric configuration scenarios** from the active calibration structure, including applicable method weights, method coefficients, GIS coefficients, and v2.1 shadow controls. The calculations use deterministic synthetic fixtures designed to activate representative branches; they are not a replacement for market-data validation or a live end-to-end browser test.

The results also show why “change every value and observe an effect” must be interpreted by field scope. Some values are intentionally not used by the shared calibration engine because they belong to the browser’s interactive sales/GIS path. Other values are v2.1 shadow controls and must not change the official valuation while shadow is disabled. A zero delta for these categories is expected behavior, not automatically a defect.

## Matrix results

| Classification | Scenarios | Meaning |
|---|---:|---|
| `official-value-changed` | 53 | The modified active weight or coefficient changed the official value for the deterministic fixture. |
| `interactive-sales-path-not-exercised-by-shared-engine` | 280 | Sales coefficients are applied in the browser sales path and are not exercised by the shared engine fixture. |
| `no-observable-effect-in-fixture` | 77 | The field was valid but the chosen fixture did not activate the specific branch, band, or condition. |
| `interactive-only-not-exercised-by-shared-engine` | 16 | GIS coefficients belong to the interactive GIS path and were not applied by the shared engine fixture. |
| `shadow-only` | 2 | The modified v2.1 shadow value changed the shadow result while leaving the official value separate. |
| `shadow-no-observable-effect` | 52 | The shadow field was valid but the chosen input did not enter that band or the combined multiplier remained bounded/unchanged. |
| **Total** | **480** | Every enumerated numeric scenario was classified. |

## Confirmed effects

The paired-weight tests changed two applicable method weights while preserving a 100% total. For example, changing Apartment or Villa Sales/Income weights changed the combined result by AED 3,143 in the deterministic fixture, with the new configuration remaining valid.

Income coefficients produced direct effects when the corresponding input was present. Changing `vacancyRatePercent` changed the income result by AED 4,200 in the fixture, and changing `capRatePercent` changed it by AED 29,818. Cost coefficients such as `depreciationPerYear` and the active condition factor also changed the combined result when their branches were active. DCF coefficients produced an observable result for the active fallback branch used by the fixture.

The two observed shadow-only changes were deliberately kept separate from the official value. A temporary Apartment project multiplier or renovation multiplier changed the shadow result by AED 49,000 while the official calculation remained governed by the non-shadow path.

## Fields requiring a different test path

Sales coefficients such as `maxPricePerSqm`, bedroom, finish, view, floor, street, building-condition, furnishing, feature, and age factors are part of the browser’s interactive sales valuation path. They were not falsely labeled as broken merely because the shared calibration engine does not implement that path. The matrix records them as `interactive-sales-path-not-exercised-by-shared-engine`.

GIS coefficients are similarly recorded as interactive-only because the shared calibration engine does not calculate GIS scoring. Their production effect should be tested through a browser fixture with a mocked GIS response, not by changing the shared engine contract.

The v2.1 project, BUA/Plot Area, and renovation controls remain shadow-only. Their official delta must remain zero until a separate approval promotes them; a shadow delta is expected only when the selected input satisfies evidence and band conditions.

## Safety and rollback

The runner cloned the active calibration in memory for every scenario and validated each mutated configuration before calculation. It did not call `calibration-config`, did not send an Admin token, did not write to Netlify Blobs, and did not alter `active-calibration.json`. Hashes of `data/accuracy-data.json` and `data/dld-transactions.json` were unchanged before and after the matrix.

Every mutation was discarded after its scenario. The original configuration remained available as the baseline, and no temporary configuration was left active anywhere.

## Decision

The local evidence confirms the core behavior required for new valuations: **active applicable weights and coefficients are consumed by the calculation path and can change the resulting value**. It does not by itself prove that a production POST succeeded, because the production save path was intentionally not called. It also does not justify enabling shadow multipliers or changing official calibration.

Before a real calibration change is made, the safe operational sequence remains: save the current configuration, make one controlled change, run a before/after valuation with the same inputs, verify the new `calibrationConfigId`, restore the exact original configuration, and confirm that historical records retain their original identity.

## Reproduction command

```bash
npm run calibration-impact-matrix
```

The command is local and isolated. It writes only the requested diagnostic output and does not write official Accuracy or DLD artifacts.

## References

[1]: https://github.com/Hichemorca/aqar-evaluate-engine "MIAYAAR source repository"
[2]: https://aqar-valuation-engine.netlify.app/admin-calibration "MIAYAAR Calibration Console"
