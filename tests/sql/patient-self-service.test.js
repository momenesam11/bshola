import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { bootDatabase } from '../local-backend/schema.mjs'

// 054: /my/<token>, the patient's own appointments and cancelling within policy.

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

async function clinic(tag, fields = {}) {
  const user = await one(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [`${tag}-${Math.random()}@t.local`])
  const biz = await one(`INSERT INTO businesses (owner_id, name, type, booking_slug, is_active, trial_ends_at, cancellation_policy, country)
    VALUES ($1, $2, 'clinic', $3, true, now() + interval '30 days', $4, $5) RETURNING id`,
  [user.id, `عيادة ${tag}`, `s-${tag}-${Math.floor(Math.random() * 1e6)}`, fields.policy ?? null, fields.country ?? 'EG'])
  const branch = await one(`INSERT INTO branches (business_id, name, is_main, capacity, address) VALUES ($1,'الفرع',true,20,'شارع 9') RETURNING id`, [biz.id])
  const svc = await one(`INSERT INTO services (business_id, name, duration_minutes, price) VALUES ($1,'كشف',30,200) RETURNING id`, [biz.id])
  return { userId: user.id, bizId: biz.id, branchId: branch.id, serviceId: svc.id }
}

// Local time `hoursFromNow` ahead in the clinic's zone, as date + time.
async function visit(c, phone, hoursFromNow, { status = 'confirmed', tz = 'Africa/Cairo', notes = null, price = null } = {}) {
  return one(
    `INSERT INTO appointments (business_id, branch_id, service_id, client_name, client_phone, appointment_date, appointment_time, status, notes, price)
     SELECT $1, $2, $3, 'منى', $4, (t)::date, date_trunc('minute', t)::time, $6, $7, $8
     FROM (SELECT (now() AT TIME ZONE $9) + make_interval(hours => $5::int) AS t) s
     RETURNING id, manage_token`,
    [c.bizId, c.branchId, c.serviceId, phone, hoursFromNow, status, notes, price, tz])
}

const portal = async (token, role = 'anon') =>
  (await as(role, null, tx => tx.query('SELECT patient_portal($1) p', [token]))).rows[0].p
const cancel = (token, id) => as('anon', null, tx => tx.query('SELECT patient_cancel_appointment($1, $2) p', [token, id]))

beforeAll(async () => { db = await bootDatabase() }, 120000)
afterAll(async () => { await db?.close() })

describe('054 patient self service', () => {
  it('every appointment has its own token, made by the database even if a visitor sends one', async () => {
    const c = await clinic('tok')
    const a = await visit(c, '201000000001', 48)
    const b = await visit(c, '201000000001', 72)
    expect(a.manage_token).toMatch(/^[0-9a-f-]{36}$/)
    expect(a.manage_token).not.toBe(b.manage_token)

    const chosen = '11111111-1111-4111-8111-111111111111'
    await as('anon', null, tx => tx.query(
      `INSERT INTO appointments (business_id, branch_id, service_id, client_name, client_phone, appointment_date, appointment_time, status, manage_token, cancelled_by_patient_at, review_requested_at)
       VALUES ($1, $2, $3, 'زائر', '201000000099', current_date + 3, '10:00', 'confirmed', $4, now(), now())`,
      [c.bizId, c.branchId, c.serviceId, chosen]))
    const row = await one(`SELECT manage_token, cancelled_by_patient_at, review_requested_at FROM appointments WHERE client_phone = '201000000099'`)
    expect(row.manage_token).not.toBe(chosen)
    expect(row.cancelled_by_patient_at).toBeNull()
    expect(row.review_requested_at).toBeNull()
    expect(await portal(chosen)).toBeNull()

    // Nobody changes a token afterwards, not even the owner.
    await as('authenticated', c.userId, tx => tx.query('UPDATE appointments SET manage_token = $2 WHERE id = $1', [a.id, chosen]))
    expect((await one('SELECT manage_token t FROM appointments WHERE id = $1', [a.id])).t).toBe(a.manage_token)
  })

  it('shows only this number at this clinic, without notes or prices', async () => {
    const c = await clinic('mine')
    const other = await clinic('other')
    const mine = await visit(c, '201000000002', 48, { notes: 'سري', price: 999 })
    await visit(c, '201000000002', -48, { status: 'completed' })
    await visit(c, '201000000002', -24, { status: 'no_show' })
    await visit(c, '201000000003', 48) // someone else, same clinic
    await visit(other, '201000000002', 48) // same number, another clinic

    const p = await portal(mine.manage_token)
    expect(p.client_name).toBe('منى')
    expect(p.business).toMatchObject({ name: 'عيادة mine', public_phone: null })
    expect(p.upcoming).toHaveLength(1)
    expect(p.upcoming[0]).toMatchObject({ id: mine.id, status: 'confirmed', service: 'كشف', branch: 'الفرع', address: 'شارع 9', can_cancel: true })
    expect(p.past.map(x => x.status)).toEqual(['no_show', 'completed'])
    const text = JSON.stringify(p)
    for (const secret of ['سري', '999', '201000000003', 'manage_token', 'client_phone']) expect(text).not.toContain(secret)
    expect(await portal('00000000-0000-4000-8000-000000000000')).toBeNull()
  })

  it('cancels within the policy, and the clinic is told the patient did it', async () => {
    const c = await clinic('cancel', { policy: 'الإلغاء مجاني قبل 24 ساعة' })
    const soon = await visit(c, '201000000004', 5)
    const later = await visit(c, '201000000004', 30)
    await one(`INSERT INTO appointments (business_id, branch_id, client_name, client_phone, appointment_date, appointment_time, status)
      SELECT $1, $2, 'منتظر', '201000000005', appointment_date, '00:00', 'waitlist' FROM appointments WHERE id = $3 RETURNING id`, [c.bizId, c.branchId, later.id])

    const p = await portal(soon.manage_token)
    expect(p.upcoming.map(x => [x.id, x.can_cancel])).toEqual([[soon.id, false], [later.id, true]])
    await expect(cancel(soon.manage_token, soon.id)).rejects.toThrow(/CANNOT_CANCEL/)

    const after = (await cancel(soon.manage_token, later.id)).rows[0].p
    expect(after.upcoming.map(x => x.id)).toEqual([soon.id])
    expect(after.past[0]).toMatchObject({ id: later.id, status: 'cancelled' })
    const row = await one('SELECT status, cancelled_by_patient_at FROM appointments WHERE id = $1', [later.id])
    expect(row.status).toBe('cancelled')
    expect(row.cancelled_by_patient_at).not.toBeNull()
    const note = await one(`SELECT body FROM notifications WHERE related_appointment_id = $1 AND type = 'cancellation'`, [later.id])
    expect(note.body).toBe('منى لغى ميعاده بنفسه من لينك المواعيد، وفي 1 في قايمة الانتظار لنفس اليوم')

    await expect(cancel(soon.manage_token, later.id)).rejects.toThrow(/CANNOT_CANCEL/)
  })

  it('a clinic with no online cancelling shows the button to nobody', async () => {
    const c = await clinic('strict', { policy: 'لا يوجد إلغاء بعد الحجز' })
    const a = await visit(c, '201000000006', 200)
    expect((await portal(a.manage_token)).upcoming[0].can_cancel).toBe(false)
    await expect(cancel(a.manage_token, a.id)).rejects.toThrow(/CANNOT_CANCEL/)
  })

  it('a token never reaches another number or another clinic', async () => {
    const c = await clinic('cross')
    const other = await clinic('cross2')
    const mine = await visit(c, '201000000007', 48)
    const theirs = await visit(c, '201000000008', 48)
    const elsewhere = await visit(other, '201000000007', 48)
    await expect(cancel(mine.manage_token, theirs.id)).rejects.toThrow(/NOT_FOUND/)
    await expect(cancel(mine.manage_token, elsewhere.id)).rejects.toThrow(/NOT_FOUND/)
    expect((await one('SELECT status FROM appointments WHERE id = $1', [theirs.id])).status).toBe('confirmed')
  })

  it('times are the clinic\'s local time', async () => {
    // 2 hours ahead in Riyadh is 1 hour ahead in Cairo; with "any time" both can cancel,
    // and an appointment one hour in the past there can't.
    const c = await clinic('ksa', { country: 'SA' })
    const ahead = await visit(c, '201000000009', 2, { tz: 'Asia/Riyadh' })
    const behind = await visit(c, '201000000009', -1, { tz: 'Asia/Riyadh' })
    const p = await portal(ahead.manage_token)
    expect(p.upcoming.find(x => x.id === ahead.id).can_cancel).toBe(true)
    const b = p.upcoming.find(x => x.id === behind.id)
    if (b) expect(b.can_cancel).toBe(false) // still "today" there, but already started
  })

  it('visitors cannot read appointments or the helper directly', async () => {
    const seen = await as('anon', null, tx => tx.query('SELECT manage_token FROM appointments'))
    expect(seen.rows).toHaveLength(0)
    await expect(as('anon', null, tx => tx.query('SELECT patient_can_cancel(a, b) FROM appointments a, businesses b LIMIT 1'))).rejects.toThrow(/permission denied/)
  })
})
