import { describe, it, expect } from 'vitest'
import { groupByPeriod, periodsOfDay, turnStatus } from './queueBooking'

// 2026-11-16 is a Monday.
const MON = '2026-11-16'

describe('dashboard turns view', () => {
  it('takes the day\'s periods from the branch, else the clinic hours', () => {
    const branch = { schedule_blocks: { mon: [{ start: '16:00', end: '22:00' }, { start: '10:00', end: '14:00' }] } }
    expect(periodsOfDay(branch, null, MON)).toEqual([{ start: '16:00', end: '22:00' }, { start: '10:00', end: '14:00' }])
    const business = { working_hours: { mon: { active: true, periods: [{ open: '09:00', close: '13:00' }] } } }
    expect(periodsOfDay({ schedule_blocks: {} }, business, MON)).toEqual([{ start: '09:00', end: '13:00' }])
    expect(periodsOfDay(null, { working_hours: { mon: { active: false } } }, MON)).toEqual([])
  })

  it('puts each booking under its period by number, and keeps waitlist and cancelled apart', () => {
    const a = (id, time, extra = {}) => ({ id, appointment_time: `${time}:00`, status: 'confirmed', ...extra })
    const { groups, waitlist, cancelled } = groupByPeriod([
      a('m2', '10:00', { queue_number: 2 }), a('m1', '10:00', { queue_number: 1 }),
      a('e1', '16:00', { queue_number: 1, status: 'completed' }),
      a('x', '16:00', { queue_number: 2, status: 'cancelled' }),
      a('w', '00:00', { status: 'waitlist' }),
      a('late', '23:00', { queue_number: 1 }),
      a('mid', '17:30', { queue_number: 1 }),
    ], [{ start: '16:00', end: '22:00' }, { start: '10:00', end: '14:00' }])
    // Only the working hours' periods: 17:30 is inside 16:00-22:00, 23:00 is nearest to it.
    expect(groups.map(g => [g.period.start, g.items.map(i => i.id), g.taken])).toEqual([
      ['10:00', ['m1', 'm2'], 2],
      ['16:00', ['e1', 'late', 'mid'], 3],
    ])
    expect(groups.some(g => g.extra)).toBe(false)
    expect(waitlist.map(w => w.id)).toEqual(['w'])
    expect(cancelled).toBe(1)
  })

  it('a day with no period on the hours is one card, never one per time', () => {
    const a = (id, time, extra = {}) => ({ id, appointment_time: `${time}:00`, status: 'completed', ...extra })
    const { groups } = groupByPeriod([a('p', '09:00'), a('q', '09:30'), a('r', '10:15', { status: 'no_show' })], [])
    expect(groups).toHaveLength(1)
    expect(groups[0].extra).toBe(true)
    expect(groups[0].items.map(i => i.id)).toEqual(['p', 'q', 'r'])
  })

  it('names a period by when it starts, unless the clinic named it', async () => {
    const { periodName, defaultPeriodName } = await import('./queueBooking')
    expect(['09:00', '12:00', '14:30', '15:00', '16:00', '19:00'].map(defaultPeriodName)).toEqual([
      'الفترة الصباحية', 'فترة الضهر', 'فترة الضهر', 'فترة العصر', 'الفترة المسائية', 'الفترة المسائية',
    ])
    expect(periodName({ start: '18:00', name: '  كشف الأطفال ' })).toBe('كشف الأطفال')
    expect(periodName({ start: '18:00', name: '' })).toBe('الفترة المسائية')
  })

  it('names where each patient stands', () => {
    expect(turnStatus({ status: 'confirmed' }).label).toBe('حاجز')
    expect(turnStatus({ status: 'confirmed', arrived_at: 'x' }).label).toBe('وصل')
    expect(turnStatus({ status: 'confirmed', arrived_at: 'x', called_at: 'y' }).label).toBe('جوه')
    expect(turnStatus({ status: 'completed' }).label).toBe('خلص')
    expect(turnStatus({ status: 'no_show' }).label).toBe('ما جاش')
  })
})

describe('walk-in period', () => {
  const periods = [{ start: '16:00', end: '22:00' }, { start: '10:00', end: '14:00' }]
  it('joins the running period, else the next one, else the last', async () => {
    const { walkInPeriodStart } = await import('./queueBooking')
    expect(walkInPeriodStart(periods, '11:30')).toBe('10:00')
    expect(walkInPeriodStart(periods, '15:00')).toBe('16:00')
    expect(walkInPeriodStart(periods, '08:00')).toBe('10:00')
    expect(walkInPeriodStart(periods, '23:00')).toBe('16:00')
    expect(walkInPeriodStart([], '11:00')).toBeNull()
  })
})
