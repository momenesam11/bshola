import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { bootDatabase } from '../local-backend/schema.mjs'

// 059: feature usage per clinic and platform numbers for /admin. Counts only,
// service role only.

let db
const one = async (sql, params) => (await db.query(sql, params)).rows[0]

async function as(role, fn) {
  return db.transaction(async (tx) => {
    await tx.exec(`SET LOCAL ROLE ${role}`)
    return fn(tx)
  })
}

async function clinic(tag, fields = {}) {
  const user = await one(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [`${tag}-${Math.random()}@t.local`])
  const biz = await one(`INSERT INTO businesses (owner_id, name, type, booking_mode, logo_url) VALUES ($1, $2, 'clinic', $3, $4) RETURNING id`,
    [user.id, `عيادة ${tag}`, fields.mode || 'time', fields.logo || null])
  await db.query('DELETE FROM branches WHERE business_id = $1', [biz.id])
  const branch = await one(`INSERT INTO branches (business_id, name, is_main, capacity, schedule_blocks, map_url) VALUES ($1,'ف',true,5,$2::jsonb,$3) RETURNING id`,
    [biz.id, JSON.stringify(fields.blocks || {}), fields.map || null])
  return { bizId: biz.id, branchId: branch.id }
}

let slot = 0
async function visit(c, extra = '') {
  slot++
  const { id } = await one(
    `INSERT INTO appointments (business_id, branch_id, client_name, client_phone, appointment_date, appointment_time, status)
     VALUES ($1, $2, 'عميل', '201000000000', current_date, make_time(8 + $3 % 12, $3 % 60, 0), 'confirmed') RETURNING id`,
    [c.bizId, c.branchId, slot])
  if (extra) await db.query(`UPDATE appointments SET ${extra} WHERE id = $1`, [id])
}

const usageOf = async (bizId) =>
  (await as('service_role', tx => tx.query('SELECT * FROM admin_feature_usage() WHERE business_id = $1', [bizId]))).rows[0]
const platform = async () => (await as('service_role', tx => tx.query('SELECT admin_platform_stats() s'))).rows[0].s

beforeAll(async () => { db = await bootDatabase() }, 120000)
afterAll(async () => { await db?.close() })

describe('059 admin insights', () => {
  it('counts each clinic\'s front desk and WhatsApp use, and what its setup is missing', async () => {
    const full = await clinic('full', { mode: 'queue', logo: 'https://x/logo.png', map: 'https://maps.app.goo.gl/x', blocks: { sun: [{ start: '10:00', end: '14:00' }] } })
    await db.query(`INSERT INTO services (business_id, name, duration_minutes, price) VALUES ($1,'كشف',15,100), ($1,'استشارة',10,50)`, [full.bizId])
    await visit(full, `called_at = now(), arrived_at = now(), queue_notified_at = now()`)
    await visit(full, `arrived_at = now()`)
    await visit(full, `status = 'completed', called_at = now() - interval '40 days'`)
    await visit(full)
    expect(await usageOf(full.bizId)).toMatchObject({
      booking_mode: 'queue', calls_30d: 1, arrivals_30d: 2, heads_up_30d: 1, services: 2, has_hours: true, has_logo: true, has_map: true,
    })

    const bare = await clinic('bare')
    await db.query(`UPDATE businesses SET working_hours = '{}'::jsonb WHERE id = $1`, [bare.bizId])
    expect(await usageOf(bare.bizId)).toMatchObject({
      booking_mode: 'time', calls_30d: 0, arrivals_30d: 0, heads_up_30d: 0, services: 0, has_hours: false, has_logo: false, has_map: false,
    })
  })

  it('adds up every clinic: today, the week, and 12 weeks of bookings and signups', async () => {
    const before = await platform()
    const c = await clinic('platform', { mode: 'queue' })
    await visit(c)
    await visit(c, `queue_notified_at = now()`)
    const after = await platform()
    expect(after.bookings_today - before.bookings_today).toBe(2)
    expect(after.bookings_7d - before.bookings_7d).toBe(2)
    expect(after.heads_up_7d - before.heads_up_7d).toBe(1)
    expect(after.active_clinics_7d - before.active_clinics_7d).toBe(1)
    expect(after.queue_clinics - before.queue_clinics).toBe(1)
    expect(after.weekly).toHaveLength(12)
    const last = after.weekly[11]
    expect(last.bookings - before.weekly[11].bookings).toBe(2)
    expect(last.signups - before.weekly[11].signups).toBe(1)
  })

  it('is closed to visitors and signed-in users', async () => {
    for (const role of ['anon', 'authenticated']) {
      await expect(as(role, tx => tx.query('SELECT * FROM admin_feature_usage()'))).rejects.toThrow(/permission denied/)
      await expect(as(role, tx => tx.query('SELECT admin_platform_stats()'))).rejects.toThrow(/permission denied/)
    }
  })
})
