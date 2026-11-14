import { describe, it, expect } from 'vitest'
import { dueForNotice, notifyAheadOf, queueMessage, waitingQueue } from './queue'

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
