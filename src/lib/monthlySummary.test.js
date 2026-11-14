import { describe, it, expect } from 'vitest'
import { attendanceRate, buildSummaryMessage, daysLabel, summaryLines } from './monthlySummary'

const DAY = 86400000
const NOW = Date.UTC(2026, 10, 13, 12)
const busy = {
  appointments: 120, completed: 90, no_shows: 10, cancelled: 20, online_bookings: 45,
  reminders_sent: 80, patients: 70, new_patients: 30, review_requests: 12,
}

describe('monthly summary', () => {
  it('attendance counts only visits with a known outcome', () => {
    expect(attendanceRate(busy)).toBe(90)
    expect(attendanceRate({ completed: 0, no_shows: 0 })).toBeNull()
  })

  it('lists every number that has something to say, and drops zeros', () => {
    expect(summaryLines(busy)).toEqual([
      '120 موعد، منهم 45 حجزوا بنفسهم من لينك الحجز',
      '90 حضروا و10 ما جوش، يعني نسبة الحضور 90%',
      '80 تذكير اتبعت على واتساب',
      '30 مريض جديد',
      '12 طلب تقييم على جوجل',
    ])
    expect(summaryLines({ ...busy, online_bookings: 0, reminders_sent: 0, new_patients: 0, review_requests: 0, completed: 0, no_shows: 0 }))
      .toEqual(['120 موعد'])
    expect(summaryLines({ appointments: 0 })).toEqual([])
  })

  it('a quiet clinic gets an offer to help instead of a list of zeros', () => {
    const text = buildSummaryMessage({ trial_ends_at: null }, { appointments: 0 }, NOW)
    expect(text).toContain('مفيش مواعيد اتسجلت')
    expect(text).not.toContain('- ')
  })

  it('mentions renewal only when the period ends within a week', () => {
    const paid = (days) => ({ subscription_type: 'paid', trial_ends_at: new Date(NOW + days * DAY).toISOString() })
    expect(buildSummaryMessage(paid(3), busy, NOW)).toContain('اشتراكك بتخلص بعد 3 أيام. تحب أجددهولك؟')
    expect(buildSummaryMessage(paid(0), busy, NOW)).toContain('بتخلص النهارده')
    expect(buildSummaryMessage(paid(20), busy, NOW)).not.toContain('بتخلص')
    expect(buildSummaryMessage(paid(-2), busy, NOW)).not.toContain('بتخلص')
    const trial = { subscription_type: 'trial', trial_ends_at: new Date(NOW + 2 * DAY).toISOString() }
    expect(buildSummaryMessage(trial, busy, NOW)).toContain('تجربتك المجانية بتخلص بعد يومين. تحب تكمل معانا؟')
  })

  it('counts days the Arabic way', () => {
    expect([1, 2, 3, 10, 11].map(daysLabel)).toEqual(['يوم', 'يومين', '3 أيام', '10 أيام', '11 يوم'])
  })
})
