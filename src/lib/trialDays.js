// A partner can give the clinics they bring a shorter trial than the usual
// 14 days, from their own link or from a link they make for one client
// (migration 067). null always means the usual trial.

export const DEFAULT_TRIAL_DAYS = 14

/** Choices the partner picks from when making a client link. */
export const TRIAL_CHOICES = [0, 1, 2, 3, 5, 7, 10, 14]

/** "يومين", "3 أيام", "14 يوم". 0 = no trial. */
export function trialLabel(days) {
  const d = days ?? DEFAULT_TRIAL_DAYS
  if (d === 0) return 'من غير تجربة'
  if (d === 1) return 'يوم واحد'
  if (d === 2) return 'يومين'
  if (d <= 10) return `${d} أيام`
  return `${d} يوم`
}

/** Valid trial_days for the database: null (usual) or a whole number 0–14. */
export function parseTrialDays(value) {
  if (value === '' || value == null) return { ok: true, days: null }
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0 || n > DEFAULT_TRIAL_DAYS) return { ok: false }
  return { ok: true, days: n }
}

/** The line a partner sends a doctor with a link that gives this trial. */
export function trialShareText(days, link) {
  const intro = 'أهلاً دكتور ده «بسهولة»، نظام حجز مواعيد مصري: المرضى بيحجزوا من لينك، والتذكير بالمواعيد بيتبعت على الواتساب بضغطة زر.'
  if (days === 0) return `${intro} سجّل حسابك من هنا، وهنفعّله أول ما الاشتراك يتم: ${link}`
  return `${intro} جرّبه ${trialLabel(days)} ببلاش من هنا: ${link}`
}
