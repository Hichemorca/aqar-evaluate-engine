# تقرير مراجعة وتنظيف مستودع MIAYAAR

**التاريخ:** 27 أغسطس 2026

**نطاق المراجعة:** تنظيم المستودع، الملفات المولدة، التقارير التاريخية، قواعد التجاهل، الفروع، سلامة artifacts، ومؤشرات الملفات المؤقتة أو الأسرار.

## 1. النتيجة التنفيذية

المستودع منظم تشغيليًا حول طبقات واضحة: صفحات ثابتة في الجذر، وحدات مشتركة في `shared/`، Netlify Functions في `netlify/functions/`، scripts في `scripts/`، اختبارات في `tests/`، وبيانات أو artifacts في `data/`. لم توجد ملفات أسرار أو سجلات أو ملفات مؤقتة غير متتبعة داخل المستودع وقت المراجعة.

تم تنفيذ تنظيف منخفض المخاطر فقط:

| الإجراء | النتيجة |
|---|---|
| نقل التقارير التاريخية من الجذر | نُقلت أربعة تقارير غير تشغيلية إلى `docs/archive/`. |
| إضافة فهرس للأرشيف | أضيف `docs/archive/README.md` لتوضيح طبيعة الملفات القديمة. |
| تقوية `.gitignore` | أضيفت قواعد لتجاهل `.env` المحلي، السجلات، ملفات الاختبار المؤقتة، تقارير Playwright، وملفات النظام. |
| حماية artifacts | لم تُعدّل ملفات DLD أو Accuracy أو calibration أو observations. |
| حذف ملفات بيانات محتملة الاستخدام | لم يُنفذ؛ لأن الملفات المكررة أو غير المستخدمة ظاهريًا تحتاج قرارًا منفصلًا قبل حذفها. |
| حذف الفروع البعيدة القديمة | لم يُنفذ؛ حذف فروع GitHub عملية تدميرية منفصلة وتحتاج موافقة صريحة. |

## 2. البنية الحالية

| الطبقة | المسار | الحالة |
|---|---|---|
| Public pages | `index.html`, `accuracy-dashboard.html`, `market-intelligence.html`, `export.html` | منظمة في الجذر لأن Netlify يخدمها كصفحات مباشرة. |
| Admin page | `calibration.html` | منظمة في الجذر، مع redirect من `/admin-calibration`. |
| Shared contracts | `shared/` | تحتوي policy وcalibration وcleaning helpers وdiagnostics. |
| Serverless API | `netlify/functions/` | تحتوي DLD وGIS وcalibration وobservation endpoints. |
| Data pipeline | `scripts/` | تحتوي الجلب والتنظيف والتقييم والتشخيص والتجارب المعزولة. |
| Tests | `tests/` | تغطي الحساب، API، الأمن، provenance، الواجهة، وmobile smoke. |
| Runtime data | `data/` | تحتوي مصادر وartifacts موجهة للواجهة أو Accuracy. |
| Documentation | `docs/` | تحتوي المواصفات والتقارير والتحقق وأدلة المستخدم والمدير والمطور. |
| Historical archive | `docs/archive/` | تحتوي التقارير القديمة غير المستخدمة وقت التشغيل. |

## 3. ما تم نقله إلى الأرشيف

كانت الملفات التالية في جذر المستودع رغم أنها تقارير تاريخية وليست صفحات أو مصادر تشغيلية. لم تحتوي على روابط داخلية تكسرها عملية النقل:

| المسار السابق | المسار الحالي |
|---|---|
| `AQAR-CORRECTION-REPORT.md` | `docs/archive/AQAR-CORRECTION-REPORT.md` |
| `AQAR-PRE-CORRECTION-AUDIT.md` | `docs/archive/AQAR-PRE-CORRECTION-AUDIT.md` |
| `AQAR-RULES-INVENTORY.md` | `docs/archive/AQAR-RULES-INVENTORY.md` |
| `Market_Intelligence_Scientific_Review_Final_Report.md` | `docs/archive/Market_Intelligence_Scientific_Review_Final_Report.md` |

هذه الملفات محفوظة لأغراض التتبع فقط. لا يجوز استخدام تقرير مؤرشف كمصدر لقيمة معايرة جديدة أو لتحديث artifact رسمي دون الرجوع إلى الكود والبيانات الحالية.

## 4. الملفات المولدة والنسخ المتشابهة

توجد ملفات كبيرة ومولدة داخل `data/`، مثل `dld-transactions.json` و`dld-transactions-enriched.json` و`market-data.json` و`accuracy-data.json`. هذه الملفات ليست مخلفات تلقائيًا؛ بعضها مدخلات أو مخرجات رسمية ويُشار إليه من scripts أو الواجهة.

وجدت المراجعة نسخًا متشابهة داخل `netlify/functions/`، لكنها ليست مطابقة byte-for-byte لنسخ `data/`. كما أن runtime الحالي لـDLD lookup يقرأ `/data/dld-transactions.json`، وليس نسخة `netlify/functions/dld-transactions.json`. ومع ذلك لم تُحذف أي نسخة؛ لأن حذف أو استبدال ملف DLD tracked قد يغير artifact تاريخيًا أو يؤثر في نشر غير ظاهر، وهو خارج تنظيف منخفض المخاطر.

يوصى بفتح مهمة مستقلة بعنوان **Generated data source-of-truth cleanup** تتضمن inventory، consumer proof، checksum baseline، وخطة إزالة أو نقل بموافقة المالك. لا تُنفذ هذه الإزالة ضمن مراجعة تنظيمية عامة.

## 5. قواعد التجاهل

تم تحديث `.gitignore` ليشمل:

- `node_modules/` و`.netlify/`.
- `coverage/` و`.nyc_output/` و`playwright-report/` و`test-results/`.
- `.env` وملفات `.env.*` مع السماح الاختياري بـ`.env.example`.
- `*.log` و`*.tmp` و`*.bak` و`.DS_Store` وسجلات npm وYarn.

تظل الملفات المتتبعة متتبعة حتى لو تطابقت لاحقًا مع قاعدة ignore؛ هذه الإضافة تمنع تسرب الملفات المحلية الجديدة ولا تحذف تاريخ Git.

## 6. الفروع

لا توجد Pull Requests مفتوحة وقت المراجعة. توجد فروع بعيدة تاريخية مرتبطة بمراحل أو PRs مدمجة، مثل فروع accuracy وDLD وUI والاختبارات. أبقيت هذه الفروع دون حذف لأن وجودها قد يخدم التتبع أو المقارنة، ولأن حذفها من GitHub لا يمكن التراجع عنه بالطريقة نفسها دون المرجع المناسب.

يمكن تنفيذ pruning منفصل لاحقًا وفق قاعدة واضحة: الاحتفاظ بـ`main`، والفروع ذات العمل المفتوح، والفروع التي يطلبها المالك، ثم حذف البقية بعد تصدير قائمة heads ودمجها في سجل التغيير.

## 7. مؤشرات الجودة والمخاطر المتبقية

لم يظهر `TODO` أو `FIXME` حقيقي في كود المنتج؛ النتيجة الوحيدة كانت سلسلة `XXX` داخل integrity string في `package-lock.json`. كما لم تظهر ملفات تحمل أسماء secrets أو tokens أو logs أو backups داخل الملفات المتتبعة.

بعض scripts التي لا يظهر لها test مطابق بالاسم هي أدوات تشغيلية أو تحليلية يدوية، مثل `build-project-evidence-index.js` و`enrich-with-coordinates.js` و`fetch-consultancy.js` و`fetch-developers.js`. لم تُحذف؛ عدم وجود test يحمل اسم script لا يثبت أنها غير مستخدمة.

## 8. قائمة التحقق قبل اعتماد التنظيف

| الفحص | الحالة |
|---|---|
| working tree نظيف قبل التعديل | تم التحقق منه. |
| لا توجد ملفات أسرار أو ملفات مؤقتة غير متتبعة | تم التحقق منه. |
| التقارير التاريخية منفصلة عن الجذر | تم التنفيذ. |
| قواعد `.gitignore` محدثة | تم التنفيذ. |
| لا تغيير في evaluator أو calibration | تم الحفاظ عليه. |
| لا تغيير في Accuracy أو DLD artifacts | تم الحفاظ عليه. |
| اختبار المشروع الكامل | مطلوب تشغيله قبل PR النهائي. |
| تحقق artifacts وhashes | مطلوب تشغيله قبل PR النهائي. |
| حذف النسخ المتشابهة أو الفروع البعيدة | مؤجل لموافقة مستقلة. |

## المراجع

[1]: https://github.com/Hichemorca/aqar-evaluate-engine/blob/main/README.md "Current MIAYAAR project README"

[2]: https://github.com/Hichemorca/aqar-evaluate-engine/blob/main/.gitignore "Repository ignore rules"

[3]: https://github.com/Hichemorca/aqar-evaluate-engine/tree/main/docs "MIAYAAR documentation directory"

[4]: https://github.com/Hichemorca/aqar-evaluate-engine/blob/main/scripts/cleaning-pipeline.js "DLD cleaning pipeline"

[5]: https://github.com/Hichemorca/aqar-evaluate-engine/blob/main/scripts/validate-official-artifacts.js "Official artifact integrity gate"
