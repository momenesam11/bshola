import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { bootDatabase } from '../local-backend/schema.mjs'

// 051: the clinic's Google review link and the record of who was asked.

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

describe('051 google review request', () => {
  it('the owner saves an https link, and anything else is refused', async () => {
    const user = await one(`INSERT INTO auth.users (email) VALUES ('rev@t.local') RETURNING id`)
    const biz = await one(`INSERT INTO businesses (owner_id, name, type) VALUES ($1, 'عيادة', 'clinic') RETURNING id`, [user.id])
    await as('authenticated', user.id, tx => tx.query(`UPDATE businesses SET google_review_url = 'https://g.page/r/x' WHERE id = $1`, [biz.id]))
    expect((await one('SELECT google_review_url u FROM businesses WHERE id = $1', [biz.id])).u).toBe('https://g.page/r/x')
    await expect(as('authenticated', user.id, tx => tx.query(`UPDATE businesses SET google_review_url = 'javascript:alert(1)' WHERE id = $1`, [biz.id])))
      .rejects.toThrow(/businesses_google_review_url_check/)
    await as('authenticated', user.id, tx => tx.query(`UPDATE businesses SET google_review_url = NULL WHERE id = $1`, [biz.id]))
  })

  it('an existing appointment starts as not asked, and the owner can mark it', async () => {
    const user = await one(`INSERT INTO auth.users (email) VALUES ('rev2@t.local') RETURNING id`)
    const biz = await one(`INSERT INTO businesses (owner_id, name, type) VALUES ($1, 'عيادة', 'clinic') RETURNING id`, [user.id])
    const branch = await one(`INSERT INTO branches (business_id, name, is_main, capacity) VALUES ($1,'ف',true,1) RETURNING id`, [biz.id])
    const appt = await one(`INSERT INTO appointments (business_id, branch_id, client_name, client_phone, appointment_date, appointment_time, status)
      VALUES ($1, $2, 'عميل', '201000000000', current_date, '10:00', 'completed') RETURNING id, review_requested_at`, [biz.id, branch.id])
    expect(appt.review_requested_at).toBeNull()
    await as('authenticated', user.id, tx => tx.query(`UPDATE appointments SET review_requested_at = now() WHERE id = $1`, [appt.id]))
    expect((await one('SELECT review_requested_at r FROM appointments WHERE id = $1', [appt.id])).r).not.toBeNull()
  })
})
