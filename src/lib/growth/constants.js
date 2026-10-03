// Shared vocabulary of the growth engine. Keys match the CHECK constraints in
// supabase/migrations/032_growth_engine.sql — change both together.

export const STAGES = [
  { key: 'new', label: 'جديد', color: 'bg-ink/5 text-ink' },
  { key: 'contacted', label: 'اتكلّم', color: 'bg-ink/10 text-ink' },
  { key: 'follow_up', label: 'متابعة', color: 'bg-amber-50 text-amber-700' },
  { key: 'interested', label: 'مهتم', color: 'bg-accent-50 text-accent-700' },
  { key: 'demo', label: 'ديمو', color: 'bg-accent-100 text-accent-800' },
  { key: 'trial', label: 'في التجربة', color: 'bg-accent-100 text-accent-800' },
  { key: 'paid', label: 'دفع 💎', color: 'bg-accent-600 text-white' },
  { key: 'lost', label: 'ضاع', color: 'bg-gray-100 text-gray-500' },
  { key: 'do_not_contact', label: 'ماتكلّمهوش', color: 'bg-gray-200 text-gray-600' },
]
export const STAGE_BY_KEY = Object.fromEntries(STAGES.map((s) => [s.key, s]))

/** Stages where the lead is no longer someone to call. */
export const CLOSED_STAGES = ['paid', 'lost', 'do_not_contact']

// `intent` is the base intent score (0–100) a lead gets just from how it
// arrived: someone who filled a form themselves outranks a cold Maps listing.
export const SOURCES = [
  { key: 'contact_form', label: 'فورم «كلّمني»', intent: 100, inbound: true },
  { key: 'signup_incomplete', label: 'سجّل وماكمّلش', intent: 95, inbound: true },
  { key: 'loss_calculator', label: 'حاسبة الغياب', intent: 90, inbound: true },
  { key: 'referral', label: 'ترشيح من عميل', intent: 85, inbound: true },
  { key: 'partner', label: 'شريك', intent: 80, inbound: true },
  { key: 'google_ads', label: 'إعلان جوجل', intent: 80, inbound: true },
  { key: 'booking_footer', label: 'من صفحة حجز عميل', intent: 75, inbound: true },
  { key: 'organic_signup', label: 'تسجيل مباشر', intent: 70, inbound: true },
  { key: 'facebook_group', label: 'جروب فيسبوك', intent: 60, inbound: false },
  { key: 'google_maps_api', label: 'خرائط جوجل (بحث)', intent: 30, inbound: false },
  { key: 'google_maps_manual', label: 'خرائط جوجل (يدوي)', intent: 30, inbound: false },
  { key: 'import', label: 'استيراد شيت', intent: 30, inbound: false },
  { key: 'manual', label: 'إضافة يدوية', intent: 30, inbound: false },
]
export const SOURCE_BY_KEY = Object.fromEntries(SOURCES.map((s) => [s.key, s]))

/** Sources the admin can pick when adding a lead by hand. */
export const MANUAL_SOURCES = ['google_maps_manual', 'facebook_group', 'google_ads', 'manual', 'import']

export const CATEGORIES = [
  { key: 'dental', label: 'أسنان', fit: 100 },
  { key: 'derma', label: 'جلدية وتجميل', fit: 100 },
  { key: 'clinic', label: 'عيادة (تخصص تاني)', fit: 85 },
  { key: 'salon', label: 'صالون', fit: 50 },
  { key: 'gym', label: 'جيم', fit: 45 },
  { key: 'education', label: 'تعليم', fit: 40 },
  { key: 'other', label: 'تاني', fit: 30 },
]
export const CATEGORY_BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]))

export const OUTCOMES = [
  { key: 'no_answer', label: 'مردّش', icon: '📵' },
  { key: 'sent', label: 'اتبعتت رسالة', icon: '💬' },
  { key: 'replied', label: 'ردّ', icon: '↩️' },
  { key: 'interested', label: 'مهتم', icon: '🔥' },
  { key: 'demo_booked', label: 'حجز ديمو', icon: '📅' },
  { key: 'call_later', label: 'كلّمني بعدين', icon: '⏰' },
  { key: 'not_interested', label: 'مش مهتم', icon: '👎' },
  { key: 'wrong_number', label: 'رقم غلط', icon: '❌' },
  { key: 'do_not_contact', label: 'ماتكلّمنيش تاني', icon: '🚫' },
]
export const OUTCOME_BY_KEY = Object.fromEntries(OUTCOMES.map((o) => [o.key, o]))

export const ACTIVITY_KINDS = {
  call: 'مكالمة',
  whatsapp: 'واتساب',
  email: 'إيميل',
  visit: 'زيارة',
  note: 'ملاحظة',
  stage_change: 'تغيير مرحلة',
  preview: 'صفحة تجريبية',
  inbound: 'تواصل منه',
  system: 'النظام',
}

export const PARTNER_KINDS = [
  { key: 'medical_rep', label: 'مندوب أدوية' },
  { key: 'dental_supplier', label: 'موزّع خامات أسنان' },
  { key: 'clinic_fitout', label: 'شركة تجهيز عيادات' },
  { key: 'accountant', label: 'محاسب / مستشار' },
  { key: 'other', label: 'تاني' },
]

// Signal types → Arabic labels. "kind" on each signal says whether it was
// observed (fact) or concluded (inference); see migration 032.
export const SIGNAL_LABELS = {
  inbound_contact_form: 'طلب يتكلّم معانا',
  inbound_loss_calculator: 'استخدم حاسبة الغياب',
  signup_incomplete: 'سجّل وماكمّلش',
  trial_expiring: 'التجربة بتخلص قريب',
  trial_expired: 'التجربة خلصت',
  review_pain_phone: 'شكوى: التليفون مابيتردّش',
  review_pain_wait: 'شكوى: انتظار طويل',
  review_pain_booking: 'شكوى: الحجز صعب أو بيتلغي',
  review_pain_disorganized: 'شكوى: عدم تنظيم',
  likely_new: 'غالباً عيادة جديدة',
  no_website: 'مفيش موقع إلكتروني',
  manual_booking: 'بيحجز بالتليفون / الواتساب',
  new_branch: 'فاتح فرع جديد',
  active_social: 'نشط على السوشيال',
}

export const PAIN_SIGNALS = [
  'review_pain_phone',
  'review_pain_wait',
  'review_pain_booking',
  'review_pain_disorganized',
  'manual_booking',
]

// What a customer gets when someone they referred subscribes. Granted by
// hand from /admin (the growth screen lists who earned it) — one place to
// change if the offer changes. Recorded in MARKETING_CLAIMS.md §13.
export const REFERRAL_REWARD = 'شهر اشتراك مجاني'

export const DEFAULT_WEIGHTS = { fit: 25, intent: 30, pain: 20, activity: 10, contactability: 15 }

export const DEFAULT_TARGET_AREAS = ['القاهرة', 'الجيزة']
