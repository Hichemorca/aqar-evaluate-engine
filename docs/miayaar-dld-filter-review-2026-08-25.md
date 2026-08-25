# MIAYAAR DLD Filtering Review — 25 August 2026

## Conclusion

مراجعة مستودع `Hichemorca/MIAYAAR` أظهرت أن أفضل ما يمكن الاستفادة منه ليس نقل منهجية التقييم، بل نقل **نمط حوكمة وتنظيف الأدلة**: تطبيع السجل، التحقق من الحقول الدنيا، اكتشاف التكرار، تصنيف نوع العقار، فصل السجلات المؤهلة عن المرفوضة، وحفظ سجل أسباب الرفض مع checksum ومرجع للسجل الخام.

لم يتم تعديل ملفات AQAR أو MIAYAAR نتيجة هذه المراجعة.

## MIAYAAR cleaning model

| Control | MIAYAAR behavior |
|---|---|
| Source identity | `dld:<id>` لكل معاملة، مع `recordFingerprint` بواسطة SHA-256 |
| Required data | source id، date صحيح، area أكبر من 10 sqm، price موجب، district غير فارغ |
| Classification | يفضّل raw type ثم يستخدم subtype كـfallback، ويغطي الأنواع السبعة |
| District normalization | trim، ضغط المسافات، وتحويل إلى uppercase |
| Duplicate handling | يحتفظ بأول source transaction ID ويسجل اللاحق في issue ledger |
| Commercial land | يوسم `rejected` بسبب `commercial_land` |
| Ultra-luxury | يوسم `rejected` إذا تجاوز السعر 50m AED أو 50,000 AED/sqm |
| Auditability | يحتفظ بسبب الرفض، index الخام، source ID، fingerprint، وملخص التشغيل |
| Raw source protection | لا يكتب فوق المصدر الخام |
| Import governance | يحفظ run checksum وcounts للقراءة والتطبيع والتكرار والرفض والتخطي |

المصدر التنفيذي لهذه القواعد هو `scripts/lib/dld-evidence-cleaning.mjs`، بينما يطبق `scripts/import-dld-evidence.mjs` سجل التشغيل وissue ledger.[1] [2]

## Current AQAR gap

مسار AQAR الحالي في `scripts/fetch-dld.js` يقبل الصف إذا كان `TRANS_VALUE` وarea موجبين فقط. بعد ذلك ينشئ سجلًا موحدًا ويكتب الناتج إلى JSON. لا توجد في المسار نفسه آلية كافية لاكتشاف التكرار، أو توحيد district، أو حفظ أسباب التخطي، أو فصل commercial land، أو تطبيق سقف السعر/سعر المتر، أو حفظ checksum للمدخل الخام.[3]

يوجد في AQAR `scripts/cleaning-pipeline.js` تنظيف لاحق يتضمن بعض الفلاتر العامة مثل عدم تطابق المساحة، الحدود حسب النوع، إزالة outliers، off-plan، التكرار، ultra-luxury، والحد الأدنى لحجم المجموعة. لكنه لا ينتج issue ledger تفصيليًا ولا يحافظ على سلسلة provenance بنفس مستوى MIAYAAR.[4]

## Impact estimate on current AQAR CSV

تمت مقارنة قواعد MIAYAAR نظريًا مع CSV الخام الحالي في AQAR، وعدد سجلاته **30,475**. هذه أرقام hit counts وليست عدد السجلات النهائية بعد إزالة التداخل بين القواعد.

| Rule | Estimated hits |
|---|---:|
| Duplicate transaction rows beyond first | 19 |
| Invalid area at or below 10 sqm | 128 |
| Commercial / General Use land | 3,101 |
| Ultra-luxury by total price or unit price | 719 |
| Unknown/unsupported type under MIAYAAR classifier | 0 in this sample |

العدد المرتفع للأراضي التجارية ليس خطأً حسابيًا بالضرورة؛ CSV يحتوي 2,449 سجلًا subtype=`Commercial` و652 سجلًا subtype=`General Use`. لذلك يجب اتخاذ قرار أعمال واضح: هل هذه السجلات **غير مؤهلة للمقارنات السكنية فقط** أم يجب استبعادها من Accuracy كلها؟ MIAYAAR يوسمها مرفوضة evidence-wise، ولا ينبغي حذفها من raw source.[5]

## Important design distinction

MIAYAAR لا يحذف كل سجل مرفوض بلا أثر. بل يبقي normalized rejected records مع `evidenceStatus = rejected` و`rejectionReason`، ويسجل السجلات غير الصالحة والتكرارات في issue ledger. بعد ذلك يجب أن يستخدم مسار المقارنات وAccuracy السجلات ذات `evidenceStatus = eligible` فقط. هذه النقطة أفضل من حذف الصفوف أثناء parsing، لأنها تجعل سبب تغير عدد البيانات قابلًا للتدقيق.[1] [2]

## Recommended AQAR implementation

أوصي بتطبيق تحسين AQAR على مراحل:

1. إنشاء `shared/dld-evidence-cleaning.js` بنمط MIAYAAR، مع تكييف أسماء CSV الخاصة بـAQAR وعدم نقل أي كود أو business methodology من MIAYAAR.
2. إضافة `dld-cleaning-report.json` أو artifact مماثل يتضمن checksum، counts، issue types، record indexes، transaction numbers، وfingerprints.
3. تعديل `fetch-dld.js` ليحافظ على raw source، وينتج normalized records مع `evidenceStatus` و`rejectionReason`، ويطبق district normalization واكتشاف duplicates.
4. فصل `eligible` عن `rejected` في Accuracy والمقارنات، مع استمرار Verified DLD only وعدم إدخال Appraiser أو generated data.
5. تطبيق commercial-land وultra-luxury كحالات policy واضحة، لا كحذف صامت. أقترح إبقاء commercial land في evidence ledger كمرفوضة، وعدم استخدامها في residential comparable sets.
6. إضافة اختبارات regression للـCSV الفعلي: duplicate، missing date، invalid area/price، unsupported type، commercial land، ultra-luxury، district normalization، وعدم تعديل raw source.
7. بعد ذلك فقط إعادة توليد Accuracy ومقارنة المؤشرات قبل/بعد مع توثيق `calibrationConfigId` ونسخة التنظيف.

## Guardrails

لا ينبغي نقل قواعد `MIAYAAR` التي تخص قاعدة بياناته أو عقوده أو منهجيته المحفوظة. المطلوب هو تبني **نمط evidence cleaning and auditability** فقط، مع إبقاء AQAR مستقلًا، وأن تبقى قرارات Land وDCF وAccuracy المعتمدة في AQAR كما هي.

## References

[1]: ../../../MIAYAAR/scripts/lib/dld-evidence-cleaning.mjs "MIAYAAR DLD evidence cleaning implementation"
[2]: ../../../MIAYAAR/scripts/import-dld-evidence.mjs "MIAYAAR DLD import and issue ledger"
[3]: ../scripts/fetch-dld.js "AQAR DLD CSV ingestion"
[4]: ../scripts/cleaning-pipeline.js "AQAR cleaning pipeline"
[5]: /tmp/aqar-miayaar-rule-comparison.json "Quantified MIAYAAR rule impact estimate on AQAR CSV"
