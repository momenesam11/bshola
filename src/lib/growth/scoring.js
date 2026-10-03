// Lead scoring and today's call queue.
//
// Five separate 0–100 scores, combined with weights the admin can change in
// the growth settings (stored in growth_settings.weights):
//   fit            — how well the business matches who Beshola is built for
//   intent         — how much they've shown they want something like it
//   pain           — evidence of the problems Beshola solves
//   activity       — how active/alive the business looks
//   contactability — can we actually reach them, and on WhatsApp
// Every score comes with the reasons that produced it, so the screen can
// explain a ranking instead of just showing a number.

import { CATEGORY_BY_KEY, CLOSED_STAGES, DEFAULT_TARGET_AREAS, DEFAULT_WEIGHTS, PAIN_SIGNALS, SOURCE_BY_KEY } from './constants'
import { isMobile } from './phone'

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)))
const DAY = 864e5

function signalTypes(lead) {
  return new Set((Array.isArray(lead.signals) ? lead.signals : []).map((s) => s.type))
}

export function scoreFit(lead, targetAreas = DEFAULT_TARGET_AREAS) {
  const reasons = []
  let score = CATEGORY_BY_KEY[lead.category]?.fit ?? 30
  reasons.push(`النوع: ${CATEGORY_BY_KEY[lead.category]?.label ?? 'غير معروف'}`)
  const place = `${lead.city ?? ''} ${lead.area ?? ''} ${lead.address ?? ''}`.trim()
  if (place && targetAreas.length) {
    if (targetAreas.some((a) => place.includes(a))) reasons.push('في منطقة مستهدفة')
    else if (lead.city) {
      score *= 0.7
      reasons.push('برّه المناطق المستهدفة')
    }
  }
  return { score: clamp(score), reasons }
}

export function scoreIntent(lead, now = Date.now()) {
  const reasons = []
  const types = signalTypes(lead)
  let score = SOURCE_BY_KEY[lead.source]?.intent ?? 30
  reasons.push(`المصدر: ${SOURCE_BY_KEY[lead.source]?.label ?? lead.source}`)
  if (lead.inbound_at && now - new Date(lead.inbound_at).getTime() < 7 * DAY) {
    score = 100
    reasons.push('تواصل معانا خلال آخر أسبوع')
  }
  if (['interested', 'demo'].includes(lead.stage)) {
    score = Math.max(score, 95)
    reasons.push('قال إنه مهتم')
  }
  if (types.has('trial_expiring')) {
    score = Math.max(score, 95)
    reasons.push('تجربته بتخلص قريب')
  }
  if (types.has('trial_expired')) {
    score = Math.max(score, 80)
    reasons.push('تجربته خلصت')
  }
  return { score: clamp(score), reasons }
}

export function scorePain(lead) {
  const reasons = []
  const signals = Array.isArray(lead.signals) ? lead.signals : []
  let score = 0
  for (const s of signals) {
    if (PAIN_SIGNALS.includes(s.type)) {
      score += s.kind === 'fact' ? 40 : 20
      reasons.push(s.evidence)
    }
  }
  if (lead.has_online_booking === false) {
    score += 30
    reasons.push('مفيش حجز أونلاين')
  } else if (signals.some((s) => s.type === 'no_website')) {
    score += 15
    reasons.push('مفيش موقع إلكتروني')
  }
  return { score: clamp(score), reasons }
}

export function scoreActivity(lead) {
  const reasons = []
  const types = signalTypes(lead)
  const count = lead.google_reviews_count
  let score
  if (typeof count === 'number') {
    // ~300 reviews and up reads as a busy, established clinic.
    score = (Math.log10(count + 1) / Math.log10(300)) * 80
    reasons.push(`${count} تقييم على جوجل`)
    if (Number(lead.google_rating) >= 4) {
      score += 10
      reasons.push(`تقييم ${lead.google_rating}`)
    }
  } else {
    score = 40
    reasons.push('مفيش بيانات نشاط')
  }
  if (types.has('likely_new')) {
    score = Math.max(score, 70)
    reasons.push('عيادة جديدة — بتجهّز أنظمتها دلوقتي')
  }
  if (types.has('new_branch')) {
    score += 30
    reasons.push('فاتح فرع جديد')
  }
  if (types.has('active_social')) {
    score += 20
    reasons.push('نشط على السوشيال')
  }
  return { score: clamp(score), reasons }
}

export function scoreContactability(lead) {
  const reasons = []
  let score
  if (isMobile(lead.phone)) {
    score = 100
    reasons.push('موبايل (عليه واتساب غالباً)')
  } else if (lead.phone) {
    score = 70
    reasons.push('تليفون أرضي')
  } else if (lead.email) {
    score = 35
    reasons.push('إيميل بس')
  } else {
    score = 0
    reasons.push('مفيش وسيلة تواصل')
  }
  if ((lead.contact_attempts ?? 0) >= 5) {
    score *= 0.6
    reasons.push(`${lead.contact_attempts} محاولات قبل كده`)
  }
  return { score: clamp(score), reasons }
}

/**
 * @returns {{total: number, parts: Record<string, {score: number, reasons: string[]}>}}
 */
export function scoreLead(lead, { weights = DEFAULT_WEIGHTS, targetAreas = DEFAULT_TARGET_AREAS, now = Date.now() } = {}) {
  const parts = {
    fit: scoreFit(lead, targetAreas),
    intent: scoreIntent(lead, now),
    pain: scorePain(lead),
    activity: scoreActivity(lead),
    contactability: scoreContactability(lead),
  }
  let sum = 0
  let weightSum = 0
  for (const [key, part] of Object.entries(parts)) {
    const w = Math.max(0, Number(weights?.[key] ?? DEFAULT_WEIGHTS[key]) || 0)
    sum += part.score * w
    weightSum += w
  }
  return { total: weightSum ? clamp(sum / weightSum) : 0, parts }
}

/**
 * Today's call list: open leads that are due (no follow-up date, or one that
 * has arrived), fresh inbound requests first, then due follow-ups, then the
 * rest by score.
 */
export function buildQueue(leads, { weights, targetAreas, now = Date.now() } = {}) {
  const endOfToday = new Date(now)
  endOfToday.setHours(23, 59, 59, 999)

  return leads
    .filter((l) => !CLOSED_STAGES.includes(l.stage))
    .filter((l) => (l.phone || l.email) && (!l.next_follow_up_at || new Date(l.next_follow_up_at) <= endOfToday))
    .map((lead) => {
      const { total, parts } = scoreLead(lead, { weights, targetAreas, now })
      const freshInbound =
        lead.inbound_at &&
        now - new Date(lead.inbound_at).getTime() < 2 * DAY &&
        (!lead.last_contacted_at || new Date(lead.last_contacted_at) < new Date(lead.inbound_at))
      const dueFollowUp = !!lead.next_follow_up_at && !freshInbound
      const bucket = freshInbound ? 0 : dueFollowUp ? 1 : 2
      const why = freshInbound
        ? 'طلب يتكلّم معانا — كلّمه النهارده'
        : dueFollowUp
          ? 'ميعاد المتابعة النهارده'
          : 'أعلى تقييم في اللي لسه ماتكلّمش'
      return { lead, score: total, parts, bucket, why }
    })
    .sort((a, b) =>
      a.bucket - b.bucket ||
      (a.bucket === 1 ? new Date(a.lead.next_follow_up_at) - new Date(b.lead.next_follow_up_at) : 0) ||
      b.score - a.score
    )
}
