# AQAR Accuracy Diagnostics — 25 August 2026

## Scope

هذا التقرير مبني على أحدث `data/accuracy-data.json` بعد إعادة فلترة DLD. النطاق الرسمي هو `verified-dld-only`، وهو مرتبط بـ`calibrationConfigId = cal-1787651025399` وبـDLD cleaning checksum موثق في metadata.

| Stage | Records |
|---|---:|
| Eligible DLD after evidence cleaning | 26,766 |
| After general cleaning pipeline | 23,160 |
| Recent records in Accuracy window | 8,287 |
| Scored Accuracy results | 8,221 |
| Recent records without sufficient comparable result | 66 |
| Full-market results | 23,000 |

## Overall Accuracy

| Metric | Result |
|---|---:|
| Average accuracy | 85.16% |
| Average absolute error | 14.84% |
| Median absolute error | 9.80% |
| P90 absolute error | 30.40% |
| Signed bias | +2.88% |
| Within ±10% | 50.85% |
| Within ±15% | 66.96% |
| Within ±25% | 84.60% |

## Error distribution

| Absolute error band | Records |
|---|---:|
| 0–10% | 4,180 |
| 10–25% | 2,775 |
| 25–50% | 1,022 |
| 50–100% | 177 |
| >100% | 67 |

## Results by property type

| Property type | Records | Accuracy | Avg. absolute error | Bias | Within ±15% |
|---|---:|---:|---:|---:|---:|
| Apartment | 5,971 | 86.05% | 13.95% | +4.42% | 69.20% |
| Villa | 617 | 84.13% | 15.87% | -10.97% | 53.81% |
| Land | 1,294 | 82.94% | 17.06% | +6.54% | 69.40% |
| Office | 262 | 81.14% | 18.86% | -11.75% | 44.27% |
| Retail | 77 | 75.32% | 24.68% | -17.19% | 35.06% |

Townhouse and Warehouse have no scored records in this Accuracy artifact, so there is no empirical basis for calibrating them.

## Results by evaluation level

| Evaluation level | Records | Accuracy | Avg. absolute error | Bias | Within ±15% |
|---|---:|---:|---:|---:|---:|
| Project size | 5,684 | 88.13% | 11.87% | +1.15% | 72.89% |
| Project | 347 | 81.91% | 18.09% | +5.28% | 51.87% |
| District size | 2,107 | 78.01% | 21.99% | +6.96% | 54.11% |
| District | 83 | 76.31% | 23.69% | +8.21% | 50.60% |

The diagnostics indicate that sparse district fallbacks are a larger immediate risk than a global method-weight imbalance.

## Recent unscored records

The 66 recent eligible records without a scored result are distributed as follows:

| Property type | Records |
|---|---:|
| Land | 43 |
| Apartment | 12 |
| Villa | 4 |
| Retail | 5 |
| Office | 2 |

Their area ranges from 33.13 sqm to 6,442.06 sqm, with a median of 929.03 sqm. This profile should be audited against comparable-count thresholds and district/size grouping before changing fallback rules.

## Outliers

There are 67 scored records with absolute error above 100%: 55 apartments, 10 land records, one retail record, and one villa record. The most severe record is a land transaction in Madinat Al Mataar with 15,760.16 sqm, an AQAR valuation of AED 139,241,014 versus an actual price of AED 3,229,200, producing a signed error of +4,211.9% at district-size level.

Other high-impact patterns include small apartments in Jumeirah Village Triangle, an apartment in Dubai Marina, and a villa in Hadaeq Sheikh Mohammed Bin Rashid. These should be reviewed as individual evidence and comparable-selection cases, not used to justify a global coefficient change.

## Recommended order of work

1. Audit the 66 unscored records and the district/district-size comparable thresholds.
2. Add a diagnostic view that allows filtering by type, district, evaluation level, area band, comparable count, and signed error.
3. Review the 67 extreme outliers separately and retain them in the official artifact while recording an outlier flag.
4. Run one-variable holdout experiments only after the above audits.
5. Do not calibrate Townhouse or Warehouse until verified records exist.

No calibration values were changed during this diagnostics phase.

## References

[1]: ../data/accuracy-data.json "AQAR official Accuracy artifact"
[2]: ../data/accuracy-diagnostics.json "AQAR Accuracy Diagnostics artifact"
[3]: ../data/dld-cleaning-report.json "AQAR DLD cleaning report"
[4]: ../shared/aqar-calibration-defaults.js "AQAR calibration schema"
[5]: ../scripts/cleaning-pipeline.js "AQAR general cleaning pipeline"
