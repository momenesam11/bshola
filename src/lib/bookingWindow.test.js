import { describe, it, expect } from 'vitest'
import { bookableDates, DEFAULT_OPEN_DAYS } from './bookingWindow'

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const start = new Date(2026, 10, 14) // Saturday 14 Nov 2026
const notFriday = (d) => d.getDay() !== 5

describe('booking window', () => {
  it('without a window offers the first 30 open days, as before', () => {
    const dates = bookableDates(start, notFriday, iso)
    expect(dates).toHaveLength(DEFAULT_OPEN_DAYS)
    expect(dates[0]).toBe('2026-11-14')
    expect(dates).not.toContain('2026-11-20') // a Friday
  })

  it('stops at the last bookable date, inclusive, skipping closed days', () => {
    expect(bookableDates(start, notFriday, iso, '2026-11-15')).toEqual(['2026-11-14', '2026-11-15'])
    expect(bookableDates(start, notFriday, iso, '2026-11-21')).toEqual(
      ['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-21'])
  })

  it('a long window goes past 30 open days', () => {
    expect(bookableDates(start, () => true, iso, '2027-01-13')).toHaveLength(61)
  })

  it('a window where every day is closed offers nothing', () => {
    expect(bookableDates(start, () => false, iso, '2026-11-15')).toEqual([])
  })
})
