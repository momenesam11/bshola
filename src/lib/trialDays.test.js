import { describe, it, expect, vi } from 'vitest'
import { trialLabel, parseTrialDays, trialShareText, visitorTrialCopy, TRIAL_CHOICES } from './trialDays'
import { captureRefFromUrl, getStoredRef, clearStoredRef, currentRef } from './refCapture'

describe('public pages for a partner visitor', () => {
  it('keeps the usual wording when the trial is the usual one', () => {
    expect(visitorTrialCopy(null)).toBeNull()
    expect(visitorTrialCopy(14)).toBeNull()
  })

  it('says the partner trial instead of 14 days', () => {
    const c = visitorTrialCopy(2)
    expect(c.cta).toBe('ابدأ تجربة يومين مجاناً')
    expect(c.fact.label).toBe('يومين تجربة')
    expect(JSON.stringify(c)).not.toContain('14')
  })

  it('promises no free trial when the link has none', () => {
    const c = visitorTrialCopy(0)
    expect(c.cta).toBe('ابدأ حسابك دلوقتي')
    expect(JSON.stringify(c)).not.toMatch(/مجان|ببلاش|تجربة/)
  })

  it('reads the code from the address bar before the remembered one', () => {
    expect(currentRef('?ref=P-ABC123')).toBe('P-ABC123')
    expect(currentRef('?ref=<script>')).toBeNull()
  })
})

describe('partner trial days', () => {
  it('says the trial in plain Arabic', () => {
    expect(trialLabel(null)).toBe('14 يوم')
    expect(trialLabel(0)).toBe('من غير تجربة')
    expect(trialLabel(1)).toBe('يوم واحد')
    expect(trialLabel(2)).toBe('يومين')
    expect(trialLabel(7)).toBe('7 أيام')
    expect(trialLabel(14)).toBe('14 يوم')
  })

  it('accepts empty (the usual trial) or a whole number from 0 to 14', () => {
    expect(parseTrialDays('')).toEqual({ ok: true, days: null })
    expect(parseTrialDays('0')).toEqual({ ok: true, days: 0 })
    expect(parseTrialDays('14')).toEqual({ ok: true, days: 14 })
    expect(parseTrialDays('15').ok).toBe(false)
    expect(parseTrialDays('2.5').ok).toBe(false)
    expect(parseTrialDays('-1').ok).toBe(false)
    expect(TRIAL_CHOICES.every((d) => parseTrialDays(String(d)).ok)).toBe(true)
  })

  it('never promises a free trial on a no-trial link', () => {
    expect(trialShareText(0, 'L')).not.toMatch(/ببلاش|تجربة/)
    expect(trialShareText(2, 'L')).toContain('يومين ببلاش')
  })

  it("remembers a partner's client link like any other ref", () => {
    const store = new Map()
    vi.stubGlobal('localStorage', { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) })
    captureRefFromUrl('?ref=T-AB12CD34')
    expect(getStoredRef()).toBe('T-AB12CD34')
    clearStoredRef()
    vi.unstubAllGlobals()
  })
})
