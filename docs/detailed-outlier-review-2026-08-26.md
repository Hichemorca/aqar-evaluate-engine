# المراجعة التفصيلية للحالات الشاذة — MIAYAAR

**تاريخ التحليل:** 26 أغسطس 2026  
**النطاق:** السجل `DLD-41-8610-2026` ومجموعة `INTERNATIONAL CITY PH 2 & 3`.  
**الحالة:** تحليل قراءة فقط؛ لا تغيير في Accuracy أو DLD أو evaluator أو calibration أو fallback.

## الخلاصة التنفيذية

أُعيدت مطابقة Accuracy مع DLD، ثم أُعيد بناء مجموعات المقارنات من نسخة DLD الموجودة محليًا، مع قراءة CSV المتاح للتحقق من الحقول الخام. لم يظهر أي اختلاف في الحقول الأساسية بين Accuracy وDLD عبر كامل artifact: **0 mismatch**.

ظهر اكتشاف تشخيصي مهم في `INTERNATIONAL CITY PH 2 & 3`: توجد **41 حالة من أصل 99** بنسبة `area / procedureArea` قريبة من الحد الأعلى المقبول حاليًا، أي `>= 1.95` مقابل حد تنظيف قدره `2.0`. هذه المجموعة حققت MAE قدره **122.352%** وتضم **40 حالة** من أصل 40 حالة شديدة في المنطقة. أما الحالات الـ58 ذات النسبة الأقل من 1.5 فحققت MAE قدره **17.603%** ولم تتضمن أي حالة يتجاوز خطؤها 100%.

هذا الارتباط قوي بما يكفي لفتح مراجعة **دلالة area وprocedureArea**، لكنه لا يثبت وحده أي حقل هو الصحيح ولا يبرر تعديل pipeline أو evaluator. التوصية الآمنة هي إضافة تحقق مصدر/وحدة قياس قبل أي تجربة shadow، وليس تغيير استخدام `area` أو `procedureArea` في التقييم الرسمي.

> **القرار:** تُصنف مجموعة النسبة القريبة من 2.0 كـdata-semantics review candidate، ويبقى التقييم الرسمي كما هو إلى أن يتم التحقق من تعريف الحقلين في مصدر DLD المعتمد.

## 1. سلامة المصدر وإعادة البناء

| الفحص | النتيجة |
|---|---:|
| Accuracy records | 8,108 |
| DLD records | 26,766 |
| DLD records بعد normalization | 26,766 |
| DLD eligible records | 26,766 |
| سجلات المقارنة بعد pipeline الظلي | 23,160 |
| Accuracy/DLD core-field mismatches | 0 |
| تغييرات في artifacts الرسمية | لا يوجد |
| استبعاد أو clipping | لا يوجد |

إعادة البناء استخدمت قواعد المشروع الحالية كما هي، ولم تُعدّل تلك القواعد. البصمات محفوظة داخل artifact الآلي، والتقرير قابل لإعادة التشغيل بواسطة `scripts/analyze-detailed-outliers.js`.[1] [2]

## 2. السجل ذي الأولوية: DLD-41-8610-2026

| الحقل | القيمة |
|---|---:|
| التاريخ | 2026-06-23 |
| النوع | land |
| المنطقة | `MADINAT AL MATAAR` |
| مستوى التقييم | `district_size` |
| عدد المقارنات | 6 |
| area | 15,760.16 م² |
| procedureArea | 15,760.16 م² |
| area/procedureArea | 1.0000 |
| السعر الفعلي | AED 3,229,200 |
| تقييم MIAYAAR | AED 139,241,014 |
| السعر الفعلي لكل م² | AED 204.90 |
| السعر المتوقع لكل م² | AED 8,835 تقريبًا |
| الخطأ المطلق | 4,211.935% |
| median المقارنات لكل م² | AED 7,653.20 |
| dispersion للمقارنات | `low` |

في CSV المتاح، يظهر السجل كـ`Land` مع `Delayed Sell`، وتساوي `PROCEDURE_AREA` و`ACTUAL_AREA` عند 15,760.16 م². كما أن المقارنات الست في نفس `district_size` تراوحت بين AED 7,194.01 وAED 14,640.90 لكل م²، ما يجعل السعر الفعلي للسجل منخفضًا جدًا مقارنةً بالـcohort المختار.

لا يمكن من هذه البيانات وحدها الجزم بأن الصفقة خاطئة؛ فقد تكون صفقة صحيحة ذات شروط أو طبيعة مختلفة. لذلك تصنيفها الحالي هو **مراجعة دلالة صفقة/label أولًا**، وليس سببًا لتغيير سعر الأرض أو معاملها.

## 3. مجموعة International City

| المؤشر | القيمة |
|---|---:|
| DLD records | 275 |
| Accuracy records | 99 |
| Apartment Accuracy records | 96 |
| Land Accuracy records | 3 |
| الحالات ذات الخطأ >100% | 40 |
| MAE الكلي | 60.984% |
| median absolute error | 30.216% |
| P90 absolute error | 127.788% |
| bias | +47.176% |
| median actual price/m² | AED 8,424.01 |
| median predicted price/m² | AED 9,987.99 |

الحالات الأربعون الشديدة كلها من **Apartment**، وتعود إلى 2026-05-20، وجميعها تقريبًا ضمن `district_size`. هذا يشير إلى cluster زمني/قطاعي محدد، وليس إلى outliers موزعة عشوائيًا على كل فترات المنطقة.

## 4. area مقابل procedureArea

| المجموعة | السجلات | median ratio | MAE | الحالات >100% |
|---|---:|---:|---:|---:|
| ratio قريب من حد 2.0، `>=1.95` | 41 | 1.9997 | 122.352% | 40 |
| ratio أقل من 1.5 | 58 | 1.0000 | 17.603% | 0 |

أول مثال شديد هو `DLD-11-16093-2026`: قيمة `ACTUAL_AREA` في CSV هي **75.51**، بينما `PROCEDURE_AREA` هي **37.76**، بنسبة تقارب **2.0**. Accuracy وDLD المنظف يحتفظان بالقيمتين نفسيهما، ولذلك لا يوجد mismatch تقني بين artifactين. الإشارة هنا تتعلق بتفسير الحقول، لا بسلامة الربط.

المقارنات المستخدمة لهذا المثال كانت على مستوى `district_size` بعدد **152** peer، وبـmedian peer price-per-sqm قدره **AED 10,361.98**، بينما السعر الفعلي للسجل يقارب **AED 3,900.94** لكل م²، والتقييم يقارب **AED 9,988** لكل م². هذه الأرقام توضح الفجوة، لكنها لا تثبت هل يجب اعتماد `ACTUAL_AREA` أو `PROCEDURE_AREA` في كل أنواع الصفقات.

## 5. التصنيف الآمن

| التصنيف | الحالات | الأساس |
|---|---:|---|
| Data semantics / source review first | 41 في International City، وتشمل 40 حالة شديدة | area/procedureArea قريب من حد 2.0، مع cluster زمني واضح |
| Valid extreme transaction candidate | السجل `DLD-41-8610-2026` | source match كامل، لكن actual price/m² بعيد جدًا عن cohort الأرض |
| Performance review after input semantics | الحالات الأخرى ذات ratio الطبيعي | لا يوجد mismatch مصدر، وتحتاج تحليلًا مستقلًا للمقارنات/fallback |

هذا التصنيف لا يستبعد الحالات ولا يغير وزنها في Accuracy. وهو فقط يحدد ترتيب المراجعة اليدوية والتجارب المستقبلية.

## 6. التوصية التالية

قبل أي تعديل في evaluator أو cleaning pipeline، يجب الحصول على تعريف موثق للحقلين `PROCEDURE_AREA` و`ACTUAL_AREA` من مصدر DLD المعتمد، ثم اختبار الحالات الأربعين على نسخة shadow منفصلة ومعلنة مسبقًا. يجب أن تقارن التجربة baseline الرسمي بمقياس MAE وP90 وضمن ±15% عبر rolling-origin، وأن تفصل نتائج السجلات ذات ratio القريب من 2 عن بقية السجلات.

حتى يتم هذا التحقق، لا يُنصح بتغيير حد `2.0` أو استخدام حقل مختلف في التقييم أو استبعاد حالات 2026-05-20. أي تغيير من هذا النوع سيؤثر في Accuracy الرسمية ويحتاج موافقة صريحة بعد validation كامل.

## 7. الملفات القابلة لإعادة الإنتاج

| الملف | الغرض |
|---|---|
| `scripts/analyze-detailed-outliers.js` | إعادة بناء المقارنات وتحليل priority record وInternational City |
| `docs/detailed-outlier-review-2026-08-26.json` | artifact آلي كامل مع hashes وpeer details |
| `docs/detailed-outlier-review-2026-08-26.md` | هذا التقرير التنفيذي |

## References

[1]: https://github.com/Hichemorca/aqar-evaluate-engine/blob/main/data/accuracy-data.json "MIAYAAR official Accuracy artifact"
[2]: https://github.com/Hichemorca/aqar-evaluate-engine/blob/main/data/dld-transactions.csv "MIAYAAR DLD CSV artifact"
[3]: https://github.com/Hichemorca/aqar-evaluate-engine/blob/main/scripts/cleaning-pipeline.js "MIAYAAR cleaning pipeline"
[4]: https://github.com/Hichemorca/aqar-evaluate-engine "MIAYAAR / AQAR Evaluate Engine repository"
