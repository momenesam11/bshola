// How far ahead patients may book online (migration 055). No window keeps the
// booking page's default of the next 30 open days.

export const DEFAULT_OPEN_DAYS = 30

export const BOOKING_WINDOW_OPTIONS = [
  { value: '', label: 'من غير حد (أول 30 يوم شغل)' },
  { value: '1', label: 'النهارده وبكرا بس' },
  { value: '3', label: '3 أيام قدام' },
  { value: '7', label: 'أسبوع قدام' },
  { value: '14', label: 'أسبوعين قدام' },
  { value: '30', label: 'شهر قدام' },
  { value: '60', label: 'شهرين قدام' },
]

/**
 * Open days from `start` (a Date) on: up to `lastDate` ('YYYY-MM-DD', inclusive)
 * when the clinic set a window, otherwise the first DEFAULT_OPEN_DAYS open days.
 * `isOpen(date)` says whether the clinic works that day; `toISO` formats a Date.
 */
export function bookableDates(start, isOpen, toISO, lastDate = null) {
  const dates = []
  const d = new Date(start)
  for (let guard = 0; guard < 366; guard++) {
    const iso = toISO(d)
    if (lastDate && iso > lastDate) break
    if (!lastDate && dates.length >= DEFAULT_OPEN_DAYS) break
    if (isOpen(d)) dates.push(iso)
    d.setDate(d.getDate() + 1)
  }
  return dates
}
