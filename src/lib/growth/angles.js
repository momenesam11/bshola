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

const POSITIVE_STAGES = ['interested', 'demo', 'trial', 'paid']
const MIN_TRIES = 3

/**
 * What each angle has actually produced so far, per business category:
 * leads contacted with it (sales_angle is set on first contact) and how many
 * of those went on to show interest. This is what makes the recommendation
 * learn from real results instead of staying a fixed rule.
 *
 * @returns {Record<string, Record<string, {tried: number, positive: number}>>} category → angle → counts
 */
export function angleStats(leads = []) {
  const stats = {}
  for (const l of leads) {
    if (!l.sales_angle || !l.last_contacted_at || l.is_test) continue
    const byAngle = (stats[l.category] ??= {})
    const row = (byAngle[l.sales_angle] ??= { tried: 0, positive: 0 })
    row.tried += 1
    if (POSITIVE_STAGES.includes(l.stage) || l.paid_at) row.positive += 1
  }
  return stats
}

const rateText = (row, categoryLabel) =>
  `جابت اهتمام من ${row.positive} من ${row.tried} ${categoryLabel} كلّمتهم بيها`

/**
 * The angle to open with, and why.
 *
 * 1. Evidence about THIS lead (a review complaint, a form they filled, their
 *    trial ending…) decides first — and its quote is the "why".
 * 2. Without evidence, the angle that has converted best for this kind of
 *    clinic in your own results (once it has been tried enough) wins.
 * 3. Otherwise the per-category default, said plainly.
 * When there are results for the chosen angle they're attached as `track`.
 *
 * @param {object} lead
 * @param {{stats?: ReturnType<typeof angleStats>, categoryLabel?: string}} [opts]
 * @returns {{key: string, label: string, pitch: string, basis: 'evidence'|'results'|'default', because: string, track: string|null}}
 */
export function chooseAngle(lead, { stats = {}, categoryLabel = 'عيادة' } = {}) {
  const signals = Array.isArray(lead?.signals) ? lead.signals : []
  const types = new Set(signals.map((s) => s.type))
  const forCategory = stats[lead?.category] ?? {}
  const trackFor = (key) => (forCategory[key]?.tried >= MIN_TRIES ? rateText(forCategory[key], categoryLabel) : null)

  for (const rule of RULES) {
    if (!rule.when(lead, types)) continue
    // Cite the strongest piece of evidence behind the rule: a fact over an inference.
    const related = signals
      .filter((s) => ruleTypes(rule.angle).includes(s.type))
      .sort((a, b) => (a.kind === 'fact' ? -1 : 1) - (b.kind === 'fact' ? -1 : 1))
    const because = related[0]?.evidence ?? sourceReason(lead)
    return { key: rule.angle, ...SALES_ANGLES[rule.angle], basis: 'evidence', because, track: trackFor(rule.angle) }
  }

  const best = Object.entries(forCategory)
    .filter(([key, row]) => SALES_ANGLES[key] && row.tried >= MIN_TRIES && row.positive > 0)
    .sort(([, a], [, b]) => b.positive / b.tried - a.positive / a.tried || b.tried - a.tried)[0]
  if (best) {
    const [key, row] = best
    return {
      key,
      ...SALES_ANGLES[key],
      basis: 'results',
      because: `أحسن زاوية مع ${categoryLabel} لحد دلوقتي: ${rateText(row, categoryLabel)}`,
      track: null,
    }
  }

  const key = CATEGORY_DEFAULT[lead?.category] ?? 'self_booking_24_7'
  return {
    key,
    ...SALES_ANGLES[key],
    basis: 'default',
    because: types.has('inbound_contact_form') || types.has('inbound_loss_calculator')
      ? 'هو اللي طلب يكلّمنا — ابدأ بسؤاله محتاج إيه بالظبط، ودي أقرب زاوية لنوع عيادته لحد ما تعرف.'
      : 'لسه مفيش معلومة عن العيادة دي ولا نتايج كفاية — دي أنسب بداية لنوعها. اسأل في المكالمة وسجّل اللي تعرفه، والتوصية هتتحسن.',
    track: trackFor(key),
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
