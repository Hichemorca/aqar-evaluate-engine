# AQAR Accuracy Review — 25 August 2026

## Executive conclusion

تمت مراجعة أحدث artifacts رسمية بعد إعادة تشغيل workflow باستخدام configuration النشطة. البيانات تغطي **8,537 سجلًا**، وكل سجل رسمي يحمل `dataSource = dld-real-cleaned` و`verifiedBy = Government Record`. لا توجد حقول Appraiser أو generated أو synthetic في السجلات، كما أن النطاق المعلن هو `verified-dld-only`.

الإصدار المستخدم في إعادة التوليد موثق داخل artifact نفسه: `calibrationConfigId = cal-1787651025399`. لذلك أصبحت نتائج Accuracy قابلة للربط بهوية configuration بدل الاعتماد على metadata عامة فقط.

لا أوصي بتغيير معاملات إضافية الآن. النتائج تكشف فروقات منهجية مهمة بين الأنواع ومستويات التقييم، لكنها تكشف أيضًا قيمًا شاذة ومناطق ذات انحراف شديد يجب تدقيقها قبل اعتماد أي تعديل رقمي.

## Source and coverage validation

| Item | Result |
|---|---:|
| Accuracy scope | `verified-dld-only` |
| Records | 8,537 |
| Sale-date range | 2026-04-28 to 2026-07-26 |
| Calibration identity | `cal-1787651025399` |
| Forbidden fields present | None |
| Property types represented | Apartment, Villa, Land, Office, Retail |
| Property types without current records | Townhouse, Warehouse |
| Stored metadata vs recomputed metrics | Differences below 0.5 percentage point |

المؤشرات المحسوبة تعرّف الانحراف الموقّع على أنه `(AQAR valuation − actual sale price) / actual sale price`. لذلك يشير **bias موجب** إلى ميل نحو المبالغة في التقييم، بينما يشير **bias سالب** إلى ميل نحو التقليل من التقييم.

## Overall performance

| Metric | Result |
|---|---:|
| Average accuracy | 85.44% |
| Average absolute error | 14.56% |
| Median absolute error | 9.80% |
| P90 absolute error | 30.20% |
| Bias | +2.58% |
| Within ±10% | 50.99% |
| Within ±15% | 67.15% |
| Within ±25% | 84.87% |

## Performance by property type

| Property type | Records | Accuracy | Avg. absolute error | Bias | Within ±15% |
|---|---:|---:|---:|---:|---:|
| Villa | 617 | 84.09% | 15.91% | -10.98% | 53.97% |
| Apartment | 5,904 | 86.37% | 13.63% | +4.01% | 69.29% |
| Land | 1,675 | 83.69% | 16.31% | +5.76% | 69.55% |
| Office | 262 | 81.40% | 18.60% | -11.95% | 43.89% |
| Retail | 79 | 76.60% | 23.40% | -17.55% | 36.71% |

The current dataset provides no empirical Accuracy evidence for Townhouse or Warehouse. Their calibration controls must therefore not be tuned from this artifact.

## Performance by evaluation level

| Evaluation level | Records | Accuracy | Avg. absolute error | Bias | Within ±15% |
|---|---:|---:|---:|---:|---:|
| Project size | 5,916 | 88.31% | 11.69% | +1.07% | 73.29% |
| Project | 344 | 82.54% | 17.46% | +5.25% | 53.78% |
| District size | 2,180 | 78.68% | 21.32% | +6.10% | 53.39% |
| District | 97 | 72.28% | 27.72% | +6.19% | 49.48% |

The largest weakness is not the overall mean. It is the **fallback hierarchy for sparse project/district contexts**: district-level results are materially weaker than project-size results.

## Performance by area

| Area band | Records | Accuracy | Avg. absolute error | Bias | Within ±15% |
|---|---:|---:|---:|---:|---:|
| <80 sqm | 3,226 | 86.88% | 13.12% | +3.43% | 71.23% |
| 80–150 sqm | 2,744 | 87.01% | 12.99% | +2.20% | 69.72% |
| 151–250 sqm | 1,208 | 83.23% | 16.77% | -0.78% | 57.12% |
| >250 sqm | 1,359 | 80.82% | 19.18% | +4.30% | 61.22% |

The >250 sqm segment is materially weaker and should be examined together with property type and evaluation level rather than given a global multiplier immediately.

## Outlier and data-quality findings

There are **49 records with absolute error above 100%**, including 35 apartments, 13 land records, and one villa. One land record with area 15,760 sqm has an error above 4,000%, which materially distorts untrimmed averages. The most problematic eligible districts include Madinat Al Mataar, International City PH 2 & 3, Jumeirah Village Triangle, Jumeirah Golf, and Dubai Marina.

The outlier pattern is not sufficient evidence to change a coefficient. It points first to a required audit of comparable grouping, size categories, sparse-district fallbacks, and special project/land records. For example, the current land size taxonomy includes a separate `land_xlarge` category above 3,000 sqm, but the Accuracy artifact should be checked to confirm that this category is not receiving an unsuitable district-size reference.

## Calibration comparison and recommendations

The artifact is now tied to `cal-1787651025399`, and its embedded property-type weights match the active configuration. The principal observed directional patterns are:

1. Villa, Office, and Retail show negative bias, indicating systematic under-valuation in this sample. Retail has only 79 records, so it is not a strong basis for an aggressive calibration change.
2. Apartment and Land show positive bias, indicating moderate over-valuation. Land has sufficient volume for a controlled experiment, but the extreme land outliers must be isolated first.
3. District and district-size fallbacks are weaker than project-size evaluation. This suggests a hierarchy or comparable-selection investigation before changing global method weights.
4. No evidence exists in this artifact for Townhouse or Warehouse; their controls should remain unchanged until verified records are available.
5. Calibration changes should be tested as one-variable experiments with a holdout comparison, and only then saved as a new configuration version. No additional coefficients were changed during this review.

## Recommended next implementation step

الخطوة العملية التالية هي إضافة **Accuracy diagnostics قابلة للتصفية داخل artifact أو dashboard** تعرض النوع، evaluation level، area band، district، signed bias، median error، P90 error، وعدد السجلات، مع عزل السجلات ذات `absError > 100%`. بعد ذلك نعيد تشغيل تقييم holdout لكل تجربة معايرة، بدل الاعتماد على متوسط واحد شامل.

## References

[1]: ../data/accuracy-data.json "AQAR official verified Accuracy artifact"
[2]: ../shared/aqar-calibration-defaults.js "AQAR active calibration schema and defaults"
[3]: ../shared/aqar-policy.js "AQAR property and methodology policy"
[4]: ../scripts/cleaning-pipeline.js "AQAR cleaning and land size taxonomy"
