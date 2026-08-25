# Comparable Holdout Analysis — 25 August 2026

## Scope and decision rule

هذا التحليل تشخيصي فقط على أحدث Accuracy الرسمية. لم يتم حذف أي سجل من artifact الرسمي، ولم يتم تغيير أي وزن أو معامل. تم اختبار شرائح flags الموجودة في `comparableDiagnostics` لمعرفة أثرها المحتمل قبل تصميم تجربة fallback فعلية.

| Item | Result |
|---|---:|
| Accuracy records | 8,221 |
| Calibration config | `cal-1787651025399` |
| Accuracy scope | `verified-dld-only` |
| Baseline average accuracy | 85.15% |
| Baseline average absolute error | 14.85% |
| Baseline bias | +2.89% |

## Scenario comparison

| Diagnostic scenario | Records | Accuracy | Avg. absolute error | Bias | Within ±15% |
|---|---:|---:|---:|---:|---:|
| Baseline | 8,221 | 85.15% | 14.85% | +2.89% | 66.96% |
| Excluding Land xlarge | 8,204 | 85.67% | 14.33% | +2.37% | 66.98% |
| High peer dispersion only | 438 | 72.34% | 27.66% | +3.70% | 36.53% |
| Excluding high dispersion | 7,783 | 85.87% | 14.13% | +2.84% | 68.68% |
| Any dispersion flag | 1,325 | 72.19% | 27.81% | +7.82% | 39.40% |
| Excluding any dispersion | 6,896 | 87.64% | 12.36% | +1.94% | 72.26% |

هذه السيناريوهات لا تعني أن السجلات flagged يجب حذفها؛ فهي تقيس الحساسية فقط. يجب إبقاء السجلات الموثقة في Accuracy مع إظهار flag وتقديم تجربة سياسة مستقلة قبل أي استبعاد.

## Land xlarge

| Segment | Records | Accuracy | Avg. absolute error | Bias | Within ±15% |
|---|---:|---:|---:|---:|---:|
| All Land | 1,294 | 82.91% | 17.09% | +6.58% | 69.40% |
| Land xlarge | 17 | -164.45% | 264.45% | +254.44% | 58.82% |
| Land excluding xlarge | 1,277 | 86.21% | 13.79% | +3.28% | 69.54% |

Land xlarge has only 17 records, so it is a strong diagnostic risk signal but not enough on its own to authorize a global coefficient change. The proper next experiment is a Land-specific fallback policy or an explicit review/holdout cohort.

## District-size fallback

| Segment | Records | Accuracy | Avg. absolute error | Bias | Within ±15% |
|---|---:|---:|---:|---:|---:|
| All District size | 2,107 | 77.99% | 22.01% | +6.98% | 54.11% |
| District size with 5–9 comparables | 112 | 34.59% | 65.41% | +37.45% | 33.93% |
| District size with 10+ comparables | 1,995 | 80.42% | 19.58% | +5.27% | 55.24% |

The 5–9 comparable band is a high-risk segment. Raising the minimum threshold from 5 to 10 may improve reliability, but it could reduce coverage or send records to a broader District fallback. That change must be tested by recomputing valuations, not by removing these records from the metric.

## Land by fallback

| Selected fallback | Records | Accuracy | Avg. absolute error | Bias | Within ±15% |
|---|---:|---:|---:|---:|---:|
| Project size | 862 | 90.34% | 9.66% | +2.34% | 79.12% |
| Project | 57 | 79.81% | 20.19% | +9.68% | 49.12% |
| District size | 316 | 64.97% | 35.03% | +16.71% | 50.63% |
| District | 59 | 73.39% | 26.61% | +11.22% | 47.46% |

Land Project size is materially stronger than Land District size. This supports testing stricter protection against weak District size fallback, especially for large land parcels.

## Property-type dispersion

High dispersion is strongly associated with lower accuracy in Apartment and Land. Apartment high-dispersion records have 74.80% accuracy versus 88.82% for Apartment records without a dispersion flag. Land high-dispersion records have 53.14% accuracy versus 88.82% for Land records without a flag. These are diagnostic contrasts, not grounds for removing valid records.

## Recommendation

لا يتم تعديل Calibration في هذه المرحلة. التجربة التالية يجب أن تكون **Fallback Policy Holdout** تعيد حساب القيمة فعلًا تحت سيناريوهات محددة:

1. District size minimum 10 بدل 5.
2. Land xlarge لا يستخدم District size إلا بعد شرط تجانس أقوى، وإلا يُرفع إلى مراجعة أو يبقى غير مقيم.
3. High dispersion لا يغيّر القيمة تلقائيًا؛ يضاف فقط كـreview flag في البداية.
4. مقارنة التغطية، Accuracy، bias، P90، وWithin ±15% لكل نوع عقار، مع منع تدهور Project size.

لا يجوز إجراء Save في Calibration Console قبل نجاح هذه التجربة على holdout مستقل أو على فترة زمنية غير مستخدمة في ضبط السياسة.

## References

[1]: ../data/accuracy-data.json "AQAR official Accuracy artifact"
[2]: ../data/comparable-holdout-analysis.json "AQAR comparable holdout analysis artifact"
[3]: ../shared/comparable-diagnostics.js "AQAR comparable diagnostics contract"
[4]: ../scripts/evaluate-and-save.js "AQAR evaluation and fallback implementation"
