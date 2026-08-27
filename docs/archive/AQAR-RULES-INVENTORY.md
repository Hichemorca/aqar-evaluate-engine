# AQAR Rules Inventory — Baseline

**الغرض:** توثيق القواعد الموجودة فعليًا قبل فصلها برمجيًا، دون تغيير القيم أو المعنى.

## Property classification

| النوع الموجود | مصدر الظهور | ملاحظات السلوك الحالي |
|---|---|---|
| apartment | `index.html` وpipeline | bedrooms، pool، elevator، gym وغيرها؛ cost مستبعد في frontend وoffline policy مختلفة حول land |
| villa | `index.html` وpipeline | features وview وstreet وfurnished متاحة |
| townhouse | `index.html` وpipeline | features وview وstreet وfurnished متاحة |
| office | `index.html` وpipeline | view/floor/street/furnished وبعض amenities |
| retail | `index.html` وpipeline | street وبعض amenities؛ cost متاح في frontend/offline |
| warehouse | `index.html` وpipeline | لا تظهر له معظم features؛ واجهة cost تُظهر حسب `onPropertyTypeChange` |
| land | `index.html` وpipeline | لا year/condition/features؛ cost مستبعد من دالة الواجهة، وoffline policy تعيده مع sales/income رغم اختلاف واجهة الدخل |

## Method applicability as implemented

| Method | UI behavior | Offline behavior | حالة التوافق |
|---|---|---|---|
| Sales Comparison | يحسب إذا توفر `avgPriceSqm` أو scraped comparable | هو المسار الأساسي لكل type عند وجود evidence | متوافق اسميًا |
| Income Capitalization | يحسب عند وجود annual rent موجب | policy offline تعيده ضمن apartment/land وباقي الأنواع | يحتاج central policy؛ لا نغيره الآن |
| Cost Approach | يستبعد apartment وland، ويحسب لباقي الأنواع | `getAvailableApproaches()` يعيد cost لكل الأنواع الأخرى | متوافق جزئيًا |
| DCF | يحسب للـ apartment/villa/townhouse/office/retail عند وجود rent | غير موجود في `getAvailableApproaches()` الحالية | `METHODOLOGY DECISION REQUIRED` |

## Weights الموجودة

الـ frontend يعرّف الطرق بالأوزان التالية: Sales `.4`، Income `.35`، Cost `.15`، وDCF `.1`. عند غياب Cost يعاد توزيعها إلى Sales `.55` وIncome `.35` وDCF `.10`. الـ offline pipeline يعرف `CALIBRATION.weights` بالقيم `.40/.35/.15/.10` لكنه لا يستخدم نفس مسار reconciliation الظاهر في الواجهة. هذه القيم تُحفظ كما هي ولا تُعاد معايرتها ضمن التصحيح الحالي.

## Adjustment factors الحالية

| العامل | موضعه | الوضع الحالي |
|---|---|---|
| Size | `getSizeCategory()` وlookup groups | حدود small/medium/large وland categories موجودة؛ لا نغير الحدود |
| Age | `index.html` بنسبة `.004` سنويًا؛ calibration في offline | موجود في مسارين بقواعد مختلفة جزئيًا؛ يحتاج قرار/اختبار قبل التوحيد |
| Condition | `condFactors` للـ unit و`buildFactors` للمبنى | عاملان مختلفان بالاسم والسياق؛ لا ندمجهما تلقائيًا |
| Finish | `finishFactors` في UI | موجود في UI فقط ضمن المسار التفاعلي |
| View | `calculateViewMultiplier` في UI وoffline | taxonomy والقيم مختلفة؛ `METHODOLOGY DECISION REQUIRED` |
| Floor | `floorFactors` في UI | UI فقط ضمن التقييم التفاعلي |
| Street | `streetFactors` في UI | UI فقط ضمن التقييم التفاعلي |
| Furnished | `furnishFactors` في UI | UI فقط ضمن التقييم التفاعلي |
| GIS | UI impact يصل حتى 12% تقريبًا؛ offline proximity يستخدم `-1.56%` calibrated range | مساران مختلفان؛ لا نغير القيم |
| Cap rate / vacancy | consultancy data مع default 7% و10% في مسارات مختلفة | assumptions/fallbacks تحتاج تصنيفًا وقرار مالك |

## Comparable selection

`dld-lookup` ينفذ بحثًا تكيفيًا متدرجًا: district + type + size، ثم district + type، ثم district-only، مع حد أدنى حالي قدره 5 معاملات. `evaluate-and-save.js` يستخدم project+size وproject وdistrict+size وdistrict، مع حدود project تختلف للـ retail. هذه القواعد محفوظة؛ الإصلاح الآمن هو جعل مستوى البحث والعدد والخصائص المستخدمة جزءًا من evidence في النتيجة.

## Evidence classification

حقول مثل `actualSalePrice` و`saleDate` و`district` و`propertyType` تُعامل كبيانات معاملات مصدرية عندما تأتي من DLD. `pricePerSqm` وweighted medians وaqarValuation وaqarVsActual مشتقات أو model outputs. cap rate وvacancy وfallback prices وdefault expenses assumptions. لكن schema الحالي لا يميز هذه الفئات صراحة. كذلك `appraiserValuation` في offline و`scrape-sold` مولد عشوائيًا، لذلك لا يجوز عرضه كـ source fact أو appraiser evidence.

## Confidence

في `dld-lookup` مستوى الثقة يعتمد على نافذة البيانات: high حتى 90 يومًا، medium حتى 180 يومًا، وإلا low، بينما method detail يعتمد على عدد المقارنات. `calculateWeightedValue()` يبدأ من 60 ويضيف زيادات حسب وجود high confidence وعدد الطرق. في Market Intelligence توجد confidence score مختلفة. تعدد المعاني هذا يحتاج توثيقًا وفصلًا، لا إعادة تصميم ضمن هذه المهمة.

## Existing but unused / inconsistent

- `getAvailableApproaches()` موجودة في offline pipeline ولا تُستخدم كسياسة مشتركة للواجهة.
- `filterAmenities()` و`ALLOWED_AMENITIES` موجودان في offline pipeline، بينما الواجهة تجمع features مختلفة ولا تمر عبر نفس policy.
- `dcfApproach()` موجود في UI، لكنه غائب عن قائمة offline applicability.
- `viewApplied` في accuracy metadata قد يكون صفرًا رغم وجود view logic؛ يلزم تفسير مصدر البيانات قبل تغيير العامل.
- Property Finder وBayut functions في `scrape-sold.js` stubs تعيد مصفوفات فارغة.
- `appraiserValuation` وfallback records في مسارات accuracy قد تكون اصطناعية.

## قرارات ممنوع حسمها بالتخمين

1. هل DCF applicable في AQAR للأنواع التي يحسبها UI أم يجب استبعاده؟
2. هل land يتضمن Income أو أي طريقة أخرى وفق policy المقصودة؟
3. هل estimated/generated records مسموحة للعرض، وهل تدخل accuracy dashboard؟
4. ما المصدر المقبول لمقارنة appraiser؟
5. هل يجب توحيد معاملات view/GIS بين offline وinteractive، وبأي مجموعة قيم؟
6. هل default cap rate/vacancy/expenses business rules معتمدة أم assumptions مؤقتة؟

هذه البنود يجب أن تبقى `METHODOLOGY DECISION REQUIRED` حتى يجيب المالك عنها.
