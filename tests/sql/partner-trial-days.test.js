import { describe, it, expect } from 'vitest'
import { freshDb, readSql, as, createUser, createBusiness, one } from './harness.js'

const MIGRATION = 'supabase/migrations/067_partner_trial_days.sql'
const ROLLBACK = 'supabase/rollbacks/067_partner_trial_days_down.sql'

async function setup() {
  const db = await freshDb()
  await db.exec(readSql(MIGRATION))
  return db
}

let n = 0
/** Signs up a clinic with a ref code (as Register.jsx saves it) and finishes onboarding. */
async function signUp(db, ref, { attribute = true } = {}) {
  n += 1
  const uid = await createUser(db, `c${n}@x.com`, null, ref ? { ref } : {})
  const biz = await createBusiness(db, uid, { owner_phone: `2010000${String(n).padStart(5, '0')}` })
  if (attribute) await as(db, 'authenticated', (tx) => tx.query('SELECT growth_attribute_signup($1)', [null]), uid)
  return { uid, biz }
}

/** Days between trial start and end, rounded. */
const trialDays = async (db, id) =>
  Number((await one(db, `SELECT round(extract(epoch FROM trial_ends_at - trial_started_at) / 86400) AS d FROM businesses WHERE id = $1`, [id])).d)

const partner = (db, fields = '') =>
  one(db, `INSERT INTO growth_partners (name, commission_pct${fields ? ', trial_days' : ''}) VALUES ('شريكة', 20${fields ? `, ${fields}` : ''}) RETURNING *`)

const createLink = (db, token, label, days, role = 'anon') =>
  as(db, role, async (tx) => (await tx.query('SELECT growth_partner_create_link($1, $2, $3) AS r', [token, label, days])).rows[0].r)

describe('067 partner trial days', () => {
  it('keeps 14 days when the partner has no trial set', async () => {
    const db = await setup()
    const p = await partner(db)
    const { biz } = await signUp(db, p.ref_code)
    expect(await trialDays(db, biz.id)).toBe(14)
    expect((await one(db, 'SELECT partner_id FROM growth_leads WHERE business_id = $1', [biz.id])).partner_id).toBe(p.id)
  })

  it("gives the partner's own link the trial the owner set", async () => {
    const db = await setup()
    const p = await partner(db, '2')
    const { biz } = await signUp(db, p.ref_code)
    expect(await trialDays(db, biz.id)).toBe(2)
    const log = await one(db, `SELECT body FROM growth_activities a JOIN growth_leads l ON l.id = a.lead_id
      WHERE l.business_id = $1 AND a.meta ? 'trial_days'`, [biz.id])
    expect(log.body).toContain('2 يوم')
  })

  it('lets the partner make a client link with its own trial, credited to them', async () => {
    const db = await setup()
    const p = await partner(db, '7')
    const link = await createLink(db, p.access_token, 'د. منى', 0)
    expect(link.ok).toBe(true)
    expect(link.code).toMatch(/^T-[A-Z0-9]{8}$/)

    const { biz } = await signUp(db, link.code)
    const b = await one(db, 'SELECT trial_ends_at <= now() AS locked FROM businesses WHERE id = $1', [biz.id])
    expect(b.locked).toBe(true)
    const lead = await one(db, 'SELECT partner_id, source FROM growth_leads WHERE business_id = $1', [biz.id])
    expect(lead).toEqual({ partner_id: p.id, source: 'partner' })

    const trial = await as(db, 'anon', async (tx) => (await tx.query('SELECT growth_partner_trial($1) AS r', [p.access_token])).rows[0].r)
    expect(trial.trial_days).toBe(7)
    expect(trial.links).toHaveLength(1)
    expect(trial.links[0]).toMatchObject({ code: link.code, label: 'د. منى', trial_days: 0, signed_up: 1 })
  })

  it('reads a lowercase code the same', async () => {
    const db = await setup()
    const p = await partner(db)
    const link = await createLink(db, p.access_token, null, 3)
    const { biz } = await signUp(db, link.code.toLowerCase())
    expect(await trialDays(db, biz.id)).toBe(3)
  })

  it('applies only once: a repeat call or a later admin extension is left alone', async () => {
    const db = await setup()
    const p = await partner(db, '2')
    const { uid, biz } = await signUp(db, p.ref_code)
    await db.query(`UPDATE businesses SET trial_ends_at = trial_started_at + interval '10 days' WHERE id = $1`, [biz.id])
    const zero = await createLink(db, p.access_token, null, 0)
    await as(db, 'authenticated', (tx) => tx.query('SELECT growth_attribute_signup($1)', [zero.code]), uid)
    expect(await trialDays(db, biz.id)).toBe(10)
  })

  it('never lengthens a trial and never touches an activated account', async () => {
    const db = await setup()
    const p = await partner(db, '5')
    const { uid, biz } = await signUp(db, p.ref_code, { attribute: false })
    await db.query(`UPDATE businesses SET subscription_type = 'paid', activated_at = now(), trial_ends_at = now() + interval '30 days' WHERE id = $1`, [biz.id])
    await as(db, 'authenticated', (tx) => tx.query('SELECT growth_attribute_signup($1)', [null]), uid)
    expect(await trialDays(db, biz.id)).toBe(30)
  })

  it('also applies when the nightly sync attributes an unfinished onboarding', async () => {
    const db = await setup()
    const p = await partner(db, '1')
    const { biz } = await signUp(db, p.ref_code, { attribute: false })
    await one(db, 'SELECT growth_sync_platform()')
    expect(await trialDays(db, biz.id)).toBe(1)
  })

  it("ignores a stopped partner's links", async () => {
    const db = await setup()
    const p = await partner(db, '2')
    const link = await createLink(db, p.access_token, null, 0)
    await db.query('UPDATE growth_partners SET active = false WHERE id = $1', [p.id])
    expect((await createLink(db, p.access_token, null, 2)).error).toBe('inactive')
    const { biz } = await signUp(db, link.code)
    expect(await trialDays(db, biz.id)).toBe(14)
    expect((await one(db, 'SELECT partner_id FROM growth_leads WHERE business_id = $1', [biz.id])).partner_id).toBeNull()
  })

  it('validates the token, the days and the daily limit', async () => {
    const db = await setup()
    const p = await partner(db)
    expect((await createLink(db, '00000000-0000-0000-0000-000000000000', null, 2)).error).toBe('not_found')
    expect((await createLink(db, p.access_token, null, 15)).error).toBe('bad_days')
    expect((await createLink(db, p.access_token, null, -1)).error).toBe('bad_days')
    for (let i = 0; i < 30; i++) await createLink(db, p.access_token, null, 2)
    expect((await createLink(db, p.access_token, null, 2)).error).toBe('too_many')
  })

  it('tells anyone only the number of days, and hides the links table', async () => {
    const db = await setup()
    const p = await partner(db, '2')
    const link = await createLink(db, p.access_token, 'سر', 0)
    const days = (code) => as(db, 'anon', async (tx) => (await tx.query('SELECT growth_ref_trial_days($1) AS d', [code])).rows[0].d)
    expect(await days(p.ref_code)).toBe(2)
    expect(await days(link.code)).toBe(0)
    expect(await days('T-NOTREAL1')).toBeNull()
    expect(await days('R-some-clinic')).toBeNull()
    await expect(as(db, 'anon', (tx) => tx.query('SELECT * FROM growth_partner_links'))).rejects.toThrow(/permission denied/)
    await expect(as(db, 'authenticated', (tx) => tx.query('SELECT * FROM growth_partner_links'))).rejects.toThrow(/permission denied/)
  })

  it('rolls back cleanly to the 035 behaviour', async () => {
    const db = await setup()
    const p = await partner(db, '2')
    await db.exec(readSql(ROLLBACK))
    const { biz } = await signUp(db, p.ref_code)
    expect(await trialDays(db, biz.id)).toBe(14)
    expect((await one(db, `SELECT to_regclass('growth_partner_links') AS t`)).t).toBeNull()
  })
})
