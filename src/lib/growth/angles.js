// Sales angles: what to lead with on the call / first WhatsApp.
//
// chooseAngle() is the "AI recommendation" layer of the engine, kept
// deterministic and explainable on purpose: it picks an angle only from the
// lead's recorded signals (facts first, then inferences) and returns the
// evidence it used, so the screen can show *why*. With no evidence it falls
// back to a per-category default and says so.
//
// Every pitch line stays inside MARKETING_CLAIMS.md: reminders are sent with
// one tap (never "automatic"), no staff management, no result percentages.

export const SALES_ANGLES = {
  onboarding_help: {
    label: 'مساعدة في الإعداد',
    pitch: 'شفت إنك عملت حساب على بسهولة ومكمّلتش — أقدر أجهّزلك صفحة الحجز معاك على التليفون في 10 دقايق.',
  },
  trial_closing: {
    label: 'قفل التجربة',
    pitch: 'تجربتك قرّبت تخلص — خليني أعرف إيه اللي عجبك وإيه اللي ناقص، وأقولك على الباقة اللي تناسبك.',
  },
  receptionist_workload: {
    label: 'ضغط التليفون والريسبشن',
    pitch: 'المرضى يحجزوا بنفسهم من لينك 24 ساعة، فالتليفون يبطّل يرنّ على سؤال «فيه ميعاد إمتى؟».',
  },
  scheduling: {
    label: 'تنظيم المواعيد',
    pitch: 'كل ميعاد بمدته، والنظام بيمنع الحجز المزدوج، والجدول قدامك يوم/أسبوع/شهر — من غير دفتر.',
  },
  no_shows: {
    label: 'الغياب',
    pitch: 'كل مواعيد بكرا رسايل تذكيرها بتتجهّز لوحدها، وتبعتها من رقم العيادة بضغطة زر — المريض بيفتكر أو بيعتذر بدري.',
  },
  self_booking_24_7: {
    label: 'حجز أونلاين 24 ساعة',
    pitch: 'لينك حجز للعيادة تحطه في جوجل والفيسبوك والواتساب — المريض يختار الميعاد الفاضي بنفسه حتى الساعة 2 بالليل.',
  },
  social_to_booking: {
    label: 'من السوشيال للحجز',
    pitch: 'اللي بيشوف إعلانك أو بوستك يحجز فوراً من لينك في البايو، بدل ما يستنّى رد على الرسايل ويبرد.',
  },
  new_clinic: {
    label: 'عيادة جديدة',
    pitch: 'وإنت لسه بتبدأ: صفحة حجز باسم العيادة ولوجو، ملف لكل مريض، وتقارير — من أول يوم وبدون تجهيزات.',
  },
  patient_follow_up: {
    label: 'متابعة المرضى',
    pitch: 'النظام بيقولك مين مجاش من شهر ومين من شهرين، وتبعتلهم رسالة ترجّعهم — خطط العلاج والجلسات متسجلة.',
  },
  referral: {
    label: 'ترشيح',
    pitch: 'دكتور زميلك بيستخدم بسهولة ورشّحك — أقدر أوريك صفحته وإزاي بيشتغل بيها.',
  },
}

// Ordered: the first matching rule wins. `when` sees the lead and the set of
// signal types it carries.
const RULES = [
  { angle: 'onboarding_help', when: (l, s) => l.source === 'signup_incomplete' || s.has('signup_incomplete') },
  { angle: 'trial_closing', when: (l, s) => s.has('trial_expiring') || s.has('trial_expired') },
  { angle: 'receptionist_workload', when: (l, s) => s.has('review_pain_phone') },
  { angle: 'scheduling', when: (l, s) => s.has('review_pain_booking') || s.has('review_pain_disorganized') || s.has('review_pain_wait') },
  { angle: 'no_shows', when: (l, s) => s.has('inbound_loss_calculator') },
  { angle: 'referral', when: (l) => l.source === 'referral' || l.source === 'booking_footer' },
  { angle: 'new_clinic', when: (l, s) => s.has('likely_new') || s.has('new_branch') },
  { angle: 'self_booking_24_7', when: (l, s) => s.has('manual_booking') || s.has('no_website') || l.has_online_booking === false },
  { angle: 'social_to_booking', when: (l, s) => s.has('active_social') },
]

const CATEGORY_DEFAULT = {
  dental: 'no_shows', // treatment runs over several sessions — every missed one costs a chair slot
  derma: 'social_to_booking', // bookings mostly come from Instagram/Facebook
  clinic: 'self_booking_24_7',
}

/**
 * @returns {{key: string, label: string, pitch: string, basis: 'evidence'|'default', because: string}}
 */
export function chooseAngle(lead) {
  const signals = Array.isArray(lead?.signals) ? lead.signals : []
  const types = new Set(signals.map((s) => s.type))

  for (const rule of RULES) {
    if (!rule.when(lead, types)) continue
    // Cite the strongest piece of evidence behind the rule: a fact over an inference.
    const related = signals
      .filter((s) => ruleTypes(rule.angle).includes(s.type))
      .sort((a, b) => (a.kind === 'fact' ? -1 : 1) - (b.kind === 'fact' ? -1 : 1))
    const because = related[0]?.evidence ?? sourceReason(lead)
    return { key: rule.angle, ...SALES_ANGLES[rule.angle], basis: 'evidence', because }
  }

  const key = CATEGORY_DEFAULT[lead?.category] ?? 'self_booking_24_7'
  return {
    key,
    ...SALES_ANGLES[key],
    basis: 'default',
    because: signals.length
      ? 'المعلومات المسجّلة مش بتحدد مشكلة بعينها — دي الزاوية الأنسب لنوع العيادة ده. اسأل في المكالمة وسجّل اللي تعرفه.'
      : 'مفيش إشارات مسجّلة لسه — دي الزاوية الأنسب لنوع العيادة ده. اسأل في المكالمة وسجّل اللي تعرفه.',
  }
}

function ruleTypes(angle) {
  return {
    onboarding_help: ['signup_incomplete'],
    trial_closing: ['trial_expiring', 'trial_expired'],
    receptionist_workload: ['review_pain_phone'],
    scheduling: ['review_pain_booking', 'review_pain_disorganized', 'review_pain_wait'],
    no_shows: ['inbound_loss_calculator'],
    new_clinic: ['likely_new', 'new_branch'],
    self_booking_24_7: ['manual_booking', 'no_website'],
    social_to_booking: ['active_social'],
    referral: [],
  }[angle] ?? []
}

function sourceReason(lead) {
  if (lead?.source === 'referral') return 'جه من ترشيح عميل حالي'
  if (lead?.source === 'booking_footer') return 'جه من صفحة حجز عيادة بتستخدم بسهولة'
  if (lead?.source === 'signup_incomplete') return 'عمل حساب ومكمّلش الإعداد'
  if (lead?.has_online_booking === false) return 'متسجّل إن مفيش حجز أونلاين'
  return 'حسب مصدر العميل'
}
