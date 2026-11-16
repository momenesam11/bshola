import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { bootDatabase } from '../local-backend/schema.mjs'

// 061: a clinic that books by turn changed its hours, and bookings made before
// sit on the old start time with their own number 1. queue_realign() moves
// them into the period they now fall in and numbers it by who booked first.

let db
const one = async (sql, params) => (await db.query(sql, params)).rows[0]

async function as(role, userId, fn) {
  return db.transaction(async (tx) => {
    await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', $2, true)`, [userId || '', role])
    await tx.exec(`SET LOCAL ROLE ${role}`)
    return fn(tx)
  })
}

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const hours = (periods) => JSON.stringify(Object.fromEntries(DAYS.map(d => [d, { active: true, periods }])))
let n = 0
const phone = () => `2010${String(40000000 + n++)}`

// A clinic on its general hours (no branch hours), booking by turn.
async function clinic(tag, periods) {
  const user = await one(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [`${tag}-${Math.random()}@t.local`])
  const biz = await one(`INSERT INTO businesses (owner_id, name, type, is_active, trial_ends_at, booking_mode, country, working_hours)
    VALUES ($1, $2, 'clinic', true, now() + interval '30 days', 'queue', 'EG', $3::jsonb) RETURNING id`, [user.id, `عيادة ${tag}`, hours(periods)])
  await db.query('DELETE FROM branches WHERE business_id = $1', [biz.id])
  const branch = await one(`INSERT INTO branches (business_id, name, is_main, capacity, schedule_blocks) VALUES ($1,'ف',true,1,'{}'::jsonb) RETURNING id`, [biz.id])
  return { userId: user.id, bizId: biz.id, branchId: branch.id }
}

// A visitor books a period start, a minute apart so "who booked first" is clear.
async function visitorBooks(c, name, time, minutesAgo) {
  await as('anon', null, tx => tx.query(
    `INSERT INTO appointments (business_id, branch_id, client_name, client_phone, appointment_date, appointment_time, status, created_at)
     VALUES ($1, $2, $3, $4, (now() AT TIME ZONE 'Africa/Cairo')::date + 1, $5, 'confirmed', now() - make_interval(mins => $6))`,
    [c.bizId, c.branchId, name, phone(), time, minutesAgo]))
}
const setHours = (c, periods) => db.query('UPDATE businesses SET working_hours = $2::jsonb WHERE id = $1', [c.bizId, hours(periods)])
const realign = (c, apply) => as('authenticated', c.userId, tx => tx.query('SELECT * FROM queue_realign($1, $2)', [c.bizId, apply]))
const line = async (c) => (await db.query(
  `SELECT client_name, to_char(appointment_time, 'HH24:MI') t, queue_number n, status FROM appointments
   WHERE business_id = $1 ORDER BY appointment_time, queue_number`, [c.bizId])).rows

beforeAll(async () => { db = await bootDatabase() }, 120000)
afterAll(async () => { await db?.close() })

describe('061 queue realign', () => {
  it('the hours moved from 18:55 to 18:00: earlier bookers keep 1-3, the later one becomes 4', async () => {
    const c = await clinic('salwa', [{ open: '12:00', close: '16:00' }, { open: '18:55', close: '23:00' }])
    for (const [i, name] of ['نور', 'رانيا', 'أميرة'].entries()) await visitorBooks(c, name, '18:55', 600 - i)
    await setHours(c, [{ open: '12:00', close: '16:00' }, { open: '18:00', close: '23:00' }])
    await visitorBooks(c, 'رحمة', '18:00', 60)
    // Before: two number 1s in the evening.
    expect(await line(c)).toEqual([
      { client_name: 'رحمة', t: '18:00', n: 1, status: 'confirmed' },
      { client_name: 'نور', t: '18:55', n: 1, status: 'confirmed' },
      { client_name: 'رانيا', t: '18:55', n: 2, status: 'confirmed' },
      { client_name: 'أميرة', t: '18:55', n: 3, status: 'confirmed' },
    ])

    // The plan changes nothing until applied, and lists only who changes.
    const plan = (await realign(c, false)).rows
    expect(plan.map(p => [p.client_name, p.old_time, p.new_time, p.old_number, p.new_number])).toEqual([
      ['نور', '18:55:00', '18:00:00', 1, 1],
      ['رانيا', '18:55:00', '18:00:00', 2, 2],
      ['أميرة', '18:55:00', '18:00:00', 3, 3],
      ['رحمة', '18:00:00', '18:00:00', 1, 4],
    ])
    expect((await line(c))[1].t).toBe('18:55')

    await realign(c, true)
    expect(await line(c)).toEqual([
      { client_name: 'نور', t: '18:00', n: 1, status: 'confirmed' },
      { client_name: 'رانيا', t: '18:00', n: 2, status: 'confirmed' },
      { client_name: 'أميرة', t: '18:00', n: 3, status: 'confirmed' },
      { client_name: 'رحمة', t: '18:00', n: 4, status: 'confirmed' },
    ])
    // Nothing left to move, and a new booking takes 5.
    expect((await realign(c, false)).rows).toEqual([])
    await visitorBooks(c, 'جديدة', '18:00', 1)
    expect((await line(c)).at(-1)).toMatchObject({ client_name: 'جديدة', n: 5 })
  })

  it('a no-show in the period goes after everyone waiting, and a time outside every period stays', async () => {
    const c = await clinic('noshow', [{ open: '18:00', close: '23:00' }])
    await visitorBooks(c, 'غايب', '18:00', 900)
    await db.query(`UPDATE appointments SET status = 'no_show' WHERE business_id = $1`, [c.bizId])
    await setHours(c, [{ open: '17:00', close: '23:00' }])
    await visitorBooks(c, 'حاضرة', '17:00', 30)
    // 18:00 is now inside 17:00-23:00 but the only booking there is a no-show: nothing waits to move.
    expect((await realign(c, false)).rows).toEqual([])

    await setHours(c, [{ open: '10:00', close: '12:00' }])
    // 17:00 is outside every period now: left as it is.
    expect((await realign(c, false)).rows).toEqual([])
  })

  it('a clinic can only plan and move its own bookings', async () => {
    const c = await clinic('own', [{ open: '18:55', close: '23:00' }])
    await visitorBooks(c, 'مريضة', '18:55', 10)
    await setHours(c, [{ open: '18:00', close: '23:00' }])
    const other = await clinic('other', [{ open: '10:00', close: '12:00' }])
    const peek = await as('authenticated', other.userId, tx => tx.query('SELECT * FROM queue_realign($1, true)', [c.bizId]))
    expect(peek.rows).toEqual([])
    expect((await line(c))[0].t).toBe('18:55')
    await expect(as('anon', null, tx => tx.query('SELECT * FROM queue_realign($1, false)', [c.bizId]))).rejects.toThrow(/permission denied/)
  })
})
