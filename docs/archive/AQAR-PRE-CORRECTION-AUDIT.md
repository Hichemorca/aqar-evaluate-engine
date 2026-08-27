# AQAR-PRE-CORRECTION-AUDIT

**تاريخ التدقيق:** 25 أغسطس 2026

**النطاق:** architecture، valuation engine، property classification، method selection، weights، coefficients، adjustment factors، comparable selection، inputs، outputs، UI، API، data pipeline، tests، والنشر.

**حدود التدقيق:** هذا التقرير يمثل baseline قبل التصحيح المنضبط الجديد المطلوب في المرفق. الإصلاحات السابقة الخاصة بتزامن المؤشرات وGIS وautocomplete موجودة في baseline الحالي، لكنها لا تعني أن فصل المحرك أو صرامة العقد البرمجي قد اكتملت.

## النتيجة العامة

AQAR تعمل حاليًا كمنصة static متعددة الصفحات، حيث يوجد محرك تفاعلي كامل داخل `index.html`، وخط تقييم offline منفصل داخل `scripts/evaluate-and-save.js`، ودوال Netlify مستقلة لجلب المقارنات والكشط ولوحة الدقة. وجود هذه المسارات الثلاثة يجعل سلوك التقييم غير مركزي: قد تتغير قابلية تطبيق المناهج أو العوامل أو مصدر الأدلة بحسب المسار الذي أنتج النتيجة.

يوجد منطق مفيد وقابل للحفاظ عليه: الأنواع الحالية هي apartment وvilla وtownhouse وoffice وretail وwarehouse وland، والمناهج الظاهرة في AQAR هي Sales Comparison وIncome Capitalization وCost Approach وDCF. لا يقترح هذا التدقيق تغيير أي قيمة أو وزن أو معامل أو business meaning. أي نقطة غير محسومة منهجيًا مسجلة صراحة تحت `METHODOLOGY DECISION REQUIRED`.

## A. Bugs مؤكدة أو قابلة لإعادة الإنتاج

| المعرّف | الدليل في الكود | الأثر | التصنيف |
|---|---|---|---|
| BUG-001 | `package.json` يعرّف `fetch` على `scripts/fetch-osm-data.js`، بينما الملف الموجود هو `scripts/fetch-osm.js` | أمر npm الخاص بـ GIS يفشل، وقد لا تُحدّث بيانات GIS | إصلاح تقني آمن |
| BUG-002 | `index.html` يطبق `gisImpactPercent` على التقييم، لكن تغيير نوع العقار أو فشل/غياب GIS كان يمكن أن يترك state سابقًا؛ الإصلاح السابق غطى حالات reset/no-result/error | احتمال انتقال أثر عقار سابق إلى تقييم لاحق | الإصلاح الجزئي موجود؛ يلزم regression test |
| BUG-003 | `collectPropertyData()` يفرض `area` إلى قيمة 10 على الأقل ويقص `yearBuilt` داخل المجال بدل رفض المدخل | المدخل غير الصالح يتحول بصمت إلى fact صالح ظاهريًا | إصلاح validation آمن |
| BUG-004 | حقل المنطقة يسمح باستخدام `districtInput` مباشرة، ولا يفرض أن القيمة جاءت من قائمة DLD رغم أن النص يقول Choose from DLD data | يمكن إرسال منطقة غير معتمدة إلى API fuzzy search | إصلاح عقد/تحقق، مع الحفاظ على fuzzy matching الحالي |
| BUG-005 | `onPropertyTypeChange()` يخفي حقولًا ويزيل بعض features، لكنه لا يمسح كل القيم الاختيارية المخفية قبل جمع البيانات | state قديم لعقار أو نوع سابق قد يدخل في `collectPropertyData()` | إصلاح state آمن |
| BUG-006 | `displayResult()` يعرض الطرق التي حسبت فقط، ولا يعرض الطرق غير القابلة للتطبيق أو سبب عدم استخدامها | explainability ناقصة ولا يمكن تمييز NOT_APPLICABLE عن غياب البيانات | إصلاح عرض، دون تغيير الحساب |
| BUG-007 | `evaluate-and-save.js` يحسب `appraiserValuation` عبر `Math.random()` | accuracy comparison غير قابل لإعادة الإنتاج وليس evidence حقيقيًا | إصلاح مصدر/تصنيف، مع قرار مالك بشأن البديل |
| BUG-008 | `scrape-sold.js` يستخدم `Math.random()` داخل `scrapeDLD()` رغم تسمية المصدر DLD، ويضيف records مولدة عند قلة النتائج أو فشل الطلب | مسار accuracy قد يخلط source facts ببيانات مصطنعة ويعيد 200 success | إصلاح عقد ومصدر، لكن إزالة التوليد قرار منتج يجب توثيقه |
| BUG-009 | `scripts/evaluate-and-save.js` يعيد تعريف مراحل التنظيف بدل استيراد `scripts/cleaning-pipeline.js` | اختلاف صامت محتمل بين offline وruntime، وازدواجية صيانة | إصلاح معماري آمن إذا حافظ على نفس السلوك |
| BUG-010 | لا يوجد test script فعلي؛ `npm build` مجرد `echo 'No build step required'` | acceptance criteria الخاصة بـ build/typecheck/tests غير قابلة للإثبات حاليًا | إصلاح بنية اختبار |

## B. مشكلات architecture

| المجال | الحالة الحالية | الأثر |
|---|---|---|
| مصدر محرك التقييم | محرك في `index.html` ومحرك ثانٍ في `evaluate-and-save.js` | لا يوجد single source of truth للحسابات أو policy |
| policy | `getAvailableApproaches()` موجودة في offline script فقط وليست policy مشتركة يستهلكها frontend وAPI | frontend قد يعرض أو يحسب منهجًا مختلفًا عن offline pipeline |
| البيانات | `dld-lookup` يقرأ ملف DLD كبيرًا عبر HTTPS عند كل استدعاء، مع نسخة أخرى في `netlify/functions/dld-transactions.json` | زمن استجابة مرتفع وتكرار في التخزين ومسار تشغيل هش |
| API | الدوال تستقبل query/body خامًا، والتحقق محدود وموزع | frontend يستطيع إرسال حقول أو property types غير منضبطة |
| configuration | الأوزان ومعاملات التقييم موزعة بين frontend وoffline script ودوال أخرى | صعوبة تعريف configuration المستخدم في نتيجة قديمة |
| النشر | GitHub Actions و`package.json` كانا يشيران إلى اسم GIS مختلف؛ workflow تم إصلاحه سابقًا، بينما npm script ما زال يحتاج توحيدًا | أوامر التشغيل المختلفة لا تعطي نفس السلوك |

## C. Methodology risks — لا تُغيّر تلقائيًا

هذه البنود قد تكون مقصودة أو قد تكون أخطاء منهجية، لكن لا يجوز حسمها بالتخمين:

| المعرّف | الملاحظة الحالية | المطلوب من المالك |
|---|---|---|
| METH-001 | واجهة AQAR تشغل DCF عند وجود rent، بينما `getAvailableApproaches()` في offline pipeline لا تعيد DCF لأي نوع | **METHODOLOGY DECISION REQUIRED:** هل DCF جزء من AQAR لكل نوع مؤهل أم لا؟ |
| METH-002 | offline policy تجعل apartment وland على Sales + Income، لكن UI تخفي income وcost للـ land، و`costApproach()` تستبعد land | **METHODOLOGY DECISION REQUIRED:** ما policy الحالية المقصودة للـ land؟ |
| METH-003 | `scrape-sold` يضيف بيانات مولدة عند قلة البيانات أو الخطأ، ثم يسمي الناتج estimated أو generated في بعض المسارات | **METHODOLOGY DECISION REQUIRED:** هل يسمح المنتج بعرض estimated data؟ وبالأخص هل يجوز أن تدخل accuracy dashboard؟ |
| METH-004 | `appraiserValuation` اصطناعية وعشوائية في pipeline التقييم | **METHODOLOGY DECISION REQUIRED:** هل تُحذف مقارنة appraiser، أم تستبدل بمصدر موثق يقدمه المالك؟ |
| METH-005 | `dld-lookup` ينتقل من district+type+size إلى district+type ثم district-only عند قلة البيانات | القاعدة موجودة حاليًا ولا تُغيّر؛ يلزم فقط عرض مستوى البحث في النتيجة وتوثيق معناه |
| METH-006 | قيم fallback مثل growth `0.005`، cap rate `7%`، vacancy `10%`، وأسعار fallback في `scrape.js` | **METHODOLOGY DECISION REQUIRED:** لا تغيّر القيم؛ يجب فصلها وتصنيفها كـ assumptions أو إبقاؤها إذا أكد المالك أنها business rules |
| METH-007 | معاملات view/GIS مختلفة بين `index.html` و`evaluate-and-save.js`، مع taxonomies مختلفة للإطلالات | **METHODOLOGY DECISION REQUIRED:** لا توحّد القيم أو taxonomy قبل قرار؛ يمكن فقط كشف الاختلاف ومنع التطبيق المزدوج |
| METH-008 | `calculateWeightedValue()` يعيد fallback حسابيًا عند غياب الطرق، رغم أن `runValuation()` يمنع الوصول إليه غالبًا | يلزم تحديد هل fallback الحالي سلوك مقصود أم مسار dead code قبل تغييره |

## D. UI problems

تقدم الواجهة نموذجًا وظيفيًا واضحًا نسبيًا، لكنها تجعل معظم الحقول الاختيارية مرئية دفعة واحدة، وتعرض الإنجليزية أساسًا مع رسائل عربية جزئية. كما أن النتيجة تعرض الطرق المستخدمة فقط، ولا تعرض الطرق غير القابلة للتطبيق ولا تفصل بوضوح بين transaction fact وderived value وassumption وmodel output.

حقول type-dependent مخفية عبر `onPropertyTypeChange()` في frontend فقط. هذا مفيد بصريًا لكنه ليس policy مشتركة، ولا يكفي وحده لمنع إرسال state قديم أو إدخال method غير مناسب. كما أن منطقة العقار تبدو اختيارًا من DLD لكنها تقبل النص المباشر، في حين أن API يستخدم fuzzy matching.

## E. Missing validations

| المجال | النقص الحالي |
|---|---|
| property type | لا توجد policy مركزية مشتركة يتحقق منها frontend وAPI؛ لا يظهر schema validation مستقل |
| area/year | بعض القيم تُقص أو تُستبدل بدل رفضها، ولا توجد رسائل validation موحدة لكل نوع |
| district | لا يوجد enforcement واضح للاختيار من القائمة، ولا contract يميز district selected عن free text |
| method | لا يوجد method selection/allowlist server-side؛ في الواجهة يتم تشغيل الطرق وفق وجود الحقول |
| weights | لا يوجد تحقق مركزي من الأوزان أو من أن method غير applicable لا يحصل على وزن |
| evidence | لا يوجد schema موحد يميز source fact وderived value وassumption وmodel output |
| output | لا يوجد contract موحد للنتيجة يضم methods not applicable وadjustments وassumptions وconfiguration identity |
| API errors | بعض الدوال تعيد 200 مع `found:false` أو estimated fallback عند الخطأ، ما يصعب على العميل تمييز الفشل من النتيجة |

## F. Missing tests

لا يحتوي المستودع على مجلد tests أو ملفات test/spec ظاهرة، ولا يملك `npm test` أو typecheck حقيقيًا. لا توجد regression tests تغطي الأنواع السبعة، قابلية الطرق للتطبيق، عدم تطبيق GIS مرتين، انتقال state بين property types، اختيار المقارنات، الأوزان، الثقة، أو explainability.

أول مجموعة اختبارات آمنة يجب أن تختبر السلوك الموجود بدل اختراع قيم جديدة: `getSizeCategory`، مراحل التنظيف، method applicability بعد اعتماد policy الحالية، رفض المدخلات غير الصالحة، عدم احتساب الطرق غير المؤهلة، تصفير GIS، ووجود تفسير يذكر مستوى المقارنة وعددها والأوزان والعوامل المستخدمة.

## G. Ambiguous business rules

توجد قواعد كثيرة في الكود لكنها غير مرتبطة بمصدر أو version واضح، ومنها حدود المساحة لكل نوع، حدود IQR، حد ultra-luxury، حدود عدد المقارنات، age depreciation، معاملات الحالة والإطلالة والطابق، cap/vacancy assumptions، وتفسير confidence. لا ينبغي إعادة معايرة أي منها ضمن هذه المهمة. ستُعامل القيم الحالية كـ **existing behavior** إلى أن يقرر المالك خلاف ذلك.

## الأولوية الآمنة للتصحيح

| الترتيب | الإجراء | هل يحتاج قرارًا منهجيًا؟ |
|---|---|---|
| 1 | توحيد ملفات التشغيل واستيراد cleaning pipeline المشترك دون تغيير النتائج | لا، بشرط regression tests |
| 2 | إنشاء policy مركزية من الأنواع والمناهج الحالية، مع تمثيل NOT_APPLICABLE بدل null الصامت | لا في البنية، نعم إذا تعارضت السياسات الحالية |
| 3 | إضافة validation مشتركة تمنع القيم غير الصالحة وإرسال fields المخفية كحقائق | لا، إذا لم تغيّر القيم الصحيحة الحالية |
| 4 | إضافة result/evidence schema يشرح methods، weights، adjustments، assumptions، confidence | لا، طالما لا يضيف حسابًا جديدًا |
| 5 | إضافة tests وregression fixtures من السلوك الحالي | لا |
| 6 | عزل أو وسم البيانات الاصطناعية في accuracy/scrape | يحتاج قرارًا بشأن السماح بعرضها، لكن يجب منع تسميتها source fact دون قرار |
| 7 | أي تغيير في weights أو coefficients أو fallback أو applicability المتعارضة | **يتوقف ويطلب قرار المالك** |

## الخلاصة

يمكن البدء فورًا بالإصلاحات التقنية التي لا تغيّر methodology: central policy extraction مع الحفاظ على القيم الحالية، validation صريح، فصل evidence types، منع state leakage، إزالة الازدواجية البرمجية، وتحويل السلوك الحرج إلى اختبارات. أما اختلافات DCF وland، والبيانات الاصطناعية، ومقارنة appraiser، ومعاملات view/GIS والفallbacks، فهي `METHODOLOGY DECISION REQUIRED` ولا ينبغي تعديلها بالتخمين.

## المراجع الداخلية

[1]: https://github.com/Hichemorca/aqar-evaluate-engine "مستودع AQAR المحدد من المالك"

[2]: https://aqar-valuation-engine.netlify.app/ "النسخة المنشورة من AQAR"
