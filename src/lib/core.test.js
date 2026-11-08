import { readFileSync } from 'node:fs'
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  getPasswordStrength, phoneSchema, loginSchema, registerSchema, getAppointmentSchema, bookingClientSchema,
} from './validators'
import {
  formatTime12, getDayKey, generateTimeSlots, getDayPeriods, getSlotsForDay, getSlotsWithAvailability,
  getSlotsWithAvailabilityForDay, getSlotsForBlocks, isSlotInPast, branchHasScheduleBlocks, normalizeWorkingHours,
  todayISO,
} from '../utils/dateHelpers'
import {
  generateReminderMessage, generateConfirmationMessage, formatTimeArabic, formatDateArabic, openWhatsApp,
} from './whatsapp'
import { csvCell } from './csv'
import { getBusinessStatus, getAdminStats, searchBusinesses } from '../hooks/useAdmin'
import { isBusinessLocked } from '../hooks/useBusiness'

const ok = (schema, v) => schema.safeParse(v).success

describe('phone validation', () => {
  const schema = phoneSchema()
  it.each(['201012345678', '+201012345678', '010 1234 5678', '010-1234-5678', '(010) 1234.5678', '966512345678'])(
    'accepts %s', (v) => expect(ok(schema, v)).toBe(true))
  it.each(['', '123', '1234567890123456', 'abcdefghijk', '2010abc5678', null, undefined])(
    'refuses %s', (v) => expect(ok(schema, v)).toBe(false))
  it('stores only digits', () => expect(schema.parse('+20 101-234-5678')).toBe('201012345678'))
})

describe('password strength', () => {
  it.each([
    ['', ''], ['abc', 'ضعيفة'], ['abcdefgh', 'متوسطة'], ['abcdefg1', 'قوية'], ['abcdefg1!', 'قوية'], ['12345678', 'متوسطة'],
  ])('%s is "%s"', (pw, label) => expect(getPasswordStrength(pw).label).toBe(label))
})

describe('login and register forms', () => {
  it('login needs a real email and 6+ characters', () => {
    expect(ok(loginSchema, { email: 'a@b.co', password: '123456' })).toBe(true)
    expect(ok(loginSchema, { email: 'a@b', password: '123456' })).toBe(false)
    expect(ok(loginSchema, { email: 'a@b.co', password: '12345' })).toBe(false)
  })
  const reg = { email: 'a@b.co', password: 'abcdefg1', confirmPassword: 'abcdefg1', ownerPhone: '201012345678', acceptTerms: true }
  it('register accepts a complete form', () => expect(ok(registerSchema, reg)).toBe(true))
  it.each([
    ['short password', { password: 'abc1', confirmPassword: 'abc1' }],
    ['password without a digit', { password: 'abcdefgh', confirmPassword: 'abcdefgh' }],
    ['mismatch', { confirmPassword: 'other1234' }],
    ['bad phone', { ownerPhone: '12' }],
    ['bad email', { email: 'nope' }],
    ['terms not accepted', { acceptTerms: false }],
  ])('register refuses %s', (_, change) => expect(ok(registerSchema, { ...reg, ...change })).toBe(false))
})

describe('appointment form', () => {
  const good = {
    client_name: 'أحمد', client_phone: '201012345678', service_id: '3f2b1c9e-8a4d-4f6e-9b1a-2c3d4e5f6a7b',
    appointment_date: '2099-01-01', appointment_time: '10:00',
  }
  it('accepts a complete new appointment', () => expect(ok(getAppointmentSchema(false), good)).toBe(true))
  it('refuses a past date for a new one, allows it when editing', () => {
    const past = { ...good, appointment_date: '2020-01-01' }
    expect(ok(getAppointmentSchema(false), past)).toBe(false)
    expect(ok(getAppointmentSchema(true), past)).toBe(true)
  })
  it('accepts today', () => expect(ok(getAppointmentSchema(false), { ...good, appointment_date: todayISO() })).toBe(true))
  it.each([
    ['short name', { client_name: 'أ' }], ['no service', { service_id: '' }], ['fake service', { service_id: 'x' }],
    ['bad phone', { client_phone: '12' }], ['unknown status', { status: 'waiting' }], ['no time', { appointment_time: '' }],
  ])('refuses %s', (_, change) => expect(ok(getAppointmentSchema(true), { ...good, ...change })).toBe(false))
  it('allows an empty payment type and a null price', () => {
    expect(ok(getAppointmentSchema(true), { ...good, payment_type: '', price: null })).toBe(true)
  })
})

describe('public booking form', () => {
  it('normalises the phone', () => {
    expect(bookingClientSchema.parse({ client_name: 'سارة', client_phone: '+20 100-123-4567' }).client_phone).toBe('201001234567')
  })
  it('refuses a one-letter name', () => expect(ok(bookingClientSchema, { client_name: 'س', client_phone: '201001234567' })).toBe(false))
})

describe('time slots', () => {
  it('fits only whole slots in a period', () => {
    expect(generateTimeSlots('09:00', '10:00', 30)).toEqual(['09:00', '09:30'])
    expect(generateTimeSlots('09:00', '09:50', 30)).toEqual(['09:00'])
    expect(generateTimeSlots('09:00', '09:10', 30)).toEqual([])
  })
  it('an end before the start gives nothing rather than looping', () => {
    expect(generateTimeSlots('20:00', '09:00', 30)).toEqual([])
  })
  it('reads both the old and the new working-hours shape', () => {
    expect(getDayPeriods({ open: '09:00', close: '10:00' })).toEqual([{ open: '09:00', close: '10:00' }])
    expect(getDayPeriods({ periods: [{ open: '1', close: '2' }] })).toEqual([{ open: '1', close: '2' }])
    expect(getDayPeriods(null)).toEqual([])
  })
  it('a closed day has no slots', () => {
    expect(getSlotsForDay({ active: false, open: '09:00', close: '10:00' }, 30)).toEqual([])
    expect(getSlotsWithAvailabilityForDay(undefined, 30)).toEqual([])
  })
  it('booked slots stay listed but unavailable, and capacity counts', () => {
    const [a, b] = getSlotsWithAvailability([{ start: '09:00', end: '10:00' }], 30, { '09:00': 2, '09:30': 1 }, 2, '2099-01-01')
    expect(a).toMatchObject({ time: '09:00', isAvailable: false, bookedCount: 2 })
    expect(b).toMatchObject({ time: '09:30', isAvailable: true })
  })
  it('getSlotsForBlocks drops full slots', () => {
    expect(getSlotsForBlocks([{ start: '09:00', end: '10:00' }], 30, { '09:00': 1 }, 1)).toEqual(['09:30'])
  })
  it('two periods in a day both count', () => {
    const blocks = [{ start: '09:00', end: '09:30' }, { start: '17:00', end: '17:30' }]
    expect(getSlotsWithAvailability(blocks, 30, {}, 1, '2099-01-01').map(s => s.time)).toEqual(['09:00', '17:00'])
  })
  it('today\'s past slots are not bookable', () => {
    expect(isSlotInPast('2000-01-01', '09:00')).toBe(true)
    expect(isSlotInPast('2099-01-01', '09:00')).toBe(false)
    expect(isSlotInPast(null, '09:00')).toBe(false)
  })
})

describe('date helpers', () => {
  it('formatTime12', () => {
    expect(formatTime12('00:30')).toBe('12:30 ص')
    expect(formatTime12('12:00')).toBe('12:00 م')
    expect(formatTime12('23:05')).toBe('11:05 م')
    expect(formatTime12('')).toBe('')
    expect(formatTime12(undefined)).toBe('')
  })
  it('getDayKey follows the calendar', () => {
    expect(getDayKey('2026-11-07')).toBe('sat')
    expect(getDayKey('2026-11-13')).toBe('fri')
  })
  it('branchHasScheduleBlocks', () => {
    expect(branchHasScheduleBlocks({})).toBe(false)
    expect(branchHasScheduleBlocks(null)).toBe(false)
    expect(branchHasScheduleBlocks({ sat: [] })).toBe(false)
    expect(branchHasScheduleBlocks({ sat: [{ start: '1', end: '2' }] })).toBe(true)
  })
  it('normalizeWorkingHours gives every day periods', () => {
    expect(normalizeWorkingHours(null)).toEqual({})
    expect(normalizeWorkingHours({ sat: { active: 1 } }).sat).toEqual({ active: true, periods: [{ open: '09:00', close: '18:00' }] })
  })
})

describe('whatsapp messages', () => {
  const appt = { client_name: 'سامي', appointment_time: '14:30:00', appointment_date: '2026-11-08', services: { name: 'كشف' } }
  const biz = { name: 'عيادة النور' }
  it('reminder has name, date, time, service and business', () => {
    const m = generateReminderMessage(appt, biz, { name: 'المعادي', address: 'شارع 9' })
    for (const part of ['سامي', 'عيادة النور', '2:30 م', 'كشف', 'المعادي — شارع 9']) expect(m).toContain(part)
    expect(m).not.toContain('Invalid')
    expect(m).not.toMatch(/undefined|null/)
  })
  it('the clinic\'s own template wins and every variable is filled', () => {
    const m = generateReminderMessage(appt, {
      ...biz, reminder_template: '{client_name} / {service} / {time} / {business_name} / {branch}',
    }, { name: 'المعادي' })
    expect(m).toBe('سامي / كشف / 2:30 م / عيادة النور / المعادي')
  })
  it('confirmation falls back to the business when there is no branch', () => {
    expect(generateConfirmationMessage(appt, biz, null)).toContain('📍 عيادة النور')
  })
  it('formatting survives missing values', () => {
    expect(formatTimeArabic(null)).toBe('')
    expect(formatDateArabic(null)).toBe('')
    expect(formatTimeArabic('00:05')).toBe('12:05 ص')
  })
  describe('openWhatsApp', () => {
    afterEach(() => vi.unstubAllGlobals())
    it('cleans the number, encodes the text and reports the tab it opened', () => {
      const open = vi.fn(() => ({}))
      vi.stubGlobal('window', { open })
      expect(openWhatsApp('+20 100-123', 'أهلاً & مرحباً')).toBe(true)
      expect(open.mock.calls[0][0]).toBe(`https://wa.me/20100123?text=${encodeURIComponent('أهلاً & مرحباً')}`)
    })
    it('reports a tab the browser blocked', () => {
      vi.stubGlobal('window', { open: () => null })
      expect(openWhatsApp('201', 'x')).toBe(false)
    })
  })
})

describe('CSV cells', () => {
  it.each([
    ['plain', 'plain'], ['a,b', '"a,b"'], ['say "hi"', '"say ""hi"""'], ['two\nlines', '"two\nlines"'],
    ['=1+1', "'=1+1"], ['+201', "'+201"], ['-5', "'-5"], ['@x', "'@x"], [null, ''], [undefined, ''], [12, '12'],
  ])('%s becomes %s', (input, out) => expect(csvCell(input)).toBe(out))
})

describe('subscription state', () => {
  const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString()
  it('isBusinessLocked', () => {
    expect(isBusinessLocked(null)).toBe(false)
    expect(isBusinessLocked({ is_active: false, trial_ends_at: inDays(9) })).toBe(true)
    expect(isBusinessLocked({ is_active: true, trial_ends_at: inDays(-1) })).toBe(true)
    expect(isBusinessLocked({ is_active: true, trial_ends_at: inDays(1) })).toBe(false)
    expect(isBusinessLocked({ is_active: true, trial_ends_at: null })).toBe(false)
  })
  it('getBusinessStatus', () => {
    expect(getBusinessStatus({ is_active: false, subscription_type: 'paid' })).toBe('suspended')
    expect(getBusinessStatus({ is_active: true, subscription_type: 'paid', trial_ends_at: inDays(5) })).toBe('paid')
    expect(getBusinessStatus({ is_active: true, trial_ends_at: inDays(-1) })).toBe('expired')
    expect(getBusinessStatus({ is_active: true, trial_ends_at: inDays(1) })).toBe('trial')
  })
  it('a paid subscription that ran out is not shown as active', () => {
    expect(getBusinessStatus({ is_active: true, subscription_type: 'paid', trial_ends_at: inDays(-1) })).toBe('expired')
  })
  it('getAdminStats counts and sorts what is expiring', () => {
    const s = getAdminStats([
      { is_active: true, trial_ends_at: inDays(2), created_at: inDays(-1) },
      { is_active: true, trial_ends_at: inDays(1), created_at: inDays(-30) },
      { is_active: true, trial_ends_at: inDays(30), subscription_type: 'paid', created_at: inDays(-30) },
      { is_active: true, trial_ends_at: inDays(-3), created_at: inDays(-30) },
      { is_active: false, created_at: inDays(-30) },
    ])
    expect(s).toMatchObject({ total: 5, activeTrials: 2, paid: 1, expiredTrials: 1, suspended: 1, signupsThisWeek: 1, conversionRate: 50 })
    expect(s.expiringSoon.map(b => b.daysLeft)).toEqual([1, 2])
  })
  it('getAdminStats on nothing does not divide by zero', () => {
    expect(getAdminStats([]).conversionRate).toBe(0)
  })
  it('searchBusinesses matches name and both phones', () => {
    const list = [{ name: 'Nour', phone: '111' }, { name: 'سما', owner_phone: '222' }]
    expect(searchBusinesses(list, 'nour')).toHaveLength(1)
    expect(searchBusinesses(list, '222')).toHaveLength(1)
    expect(searchBusinesses(list, '  ')).toHaveLength(2)
    expect(searchBusinesses(list, 'zzz')).toHaveLength(0)
  })
})

describe('every app page is served in production', () => {
  const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'))
  const app = readFileSync('src/App.jsx', 'utf8')
  const routes = [...app.matchAll(/<Route path="(\/[^"*]*)"/g)].map(m => m[1])
    .filter(p => !['/', '/product', '/faq', '/guides', '/tools/no-show-calculator'].includes(p))
  it.each(routes)('%s has a rewrite', (route) => {
    const prefix = route.replace(/\/:.*$/, '')
    const found = vercel.rewrites.some(r => {
      const source = r.source.replace(/\/:path\*$/, '')
      return prefix === source || prefix.startsWith(`${source}/`)
    })
    expect(found).toBe(true)
  })
})
