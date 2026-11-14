import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { bootDatabase } from '../local-backend/schema.mjs'

// 057: booking by turn. Numbers per period, never reused, a per-period limit
// for visitors, time clinics untouched.

let db
const one = async (sql, params) => (await db.query(sql, params)).rows[0]

async function as(role, userId, fn) {
  return db.transaction(async (tx) => {
    await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', $2, true), set_config('request.headers', $3, true)`,
      [userId || '', role, JSON.stringify({ 'x-forwarded-for': `ip-${Math.random()}` })])
    await tx.exec(`SET LOCAL ROLE ${role}`)
    return fn(tx)
  })
}

const KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const WEEK = Object.fromEntries(KEYS.map(k => [k, [{ start: '10:00', end: '14:00' }, { start: '16:00', end: '22:00' }]]))

async function clinic(tag, { mode = 'queue', limit = null } = {}) {
  const user = await one(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [`${tag}-${Math.random()}@t.local`])
  const biz = await one(`INSERT INTO businesses (owner_id, name, type, is_active, trial_ends_at, booking_mode, queue_limit)
    VALUES ($1, $2, 'clinic', true, now() + interval '30 days', $3, $4) RETURNING id`, [user.id, `عيادة ${tag}`, mode, limit])
  const branch = await one(`INSERT INTO branches (business_id, name, is_main, capacity, schedule_blocks) VALUES ($1,'ف',true,1,$2::jsonb) RETURNING id`,
    [biz.id, JSON.stringify(WEEK)])
  const svc = await one(`INSERT INTO services (business_id, name, duration_minutes, price) VALUES ($1,'كشف',30,200) RETURNING id`, [biz.id])
  return { userId: user.id, bizId: biz.id, branchId: branch.id, serviceId: svc.id }
}

let n = 0
const phone = () => `2010${String(20000000 + n++)}`
const visitorBooks = (c, time, { days = 2, ref = null } = {}) => as('anon', null, tx => tx.query(
  `INSERT INTO appointments (business_id, branch_id, service_id, client_name, client_phone, appointment_date, appointment_time, status, booking_ref)
   VALUES ($1, $2, $3, 'زائر', $4, current_date + $5::int, $6, 'confirmed', $7)`,
  [c.bizId, c.branchId, c.serviceId, phone(), days, time, ref]))
const ownerAdds = (c, time, days = 2) => as('authenticated', c.userId, tx => tx.query(
  `INSERT INTO appointments (business_id, branch_id, service_id, client_name, client_phone, appointment_date, appointment_time)
   VALUES ($1, $2, $3, 'مريض', $4, current_date + $5::int, $6) RETURNING id, queue_number, appointment_time::text t`,
  [c.bizId, c.branchId, c.serviceId, phone(), days, time]))
const numbers = async (c, time = '16:00') => (await db.query(
  `SELECT queue_number n FROM appointments WHERE business_id = $1 AND appointment_time = $2 AND status = 'confirmed' ORDER BY queue_number`, [c.bizId, time])).rows.map(r => r.n)

beforeAll(async () => { db = await bootDatabase() }, 120000)
afterAll(async () => { await db?.close() })

describe('057 queue booking', () => {
  it('existing and time clinics keep booking by time, with no numbers and the overlap guard', async () => {
    const c = await clinic('time', { mode: 'time' })
    await visitorBooks(c, '16:00')
    await expect(visitorBooks(c, '16:00')).rejects.toThrow(/CAPACITY_EXCEEDED/)
    expect((await one(`SELECT queue_number FROM appointments WHERE business_id = $1`, [c.bizId])).queue_number).toBeNull()
    expect((await one(`SELECT booking_mode m FROM businesses WHERE id = $1`, [c.bizId])).m).toBe('time')
  })

  it('a queue clinic gives each period its own numbers, and many patients share a period', async () => {
    const c = await clinic('q')
    for (let i = 0; i < 3; i++) await visitorBooks(c, '16:00')
    await visitorBooks(c, '10:00')
    expect(await numbers(c, '16:00')).toEqual([1, 2, 3])
    expect(await numbers(c, '10:00')).toEqual([1])
  })

  it('a cancellation leaves the other numbers as they were and its number is not reused', async () => {
    const c = await clinic('cancel')
    for (let i = 0; i < 3; i++) await visitorBooks(c, '16:00')
    await db.query(`UPDATE appointments SET status = 'cancelled' WHERE business_id = $1 AND queue_number = 2`, [c.bizId])
    await visitorBooks(c, '16:00')
    expect(await numbers(c)).toEqual([1, 3, 4])
  })

  it('the owner\'s time is snapped to its period and keeps its number when edited inside it', async () => {
    const c = await clinic('owner')
    await visitorBooks(c, '16:00')
    const added = (await ownerAdds(c, '17:30')).rows[0]
    expect(added).toMatchObject({ t: '16:00:00', queue_number: 2 })
    await as('authenticated', c.userId, tx => tx.query(`UPDATE appointments SET appointment_time = '18:00', notes = 'x' WHERE id = $1`, [added.id]))
    expect(await one(`SELECT queue_number, appointment_time::text t FROM appointments WHERE id = $1`, [added.id])).toEqual({ queue_number: 2, t: '16:00:00' })
    // Moving to the morning period gives a number there.
    await as('authenticated', c.userId, tx => tx.query(`UPDATE appointments SET appointment_time = '11:00' WHERE id = $1`, [added.id]))
    expect(await one(`SELECT queue_number, appointment_time::text t FROM appointments WHERE id = $1`, [added.id])).toEqual({ queue_number: 1, t: '10:00:00' })
  })

  it('a waitlisted patient promoted to confirmed gets a number', async () => {
    const c = await clinic('wait')
    await visitorBooks(c, '16:00')
    const w = await one(`INSERT INTO appointments (business_id, branch_id, client_name, client_phone, appointment_date, appointment_time, status)
      VALUES ($1, $2, 'منتظر', '201000000777', current_date + 2, '00:00', 'waitlist') RETURNING id, queue_number`, [c.bizId, c.branchId])
    expect(w.queue_number).toBeNull()
    await db.query(`UPDATE appointments SET status = 'confirmed', appointment_time = '16:00' WHERE id = $1`, [w.id])
    expect((await one(`SELECT queue_number FROM appointments WHERE id = $1`, [w.id])).queue_number).toBe(2)
  })

  it('visitors stop at the limit, the owner can go past it', async () => {
    const c = await clinic('limit', { limit: 2 })
    await visitorBooks(c, '16:00')
    await visitorBooks(c, '16:00')
    await expect(visitorBooks(c, '16:00')).rejects.toThrow(/QUEUE_FULL/)
    expect((await ownerAdds(c, '16:00')).rows[0].queue_number).toBe(3)
    await visitorBooks(c, '10:00') // the other period is still open
  })

  it('the booking page reads the mode, each period\'s counts, the number inside, and its own number', async () => {
    const c = await clinic('page', { limit: 20 })
    const ref = '7d1f4b3e-0000-4000-8000-000000000001'
    await visitorBooks(c, '16:00', { days: 0 })
    await visitorBooks(c, '16:00', { days: 0 })
    await visitorBooks(c, '16:00', { days: 0, ref })
    const read = (sql, params) => as('anon', null, tx => tx.query(sql, params))

    expect((await read('SELECT public_booking_mode($1) m', [c.bizId])).rows[0].m).toEqual({ mode: 'queue', queue_limit: 20 })
    expect((await read('SELECT public_my_queue_number($1) n', [ref])).rows[0].n).toBe(3)

    const period = async () => (await read(`SELECT * FROM public_queue_periods($1, $2, current_date)`, [c.bizId, c.branchId])).rows[0]
    expect(await period()).toMatchObject({ taken: 3, next_number: 4, current_number: 1, started: false })
    await db.query(`UPDATE appointments SET status = 'completed' WHERE business_id = $1 AND queue_number = 1`, [c.bizId])
    expect(await period()).toMatchObject({ taken: 3, next_number: 4, current_number: 2, started: true })
  })

  it('the patient page shows the number, and "ahead" follows it', async () => {
    const c = await clinic('ahead')
    await visitorBooks(c, '16:00', { days: 0 })
    await visitorBooks(c, '16:00', { days: 0 })
    const mine = await one(`SELECT manage_code FROM appointments WHERE business_id = $1 AND queue_number = 2`, [c.bizId])
    const p = (await as('anon', null, tx => tx.query('SELECT patient_page($1) p', [mine.manage_code]))).rows[0].p
    expect(p.upcoming[0]).toMatchObject({ number: 2, ahead: 1 })
  })
})
