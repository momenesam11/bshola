import {
  format, parse, addMinutes, isBefore,
  isAfter, parseISO, getDay, addDays,
} from 'date-fns'
import { ar } from 'date-fns/locale'

export const DAYS_JS_TO_KEY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

export function formatDateAr(date, fmt = 'EEEE d MMMM yyyy') {
  return format(typeof date === 'string' ? parseISO(date) : date, fmt, { locale: ar })
}

export function formatTime12(time) {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  const suffix = h < 12 ? 'ص' : 'م'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

export function getDayKey(date) {
  return DAYS_JS_TO_KEY[getDay(typeof date === 'string' ? parseISO(date) : date)]
}

export function generateTimeSlots(openTime, closeTime, slotDuration) {
  const base = new Date(2000, 0, 1)
  const start = parse(openTime, 'HH:mm', base)
  const end = parse(closeTime, 'HH:mm', base)
  const slots = []
  let current = start
  while (isBefore(current, end)) {
    const next = addMinutes(current, slotDuration)
    if (!isAfter(next, end)) {
      slots.push(format(current, 'HH:mm'))
    }
    current = next
  }
  return slots
}

// Normalise a day config to always return a periods array
// Supports both old {open, close} format and new {periods: [{open, close}]} format
export function getDayPeriods(dayConfig) {
  if (!dayConfig) return []
  if (dayConfig.periods?.length) return dayConfig.periods
  if (dayConfig.open && dayConfig.close) return [{ open: dayConfig.open, close: dayConfig.close }]
  return []
}

// Get all available slots for a day, supporting single or dual periods
export function getSlotsForDay(dayConfig, slotDuration, bookedTimes = []) {
  if (!dayConfig?.active) return []
  const periods = getDayPeriods(dayConfig)
  const allSlots = periods.flatMap(p => generateTimeSlots(p.open, p.close, slotDuration))
  return allSlots.filter(t => !bookedTimes.includes(t))
}

// Same as getSlotsForDay, but returns every slot annotated with availability
// instead of dropping booked ones — used by the legacy working_hours fallback
// path (branches without schedule_blocks yet).
export function getSlotsWithAvailabilityForDay(dayConfig, slotDuration, bookedCounts = {}, capacity = 1, dateStr = null) {
  if (!dayConfig?.active) return []
  const periods = getDayPeriods(dayConfig)
  const allSlots = periods.flatMap(p => generateTimeSlots(p.open, p.close, slotDuration))
  return allSlots.map(time => {
    const bookedCount = bookedCounts[time] || 0
    const isPast = dateStr ? isSlotInPast(dateStr, time) : false
    return { time, bookedCount, capacity, isPast, isAvailable: bookedCount < capacity && !isPast }
  })
}

// Legacy compat — used in BookingPage
export function getAvailableSlots(openTime, closeTime, slotDuration, bookedTimes) {
  const all = generateTimeSlots(openTime, closeTime, slotDuration)
  return all.filter(t => !bookedTimes.includes(t))
}

// Flexible per-branch schedule blocks: [{start, end}, ...] for a given day.
// bookedCounts is a map of time -> number of active bookings at that time;
// a slot is available while its count is below the branch's capacity.
export function getSlotsForBlocks(blocks = [], slotDuration, bookedCounts = {}, capacity = 1) {
  const allSlots = (blocks || []).flatMap(b => generateTimeSlots(b.start, b.end, slotDuration))
  return allSlots.filter(t => (bookedCounts[t] || 0) < capacity)
}

// Same as above, but returns every slot (not just available ones) annotated
// with availability — booked/full slots must stay visible (shown disabled),
// never silently dropped from the list.
export function getSlotsWithAvailability(blocks = [], slotDuration, bookedCounts = {}, capacity = 1, dateStr = null) {
  const allSlots = (blocks || []).flatMap(b => generateTimeSlots(b.start, b.end, slotDuration))
  return allSlots.map(time => {
    const bookedCount = bookedCounts[time] || 0
    const isPast = dateStr ? isSlotInPast(dateStr, time) : false
    return { time, bookedCount, capacity, isPast, isAvailable: bookedCount < capacity && !isPast }
  })
}

export function isSlotInPast(dateStr, timeStr) {
  if (!dateStr || !timeStr) return false
  const slot = new Date(`${dateStr}T${timeStr}:00`)
  return slot.getTime() < Date.now()
}

// True if a branch has any schedule_blocks defined at all (vs. an empty {} from
// before flexible scheduling existed — used to decide whether to fall back to
// the legacy business.working_hours field).
export function branchHasScheduleBlocks(scheduleBlocks) {
  return !!scheduleBlocks && Object.values(scheduleBlocks).some(blocks => Array.isArray(blocks) && blocks.length > 0)
}

export function toISODateString(date) {
  return format(date, 'yyyy-MM-dd')
}

export function todayISO() {
  return toISODateString(new Date())
}

// Normalise working_hours object from DB to always use periods format
export function normalizeWorkingHours(wh) {
  if (!wh) return {}
  const out = {}
  for (const [day, cfg] of Object.entries(wh)) {
    out[day] = {
      active: !!cfg.active,
      periods: getDayPeriods(cfg).length
        ? getDayPeriods(cfg)
        : [{ open: '09:00', close: '18:00' }],
    }
  }
  return out
}
