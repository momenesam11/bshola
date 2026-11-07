import { describe, it, expect } from 'vitest'
import { freshDb, readSql, as, createUser, createBusiness, one } from './harness.js'

const MIGRATION = 'supabase/migrations/043_business_country_currency.sql'
const ROLLBACK = 'supabase/rollbacks/043_business_country_currency_down.sql'

async function setup() {
  const db = await freshDb({ migrate: false })
  await db.exec(`
    ALTER TABLE businesses
      ADD COLUMN working_hours jsonb, ADD COLUMN slot_duration int DEFAULT 30,
      ADD COLUMN logo_url text, ADD COLUMN cover_url text, ADD COLUMN brand_color text,
      ADD COLUMN bio text, ADD COLUMN years_experience int, ADD COLUMN welcome_message text,
      ADD COLUMN cancellation_policy text, ADD COLUMN instagram_url text, ADD COLUMN facebook_url text,
      ADD COLUMN google_reviews_url text, ADD COLUMN public_phone text;
  `)
  const owner = await createUser(db, 'owner@test.local')
  return { db, owner }
}

describe('043 business country and currency', () => {
  it('keeps existing accounts on Egypt and the pound', async () => {
    const { db, owner } = await setup()
    const before = await createBusiness(db, owner, { booking_slug: 'old-clinic' })
    await db.exec(readSql(MIGRATION))
    const row = await one(db, 'SELECT country, currency FROM businesses WHERE id = $1', [before.id])
    expect(row).toEqual({ country: 'EG', currency: 'EGP' })
  })

  it('shows the booking page the currency, and still hides the owner phone', async () => {
    const { db, owner } = await setup()
    await db.exec(readSql(MIGRATION))
    await createBusiness(db, owner, { booking_slug: 'riyadh', country: 'SA', currency: 'SAR', owner_phone: '966500000000' })
    const { rows } = await as(db, 'anon', (tx) => tx.query(`SELECT * FROM public_business_profile('riyadh')`))
    expect(rows[0].country).toBe('SA')
    expect(rows[0].currency).toBe('SAR')
    expect(rows[0].is_locked).toBe(false)
    expect(rows[0]).not.toHaveProperty('owner_phone')
  })

  it('refuses a malformed country or currency', async () => {
    const { db, owner } = await setup()
    await db.exec(readSql(MIGRATION))
    await expect(createBusiness(db, owner, { country: 'saudi' })).rejects.toThrow()
    await expect(createBusiness(db, owner, { currency: 'ريال' })).rejects.toThrow()
  })

  it('can run twice, and the rollback restores the old function', async () => {
    const { db, owner } = await setup()
    await db.exec(readSql(MIGRATION))
    await db.exec(readSql(MIGRATION))
    await createBusiness(db, owner, { booking_slug: 'back' })
    await db.exec(readSql(ROLLBACK))
    const { rows } = await as(db, 'anon', (tx) => tx.query(`SELECT * FROM public_business_profile('back')`))
    expect(rows[0].booking_slug).toBe('back')
    expect(rows[0]).not.toHaveProperty('currency')
    await expect(db.query('SELECT country FROM businesses')).rejects.toThrow()
  })
})
