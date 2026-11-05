import { describe, it, expect } from 'vitest'
import { automationHealth, buildTodayList, isPoolLead, pickDailyLeads, poolStats } from './dailyList'
import { cleanupReport } from './cleanup'
import { classifyPlace, latestRelease, nearestArea, pickForPool, placeToLeadRow, placesToRows } from './overture'
import { coverageMatrix, partnerEarnings, sourceBoard } from './analytics'
import { parsePastedLeads } from './csv'

const NOW = Date.parse('2030-01-10T10:00:00Z')
const DAY = '2030-01-10'
let n = 0
const lead = (fields = {}) => {
  n += 1
  return { id: `l${n}`, name: `عيادة نمرة ${n}`, source: 'overture', stage: 'new', category: 'dental', phone: `2010120${String(n).padStart(5, '0')}`, created_at: '2030-01-01T00:00:00Z', ...fields }
}

describe('the daily batch', () => {
  it('only takes people you can call and never touched', () => {
    const good = lead()
    expect(isPoolLead(good)).toBe(true)
    for (const bad of [
      lead({ phone: null }), lead({ is_test: true }), lead({ stage: 'lost' }), lead({ archived_at: '2030-01-01' }),
      lead({ last_contacted_at: '2030-01-01' }), lead({ next_follow_up_at: '2030-01-20' }), lead({ name: 'test clinic' }),
    ]) expect(isPoolLead(bad)).toBe(false)
  })

  it('fills only the room urgent leads leave', () => {
    const pool = Array.from({ length: 40 }, () => lead())
    const urgent = lead({ source: 'contact_form', inbound_at: new Date(NOW - 3600e3).toISOString() })
    const ids = pickDailyLeads([urgent, ...pool], { daily_new_calls: 10 }, { now: NOW, day: DAY })
    expect(ids).toHaveLength(9)
    expect(ids).not.toContain(urgent.id)
  })

  it('someone shown recently waits out the cooldown, so tomorrow is a different list', () => {
    const shownYesterday = lead({ last_listed_on: '2030-01-09', times_listed: 1 })
    const shownLongAgo = lead({ last_listed_on: '2029-12-20', times_listed: 1 })
    const never = lead()
    const ids = pickDailyLeads([shownYesterday, shownLongAgo, never], { daily_new_calls: 10, daily_cooldown_days: 14 }, { now: NOW, day: DAY })
    expect(ids).toEqual([never.id, shownLongAgo.id]) // never-shown first
  })

  it('says how long the pool lasts', () => {
    const rows = [...Array.from({ length: 65 }, () => lead()), lead({ last_listed_on: '2030-01-09' })]
    const s = poolStats(rows, { daily_new_calls: 30, daily_cooldown_days: 14 }, DAY)
    expect(s).toMatchObject({ total: 66, ready: 65, resting: 1, daysLeft: 2 })
    expect(s.bySource).toEqual([['overture', 66]])
  })
})

describe('the list on screen', () => {
  it('shows urgent, follow-ups and today’s batch, and nothing else', () => {
    const inbound = lead({ source: 'contact_form', inbound_at: new Date(NOW - 3600e3).toISOString() })
    const signedUp = lead({ stage: 'trial', trial_started_at: new Date(NOW - 864e5).toISOString() })
    const oldTrial = lead({ stage: 'trial', trial_started_at: new Date(NOW - 10 * 864e5).toISOString() })
    const due = lead({ stage: 'follow_up', next_follow_up_at: new Date(NOW - 3600e3).toISOString() })
    const notDue = lead({ stage: 'follow_up', next_follow_up_at: new Date(NOW + 5 * 864e5).toISOString() })
    const batch = lead()
    const notInBatch = lead()
    const hidden = lead({ archived_at: '2030-01-01', next_follow_up_at: new Date(NOW - 3600e3).toISOString() })
    const list = buildTodayList([inbound, signedUp, oldTrial, due, notDue, batch, notInBatch, hidden], [batch.id], { now: NOW })
    const buckets = Object.fromEntries(list.map((q) => [q.lead.id, q.bucket]))
    expect(buckets).toEqual({ [inbound.id]: 0, [signedUp.id]: 0, [due.id]: 1, [batch.id]: 2 })
  })

  it('a batch lead leaves the list once you reach them, and a form filled later appears without a new batch', () => {
    const called = lead({ id: 'called', stage: 'contacted', last_contacted_at: new Date(NOW).toISOString(), next_follow_up_at: new Date(NOW + 864e5 * 3).toISOString() })
    expect(buildTodayList([called], ['called'], { now: NOW })).toEqual([])
    const later = lead({ source: 'contact_form', inbound_at: new Date(NOW).toISOString() })
    expect(buildTodayList([later], [], { now: NOW })[0].bucket).toBe(0)
  })
})

describe('automation health', () => {
  const run = (hoursAgo, ok = true) => ({ ok, finished_at: new Date(NOW - hoursAgo * 36e5).toISOString(), summary: {} })
  it('tells apart never ran, fine, failed and stopped', () => {
    expect(automationHealth([], NOW).state).toBe('never')
    expect(automationHealth([{ finished_at: null }], NOW).state).toBe('never')
    expect(automationHealth([run(3)], NOW).state).toBe('ok')
    expect(automationHealth([run(3, false)], NOW).state).toBe('failed')
    expect(automationHealth([run(50)], NOW)).toMatchObject({ state: 'stale', hours: 50 })
  })
})

describe('clean-up', () => {
  it('finds what is wrong and keeps the row with history', () => {
    const kept = lead({ name: 'عيادة النور', area: 'المعادي', contact_attempts: 3 })
    const copy = lead({ name: 'عيادة  النور', area: 'المعادي' })
    const junk = lead({ name: 'test' })
    const nothing = lead({ phone: null })
    const emailOnly = lead({ phone: null, email: 'a@b.co' })
    const stale = lead({ stage: 'contacted', last_contacted_at: new Date(NOW - 60 * 864e5).toISOString() })
    const fine = lead()
    const { groups, total } = cleanupReport([kept, copy, junk, nothing, emailOnly, stale, fine], NOW)
    expect(groups.duplicates.map((r) => r.lead.id)).toEqual([copy.id])
    expect(groups.suspect.map((r) => r.lead.id)).toContain(junk.id)
    expect(groups.unreachable.map((r) => r.lead.id)).toEqual([nothing.id])
    expect(groups.email_only.map((r) => r.lead.id)).toEqual([emailOnly.id])
    expect(groups.stale.map((r) => r.lead.id)).toEqual([stale.id])
    expect(total).toBeGreaterThanOrEqual(5)
  })

  it('never offers to remove a clinic that signed up', () => {
    const a = lead({ name: 'عيادة', area: 'المعادي', business_id: 'b1' })
    const b = lead({ name: 'عيادة', area: 'المعادي', business_id: 'b2' })
    expect(cleanupReport([a, b], NOW).groups.duplicates).toEqual([])
  })
})

describe('Overture rows', () => {
  const place = (f = {}) => ({ id: 'ov1', name: 'Whity Dental Clinic', taxonomy: 'dental_clinic', confidence: 0.9, phones: ['+201093999099'], websites: null, socials: ['https://www.facebook.com/1'], address: 'شارع عباس', lat: 30.05, lng: 31.33, ...f })

  it('classifies from the taxonomy and the name', () => {
    expect(classifyPlace('dental_clinic', 'X')).toBe('dental')
    expect(classifyPlace('dermatology', 'X')).toBe('derma')
    expect(classifyPlace('doctors_office', 'د. سارة للأسنان')).toBe('dental')
    expect(classifyPlace('cardiology', 'X')).toBe('clinic')
    expect(classifyPlace('hospital', 'X')).toBeNull()
    expect(classifyPlace('laboratory_testing', 'X')).toBeNull()
    expect(classifyPlace('doctors_office', 'معامل الفا')).toBeNull()
    expect(classifyPlace('dental_clinic', 'مستشفى الأسنان')).toBeNull()
    // A broad label needs the name to say clinic: this one is a content page.
    expect(classifyPlace('health_care', 'معلومة في كبسولة')).toBeNull()
    expect(classifyPlace('health_care', 'عيادات لافا التخصصية')).toBe('clinic')
  })

  it('a good place becomes a complete row', () => {
    expect(placeToLeadRow(place())).toMatchObject({
      name: 'Whity Dental Clinic', phone: '201093999099', category: 'dental', area: 'مدينة نصر', city: 'القاهرة',
      facebook: 'https://www.facebook.com/1', overture_id: 'ov1', lat: 30.05, lng: 31.33,
      signals: [{ type: 'no_website', kind: 'inference' }],
    })
  })

  it('drops low confidence, no phone, foreign numbers and places far from the districts', () => {
    expect(placeToLeadRow(place({ confidence: 0.4 }))).toBeNull()
    expect(placeToLeadRow(place({ phones: [] }))).toBeNull()
    expect(placeToLeadRow(place({ phones: ['+966501234567'] }))).toBeNull()
    expect(placeToLeadRow(place({ lat: 29.3, lng: 31.0 }))).toBeNull()
  })

  it('a Facebook link in websites is not a website', () => {
    const row = placeToLeadRow(place({ websites: ['https://www.facebook.com/x'], socials: [] }))
    expect(row.website).toBeUndefined()
    expect(row.facebook).toBe('https://www.facebook.com/x')
    expect(placeToLeadRow(place({ websites: ['https://clinic.com'] })).website).toBe('https://clinic.com')
  })

  it('one row per phone, the most confident one', () => {
    const rows = placesToRows([place({ id: 'a', confidence: 0.7 }), place({ id: 'b', confidence: 0.95 })])
    expect(rows.map((r) => r.overture_id)).toEqual(['b'])
  })

  it('finds the nearest district', () => {
    expect(nearestArea(29.9602, 31.2569).area).toBe('المعادي')
    expect(nearestArea(30.0, 25.0)).toBeNull()
  })

  it('fills the pool with mobiles first, spread over districts', () => {
    const r = (area, phone, confidence = 0.8) => ({ area, phone, category: 'dental', confidence })
    const rows = [r('أ', '201012000001', 0.9), r('أ', '201012000002', 0.85), r('أ', '20222222222', 0.99), r('ب', '201012000003')]
    expect(pickForPool(rows, 2).map((x) => x.area).sort()).toEqual(['أ', 'ب'])
    expect(pickForPool(rows, 4).at(-1).phone).toBe('20222222222')
  })

  it('reads the latest release from the bucket listing', () => {
    const xml = '<a><Prefix>release/2026-09-23.1/</Prefix><Prefix>release/2026-10-21.0/</Prefix><Prefix>release/2026-09-23.0/</Prefix></a>'
    expect(latestRelease(xml)).toBe('2026-10-21.0')
    expect(latestRelease('<a/>')).toBeNull()
  })
})

describe('sources screen numbers', () => {
  it('scores sources from adding to paying', () => {
    const rows = [lead(), lead({ phone: '20222222222' }), lead({ stage: 'paid', paid_at: '2030-01-05' }), lead({ source: 'manual', stage: 'trial', trial_started_at: '2030-01-05' })]
    const [overture, manual] = sourceBoard(rows)
    expect(overture).toMatchObject({ key: 'overture', total: 3, mobile: 2, paid: 1 })
    expect(manual).toMatchObject({ key: 'manual', total: 1, trial: 1, paid: 0 })
  })

  it('shows coverage by district and specialty', () => {
    const rows = [lead({ area: 'المعادي' }), lead({ area: 'المعادي', category: 'derma', stage: 'paid', paid_at: '2030-01-01' }), lead({ area: 'الدقي' }), lead({ area: null })]
    const [maadi, dokki] = coverageMatrix(rows)
    expect(maadi).toMatchObject({ area: 'المعادي', total: 2, won: 1, cells: { dental: 1, derma: 1, clinic: 0 } })
    expect(dokki.total).toBe(1)
  })

  it('works out exactly what a partner earns', () => {
    expect(partnerEarnings({ signup_bonus_egp: 50, commission_pct: 20 })).toEqual([
      { months: 1, price: 299, commission: 59.8, total: 109.8 },
      { months: 3, price: 749, commission: 149.8, total: 199.8 },
      { months: 6, price: 1200, commission: 240, total: 290 },
    ])
  })
})

describe('pasting a list', () => {
  it('reads messy lines from WhatsApp', () => {
    expect(parsePastedLeads('عيادة د. سارة للأسنان 01012345678\nمركز النور، 0111 222 3333\n\n01234567890\nعيادة بدون رقم')).toEqual([
      { name: 'عيادة د. سارة للأسنان', phone: '01012345678', category: 'dental' },
      { name: 'مركز النور', phone: '01112223333', category: 'clinic' },
      { name: 'عيادة 01234567890', phone: '01234567890', category: 'clinic' },
      { name: 'عيادة بدون رقم', category: 'clinic' },
    ])
  })

  it('reads Arabic digits', () => {
    expect(parsePastedLeads('د. أحمد ٠١٠١٢٣٤٥٦٧٨')[0].phone).toBe('01012345678')
  })

  it('reads rows copied from Excel, skipping the header', () => {
    expect(parsePastedLeads('الاسم\tالتليفون\tالمنطقة\nعيادة الشفاء\t01012345678\tالمعادي')).toEqual([
      { name: 'عيادة الشفاء', phone: '01012345678', area: 'المعادي', category: 'clinic' },
    ])
  })
})
