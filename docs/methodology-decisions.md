# AQAR Methodology Decisions

**Decision record:** 001

**Date:** 25 August 2026

**Owner:** AQAR project owner

**Status:** Approved for implementation

## Scope rule

هذه القرارات تخص AQAR فقط. لا تمثل ترقية إلى MIAYAAR، ولا تسمح بإضافة methodology أو weights أو coefficients أو property types جديدة. أي قاعدة غير مذكورة هنا تبقى على سلوك AQAR الحالي إلى أن تعتمد بقرار مستقل.

## Approved decisions

| ID | القرار المعتمد | أثر التنفيذ |
|---|---|---|
| MD-001 | إبقاء DCF كما يعمل حاليًا في الواجهة وللأنواع التي يظهر فيها حاليًا | تبقى DCF ضمن interactive applicability الحالية للـApartment وVilla وTownhouse وOffice وRetail، ولا تُضاف تلقائيًا إلى Warehouse أو Land |
| MD-002 | اعتماد Sales Comparison + Income لنوع Land | تبقى سياسة Land التفاعلية والدفعة الحالية هاتين الطريقتين، مع منع Cost وDCF للـLand |
| MD-003 | منع البيانات الاصطناعية من Accuracy الرسمية | لا تدخل السجلات المولدة أو المقدرة في مؤشرات الدقة الرسمية؛ يجب فصلها أو رفض المسار عند عدم توفر evidence حقيقية |
| MD-004 | إزالة Appraiser comparison | لا تُستخدم `appraiserValuation` في accuracy metrics أو واجهة Accuracy الرسمية؛ لا يتم استبدالها بمصدر أو benchmark جديد ضمن هذه الدفعة |
| MD-005 | اعتماد معاملات الواجهة الحالية لـView وGIS | عند التوحيد، تكون قيم وتطبيق معاملات الواجهة هي المرجع، ولا تُعاد معايرتها أو تغييرها ضمن هذا القرار |
| MD-006 | اعتبار القيم الافتراضية Assumptions وإظهارها عند استخدامها | cap rate وvacancy وexpenses وأي fallback حالي يظهر في trace/report كـAssumption، ولا يعامل كـSource Fact |
| MD-007 | الإبقاء على اللغة الإنجليزية | لا يُنفذ تعريب أو زر تبديل لغة في الدفعة الحالية؛ يمكن تحسين وضوح النص الإنجليزي فقط |

## Explicitly unchanged

تبقى الأوزان والمعاملات والحدود الأخرى كما هي، ما لم تكن متعارضة مباشرة مع القرارات أعلاه. لا تتم إضافة طرق تقييم جديدة، ولا أنواع عقارات جديدة، ولا Calibration Studio، ولا صلاحيات إدارية جديدة، ولا ميزات MIAYAAR.

## Implementation guardrails

يجب أن تكون كل نتيجة قابلة لتحديد نسخة المحرك ونسخة البيانات. يجب أن يميز trace بين `SOURCE_FACT` و`DERIVED_VALUE` و`ASSUMPTION` و`MODEL_OUTPUT`. يجب أن تعيد الطريقة غير المنطبقة `NOT_APPLICABLE` بدل الصفر أو القيمة المصطنعة. ولا يجوز للواجهة إرسال weights أو coefficients أو method غير مسموح بها إلى الخادم.

## Deferred decisions

لا تزال التفاصيل التنفيذية الدقيقة لفصل البيانات المولدة، مثل إعادة HTTP status عند غياب الأدلة أو توفير وضع Demo منفصل، قرارًا تقنيًا تابعًا لـ MD-003 وليست إذنًا بإبقاء البيانات المولدة ضمن Accuracy الرسمية. سيُختار التنفيذ الأقل تغييرًا للمعنى والأكثر وضوحًا للمستخدم.

## Approval

تم اعتماد القرارات السبعة من مالك المشروع في المحادثة، بالترتيب التالي: 1-أ، 2-ب، 3-أ، 4-أ، 5-ب، 6-أ، 7-أ.
