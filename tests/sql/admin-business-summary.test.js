import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { bootDatabase } from '../local-backend/schema.mjs'

// 052: one clinic's last 30 days in numbers. Counts only, service role only.

let db
const one = async (sql, params) => (await db.query(sql, params)).rows[0]

async function as(role, userId, fn) {
  return db.transaction(async (tx) => {
    await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId || ''])
    await tx.exec(`SET LOCAL ROLE ${role}`)
    return fn(tx)
  })
}

async function clinic(tag) {
  const user = await one(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [`${tag}-${Math.random()}@t.local`])
  const biz = await one(`INSERT INTO businesses (owner_id, name, type) VALUES ($1, $2, 'clinic') RETURNING id`, [user.id, `عيادة ${tag}`])
  const branch = await one(`INSERT INTO branches (business_id, name, is_main, capacity) VALUES ($1,'ف',true,20) RETURNING id`, [biz.id])
  return { userId: user.id, bizId: biz.id, branchId: branch.id }
}

let slot = 0
async function visit(c, phone, dayOffset, { status = 'completed', reminder = false, online = false, reviewed = false } = {}) {
  slot++
  await db.query(
    `INSERT INTO appointments (business_id, branch_id, client_name, client_phone, appointment_date, appointment_time, status, reminder_sent, booking_ip_hash, review_requested_at)
     VALUES ($1, $2, 'عميل', $3, current_date + $4::int, make_time(8 + $5 % 12, 0, 0), $6, $7, $8, $9)`,
    [c.bizId, c.branchId, phone, dayOffset, slot, status, reminder, online ? 'hash' : null, reviewed ? new Date().toISOString() : null])
}

const summaryOf = async (bizId) =>
  (await as('service_role', null, tx => tx.query('SELECT * FROM admin_business_summary($1)', [bizId]))).rows[0]

beforeAll(async () => { db = await bootDatabase() }, 120000)
afterAll(async () => { await db?.close() })

describe('052 admin business summary', () => {
  it('counts the last 30 days by outcome, source and patient', async () => {
    const c = await clinic('busy')
    const other = await clinic('other')
    await visit(c, '201000000001', -100) // an old patient's first visit, before the period
    await visit(c, '201000000001', -5, { reminder: true, online: true, reviewed: true })
    await visit(c, '201000000002', -3, { status: 'no_show', reminder: true })
    await visit(c, '201000000003', -2, { online: true })
    await visit(c, '201000000003', -1, { status: 'cancelled' })
    await visit(c, '201000000004', -40)
    await visit(c, '201000000005', 0, { status: 'waitlist' })
    await visit(c, '201000000006', 5, { status: 'confirmed' }) // after today, outside the period
    await visit(other, '201000000009', -1)

    const s = await summaryOf(c.bizId)
    expect(s).toMatchObject({
      appointments: 4, completed: 2, no_shows: 1, cancelled: 1, online_bookings: 2,
      reminders_sent: 2, patients: 3, new_patients: 2, review_requests: 1,
    })
    expect(new Date(s.period_end).getTime() - new Date(s.period_start).getTime()).toBe(29 * 86400000)
  })

  it('a clinic with nothing still gets a row of zeros', async () => {
    const c = await clinic('empty')
    expect(await summaryOf(c.bizId)).toMatchObject({ appointments: 0, patients: 0, new_patients: 0 })
  })

  it('returns no patient details, and visitors and owners cannot call it', async () => {
    const c = await clinic('locked')
    expect(Object.keys(await summaryOf(c.bizId)).sort()).toEqual([
      'appointments', 'cancelled', 'completed', 'new_patients', 'no_shows', 'online_bookings',
      'patients', 'period_end', 'period_start', 'reminders_sent', 'review_requests',
    ])
    await expect(as('anon', null, tx => tx.query('SELECT * FROM admin_business_summary($1)', [c.bizId]))).rejects.toThrow(/permission denied/)
    await expect(as('authenticated', c.userId, tx => tx.query('SELECT * FROM admin_business_summary($1)', [c.bizId]))).rejects.toThrow(/permission denied/)
  })
})
