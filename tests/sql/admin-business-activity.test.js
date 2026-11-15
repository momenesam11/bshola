import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { bootDatabase } from '../local-backend/schema.mjs'

// 050: per-clinic usage counts for /admin. Counts only, service role only.

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
  const branch = await one(`INSERT INTO branches (business_id, name, is_main, capacity) VALUES ($1,'ف',true,5) RETURNING id`, [biz.id])
  return { userId: user.id, bizId: biz.id, branchId: branch.id }
}

let slot = 0
async function visit(c, { dayOffset, createdDaysAgo = 0, status = 'confirmed', reminder = false }) {
  slot++
  await db.query(
    `INSERT INTO appointments (business_id, branch_id, client_name, client_phone, appointment_date, appointment_time, status, reminder_sent, created_at)
     VALUES ($1, $2, 'عميل', '201000000000', current_date + $3::int, make_time(8 + $4 % 12, 0, 0), $5, $6, now() - make_interval(days => $7))`,
    [c.bizId, c.branchId, dayOffset, slot, status, reminder, createdDaysAgo])
}

const activityOf = async (bizId) =>
  (await as('service_role', null, tx => tx.query('SELECT * FROM admin_business_activity() WHERE business_id = $1', [bizId]))).rows[0]

beforeAll(async () => { db = await bootDatabase() }, 120000)
afterAll(async () => { await db?.close() })

describe('050 admin business activity', () => {
  it('counts recent bookings, visits and reminders, leaving out the waitlist and older visits', async () => {
    const c = await clinic('busy')
    await visit(c, { dayOffset: -3, createdDaysAgo: 10, reminder: true })
    await visit(c, { dayOffset: -5, createdDaysAgo: 5, reminder: false })
    await visit(c, { dayOffset: -40, createdDaysAgo: 45, reminder: true })
    await visit(c, { dayOffset: 2, createdDaysAgo: 2 })
    await visit(c, { dayOffset: 6, createdDaysAgo: 1, status: 'waitlist' })

    const a = await activityOf(c.bizId)
    expect(a.bookings_30d).toBe(4)
    expect(a.visits_30d).toBe(2)
    expect(a.reminders_30d).toBe(1)
    const daysSince = (Date.now() - new Date(a.last_booking_at).getTime()) / 86400000
    expect(daysSince).toBeGreaterThan(0.9)
    expect(daysSince).toBeLessThan(1.1)
  })

  it('a clinic with no appointments has no row', async () => {
    const c = await clinic('empty')
    expect(await activityOf(c.bizId)).toBeUndefined()
  })

  it('returns no patient details', async () => {
    const c = await clinic('cols')
    await visit(c, { dayOffset: -1 })
    expect(Object.keys(await activityOf(c.bizId)).sort())
      .toEqual(['bookings_30d', 'business_id', 'last_booking_at', 'reminders_30d', 'visits_30d'])
  })

  it('visitors and clinic owners cannot call it', async () => {
    const c = await clinic('owner')
    await expect(as('anon', null, tx => tx.query('SELECT * FROM admin_business_activity()'))).rejects.toThrow(/permission denied/)
    await expect(as('authenticated', c.userId, tx => tx.query('SELECT * FROM admin_business_activity()'))).rejects.toThrow(/permission denied/)
  })
})
