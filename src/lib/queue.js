// "How many are ahead of you" for walk-in style clinics (migration 053). The
// order is the booking time, then the queue number for clinics that book by
// turn (057): the patient booked at 10:00 goes in before the one at 10:30,
// whoever arrives first. The front desk (058) can call a patient in, who then
// heads the line, and send a late one back a few places (queue_sort). The
// database orders the line the same way (queue_key in 058). Messages go out
// by hand from the clinic's own WhatsApp.

export const DEFAULT_NOTIFY_AHEAD = 3
export const MAX_NOTIFY_AHEAD = 10

/** A visit's place in the day's line: queue_key() in migration 058. */
export function queueKey(a) {
  if (a.queue_sort != null) return Number(a.queue_sort)
  const [h = 0, m = 0, sec = 0] = String(a.appointment_time || '00:00').split(':').map(Number)
  return h * 3600 + m * 60 + sec + (a.queue_number ?? 0) / 1000
}

/** Today's patients still waiting: whoever is inside first, then in line order. */
export function waitingQueue(appointments, branchId = null) {
  return (appointments || [])
    .filter(a => a.status === 'confirmed')
    .filter(a => !branchId || !a.branch_id || a.branch_id === branchId)
    .sort((a, b) => (b.called_at ? 1 : 0) - (a.called_at ? 1 : 0)
      || queueKey(a) - queueKey(b)
      || String(a.created_at || '').localeCompare(String(b.created_at || '')))
}

/**
 * About how many minutes one visit takes: consult_minutes() from the database
 * when it came back, else the services' average, else the slot length.
 */
export function visitMinutes(fromDb, services = [], business = null) {
  if (Number.isFinite(fromDb) && fromDb > 0) return fromDb
  const durations = services.map(s => Number(s.duration_minutes)).filter(d => d > 0)
  if (durations.length) return Math.round(durations.reduce((x, y) => x + y, 0) / durations.length)
  return Number(business?.slot_duration) || 15
}

/** "≈ 25 د" style wait, or "≈ ساعة و10 د" past an hour. */
export function formatWait(minutes) {
  if (minutes == null) return ''
  if (minutes < 1) return 'دلوقتي'
  if (minutes < 60) return `≈ ${minutes} د`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const hours = h === 1 ? 'ساعة' : h === 2 ? 'ساعتين' : `${h} ساعات`
  return m ? `≈ ${hours} و${m} د` : `≈ ${hours}`
}

/** The clinic's "tell them when N are ahead" setting, kept within 1..10. */
export function notifyAheadOf(business) {
  const n = Number(business?.queue_notify_ahead)
  return Number.isInteger(n) && n >= 1 && n <= MAX_NOTIFY_AHEAD ? n : DEFAULT_NOTIFY_AHEAD
}

/**
 * The patient to message now: the one with exactly N ahead, if they haven't
 * been told yet. With fewer than N+1 waiting, nobody is due.
 */
export function dueForNotice(queue, ahead) {
  const p = queue[ahead]
  return p && !p.queue_notified_at ? p : null
}

function aheadText(ahead) {
  if (ahead === 1) return 'باقي قدامك مريض واحد'
  if (ahead === 2) return 'باقي قدامك اتنين'
  return `باقي قدامك ${ahead} ${ahead <= 10 ? 'مرضى' : 'مريض'}`
}

// `minutes` (the front desk, 058) adds about how long is left.
export function queueMessage(appointment, ahead, business, branch, { minutes = null } = {}) {
  const where = branch?.name && branch.name !== business.name ? `${business.name} (${branch.name})` : business.name
  const number = appointment.queue_number != null ? `رقمك ${appointment.queue_number}. ` : ''
  const wait = ahead > 0 && minutes > 0 ? `\nالوقت المتوقع حوالي ${minutes} دقيقة.` : ''
  const line = ahead === 0
    ? `دورك دلوقتي في ${where}، اتفضل.`
    : `${number}${aheadText(ahead)} في ${where}.${wait}\nتقدر تتحرك دلوقتي عشان توصل على دورك.`
  return `أهلاً يا ${appointment.client_name}

${line}
لو محتاج حاجة ردّ على الرسالة دي.

— ${business.name}`
}

// Booking by turn: the periods are the working hours' periods and nothing
// else (a booking never opens a period of its own). A booking belongs to the
// period its time falls in; one on a time outside every period (the hours
// changed after it was booked) shows under the nearest period, and the desk
// offers to move it there properly (queue_realign, 061).
const minutes = (t) => { const [h = 0, m = 0] = String(t).split(':').map(Number); return h * 60 + m }
// The whole-day group on a day with no period.
export const DAY = 'day'
export function periodStartOf(appt, periods = []) {
  const t = String(appt.appointment_time || '').slice(0, 5)
  // A day with no period on the hours (a day off, or bookings from before the
  // clinic booked by turn): one group for the whole day, never one per time.
  if (!periods.length) return DAY
  const inside = periods.find(p => t >= p.start && t < p.end)
  if (inside) return inside.start
  return [...periods].sort((a, b) => Math.abs(minutes(a.start) - minutes(t)) - Math.abs(minutes(b.start) - minutes(t)))[0].start
}

/**
 * The front desk's line for one period of a queue clinic: whoever is inside
 * (from any period: the doctor is with them now), then that period's waiting
 * patients in line order. dayLine is waitingQueue() of the whole day.
 */
export function periodLine(dayLine, periods, start) {
  const inside = dayLine.find(a => a.called_at) || null
  const waiting = dayLine.filter(a => !a.called_at && periodStartOf(a, periods) === start)
    // By number inside the period (queue_period_key in 062): a booking left on an
    // old start time still lines up by its number. A place set by "رجّعه" wins.
    .map(a => ({ a, k: a.queue_sort != null ? Number(a.queue_sort) : queueKey(periods.length ? { ...a, appointment_time: periodStartOf(a, periods) } : a) }))
    .sort((x, y) => x.k - y.k || String(x.a.created_at || '').localeCompare(String(y.a.created_at || '')))
    .map(x => x.a)
  return inside ? [inside, ...waiting] : waiting
}

/**
 * The day's periods with how many wait in each. Only the working hours'
 * periods; on a day with none (a day off with bookings), one whole-day group.
 */
export function periodChoices(dayLine, periods = []) {
  const counts = {}
  for (const a of dayLine) {
    if (a.called_at) continue
    const k = periodStartOf(a, periods)
    counts[k] = (counts[k] || 0) + 1
  }
  const starts = periods.length ? periods.map(p => p.start) : Object.keys(counts)
  return [...new Set(starts)].sort().map(start => ({
    start,
    period: periods.find(p => p.start === start) || null,
    waiting: counts[start] || 0,
  }))
}

/**
 * After the clinic moved bookings into their period (061): the patient's new
 * number, the day and when the period starts. Sent by hand like every message.
 */
export function renumberMessage(row, business, { date, time }) {
  return `أهلاً يا ${row.client_name}

مواعيد الفترة في ${business.name} اتظبطت، ورقمك في الدور بقى ${row.new_number}.
يوم ${date}، والفترة بتبدأ ${time}.

لو محتاج حاجة ردّ على الرسالة دي.
— ${business.name}`
}
