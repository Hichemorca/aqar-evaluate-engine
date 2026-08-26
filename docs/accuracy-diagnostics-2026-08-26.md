# Accuracy Diagnostics — 2026-08-26

## الغرض

هذا التقرير يشرح ملف `data/accuracy-diagnostics.json` المولد من `data/accuracy-data.json` الرسمي فقط. diagnostics تشخيصية ولا تغيّر Accuracy المنشورة أو calibration أو الأوزان أو معاملات التقييم أو بيانات DLD.

## المصدر والنطاق

| المؤشر | القيمة |
|---|---:|
| Artifact المصدر | `data/accuracy-data.json` |
| Accuracy scope | `verified-dld-only` |
| السجلات في artifact | 8,108 |
| السجلات المحسوبة | 8,108 |
| السجلات بلا provenance رسمي | 0 |
| السجلات بلا comparable diagnostics | 0 |
| Calibration config | `cal-1787651025399` |
| Source data | `dld-real-cleaned` / `Government Record` / `eligible` |

يربط الملف الناتج نفسه بـSHA-256 للـartifact المصدر حتى يمكن اكتشاف أي عدم تزامن. إعادة تشغيل `npm run diagnostics` على نفس artifact تعيد نفس البنية والقيم.

## النتائج الإجمالية

| المؤشر | القيمة |
|---|---:|
| Average Accuracy | 85.13% |
| Average absolute error | 14.87% |
| Median absolute error | 9.8% |
| P90 absolute error | 30.4% |
| P95 absolute error | 41.1% |
| Bias | +2.93% |
| Within ±10% | 50.90% |
| Within ±15% | 66.88% |
| Within ±25% | 84.56% |
| Absolute error >50% | 3.01% |
| Absolute error >100% | 0.81% |
| Maximum absolute error | 4,211.9% |

## الشرائح التي تستحق validation لاحقًا

أظهر التحليل أن أعلى متوسط خطأ بين الشرائح ذات العينة التي لا تقل عن 30 سجلًا كان في `land | district_size` بمتوسط absolute error قدره 35.30% وP90 قدره 50.30%. تليه `retail | district_size` بمتوسط 30.09%، ثم `land | district` بمتوسط 26.61%. هذه نتائج تشخيصية وليست دليلًا كافيًا لتعديل المعاملات.

وجود outlier بحد أقصى 4,211.9% يستدعي فحص provenance والقيم الخام وعلاقة المقارنة قبل أي استنتاج. لا ينبغي قصّه أو استبعاده من Accuracy الرسمية تلقائيًا؛ يجب أولًا تحديد ما إذا كان يمثل صفقة صحيحة، حالة low-liquidity، فرقًا في الوحدة، أو حالة بيانات تحتاج مراجعة.

## الضوابط

يحتوي diagnostics على error buckets، slices حسب property type وevaluation level وarea band وsale month، وأعلى 25 خطأ مطلقًا. كما يثبت أن مجموع buckets يساوي عدد السجلات المحسوبة وأن كل السجلات الحالية تحمل provenance DLD الرسمي.

يجب أن تظل أي خطوة لاحقة منفصلة عن هذا PR: فحص outliers، rolling-origin validation، وتحليل stability حسب النوع والمنطقة. لا يجوز استخدام هذه المؤشرات وحدها لتعديل weights أو coefficients أو fallback أو shadow multipliers.

## التنفيذ وإعادة الإنتاج

```bash
npm run diagnostics
npm test
node /home/ubuntu/check-inline-script.cjs
git diff --check
```

يولد workflow اليومي diagnostics بعد `evaluate-and-save.js` وقبل client summaries، ثم يضيف artifact الناتج إلى commit التحديث اليومي ضمن مجلد `data/`.
