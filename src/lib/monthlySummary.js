// The "last 30 days" summary the Beshola team sends a doctor from /admin
// (migration 052). Lines with nothing to show are left out, so a quiet clinic
// gets a short honest message rather than a list of zeros.

// The renewal line shows when the paid or trial period ends within this many days.
export const RENEWAL_NOTICE_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

/** Arabic day counts: يوم، يومين، 3 أيام … 10 أيام، 11 يوم. */
export function daysLabel(n) {
  if (n === 1) return 'يوم'
  if (n === 2) return 'يومين'
  return `${n} ${n >= 3 && n <= 10 ? 'أيام' : 'يوم'}`
}

/** Attended out of those whose outcome is known (completed or no-show). */
export function attendanceRate(s) {
  const decided = (s?.completed || 0) + (s?.no_shows || 0)
  return decided ? Math.round((s.completed / decided) * 100) : null
}

export function summaryLines(s) {
  if (!s || !s.appointments) return []
  const lines = []
  const online = s.online_bookings ? `، منهم ${s.online_bookings} حجزوا بنفسهم من لينك الحجز` : ''
  lines.push(`${s.appointments} موعد${online}`)
  const rate = attendanceRate(s)
  if (rate !== null) lines.push(`${s.completed} حضروا و${s.no_shows} ما جوش، يعني نسبة الحضور ${rate}%`)
  if (s.reminders_sent) lines.push(`${s.reminders_sent} تذكير اتبعت على واتساب`)
  if (s.new_patients) lines.push(`${s.new_patients} مريض جديد`)
  return lines
}

/** Days left on the account's current period, or null when there's no end date. */
export function daysToRenewal(business, now = Date.now()) {
  if (!business?.trial_ends_at) return null
  return Math.ceil((new Date(business.trial_ends_at).getTime() - now) / DAY_MS)
}

export function buildSummaryMessage(business, s, now = Date.now()) {
  const lines = summaryLines(s)
  const body = lines.length
    ? `ده ملخص عيادتك على بسهولة في آخر 30 يوم:\n${lines.map(l => `- ${l}`).join('\n')}`
    : 'لاحظت إن مفيش مواعيد اتسجلت على حسابك في آخر 30 يوم. لو في حاجة واقفة معاك أو محتاج مساعدة في الإعداد، قولّي وأنا أظبطهالك.'
  const left = daysToRenewal(business, now)
  const renewal = left !== null && left >= 0 && left <= RENEWAL_NOTICE_DAYS
    ? `\n\n${business.subscription_type === 'paid' ? 'اشتراكك' : 'تجربتك المجانية'} بتخلص ${left === 0 ? 'النهارده' : `بعد ${daysLabel(left)}`}. ${business.subscription_type === 'paid' ? 'تحب أجددهولك؟' : 'تحب تكمل معانا؟'}`
    : ''
  return `أهلاً يا دكتور، معاك مؤمن مؤسس بسهولة.\n\n${body}${renewal}`
}
