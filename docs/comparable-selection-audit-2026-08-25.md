# Comparable Selection and Fallback Audit — 25 August 2026

## Scope

هذا التدقيق يعيد بناء منطق اختيار المقارنات المستخدم في AQAR Accuracy على أحدث eligible DLD records، ويقارن كل سجل حديث بمستويات `project_size` و`project` و`district_size` و`district`. لم يتم تغيير الأوزان أو معاملات Calibration.

| Item | Result |
|---|---:|
| Eligible DLD input | 26,766 |
| After general cleaning | 23,160 |
| Recent records in Accuracy window | 8,287 |
| Scored records | 8,221 |
| Unscored recent records | 66 |
| Calibration config | `cal-1787651025399` |
| Accuracy window start | 2026-04-27 |

الحدود الحالية هي 3 مقارنات لـProject size، و5 لـProject، و5 لـDistrict size، و5 لـDistrict، مع حد Project قدره مقارنان فقط لـRetail.

## Unscored records

الـ66 سجلًا غير المقيمة ليست فشلًا عامًا في المحرك؛ جميعها لم تجتز أي مستوى من مستويات المقارنة:

| Reason pattern | Records |
|---|---:|
| لا يوجد Project، وDistrict size وDistrict أقل من الحد | 45 |
| يوجد Project، لكن Project size وProject وDistrict size وDistrict أقل من الحدود | 21 |

| Property type | Unscored records |
|---|---:|
| Land | 43 |
| Apartment | 12 |
| Villa | 4 |
| Retail | 5 |
| Office | 2 |

مساحات السجلات غير المقيمة تتراوح من 33.13 إلى 6,442.06 م²، والوسيط 929.03 م². هذا يبرر فحصًا خاصًا لفئات Land والمساحات الكبيرة، لكنه لا يبرر تخفيض حد المقارنات تلقائيًا.

## Error by selected fallback level

| Selected level | Records | Avg. absolute error | Median absolute error | P90 absolute error | Bias |
|---|---:|---:|---:|---:|---:|
| Project size | 5,684 | 11.87% | 8.50% | 25.50% | +1.15% |
| Project | 347 | 18.09% | 14.00% | 35.00% | +5.28% |
| District size | 2,107 | 21.99% | 13.60% | 42.60% | +6.96% |
| District | 83 | 23.69% | 14.60% | 45.20% | +8.21% |

كلما نزل المحرك إلى fallback أوسع، ازداد الخطأ والانحياز الموجب. لذلك فالمشكلة ذات الأولوية هي جودة وتجانس المقارنات في fallback، وليس تعديل وزن عام قبل فهم السبب.

## Outlier findings

تم رصد 67 نتيجة بخطأ مطلق يتجاوز 100%. أبرز حالة هي:

| Field | Value |
|---|---:|
| Transaction | `DLD-41-8610-2026` |
| Type | Land |
| District | MADINAT AL MATAAR |
| Area | 15,760.16 m² |
| Selected level | District size |
| Comparable count | 6 |
| AQAR valuation | AED 139,241,014 |
| Actual sale price | AED 3,229,200 |
| Signed error | +4,211.9% |

حالة أخرى مهمة هي مجموعة `TERHAB HOTEL & TOWERS AT JUMEIRAH VILLAGE TRIANGLE`: يوجد 38 مقارنًا في Project size، لكن أسعار المتر تمتد تقريبًا من AED 8,221 إلى AED 26,774 للمتر، مع ratio يقارب 3.26 بين الحدين. هذا يعني أن العدد الكبير وحده لا يضمن تجانس المجموعة.

حالة `OXFORD RESIDENCE 2` لديها 5 مقارنات Project فقط وأسعار متر بين نحو AED 10,041 وAED 19,545، ونتج عنها خطأ +183%. أما `JABAL ALI INDUSTRIAL FIRST` للأراضي فلديها 9 مقارنات District size ونطاق يقارب 3.58 بين أعلى وأدنى سعر متر، ونتج عنها خطأ +167.1%.

## Findings

أولًا، `project_size` هو المستوى الأكثر موثوقية في العينة الحالية، بينما District fallbacks أضعف بوضوح. ثانيًا، بعض مجموعات Project size ذات عدد كبير تحتوي على عدم تجانس كبير؛ لذلك لا يكفي شرط العدد وحده. ثالثًا، السجل الأكبر شذوذًا هو Land بمساحة 15,760.16 م²، ما يشير إلى ضرورة تدقيق فئة `land_xlarge` أو منع مقارنة الأراضي فائقة المساحة مع فئات أصغر. رابعًا، 45 من أصل 66 سجلًا غير مقيم لا تملك Project، و21 لديها Project لكنه لا يملك كثافة كافية؛ لا ينبغي حل ذلك بخفض الحدود قبل اختبار أثره على الخطأ.

## Recommended next steps

1. إضافة diagnostics إلى كل نتيجة تتضمن عدد المقارنات في المستويات الأربعة، ونطاق أسعار المتر، وIQR أو dispersion flag، بدل حفظ `evalCount` فقط.
2. إضافة حماية مبدئية للأراضي ذات `land_xlarge` بحيث تمر بتدقيق تجانس منفصل قبل قبول District size fallback.
3. اختبار شرط تجانس للمجموعات، مثل سقف IQR أو ratio، في وضع تحليل فقط أولًا، دون تطبيقه على Accuracy الرسمية.
4. مراجعة 66 سجلًا غير مقيم مع عتبات قابلة للمقارنة، وعدم خفض الحدود إلا إذا أثبت holdout أن التغطية تزيد دون تدهور الدقة.
5. بعد إضافة flags، تنفيذ holdout comparisons لمستويات fallback قبل تجربة أي تعديل في Calibration weights.

## Decision

لا يوجد أساس كافٍ حاليًا لتعديل أوزان Sales أو Income أو DCF أو Cost. يجب أولًا تحسين قابلية تفسير اختيار المقارنات وتدقيق Land xlarge وProject groups غير المتجانسة. جميع النتائج الحالية تبقى مرتبطة بـ`calibrationConfigId`، ولم تتم إعادة كتابة أي configuration.

## References

[1]: ../data/comparable-selection-audit.json "AQAR comparable selection audit artifact"
[2]: ../data/accuracy-data.json "AQAR official Accuracy artifact"
[3]: ../scripts/evaluate-and-save.js "AQAR evaluation and fallback implementation"
[4]: ../scripts/cleaning-pipeline.js "AQAR cleaning and size categories"
