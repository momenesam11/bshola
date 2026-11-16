// Booking by turn (migration 057). A queue clinic's patients pick a day and
// one of its working periods, and the database gives them the next number.

import { branchHasScheduleBlocks, formatTime12, getDayKey, getDayPeriods } from '../utils/dateHelpers'

/** "من 4:00 م لـ 10:00 م", for a period { start: 'HH:MM', end: 'HH:MM' }. */
export function periodLabel(period) {
  return `من ${formatTime12(period.start)} لـ ${formatTime12(period.end)}`
}

/** "الفترة الصباحية" before 12:00, "المسائية" from 16:00, "فترة الضهر" between. */
export function periodName(period) {
  const h = Number(String(period.start).slice(0, 2))
  if (h < 12) return 'الفترة الصباحية'
  if (h >= 16) return 'الفترة المسائية'
  return 'فترة الضهر'
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
    return (branch.schedule_blocks?.[key] || []).map(b => ({ start: String(b.start).slice(0, 5), end: String(b.end).slice(0, 5) }))
  }
  const hours = business?.working_hours?.[key]
  return hours?.active ? getDayPeriods(hours).map(p => ({ start: String(p.open).slice(0, 5), end: String(p.close).slice(0, 5) })) : []
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
    const t = String(a.appointment_time).slice(0, 5)
    // Numbers run per start time, so only a booking at the period's start is in it.
    let g = groups.find(x => !x.extra && x.period.start === t)
    if (!g) {
      g = groups.find(x => x.period.start === t && x.extra)
      if (!g) { g = { period: { start: t, end: t }, items: [], extra: true }; groups.push(g) }
    }
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
