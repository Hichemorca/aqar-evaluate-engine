# AQAR Accuracy Review — DLD Re-filtering — 25 August 2026

## Executive conclusion

تمت إعادة فلترة بيانات DLD في AQAR وفق طبقة evidence cleaning مستلهمة من نمط MIAYAAR، مع إبقاء CSV الخام دون تعديل واستبعاد Commercial وGeneral Use land من Accuracy الرسمية. تم تشغيل workflow الرسمي بعد التغيير، وأصبح artifact Accuracy مرتبطًا بهوية configuration وهوية تنظيف DLD معًا.

النتيجة الحالية لا تبرر تعديل معاملات التقييم بعد. الفلترة حسّنت قابلية التدقيق وأزالت سجلات evidence غير المناسبة، لكنها أظهرت أن مناطق ومستويات fallback ما زالت تحتاج تحليلًا منفصلًا قبل أي معايرة رقمية.

## Source and cleaning result

| Item | Result |
|---|---:|
| Raw CSV rows read | 30,475 |
| Normalized records | 30,328 |
| Eligible DLD records | 26,766 |
| Rejected evidence records | 3,562 |
| Skipped invalid records | 128 |
| Duplicate transaction IDs | 19 |
| Commercial / General Use land rejected | 2,944 |
| Ultra-luxury rejected | 618 |
| Cleaning checksum | `5d863484f69278615cd6b116ade988d50b77ef0406b20b22495f18c0e0a3d019` |
| Accuracy records after evaluation filters | 8,221 |
| Commercial/General Use land in Accuracy | 0 |

كل سجل داخل Accuracy الجديدة بقي ضمن `verified-dld-only`، ولم تظهر حقول Appraiser أو generated أو synthetic. ملف `data/dld-transactions-rejected.json` يحتفظ بالسجلات المرفوضة وissue ledger، بينما `data/dld-cleaning-report.json` يحفظ checksum وملخص التشغيل.

## Before and after re-filtering

| Metric | Before | After |
|---|---:|---:|
| Accuracy records | 8,537 | 8,221 |
| Average accuracy | 85.44% | 85.16% |
| Average absolute error | 14.56% | 14.84% |
| Median absolute error | 9.80% | 9.80% |
| P90 absolute error | 30.20% | 30.40% |
| Bias | +2.58% | +2.88% |
| Within ±10% | 50.99% | 50.85% |
| Within ±15% | 67.15% | 66.96% |
| Within ±25% | 84.87% | 84.60% |

الانخفاض الطفيف في المؤشر ليس تدهورًا سببيًا مثبتًا؛ فالفلترة غيّرت مجموعة القياس بإزالة سجلات غير مؤهلة، ولذلك يجب استخدام مؤشرات ما بعد الفلترة كخط أساس رسمي جديد بدل مقارنة المتوسطين وحدهما.

## Current performance by property type

| Property type | Records | Accuracy | Avg. absolute error | Bias | Within ±15% |
|---|---:|---:|---:|---:|---:|
| Villa | 617 | 84.13% | 15.87% | -10.97% | 53.81% |
| Apartment | 5,971 | 86.05% | 13.95% | +4.42% | 69.20% |
| Land | 1,294 | 82.94% | 17.06% | +6.54% | 69.40% |
| Office | 262 | 81.14% | 18.86% | -11.75% | 44.27% |
| Retail | 77 | 75.32% | 24.68% | -17.19% | 35.06% |


لا توجد في artifact الحالي سجلات Townhouse أو Warehouse. لذلك لا يجوز معايرة هذين النوعين اعتمادًا على Accuracy الحالية.

## Current performance by evaluation level

| Evaluation level | Records | Accuracy | Avg. absolute error | Bias | Within ±15% |
|---|---:|---:|---:|---:|---:|
| Project size | 5,684 | 88.13% | 11.87% | +1.15% | 72.89% |
| Project | 347 | 81.91% | 18.09% | +5.28% | 51.87% |
| District size | 2,107 | 78.01% | 21.99% | +6.96% | 54.11% |
| District | 83 | 76.31% | 23.69% | +8.21% | 50.60% |

يبقى الضعف الأكبر في district وdistrict-size fallback، مع انحياز موجب، بينما project-size هو الأقوى. هذا يشير إلى أن تدقيق اختيار المقارنات وتسلسل fallback أولوية أعلى من تعديل وزن منهج عام.

## Outlier robustness

بعد الفلترة، توجد 67 نتيجة Accuracy ذات absolute error أكبر من 100%. وعند استبعاد القيم ذات الخطأ الأكبر من 50% لأغراض تحليل المتانة فقط، يرتفع المؤشر إلى 87.81% ويقترب bias من +0.38%. هذا التحليل لا يحذف القيم الشاذة من Accuracy الرسمية، بل يوضح أن المتوسط غير المنضبط يتأثر بعدد محدود من السجلات.

| Segment | Records | Accuracy | Bias |
|---|---:|---:|---:|
| Full filtered set | 8,221 | 85.16% | +2.88% |
| Absolute error ≤50% | 7,977 | 87.81% | +0.38% |
| Absolute error ≤100% | 8,154 | 86.65% | +1.30% |

## Interpretation and recommendations

أظهر القرار المتعلق بـCommercial وGeneral Use land أثرًا واضحًا في حماية Accuracy من خلط أنواع أراضٍ غير متجانسة مع المقارنات العامة. ومع ذلك، لا يعني ذلك أن كل سجل مرفوض غير صحيح واقعيًا؛ بل يعني أنه خارج نطاق Accuracy المعتمد حاليًا، مع احتفاظ AQAR به في سجل تدقيق قابل للمراجعة.

التوصية التالية هي تدقيق `district` و`district_size` وشرائح `>250 sqm`، وربط كل نتيجة بمصدر المقارنة وعددها قبل اختبار أي معامل. كما ينبغي عزل القيم ذات الخطأ الأكبر من 100% في تقرير تشخيصي منفصل، دون حذفها من artifact الرسمي.

Retail وOffice وVilla تظهر انحيازًا سلبيًا، لكن Retail تحتوي 77 سجلًا فقط. أما Land فتمتلك حجمًا أكبر وانحيازًا موجبًا، لكنها ما زالت متأثرة بقيم شاذة. لذلك لا ينبغي إجراء Save جديد في Calibration Console قبل تجربة holdout موثقة لكل نوع.

Townhouse وWarehouse يحتاجان سجلات Verified DLD كافية قبل اعتماد أي استنتاج. لا يجوز استخدام بيانات مصطنعة أو Appraiser أو مصادر غير موثقة لتعويض غيابهما.

## Implementation status

تم تنفيذ cleaner مشترك في `shared/dld-evidence-cleaning.js`، وتعديل `fetch-dld.js` و`validate-dld-data.js` و`evaluate-and-save.js` وworkflow اليومي. تم كذلك إضافة اختبارات regression للتنظيف والـissue ledger، مع استمرار شرط Verified DLD only. آخر commit للتنفيذ هو `a1710c6`، وآخر artifact تلقائي هو `d42dd2c`.

## References

[1]: ../shared/dld-evidence-cleaning.js "AQAR DLD evidence cleaning implementation"
[2]: ../scripts/fetch-dld.js "AQAR DLD CSV ingestion and cleaning artifacts"
[3]: ../scripts/evaluate-and-save.js "AQAR accuracy evaluation and cleaning identity"
[4]: ../data/dld-cleaning-report.json "AQAR DLD cleaning report"
[5]: ../data/dld-transactions-rejected.json "AQAR DLD rejected records and issue ledger"
[6]: ../../../MIAYAAR/scripts/lib/dld-evidence-cleaning.mjs "MIAYAAR DLD evidence cleaning reference"
[7]: ../../../MIAYAAR/scripts/import-dld-evidence.mjs "MIAYAAR DLD import and issue ledger reference"
