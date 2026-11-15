import { describe, it, expect } from 'vitest'
import { dueForNotice, formatWait, notifyAheadOf, queueKey, queueMessage, visitMinutes, waitingQueue } from './queue'

const a = (id, time, extra = {}) => ({ id, client_name: id, appointment_time: time, status: 'confirmed', branch_id: 'b1', ...extra })

describe('today queue', () => {
  it('keeps only waiting patients of the branch, by booking time', () => {
    const q = waitingQueue([
      a('late', '11:00:00'), a('early', '09:00:00'), a('done', '08:00:00', { status: 'completed' }),
      a('other-branch', '09:30:00', { branch_id: 'b2' }), a('no-branch', '10:00:00', { branch_id: null }),
      a('same-time-later', '09:00:00', { created_at: '2026-11-13T10:00:00Z' }),
    ], 'b1')
    expect(q.map(x => x.id)).toEqual(['early', 'same-time-later', 'no-branch', 'late'])
    expect(waitingQueue([a('x', '10:00'), a('y', '09:00', { branch_id: 'b2' })]).map(x => x.id)).toEqual(['y', 'x'])
  })

  it('reads the clinic setting, falling back to 3', () => {
    expect(notifyAheadOf({ queue_notify_ahead: 5 })).toBe(5)
    expect(notifyAheadOf({ queue_notify_ahead: 0 })).toBe(3)
    expect(notifyAheadOf({ queue_notify_ahead: 11 })).toBe(3)
    expect(notifyAheadOf(undefined)).toBe(3)
  })

  it('the patient due is the one with exactly N ahead, until told', () => {
    const q = [a('1', '09:00'), a('2', '09:15'), a('3', '09:30'), a('4', '09:45'), a('5', '10:00')]
    expect(dueForNotice(q, 3).id).toBe('4')
    expect(dueForNotice([...q.slice(0, 3), { ...q[3], queue_notified_at: 'x' }, q[4]], 3)).toBeNull()
    expect(dueForNotice(q.slice(0, 3), 3)).toBeNull()
  })

  it('tells the patient how many are ahead, or that it is their turn', () => {
    const biz = { name: 'عيادة النور' }
    expect(queueMessage({ client_name: 'منى' }, 3, biz, { name: 'فرع المعادي' })).toContain('باقي قدامك 3 مرضى في عيادة النور (فرع المعادي).')
    expect(queueMessage({ client_name: 'منى' }, 1, biz, null)).toContain('باقي قدامك مريض واحد في عيادة النور.')
    expect(queueMessage({ client_name: 'منى' }, 2, biz, { name: 'عيادة النور' })).toContain('باقي قدامك اتنين في عيادة النور.')
    const now = queueMessage({ client_name: 'منى' }, 0, biz, null)
    expect(now).toContain('دورك دلوقتي في عيادة النور، اتفضل.')
    expect(now).not.toContain('http')
  })
})

describe('front desk (058)', () => {
  it('puts whoever is inside first and follows a pushed-back place', () => {
    const q = waitingQueue([
      a('1', '16:00', { queue_number: 1, queue_sort: 57600.0035 }),
      a('2', '16:00', { queue_number: 2 }),
      a('3', '16:00', { queue_number: 3 }),
      a('4', '16:00', { queue_number: 4 }),
      a('5', '16:00', { queue_number: 5, called_at: '2026-11-15T14:00:00Z' }),
    ])
    expect(q.map(x => x.id)).toEqual(['5', '2', '3', '1', '4'])
    expect(queueKey(a('x', '10:30:00', { queue_number: 7 }))).toBeCloseTo(37800.007)
  })

  it('uses the measured visit time, else the services, else the slot', () => {
    expect(visitMinutes(12, [{ duration_minutes: 30 }])).toBe(12)
    expect(visitMinutes(null, [{ duration_minutes: 10 }, { duration_minutes: 20 }])).toBe(15)
    expect(visitMinutes(undefined, [], { slot_duration: 25 })).toBe(25)
    expect(visitMinutes(null, [], null)).toBe(15)
  })

  it('formats a wait in minutes and hours', () => {
    expect(formatWait(0)).toBe('دلوقتي')
    expect(formatWait(25)).toBe('≈ 25 د')
    expect(formatWait(60)).toBe('≈ ساعة')
    expect(formatWait(130)).toBe('≈ ساعتين و10 د')
  })

  it('adds the number and the expected wait when given', () => {
    const msg = queueMessage({ client_name: 'منى', queue_number: 7 }, 2, { name: 'عيادة النور' }, null, { minutes: 20 })
    expect(msg).toContain('رقمك 7. باقي قدامك اتنين في عيادة النور.')
    expect(msg).toContain('الوقت المتوقع حوالي 20 دقيقة.')
  })
})
