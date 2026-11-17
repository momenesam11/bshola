// Booking by turn (migration 057). A queue clinic's patients pick a day and
// one of its working periods, and the database gives them the next number.

import { branchHasScheduleBlocks, formatTime12, getDayKey, getDayPeriods } from '../utils/dateHelpers'
import { periodStartOf } from './queue'

/** "من 4:00 م لـ 10:00 م", for a period { start: 'HH:MM', end: 'HH:MM' }. */
export function periodLabel(period) {
  return `من ${formatTime12(period.start)} لـ ${formatTime12(period.end)}`
}

/** The name a period gets when the clinic didn't write one, by when it starts. */
export function defaultPeriodName(start) {
  const h = Number(String(start).slice(0, 2))
  if (h < 12) return 'الفترة الصباحية'
  if (h < 15) return 'فترة الضهر'
  if (h < 16) return 'فترة العصر'
  return 'الفترة المسائية'
}

/** The clinic's own name for the period (set with its hours), else the default. */
export function periodName(period) {
  return String(period?.name || '').trim() || defaultPeriodName(period?.start)
}

/** Whether a period of `dateStr` has already ended at `now` (local time). */
export function periodOver(dateStr, period, now = new Date()) {
  const end = new Date(`${dateStr}T${String(period.end).slice(0, 5)}:00`)
  return end.getTime() <= now.getTime()
}

/**
 * The booking page's view of one period: its stats from public_queue_periods
 * (if anyone booked yet) and whether a visitor can still take a number.
 */
export function periodStatus(period, stats, limit, { dateStr, now = new Date() } = {}) {
  const taken = stats?.taken || 0
  const full = limit != null && taken >= limit
  return {
    taken,
    nextNumber: stats?.next_number || 1,
    // Only once the session started: before that nobody is inside.
    currentNumber: stats?.started ? stats.current_number : null,
    started: !!stats?.started,
    full,
    over: dateStr ? periodOver(dateStr, period, now) : false,
  }
}

/**
 * A day's working periods, [{ start, end }]: the branch's schedule blocks if it
 * has any, else the clinic's working hours. Same rule as the booking page.
 */
export function periodsOfDay(branch, business, dateStr) {
  const key = getDayKey(dateStr)
  if (branchHasScheduleBlocks(branch?.schedule_blocks)) {
    return (branch.schedule_blocks?.[key] || []).map(b => ({ start: String(b.start).slice(0, 5), end: String(b.end).slice(0, 5), ...(b.name && { name: b.name }) }))
  }
  const hours = business?.working_hours?.[key]
  return hours?.active ? getDayPeriods(hours).map(p => ({ start: String(p.open).slice(0, 5), end: String(p.close).slice(0, 5), ...(p.name && { name: p.name }) })) : []
}

/**
 * The periods the clinic can book into on a date (057): all of the day's,
 * with those already over marked when the date is today. keep (an edited
 * booking's own period) stays pickable even if over, so editing an old
 * booking never forces it to move. today is the clinic's 'YYYY-MM-DD'.
 */
export function bookablePeriods(branch, business, date, { keep = null, today, now = new Date() } = {}) {
  return periodsOfDay(branch, business, date).map(p => ({
    ...p,
    over: date === today && periodOver(date, p, now) && p.start !== keep,
  }))
}

// Where a booking stands today, for the dashboard's turns view (058 columns).
export function turnStatus(a) {
  if (a.status === 'completed') return { key: 'done', label: 'خلص' }
  if (a.status === 'no_show') return { key: 'no_show', label: 'ما جاش' }
  if (a.status === 'cancelled') return { key: 'cancelled', label: 'اتلغى' }
  if (a.status === 'waitlist') return { key: 'waitlist', label: 'انتظار' }
  if (a.called_at) return { key: 'inside', label: 'جوه' }
  if (a.arrived_at) return { key: 'arrived', label: 'وصل' }
  return { key: 'booked', label: 'حاجز' }
}

/**
 * A day's bookings under their periods, by number. A booking whose time falls
 * in no period (the clinic moved its hours later) gets a period of its own, so
 * nobody disappears. Waitlist and cancelled bookings are kept apart.
 */
export function groupByPeriod(appointments, periods) {
  const groups = periods.map(p => ({ period: p, items: [] }))
  const waitlist = []
  let cancelled = 0
  for (const a of appointments || []) {
    if (a.status === 'waitlist') { waitlist.push(a); continue }
    if (a.status === 'cancelled') { cancelled++; continue }
    // The working hours' periods only; a booking off them shows under the
    // nearest one. A day off with bookings lists each booked time.
    const start = periodStartOf(a, periods)
    let g = groups.find(x => x.period.start === start)
    if (!g) { g = { period: { start, end: start }, items: [], extra: true }; groups.push(g) }
    g.items.push(a)
  }
  const byNumber = (x, y) => (x.queue_number ?? 1e9) - (y.queue_number ?? 1e9) || String(x.created_at || '').localeCompare(String(y.created_at || ''))
  for (const g of groups) {
    g.items.sort(byNumber)
    g.taken = g.items.filter(a => ['confirmed', 'completed', 'no_show'].includes(a.status)).length
  }
  groups.sort((x, y) => x.period.start.localeCompare(y.period.start))
  return { groups, waitlist: waitlist.sort(byNumber), cancelled }
}

/**
 * The period a walk-in joins at `now` ('HH:MM'): the one running, else the
 * next today, else the day's last. Its start is the booking's time, so the
 * database gives the next number of that period. null on a day off.
 */
export function walkInPeriodStart(periods, now) {
  if (!periods?.length) return null
  const sorted = [...periods].sort((a, b) => a.start.localeCompare(b.start))
  const running = sorted.find(p => now >= p.start && now < p.end)
  if (running) return running.start
  const next = sorted.find(p => p.start > now)
  return (next || sorted[sorted.length - 1]).start
}
