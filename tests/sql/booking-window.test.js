import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { bootDatabase } from '../local-backend/schema.mjs'

// 055: how far ahead patients may book online.

let db
const one = async (sql, params) => (await db.query(sql, params)).rows[0]

async function as(role, userId, fn) {
  return db.transaction(async (tx) => {
    await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true), set_config('request.headers', $2, true)`,
      [userId || '', JSON.stringify({ 'x-forwarded-for': `ip-${Math.random()}` })])
    await tx.exec(`SET LOCAL ROLE ${role}`)
    return fn(tx)
  })
}

async function clinic(tag, window = null, country = 'EG') {
  const user = await one(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [`${tag}-${Math.random()}@t.local`])
  const biz = await one(`INSERT INTO businesses (owner_id, name, type, is_active, trial_ends_at, booking_window_days, country)
    VALUES ($1, $2, 'clinic', true, now() + interval '30 days', $3, $4) RETURNING id`, [user.id, `عيادة ${tag}`, window, country])
  const branch = await one(`INSERT INTO branches (business_id, name, is_main, capacity) VALUES ($1,'ف',true,50) RETURNING id`, [biz.id])
  const svc = await one(`INSERT INTO services (business_id, name, duration_minutes, price) VALUES ($1,'كشف',30,200) RETURNING id`, [biz.id])
  return { userId: user.id, bizId: biz.id, branchId: branch.id, serviceId: svc.id }
}

let n = 0
// A visitor books `days` ahead of the clinic's local today.
const visitorBooks = (c, days, tz = 'Africa/Cairo') => as('anon', null, tx => tx.query(
  `INSERT INTO appointments (business_id, branch_id, service_id, client_name, client_phone, appointment_date, appointment_time, status)
   VALUES ($1, $2, $3, 'زائر', $4, (now() AT TIME ZONE $6)::date + $5::int, make_time(9 + ($5::int % 10), 0, 0), 'confirmed')`,
  [c.bizId, c.branchId, c.serviceId, `2010${String(10000000 + n++)}`, days, tz]))

beforeAll(async () => { db = await bootDatabase() }, 120000)
afterAll(async () => { await db?.close() })

describe('055 booking window', () => {
  it('existing clinics keep no window and visitors book as far as before', async () => {
    const c = await clinic('open')
    expect((await as('anon', null, tx => tx.query('SELECT last_bookable_date($1) d', [c.bizId]))).rows[0].d).toBeNull()
    await visitorBooks(c, 200)
  })

  it('a 7-day window lets visitors book up to the 7th day and refuses the 8th', async () => {
    const c = await clinic('week', 7)
    const last = (await as('anon', null, tx => tx.query('SELECT last_bookable_date($1) d', [c.bizId]))).rows[0].d
    const today = (await one(`SELECT (now() AT TIME ZONE 'Africa/Cairo')::date d`)).d
    expect((new Date(last) - new Date(today)) / 86400000).toBe(7)
    await visitorBooks(c, 0)
    await visitorBooks(c, 7)
    await expect(visitorBooks(c, 8)).rejects.toThrow(/INVALID_BOOKING: too_far/)
  })

  it('the owner can still add an appointment on any day', async () => {
    const c = await clinic('owner', 1)
    await as('authenticated', c.userId, tx => tx.query(
      `INSERT INTO appointments (business_id, branch_id, service_id, client_name, client_phone, appointment_date, appointment_time)
       VALUES ($1, $2, $3, 'مريض', '201000000001', current_date + 40, '10:00')`, [c.bizId, c.branchId, c.serviceId]))
    expect((await one(`SELECT count(*)::int n FROM appointments WHERE business_id = $1`, [c.bizId])).n).toBe(1)
  })

  it('a shorter window leaves appointments already booked further out alone', async () => {
    const c = await clinic('later')
    await visitorBooks(c, 25)
    await as('authenticated', c.userId, tx => tx.query('UPDATE businesses SET booking_window_days = 1 WHERE id = $1', [c.bizId]))
    expect((await one(`SELECT count(*)::int n FROM appointments WHERE business_id = $1 AND status = 'confirmed'`, [c.bizId])).n).toBe(1)
    await expect(visitorBooks(c, 2)).rejects.toThrow(/too_far/)
  })

  it('the window counts from the clinic\'s own today', async () => {
    const c = await clinic('ksa', 1, 'SA')
    const last = (await as('anon', null, tx => tx.query('SELECT last_bookable_date($1) d', [c.bizId]))).rows[0].d
    const riyadh = (await one(`SELECT (now() AT TIME ZONE 'Asia/Riyadh')::date + 1 d`)).d
    expect(last).toEqual(riyadh)
  })

  it('only 1 to 365 days can be saved, and clearing it is allowed', async () => {
    const c = await clinic('range')
    for (const bad of [0, 366]) {
      await expect(as('authenticated', c.userId, tx => tx.query('UPDATE businesses SET booking_window_days = $2 WHERE id = $1', [c.bizId, bad])))
        .rejects.toThrow(/businesses_booking_window_days_check/)
    }
    await as('authenticated', c.userId, tx => tx.query('UPDATE businesses SET booking_window_days = NULL WHERE id = $1', [c.bizId]))
  })
})
