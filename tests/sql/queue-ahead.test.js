import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { bootDatabase } from '../local-backend/schema.mjs'

// 053: the "tell them when N are ahead" setting and the record of who was told.

let db
const one = async (sql, params) => (await db.query(sql, params)).rows[0]

async function as(role, userId, fn) {
  return db.transaction(async (tx) => {
    await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId || ''])
    await tx.exec(`SET LOCAL ROLE ${role}`)
    return fn(tx)
  })
}

beforeAll(async () => { db = await bootDatabase() }, 120000)
afterAll(async () => { await db?.close() })

describe('053 queue ahead', () => {
  it('existing clinics start at 3, and the owner can set 1 to 10 only', async () => {
    const user = await one(`INSERT INTO auth.users (email) VALUES ('q@t.local') RETURNING id`)
    const biz = await one(`INSERT INTO businesses (owner_id, name, type) VALUES ($1, 'عيادة', 'clinic') RETURNING id, queue_notify_ahead`, [user.id])
    expect(biz.queue_notify_ahead).toBe(3)
    await as('authenticated', user.id, tx => tx.query('UPDATE businesses SET queue_notify_ahead = 5 WHERE id = $1', [biz.id]))
    expect((await one('SELECT queue_notify_ahead n FROM businesses WHERE id = $1', [biz.id])).n).toBe(5)
    for (const bad of [0, 11]) {
      await expect(as('authenticated', user.id, tx => tx.query('UPDATE businesses SET queue_notify_ahead = $2 WHERE id = $1', [biz.id, bad])))
        .rejects.toThrow(/businesses_queue_notify_ahead_check/)
    }
  })

  it('the owner records that a patient was told their place', async () => {
    const user = await one(`INSERT INTO auth.users (email) VALUES ('q2@t.local') RETURNING id`)
    const biz = await one(`INSERT INTO businesses (owner_id, name, type) VALUES ($1, 'عيادة', 'clinic') RETURNING id`, [user.id])
    const branch = await one(`INSERT INTO branches (business_id, name, is_main, capacity) VALUES ($1,'ف',true,1) RETURNING id`, [biz.id])
    const appt = await one(`INSERT INTO appointments (business_id, branch_id, client_name, client_phone, appointment_date, appointment_time)
      VALUES ($1, $2, 'عميل', '201000000000', current_date, '10:00') RETURNING id, queue_notified_at`, [biz.id, branch.id])
    expect(appt.queue_notified_at).toBeNull()
    await as('authenticated', user.id, tx => tx.query('UPDATE appointments SET queue_notified_at = now() WHERE id = $1', [appt.id]))
    expect((await one('SELECT queue_notified_at t FROM appointments WHERE id = $1', [appt.id])).t).not.toBeNull()
  })
})
