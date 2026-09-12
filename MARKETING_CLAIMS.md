# MARKETING_CLAIMS.md

سجل كل ادعاء مكتوب على صفحة الهبوط (`src/pages/marketing/LandingPage.jsx` والمكوّنات تحت
`src/components/marketing/`) والدليل عليه في الكود. **أي ادعاء بدون سطر دليل هنا لا يُكتب على
الصفحة.** لو ميزة اتغيرت أو اتشالت من المنتج، التزم بتحديث السطر المقابل هنا وشيل الادعاء من
الصفحة في نفس الـPR.

آخر تحقق: فحص الكود على فرع `redesign/landing-page`.

---

## 1. الحجز والمواعيد

| الادعاء على الصفحة | الدليل في الكود |
|---|---|
| المريض يحجز في 3 خطوات: الخدمة ← الموعد ← بياناته | `src/pages/booking/BookingPage.jsx:36-39` (`STEP_LABELS = ['الخدمة', 'الموعد', 'بياناتك']`) |
| صفحة حجز عامة برابط مخصص لكل نشاط | `src/App.jsx` راوت `/book/:businessSlug` · `src/pages/settings/Settings.jsx:476-485` (تعديل الرابط + فحص التوفر) |
| الحجز شغال 24 ساعة من المتصفح بدون تطبيق وبدون حساب | `BookingPage.jsx` صفحة عامة غير محمية بـauth · `BookingPage.jsx:619` يطلب رقم واتساب فقط |
| العميل يشوف الأوقات المتاحة فعلاً | `BookingPage.jsx:380` (`getSlots()`) — يحسب الخانات من ساعات العمل والمواعيد المحجوزة |
| قائمة انتظار: العميل يسجّل لو مفيش موعد فاضي | `BookingPage.jsx:124-125, 555` (`waitlistMode`) · `BookingPage.jsx:315-316` شاشة التأكيد |
| صاحب النشاط يبلّغ أول واحد في قائمة الانتظار لما يتفرج موعد | `src/components/appointments/AppointmentModal.jsx:71-78` (`notifyFirst()` → يفتح واتساب ويحوّل الحالة لـ`confirmed`) |
| منع الحجز المزدوج على مستوى قاعدة البيانات | `supabase/migrations/021_capacity_lock_trigger.sql` · `023_fix_rls_self_reference_and_capacity_lock.sql:48-80` (`check_capacity_before_insert()` بقفل صف) · `024_fix_capacity_trigger_rls_blindness.sql` |
| كاليندر بعرض يوم / أسبوع / شهر | `src/components/calendar/BesholaCalendar.jsx:132-134` |
| قائمة مواعيد بفلاتر حالة + مدى تاريخ + فرع + خدمة | `src/pages/dashboard/AppointmentList.jsx:58, 106, 142` |
| إشعار فوري بكل حجز جديد أو إلغاء أو تسجيل في قائمة الانتظار | `src/hooks/useNotifications.js:56-61` (Supabase realtime) · `src/components/layout/TopBar.jsx:24-27` (أنواع الإشعارات) |
| صوت تنبيه مع الإشعار | `src/hooks/useNotifications.js:8-27` (`playNotificationSound`) |
| الخدمة لها مدة وسعر | `supabase/migrations/001_initial_schema.sql:38-45` (`duration_minutes`, `price`) · `src/pages/settings/Settings.jsx:667` |
| أكثر من فترة عمل في اليوم الواحد بدون تقاطع | `supabase/migrations/013_flexible_schedule.sql` · `src/pages/settings/Settings.jsx:674` |

## 2. تذكير الواتساب

| الادعاء على الصفحة | الدليل في الكود |
|---|---|
| الرسالة تتجهّز جاهزة والإرسال بضغطة زر من رقمك — **مش تلقائي** | `src/lib/whatsapp.js:1` (تعليق: *"WhatsApp Manual Sender — opens WhatsApp Web/App with pre-filled message, no API needed"*) · `whatsapp.js:45-48` (`openWhatsApp` → `wa.me`) |
| قائمة «تذكيرات بكرا» بتمشّيك على مواعيد الغد واحد واحد | `src/pages/dashboard/TomorrowReminders.jsx:196` (العنوان) · `TomorrowReminders.jsx:102-113` (`sendCurrent` ثم `next`) · `:122` («إرسال الكل») |
| النظام يسجّل مين اتبعتله تذكير | `TomorrowReminders.jsx:105` (`reminder_sent: true`) |
| نص رسالة التذكير قابل للتعديل بمتغيرات | `src/pages/settings/Settings.jsx:688-693` (`{client_name} {service} {time} {business_name} {branch}`) · `src/utils/constants.js:52-53` (القالب الافتراضي) |
| تحديد وقت التذكير قبل الموعد (من ساعتين لـ48 ساعة) | `src/utils/constants.js:44-51` (`REMINDER_OPTIONS`) |
| رسالة التذكير بتطلب من العميل يرد لو عايز يغيّر أو يلغي | `src/lib/whatsapp.js:16` (*"لو محتاج تغيير أو إلغاء، ردّ على هذه الرسالة"*) |
| رسالة تأكيد جاهزة بعد الحجز | `src/lib/whatsapp.js:24-42` (`generateConfirmationMessage`) |

## 3. متابعة العملاء

| الادعاء على الصفحة | الدليل في الكود |
|---|---|
| تصنيف تلقائي: منتظم (≤30 يوم) · فاتر (31–60) · ضايع (+60) | `src/hooks/useClients.js:6-10` |
| عدّاد لكل تصنيف في صفحة العملاء | `src/pages/crm/ClientsPage.jsx:192-194` |
| حملة إعادة استهداف جماعية برسالة فيها متغيرات | `src/pages/crm/RetargetModal.jsx:8-10` (`{client_name} {business_name} {booking_link}`) · `:69-81` (التنفيذ على كل عميل) |
| استهداف فئة معينة (فاترين / ضايعين / الكل) | `src/pages/crm/RetargetModal.jsx:14-16` |
| معاينة الرسالة قبل الإرسال | `src/pages/crm/RetargetModal.jsx:59-61` |
| خطة زيارات (كورس علاج) بعدد زيارات ومتابعة المنفَّذ | `src/pages/crm/ClientPlanTab.jsx:53-54` (اسم الخطة + عدد الزيارات) · `:86` (رقم الزيارة) |
| كشف حساب: مدفوعات ومستحقات ورصيد | `src/pages/crm/ClientLedgerTab.jsx:28-30` (مبلغ + طريقة دفع + ملاحظة) · `:52-53` (مستحق) · `:78` (الرصيد) |
| بحث في العملاء | `src/pages/crm/ClientsPage.jsx:169, 211` |

## 4. الملف الطبي (العيادات)

| الادعاء على الصفحة | الدليل في الكود |
|---|---|
| ملف مريض: تاريخ ميلاد، جنس، رقم قومي، عنوان، إيميل | `src/pages/patients/PatientRecord.jsx:195-214` |
| معلومات طوارئ (اسم ورقم) | `PatientRecord.jsx:220-225` |
| فصيلة دم · حساسية · أمراض مزمنة · أدوية حالية | `PatientRecord.jsx:233-250` |
| تشخيص لكل زيارة + موعد متابعة | `PatientRecord.jsx:354-362, 412-436` |
| روشتة: اسم الدواء، الجرعة، التكرار، المدة، ملاحظات، تعليمات عامة | `PatientRecord.jsx:502-527` · `:490` (الحفظ) |
| طباعة الروشتة | `PatientRecord.jsx:571-572` (`window.print()`) |
| مرفقات: أشعة · تحليل · تقرير · أخرى | `PatientRecord.jsx:61` (`FILE_TYPE_LABELS`) · `supabase/migrations/007_patient_records.sql` |
| تابات الملف الطبي: البيانات · الزيارات · خطة الزيارات · كشف الحساب · الروشتات · الملفات | `PatientRecord.jsx:782-789` |
| الأنشطة غير الطبية بتاخد ملف مبسّط (بدون روشتة) | `PatientRecord.jsx:790-795` (`SIMPLE_TABS`) · `src/utils/constants.js:1-2` |

## 5. التقارير

| الادعاء على الصفحة | الدليل في الكود |
|---|---|
| إجمالي المواعيد · الحضور · الغياب · معدل الحضور | `src/pages/reports/Reports.jsx:147-150` |
| كارت خسارة الشهر: قيمة الغياب مقابل اللي اتوفّر بالتذكير | `src/components/reports/MonthlyLossCard.jsx:25-36` (الحساب) · `:53-80` (العرض) |
| القيمة محسوبة بمتوسط سعر خدماتك | `MonthlyLossCard.jsx:20-24` (`avgPrice`) |
| تصدير المواعيد CSV | `Reports.jsx:39-54, 127-130` |
| طباعة تقرير بتنسيق عربي صحيح | `Reports.jsx:132` · `src/pages/reports/PrintableReport.jsx:20-28` |
| فلترة بمدى تاريخ وحالة | `Reports.jsx:109, 157-165` |

## 6. الفروع والهوية

| الادعاء على الصفحة | الدليل في الكود |
|---|---|
| أكثر من فرع، كل فرع بساعات عمل مستقلة | `src/pages/settings/BranchSettings.jsx:104-143` · `supabase/migrations/006_branches.sql` |
| سعة حجز متوازية لكل فرع (لغير العيادات) | `BranchSettings.jsx:88, 97, 137` · `supabase/migrations/014_parallel_capacity.sql` |
| تمييز مواعيد كل فرع بلون في العرض المجمّع | `src/utils/constants.js:56-66` (`BRANCH_COLOR_PALETTE`) |
| هوية صفحة الحجز: لوجو · غلاف · لون أساسي · رابط مخصص · نبذة · رسالة ترحيب · سياسة إلغاء | `src/pages/settings/Settings.jsx:428-543` · `src/pages/onboarding/OnboardingFlow.jsx:591-690` · `supabase/migrations/008_business_identity.sql` |
| 6 أنواع أنشطة بخدمات مقترحة جاهزة | `src/pages/onboarding/OnboardingFlow.jsx:107-114` |

## 7. الحساب والتجربة والأسعار

| الادعاء على الصفحة | الدليل في الكود |
|---|---|
| 6 خطوات إنشاء الحساب: نوع النشاط · معلوماتك · الفروع · ساعات العمل · الخدمات · هويتك | `src/pages/onboarding/OnboardingFlow.jsx:37` (`STEPS`) |
| 14 يوم تجربة | `supabase/migrations/012_trial_system.sql:6` (`now() + interval '14 days'`) |
| التجربة بدون بطاقة بنكية | لا يوجد أي تكامل مدفوعات في المستودع — التسجيل في `src/pages/auth/Register.jsx` لا يطلب أي بيانات دفع (نفي متحقق، انظر §8) |
| الأسعار 299 / 650 / 1200 جنيه | قرار تجاري من صاحب المنتج (مش في الكود). المصدر الوحيد على الصفحة: `src/lib/seo.js` (`PLANS`) — أي تغيير يتم من هناك |
| كل الباقات بنفس المميزات | نفي متحقق: مفيش أي بوابة مميزات أو `plan`/`tier` gating في الكود؛ `subscription_type` في `012_trial_system.sql:8` يُستخدم للتفعيل لا لتقييد المميزات |
| بدون عمولة على الحجوزات | نفي متحقق: مفيش أي حساب عمولة/نسبة في الكود ولا أي تكامل دفع (§8) |
| بيشتغل على الموبايل من المتصفح | كل الصفحات responsive بـTailwind · `src/index.css:22-26` (منع التزويم في iOS) |

## 8. نفي متحقق — ادعاءات ممنوعة على الصفحة

| ممنوع نكتبه | ليه |
|---|---|
| «تذكير تلقائي / أوتوماتيك» | الإرسال يدوي بضغطة زر — `src/lib/whatsapp.js:1` |
| «رابط تأكيد أو إلغاء في رسالة التذكير» | الرسالة بتقول «ردّ على هذه الرسالة» ومفيش أي لينك تأكيد — `src/lib/whatsapp.js:16` |
| «إدارة موظفين» أو «صلاحيات متعددة» | مفيش جدول أو واجهة موظفين؛ الصلاحيات مالك واحد فقط — `owner_id` في سياسات RLS بـ`001_initial_schema.sql:49-52` |
| «مواعيد لكل كوافير / مدرب على حدة» | مفيش ربط موعد بموظف؛ التوازي بيتحقق بـ`capacity` على الفرع فقط — `014_parallel_capacity.sql` |
| «ألوان للخدمات» | جدول `services` فيه الاسم والمدة والسعر فقط — `001_initial_schema.sql:38-45`. الألوان للفروع مش للخدمات |
| مدفوعات إلكترونية / بوابة دفع | صفر نتائج لـ`stripe\|paymob\|fawry\|checkout\|payment_gateway` في `src/` و`supabase/` |
| SMS | `supabase/migrations/010_remove_twilio.sql` شال التكامل |
| تطبيق موبايل | مفيش أي كود نيتف؛ ويب responsive فقط |
| جوجل كالندر · فواتير ضريبية · مخزون | صفر نتائج في المستودع |
| أي رقم عملاء أو اسم منشأة أو رأي عميل | مفيش مصدر موثّق — قسم آراء العملاء اتشال بالكامل من الصفحة |
| أي نسبة نتائج («يقلل الغياب 40%») | مفيش قياس فعلي |

## 9. أرقام توضيحية على الصفحة (مش بيانات حقيقية)

| المكان | المعالجة |
|---|---|
| هاتف الهيرو (أسماء خدمات ومواعيد) | خدمات حقيقية من قائمة العيادة المقترحة في `OnboardingFlow.jsx:108`، ومواعيد كمثال — مكتوب تحتها إنها عرض للواجهة |
| كارت «خسارة الشهر» في قسم المشكلة | مكتوب عليه **«مثال توضيحي»** صريح، والأرقام مش منسوبة لأي عميل |

## 10. صفحات SEO العنقودية

الجدول ده بينطبق كمان على صفحات `src/content/marketingPages.js` (عيادات، أسنان، جلدية،
صالونات، جيم، تعليم، ملاعب، مميزات، أسعار). اتشالت منها الادعاءات التالية بعد فحص الكود:

| الادعاء المحذوف | السبب |
|---|---|
| «تذكير تلقائي / أوتوماتيك» | الإرسال يدوي — `src/lib/whatsapp.js:1` |
| «رابط التأكيد أو الإلغاء» في رسالة التذكير | الرسالة تطلب الرد ومفيش لينك — `src/lib/whatsapp.js:16` |
| «موظفين لكل فرع» · «تقارير لكل موظف» · «اختيار الموظف في الحجز» | مفيش موظفين في المنتج — §8 |
| «مواعيد لكل كوافير» · «جدول مستقل لكل مدرب» | التوازي بـ`capacity` على الفرع فقط — `014_parallel_capacity.sql` |
| «سعر مختلف لساعات الذروة» | `services.price` سعر واحد للخدمة — `001_initial_schema.sql:43`. البديل الصحيح: خدمة منفصلة لكل تسعيرة |
| «سعة لكل مجموعة/حصة» | السعة حقل على الفرع مش على الخدمة — `BranchSettings.jsx:137` |
| «نسبة إشغال الملاعب» | التقارير بتحسب المواعيد والحضور والغياب، مفيش حساب إشغال — `Reports.jsx:147-150` |

## 11. ادعاءات الأسئلة الشائعة وصفحتي الخصوصية والشروط

| الادعاء | الدليل |
|---|---|
| كل حساب يشوف بياناته هو بس (صلاحيات على مستوى الصفوف) | `supabase/migrations/001_initial_schema.sql:49-52` وسياسات مماثلة في كل الجداول · `011_fix_all_rls.sql` · `018_fix_medical_files_security.sql` |
| بعد انتهاء الاشتراك: الدخول والحجز يتوقفوا والبيانات تفضل | `src/middleware/TrialGuard.jsx:12-14` · `supabase/migrations/022_lock_expired_business_booking.sql` — مفيش أي حذف بيانات |
| زر حذف الحساب نهائياً | `src/pages/settings/Settings.jsx:716-718` («منطقة الخطر») |
| الاشتراك والتجديد بالتنسيق على واتساب والتفعيل إداري | `src/pages/admin/AdminDashboard.jsx:118-124` (رسالة التجديد) · `supabase/migrations/012_trial_system.sql:39` (صلاحية التفعيل للأدمن) |
| قياس زيارات مجمّع بـVercel Analytics | `src/App.jsx` (`<Analytics />` من `@vercel/analytics/react`) |
| محتوى محادثات الواتساب مش بيمر علينا | الرسالة تتكوّن على جهاز المستخدم وتُفتح في تطبيقه — `src/lib/whatsapp.js:45-48`؛ اللي بيتخزن هو `reminder_sent` فقط — `TomorrowReminders.jsx:105` |
| مفيش بيانات بطاقات بنكية | صفر تكامل مدفوعات في المستودع — §8 |

## 12. تعارض محتاج قرار منك

| الموضوع | التفاصيل |
|---|---|
| سعر الاشتراك | رسالة تجديد الاشتراك في `src/pages/admin/AdminDashboard.jsx:122` مكتوب فيها **«تبدأ من 99 جنيه/شهر»**، وصفحة الأسعار **299 جنيه**. الصفحة ماشية على 299 زي ما اتفقنا؛ لازم تعدّل الرسالة في الأدمن أو تقولي أعدّلها عشان مايوصلش للعميل رقمين مختلفين. |
