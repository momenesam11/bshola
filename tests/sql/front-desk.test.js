import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { bootDatabase } from '../local-backend/schema.mjs'

// 058: the front desk. Calling a patient in finishes whoever was inside, a late
// patient goes back a few places, visitors can't touch the new columns, and
// the patient page shows who is inside and about how long is left.

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
const WEEK = Object.fromEntries(KEYS.map(k => [k, [{ start: '00:00', end: '23:59' }]]))

async function clinic(tag, { mode = 'queue', minutes = 20 } = {}) {
  const user = await one(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [`${tag}-${Math.random()}@t.local`])
  const biz = await one(`INSERT INTO businesses (owner_id, name, type, is_active, trial_ends_at, booking_mode, country)
    VALUES ($1, $2, 'clinic', true, now() + interval '30 days', $3, 'EG') RETURNING id`, [user.id, `عيادة ${tag}`, mode])
  const branch = await one(`INSERT INTO branches (business_id, name, is_main, capacity, schedule_blocks) VALUES ($1,'ف',true,1,$2::jsonb) RETURNING id`,
    [biz.id, JSON.stringify(WEEK)])
  const svc = await one(`INSERT INTO services (business_id, name, duration_minutes, price) VALUES ($1,'كشف',$2,200) RETURNING id`, [biz.id, minutes])
  return { userId: user.id, bizId: biz.id, branchId: branch.id, serviceId: svc.id }
}

let n = 0
const phone = () => `2010${String(30000000 + n++)}`
// The clinic's today, as patient_page sees it (Cairo).
const today = async () => (await one(`SELECT (now() AT TIME ZONE 'Africa/Cairo')::date::text d`)).d

async function ownerAdds(c, name, time = '10:00', date = null) {
  return (await as('authenticated', c.userId, tx => tx.query(
    `INSERT INTO appointments (business_id, branch_id, service_id, client_name, client_phone, appointment_date, appointment_time)
     VALUES ($1, $2, $3, $4, $5, coalesce($6::date, (now() AT TIME ZONE 'Africa/Cairo')::date), $7) RETURNING id, queue_number, manage_code`,
    [c.bizId, c.branchId, c.serviceId, name, phone(), date, time]))).rows[0]
}
const call = (c, id) => as('authenticated', c.userId, tx => tx.query('SELECT front_desk_call($1)', [id]))
const pushBack = (c, id, steps = 3) => as('authenticated', c.userId, tx => tx.query('SELECT front_desk_push_back($1, $2)', [id, steps]))
const order = async (c) => (await db.query(
  `SELECT a.client_name FROM appointments a WHERE business_id = $1 AND status = 'confirmed' ORDER BY queue_key(a), created_at`, [c.bizId])).rows.map(r => r.client_name)
const page = async (code) => (await as('anon', null, tx => tx.query('SELECT patient_page($1) p', [code]))).rows[0].p

beforeAll(async () => { db = await bootDatabase() }, 120000)
afterAll(async () => { await db?.close() })

describe('058 front desk', () => {
  it('calling a patient finishes whoever was inside and stamps the times', async () => {
    const c = await clinic('call')
    const a = await ownerAdds(c, 'أ')
    const b = await ownerAdds(c, 'ب')
    await call(c, a.id)
    let row = await one('SELECT status, called_at, arrived_at FROM appointments WHERE id = $1', [a.id])
    expect(row.status).toBe('confirmed')
    expect(row.called_at).not.toBeNull()
    expect(row.arrived_at).not.toBeNull()

    await call(c, b.id)
    row = await one('SELECT status, finished_at FROM appointments WHERE id = $1', [a.id])
    expect(row.status).toBe('completed')
    expect(row.finished_at).not.toBeNull()
    expect((await one('SELECT called_at FROM appointments WHERE id = $1', [b.id])).called_at).not.toBeNull()

    // A mistaken "خلص" undone: the visit isn't over any more.
    await as('authenticated', c.userId, tx => tx.query(`UPDATE appointments SET status = 'confirmed' WHERE id = $1`, [a.id]))
    expect(await one('SELECT finished_at, called_at FROM appointments WHERE id = $1', [a.id])).toEqual({ finished_at: null, called_at: null })
    // So only the one called last is inside, and the returned one waits in its place.
    expect((await one(`SELECT count(*)::int n FROM appointments WHERE business_id = $1 AND status = 'confirmed' AND called_at IS NOT NULL`, [c.bizId])).n).toBe(1)
    const page1 = (await as('anon', null, tx => tx.query('SELECT patient_page($1) p', [a.manage_code]))).rows[0].p.upcoming[0]
    expect(page1).toMatchObject({ inside: false, ahead: 1 })
  })

  it('another clinic and visitors cannot call or push back', async () => {
    const c = await clinic('own')
    const other = await clinic('other')
    const a = await ownerAdds(c, 'أ')
    await expect(call(other, a.id)).rejects.toThrow(/NOT_WAITING/)
    await expect(pushBack(other, a.id)).rejects.toThrow(/NOT_WAITING/)
    await expect(as('anon', null, tx => tx.query('SELECT front_desk_call($1)', [a.id]))).rejects.toThrow(/permission denied/)
    expect((await one('SELECT called_at FROM appointments WHERE id = $1', [a.id])).called_at).toBeNull()
  })

  it('a late patient goes back three places, or to the end, and keeps their number', async () => {
    const c = await clinic('late')
    const rows = []
    for (const name of ['1', '2', '3', '4', '5', '6']) rows.push(await ownerAdds(c, name))
    await call(c, rows[0].id)
    await pushBack(c, rows[0].id)
    expect(await order(c)).toEqual(['2', '3', '4', '1', '5', '6'])
    expect((await one('SELECT queue_number, called_at FROM appointments WHERE id = $1', [rows[0].id]))).toEqual({ queue_number: 1, called_at: null })

    // Pushed again: three more places, past the end of the line.
    await pushBack(c, rows[0].id)
    expect(await order(c)).toEqual(['2', '3', '4', '5', '6', '1'])
    await pushBack(c, rows[0].id)
    expect(await order(c)).toEqual(['2', '3', '4', '5', '6', '1'])
  })

  it('in a time clinic, the line follows the booking times and pushing back moves past later times', async () => {
    const c = await clinic('time', { mode: 'time' })
    for (const [name, time] of [['ص', '09:00'], ['س', '09:30'], ['ع', '10:00'], ['ف', '10:30'], ['ق', '11:00']]) await ownerAdds(c, name, time)
    const first = await one(`SELECT id FROM appointments WHERE business_id = $1 AND client_name = 'ص'`, [c.bizId])
    await pushBack(c, first.id, 2)
    expect(await order(c)).toEqual(['س', 'ع', 'ص', 'ف', 'ق'])
  })

  it('a visitor booking cannot set the front-desk columns', async () => {
    const c = await clinic('visitor')
    await as('anon', null, tx => tx.query(
      `INSERT INTO appointments (business_id, branch_id, service_id, client_name, client_phone, appointment_date, appointment_time, status, called_at, arrived_at, queue_sort, finished_at)
       VALUES ($1, $2, $3, 'زائر', $4, current_date + 1, '10:00', 'confirmed', now(), now(), -1, now())`,
      [c.bizId, c.branchId, c.serviceId, phone()]))
    expect(await one(`SELECT called_at, arrived_at, queue_sort, finished_at FROM appointments WHERE business_id = $1`, [c.bizId]))
      .toEqual({ called_at: null, arrived_at: null, queue_sort: null, finished_at: null })
  })

  it('a visit time comes from the services until three real visits were timed', async () => {
    const c = await clinic('minutes', { minutes: 20 })
    const minutes = async () => (await as('authenticated', c.userId, tx => tx.query('SELECT consult_minutes($1) m', [c.bizId]))).rows[0].m
    expect(await minutes()).toBe(20)
    for (const m of [8, 10, 12]) {
      const r = await ownerAdds(c, `م${m}`)
      await db.query(`UPDATE appointments SET called_at = now() - make_interval(mins => $2), status = 'completed', finished_at = now() WHERE id = $1`, [r.id, m])
    }
    expect(await minutes()).toBe(10)
    // An outlier (left open for hours) doesn't count.
    const r = await ownerAdds(c, 'نسي')
    await db.query(`UPDATE appointments SET called_at = now() - interval '5 hours', status = 'completed', finished_at = now() WHERE id = $1`, [r.id])
    expect(await minutes()).toBe(10)
    // Another clinic sees only its own visits, not these.
    const other = await clinic('peek', { minutes: 30 })
    expect((await as('authenticated', other.userId, tx => tx.query('SELECT consult_minutes($1) m', [c.bizId]))).rows[0].m).toBe(20)
  })

  it('the patient page shows who is inside, the place and about how long', async () => {
    const c = await clinic('page', { minutes: 15 })
    const rows = []
    for (const name of ['1', '2', '3', '4']) rows.push(await ownerAdds(c, name, '16:00'))
    await call(c, rows[0].id)
    const mine = (await page(rows[3].manage_code)).upcoming[0]
    expect(mine).toMatchObject({ number: 4, ahead: 3, inside: false, now_serving: 1, eta_minutes: 45 })
    const inside = (await page(rows[0].manage_code)).upcoming[0]
    expect(inside).toMatchObject({ ahead: 0, inside: true })

    // The booking page's count says who's inside: the one called, not the first waiting.
    await pushBack(c, rows[0].id, 1)
    await call(c, rows[2].id)
    const day = await today()
    const period = (await as('anon', null, tx => tx.query('SELECT * FROM public_queue_periods($1, $2, $3)', [c.bizId, c.branchId, day]))).rows[0]
    expect(period.current_number).toBe(3)
  })

  it('each branch has its own line: calling in one branch leaves the other branch inside', async () => {
    const c = await clinic('branches')
    const second = await one(`INSERT INTO branches (business_id, name, is_main, capacity, schedule_blocks) VALUES ($1,'تاني',false,1,$2::jsonb) RETURNING id`,
      [c.bizId, JSON.stringify(WEEK)])
    const a = await ownerAdds(c, 'فرع1-أ')
    const b = await ownerAdds({ ...c, branchId: second.id }, 'فرع2-أ')
    const a2 = await ownerAdds(c, 'فرع1-ب')
    await call(c, a.id)
    await call(c, b.id)
    await call(c, a2.id)
    const rows = (await db.query(`SELECT client_name, status, called_at IS NOT NULL inside FROM appointments WHERE business_id = $1 ORDER BY client_name`, [c.bizId])).rows
    expect(rows).toEqual([
      { client_name: 'فرع1-أ', status: 'completed', inside: true },
      { client_name: 'فرع1-ب', status: 'confirmed', inside: true },
      { client_name: 'فرع2-أ', status: 'confirmed', inside: true },
    ])
  })

  it('a no-show brought back waits in line again, and the patient page counts it', async () => {
    const c = await clinic('noshow')
    const rows = []
    for (const name of ['1', '2', '3']) rows.push(await ownerAdds(c, name))
    await as('authenticated', c.userId, tx => tx.query(`UPDATE appointments SET status = 'no_show' WHERE id = $1`, [rows[0].id]))
    expect((await page(rows[2].manage_code)).upcoming[0].ahead).toBe(1)
    await as('authenticated', c.userId, tx => tx.query(`UPDATE appointments SET status = 'confirmed' WHERE id = $1`, [rows[0].id]))
    expect(await order(c)).toEqual(['1', '2', '3'])
    expect((await page(rows[2].manage_code)).upcoming[0].ahead).toBe(2)
  })

  it('no two patients share a number, and only one is ever inside', async () => {
    const c = await clinic('unique')
    // 20 visitors book the same period: numbers 1..20, each once.
    for (let i = 0; i < 20; i++) {
      await as('anon', null, tx => tx.query(
        `INSERT INTO appointments (business_id, branch_id, service_id, client_name, client_phone, appointment_date, appointment_time, status)
         VALUES ($1, $2, $3, 'زائر', $4, current_date + 1, '16:00', 'confirmed')`, [c.bizId, c.branchId, c.serviceId, phone()]))
    }
    const nums = (await db.query(`SELECT queue_number n FROM appointments WHERE business_id = $1 ORDER BY 1`, [c.bizId])).rows.map(r => r.n)
    expect(nums).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
    // Even a direct write can't give a second patient a taken number.
    await expect(db.query(`UPDATE appointments SET queue_number = 1 WHERE business_id = $1 AND queue_number = 2`, [c.bizId]))
      .rejects.toThrow(/appointments_queue_number_key/)

    // And the database refuses a second patient inside the same branch and day.
    const a = await ownerAdds(c, 'جوه')
    const b = await ownerAdds(c, 'كمان')
    await call(c, a.id)
    await expect(db.query(`UPDATE appointments SET called_at = now() WHERE id = $1`, [b.id])).rejects.toThrow(/appointments_one_inside_key/)
    await call(c, b.id)
    expect((await one(`SELECT count(*)::int n FROM appointments WHERE business_id = $1 AND status = 'confirmed' AND called_at IS NOT NULL`, [c.bizId])).n).toBe(1)
  })

  it('the waiting-room screen shows numbers only: who is inside and the line in order', async () => {
    const c = await clinic('screen', { minutes: 15 })
    await db.query(`UPDATE businesses SET booking_slug = $2 WHERE id = $1`, [c.bizId, `screen-${c.bizId.slice(0, 8)}`])
    const rows = []
    for (const name of ['سري1', 'سري2', 'سري3', 'سري4']) rows.push(await ownerAdds(c, name, '16:00'))
    await call(c, rows[0].id)
    await pushBack(c, rows[1].id, 1)
    const screen = async (ref) => (await as('anon', null, tx => tx.query('SELECT public_queue_screen($1) s', [ref]))).rows[0].s
    const s = await screen(`screen-${c.bizId.slice(0, 8)}`)
    expect(s.inside.number).toBe(1)
    expect(s.line.map(x => x.number)).toEqual([3, 2, 4])
    expect(s.minutes).toBe(15)
    expect(s.mode).toBe('queue')
    // Nothing that names a patient leaves the database.
    const text = JSON.stringify(s)
    expect(text).not.toMatch(/سري|2010/)
    // By id too; an unknown one or a locked clinic shows nothing.
    expect((await screen(c.bizId)).line).toHaveLength(3)
    expect((await screen('no-such-clinic')).error).toBe('NOT_FOUND')
    await db.query(`UPDATE businesses SET is_active = false WHERE id = $1`, [c.bizId])
    expect(await screen(c.bizId)).toEqual({ error: 'LOCKED' })
  })

  it('a branch map link must be an https link', async () => {
    const c = await clinic('map')
    await expect(db.query(`UPDATE branches SET map_url = 'javascript:alert(1)' WHERE id = $1`, [c.branchId])).rejects.toThrow(/map_url/)
    await db.query(`UPDATE branches SET map_url = 'https://maps.app.goo.gl/abc' WHERE id = $1`, [c.branchId])
    const r = await ownerAdds(c, 'خريطة')
    expect((await page(r.manage_code)).upcoming[0].map_url).toBe('https://maps.app.goo.gl/abc')
  })
})
