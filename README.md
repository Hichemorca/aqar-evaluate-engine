# AQAR Valuation Intelligence Engine

**AQAR** منصة ويب لتقييم العقارات في دبي، تجمع بين بيانات معاملات دائرة الأراضي والأملاك في دبي (DLD)، المقارنات السعرية، طرق التقييم المعتمدة، بيانات GIS والمرافق، وطبقة معايرة إدارية قابلة للتتبع. المنصة مستقلة عن MIAYAAR؛ تمت مراجعة MIAYAAR سابقًا للاستفادة من نمط تنظيف الأدلة وسجل التدقيق فقط، ولم تُنقل منه أنواع عقارات أو طرق تقييم أو أوزان.

> **حالة المشروع:** المنصة جاهزة للاستخدام التجريبي والمحدود (Pilot/BETA). لا ينبغي اعتبار القيمة الناتجة تقرير تقييم رسميًا أو بديلًا عن مراجعة مثمّن مرخّص، خصوصًا في التمويل والضمانات والقرارات القانونية.

| الرابط | الاستخدام |
|---|---|
| [المنصة الحية](https://aqar-valuation-engine.netlify.app/) | نموذج التقييم التفاعلي. |
| [المستودع](https://github.com/Hichemorca/aqar-evaluate-engine) | الكود والبيانات والاختبارات وسجل التغييرات. |
| `/admin-calibration` | مسار لوحة Calibration Console الإدارية. |
| `/accuracy-dashboard` | لوحة قياس Accuracy الرسمية. |
| `/market-intelligence` | صفحة Market Intelligence. |
| `/export` | صفحة التصدير العامة. |

## 1. نطاق المنصة

تعمل AQAR حاليًا على بيانات دبي فقط. أنواع العقارات الموجودة في النظام هي: **Apartment، Villa، Townhouse، Office، Retail، Warehouse، Land**. اللغة التشغيلية الحالية للواجهة هي الإنجليزية، مع تحسين الوضوح النصي دون إضافة تبديل لغة في هذه المرحلة.

تعتمد النتيجة على المدخلات التي يدخلها المستخدم، وبيانات DLD المتاحة، والمقارنات التي يستطيع النظام اختيارها، والمعاملات الحالية في Calibration Console. عندما لا توجد أدلة DLD كافية، تعرض الواجهة حالة الأدلة بوضوح ولا تنشئ سعرًا اصطناعيًا لمجرد إظهار رقم.

## 2. التقنية والبنية

المشروع ليس تطبيق React. الواجهة الحالية عبارة عن **HTML/CSS/Vanilla JavaScript**، وتعمل كواجهة ثابتة على Netlify. تستخدم وظائف Netlify الخلفية للوصول إلى بيانات DLD، إعدادات المعايرة، وبيانات GIS عند الحاجة. تستخدم مهام GitHub Actions لإعادة بناء artifacts البيانات وAccuracy دوريًا.

| المكوّن | الموقع | الدور |
|---|---|---|
| نموذج التقييم | `index.html` | إدخال بيانات العقار، اختيار المنطقة، الخريطة، الأدلة، وحساب القيمة. |
| لوحة Accuracy | `accuracy-dashboard.html` | عرض مؤشرات التقييم الرسمي والشرائح التشخيصية. |
| Calibration Console | `calibration.html` | إدارة الأوزان والمعاملات وحفظ الإصدارات. |
| Market Intelligence | `market-intelligence.html` | عرض طبقة معلومات السوق والمصادر المساندة. |
| Export | `export.html` | مسار التصدير العام. |
| المنطق المشترك | `shared/` | المعايرة، التحقق، الأدلة، التشخيصات، وربط المنطقة بالخريطة. |
| وظائف Netlify | `netlify/functions/` | API وعمليات الوصول إلى البيانات والخدمات الخارجية. |
| النصوص والأتمتة | `scripts/` | جلب البيانات وتنظيفها وإثراؤها وتقييمها. |
| الاختبارات | `tests/` | اختبارات Node المدمجة لجميع الطبقات الحساسة. |
| البيانات | `data/` | البيانات الخام والمُنظفة وartifacts التقييم والتشخيص. |
| النماذج | `models/` | مخرجات النموذج الآلي إن وُجدت؛ لا تستبدل طريقة التقييم الحاكمة. |

إعداد Netlify موجود في `netlify.toml`. مسارات `/api/*` تُحوّل إلى Netlify Functions، والمسار `/admin-calibration` يُحوّل إلى `calibration.html`. يجب عدم وضع أسرار أو tokens داخل الكود أو ملفات `data/` أو سجلات Git.

## 3. صفحات المستخدم

تبدأ العملية من الصفحة الرئيسية بإدخال نوع العقار، المساحة، الغرف، السنة، الحالة، التشطيب، الإطلالة، الطابق، حالة المبنى، والتأثيث عند توفرها. ثم يختار المستخدم District / Area من قائمة DLD ويستطيع تعديل نقطة العقار على الخريطة.

اختيار المنطقة يحرّك العلامة إلى **مركز تمثيلي** للمنطقة، وينقل دائرة البحث عن المرافق إليها. والعكس صحيح: النقر على الخريطة أو سحب العلامة يحاول مطابقة النقطة مع أقرب منطقة موجودة في قائمة DLD ضمن حد محافظ. إذا لم توجد مطابقة موثوقة، يُمسح اسم المنطقة بدل إسناد منطقة بعيدة أو غير صحيحة.

تحتوي قائمة DLD الحالية على **204 منطقة**. ملف `data/district-coordinates.json` يحتوي على 202 مدخلًا يغطي أسماء المناطق الـ204 عبر المطابقة المطبّعة والمرادفات. هذه الإحداثيات نقاط تمثيلية وليست حدودًا قانونية رسمية؛ لذلك يجب تعديل العلامة يدويًا عندما يكون موقع العقار معروفًا بدقة.

## 4. حالات أدلة DLD في الواجهة

تستخدم الواجهة حالات موحّدة من `shared/evidence-state.js`:

| الحالة | المعنى | سلوك القيمة |
|---|---|---|
| `ready` | توجد أدلة DLD قابلة للاستخدام. | يستمر التقييم المعتاد. |
| `limited` | توجد مقارنات، لكن عددها محدود، مثل 5–9 مقارنات. | يستمر الحساب مع تحذير واضح. |
| `insufficient` | لا توجد مقارنات كافية لإسناد Sales Comparison موثوق. | لا يُنشأ سعر fallback اصطناعي من DLD. |
| `unavailable` | تعذر الوصول إلى مصدر DLD أو خدمة البيانات. | تظهر حالة المصدر ولا تُعرض ثقة سوقية غير مستحقة. |

عند وجود إيجار صالح، يمكن لطريقة Income أن تعمل حتى عند غياب مقارنات DLD، مع توضيح أن القيمة لا تعتمد على Sales Comparison. لا يُسمح بأن تبقى نتيجة عقار سابق ظاهرة بعد بدء تقييم أو جلب أدلة لعقار جديد.

## 5. طرق التقييم وقابلية التطبيق

لا يجوز إضافة طريقة تقييم أو نوع عقار جديد إلى النظام دون قرار منهجي مستقل. مصفوفة القابلية الحالية هي:

| نوع العقار | الطرق المعتمدة حاليًا |
|---|---|
| Apartment | Sales Comparison، Income، DCF |
| Villa | Sales Comparison، Income، Cost، DCF |
| Townhouse | Sales Comparison، Income، Cost، DCF |
| Office | Sales Comparison، Income، Cost، DCF |
| Retail | Sales Comparison، Income، Cost، DCF |
| Warehouse | Sales Comparison، Income، Cost |
| Land | Sales Comparison، Income |

طريقة DCF لا تُضاف إلى Warehouse أو Land. طريقة Cost لا تُستخدم لـLand. الحقول غير المنطبقة مخفية من Calibration Console، وتُحفظ أوزانها بقيمة صفر ولا تُرسل من الواجهة كطرق معتمدة.

عند عدم انطباق طريقة، يجب أن تعيد `NOT_APPLICABLE` بدل صفر يوحي بأن الطريقة ساهمت في القيمة. وعند استخدام قيمة افتراضية مثل cap rate أو vacancy أو expense rate، يجب تمييزها كـ`ASSUMPTION` لا كحقيقة مصدرية.

## 6. Calibration Console

لوحة المعايرة مستقلة باللغة الإنجليزية وتخدم **مديرًا واحدًا**. الحفظ مباشر عبر Save، ولا توجد مرحلة Draft أو Preview. كل حفظ ينشئ هوية إصدار، وتؤثر المعايرة النشطة على التقييمات الجديدة فقط؛ لا تُعاد حساب النتائج التاريخية تلقائيًا.

القواعد الحاكمة هي:

1. يجب أن يساوي مجموع أوزان الطرق المعتمدة لكل نوع عقار **100%** ضمن tolerance قدره `1e-6`.
2. الأوزان يجب أن تقع بين `0` و`1`.
3. أوزان الطرق غير المعتمدة يجب أن تساوي صفرًا.
4. تعرض الواجهة مجموع الأوزان، وتحوّله إلى اللون الأحمر وتمنع Save عندما لا يساوي 100%.
5. يتحقق الخادم من القاعدة نفسها؛ لا تكفي حماية الواجهة.
6. كل نتيجة جديدة تسجل `calibrationConfigId` ونسخة المحرك وtrace المعاملات والافتراضات.
7. القراءة العامة للإعداد النشط لا تكشف secret الإدارة؛ POST وقراءة history تتطلبان التحقق الإداري.

الإعداد النشط الموثق حاليًا هو `cal-1787651025399`، وإصدار المحرك `22.1.0`. لا تضع token الإداري في README أو commit أو command line أو logs. إذا احتاج السر إلى تغيير، يجب تدويره من إعدادات Netlify ثم اختبار المصادقة دون كشف قيمته.

## 7. تنظيف بيانات DLD وسجل الأدلة

الملف الخام `data/dld-transactions.csv` محفوظ كما هو ولا يُعدّل. ينتج `scripts/fetch-dld.js` طبقات منفصلة:

| الطبقة | الملف | الوظيفة |
|---|---|---|
| Raw | `data/dld-transactions.csv` | المصدر الخام المحفوظ للتدقيق. |
| Eligible | `data/dld-transactions.json` | السجلات المسموح باستخدامها في Accuracy والمسارات التابعة. |
| Rejected ledger | `data/dld-transactions-rejected.json` | السجلات المرفوضة وأسباب الرفض، ولا تدخل Accuracy. |
| Cleaning report | `data/dld-cleaning-report.json` | checksum والأعداد وأسباب الاستبعاد. |

آخر snapshot موثق:

| المؤشر | العدد |
|---|---:|
| السجلات المقروءة من الخام | 30,475 |
| السجلات normalized | 30,328 |
| السجلات eligible | 26,766 |
| السجلات المرفوضة | 3,562 |
| السجلات المتخطاة/غير الصالحة | 128 |
| transaction IDs المكررة | 19 |
| Commercial / General Use land المستبعدة من Accuracy | 2,944 |
| Ultra-luxury المستبعدة وفق القاعدة الحالية | 618 |

checksum الحالي للملف الخام المنظف هو:

`5d863484f69278615cd6b116ade988d50b77ef0406b20b22495f18c0e0a3d019`

تُستخدم السجلات verified والصالحة فقط في Accuracy الرسمية. Commercial وGeneral Use land مستبعدة من Accuracy الرسمية لكنها محفوظة في raw/rejected ledger للتدقيق. لا يجوز استخدام السجل المرفوض في المقارنات أو إدخاله إلى Accuracy عن طريق مسار بديل.

## 8. Accuracy والتشخيصات

ملف `data/accuracy-data.json` هو artifact Accuracy الرسمي الحالي، ويحتوي على **8,221 نتيجة** ضمن نطاق البيانات والتنظيف والنافذة الزمنية المعتمدة. المؤشر الحالي يقارب **85.2% Accuracy**، مع متوسط انحراف مطلق يقارب **14.8%**. هذه مؤشرات snapshot وليست ضمانًا لأداء مستقبلي؛ يجب قراءة تاريخ تحديث البيانات و`calibrationConfigId` مع كل مقارنة.

تحتوي كل نتيجة Accuracy، بالإضافة إلى أعمدة DLD، على إحداثيات GIS، نتيجة AQAR، الفرق عن السعر الفعلي، مستوى المقارنة، عدد المقارنات، معاملات GIS والإطلالة، هوية المعايرة، طرق التقييم، الافتراضات، وتشخيصات المقارنات.

| artifact | الغرض |
|---|---|
| `data/accuracy-data.json` | النتائج الرسمية التفصيلية. |
| `data/accuracy-diagnostics.json` | شرائح الخطأ والتغطية والحالات غير المسعّرة. |
| `data/comparable-selection-audit.json` | أسباب اختيار مستوى المقارنة والحالات غير المسعّرة. |
| `data/comparable-holdout-analysis.json` | تجربة تحليلية معزولة لسياسات fallback؛ لا تغيّر الإنتاج. |
| `data/fallback-policy-experiment-2026-08-25.json` | نتائج مقارنة baseline والسياسات البديلة. |
| `data/dld-cleaning-report.json` | أدلة مصدر Accuracy والتنظيف. |

تشخيصات `comparableDiagnostics` وصفية ولا تغيّر القيمة الحالية. تشمل counts حسب مستوى المقارنة، توزيعات سعر المتر، quartiles، IQR، max/min ratio، dispersion flags، وLand xlarge flag. أُجريت تجربة fallback معزولة لرفع حد District size من 5 إلى 10 وحماية Land xlarge، لكن لم تُطبّق أي من السياسات البديلة إنتاجيًا. الوضع الحالي يبقي fallback الإنتاجي كما هو.

## 9. أعمدة البيانات

### أعمدة معاملات DLD

تشمل السجلات الأساسية: `propertyRef`، `transactionNumber`، `instanceDate`، `saleDate`، `propertyType`، `propType`، `propSubType`، `usage`، `district`، `area`، `procedureArea`، `actualSalePrice`، `rooms`، `parking`، `nearestMetro`، `nearestMall`، `nearestLandmark`، `masterProject`، `project`، `isOffPlan`، `isFreeHold`، `group`، `procedure`، `totalBuyer`، `totalSeller`، `city`، `scrapedFrom`، `verifiedBy`، `dataSource`، `sourceTransactionId`، `evidenceStatus`، `rejectionReason`، و`pricePerSqm`.

### أعمدة Accuracy الإضافية

تضيف Accuracy: `lat`، `lng`، `gisScore`، `gisFacilities`، `gisMatchedBy`، `hasGis`، `aqarValuation`، `aqarVsActual`، `evalLevel`، `evalCount`، `gisMultiplier`، `viewMultiplier`، `viewTypes`، `calibrationConfigId`، `valuationMethods`، `calibrationAssumptions`، و`comparableDiagnostics`.

## 10. تدفق تحديث البيانات اليومي

يُعرّف التدفق في `.github/workflows/update-accuracy.yml` ويُشغّل يوميًا عند الساعة 06:00 UTC أو يدويًا عبر `workflow_dispatch`. الترتيب الحالي هو:

| الطبقة | العملية |
|---:|---|
| 1 | جلب consultancy reports. |
| 2 | جلب developer projects. |
| 3 | جلب government data. |
| 4 | جلب DLD transactions الخام وتنظيفها. |
| 5 | التحقق من verified DLD ومنع تسرب rejected records. |
| 6 | جلب/تحديث OSM GIS مع timeout ومواصلة workflow عند الفشل. |
| 7 | إثراء السجلات eligible بالإحداثيات وبيانات GIS. |
| 8 | توليد Market Intelligence. |
| 9 | تحميل active calibration. |
| 10 | إعادة تقييم السجلات وتوليد Accuracy وartifacts. |
| 11 | تدريب نموذج ML اختياري مع استمرار workflow عند فشله. |
| 12 | إضافة `data/` و`models/` إلى commit الآلي عند وجود تغييرات. |

البيانات الخارجية قد تتأخر أو تفشل أو تتغير. لذلك يجب فحص logs وchecksum وcounts وcalibration identity بعد أي تحديث مهم، وعدم اعتبار نجاح workflow وحده دليلًا كافيًا على سلامة النتائج.

## 11. أوامر التطوير والاختبار

يتطلب المشروع Node.js 22 تقريبًا، مع Python 3.11 عند تشغيل تدريب النموذج. بعد تثبيت الاعتماديات يمكن استخدام:

| الأمر | الوظيفة |
|---|---|
| `npm test` | تشغيل جميع اختبارات Node. |
| `npm run build` | فحص البناء؛ المشروع الثابت لا يحتاج build فعليًا ويطبع رسالة تأكيد. |
| `npm run fetch` | تشغيل جلب المعاملات وفق script الحالي. |
| `npm run evaluate` | تشغيل evaluator وتوليد artifacts التقييم. |
| `npm run validate-dld` | التحقق من بيانات DLD ومنع rejected leakage. |
| `npm run fetch-calibration` | تحميل active calibration إلى artifact محلي. |
| `npm run fetch-osm` | تحديث بيانات OSM/GIS وفق الإعداد الحالي. |
| `node --check <file>` | فحص تركيب JavaScript لملف محدد. |
| `node /home/ubuntu/check-inline-script.cjs` | فحص JavaScript المضمن داخل الصفحات عند توفر الأداة في بيئة العمل. |
| `git diff --check` | فحص أخطاء المسافات والتنسيق قبل الالتزام. |

آخر حالة موثقة للاختبارات هي **46/46 ناجحة**، وتشمل اختبارات المعايرة، تنظيف DLD، Accuracy، تشخيص المقارنات، حالات الأدلة، وربط الخريطة بالمناطق.

## 12. الاختبارات المطلوبة قبل النشر

قبل نشر أي تغيير، يجب تشغيل الاختبارات البرمجية، فحص JavaScript المضمن، ومراجعة `git diff --check`. وبعدها يجب اختبار المسارات الأساسية في المتصفح: تحميل الصفحة، اختيار منطقة، تحريك العلامة، جلب أدلة DLD، تقييم مع أدلة جاهزة، تقييم مع أدلة محدودة، غياب أدلة DLD، Income دون Sales evidence، Reset، وعدم بقاء نتيجة قديمة بعد تغيير العقار.

أي تغيير في Calibration أو evaluator يجب أن يضيف اختبارًا يثبت القاعدة الجديدة، ويجب أن يوضح ما إذا كان التغيير يؤثر على التقييمات الجديدة فقط أو يعيد توليد Accuracy. لا يُسمح بتغيير artifacts الرسمية يدويًا بهدف تحسين المؤشر.

## 13. قرارات منهجية حاكمة

القرارات المعتمدة موثقة في `docs/methodology-decisions.md`. أهمها: استقلال AQAR عن MIAYAAR، إبقاء DCF ضمن القابلية الحالية فقط، اعتماد Sales Comparison وIncome للأراضي، منع البيانات الاصطناعية من Accuracy الرسمية، إزالة Appraiser comparison من Accuracy، اعتماد معاملات View وGIS الحالية، إظهار الافتراضات، والإبقاء على واجهة إنجليزية.

كل نتيجة يجب أن تكون قابلة لتحديد نسخة المحرك ونسخة البيانات والمعايرة. يجب فصل `SOURCE_FACT` و`DERIVED_VALUE` و`ASSUMPTION` و`MODEL_OUTPUT` في trace، ويجب أن تبقى الطرق غير المنطبقة `NOT_APPLICABLE`.

## 14. القرارات والحقول المؤجلة

تم تأجيل إضافة حقول جديدة إلى واجهة الإدخال ونتيجة التقييم حتى تُراجع بنية المستودع وتُعتمد خطة عمل آمنة. الاقتراحات التي نوقشت، لكنها **ليست تنفيذًا معتمدًا بعد**، تشمل: اسم المشروع أو المبنى، نوع الوحدة التفصيلي، الفصل بين BUA وPlot Area، عدد الحمامات، الطابق الرقمي، سنة آخر تجديد، خصائص الوحدة الخاصة، عدد مواقف السيارات، وحقول Income المتقدمة.

يجب ألا يبدأ تنفيذ هذه الحقول قبل تحديد: هل ستُستخدم في اختيار المقارنات أم في طريقة تقييم، مصدرها، القيم المسموحة، أثرها على الأنواع المختلفة، أثرها على Accuracy، وسلوكها عند تركها فارغة. كما يجب عدم إضافة أنواع عقارات أو طرق تقييم أو معاملات جديدة لمجرد توسيع النموذج.

## 15. القيود المعروفة

الخريطة تستخدم نقاطًا تمثيلية لبعض المناطق، وليست طبقة حدود رسمية. تعتمد المرافق على خدمات GIS خارجية قد تفشل أو تتأخر. قائمة DLD تتغير مع تحديث البيانات، وقد تتغير أعداد المناطق والسجلات والـAccuracy بعد إعادة التنظيف. بعض مناطق DLD الفرعية قد تشترك في مركز تمثيلي واحد.

Accuracy الحالية تقيس snapshot محددًا من البيانات المعتمدة ولا تثبت أن كل عقار مستقبلي سيحصل على نتيجة مساوية. الحالات ذات الأدلة المحدودة أو dispersion العالي تحتاج مراجعة بشرية أكبر. لم تُطبّق بعد سياسة جديدة خاصة بـLand xlarge أو District size 5–9.

## 16. قواعد العمل الآمن

احفظ الملف الخام ولا تعدّله. لا تخلط rejected ledger مع eligible data. لا تضع الأسرار في Git أو README أو logs أو command lines. لا تحفظ calibration غير صحيحة. لا تعِد حساب النتائج التاريخية بسبب تعديل جديد دون قرار واضح. لا تنشر سياسة fallback جديدة أو calibration جديدة آليًا دون تقرير مقارن وموافقة المالك.

عند ظهور اختلاف بين الواجهة وoffline/Accuracy، يجب مراجعة `shared/calibration-engine.js` و`shared/evidence-state.js` والـartifacts المرتبطة قبل تعديل أي مسار منفرد. عند ظهور اختلاف في أعداد البيانات، ابدأ من raw checksum ثم cleaning report ثم validation ثم Accuracy metadata.

## 17. مراجع المشروع

[1]: https://github.com/Hichemorca/aqar-evaluate-engine "AQAR Valuation Engine repository"

[2]: https://aqar-valuation-engine.netlify.app/ "AQAR live platform"

[3]: https://www.openstreetmap.org/ "OpenStreetMap map data"

[4]: https://nominatim.openstreetmap.org/ "Nominatim geocoding service"

[5]: https://docs.netlify.com/ "Netlify documentation"

[6]: https://docs.github.com/en/actions "GitHub Actions documentation"
