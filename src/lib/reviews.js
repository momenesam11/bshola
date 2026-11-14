// Asking patients for a Google review after a visit (migration 051). The
// message goes out by hand through wa.me, and each number is asked once per
// clinic, so a regular patient isn't asked after every visit.

import { phoneDigits } from './countries'

// How many days back a finished visit still gets a request. Later than that
// the visit is stale and the message reads odd.
export const REVIEW_WINDOW_DAYS = 3

/** The link a clinic saves: https only, and short enough for the column. */
export function isReviewUrl(url) {
  const value = String(url || '').trim()
  return /^https:\/\/\S+$/.test(value) && value.length <= 500
}

export function generateReviewRequestMessage(appointment, business) {
  return `أهلاً يا ${appointment.client_name}

شكراً إنك زرتنا في ${business.name}، ونتمنى تكون مبسوط من الزيارة.
لو عندك دقيقة، تقييمك على جوجل بيفرق معانا جداً وبيساعد ناس تانية تعرفنا:
${String(business.google_review_url || '').trim()}

— ${business.name}`
}

/**
 * Finished visits to ask about: one per number (the latest visit), leaving out
 * numbers this clinic already asked and visits already asked about.
 */
export function pickReviewCandidates(visits, askedPhones = []) {
  const asked = new Set(askedPhones.map(phoneDigits))
  const seen = new Set()
  const sorted = [...visits].sort((a, b) =>
    `${b.appointment_date} ${b.appointment_time}`.localeCompare(`${a.appointment_date} ${a.appointment_time}`))
  const out = []
  for (const v of sorted) {
    const key = phoneDigits(v.client_phone)
    if (!key || v.review_requested_at || asked.has(key) || seen.has(key)) continue
    seen.add(key)
    out.push(v)
  }
  return out
}
