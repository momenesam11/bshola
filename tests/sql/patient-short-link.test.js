import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { bootDatabase } from '../local-backend/schema.mjs'

// 056: /m/<code>, a short expiring link, a phone check before cancelling, and
// the patient's place in today's queue.

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

async function clinic(tag, policy = null) {
  const user = await one(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [`${tag}-${Math.random()}@t.local`])
  const biz = await one(`INSERT INTO businesses (owner_id, name, type, booking_slug, is_active, trial_ends_at, cancellation_policy)
    VALUES ($1, $2, 'clinic', $3, true, now() + interval '30 days', $4) RETURNING id`,
  [user.id, `عيادة ${tag}`, `s-${tag}-${Math.floor(Math.random() * 1e6)}`, policy])
  const branch = await one(`INSERT INTO branches (business_id, name, is_main, capacity) VALUES ($1,'الفرع',true,20) RETURNING id`, [biz.id])
  return { userId: user.id, bizId: biz.id, branchId: branch.id }
}

let minute = 0
// A visit `days` from the clinic's today at `time` (or a time `hours` ahead).
async function visit(c, phone, { days = 0, time = null, hours = null, status = 'confirmed' } = {}) {
  minute++
  const when = hours !== null
    ? `(now() AT TIME ZONE 'Africa/Cairo') + make_interval(hours => ${hours})`
    : `((now() AT TIME ZONE 'Africa/Cairo')::date + ${days})::timestamp + '${time || '10:00'}'::time`
  return one(
    `INSERT INTO appointments (business_id, branch_id, client_name, client_phone, appointment_date, appointment_time, status, created_at)
     SELECT $1, $2, 'منى', $3, (${when})::date, date_trunc('minute', ${when})::time, $4, now() + make_interval(secs => $5)
     RETURNING id, manage_code`, [c.bizId, c.branchId, phone, status, minute])
}

const page = async (code) => (await as('anon', null, tx => tx.query('SELECT patient_page($1) p', [code]))).rows[0].p
const cancel = async (code, id, tail) =>
  (await as('anon', null, tx => tx.query('SELECT patient_cancel($1, $2, $3) p', [code, id, tail]))).rows[0].p

beforeAll(async () => { db = await bootDatabase() }, 120000)
afterAll(async () => { await db?.close() })

describe('056 patient short link', () => {
  it('every appointment gets a 12-character code the database makes and keeps', async () => {
    const c = await clinic('code')
    const a = await visit(c, '201000000001', { days: 2 })
    const b = await visit(c, '201000000001', { days: 3 })
    expect(a.manage_code).toMatch(/^[a-km-zA-HJ-NP-Z2-9]{12}$/)
    expect(a.manage_code).not.toBe(b.manage_code)

    await as('anon', null, tx => tx.query(
      `INSERT INTO appointments (business_id, branch_id, client_name, client_phone, appointment_date, appointment_time, manage_code)
       VALUES ($1, $2, 'زائر', '201000000099', current_date + 3, '11:00', 'chosenByMe12')`, [c.bizId, c.branchId]))
    expect((await one(`SELECT manage_code FROM appointments WHERE client_phone = '201000000099'`)).manage_code).not.toBe('chosenByMe12')
    await as('authenticated', c.userId, tx => tx.query(`UPDATE appointments SET manage_code = 'changedIt123' WHERE id = $1`, [a.id]))
    expect((await one('SELECT manage_code FROM appointments WHERE id = $1', [a.id])).manage_code).toBe(a.manage_code)
  })

  it('shows upcoming and past without notes or numbers, and expires a week after its visit', async () => {
    const c = await clinic('show')
    const up = await visit(c, '201000000002', { days: 3 })
    await visit(c, '201000000002', { days: -20, status: 'completed' })
    const old = await visit(c, '201000000002', { days: -8, status: 'completed' })
    const recent = await visit(c, '201000000002', { days: -6, status: 'completed' })

    const p = await page(up.manage_code)
    expect(p.upcoming.map(x => x.id)).toEqual([up.id])
    expect(p.past).toHaveLength(3)
    expect(JSON.stringify(p)).not.toContain('201000000002')
    expect((await page(recent.manage_code)).client_name).toBe('منى')
    expect(await page(old.manage_code)).toEqual({ error: 'EXPIRED' })
    expect(await page('nothingHere1')).toEqual({ error: 'NOT_FOUND' })
  })

  it('tells a patient booked today how many are ahead of them', async () => {
    const c = await clinic('queue')
    await visit(c, '201000000010', { time: '09:00' })
    await visit(c, '201000000011', { time: '09:30' })
    await visit(c, '201000000012', { time: '09:45', status: 'completed' }) // already seen
    const mine = await visit(c, '201000000013', { time: '10:00' })
    await visit(c, '201000000014', { time: '11:00' })
    const tomorrow = await visit(c, '201000000013', { days: 1, time: '09:00' })
    const p = await page(mine.manage_code)
    expect(p.upcoming.find(x => x.id === mine.id).ahead).toBe(2)
    expect(p.upcoming.find(x => x.id === tomorrow.id).ahead).toBeNull()
  })

  it('cancels only with the last 3 digits of the number, and locks after 5 wrong tries', async () => {
    const c = await clinic('cancel', 'الإلغاء مجاني قبل 24 ساعة')
    const later = await visit(c, '201000000567', { days: 3 })
    const soon = await visit(c, '201000000567', { hours: 5 })

    expect(await cancel(later.manage_code, later.id, '999')).toEqual({ error: 'WRONG_PHONE' })
    expect((await one('SELECT status FROM appointments WHERE id = $1', [later.id])).status).toBe('confirmed')
    expect(await cancel(later.manage_code, soon.id, '567')).toEqual({ error: 'CANNOT_CANCEL' })

    const done = await cancel(later.manage_code, later.id, '567')
    expect(done.past[0]).toMatchObject({ id: later.id, status: 'cancelled' })
    const note = await one(`SELECT body FROM notifications WHERE related_appointment_id = $1 AND type = 'cancellation'`, [later.id])
    expect(note.body).toBe('منى لغى ميعاده بنفسه من لينك المواعيد')

    const third = await visit(c, '201000000567', { days: 4 })
    for (let i = 0; i < 4; i++) expect((await cancel(third.manage_code, third.id, '000')).error).toBe('WRONG_PHONE')
    expect(await cancel(third.manage_code, third.id, '000')).toEqual({ error: 'WRONG_PHONE' })
    expect(await cancel(third.manage_code, third.id, '567')).toEqual({ error: 'TOO_MANY_TRIES' })
  })

  it('a code never reaches another number or clinic, and the old uuid page is closed', async () => {
    const c = await clinic('cross')
    const mine = await visit(c, '201000000020', { days: 2 })
    const theirs = await visit(c, '201000000021', { days: 2 })
    expect(await cancel(mine.manage_code, theirs.id, '020')).toEqual({ error: 'NOT_FOUND' })
    await expect(as('anon', null, tx => tx.query('SELECT patient_portal(gen_random_uuid())'))).rejects.toThrow(/permission denied/)
    await expect(as('anon', null, tx => tx.query('SELECT * FROM patient_link_attempts'))).rejects.toThrow(/permission denied/)
  })
})
