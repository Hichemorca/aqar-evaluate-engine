# تقرير تجربة fallback المعزولة — 25 أغسطس 2026

## القرار التنفيذي

تم تنفيذ تجربة تحليلية معزولة لسياسة اختيار المقارنات، ولم يتم تعديل `evaluateProperty` الإنتاجية، أو تغيير calibration، أو تنفيذ Save، أو إعادة توليد `accuracy-data.json` الرسمي. النتيجة الأساسية هي أن **رفع حد District size من 5 إلى 10 مع التحويل التلقائي إلى District لا يحسن الجودة فعليًا**؛ فقد غيّر مستوى 112 سجلًا إلى District، وكانت دقة هذه المجموعة 36.96% ومتوسط الخطأ المطلق 63.04% مع انحياز موجب +40.30%. لذلك لا أوصي بتطبيق هذا الجزء في الإنتاج.

أما حماية `Land xlarge` بإيقاف fallback الواسع فقد حسّنت المؤشرات الإجمالية، لكنها فعلت ذلك مع تحويل 16 سجلًا من Land xlarge إلى unscored. كذلك فإن منع التحويل الواسع لجميع حالات District size ذات 5–9 مقارنات حسّن المؤشرات أكثر، لكنه خفّض التغطية بمقدار 112 سجلًا. لذلك لا ينبغي تطبيق أي من السياستين تلقائيًا قبل موافقة المالك على سياسة التعامل مع السجلات التي ستصبح unscored.

## نطاق البيانات وهوية التجربة

أعيد تشغيل التجربة على نتائج Accuracy الحالية ذات النطاق `verified-dld-only`. استُخدم وقت `accuracy.metadata.lastUpdated` كقيمة `asOf` ثابتة لأوزان الزمن، حتى تكون النتيجة قابلة لإعادة الإنتاج بدل الاعتماد على وقت التشغيل المتغير. استُخدم نفس calibration النشط ونفس أدلة DLD المنظفة، ولم تُستخدم سجلات rejected في الحساب.

| البند | القيمة |
|---|---:|
| سجلات Accuracy الأساسية | 8,221 |
| التغطية داخل holdout الحالي | 100.00% |
| calibrationConfigId | `cal-1787651025399` |
| asOf / آخر تحديث للـAccuracy | 2026-08-25 11:16:28 UTC |
| سجلات DLD المؤهلة قبل التنظيف اللاحق | 26,766 |
| سجلات التنظيف اللاحق المستخدمة لبناء المقارنات | 23,160 |
| DLD source checksum | `5d863484f69278615cd6b116ade988d50b77ef0406b20b22495f18c0e0a3d019` |

يعيد runner بناء مجموعات المقارنات من البيانات المؤهلة، ويطبق weighted median وleave-one-out بنفس منطق evaluator. ولعزل أثر مستوى fallback فقط، يعيد تطبيق طبقات consultancy وview وGIS و`calibration-engine` على القيمة المرشحة، مع إبقاء بقية سياسة التقييم ثابتة. الأداة لا تكتب إلى ملفات Accuracy أو Market الرسمية؛ مخرجها الوحيد هو artifact تحليلي مستقل.

## تعريف السياسات المختبرة

| السيناريو | السياسة التحليلية |
|---|---|
| Baseline | السلوك الحالي: `project_size` ثم `project` ثم `district_size` بحد أدنى 5 ثم `district` بحد أدنى 5. |
| District size minimum 10 | رفع حد `district_size` إلى 10؛ حالات 5–9 تنتقل إلى `district` إذا حققت حدها الحالي. |
| Minimum 10 + block xlarge district-size | السيناريو السابق مع منع `district_size` فقط لعقار `Land xlarge`. |
| Strict Land xlarge | رفع الحد إلى 10 ومنع fallback الواسع لعقار `Land xlarge`؛ إذا لم يتوفر مستوى أعلى صالح يصبح السجل unscored. |
| Minimum 10 بدون wide fallback | رفع الحد إلى 10 ومنع تحويل حالات District size ذات 5–9 مقارنات إلى District؛ تصبح هذه الحالات unscored. |

لم تُختبر قاعدة رفض مبنية على dispersion كسياسة إنتاجية؛ بقيت dispersion تشخيصًا فقط كما هو مطلوب.

## النتائج الإجمالية

| السيناريو | السجلات المحسوبة | التغطية | Accuracy | MAE | Median AE | P90 AE | Bias | ضمن ±15% |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Baseline | 8,221 | 100.00% | 85.15% | 14.85% | 9.80% | 30.40% | +2.89% | 66.96% |
| District size minimum 10 | 8,221 | 100.00% | 85.18% | 14.82% | 9.76% | 30.39% | +2.93% | 67.01% |
| Minimum 10 + block xlarge district-size | 8,221 | 100.00% | 85.18% | 14.82% | 9.76% | 30.39% | +2.93% | 67.01% |
| Strict Land xlarge | 8,205 | 99.81% | 85.71% | 14.29% | 9.77% | 30.31% | +2.39% | 67.01% |
| Minimum 10 بدون wide fallback | 8,109 | 98.64% | 85.85% | 14.15% | 9.70% | 29.88% | +2.41% | 67.31% |

أعاد خط الأساس نفس مؤشرات artifact الرسمي بعد التقريب إلى منزلتين عشريتين، وهو تحقق كافٍ لهذه التجربة المعزولة. التحسن الظاهر في السيناريوين المحافظين لا يمثل تحسنًا شاملاً مع الحفاظ على التغطية؛ جزء منه ناتج عن عدم إصدار قيمة لسجلات ضعيفة بدل إنتاج تقييم واسع النطاق لها.

## تحليل السجلات التي تغير مستوى fallback

عند رفع حد District size إلى 10 مع الإبقاء على District fallback، تغيرت 112 حالة فقط، وكلها انتقلت من `district_size` إلى `district`.

| مجموعة السجلات المعاد إسنادها | العدد | Accuracy | MAE | Median AE | P90 AE | Bias | ضمن ±15% |
|---|---:|---:|---:|---:|---:|---:|---:|
| جميع الحالات 5–9 التي انتقلت إلى District | 112 | 36.96% | 63.04% | 17.41% | 54.71% | +40.30% | 45.54% |
| منها Land | 70 | 10.91% | 89.09% | 20.81% | 60.98% | +68.66% | 41.43% |
| منها Apartment | 15 | 84.90% | 15.10% | 6.94% | 31.78% | +4.52% | 60.00% |

هذه المقارنة المباشرة هي سبب رفض اقتراح «ارفع الحد ثم استخدم District تلقائيًا»: المتوسط العام يخفي أن cohort المتأثر ضعيف جدًا، وخصوصًا Land. إن كان الهدف حماية الجودة، فإن التحويل إلى District لا يحقق الهدف؛ إما أن يبقى `district_size` الحالي مع تسجيل dispersion، أو تصبح الحالة unscored وفق سياسة معلنة.

## تحليل Land xlarge

تُظهر التشخيصات السابقة أن Land xlarge هو أكثر slice خطورة. في السيناريو المحافظ، أصبحت 16 حالة unscored، وجميعها `land_xlarge`؛ لم تُخترع لها أسعار ولم تُستخدم سجلات rejected لتعويضها. وبالنسبة إلى Land المحسوب في ذلك السيناريو، أصبحت النتيجة 1,278 سجلًا بدقة 86.23% وMAE 13.77% وBias +3.36%، مقابل مؤشرات baseline القريبة من 86.2% و13.8% على Land الكامل الحالي.

في سياسة منع wide fallback لكل حالات District size ذات 5–9 مقارنات، أصبحت تغطية Land 1,224 سجلًا، بدقة 87.02% وMAE 12.98% وBias +3.23%، لكن 70 سجل Land لم تعد محسوبة. هذه مفاضلة حقيقية بين **جودة القيم الصادرة** و**اكتمال التغطية** وليست سببًا كافيًا لتغيير الإنتاج تلقائيًا.

## التوصية

لا أوصي حاليًا بتطبيق رفع حد District size وحده، لأن إعادة الإسناد إلى District أضعف بكثير من cohort الأصلية. كما لا أوصي بتطبيق حماية Land xlarge أو منع wide fallback دون اعتماد قرار وظيفي واضح يحدد ما سيظهر للمستخدم عندما تصبح النتيجة unscored، وما إذا كان فقدان 16 أو 112 سجلًا مقبولًا في Accuracy والتشغيل اليومي.

الخطوة الآمنة التالية هي عرض سياسة محافظة باسم وإصدار مستقلين على المالك للموافقة، مع إبقائها في وضع تجريبي أولًا. بعد الموافقة فقط يمكن تنفيذها خلف policy version واضح وإعادة توليد Accuracy رسميًا. **لم يحدث أي Save calibration أو تغيير في fallback production خلال هذه التجربة.**

## الملفات المضافة والتحقق

أضيف runner المعزول `scripts/run-fallback-policy-experiment.js`، واختبارات اختيار المستويات في `tests/fallback-policy-experiment.test.js`، وartifact النتائج `data/fallback-policy-experiment-2026-08-25.json`. نجحت اختبارات المشروع كاملة: **35 اختبارًا ناجحًا، 0 فشل**، إضافة إلى `node --check` و`git diff --check`.

### المراجع داخل المشروع

[1]: https://github.com/Hichemorca/aqar-evaluate-engine/blob/main/scripts/evaluate-and-save.js "AQAR evaluator and current fallback order"

[2]: https://github.com/Hichemorca/aqar-evaluate-engine/blob/main/scripts/cleaning-pipeline.js "AQAR governed cleaning pipeline"

[3]: https://github.com/Hichemorca/aqar-evaluate-engine/blob/main/shared/comparable-diagnostics.js "Comparable diagnostics and size categories"

[4]: https://github.com/Hichemorca/aqar-evaluate-engine/blob/main/shared/calibration-engine.js "Shared calibration method engine"
