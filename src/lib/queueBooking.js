// Booking by turn (migration 057). A queue clinic's patients pick a day and
// one of its working periods, and the database gives them the next number.

import { formatTime12 } from '../utils/dateHelpers'

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
