import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { bootDatabase } from '../local-backend/schema.mjs'

// 065: the desk runs the periods (start, end, a note on the screen), a period
// still being seen keeps the screen after the next one's start time, and the
// line follows who actually came: «رجّعه» and a late «وصل» count those there.

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
const every = (blocks) => Object.fromEntries(KEYS.map(k => [k, blocks]))
// The first period ended a few minutes after midnight; the second runs all day.
const BACK_TO_BACK = [{ start: '00:00', end: '00:05' }, { start: '00:05', end: '23:59', name: 'المسائية' }]

async function clinic(tag, blocks = [{ start: '00:00', end: '23:59' }]) {
  const user = await one(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [`${tag}-${Math.random()}@t.local`])
  const slug = `pc-${tag}-${Math.random().toString(36).slice(2, 8)}`
  const biz = await one(`INSERT INTO businesses (owner_id, name, type, is_active, trial_ends_at, booking_mode, country, booking_slug)
    VALUES ($1, $2, 'clinic', true, now() + interval '30 days', 'queue', 'EG', $3) RETURNING id`, [user.id, `عيادة ${tag}`, slug])
  const branch = await one(`INSERT INTO branches (business_id, name, is_main, capacity, schedule_blocks) VALUES ($1,'ف',true,1,$2::jsonb) RETURNING id`,
    [biz.id, JSON.stringify(every(blocks))])
  const svc = await one(`INSERT INTO services (business_id, name, duration_minutes, price) VALUES ($1,'كشف',10,200) RETURNING id`, [biz.id])
  return { userId: user.id, bizId: biz.id, branchId: branch.id, serviceId: svc.id, slug }
}

let n = 0
const phone = () => `2010${String(40000000 + n++)}`

async function add(c, name, time) {
  return (await as('authenticated', c.userId, tx => tx.query(
    `INSERT INTO appointments (business_id, branch_id, service_id, client_name, client_phone, appointment_date, appointment_time)
     VALUES ($1, $2, $3, $4, $5, (now() AT TIME ZONE 'Africa/Cairo')::date, $6) RETURNING id, queue_number, manage_code`,
    [c.bizId, c.branchId, c.serviceId, name, phone(), time]))).rows[0]
}
const ownerDo = (c, sql, params) => as('authenticated', c.userId, tx => tx.query(sql, params))
const arrive = (c, id) => ownerDo(c, 'UPDATE appointments SET arrived_at = now() WHERE id = $1', [id])
const call = (c, id) => ownerDo(c, 'SELECT front_desk_call($1)', [id])
const pushBack = (c, id, steps = 3) => ownerDo(c, 'SELECT front_desk_push_back($1, $2)', [id, steps])
const screen = async (c) => (await as('anon', null, tx => tx.query('SELECT public_queue_screen($1) s', [c.slug]))).rows[0].s
const page = async (code) => (await as('anon', null, tx => tx.query('SELECT patient_page($1) p', [code]))).rows[0].p.upcoming[0]
const order = async (c) => (await db.query(
  `SELECT a.client_name FROM appointments a WHERE business_id = $1 AND status = 'confirmed' AND called_at IS NULL
   ORDER BY queue_period_key(a), created_at`, [c.bizId])).rows.map(r => r.client_name)

beforeAll(async () => { db = await bootDatabase() }, 120000)
afterAll(async () => { await db?.close() })

describe('065 periods back to back', () => {
  it('the first period keeps the screen while its patients are being seen', async () => {
    const c = await clinic('b2b', BACK_TO_BACK)
    const p1 = []
    for (const name of ['ص1', 'ص2', 'ص3']) p1.push(await add(c, name, '00:00'))
    const evening1 = await add(c, 'م1', '00:05')
    expect(evening1.queue_number).toBe(1)
    await arrive(c, p1[0].id)
    await arrive(c, p1[2].id)
    await call(c, p1[2].id)

    const s = await screen(c)
    // The clock says the evening; the morning is still being seen.
    expect(s.period_start).toBe('00:00')
    expect(s.inside).toMatchObject({ number: 3, period: '00:00' })
    expect(s.line.map(x => [x.period, x.number, x.arrived])).toEqual([['00:00', 1, true], ['00:00', 2, false]])
    expect(s.periods.map(p => [p.start, p.name])).toEqual([['00:00', null], ['00:05', 'المسائية']])

    // Evening number 1: the one inside and the morning patient who's here are
    // ahead; the morning one who never came (their period is over) isn't.
    expect(await page(evening1.manage_code)).toMatchObject({ ahead: 2, coming: 0 })
    expect(s.waiting.find(w => w.period === '00:05' && w.number === 1)).toMatchObject({ ahead: 2, coming: 0, arrived: false })
    expect(JSON.stringify(s)).not.toMatch(/ص1|م1|2010/)
  })

  it('the desk starts and ends periods, and writes a note for the screen', async () => {
    const c = await clinic('desk', BACK_TO_BACK)
    const m1 = await add(c, 'ص1', '00:00')
    const m2 = await add(c, 'ص2', '00:00')
    await add(c, 'م1', '00:05')
    await arrive(c, m1.id)

    // Started by the desk: the evening shows, after the morning patient still here.
    await ownerDo(c, `SELECT front_desk_period($1, $2, '00:05', 'start')`, [c.bizId, c.branchId])
    await ownerDo(c, `SELECT front_desk_note($1, $2, $3)`, [c.bizId, c.branchId, '  الفترة المسائية هتبدأ بعد ما يخلص 4  '])
    let s = await screen(c)
    expect(s.period_start).toBe('00:05')
    expect(s.note).toBe('الفترة المسائية هتبدأ بعد ما يخلص 4')
    expect(s.line.map(x => [x.period, x.number])).toEqual([['00:00', 1], ['00:05', 1]])
    expect(s.periods.find(p => p.start === '00:05').started).toBe(true)

    // Ending the morning: whoever never came is ما جاش; whoever is here stays.
    const marked = (await ownerDo(c, `SELECT front_desk_period($1, $2, '00:00', 'end') n`, [c.bizId, c.branchId])).rows[0].n
    expect(marked).toBe(1)
    expect((await one('SELECT status FROM appointments WHERE id = $1', [m2.id])).status).toBe('no_show')
    expect((await one('SELECT status FROM appointments WHERE id = $1', [m1.id])).status).toBe('confirmed')
    const day = (await ownerDo(c, 'SELECT front_desk_day($1, $2) d', [c.bizId, c.branchId])).rows[0].d
    expect(day.note).toBe('الفترة المسائية هتبدأ بعد ما يخلص 4')
    expect(day.days[day.day]).toEqual({ current_period: '00:05', ended_periods: ['00:00'] })

    // An empty note clears it.
    await ownerDo(c, `SELECT front_desk_note($1, $2, '')`, [c.bizId, c.branchId])
    s = await screen(c)
    expect(s.note).toBeNull()
  })

  it('only the clinic writes its periods and note; visitors read none of it', async () => {
    const c = await clinic('owner', BACK_TO_BACK)
    const other = await clinic('other', BACK_TO_BACK)
    await expect(ownerDo(other, `SELECT front_desk_note($1, $2, 'x')`, [c.bizId, c.branchId])).rejects.toThrow(/NOT_OWNER/)
    await expect(ownerDo(other, `SELECT front_desk_period($1, $2, '00:00', 'end')`, [c.bizId, c.branchId])).rejects.toThrow(/NOT_OWNER/)
    await expect(ownerDo(c, `SELECT front_desk_note($1, $2, 'x')`, [c.bizId, other.branchId])).rejects.toThrow(/NOT_OWNER/)
    await expect(as('anon', null, tx => tx.query(`SELECT front_desk_note($1, $2, 'x')`, [c.bizId, c.branchId]))).rejects.toThrow()
    await expect(as('anon', null, tx => tx.query('SELECT * FROM queue_days'))).rejects.toThrow()
    await ownerDo(c, `SELECT front_desk_note($1, $2, 'سر')`, [c.bizId, c.branchId])
    expect((await ownerDo(other, 'SELECT count(*)::int n FROM queue_days')).rows[0].n).toBe(0)
    expect((await ownerDo(c, 'SELECT count(*)::int n FROM queue_days')).rows[0].n).toBe(1)
  })
})

describe('065 the line follows who came', () => {
  it('«رجّعه 3» goes behind three who are here, not three who never came', async () => {
    const c = await clinic('push')
    const rows = []
    for (const name of ['1', '2', '3', '4', '5', '6', '7']) rows.push(await add(c, name, '10:00'))
    for (const i of [1, 4, 5, 6]) await arrive(c, rows[i].id)
    await call(c, rows[0].id)
    await pushBack(c, rows[0].id)
    // Here: 2, 5, 6, 7. Behind the third of them, not behind 2, 3, 4.
    expect(await order(c)).toEqual(['2', '3', '4', '5', '6', '1', '7'])
  })

  it('a patient whose turn passed goes in after three who are here when they arrive', async () => {
    const c = await clinic('late')
    const rows = []
    for (let i = 1; i <= 12; i++) rows.push(await add(c, String(i), '10:00'))
    // 1-8 haven't come; 9-12 are here and 9 goes in.
    for (const i of [8, 9, 10, 11]) await arrive(c, rows[i].id)
    await call(c, rows[8].id)

    // Number 8 at home: 9 inside and 1-7 still expected, all ahead of them.
    const s = await screen(c)
    expect(s.inside.number).toBe(9)
    expect(s.waiting.find(w => w.number === 8)).toMatchObject({ ahead: 8, coming: 7, arrived: false })
    expect(await page(rows[7].manage_code)).toMatchObject({ ahead: 8, coming: 7, arrived: false })

    // Number 3 arrives late: in after 10, 11 and 12.
    await arrive(c, rows[2].id)
    const line = await order(c)
    expect(line.slice(line.indexOf('10'))).toEqual(['10', '11', '12', '3'])
    // Arriving before anyone after them was called changes nothing.
    const d = await clinic('ontime')
    const early = []
    for (const name of ['أ', 'ب', 'ج']) early.push(await add(d, name, '10:00'))
    await arrive(d, early[2].id)
    await arrive(d, early[0].id)
    expect(await order(d)).toEqual(['أ', 'ب', 'ج'])
  })
})
