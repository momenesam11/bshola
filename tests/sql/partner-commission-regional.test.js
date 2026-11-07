import { describe, it, expect } from 'vitest'
import { freshDb, readSql, as, createUser, createBusiness, one } from './harness.js'
import { getPricing } from '../../src/lib/pricing.js'

const MIGRATION = 'supabase/migrations/044_partner_commission_regional.sql'
const ROLLBACK = 'supabase/rollbacks/044_partner_commission_regional_down.sql'

async function setup() {
  const db = await freshDb()
  await db.exec(`ALTER TABLE businesses
    ADD COLUMN country text NOT NULL DEFAULT 'EG',
    ADD COLUMN currency text NOT NULL DEFAULT 'EGP';`)
  await db.exec(readSql(MIGRATION))
  return db
}

async function paidClinic(db, { country, ownerPhone, days = 90, pct = 20, bonus = 150 }) {
  const partner = await one(db, `INSERT INTO growth_partners (name, signup_bonus_egp, commission_pct) VALUES ('شريك', $1, $2) RETURNING *`, [bonus, pct])
  const uid = await createUser(db, `${ownerPhone}@x.com`)
  const biz = await createBusiness(db, uid, { owner_phone: ownerPhone, country })
  await as(db, 'authenticated', (tx) => tx.query('SELECT growth_attribute_signup($1)', [partner.ref_code]), uid)
  await db.query(`UPDATE businesses SET subscription_type = 'paid', activated_at = now(), trial_ends_at = now() + ($2 || ' days')::interval WHERE id = $1`, [biz.id, days])
  await one(db, 'SELECT growth_sync_platform()')
  const lead = await one(db, 'SELECT id FROM growth_leads WHERE business_id = $1', [biz.id])
  const rows = (await db.query('SELECT kind, amount_egp::float AS amount, basis FROM growth_commissions WHERE lead_id = $1', [lead.id])).rows
  return Object.fromEntries(rows.map((r) => [r.kind, r]))
}

describe('044 partner commission outside Egypt', () => {
  it('leaves an Egyptian clinic exactly as before', async () => {
    const db = await setup()
    const c = await paidClinic(db, { country: 'EG', ownerPhone: '201000000001' })
    expect(c.subscription.amount).toBe(149.8)
    expect(c.subscription.basis).toBe('20.00% من باقة 3 شهر (749 جنيه)')
    expect(c.signup_bonus.amount).toBe(150)
  })

  it('pays a Gulf clinic the same percentage of its own price in pounds', async () => {
    const db = await setup()
    const sa = await paidClinic(db, { country: 'SA', ownerPhone: '966500000001' })
    expect(sa.subscription.amount).toBe(660)
    expect(sa.subscription.basis).toContain('3300')
    expect(sa.subscription.basis).toContain('SA')
    expect(sa.signup_bonus.amount).toBe(150)

    const kw = await paidClinic(db, { country: 'KW', ownerPhone: '96550000001', days: 180 })
    expect(kw.subscription.amount).toBe(1040)
    const ae = await paidClinic(db, { country: 'AE', ownerPhone: '971500000001', days: 30 })
    expect(ae.subscription.amount).toBe(270)
  })

  it('uses the dollar list for the other Arab countries', async () => {
    const db = await setup()
    const lb = await paidClinic(db, { country: 'LB', ownerPhone: '96170000001', days: 30 })
    expect(lb.subscription.amount).toBe(190)
  })

  it('has an amount for every country and plan on the price list', async () => {
    const db = await setup()
    const { regional_plan_prices: prices } = await one(db, 'SELECT regional_plan_prices FROM growth_settings WHERE id = 1')
    for (const code of ['SA', 'AE', 'QA', 'KW', 'BH', 'OM', 'JO', 'MA', 'TN']) {
      expect(getPricing(code).isEgypt).toBe(false)
      expect(Object.keys(prices[code])).toEqual(['1', '3', '6'])
    }
    expect(Object.keys(prices.OTHER)).toEqual(['1', '3', '6'])
  })

  it('can run twice, and the rollback returns to Egyptian prices', async () => {
    const db = await setup()
    await db.exec(readSql(MIGRATION))
    await db.exec(readSql(ROLLBACK))
    const sa = await paidClinic(db, { country: 'SA', ownerPhone: '966500000002' })
    expect(sa.subscription.amount).toBe(149.8)
    await expect(db.query('SELECT regional_plan_prices FROM growth_settings')).rejects.toThrow()
  })
})
