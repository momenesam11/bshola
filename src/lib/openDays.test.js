import { describe, it, expect } from 'vitest'
import { describeOpenDays, describeYears } from './openDays'

describe('describeOpenDays', () => {
  it('handles the common clinic weeks', () => {
    expect(describeOpenDays([])).toBe(null)
    expect(describeOpenDays(['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'])).toBe('مفتوح طول أيام الأسبوع')
    expect(describeOpenDays(['sat', 'sun', 'mon', 'tue', 'wed', 'thu'])).toBe('مفتوح يوميًا ما عدا الجمعة')
    expect(describeOpenDays(['sat', 'sun', 'tue', 'wed', 'thu', 'fri'])).toBe('مفتوح يوميًا ما عدا الاثنين')
    expect(describeOpenDays(['sat', 'sun', 'mon', 'tue', 'wed'])).toBe('مفتوح من السبت إلى الأربعاء')
    expect(describeOpenDays(['sun', 'mon', 'tue', 'wed', 'thu'])).toBe('مفتوح من الأحد إلى الخميس')
    expect(describeOpenDays(['sat', 'sun', 'tue', 'wed', 'thu'])).toBe('مفتوح يوميًا ما عدا الاثنين والجمعة')
  })

  it('wraps around the end of the week', () => {
    expect(describeOpenDays(['fri', 'sat', 'sun'])).toBe('مفتوح من الجمعة إلى الأحد')
  })

  it('lists scattered days', () => {
    expect(describeOpenDays(['sat', 'mon', 'wed'])).toBe('مفتوح السبت والاثنين والأربعاء')
    expect(describeOpenDays(['sun'])).toBe('مفتوح الأحد')
    expect(describeOpenDays(['sat', 'sun', 'mon', 'wed'])).toBe('مفتوح من السبت إلى الاثنين والأربعاء')
  })
})

describe('describeYears', () => {
  it('agrees with the number', () => {
    expect(describeYears(0)).toBe(null)
    expect(describeYears(null)).toBe(null)
    expect(describeYears(1)).toBe('خبرة سنة')
    expect(describeYears(2)).toBe('خبرة سنتين')
    expect(describeYears(5)).toBe('خبرة 5 سنوات')
    expect(describeYears(26)).toBe('خبرة 26 سنة')
  })
})
