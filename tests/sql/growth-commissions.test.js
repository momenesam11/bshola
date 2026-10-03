import { describe, it, expect, beforeEach } from 'vitest'
import { freshDb, readSql, as, createUser, createBusiness, one } from './harness.js'

async function partnerLead(db, { bonus = 100, pct = 10, ownerPhone = '01000000001' } = {}) {
  const partner = await one(db, `INSERT INTO growth_partners (name, signup_bonus_egp, commission_pct) VALUES ('مندوب', $1, $2) RETURNING *`, [bonus, pct])
  const uid = await createUser(db, 'clinic@x.com')
  const biz = await createBusiness(db, uid, { owner_phone: ownerPhone })
  await as(db, 'authenticated', (tx) => tx.query('SELECT growth_attribute_signup($1)', [partner.ref_code]), uid)
  const lead = await one(db, 'SELECT * FROM growth_leads WHERE business_id = $1', [biz.id])
  return { partner, biz, lead, uid }
}

const book = (db, bizId, phones) =>
  db.query(`INSERT INTO appointments (business_id, client_phone) SELECT $1, unnest($2::text[])`, [bizId, phones])

describe('033 migration', () => {
  it('rolls back to the 032 state and re-applies', async () => {
    const db = await freshDb({ migrate: '033' })
    await db.exec(readSql('supabase/rollbacks/033_growth_commissions_down.sql'))
    expect((await one(db, `SELECT to_regclass('public.growth_commissions') AS t`)).t).toBeNull()
    const cols = (await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'growth_leads' AND column_name IN ('is_test','qualified_at')`)).rows
    expect(cols).toEqual([])
    // 032's sync still works after the rollback.
    expect((await one(db, 'SELECT growth_sync_platform() AS r')).r).toEqual({ created: 0, updated: 0, signup_incomplete: 0 })
    await db.exec(readSql('supabase/migrations/033_growth_commissions.sql'))
    expect((await one(db, `SELECT to_regclass('public.growth_commissions') AS t`)).t).toBe('growth_commissions')
  })
})

describe('real-clinic check (anti-fake)', () => {
  let db
  beforeEach(async () => { db = await freshDb() })

  it('qualifies only after enough bookings from enough real, distinct clients', async () => {
    const { biz, lead } = await partnerLead(db)
    // The owner booking themselves doesn't count; neither do repeats of one number.
    await book(db, biz.id, ['01000000001', '01000000001', '01100000001', '01100000001', '01100000001'])
    expect((await one(db, 'SELECT growth_qualify_check($1) AS c', [biz.id])).c).toMatchObject({ qualified: false, appointments: 3, clients: 1 })
    await one(db, 'SELECT growth_sync_platform()')
    expect((await one(db, 'SELECT qualified_at FROM growth_leads WHERE id = $1', [lead.id])).qualified_at).toBeNull()

    await book(db, biz.id, ['01100000002', '01100000003'])
    const r = (await one(db, 'SELECT growth_sync_platform() AS r')).r
    expect(r.qualified).toBe(1)
    const l = await one(db, 'SELECT qualified_at, qualified_by FROM growth_leads WHERE id = $1', [lead.id])
    expect(l.qualified_by).toBe('auto')
  })

  it('never qualifies a clinic whose owner number runs another account', async () => {
    const { biz } = await partnerLead(db)
    const other = await createUser(db, 'same-person@x.com')
    await createBusiness(db, other, { owner_phone: '+20 100 000 0001', name: 'حساب تاني' })
    await book(db, biz.id, ['01100000001', '01100000002', '01100000003', '01100000004', '01100000005'])
    expect((await one(db, 'SELECT growth_qualify_check($1) AS c', [biz.id])).c).toMatchObject({ qualified: false, shared_owner_phone: true })
  })

  it('the admin can qualify by hand', async () => {
    const { lead } = await partnerLead(db)
    await one(db, 'SELECT growth_qualify_lead($1, true)', [lead.id])
    expect(await one(db, 'SELECT qualified_by FROM growth_leads WHERE id = $1', [lead.id])).toEqual({ qualified_by: 'admin' })
  })
})

describe('partner commissions', () => {
  let db
  beforeEach(async () => { db = await freshDb() })

  it('owes the signup bonus only once the clinic is real, then a % of the first subscription', async () => {
    const { biz, lead, partner } = await partnerLead(db, { bonus: 150, pct: 20 })
    await one(db, 'SELECT growth_sync_platform()')
    expect((await one(db, 'SELECT count(*)::int AS c FROM growth_commissions')).c).toBe(0)

    await one(db, 'SELECT growth_qualify_lead($1, true)', [lead.id])
    const bonus = await one(db, `SELECT * FROM growth_commissions WHERE kind = 'signup_bonus'`)
    expect(bonus).toMatchObject({ partner_id: partner.id, status: 'pending' })
    expect(Number(bonus.amount_egp)).toBe(150)

    // Admin activates a 3-month plan (90 days) → 20% of 749.
    await db.query(`UPDATE businesses SET subscription_type = 'paid', activated_at = now(), trial_ends_at = now() + interval '90 days' WHERE id = $1`, [biz.id])
    await one(db, 'SELECT growth_sync_platform()')
    const sub = await one(db, `SELECT * FROM growth_commissions WHERE kind = 'subscription'`)
    expect(Number(sub.amount_egp)).toBe(149.8)
    expect(sub.basis).toContain('3 شهر')

    // Idempotent.
    await one(db, 'SELECT growth_sync_platform()')
    expect((await one(db, 'SELECT count(*)::int AS c FROM growth_commissions')).c).toBe(2)
  })

  it('pays nothing on test accounts', async () => {
    const { lead } = await partnerLead(db)
    await db.query('UPDATE growth_leads SET is_test = true WHERE id = $1', [lead.id])
    await one(db, 'SELECT growth_qualify_lead($1, true)', [lead.id])
    expect((await one(db, 'SELECT count(*)::int AS c FROM growth_commissions')).c).toBe(0)
  })

  it('moves through approved → paid', async () => {
    const { lead } = await partnerLead(db)
    await one(db, 'SELECT growth_qualify_lead($1, true)', [lead.id])
    const { id } = await one(db, 'SELECT id FROM growth_commissions')
    const a = await one(db, `SELECT * FROM growth_set_commission_status($1, 'approved')`, [id])
    expect(a.decided_at).not.toBeNull()
    const p = await one(db, `SELECT * FROM growth_set_commission_status($1, 'paid', 'كاش')`, [id])
    expect(p).toMatchObject({ status: 'paid', note: 'كاش' })
    await expect(db.query(`SELECT growth_set_commission_status($1, 'maybe')`, [id])).rejects.toThrow()
  })
})

describe('partner dashboard', () => {
  it('shows a partner only their own clinics and commissions, by secret token', async () => {
    const db = await freshDb()
    const { partner, lead } = await partnerLead(db)
    await one(db, 'SELECT growth_qualify_lead($1, true)', [lead.id])
    const other = await one(db, `INSERT INTO growth_partners (name) VALUES ('تاني') RETURNING *`)
    await db.query(`INSERT INTO growth_leads (name, source, partner_id) VALUES ('عيادة الشريك التاني', 'partner', $1)`, [other.id])

    const d = await as(db, 'anon', (tx) => tx.query('SELECT growth_partner_dashboard($1) AS d', [partner.access_token])).then((r) => r.rows[0].d)
    expect(d.partner).toMatchObject({ name: 'مندوب', ref_code: partner.ref_code })
    expect(d.clinics).toEqual([expect.objectContaining({ name: 'عيادة تجربة', status: 'qualified' })])
    expect(d.commissions).toHaveLength(1)
    expect(JSON.stringify(d)).not.toContain('01000000001')
    expect(JSON.stringify(d)).not.toContain('clinic@x.com')

    const nobody = await as(db, 'anon', (tx) => tx.query('SELECT growth_partner_dashboard(gen_random_uuid()) AS d')).then((r) => r.rows[0].d)
    expect(nobody).toBeNull()
  })

  it('anon cannot read commissions directly', async () => {
    const db = await freshDb()
    await expect(as(db, 'anon', (tx) => tx.query('SELECT * FROM growth_commissions'))).rejects.toThrow(/permission denied/)
    await expect(as(db, 'anon', (tx) => tx.query(`SELECT growth_qualify_lead(gen_random_uuid(), true)`))).rejects.toThrow(/permission denied/)
  })
})

describe('sync v2', () => {
  it('fills the phone of unfinished signups from their sign-up metadata', async () => {
    const db = await freshDb()
    await createUser(db, 'stuck@x.com', new Date(Date.now() - 3 * 3600e3).toISOString(), { owner_phone: '01234567890' })
    await one(db, 'SELECT growth_sync_platform()')
    expect(await one(db, `SELECT phone FROM growth_leads WHERE source = 'signup_incomplete'`)).toEqual({ phone: '201234567890' })
  })

  it('backfills phones for unfinished signups created before the metadata existed', async () => {
    const db = await freshDb()
    const uid = await createUser(db, 'old@x.com', new Date(Date.now() - 3 * 3600e3).toISOString())
    await db.query(`INSERT INTO growth_leads (name, source, owner_user_id) VALUES ('old@x.com', 'signup_incomplete', $1)`, [uid])
    await db.query(`UPDATE auth.users SET raw_user_meta_data = '{"owner_phone":"01011112222"}' WHERE id = $1`, [uid])
    await one(db, 'SELECT growth_sync_platform()')
    expect(await one(db, 'SELECT phone FROM growth_leads WHERE owner_user_id = $1', [uid])).toEqual({ phone: '201011112222' })
  })
})

describe('034: ref saved on the account at sign-up', () => {
  it('credits the partner even when onboarding never finished in the same browser', async () => {
    const db = await freshDb()
    const partner = await one(db, `INSERT INTO growth_partners (name) VALUES ('مندوب') RETURNING *`)
    const uid = await createUser(db, 'a@x.com', null, { ref: partner.ref_code, owner_phone: '01000000009' })
    const biz = await createBusiness(db, uid)
    // Browser lost the code: called with no ref at all.
    await as(db, 'authenticated', (tx) => tx.query('SELECT growth_attribute_signup(NULL)'), uid)
    expect(await one(db, 'SELECT source, partner_id FROM growth_leads WHERE business_id = $1', [biz.id])).toEqual({ source: 'partner', partner_id: partner.id })
  })

  it('nightly sync attributes a business that never called attribution', async () => {
    const db = await freshDb()
    const partner = await one(db, `INSERT INTO growth_partners (name) VALUES ('مندوب') RETURNING *`)
    const uid = await createUser(db, 'b@x.com', null, { ref: partner.ref_code })
    const biz = await createBusiness(db, uid)
    const r = (await one(db, 'SELECT growth_sync_platform() AS r')).r
    expect(r.created).toBe(1)
    expect(await one(db, 'SELECT source, partner_id, stage FROM growth_leads WHERE business_id = $1', [biz.id])).toEqual({ source: 'partner', partner_id: partner.id, stage: 'trial' })
    expect((await one(db, 'SELECT growth_sync_platform() AS r')).r.created).toBe(0)
  })

  it('credits unfinished sign-ups to their partner', async () => {
    const db = await freshDb()
    const partner = await one(db, `INSERT INTO growth_partners (name) VALUES ('مندوب') RETURNING *`)
    await createUser(db, 'c@x.com', new Date(Date.now() - 3 * 3600e3).toISOString(), { ref: partner.ref_code })
    await one(db, 'SELECT growth_sync_platform()')
    expect(await one(db, `SELECT partner_id FROM growth_leads WHERE source = 'signup_incomplete'`)).toEqual({ partner_id: partner.id })
  })

  it('rolls back to the 033 state', async () => {
    const db = await freshDb()
    await db.exec(readSql('supabase/rollbacks/034_growth_signup_ref_down.sql'))
    expect((await one(db, `SELECT to_regproc('growth_attribute_user') AS f`)).f).toBeNull()
    expect((await one(db, 'SELECT growth_sync_platform() AS r')).r).toEqual({ created: 0, updated: 0, signup_incomplete: 0, qualified: 0 })
  })
})
