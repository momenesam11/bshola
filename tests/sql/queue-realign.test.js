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
    // Rahma as she was booked before 062 numbered the whole period: a second 1.
    await db.query('ALTER TABLE appointments DISABLE TRIGGER assign_queue_number')
    await visitorBooks(c, 'رحمة', '18:00', 60)
    await db.query(`UPDATE appointments SET queue_number = 1 WHERE business_id = $1 AND client_name = 'رحمة'`, [c.bizId])
    await db.query('ALTER TABLE appointments ENABLE TRIGGER assign_queue_number')
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

  it('062: after the hours change, a new booking continues the period\'s numbers instead of a second 1', async () => {
    const c = await clinic('perperiod', [{ open: '18:55', close: '23:00' }])
    for (const [i, name] of ['نور', 'رانيا', 'أميرة'].entries()) await visitorBooks(c, name, '18:55', 600 - i)
    await setHours(c, [{ open: '18:00', close: '23:00' }])
    await visitorBooks(c, 'رحمة', '18:00', 60)
    await visitorBooks(c, 'سارة', '18:00', 30)
    const numbers = (await line(c)).map(r => r.n).sort((x, y) => x - y)
    expect(numbers).toEqual([1, 2, 3, 4, 5])
    // The booking page sees one period with 5 taken and 6 next.
    const day = (await one(`SELECT ((now() AT TIME ZONE 'Africa/Cairo')::date + 1)::text d`)).d
    const periods = (await as('anon', null, tx => tx.query('SELECT * FROM public_queue_periods($1, $2, $3)', [c.bizId, c.branchId, day]))).rows
    expect(periods.map(p => [p.period_start, p.taken, p.next_number])).toEqual([['18:00:00', 5, 6]])
    // Rahma (4) has the three earlier bookers ahead of her, though they sit on 18:55.
    const rahma = await one(`SELECT patients_ahead(a) n FROM appointments a WHERE business_id = $1 AND client_name = 'رحمة'`, [c.bizId])
    expect(rahma.n).toBe(3)
  })

  it('062: the online limit counts the whole period, old start times included', async () => {
    const c = await clinic('limit', [{ open: '18:55', close: '23:00' }])
    await db.query('UPDATE businesses SET queue_limit = 3 WHERE id = $1', [c.bizId])
    for (const [i, name] of ['نور', 'رانيا', 'أميرة'].entries()) await visitorBooks(c, name, '18:55', 600 - i)
    await setHours(c, [{ open: '18:00', close: '23:00' }])
    await expect(visitorBooks(c, 'رحمة', '18:00', 60)).rejects.toThrow(/QUEUE_FULL/)
  })

  it('062: editing an old booking without moving it keeps its time and number', async () => {
    const c = await clinic('keep', [{ open: '18:55', close: '23:00' }])
    await visitorBooks(c, 'نور', '18:55', 600)
    await setHours(c, [{ open: '18:00', close: '23:00' }])
    await db.query(`UPDATE appointments SET status = 'no_show' WHERE business_id = $1`, [c.bizId])
    await db.query(`UPDATE appointments SET status = 'confirmed' WHERE business_id = $1`, [c.bizId])
    expect(await line(c)).toEqual([{ client_name: 'نور', t: '18:55', n: 1, status: 'confirmed' }])
  })

  it('a no-show in the period goes after everyone waiting, and a time outside every period stays', async () => {
    const c = await clinic('noshow', [{ open: '18:00', close: '23:00' }])
    await visitorBooks(c, 'غايب', '18:00', 900)
    await db.query(`UPDATE appointments SET status = 'no_show' WHERE business_id = $1`, [c.bizId])
    await setHours(c, [{ open: '17:00', close: '23:00' }])
    await visitorBooks(c, 'حاضرة', '17:00', 30)
    // 18:00 is now inside 17:00-23:00 (063: every status moves): the no-show joins
    // the period after the waiting patient, who becomes 1.
    const plan = (await realign(c, false)).rows
    expect(plan.map(p => [p.client_name, p.old_time, p.new_time, p.old_number, p.new_number])).toEqual([
      ['حاضرة', '17:00:00', '17:00:00', 2, 1],
      ['غايب', '18:00:00', '17:00:00', 1, 2],
    ])
    await realign(c, true)
    expect((await realign(c, false)).rows).toEqual([])

    await setHours(c, [{ open: '10:00', close: '12:00' }])
    // 064: 17:00 is outside every period now, so it joins the nearest one (10:00),
    // as the clinic's screens already show it, keeping its numbers.
    const moved = (await realign(c, false)).rows
    expect(moved.map(p => [p.client_name, p.new_time, p.new_number])).toEqual([
      ['حاضرة', '10:00:00', 1],
      ['غايب', '10:00:00', 2],
    ])
  })

  it('064: bookings outside every period: new ones continue their numbers, and one tap numbers them once', async () => {
    // Booked by time at 09:00 and 10:00 (each a 1), the hours' only period is 18:00-23:00.
    const c = await clinic('outside', [{ open: '18:00', close: '23:00' }])
    await db.query('ALTER TABLE appointments DISABLE TRIGGER assign_queue_number')
    for (const [name, time, ago] of [['صبح أ', '09:00', 300], ['صبح ب', '10:00', 200]]) {
      await db.query(
        `INSERT INTO appointments (business_id, branch_id, client_name, client_phone, appointment_date, appointment_time, status, queue_number, created_at)
         VALUES ($1, $2, $3, $4, (now() AT TIME ZONE 'Africa/Cairo')::date + 1, $5, 'confirmed', 1, now() - make_interval(mins => $6))`,
        [c.bizId, c.branchId, name, phone(), time, ago])
    }
    await db.query('ALTER TABLE appointments ENABLE TRIGGER assign_queue_number')
    // A new booking in the evening counts them as part of its period: 2, not 1.
    await visitorBooks(c, 'مسا', '18:00', 10)
    expect((await one(`SELECT queue_number n FROM appointments WHERE business_id = $1 AND client_name = 'مسا'`, [c.bizId])).n).toBe(2)

    await realign(c, true)
    expect(await line(c)).toEqual([
      { client_name: 'صبح أ', t: '18:00', n: 1, status: 'confirmed' },
      { client_name: 'صبح ب', t: '18:00', n: 2, status: 'confirmed' },
      { client_name: 'مسا', t: '18:00', n: 3, status: 'confirmed' },
    ])
  })

  it('064: a day with no period at all is numbered once from its earliest booking', async () => {
    const c = await clinic('nohours', [{ open: '18:00', close: '23:00' }])
    await db.query(`UPDATE businesses SET working_hours = '{}'::jsonb WHERE id = $1`, [c.bizId])
    await db.query('ALTER TABLE appointments DISABLE TRIGGER assign_queue_number')
    for (const [name, time, ago] of [['أول', '09:00', 300], ['تاني', '09:30', 200], ['تالت', '11:00', 100]]) {
      await db.query(
        `INSERT INTO appointments (business_id, branch_id, client_name, client_phone, appointment_date, appointment_time, status, queue_number, created_at)
         VALUES ($1, $2, $3, $4, (now() AT TIME ZONE 'Africa/Cairo')::date + 1, $5, 'confirmed', 1, now() - make_interval(mins => $6))`,
        [c.bizId, c.branchId, name, phone(), time, ago])
    }
    await db.query('ALTER TABLE appointments ENABLE TRIGGER assign_queue_number')
    await realign(c, true)
    expect(await line(c)).toEqual([
      { client_name: 'أول', t: '09:00', n: 1, status: 'confirmed' },
      { client_name: 'تاني', t: '09:00', n: 2, status: 'confirmed' },
      { client_name: 'تالت', t: '09:00', n: 3, status: 'confirmed' },
    ])
  })

  it('063: a clinic switched from booking by time: the whole period gets one numbering', async () => {
    // Today's visits each numbered 1 on its own time: done, inside, waiting and a no-show.
    const c = await clinic('switched', [{ open: '00:00', close: '23:59' }])
    const rows = [
      ['خلص أول', '09:00', 'completed', 300], ['خلص تاني', '09:30', 'completed', 200],
      ['جوه', '10:00', 'confirmed', 100], ['مستني', '10:30', 'confirmed', 400], ['غايب', '11:00', 'no_show', 500],
    ]
    await db.query('ALTER TABLE appointments DISABLE TRIGGER assign_queue_number')
    for (const [name, time, status, minutesAgo] of rows) {
      await db.query(
        `INSERT INTO appointments (business_id, branch_id, client_name, client_phone, appointment_date, appointment_time, status, queue_number, created_at)
         VALUES ($1, $2, $3, $4, (now() AT TIME ZONE 'Africa/Cairo')::date, $5, $6, 1, now() - make_interval(mins => $7))`,
        [c.bizId, c.branchId, name, phone(), time, status, minutesAgo])
    }
    await db.query('ALTER TABLE appointments ENABLE TRIGGER assign_queue_number')
    await db.query(`UPDATE appointments SET called_at = now() - interval '50 minutes' WHERE business_id = $1 AND client_name = 'خلص أول'`, [c.bizId])
    await db.query(`UPDATE appointments SET called_at = now() - interval '30 minutes' WHERE business_id = $1 AND client_name = 'خلص تاني'`, [c.bizId])
    await db.query(`UPDATE appointments SET called_at = now() - interval '5 minutes' WHERE business_id = $1 AND client_name = 'جوه'`, [c.bizId])

    const plan = (await realign(c, false)).rows
    // The page messages only who is still waiting and changed number.
    expect(plan.filter(p => p.status === 'confirmed' && !p.called_at && p.old_number !== p.new_number).map(p => p.client_name)).toEqual(['مستني'])

    await realign(c, true)
    const after = (await db.query(`SELECT client_name, to_char(appointment_time, 'HH24:MI') t, queue_number n FROM appointments
      WHERE business_id = $1 ORDER BY queue_number`, [c.bizId])).rows
    expect(after).toEqual([
      { client_name: 'خلص أول', t: '00:00', n: 1 },
      { client_name: 'خلص تاني', t: '00:00', n: 2 },
      { client_name: 'جوه', t: '00:00', n: 3 },
      { client_name: 'مستني', t: '00:00', n: 4 },
      { client_name: 'غايب', t: '00:00', n: 5 },
    ])
    // Nothing left to move.
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
