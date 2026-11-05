import { describe, it, expect } from 'vitest'
import { freshDb, readSql, as, createUser, createBusiness, one } from './harness.js'

const attribute = (db, uid) => as(db, 'authenticated', (tx) => tx.query('SELECT growth_attribute_signup(NULL)'), uid)

describe('035: a signed-up clinic shows under its own name', () => {
  it('renames a phone-matched list entry to the business name and logs the old one', async () => {
    const db = await freshDb()
    const lead = await one(db, `INSERT INTO growth_leads (name, phone, source) VALUES ('عيادة تجربة', '201000000077', 'manual') RETURNING id`)
    const uid = await createUser(db, 'x@x.com')
    await createBusiness(db, uid, { name: 'عيادة الأمل', owner_phone: '01000000077' })
    await attribute(db, uid)
    expect((await one(db, 'SELECT name FROM growth_leads WHERE id = $1', [lead.id])).name).toBe('عيادة الأمل')
    const act = await one(db, `SELECT body FROM growth_activities WHERE lead_id = $1 AND kind = 'system'`, [lead.id])
    expect(act.body).toContain('عيادة تجربة')
  })

  it('never pulls in an entry already linked to another business', async () => {
    const db = await freshDb()
    const u1 = await createUser(db, 'one@x.com')
    const b1 = await createBusiness(db, u1, { name: 'العيادة الأولى', owner_phone: '01000000088' })
    await attribute(db, u1)
    const u2 = await createUser(db, 'two@x.com')
    const b2 = await createBusiness(db, u2, { name: 'العيادة التانية', owner_phone: '01000000088' })
    await attribute(db, u2)
    expect((await one(db, 'SELECT name FROM growth_leads WHERE business_id = $1', [b1.id])).name).toBe('العيادة الأولى')
    expect((await one(db, 'SELECT name FROM growth_leads WHERE business_id = $1', [b2.id])).name).toBe('العيادة التانية')
    await one(db, 'SELECT growth_sync_platform()')
    expect((await one(db, 'SELECT count(*)::int AS c FROM growth_leads')).c).toBe(2)
  })

  it('sync also names a newly linked entry after the business', async () => {
    const db = await freshDb()
    await db.query(`INSERT INTO growth_leads (name, phone, source) VALUES ('من الخريطة', '201000000099', 'google_maps_manual')`)
    const uid = await createUser(db, 'y@x.com')
    const biz = await createBusiness(db, uid, { name: 'مركز النور', owner_phone: '01000000099' })
    await one(db, 'SELECT growth_sync_platform()')
    expect((await one(db, 'SELECT name FROM growth_leads WHERE business_id = $1', [biz.id])).name).toBe('مركز النور')
  })

  it('fixes names of entries linked before 035', async () => {
    const db = await freshDb({ migrate: '034' })
    const uid = await createUser(db, 'z@x.com')
    const biz = await createBusiness(db, uid, { name: 'الاسم الحقيقي' })
    await db.query(`INSERT INTO growth_leads (name, source, business_id) VALUES ('اسم قديم', 'manual', $1)`, [biz.id])
    await db.exec(readSql('supabase/migrations/035_growth_business_name.sql'))
    expect((await one(db, 'SELECT name FROM growth_leads WHERE business_id = $1', [biz.id])).name).toBe('الاسم الحقيقي')
  })

  it('rolls back to the 034 functions', async () => {
    const db = await freshDb()
    await db.exec(readSql('supabase/rollbacks/035_growth_business_name_down.sql'))
    expect((await one(db, 'SELECT growth_sync_platform() AS r')).r).toEqual({ created: 0, updated: 0, signup_incomplete: 0, qualified: 0 })
  })
})

describe('036: auto-discovery settings', () => {
  it('adds off-by-default settings with dental + derma and 16 areas, and rolls back', async () => {
    const db = await freshDb()
    const s = await one(db, 'SELECT * FROM growth_settings WHERE id = 1')
    expect(s).toMatchObject({ auto_discover_enabled: false, auto_discover_categories: ['dental', 'derma'], auto_discover_per_day: 4, auto_discover_cursor: 0 })
    expect(s.auto_discover_areas).toHaveLength(16)
    await expect(db.query('UPDATE growth_settings SET auto_discover_per_day = 0')).rejects.toThrow()
    await db.exec(readSql('supabase/rollbacks/036_growth_auto_discover_down.sql'))
    expect((await one(db, `SELECT count(*)::int AS c FROM information_schema.columns WHERE table_name = 'growth_settings' AND column_name LIKE 'auto_discover%'`)).c).toBe(0)
  })
})

describe('037: OpenStreetMap source', () => {
  it('imports as openstreetmap, backfills old OSM rows, and rolls back', async () => {
    const db = await freshDb({ migrate: '036' })
    await db.query(`INSERT INTO growth_leads (name, source, source_detail) VALUES ('قديمة', 'import', 'OpenStreetMap'), ('شيت', 'import', NULL)`)
    await db.exec(readSql('supabase/migrations/037_growth_osm_source.sql'))
    expect((await db.query(`SELECT name, source FROM growth_leads ORDER BY name`)).rows).toEqual([
      { name: 'شيت', source: 'import' },
      { name: 'قديمة', source: 'openstreetmap' },
    ])
    const r = (await one(db, `SELECT growth_import_leads('[{"name":"عيادة من الخريطة","phone":"01012345670"}]'::jsonb, 'openstreetmap') AS r`)).r
    expect(r.inserted).toBe(1)
    expect((await one(db, `SELECT source FROM growth_leads WHERE name = 'عيادة من الخريطة'`)).source).toBe('openstreetmap')

    await db.exec(readSql('supabase/rollbacks/037_growth_osm_source_down.sql'))
    expect((await one(db, `SELECT count(*)::int AS c FROM growth_leads WHERE source = 'openstreetmap'`)).c).toBe(0)
    await expect(db.query(`UPDATE growth_leads SET source = 'openstreetmap'`)).rejects.toThrow()
  })
})
