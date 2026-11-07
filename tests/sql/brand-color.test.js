import { describe, it, expect } from 'vitest'
import { freshDb, readSql, createUser, createBusiness, one } from './harness.js'

const OLD = '#10B981'
const NEW = '#0D9B6C'

async function setup() {
  const db = await freshDb({ migrate: false })
  await db.exec(`ALTER TABLE businesses ADD COLUMN brand_color text DEFAULT '${OLD}'`)
  const owner = await createUser(db, 'owner@test.local')
  const insert = async (color) => {
    const { id } = await createBusiness(db, owner)
    await db.query('UPDATE businesses SET brand_color = $1 WHERE id = $2', [color, id])
    return id
  }
  const colorOf = async (id) =>
    (await one(db, 'SELECT brand_color FROM businesses WHERE id = $1', [id])).brand_color
  return { db, owner, insert, colorOf }
}

describe('042 darker default green', () => {
  it('moves only the old green and leaves every other colour alone', async () => {
    const { db, insert, colorOf } = await setup()
    const upper = await insert(OLD)
    const lower = await insert(OLD.toLowerCase())
    const blue = await insert('#3B82F6')
    const none = await insert(null)

    await db.exec(readSql('supabase/migrations/042_darken_default_brand_green.sql'))

    expect(await colorOf(upper)).toBe(NEW)
    expect(await colorOf(lower)).toBe(NEW)
    expect(await colorOf(blue)).toBe('#3B82F6')
    expect(await colorOf(none)).toBeNull()
  })

  it('gives new accounts the darker green, can run twice, and rolls back', async () => {
    const { db, owner, insert, colorOf } = await setup()
    const green = await insert(OLD)
    const blue = await insert('#3B82F6')
    const migration = readSql('supabase/migrations/042_darken_default_brand_green.sql')

    await db.exec(migration)
    await db.exec(migration)
    const { id: fresh } = await createBusiness(db, owner)
    expect(await colorOf(fresh)).toBe(NEW)
    expect(await colorOf(green)).toBe(NEW)

    await db.exec(readSql('supabase/rollbacks/042_darken_default_brand_green_down.sql'))
    expect(await colorOf(green)).toBe(OLD)
    expect(await colorOf(blue)).toBe('#3B82F6')
    const { id: afterRollback } = await createBusiness(db, owner)
    expect(await colorOf(afterRollback)).toBe(OLD)
  })
})
