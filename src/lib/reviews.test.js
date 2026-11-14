import { describe, it, expect } from 'vitest'
import { isReviewUrl, generateReviewRequestMessage, pickReviewCandidates } from './reviews'

describe('google review requests', () => {
  it('accepts only an https link of sane length', () => {
    expect(isReviewUrl('https://g.page/r/abc/review')).toBe(true)
    expect(isReviewUrl('  https://g.page/r/abc  ')).toBe(true)
    expect(isReviewUrl('http://g.page/r/abc')).toBe(false)
    expect(isReviewUrl('g.page/r/abc')).toBe(false)
    expect(isReviewUrl('https://g.page/r/a b')).toBe(false)
    expect(isReviewUrl(`https://x.com/${'a'.repeat(500)}`)).toBe(false)
    expect(isReviewUrl('')).toBe(false)
  })

  it('the message names the patient and the clinic and carries the link', () => {
    const text = generateReviewRequestMessage({ client_name: 'منى' }, { name: 'عيادة النور', google_review_url: ' https://g.page/r/x ' })
    expect(text).toContain('أهلاً يا منى')
    expect(text).toContain('عيادة النور')
    expect(text).toContain('\nhttps://g.page/r/x\n')
  })

  it('asks each number once: latest visit only, never a number already asked', () => {
    const v = (id, phone, date, time = '10:00', extra = {}) => ({ id, client_phone: phone, appointment_date: date, appointment_time: time, ...extra })
    const picked = pickReviewCandidates([
      v('old', '201000000001', '2026-11-10'),
      v('new', '201000000001', '2026-11-12'),
      v('asked-before', '201000000002', '2026-11-12'),
      v('this-visit-asked', '201000000003', '2026-11-12', '10:00', { review_requested_at: '2026-11-12T12:00:00Z' }),
      v('morning', '201000000004', '2026-11-12', '09:00'),
      v('evening', '201000000005', '2026-11-12', '20:00'),
    ], ['201000000002'])
    expect(picked.map(x => x.id)).toEqual(['evening', 'new', 'morning'])
  })
})
