# AQAR-CORRECTION-REPORT

**العنوان:** AQAR — Controlled Correction & Hardening

**تاريخ التقرير:** 25 أغسطس 2026

**Baseline:** `main` بعد الإصلاحات السابقة الخاصة بتزامن مؤشرات الدقة وGIS وautocomplete.

**المبدأ الحاكم:** تم تنفيذ الإصلاحات التقنية القابلة للعكس والتي لا تحتاج قرارًا منهجيًا، مع الحفاظ على values وweights وcoefficients وproperty types وbusiness meaning الحالية. البنود المتعارضة أو غير الموثقة منهجيًا لم تُحسم بالتخمين.

## 1. Bugs found

وجد التدقيق الأولي ازدواجية بين محرك الواجهة وخط التقييم offline، ونسخة cleaning pipeline مكررة داخل `evaluate-and-save.js`، وسياسة property/method غير مشتركة، وغياب test script حقيقي. كما وجد أن `package.json` كان يستدعي اسمًا غير موجود لسكربت GIS، وأن state المخفي في الواجهة كان قابلًا للانتقال عند تغيير النوع، وأن المساحة كانت تُجبر إلى 10 م² داخل جمع البيانات بدل أن تبقى قيمة غير صالحة ليتم رفضها.

كذلك كان endpoint `dld-lookup` لا يفرض allowlist مشتركة للنوع ولا تحققًا رقميًا للمساحة قبل جلب البيانات، وكانت النتيجة التفاعلية تعرض الطرق المستخدمة فقط دون حالة الطرق غير المنطبقة. أظهر التدقيق أيضًا أن `scrape-sold.js` و`evaluate-and-save.js` يحتويان على بيانات/مقارنات مولدة باستخدام `Math.random()` في مسارات accuracy، وهي مشكلة مصدر وأدلة وليست مجرد مشكلة عرض.

## 2. Bugs fixed

| الإصلاح | السلوك قبل | السلوك بعد |
|---|---|---|
| GIS npm command | `npm run fetch-osm` يشير إلى ملف غير موجود | يشير إلى `scripts/fetch-osm.js` الموجود |
| Cleaning duplication | خط التقييم offline يعيد تعريف مراحل التنظيف والحجم | يستورد `scripts/cleaning-pipeline.js` المشترك |
| Central policy | قواعد الأنواع والمناهج موزعة في الواجهة والـoffline script | policy مشتركة في `shared/aqar-policy.js` وتستخدمها الواجهة والـbatch والـDLD lookup |
| Hidden state | قيم من نوع سابق يمكن أن تبقى في الحقول المخفية | `onPropertyTypeChange` يمسح الحقول/features/views غير المنطبقة، و`collectPropertyData` لا يرسلها |
| Primary validation | المساحة تُجبر إلى 10 م² داخل collector | القيمة غير الصالحة لا تُصحح بصمت، وvalidator مشترك يرفض أقل من 10 م² |
| API validation | النوع والمساحة لا يمران عبر allowlist/validation مشتركة | endpoint يرد 400 للنوع غير المدعوم أو المساحة غير الصالحة قبل الوصول للبيانات |
| Explainability | النتيجة تعرض methods التي حُسبت فقط | تعرض USED وNOT_APPLICABLE وNOT_USED، وتصنف evidence إلى SOURCE FACT وDERIVED VALUE وASSUMPTION وMODEL OUTPUT، وتعرض المدخلات/العوامل الحالية |
| Accuracy metrics | أرقام ثابتة قديمة في الصفحة | المؤشرات مرتبطة بملف `accuracy-data.json` كما تم إصلاحه سابقًا |

## 3. Files changed

| الملف | الغرض |
|---|---|
| `AQAR-PRE-CORRECTION-AUDIT.md` | تقرير التدقيق قبل التصحيح |
| `AQAR-RULES-INVENTORY.md` | جرد الأنواع والمناهج والقواعد الحالية والقرارات غير المحسومة |
| `AQAR-CORRECTION-REPORT.md` | هذا التقرير |
| `shared/aqar-policy.js` | policy مشتركة للأنواع والمناهج والحقول والـvalidation |
| `scripts/evaluate-and-save.js` | استخدام policy وcleaning pipeline المشتركة |
| `scripts/cleaning-pipeline.js` | بقي مصدر التنظيف المشترك دون تغيير القواعد |
| `netlify/functions/dld-lookup.js` | تحقق server-side للنوع والمساحة |
| `index.html` | policy-driven fields، state reset، validation، method applicability، explainability |
| `package.json` | `npm test` وتصحيح `fetch-osm` |
| `.gitignore` | استبعاد `node_modules/` و`.netlify/` وتوحيد models pattern |
| `tests/aqar-policy.test.js` | اختبارات الأنواع والمناهج والحقول والـvalidation |
| `tests/cleaning-pipeline.test.js` | اختبارات size categories والتنظيف |
| `tests/dld-lookup-validation.test.js` | اختبارات رفض مدخلات DLD غير الصالحة |

## 4. Behavior before

قبل هذه الدفعة، كانت الواجهة تملك قواعد إظهار الحقول وتشغيل المناهج داخل `index.html`، بينما كان خط التقييم offline يملك سياسة أخرى في `getAvailableApproaches()` ويعيد تعريف التنظيف. لم يكن هناك مصدر مشترك يربط property type بقائمة methods أو fields، ولم يكن من الممكن إثبات `NOT_APPLICABLE` بشكل مستقل عن عدم وجود inputs.

كانت بعض القيم المخفية أو GIS state السابق قابلة للبقاء عند الانتقال بين تقييمين، وكان endpoint يقبل type/area دون allowlist كاملة. كما أن المساحة غير الصالحة كانت تتحول داخل collector إلى القيمة 10. كانت explainability مقتصرة على وصف عام وعدد methods، من غير سجل واضح للطرق غير المنطبقة وتصنيف evidence.

## 5. Behavior after

أصبحت policy الحالية معرفة في ملف مشترك وتُستخدم في الواجهة والـoffline path وDLD lookup. عند تغيير property type، تُظهر الواجهة الحقول التي تطابق policy وتمسح القيم غير المنطبقة. قبل الحساب، تمر البيانات عبر validation مشترك، ولا يتم تشغيل method إلا إذا كان في قائمة applicability الحالية.

تعرض النتيجة الآن حالة كل method من المناهج الأربعة، وتفصل وصف evidence عن model output. ويعيد DLD lookup HTTP 400 للنوع غير المدعوم أو المساحة غير الصالحة بدل محاولة جلب البيانات. كما أن pipeline offline يعيد استخدام cleaning pipeline المشترك، ما يقلل خطر drift بين المسارات.

## 6. Methodology-sensitive items NOT changed

لم يتم تغيير أي weight أو coefficient أو threshold أو property type أو valuation method. بقيت الأوزان الحالية في الواجهة `0.40/0.35/0.15/0.10` ومسار إعادة التوزيع الحالي كما هو. لم يتم تغيير حدود المساحات، IQR، حد ultra-luxury، حدود comparable count، معاملات الحالة والإطلالة والطابق والشارع والتأثيث/GIS، أو defaults الخاصة بالـcap rate/vacancy/expenses.

كما لم تتم إزالة البيانات المولدة أو إعادة تعريف accuracy methodology، لأن ذلك يتطلب قرارًا من المالك حول ما إذا كان estimated data مسموحًا وما إذا كانت مقارنة appraiser لها مصدر معتمد. ولم تتم تسوية اختلاف DCF بين interactive وbatch، ولا اختلاف land applicability، ولا اختلاف معاملات view/GIS؛ هذه البنود موثقة تحت `METHODOLOGY DECISION REQUIRED` في التدقيق وجرد القواعد.

## 7. Features intentionally preserved

تم الحفاظ على أنواع العقارات السبعة الحالية: apartment وvilla وtownhouse وoffice وretail وwarehouse وland. كما تم الحفاظ على المناهج الأربعة، lookup التكيفي للمقارنات، time-weighted median وleave-one-out في خط البيانات، GIS/Leaflet، لوحة الدقة، Market Intelligence، Decision Engine integration، والتحديث الآلي للبيانات.

## 8. Features intentionally not added

لم تتم إضافة MIAYAAR capabilities مثل Market Intelligence مستقل جديد، Forensic Diagnostics، Temporal Backtesting، Governance Platform، Calibration Studio متقدم، أو valuation methodology جديدة. كما لم تتم إضافة نظام admin/calibration أو versioning كامل للتقييمات القديمة؛ تم تسجيل هذه الحدود بدل بناء منتج جديد خارج نطاق AQAR.

## 9. Tests added

أضيفت اختبارات Node المدمجة من غير dependency جديدة. تغطي الاختبارات الأنواع السبعة، وجود field categories، applicability التفاعلية وbatch الحالية، `NOT_APPLICABLE`، validation النوع والمساحة، حدود size categories، تنظيف المعاملات، ورفض DLD lookup للنوع والمساحة غير الصالحين.

## 10. Tests executed

| الفحص | النتيجة |
|---|---|
| `npm test` | ناجح: 9 اختبارات، 0 failures |
| JavaScript `node --check` لكل functions/scripts/shared/tests | ناجح |
| فحص syntax للـinline JavaScript في `index.html` | ناجح، 48,208 حرفًا مضمّنًا |
| قراءة JSON و`package.json` | ناجحة |
| `git diff --check` | ناجح |
| اختبار DOM على الموقع العام | policy محملة، 7 types، apartment interactive methods صحيحة، و9 م² مرفوضة |
| Netlify deployment | `ready` بلا error، deployment `6a8d3605cf7780ef362abd9b` |

التحقق العام بعد النشر أظهر أيضًا 8,697 سجلًا، دقة 85.9%، و238 منطقة محملة. هذه المؤشرات متسقة مع ملف البيانات المنشور في وقت التحقق.

## 11. Remaining limitations

لا تزال هناك محركات حساب متميزة منهجيًا بين interactive وoffline، ولذلك لا يمكن إعلان وجود valuation engine واحد قبل قرار المالك حول DCF وland وview/GIS والفallbacks. لا يزال `scrape-sold.js` يحتوي مسارات توليد اصطناعي، وProperty Finder وBayut غير موصولين بمصادر فعلية؛ لم تُخف هذه المسارات أو تُعاد تسميتها منهجيًا ضمن هذه الدفعة.

لا يوجد حتى الآن typecheck framework حقيقي لأن المشروع static JavaScript، و`npm run build` ما زال أمرًا شكليًا من المشروع الأصلي. كما لا توجد اختبارات متصفح كاملة لكل تفاعلات Leaflet وautocomplete، ولا configuration versioning للتقييمات القديمة، ولا source adapter موحد لكل evidence. هذه كلها تحسينات لاحقة أو قرارات تحتاج موافقة المالك.

## سجل commits

| Commit | الوصف |
|---|---|
| `f76c1b7` | `docs: add pre-correction audit` |
| `b70fc72` | `refactor: centralize current property policy` |
| `4ef4d13` | `test: add AQAR policy regression coverage` |
| `20a1563` | `test: cover DLD lookup validation` |
| `dc03b8a` | `refactor: reuse shared cleaning pipeline` |
| `d28092e` | `fix: enforce shared validation and field policy` |

جميع commits المذكورة دُفعت إلى `main` في المستودع المحدد، والمستودع المحلي نظيف ومتزامن مع `origin/main`.

## قرار الإكمال

تم تحقيق الجزء الآمن من Controlled Correction & Hardening: audit موثق، policy وvalidation وexplainability وregression coverage مضافة، والنسخة منشورة بنجاح. لا ينبغي اعتبار المهمة مكتملة منهجيًا قبل حسم البنود الموسومة `METHODOLOGY DECISION REQUIRED`، ولا ينبغي تقديم accuracy الناتجة عن المسارات المولدة على أنها evidence حكومية أو appraiser evidence.
