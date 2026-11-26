import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { bootDatabase } from '../local-backend/schema.mjs'

// 068: the waiting-room screen counts «ahead» / «coming» once per appointment
// instead of re-deriving every period per pair — same answers, in time for the
// visitors' 3-second limit.

let db
const one = async (sql, params) => (await db.query(sql, params)).rows[0]

const KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
// Two periods covering the whole day, so "now" is always inside one.
const HOURS = Object.fromEntries(KEYS.map(k => [k, [{ start: '00:00', end: '12:00' }, { start: '12:00', end: '23:59' }]]))

let n = 0
async function busyClinic(count) {
  const user = await one(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [`busy-${Math.random()}@t.local`])
  const biz = await one(`INSERT INTO businesses (owner_id, name, type, is_active, trial_ends_at, booking_mode, country, booking_slug)
    VALUES ($1, 'عيادة زحمة', 'clinic', true, now() + interval '30 days', 'queue', 'EG', $2) RETURNING id`, [user.id, `busy-${n++}`])
  const branch = await one(`INSERT INTO branches (business_id, name, is_main, capacity, schedule_blocks) VALUES ($1,'ف',true,1,$2::jsonb) RETURNING id`,
    [biz.id, JSON.stringify(HOURS)])
  const today = (await one(`SELECT (now() AT TIME ZONE 'Africa/Cairo')::date::text d`)).d
  for (let i = 0; i < count; i++) {
    // Mix of both periods, arrivals, one inside, walk-ins without a number,
    // and a pushed-back number.
    const time = i % 3 === 0 ? '09:00' : '15:00'
    const r = await one(`INSERT INTO appointments (business_id, branch_id, client_name, client_phone, appointment_date, appointment_time, status)
      VALUES ($1, $2, 'مريض', $3, $4::date, $5, 'confirmed') RETURNING id`,
    [biz.id, branch.id, `2010${String(60000000 + n++)}`, today, time])
    const set = []
    if (i % 4 === 1) set.push('arrived_at = now()')
    if (i === 2) set.push('called_at = now()')
    if (i % 11 === 7) set.push('queue_sort = 1')
    if (i % 13 === 9) set.push('queue_number = NULL')
    if (set.length) await db.query(`UPDATE appointments SET ${set.join(', ')} WHERE id = $1`, [r.id])
  }
  return { slug: (await one('SELECT booking_slug FROM businesses WHERE id = $1', [biz.id])).booking_slug, bizId: biz.id, branchId: branch.id, today }
}

beforeAll(async () => { db = await bootDatabase() }, 120000)
afterAll(async () => { await db?.close() })

describe('068 the waiting-room screen is fast', () => {
  it('gives exactly the same ahead / coming as the per-row functions', async () => {
    const c = await busyClinic(60)
    const screen = (await one('SELECT public_queue_screen($1) AS s', [c.slug])).s
    expect(screen.error).toBeUndefined()

    const { rows: expected } = await db.query(`
      SELECT a.queue_number AS number, to_char(queue_period_of(a.business_id, a.branch_id, a.appointment_date, a.appointment_time), 'HH24:MI') AS period,
             a.arrived_at IS NOT NULL AS arrived, patients_ahead(a) AS ahead, patients_ahead_coming(a) AS coming
      FROM appointments a
      WHERE a.business_id = $1 AND a.appointment_date = $2::date AND a.branch_id IS NOT DISTINCT FROM $3
        AND a.status = 'confirmed' AND a.called_at IS NULL AND a.queue_number IS NOT NULL`, [c.bizId, c.today, c.branchId])

    const sort = (list) => [...list].sort((x, y) => x.period.localeCompare(y.period) || x.number - y.number)
    expect(expected.length).toBeGreaterThan(30)
    expect(sort(screen.waiting)).toEqual(sort(expected))
    // Something is really ahead of someone, so the comparison means something.
    expect(screen.waiting.some((w) => w.ahead > 10 && w.coming < w.ahead)).toBe(true)
  })

  it('answers a busy day far faster than the old per-row counting', async () => {
    const c = await busyClinic(80)
    const t0 = performance.now()
    await one('SELECT public_queue_screen($1) AS s', [c.slug])
    const fast = performance.now() - t0
    const t1 = performance.now()
    await db.query(`SELECT patients_ahead(a), patients_ahead_coming(a) FROM appointments a
      WHERE a.business_id = $1 AND a.status = 'confirmed' AND a.called_at IS NULL AND a.queue_number IS NOT NULL`, [c.bizId])
    const old = performance.now() - t1
    expect(fast).toBeLessThan(old / 3)
  })

  it('rolls back to the 066 screen', async () => {
    const c = await busyClinic(5)
    const { readFileSync } = await import('node:fs')
    await db.exec(readFileSync('supabase/rollbacks/068_queue_screen_fast_down.sql', 'utf8'))
    const s = (await one('SELECT public_queue_screen($1) AS s', [c.slug])).s
    expect(s.waiting.length).toBeGreaterThan(0)
  })
})
