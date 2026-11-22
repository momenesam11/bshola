import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { bootDatabase } from '../local-backend/schema.mjs'

// 066: a night period goes on past midnight until the desk ends it, starts a
// period of the new day, or the new day's first period begins.

let db
const one = async (sql, params) => (await db.query(sql, params)).rows[0]

const KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const HOURS = Object.fromEntries(KEYS.map(k => [k, [{ start: '10:00', end: '14:00' }, { start: '18:00', end: '23:59' }]]))

async function clinic(tag) {
  const user = await one(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [`${tag}-${Math.random()}@t.local`])
  const biz = await one(`INSERT INTO businesses (owner_id, name, type, is_active, trial_ends_at, booking_mode, country)
    VALUES ($1, 'عيادة', 'clinic', true, now() + interval '30 days', 'queue', 'EG') RETURNING id`, [user.id])
  const branch = await one(`INSERT INTO branches (business_id, name, is_main, capacity, schedule_blocks) VALUES ($1,'ف',true,1,$2::jsonb) RETURNING id`,
    [biz.id, JSON.stringify(HOURS)])
  return { userId: user.id, bizId: biz.id, branchId: branch.id }
}

let n = 0
async function visit(c, date, time, extra = '') {
  return one(`INSERT INTO appointments (business_id, branch_id, client_name, client_phone, appointment_date, appointment_time, status)
    VALUES ($1, $2, 'مريض', $3, $4::date, $5, 'confirmed') RETURNING id`, [c.bizId, c.branchId, `2010${String(50000000 + n++)}`, date, time])
    .then(async (r) => { if (extra) await db.query(`UPDATE appointments SET ${extra} WHERE id = $1`, [r.id]); return r })
}

const ownerDo = (c, sql, params) => db.transaction(async (tx) => {
  await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', 'authenticated', true)`, [c.userId])
  await tx.exec('SET LOCAL ROLE authenticated')
  return tx.query(sql, params)
})

beforeAll(async () => { db = await bootDatabase() }, 120000)
afterAll(async () => { await db?.close() })

describe('066 the night period', () => {
  // Cairo is UTC+2 in November.
  const day = async (c, utc) => one(`SELECT clinic_day($1, $2, $3::timestamptz)::text d, clinic_day_time($1, $2, $3::timestamptz)::text t`, [c.bizId, c.branchId, utc])

  it('stays on the evening before while it has someone, until the morning period begins', async () => {
    const c = await clinic('night')
    // 02:30 on the 23rd, nobody left from the 22nd: the 23rd.
    expect(await day(c, '2026-11-23T00:30:00Z')).toEqual({ d: '2026-11-23', t: '02:30:00' })
    // Someone still waiting from the 22nd's evening: the 22nd, at the end of its day.
    await visit(c, '2026-11-22', '18:00', 'arrived_at = now()')
    expect(await day(c, '2026-11-23T00:30:00Z')).toEqual({ d: '2026-11-22', t: '23:59:59' })
    expect((await day(c, '2026-11-23T05:30:00Z')).d).toBe('2026-11-22')
    expect((await day(c, '2026-11-23T07:59:00Z')).d).toBe('2026-11-22')
    // 10:00, the morning period: the new day, whatever is left.
    expect(await day(c, '2026-11-23T08:00:00Z')).toEqual({ d: '2026-11-23', t: '10:00:00' })
  })

  it('ends when the desk ends the evening, or starts a period of the new day', async () => {
    const c = await clinic('closed')
    await visit(c, '2026-11-22', '18:00')
    expect((await day(c, '2026-11-23T00:30:00Z')).d).toBe('2026-11-22')
    await db.query(`INSERT INTO queue_days (business_id, branch_id, day, ended_periods) VALUES ($1, $2, '2026-11-22', ARRAY['18:00'::time])`, [c.bizId, c.branchId])
    expect((await day(c, '2026-11-23T00:30:00Z')).d).toBe('2026-11-23')

    const d = await clinic('started')
    await visit(d, '2026-11-22', '18:00')
    await db.query(`INSERT INTO queue_days (business_id, branch_id, day, current_period) VALUES ($1, $2, '2026-11-23', '10:00')`, [d.bizId, d.branchId])
    expect((await day(d, '2026-11-23T00:30:00Z')).d).toBe('2026-11-23')
  })

  it('starting a period of today closes what is left of the evening before', async () => {
    const c = await clinic('start')
    const today = (await one(`SELECT (now() AT TIME ZONE 'Africa/Cairo')::date::text d`)).d
    const eve = (await one(`SELECT ((now() AT TIME ZONE 'Africa/Cairo')::date - 1)::text d`)).d
    const inside = await visit(c, eve, '18:00', 'arrived_at = now(), called_at = now()')
    const here = await visit(c, eve, '18:00', 'arrived_at = now()')
    const never = await visit(c, eve, '18:00')
    const morning = await visit(c, today, '10:00')

    const marked = (await ownerDo(c, `SELECT front_desk_period($1, $2, '10:00', 'start', $3::date) n`, [c.bizId, c.branchId, today])).rows[0].n
    expect(marked).toBe(0)
    const status = async (r) => (await one('SELECT status FROM appointments WHERE id = $1', [r.id])).status
    expect([await status(inside), await status(here), await status(never), await status(morning)])
      .toEqual(['completed', 'confirmed', 'no_show', 'confirmed'])
    const state = (await ownerDo(c, 'SELECT front_desk_day($1, $2) d', [c.bizId, c.branchId])).rows[0].d
    expect(state.day).toBe(today)
    expect(state.days[eve].ended_periods).toEqual(['18:00'])
    expect(state.days[today].current_period).toBe('10:00')
  })

  it('the desk ends a period of the evening before by its day, and no older day', async () => {
    const c = await clinic('end')
    const eve = (await one(`SELECT ((now() AT TIME ZONE 'Africa/Cairo')::date - 1)::text d`)).d
    const older = (await one(`SELECT ((now() AT TIME ZONE 'Africa/Cairo')::date - 2)::text d`)).d
    const never = await visit(c, eve, '18:00')
    const marked = (await ownerDo(c, `SELECT front_desk_period($1, $2, '18:00', 'end', $3::date) n`, [c.bizId, c.branchId, eve])).rows[0].n
    expect(marked).toBe(1)
    expect((await one('SELECT status FROM appointments WHERE id = $1', [never.id])).status).toBe('no_show')
    await expect(ownerDo(c, `SELECT front_desk_period($1, $2, '18:00', 'end', $3::date)`, [c.bizId, c.branchId, older])).rejects.toThrow(/BAD_DAY/)
  })
})
