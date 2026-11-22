import { describe, it, expect } from 'vitest'
import { dueForNotice, formatWait, notifyAheadOf, periodChoices, periodLine, queueKey, queueMessage, visitMinutes, waitingQueue } from './queue'

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

describe('front desk periods (queue clinics)', () => {
  const periods = [{ start: '10:00', end: '14:00' }, { start: '17:00', end: '22:00' }]
  const day = waitingQueue([
    a('m1', '10:00', { queue_number: 1 }), a('m2', '10:00', { queue_number: 2 }),
    a('e1', '17:00', { queue_number: 1 }), a('e2', '17:00', { queue_number: 2 }),
    a('odd', '15:30', { queue_number: 1 }),
    a('mid', '17:30', { queue_number: 1 }),
  ])

  it('shows one period at a time; a booking off the hours sits in the nearest period, never its own', () => {
    expect(periodLine(day, periods, '10:00').map(x => x.id)).toEqual(['m1', 'm2'])
    // 15:30 is outside both periods (nearest: 17:00); 17:30 is inside 17:00-22:00.
    expect(periodLine(day, periods, '17:00').map(x => x.id)).toEqual(['odd', 'e1', 'mid', 'e2'])
    expect(periodLine(day, periods, '15:30')).toEqual([])
  })

  it('keeps whoever is inside at the top, whatever period is shown', () => {
    const withInside = waitingQueue([...day, a('in', '10:00', { queue_number: 3, called_at: '2026-11-16T10:00:00Z' })])
    expect(periodLine(withInside, periods, '17:00').map(x => x.id)).toEqual(['in', 'odd', 'e1', 'mid', 'e2'])
  })

  it('lists the periods with how many wait in each', () => {
    expect(periodChoices(day, periods).map(c => [c.start, c.waiting, !!c.period])).toEqual([
      ['10:00', 2, true], ['17:00', 4, true],
    ])
  })
})

describe('periods on a day off', () => {
  it('puts the whole day in one group when the hours have no period that day', () => {
    const day = waitingQueue([a('x', '11:00', { queue_number: 1 }), a('y', '09:30'), a('z', '10:15')])
    expect(periodChoices(day, []).map(c => [c.start, c.waiting])).toEqual([['day', 3]])
    expect(periodLine(day, [], 'day').map(r => r.id)).toEqual(['y', 'z', 'x'])
  })
})

describe('renumber message (061)', () => {
  it('tells the patient their new number, the day and the period start', async () => {
    const { renumberMessage } = await import('./queue')
    const msg = renumberMessage({ client_name: 'رحمة', new_number: 4 }, { name: 'عيادة النور' }, { date: 'الأحد 16 نوفمبر', time: '6:00 م' })
    expect(msg).toContain('أهلاً يا رحمة')
    expect(msg).toContain('رقمك في الدور بقى 4.')
    expect(msg).toContain('يوم الأحد 16 نوفمبر، والفترة بتبدأ 6:00 م.')
    expect(msg).not.toMatch(/تلغي|إلغاء/)
  })
})

describe('a period after the hours changed (062)', () => {
  it('lines up by number though old bookings sit on the old start time', () => {
    const periods = [{ start: '18:00', end: '23:00' }]
    const day = waitingQueue([
      a('rahma', '18:00', { queue_number: 4 }), a('sara', '18:00', { queue_number: 5 }),
      a('nour', '18:55', { queue_number: 1 }), a('rania', '18:55', { queue_number: 2 }), a('amira', '18:55', { queue_number: 3 }),
    ])
    expect(periodLine(day, periods, '18:00').map(x => x.id)).toEqual(['nour', 'rania', 'amira', 'rahma', 'sara'])
  })
})

describe('who came and which period runs (065)', () => {
  it('calls the first who is here, else the first in line', async () => {
    const { nextToCall } = await import('./queue')
    expect(nextToCall([a('n1', '10:00'), a('n9', '10:00', { arrived_at: 'x' })]).id).toBe('n9')
    expect(nextToCall([a('n1', '10:00'), a('n2', '10:00')]).id).toBe('n1')
    expect(nextToCall([])).toBeNull()
  })

  it('keeps a period being seen past the next one\'s start, unless the desk started another', async () => {
    const { runningPeriod } = await import('./queue')
    const periods = [{ start: '12:00', end: '17:55' }, { start: '18:00', end: '23:00' }]
    const day = waitingQueue([
      a('m6', '12:00', { queue_number: 6, arrived_at: 'x' }),
      a('e1', '18:00', { queue_number: 1 }),
    ])
    const choices = periodChoices(day, periods)
    expect(runningPeriod(day, periods, choices, { fallback: '18:00' })).toBe('12:00')
    expect(runningPeriod(day, periods, choices, { started: '18:00', fallback: '18:00' })).toBe('18:00')
    expect(runningPeriod(waitingQueue([a('e1', '18:00', { queue_number: 1 })]), periods, choices, { fallback: '18:00' })).toBe('18:00')
  })

  it('tells a patient at home why a bigger number is inside', async () => {
    const { screenPlaceText } = await import('./queue')
    // Number 4 with 2 inside: nothing passed them, so no "but".
    expect(screenPlaceText({ number: 4, ahead: 2, coming: 1, arrived: false }, { number: 2 }).note).toBe('لسه فيه مريض واحد قبلك جاي.')
    expect(screenPlaceText({ number: 8, ahead: 8, coming: 6, arrived: false }, { number: 9 })).toEqual({
      title: 'قدامك 8 مرضى',
      note: 'رقم 9 جوه دلوقتي، بس لسه فيه 6 مرضى قبلك جايين.',
      tell: 'هنبعتلك رسالة تتحرك لما دورك يقرب.',
    })
    // Already here: no message to come.
    expect(screenPlaceText({ ahead: 2, coming: 0, arrived: true }, null)).toEqual({ title: 'قدامك اتنين', note: null, tell: null })
    expect(screenPlaceText({ ahead: 0, coming: 0, arrived: false }, null).title).toBe('إنت اللي عليك الدور')
  })
})
