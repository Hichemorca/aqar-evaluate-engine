# MIAYAAR — خطة الجاهزية للتجربة الحقيقية خلال 12 ساعة

**الغرض:** تجهيز نسخة MIAYAAR لتجربة حقيقية محدودة ومضبوطة، مع منع أي تغيير غير موثق في منطق التقييم الرسمي.

> هذه الخطة تخص **pilot محدودًا** وليست اعتمادًا ماليًا أو تقييمًا رسميًا ملزمًا. لا يجوز اتخاذ قرار مالي اعتمادًا على نتيجة منفردة دون مراجعة مستقلة.

## حدود لا تتغير خلال نافذة الـ12 ساعة

| العنصر | القاعدة |
|---|---|
| evaluator وcalibration | لا تعديل |
| أوزان المناهج والمعاملات | لا تعديل |
| fallback وshadow multipliers | لا تعديل |
| Accuracy وDLD artifacts | لا تعديل يدوي أو استبعاد أو clipping |
| observations | لا تسجيل إلا بعد consent صريح |
| scraper endpoints | تبقى معطلة |
| الإنتاج | لا موقع جديد ولا hostname جديد |

## خطة الساعات

| النافذة | العمل | مخرج النجاح |
|---|---|---|
| H0–H1 | تثبيت baseline المحلي والحي | main نظيف، CI ناجح، integrity gate ناجحة، home/DLD/diagnostics تعمل |
| H1–H3 | اختبار قبول وظيفي على المتصفح والهاتف | اختبار Apartment وLand، district، project، map، facilities، market data، valuation |
| H3–H5 | التحقق التشغيلي والبياني | provenance سليم، summaries متوافقة، لا تغير في protected artifacts |
| H5–H7 | مراجعة المخاطر المعروفة | توثيق area/procedureArea والسجل الشاذ دون تغيير القواعد |
| H7–H9 | اختبار قبول المالك على الهاتف وAdmin read-only | موافقة المستخدم على checklist، وعدم تنفيذ save تجريبي في calibration |
| H9–H10 | إصلاح منخفض المخاطر فقط عند وجود blocker | PR صغير، CI ناجح، لا مساس بمنطق التقييم |
| H10–H11 | دمج ونشر | deployment Ready على الموقع الحالي |
| H11–H12 | smoke tests وقرار go/no-go | pilot محدود إذا تحققت كل بوابات القبول |

## بوابات القبول

### بوابات تقنية مطلوبة

يُسمح ببدء الـpilot فقط إذا كانت الصفحة الرئيسية تعيد HTTP 200، وملف diagnostics متاحًا، وDLD lookup صالحًا، وSecurity headers موجودة، وCI ناجحًا، وintegrity gate تمر دون provenance failures أو mismatches. يجب أن يبقى working tree نظيفًا بعد النشر وأن يشير `main` إلى commit الذي تم اختباره.

### سيناريوهات القبول الوظيفي

| السيناريو | النتيجة المطلوبة |
|---|---|
| Apartment | تظهر bedrooms وyear built وcondition وproject، ولا يظهر BUA أو Plot Area |
| Land | يظهر Plot Area، وتختفي الحقول غير المناسبة |
| District | تظهر الاقتراحات كاملة ولا تحجبها الحقول أو الخريطة |
| Project | تظهر اقتراحات فعلية، وعند اختيار مشروع verified يتحدث marker دون فقدان district |
| Map | يتغير المركز عند اختيار district، وتظهر facilities داخل radius |
| Market data | تعبئة Price/sqm وcomparables أو رسالة evidence limitation واضحة |
| Valuation | تظهر قيمة وتفسير Why this valuation، ولا يظهر Range أو أسماء المناهج أو DLD للمستخدم العام |
| Consent | يبقى غير محدد افتراضيًا، ولا تُرسل observation دون موافقة صريحة |
| Reset | يعيد النموذج إلى حالة بداية نظيفة دون بقاء نتيجة أو project/district غير مقصود |

## المخاطر المعروفة التي لا تمنع pilot محدودًا لكنها تمنع الاعتماد الرسمي

أظهر التحليل أن 41 سجلًا من أصل 99 في `INTERNATIONAL CITY PH 2 & 3` لديها نسبة `area / procedureArea >= 1.95`، وتحتوي هذه المجموعة على جميع الحالات الشديدة الأربعين في المنطقة. لم يثبت التحليل أي الحقلين هو الصحيح، ولذلك لا يجوز تغيير استخدام الحقول أو حد التنظيف قبل الحصول على تعريف موثق من مصدر DLD وتجربة shadow مستقلة.

كما توجد حالة أرض ذات خطأ شديد جدًا هي `DLD-41-8610-2026`. تطابقت مع DLD في الحقول الأساسية، لذلك تُعامل كمراجعة label/طبيعة صفقة، ولا تُستبعد من Accuracy ولا تُستخدم وحدها لتعديل معامل الأراضي.

## قواعد تشغيل الـpilot

يجب أن يكون pilot محدودًا بعدد مستخدمين معروفين، وأن تُعامل كل نتيجة كـindicative estimate. يجب تسجيل وقت التجربة ونوع العقار والمنطقة والحقول التي أدخلها المستخدم فقط ضمن سياسة الخصوصية المعتمدة. لا تُستخدم النتائج لتسعير نهائي أو قرار شراء/بيع أو تمويل دون تحقق مستقل.

يُسمح بتفعيل consent فقط عندما يفهم المستخدم أن الإدخال سيُستخدم للتحليل المجهول، ويجب تركه اختياريًا. لا ينبغي طلب Admin token عبر المحادثة أو تضمينه في ملفات المشروع.

## قرار go/no-go

| القرار | الشروط |
|---|---|
| GO للـpilot المحدود | كل بوابات التقنية والوظائف ناجحة، اختبار الهاتف مقبول، والمستخدمون يعرفون أن النتائج إرشادية |
| GO مشروط | يوجد نقص غير جوهري موثق لا يؤثر في سلامة البيانات أو مسار التقييم، مع إبقاء المراجعة البشرية إلزامية |
| NO-GO | فشل integrity gate، mismatch بين Accuracy وDLD، فشل DLD أو map/market data الأساسي، فقدان consent، أو ظهور نتيجة بلا تفسير واضح |
| NO-GO للاعتماد الرسمي | دائمًا إلى أن تُغلق مراجعة area/procedureArea وتُختبر أي مقترحات عبر shadow وrolling-origin |

## مراجع المشروع

[1]: https://aqar-valuation-engine.netlify.app/ "MIAYAAR production site"
[2]: https://github.com/Hichemorca/aqar-evaluate-engine "MIAYAAR repository"
[3]: https://github.com/Hichemorca/aqar-evaluate-engine/blob/main/docs/detailed-outlier-review-2026-08-26.md "Detailed outlier review"
[4]: https://github.com/Hichemorca/aqar-evaluate-engine/blob/main/docs/accuracy-stability-review-2026-08-26.md "Accuracy stability review"
