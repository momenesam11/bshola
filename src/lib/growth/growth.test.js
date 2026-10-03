import { describe, it, expect } from 'vitest'
import { normalizePhone, isMobile, displayPhone, whatsappLink } from './phone'
import { detectReviewSignals, inferPlaceSignals } from './reviewSignals'
import { scoreLead, buildQueue, scoreContactability, scorePain } from './scoring'
import { chooseAngle } from './angles'
import { openingMessage, followUpMessage, CALL_SCRIPT } from './messages'
import { parseLeadsCsv, parseCsvRows, csvTemplate, categoryFromText, leadsToCsv } from './csv'
import { funnel, conversionBy, partnerCommissions, referralRewards } from './analytics'
import { findDuplicate } from './dedupe'
import { defaultPreview, initialsFor } from './preview'
import { registerLink, previewLink, bestLinkFor } from './links'

const lead = (over = {}) => ({
  id: 'l1',
  name: 'عيادة د. سارة للأسنان',
  category: 'dental',
  source: 'google_maps_manual',
  stage: 'new',
  phone: '201012345678',
  signals: [],
  ref_code: 'L-ABCD1234',
  contact_attempts: 0,
  created_at: new Date().toISOString(),
  ...over,
})

describe('phone', () => {
  it('normalises like the SQL function', () => {
    expect(normalizePhone('01012345678')).toBe('201012345678')
    expect(normalizePhone('+20 101 234 5678')).toBe('201012345678')
    expect(normalizePhone('00201012345678')).toBe('201012345678')
    expect(normalizePhone('1012345678')).toBe('201012345678')
    expect(normalizePhone('02 2345 6789')).toBe('20223456789')
    expect(normalizePhone('12')).toBeNull()
    expect(normalizePhone(undefined)).toBeNull()
  })
  it('knows mobiles from landlines', () => {
    expect(isMobile('201512345678')).toBe(true)
    expect(isMobile('20223456789')).toBe(false)
  })
  it('formats and links', () => {
    expect(displayPhone('201012345678')).toBe('0101 234 5678')
    expect(whatsappLink('201012345678', 'أهلاً')).toBe('https://wa.me/201012345678?text=%D8%A3%D9%87%D9%84%D8%A7%D9%8B')
    expect(whatsappLink(null)).toBeNull()
  })
})

describe('review signals', () => {
  it('quotes the review behind each pain point, once per type', () => {
    const signals = detectReviewSignals(
      [
        { text: 'الدكتور ممتاز بس محدش بيرد على التليفون خالص', rating: 3 },
        { text: 'استنيت ساعتين في العيادة رغم إن عندي ميعاد', rating: 2 },
        { text: 'nobody answers the phone', rating: 1 },
        { text: 'خدمة ممتازة', rating: 5 },
      ],
      'https://maps.google.com/x'
    )
    expect(signals.map((s) => s.type)).toEqual(['review_pain_phone', 'review_pain_wait'])
    expect(signals[0]).toMatchObject({ kind: 'fact', source_url: 'https://maps.google.com/x' })
    expect(signals[0].evidence).toContain('محدش بيرد')
    expect(signals[0].evidence).toContain('3★')
  })
  it('finds booking and organisation complaints in Arabic and English', () => {
    const types = detectReviewSignals([
      { text: 'الميعاد اتلغى من غير ما حد يبلغني' },
      { text: 'really disorganized place' },
    ]).map((s) => s.type)
    expect(types).toEqual(['review_pain_booking', 'review_pain_disorganized'])
  })
  it('does not flag happy reviews', () => {
    expect(detectReviewSignals([{ text: 'الحجز سهل جدا والتليفون بيرد على طول' }])).toEqual([])
  })
  it('infers new clinics and missing websites, labelled as inferences', () => {
    const s = inferPlaceSignals({ userRatingCount: 4 })
    expect(s.map((x) => [x.type, x.kind])).toEqual([['likely_new', 'inference'], ['no_website', 'inference']])
    expect(inferPlaceSignals({ userRatingCount: 200, websiteUri: 'https://x.com' })).toEqual([])
  })
})

describe('scoring', () => {
  it('ranks an inbound dental request above a cold listing', () => {
    const hot = scoreLead(lead({ source: 'contact_form', inbound_at: new Date().toISOString() }))
    const cold = scoreLead(lead())
    expect(hot.total).toBeGreaterThan(cold.total)
    expect(hot.parts.intent.score).toBe(100)
  })
  it('respects weights', () => {
    const l = lead({ source: 'contact_form' })
    const intentOnly = scoreLead(l, { weights: { fit: 0, intent: 1, pain: 0, activity: 0, contactability: 0 } })
    expect(intentOnly.total).toBe(intentOnly.parts.intent.score)
    expect(scoreLead(l, { weights: { fit: 0, intent: 0, pain: 0, activity: 0, contactability: 0 } }).total).toBe(0)
  })
  it('scores pain from evidence only, facts above inferences', () => {
    expect(scorePain(lead()).score).toBe(0)
    const fact = scorePain(lead({ signals: [{ type: 'review_pain_phone', kind: 'fact', evidence: 'x' }] }))
    expect(fact.score).toBe(40)
    expect(fact.reasons).toEqual(['x'])
  })
  it('penalises unreachable and over-contacted leads', () => {
    expect(scoreContactability(lead({ phone: null, email: null })).score).toBe(0)
    expect(scoreContactability(lead({ contact_attempts: 6 })).score).toBe(60)
  })
  it('builds a queue: fresh inbound, then due follow-ups, never closed or future ones', () => {
    const now = Date.now()
    const leads = [
      lead({ id: 'cold', google_reviews_count: 300 }),
      lead({ id: 'due', next_follow_up_at: new Date(now - 3600e3).toISOString(), stage: 'follow_up' }),
      lead({ id: 'inbound', source: 'contact_form', inbound_at: new Date(now).toISOString(), next_follow_up_at: new Date(now).toISOString() }),
      lead({ id: 'later', next_follow_up_at: new Date(now + 5 * 864e5).toISOString() }),
      lead({ id: 'paid', stage: 'paid' }),
      lead({ id: 'dnc', stage: 'do_not_contact' }),
      lead({ id: 'nocontact', phone: null, email: null }),
    ]
    expect(buildQueue(leads, { now }).map((q) => q.lead.id)).toEqual(['inbound', 'due', 'cold'])
  })
})

describe('sales angle', () => {
  it('picks from evidence and cites it', () => {
    const a = chooseAngle(lead({ signals: [{ type: 'review_pain_phone', kind: 'fact', evidence: 'محدش بيرد' }] }))
    expect(a).toMatchObject({ key: 'receptionist_workload', basis: 'evidence', because: 'محدش بيرد' })
  })
  it('puts onboarding help and trial closing first', () => {
    expect(chooseAngle(lead({ source: 'signup_incomplete' })).key).toBe('onboarding_help')
    expect(chooseAngle(lead({ signals: [{ type: 'trial_expiring', kind: 'fact', evidence: 'x' }, { type: 'review_pain_phone', kind: 'fact' }] })).key).toBe('trial_closing')
  })
  it('falls back to a labelled default without evidence', () => {
    expect(chooseAngle(lead())).toMatchObject({ key: 'no_shows', basis: 'default' })
    expect(chooseAngle(lead({ category: 'derma' })).key).toBe('social_to_booking')
  })
})

describe('messages', () => {
  const FORBIDDEN = [/تلقائي/, /أوتوماتيك/, /اوتوماتيك/, /%/, /موظف/]
  const angles = ['onboarding_help', 'trial_closing', 'receptionist_workload', 'scheduling', 'no_shows', 'self_booking_24_7', 'social_to_booking', 'new_clinic', 'patient_follow_up', 'referral']

  it('fills the lead name and their link, and never makes a forbidden claim', () => {
    for (const angle of angles) {
      const msg = openingMessage(lead({ preview: { enabled: true } }), angle)
      for (const re of FORBIDDEN) expect(msg, `${angle} ${re}`).not.toMatch(re)
      expect(msg).not.toContain('{link}')
      if (msg.includes('http')) expect(msg).toContain('/demo/L-ABCD1234')
    }
    expect(followUpMessage(lead(), 2)).toContain('/register?ref=L-ABCD1234')
  })
  it('never quotes research back to the clinic', () => {
    const l = lead({ signals: [{ type: 'review_pain_phone', kind: 'fact', evidence: 'محدش بيرد' }] })
    expect(openingMessage(l, chooseAngle(l).key)).not.toContain('محدش بيرد')
  })
  it('addresses doctors properly', () => {
    expect(openingMessage(lead({ contact_person: 'د. منى' }), 'no_shows')).toMatch(/^أهلاً د\. منى/)
  })
  it('call script objections stay within the claims', () => {
    for (const { a } of CALL_SCRIPT.objections) expect(a).not.toMatch(/%/)
    expect(CALL_SCRIPT.objections.find((o) => o.q.includes('أوتوماتيك')).a).toMatch(/^لأ/)
  })
})

describe('csv', () => {
  it('parses quoted fields, BOM, CRLF and Arabic headers', () => {
    const text = '﻿الاسم,التليفون,النوع,ملاحظات\r\n"عيادة ""النور""",01012345678,أسنان,"سطر, فيه فاصلة"\r\nعيادة تانية,,جلدية,\r\n'
    const { rows, error } = parseLeadsCsv(text)
    expect(error).toBeNull()
    expect(rows).toEqual([
      { name: 'عيادة "النور"', phone: '01012345678', category: 'dental', notes: 'سطر, فيه فاصلة' },
      { name: 'عيادة تانية', category: 'derma' },
    ])
  })
  it('handles semicolon sheets and requires a name column', () => {
    expect(parseCsvRows('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']])
    expect(parseLeadsCsv('phone\n0101').error).toBeTruthy()
  })
  it('round-trips its own template', () => {
    const { rows } = parseLeadsCsv(csvTemplate())
    expect(rows[0]).toMatchObject({ name: 'عيادة د. سارة للأسنان', category: 'dental', area: 'مدينة نصر', google_reviews_count: '45' })
  })
  it('maps free-text categories', () => {
    expect(categoryFromText('مركز ليزر وتجميل')).toBe('derma')
    expect(categoryFromText('عيادة باطنة')).toBe('clinic')
    expect(categoryFromText('')).toBe('clinic')
  })
  it('exports leads with escaping', () => {
    expect(leadsToCsv([lead({ notes: 'a,"b"' })])).toContain('"a,""b"""')
  })
})

describe('analytics', () => {
  const leads = [
    lead({ id: '1', source: 'contact_form', stage: 'paid', paid_at: 'x', trial_started_at: 'x', partner_id: 'p1' }),
    lead({ id: '2', source: 'contact_form', stage: 'trial', trial_started_at: 'x', partner_id: 'p1' }),
    lead({ id: '3', source: 'google_maps_manual', stage: 'contacted', last_contacted_at: 'x' }),
    lead({ id: '4', source: 'google_maps_manual', stage: 'new' }),
    lead({ id: '5', source: 'referral', stage: 'paid', referrer_business_id: 'b9' }),
    lead({ id: '6', name: 'المرشِّح', business_id: 'b9', stage: 'paid', source: 'organic_signup' }),
  ]
  it('counts a cumulative funnel', () => {
    expect(funnel(leads).map((s) => s.count)).toEqual([6, 5, 4, 4, 3])
  })
  it('groups conversion by source', () => {
    const bySource = conversionBy(leads, 'source')
    expect(bySource.find((g) => g.key === 'contact_form')).toMatchObject({ leads: 2, paid: 1, paidRate: 50 })
  })
  it('computes partner commissions and referral rewards', () => {
    expect(partnerCommissions(leads, [{ id: 'p1', commission_egp: '150' }])[0]).toMatchObject({ leads: 2, paid: 1, owed: 150 })
    expect(referralRewards(leads)).toEqual([{ businessId: 'b9', referrerName: 'المرشِّح', referred: [leads[4]] }])
  })
})

describe('dedupe, preview, links', () => {
  it('finds duplicates by phone, place id, or name+area', () => {
    const existing = [lead({ google_place_id: 'p1', area: 'المعادي' })]
    expect(findDuplicate({ phone: '0101 234 5678' }, existing)).toBe(existing[0])
    expect(findDuplicate({ google_place_id: 'p1' }, existing)).toBe(existing[0])
    expect(findDuplicate({ name: ' عيادة د. سارة  للأسنان', area: 'المعادي' }, existing)).toBe(existing[0])
    expect(findDuplicate({ name: 'عيادة د. سارة للأسنان', area: 'الدقي' }, existing)).toBeNull()
  })
  it('builds a preview without invented prices', () => {
    const p = defaultPreview(lead())
    expect(p.enabled).toBe(true)
    expect(p.services.every((s) => s.price === undefined)).toBe(true)
    expect(initialsFor('عيادة د. سارة للأسنان')).toBe('سل')
  })
  it('links carry the ref code', () => {
    expect(registerLink('L-X')).toBe('https://www.beshola.co/register?ref=L-X')
    expect(previewLink('L-X')).toBe('https://www.beshola.co/demo/L-X')
    expect(bestLinkFor(lead())).toContain('/register?ref=')
  })
})
