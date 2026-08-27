# MIAYAAR Valuation Intelligence Engine

**MIAYAAR** منصة ويب لتقييم العقارات في دبي، تجمع بين بيانات معاملات دائرة الأراضي والأملاك في دبي (DLD)، المقارنات السعرية، طرق التقييم المعتمدة، بيانات GIS والمرافق، وطبقة معايرة إدارية قابلة للتتبع. الاسم التجاري والهوية البصرية المعتمدان للمشروع هما MIAYAAR — Valuation Intelligence Engine.

> **حالة المشروع:** المنصة جاهزة للاستخدام التجريبي والمحدود (Pilot/BETA). لا ينبغي اعتبار القيمة الناتجة تقرير تقييم رسميًا أو بديلًا عن مراجعة مثمّن مرخّص، خصوصًا في التمويل والضمانات والقرارات القانونية.

| الرابط | الاستخدام |
|---|---|
| [المنصة الحية](https://aqar-valuation-engine.netlify.app/) | نموذج التقييم التفاعلي. |
| [المستودع](https://github.com/Hichemorca/aqar-evaluate-engine) | الكود والبيانات والاختبارات وسجل التغييرات. |
| `/admin-calibration` | مسار لوحة Calibration Console الإدارية. |
| `/accuracy-dashboard` | لوحة قياس Accuracy الرسمية. |
| `/market-intelligence` | صفحة Market Intelligence. |
| `/export` | صفحة التصدير العامة. |
| [دليل المستخدم العربي](docs/user-guide-ar.md) | خطوات استخدام المنصة وقراءة النتيجة باللغة العربية. |
| [English user guide](docs/user-guide-en.md) | Platform usage steps and result interpretation in English. |
| [دليل المدير العربي](docs/admin-guide-ar.md) | إدارة Calibration Console وقواعد الحفظ الآمن باللغة العربية. |
| [English administrator guide](docs/admin-guide-en.md) | Calibration Console administration and safe-save procedures in English. |
| [دليل المطورين العربي](docs/developer-guide-ar.md) | بنية الكود والـAPI وخوارزميات التقييم للمطورين. |

## الهوية البصرية

الاسم الرسمي للمنصة هو **MIAYAAR — Valuation Intelligence Engine**. يستخدم الموقع الشعار الأفقي الداكن في الرؤوس العامة، والأيقونة المختصرة في الصفحات الإدارية وfavicon. لوحة الألوان الأساسية هي الكحلي الداكن `#07111f`، الأزرق `#173454`، والأخضر `#0aa66f` مع أخضر ساطع `#23c98b`. بقي اللون الذهبي للأحوال الدلالية مثل التحذيرات والثقة المتوسطة، وليس كلون العلامة الأساسي. الخط التشغيلي هو `Inter` لسهولة قراءة الأرقام والبيانات، بينما يحافظ الشعار على حروفه الهندسية الخاصة.

## 1. نطاق المنصة

تعمل MIAYAAR حاليًا على بيانات دبي فقط. أنواع العقارات الموجودة في النظام هي: **Apartment، Villa، Townhouse، Office، Retail، Warehouse، Land**. اللغة التشغيلية الحالية للواجهة هي الإنجليزية، مع تحسين الوضوح النصي دون إضافة تبديل لغة في هذه المرحلة.

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

وظيفة `netlify/functions/scrape.js` legacy وليست جزءًا من مسار التقييم الحالي؛ الواجهة تستخدم `dld-lookup` و`fetch-osm` بدلًا منها. لذلك تكون وظيفة ScrapingBee معطلة افتراضيًا وتعيد `410 Gone` ولا تسمح بـ CORS عام. لا تُفعّلها إلا بعد إضافة حماية وصول وrate limiting ومراجعة تشغيلية مستقلة عبر متغير البيئة `SCRAPE_ENDPOINT_ENABLED=true`.

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

## 7. User Input Observation Layer

تحتفظ المنصة بحقول v2.1 الاختيارية وتتيح للمستخدم مشاركة مدخلات العقار ونتيجة التقييم للتحليل المجهول عبر موافقة اختيارية واضحة. عدم تحديد الموافقة لا يمنع التقييم ولا يغيّر القيمة الناتجة. عند الموافقة، يرسل المتصفح observation بعد اكتمال التقييم إلى `POST /api/valuation-observation`، ويكون فشل التسجيل غير حاجب للتقييم.

تُحفظ observations في مساحة Netlify Blobs مستقلة باسم `aqar-input-observations`، ولا تُكتب في `data/accuracy-data.json` أو `data/dld-transactions.json` أو calibration history. كل سجل يحمل `schemaVersion` و`calibrationConfigId` و`baselineValue` و`shadowValue` و`shadowTrace` وحالة مصدر Project. القيم الفارغة وUnknown محايدة، والنص الحر للمشروع لا يُعامل كـDLD verified.

| القاعدة | السلوك |
|---|---|
| Consent | opt-in صريح؛ لا يُسجل observation عند عدم الموافقة. |
| Privacy | لا تُحفظ أسماء أو بريد أو هاتف أو authorization headers أو tokens أو أسرار. |
| Validation | التحقق الخادمي يرفض النوع غير الصالح، الحقول غير المنطبقة، سنة التجديد غير الصحيحة، المشروع الموثق بلا مصدر DLD، والـpayload الكبير. |
| Evidence | إدخال المستخدم ليس market truth؛ outcome لاحق لا يدخل أي تحليل Accuracy إلا بعد توثيقه. |
| Production boundary | observations وshadow trace للتحليل فقط؛ لا تغيّر evaluator أو الأوزان أو fallback أو Accuracy الرسمية. |

المواصفة الكاملة موجودة في `docs/v2.1-input-observation-spec.md`. مسار التسجيل في `netlify/functions/valuation-observation.js`، واختباراته في `tests/valuation-observation.test.js`. يجب مراجعة سياسة الاحتفاظ والخصوصية قبل فتح جمع البيانات على نطاق واسع.

## 8. تنظيف بيانات DLD وسجل الأدلة

الملف الخام `data/dld-transactions.csv` محفوظ كما هو ولا يُعدّل. ينتج `scripts/fetch-dld.js` طبقات منفصلة:

| الطبقة | الملف | الوظيفة |
|---|---|---|
| Raw | `data/dld-transactions.csv` | المصدر الخام المحفوظ للتدقيق. |
| Eligible | `data/dld-transactions.json` | السجلات المسموح باستخدامها في Accuracy والمسارات التابعة. |
| Rejected ledger | `data/dld-transactions-rejected.json` | السجلات المرفوضة وأسباب الرفض، ولا تدخل Accuracy. |
| Cleaning report | `data/dld-cleaning-report.json` | checksum والأعداد وأسباب الاستبعاد. |

تستخدم الصفحة الرئيسية ملفات client summaries خفيفة مشتقة تلقائيًا من artifacts الرسمية لتقليل التحميل الأولي:

| الملف | المصدر | الاستخدام في الواجهة |
|---|---|---|
| `data/district-list.json` | `data/dld-transactions.json` | قائمة District / Area فقط. |
| `data/project-building-summary.json` | `data/dld-transactions.json` | اقتراحات Project / Building Name وعدد المعاملات المرتبطة بها. |
| `data/accuracy-summary.json` | `data/accuracy-data.json` | أرقام Accuracy وتاريخ التحديث فقط. |

تُولّد هذه الملفات عبر `scripts/generate-client-summaries.js` بعد تحديث البيانات، وتبقى الملفات الكاملة هي المصدر الرسمي الوحيد للمقارنات وAccuracy والتدقيق. يمكن تشغيل `node scripts/generate-client-summaries.js --check` للتحقق من أن summaries ليست قديمة.

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

ملف `data/accuracy-data.json` هو artifact Accuracy الرسمي الحالي، ويحتوي على **8,108 نتائج** ضمن نطاق البيانات والتنظيف والنافذة الزمنية المعتمدة. المؤشر الحالي هو **85.1% Accuracy** تقريبًا، مع متوسط انحراف مطلق يقارب **14.9%**. هذه مؤشرات snapshot وليست ضمانًا لأداء مستقبلي؛ يجب قراءة تاريخ تحديث البيانات و`calibrationConfigId` مع كل مقارنة. وتُعد ملفات Accuracy وDLD الرسمية محمية ببوابة provenance وintegrity ولا يجوز تعديلها يدويًا.

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

## 10. فصل المسارات التجريبية عن Accuracy الرسمية

`scripts/fetch-transactions.js` مولد تجريبي قديم ينشئ `data/fetched-transactions.json` باستخدام قيم تقديرية وعشوائية لأغراض العرض أو الاختبار فقط. لا يُستخدم في workflow الحالي، ولا يكتب `dld-transactions.json` أو `accuracy-data.json`، ولا يجوز استخدام مخرجاته في المقارنات أو Accuracy الرسمية. المسار الرسمي يعتمد على `scripts/fetch-dld.js` ثم `scripts/evaluate-and-save.js` باستخدام artifacts DLD المنظفة.

`netlify/functions/scrape-sold.js` لا يختلق سجلات، لكنه legacy وغير مستخدم من مسار المنتج الحالي؛ لذلك عُطّل افتراضيًا ويعيد `410 Gone` دون CORS عام. أما `netlify/functions/scrape.js` فقد عُطّل افتراضيًا للسبب نفسه. لا تُفعّل أيًا منهما قبل إضافة حماية وصول وrate limiting ومراجعة تشغيلية مستقلة.

يُعرّف `.github/workflows/ci.yml` فحوص ما قبل الدمج عند كل `push` و`pull_request`، وتشمل `npm ci` وPlaywright Chromium و`npm run mobile-smoke` و`npm test` والتحقق من summaries وJavaScript syntax وpatch formatting.

## 11. تدفق تحديث البيانات اليومي

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
| 11 | توليد diagnostics وclient summaries ثم تشغيل integrity/provenance gate. |
| 12 | تدريب نموذج ML اختياري مع استمرار workflow عند فشله. |
| 13 | تسوية الفرع مع `origin/main` ثم إضافة `data/` و`models/` إلى commit الآلي عند وجود تغييرات. |

يحتوي workflow على concurrency وAction SHA pinning وPython requirements ثابتة وبوابة integrity رسمية. **تبقى مراجعة ما بعد `git pull --rebase` و`git stash pop` قبل commit مهمة مؤجلة**؛ لذلك يجب عدم اعتبار نجاح خطوة التحقق السابقة للتسوية ضمانًا كافيًا إذا حدث سباق مع تغيير upstream. هذه المراجعة لا تغيّر سلوك التقييم، لكنها سبب إضافي لفحص diff وartifacts قبل الاعتماد على أي تحديث يومي.

البيانات الخارجية قد تتأخر أو تفشل أو تتغير. لذلك يجب فحص logs وchecksum وcounts وcalibration identity بعد أي تحديث مهم، وعدم اعتبار نجاح workflow وحده دليلًا كافيًا على سلامة النتائج.

## 12. أوامر التطوير والاختبار

يتطلب المشروع Node.js 22 تقريبًا، مع Python 3.11 عند تشغيل تدريب النموذج. بعد تثبيت الاعتماديات يمكن استخدام:

| الأمر | الوظيفة |
|---|---|
| `npm test` | تشغيل جميع اختبارات Node. |
| `npm run build` | فحص البناء؛ المشروع الثابت لا يحتاج build فعليًا ويطبع رسالة تأكيد. |
| `npm run fetch` | تشغيل جلب المعاملات وفق script الحالي. |
| `npm run evaluate` | تشغيل evaluator وتوليد artifacts التقييم. |
| `npm run diagnostics` | توليد مؤشرات تشخيصية مشتقة فقط من `data/accuracy-data.json` إلى `data/accuracy-diagnostics.json`. |
| `npm run validate-dld` | التحقق من بيانات DLD ومنع rejected leakage. |
| `npm run fetch-calibration` | تحميل active calibration إلى artifact محلي. |
| `npm run fetch-osm` | تحديث بيانات OSM/GIS وفق الإعداد الحالي. |
| `npm run validate-artifacts` | تشغيل بوابة integrity وprovenance للـofficial artifacts. |
| `npm run mobile-smoke` | تشغيل mobile smoke بمحاكاة Pixel 5 وiPhone 13. |
| `npm run reproducibility-drift` | إعادة تشغيل evaluator داخل مجلدات مؤقتة بتاريخ ثابت وقياس date drift، دون تعديل official artifacts. |
| `node --check <file>` | فحص تركيب JavaScript لملف محدد. |
| `node /home/ubuntu/check-inline-script.cjs` | فحص JavaScript المضمن داخل الصفحات عند توفر الأداة في بيئة العمل. |
| `git diff --check` | فحص أخطاء المسافات والتنسيق قبل الالتزام. |

### Accuracy diagnostics

ينتج `npm run diagnostics` ملف `data/accuracy-diagnostics.json` بصورة حتمية من artifact Accuracy الرسمي `data/accuracy-data.json` فقط. يعرض الملف توزيع الخطأ المطلق، median وP90 وP95، bias، شرائح نوع العقار ومستوى التقييم والمساحة والشهر، أسوأ الشرائح ذات العينة الكافية، أعلى الأخطاء، وفحوص provenance واتساق buckets. هذا الملف **تشخيصي فقط**؛ لا يغيّر Accuracy الرسمية أو calibration أو الأوزان أو معاملات التقييم أو بيانات DLD.

### PR-01: reproducibility وdate drift

أُضيف `scripts/reproducibility-drift.js` كتجربة قراءة فقط. يعيد harness تشغيل evaluator الحالي داخل مجلدات مؤقتة مع `FIXED_NOW` ثابت، ويقارن `market-data.json` الكامل بصورة منفصلة عن Accuracy ذات نافذة 120 يومًا. تشغيلان بنفس التاريخ أنتجا artifacts متطابقة، بينما أدت مقارنة تواريخ مختلفة إلى drift قابل للقياس في القيم؛ لذلك يجب تثبيت تاريخ التقييم عند إعادة بناء Accuracy التاريخية. التفاصيل والنتائج محفوظة في `docs/reproducibility-drift-review-2026-08-27.md` و`docs/reproducibility-drift-2026-08-27.json`.

يحتوي diagnostics على SHA-256 للـartifact المصدر حتى يمكن اكتشاف عدم التزامن بين المؤشرات والبيانات، ويجب إعادة توليده بعد كل تحديث رسمي للـAccuracy. لا يجوز استخدام outliers أو أي شريحة تشخيصية لتعديل المعاملات مباشرة؛ يلزم validation زمني/قطاعي مستقل وموافقة صريحة قبل أي تغيير منهجي.

آخر baseline موثق للاختبارات هو **121/121 ناجحة**، وتشمل اختبارات المعايرة، تنظيف DLD، Accuracy، diagnostics، تشخيص المقارنات، حالات الأدلة، ربط الخريطة بالمناطق، workflow integrity، mobile smoke، وتجربة reproducibility.

## 13. الاختبارات المطلوبة قبل النشر

قبل نشر أي تغيير، يجب تشغيل الاختبارات البرمجية، `npm run mobile-smoke`، بوابة `npm run validate-artifacts`، فحص JavaScript المضمن، ومراجعة `git diff --check`. وبعدها يجب اختبار المسارات الأساسية في المتصفح: تحميل الصفحة، اختيار منطقة، تحريك العلامة، جلب أدلة DLD، تقييم مع أدلة جاهزة، تقييم مع أدلة محدودة، غياب أدلة DLD، Income دون Sales evidence، Reset، وعدم بقاء نتيجة قديمة بعد تغيير العقار. لا تُشغّل `npm run evaluate` أو workflow اليومي لمجرد التحقيق؛ كلاهما قد يعيد كتابة artifacts.

أي تغيير في Calibration أو evaluator يجب أن يضيف اختبارًا يثبت القاعدة الجديدة، ويجب أن يوضح ما إذا كان التغيير يؤثر على التقييمات الجديدة فقط أو يعيد توليد Accuracy. لا يُسمح بتغيير artifacts الرسمية يدويًا بهدف تحسين المؤشر.

## 14. قرارات منهجية حاكمة

القرارات المعتمدة موثقة في `docs/methodology-decisions.md`. أهمها: استقلال AQAR عن MIAYAAR، إبقاء DCF ضمن القابلية الحالية فقط، اعتماد Sales Comparison وIncome للأراضي، منع البيانات الاصطناعية من Accuracy الرسمية، إزالة Appraiser comparison من Accuracy، اعتماد معاملات View وGIS الحالية، إظهار الافتراضات، والإبقاء على واجهة إنجليزية.

كل نتيجة يجب أن تكون قابلة لتحديد نسخة المحرك ونسخة البيانات والمعايرة. يجب فصل `SOURCE_FACT` و`DERIVED_VALUE` و`ASSUMPTION` و`MODEL_OUTPUT` في trace، ويجب أن تبقى الطرق غير المنطبقة `NOT_APPLICABLE`.

## 15. v2.1 حقول العقار الإضافية

تم تنفيذ الإصدار v2.1 على فرع `feature/v2.1-property-fields` كواجهة وpayload وشرح نتيجة وتحليل معزول فقط. الحقول الجديدة الاختيارية هي: `Project / Building Name` للـ Apartment وVilla وTownhouse، و`BUA` للـ Villa وTownhouse فقط، و`Plot Area` للـ Villa وTownhouse وLand، و`Last Renovation Year` للـ Apartment وVilla وTownhouse عندما يكون عمر العقار أكبر من خمس سنوات. بقيت حقول `Detailed Unit Type` و`Floor` و`Parking Count` كما هي دون حذف أو تغيير.

يستخدم Project / Building اقتراحات من `masterProject` و`project` في معاملات DLD، وتُفلتر الاقتراحات حسب المنطقة والنوع. الاسم المدخل يدويًا لا يُعامل كبيان موثق، وإذا كانت أدلة المشروع محدودة يبقى District هو fallback المرئي. أضيفت direct multipliers بقيمة محايدة `1.00`: معامل خاص للمشروع الموثق، ومعامل لنسبة `BUA ÷ Plot Area` للـ Villa/Townhouse، ومعامل لحداثة التجديد. حاصل ضرب هذه المعاملات يظهر في shadow preview فقط، ولا يستبدل القيمة الرسمية أو يدخل Accuracy قبل موافقة منفصلة.

أثبت التحليل المعزول أن Project / Building قابل للقياس من بيانات DLD الحالية، مع تغطية 76.56% للشقق و89.29% للفلل، بينما لا تحتوي سجلات DLD أو Accuracy الحالية على حقول موثقة منفصلة لـ BUA أو Plot Area أو Last Renovation Year. لذلك لا يجوز إعادة تسمية `area` أو `procedureArea` تلقائيًا إلى BUA أو Plot Area، ولا يجوز توليد قيم اصطناعية لهذه الحقول. التفاصيل الكاملة في `docs/v2.1-property-fields-spec.md` و`docs/v2.1-property-fields-analysis.md`.

تُدار direct multipliers من Calibration Console ضمن قسم مستقل عن أوزان المناهج. الإعداد الافتراضي shadow معطل، والشرائح المفتوحة تحفظ كـ `null`، ومفاتيح المشاريع تُحفظ بصيغة `property type | district | project`. أي تفعيل أو تغيير رسمي يتطلب مصدرًا موثقًا، تجربة shadow معزولة، مقارنة MAE وbias وP90 و±15% وcoverage وfallback transitions، ثم موافقة المالك الصريحة. لا يغيّر v2.1 الحالي أنواع العقارات أو طرق التقييم أو calibration الرسمي أو الأوزان أو fallback أو artifacts التاريخية.

## 16. القيود المعروفة

الخريطة تستخدم نقاطًا تمثيلية لبعض المناطق، وليست طبقة حدود رسمية. تعتمد المرافق على خدمات GIS خارجية قد تفشل أو تتأخر. قائمة DLD تتغير مع تحديث البيانات، وقد تتغير أعداد المناطق والسجلات والـAccuracy بعد إعادة التنظيف. بعض مناطق DLD الفرعية قد تشترك في مركز تمثيلي واحد.

Accuracy الحالية تقيس snapshot محددًا من البيانات المعتمدة ولا تثبت أن كل عقار مستقبلي سيحصل على نتيجة مساوية. الحالات ذات الأدلة المحدودة أو dispersion العالي تحتاج مراجعة بشرية أكبر. لم تُطبّق بعد سياسة جديدة خاصة بـLand xlarge أو District size 5–9.

## 17. حالة الجاهزية والمهام المؤجلة

النسخة الحالية مناسبة لـ**pilot محدود ومضبوط** وليست تقرير تقييم رسميًا أو بديلًا عن مراجعة مثمّن مرخّص. تم التحقق من mobile emulation على Pixel 5 وiPhone 13، لكن ذلك لا يعادل اختبار جهاز Android وiOS فعليين. كما أن PR-01 أثبت repeatability عند تثبيت تاريخ التقييم، وأثبت date drift عند تغييره.

المهام التالية **مؤجلة وليست تغييرات مطلوبة للـpilot الحالي**: نقل integrity gate إلى ما بعد reconciliation النهائي في workflow، إنشاء مصدر واحد معتمد لمصفوفة المنهجية والأوزان، إضافة دورة Draft → Test → Review → Approved → Production للمعايرة، وإجراء اختبار reproducibility رسمي قائم على `asOfDate` داخل evaluator. لا تُنفذ هذه البنود تلقائيًا ولا تغيّر أي قيمة إنتاجية دون validation وموافقة صريحة.

## 18. قواعد العمل الآمن

احفظ الملف الخام ولا تعدّله. لا تخلط rejected ledger مع eligible data. لا تضع الأسرار في Git أو README أو logs أو command lines. لا تحفظ calibration غير صحيحة. لا تعِد حساب النتائج التاريخية بسبب تعديل جديد دون قرار واضح. لا تنشر سياسة fallback جديدة أو calibration جديدة آليًا دون تقرير مقارن وموافقة المالك.

عند ظهور اختلاف بين الواجهة وoffline/Accuracy، يجب مراجعة `shared/calibration-engine.js` و`shared/evidence-state.js` والـartifacts المرتبطة قبل تعديل أي مسار منفرد. عند ظهور اختلاف في أعداد البيانات، ابدأ من raw checksum ثم cleaning report ثم validation ثم Accuracy metadata.

## 19. مراجع المشروع

[1]: https://github.com/Hichemorca/aqar-evaluate-engine "AQAR Valuation Engine repository"

[2]: https://aqar-valuation-engine.netlify.app/ "AQAR live platform"

[3]: https://www.openstreetmap.org/ "OpenStreetMap map data"

[4]: https://nominatim.openstreetmap.org/ "Nominatim geocoding service"

[5]: https://docs.netlify.com/ "Netlify documentation"

[6]: https://docs.github.com/en/actions "GitHub Actions documentation"

[7]: https://github.com/Hichemorca/aqar-evaluate-engine/blob/main/docs/reproducibility-drift-review-2026-08-27.md "PR-01 reproducibility and date-drift review"

[8]: https://github.com/Hichemorca/aqar-evaluate-engine/blob/main/docs/real-trial-readiness-2026-08-27.md "Real-trial readiness runbook"
