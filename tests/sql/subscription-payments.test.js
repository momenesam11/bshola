import { describe, it, expect } from 'vitest'
import { freshDb, readSql, as, createUser, createBusiness, one } from './harness.js'

const MIGRATION = 'supabase/migrations/048_subscription_payments.sql'
const ROLLBACK = 'supabase/rollbacks/048_subscription_payments_down.sql'

async function setup() {
  const db = await freshDb()
  await db.exec(readSql(MIGRATION))
  const uid = await createUser(db, 'owner@x.com')
  const biz = await createBusiness(db, uid, { owner_phone: '201000000000' })
  return { db, uid, biz }
}

describe('048 subscription payments', () => {
  it('stores a payment with both details optional', async () => {
    const { db, biz } = await setup()
    await db.query('INSERT INTO subscription_payments (business_id, days, amount, method) VALUES ($1, 35, 999, $2)', [biz.id, 'فودافون كاش'])
    await db.query('INSERT INTO subscription_payments (business_id, days) VALUES ($1, 60)', [biz.id])
    const row = await one(db, 'SELECT count(*)::int AS n FROM subscription_payments WHERE business_id = $1', [biz.id])
    expect(row.n).toBe(2)
  })

  it('refuses a negative amount and a period of zero days', async () => {
    const { db, biz } = await setup()
    await expect(db.query('INSERT INTO subscription_payments (business_id, days, amount) VALUES ($1, 30, -1)', [biz.id])).rejects.toThrow(/check/i)
    await expect(db.query('INSERT INTO subscription_payments (business_id, days) VALUES ($1, 0)', [biz.id])).rejects.toThrow(/check/i)
  })

  it('is closed to visitors and to the clinic itself', async () => {
    const { db, uid } = await setup()
    await expect(as(db, 'anon', (tx) => tx.query('SELECT * FROM subscription_payments'))).rejects.toThrow(/permission denied/)
    await expect(as(db, 'authenticated', (tx) => tx.query('SELECT * FROM subscription_payments'), uid)).rejects.toThrow(/permission denied/)
  })

  it('rolls back cleanly', async () => {
    const { db } = await setup()
    await db.exec(readSql(ROLLBACK))
    const row = await one(db, `SELECT to_regclass('public.subscription_payments') AS t`)
    expect(row.t).toBeNull()
  })
})
