import { describe, it, expect, beforeEach } from 'vitest'
import { freshDb, readSql, as, createUser, createBusiness, one } from './harness.js'

const rpc = async (db, sql, params) => (await db.query(sql, params)).rows[0]

describe('032_growth_engine migration', () => {
  it('applies, rolls back cleanly, and re-applies', async () => {
    const db = await freshDb()
    const tables = async () =>
      (await db.query(`SELECT tablename FROM pg_tables WHERE tablename LIKE 'growth_%' ORDER BY 1`)).rows.map((r) => r.tablename)
    expect(await tables()).toEqual(['growth_activities', 'growth_leads', 'growth_partners', 'growth_settings'])

    await db.exec(readSql('supabase/rollbacks/032_growth_engine_down.sql'))
    expect(await tables()).toEqual([])
    const fns = await db.query(`SELECT proname FROM pg_proc WHERE proname LIKE 'growth_%'`)
    expect(fns.rows).toEqual([])
    // The product tables are untouched by the rollback.
    expect((await db.query(`SELECT to_regclass('public.businesses') AS t`)).rows[0].t).toBe('businesses')

    await db.exec(readSql('supabase/migrations/032_growth_engine.sql'))
    expect(await tables()).toHaveLength(4)
  })

  it('normalises Egyptian phone numbers like the JS helper', async () => {
    const db = await freshDb()
    const n = async (raw) => (await one(db, 'SELECT growth_normalize_phone($1) AS p', [raw])).p
    expect(await n('01012345678')).toBe('201012345678')
    expect(await n('+20 101 234 5678')).toBe('201012345678')
    expect(await n('00201012345678')).toBe('201012345678')
    expect(await n('1012345678')).toBe('201012345678')
    expect(await n('0223456789')).toBe('20223456789')
    expect(await n('123')).toBeNull()
    expect(await n(null)).toBeNull()
  })
})

describe('access control', () => {
  let db
  beforeEach(async () => { db = await freshDb() })

  it('anon and authenticated cannot read or write growth tables', async () => {
    for (const role of ['anon', 'authenticated']) {
      await expect(as(db, role, (tx) => tx.query('SELECT * FROM growth_leads'))).rejects.toThrow(/permission denied/)
      await expect(as(db, role, (tx) => tx.query(`INSERT INTO growth_leads (name, source) VALUES ('x', 'manual')`)))
        .rejects.toThrow(/permission denied/)
    }
  })

  it('anon cannot call the service-role functions', async () => {
    for (const sql of [
      'SELECT growth_sync_platform()',
      `SELECT growth_import_leads('[]'::jsonb)`,
      'SELECT growth_take_places_quota()',
    ]) {
      await expect(as(db, 'anon', (tx) => tx.query(sql))).rejects.toThrow(/permission denied/)
    }
  })

  it('anon can submit the public form and read an enabled preview', async () => {
    const res = await as(db, 'anon', (tx) =>
      tx.query(`SELECT growth_submit_lead('د. منى', '01012345678', 'عيادة منى', 'dental', 'contact_form') AS r`))
    expect(res.rows[0].r).toEqual({ ok: true })
    const lead = await one(db, 'SELECT * FROM growth_leads')
    await db.query(`UPDATE growth_leads SET preview = '{"enabled":true,"services":[{"name":"كشف"}]}' WHERE id = $1`, [lead.id])
    const prev = await as(db, 'anon', (tx) => tx.query('SELECT growth_get_preview($1) AS p', [lead.ref_code.toLowerCase()]))
    expect(prev.rows[0].p).toMatchObject({ name: 'عيادة منى', category: 'dental', services: [{ name: 'كشف' }] })
  })
})

describe('growth_submit_lead', () => {
  let db
  beforeEach(async () => { db = await freshDb() })
  const submit = (phone, extra = {}) =>
    rpc(db, `SELECT growth_submit_lead($1, $2, $3, 'dental', $4, $5::jsonb, $6) AS r`, [
      extra.name ?? 'د. أحمد', phone, extra.business ?? 'عيادة النور', extra.source ?? 'contact_form',
      JSON.stringify(extra.details ?? {}), extra.ref ?? null,
    ]).then((x) => x.r)

  it('creates a lead in today’s queue with an evidence signal', async () => {
    expect(await submit('01112223334')).toEqual({ ok: true })
    const lead = await one(db, 'SELECT * FROM growth_leads')
    expect(lead).toMatchObject({ name: 'عيادة النور', contact_person: 'د. أحمد', phone: '201112223334', stage: 'new', source: 'contact_form' })
    expect(lead.next_follow_up_at).not.toBeNull()
    expect(lead.signals[0]).toMatchObject({ type: 'inbound_contact_form', kind: 'fact' })
    expect((await one(db, `SELECT count(*)::int AS c FROM growth_activities WHERE kind = 'inbound'`)).c).toBe(1)
  })

  it('treats a repeat within 10 minutes as a double submit', async () => {
    await submit('01112223334')
    await submit('01112223334')
    expect((await one(db, 'SELECT count(*)::int AS c FROM growth_leads')).c).toBe(1)
    expect((await one(db, 'SELECT count(*)::int AS c FROM growth_activities')).c).toBe(1)
  })

  it('merges into an existing lead with the same phone', async () => {
    await db.query(`INSERT INTO growth_leads (name, phone, source, stage) VALUES ('من الخريطة', '201112223334', 'google_maps_manual', 'contacted')`)
    await submit('+20 111 222 3334', { source: 'loss_calculator', details: { monthly_loss: 12000 } })
    const lead = await one(db, 'SELECT * FROM growth_leads')
    expect(lead).toMatchObject({ name: 'من الخريطة', source: 'google_maps_manual', stage: 'contacted' })
    expect(lead.inbound_at).not.toBeNull()
    const act = await one(db, 'SELECT meta FROM growth_activities')
    expect(act.meta.details).toEqual({ monthly_loss: 12000 })
  })

  it('rejects bad input', async () => {
    expect(await submit('123')).toMatchObject({ ok: false, error: 'invalid_phone' })
    expect(await submit('01112223334', { name: 'x' })).toMatchObject({ ok: false, error: 'invalid_name' })
    expect(await submit('01112223334', { source: 'partner' })).toMatchObject({ ok: false, error: 'invalid_source' })
    expect((await one(db, 'SELECT count(*)::int AS c FROM growth_leads')).c).toBe(0)
  })

  it('stops accepting after 60 inbound requests in an hour', async () => {
    const { id } = await one(db, `INSERT INTO growth_leads (name, source) VALUES ('x', 'manual') RETURNING id`)
    await db.query(`INSERT INTO growth_activities (lead_id, kind) SELECT $1, 'inbound' FROM generate_series(1, 60)`, [id])
    expect(await submit('01112223334')).toMatchObject({ ok: false, error: 'busy' })
  })

  it('attributes a partner ref code', async () => {
    const p = await one(db, `INSERT INTO growth_partners (name, ref_code) VALUES ('مندوب', 'P-AB12') RETURNING id`)
    await submit('01112223334', { ref: 'p-ab12' })
    expect((await one(db, 'SELECT partner_id FROM growth_leads')).partner_id).toBe(p.id)
  })
})

describe('growth_import_leads', () => {
  it('inserts new rows and skips duplicates by phone, place id, and name+area', async () => {
    const db = await freshDb()
    await db.query(`INSERT INTO growth_leads (name, area, phone, google_place_id, source)
                    VALUES ('عيادة قديمة', 'المعادي', '201000000001', 'place-1', 'manual')`)
    const rows = [
      { name: 'جديدة 1', phone: '01000000002', area: 'الدقي', category: 'dental', google_rating: '4.6', google_reviews_count: '12' },
      { name: 'نفس الرقم', phone: '01000000001' },
      { name: 'نفس المكان', google_place_id: 'place-1' },
      { name: 'عيادة قديمة', area: 'المعادي' },
      { name: '' },
      { name: 'جديدة 2', phone: 'not a phone', category: 'weird', signals: [{ type: 'review_pain_phone', kind: 'fact', evidence: 'محدش بيرد' }] },
    ]
    const res = (await one(db, `SELECT growth_import_leads($1::jsonb, 'google_maps_manual') AS r`, [JSON.stringify(rows)])).r
    expect(res).toMatchObject({ inserted: 2, skipped: 3, invalid: 1 })
    expect(res.ids).toHaveLength(2)
    const first = await one(db, `SELECT * FROM growth_leads WHERE name = 'جديدة 1'`)
    expect(first).toMatchObject({ phone: '201000000002', category: 'dental', google_reviews_count: 12, source: 'google_maps_manual' })
    expect(Number(first.google_rating)).toBe(4.6)
    const second = await one(db, `SELECT * FROM growth_leads WHERE name = 'جديدة 2'`)
    expect(second).toMatchObject({ phone: null, category: 'clinic' })
    expect(second.signals[0].evidence).toBe('محدش بيرد')
  })

  it('refuses oversized batches', async () => {
    const db = await freshDb()
    const rows = Array.from({ length: 1001 }, (_, i) => ({ name: `n${i}` }))
    await expect(db.query(`SELECT growth_import_leads($1::jsonb)`, [JSON.stringify(rows)])).rejects.toThrow(/at most 1000/)
  })
})

describe('growth_log_activity', () => {
  let db, leadId
  beforeEach(async () => {
    db = await freshDb()
    leadId = (await one(db, `INSERT INTO growth_leads (name, source) VALUES ('عيادة', 'manual') RETURNING id`)).id
  })
  const log = (kind, outcome, extra = {}) =>
    // FROM, not SELECT (fn()).* — the latter calls the function once per column.
    one(db, `SELECT * FROM growth_log_activity($1, $2, $3, $4, $5, $6, $7)`, [
      leadId, kind, outcome, extra.body ?? null, extra.angle ?? null, extra.next ?? null, extra.stage ?? null,
    ])

  it('moves a new lead through no answer → interested → demo', async () => {
    let l = await log('call', 'no_answer')
    expect(l).toMatchObject({ stage: 'contacted', contact_attempts: 1 })
    expect(l.next_follow_up_at).not.toBeNull()
    l = await log('whatsapp', 'interested', { angle: 'no_shows' })
    expect(l).toMatchObject({ stage: 'interested', contact_attempts: 2, sales_angle: 'no_shows' })
    l = await log('call', 'demo_booked')
    expect(l.stage).toBe('demo')
  })

  it('call later keeps the requested date', async () => {
    const when = '2030-01-15T10:00:00Z'
    const l = await log('call', 'call_later', { next: when })
    expect(l.stage).toBe('follow_up')
    expect(new Date(l.next_follow_up_at).toISOString()).toBe('2030-01-15T10:00:00.000Z')
  })

  it('do not contact clears the follow-up and is terminal', async () => {
    const l = await log('call', 'do_not_contact')
    expect(l).toMatchObject({ stage: 'do_not_contact', next_follow_up_at: null })
  })

  it('never downgrades a paying customer on "not interested"', async () => {
    await db.query(`UPDATE growth_leads SET stage = 'paid' WHERE id = $1`, [leadId])
    const l = await log('call', 'not_interested')
    expect(l.stage).toBe('paid')
  })

  it('notes do not count as contact attempts; explicit stage wins', async () => {
    let l = await log('note', null, { body: 'ملاحظة' })
    expect(l.contact_attempts).toBe(0)
    l = await log('note', null, { stage: 'paid' })
    expect(l.stage).toBe('paid')
    expect(l.paid_at).not.toBeNull()
  })

  it('rejects unknown outcomes and stages', async () => {
    await expect(log('call', 'maybe')).rejects.toThrow()
    await expect(log('note', null, { stage: 'vip' })).rejects.toThrow()
  })
})

describe('growth_attribute_signup', () => {
  let db
  beforeEach(async () => { db = await freshDb() })
  const attribute = (uid, ref) =>
    as(db, 'authenticated', (tx) => tx.query('SELECT growth_attribute_signup($1) AS r', [ref]), uid).then((x) => x.rows[0].r)

  it('links the business to the lead whose link was used and folds the auto-created row in', async () => {
    const uid = await createUser(db, 'dr@x.com')
    const lead = await one(db, `INSERT INTO growth_leads (name, phone, source, stage) VALUES ('عيادة من الخريطة', '201000000009', 'google_maps_manual', 'interested') RETURNING *`)
    // The nightly sync got there first and made an "incomplete signup" row.
    const auto = await one(db, `INSERT INTO growth_leads (name, source, owner_user_id) VALUES ('dr@x.com', 'signup_incomplete', $1) RETURNING id`, [uid])
    await db.query(`INSERT INTO growth_activities (lead_id, kind, body) VALUES ($1, 'note', 'قديمة')`, [auto.id])
    const biz = await createBusiness(db, uid, { owner_phone: '01000000009' })

    expect(await attribute(uid, lead.ref_code)).toEqual({ ok: true })
    const l = await one(db, 'SELECT * FROM growth_leads WHERE id = $1', [lead.id])
    expect(l).toMatchObject({ business_id: biz.id, owner_user_id: uid, stage: 'trial', email: 'dr@x.com', source: 'google_maps_manual' })
    expect((await one(db, 'SELECT count(*)::int AS c FROM growth_leads')).c).toBe(1)
    expect((await one(db, `SELECT count(*)::int AS c FROM growth_activities WHERE lead_id = $1`, [lead.id])).c).toBe(2)
  })

  it('matches by phone when they signed up without the link', async () => {
    const uid = await createUser(db, 'a@x.com')
    const lead = await one(db, `INSERT INTO growth_leads (name, phone, source, stage) VALUES ('عيادة', '201000000005', 'google_maps_manual', 'contacted') RETURNING id`)
    await createBusiness(db, uid, { owner_phone: '+20 100 000 0005' })
    await attribute(uid, null)
    expect(await one(db, 'SELECT stage, owner_user_id FROM growth_leads WHERE id = $1', [lead.id])).toEqual({ stage: 'trial', owner_user_id: uid })
  })

  it('credits a referral but not a self-referral', async () => {
    const refUid = await createUser(db, 'ref@x.com')
    const referrer = await createBusiness(db, refUid, { booking_slug: 'dr-salma' })
    const uid = await createUser(db, 'new@x.com')
    await createBusiness(db, uid, { name: 'عيادة أسنان جديدة', specialty: 'أسنان' })
    await attribute(uid, 'R-dr-salma')
    expect(await one(db, 'SELECT source, referrer_business_id, category FROM growth_leads WHERE owner_user_id = $1', [uid]))
      .toEqual({ source: 'referral', referrer_business_id: referrer.id, category: 'dental' })

    await attribute(refUid, 'R-dr-salma')
    expect(await one(db, 'SELECT source, referrer_business_id FROM growth_leads WHERE owner_user_id = $1', [refUid]))
      .toEqual({ source: 'organic_signup', referrer_business_id: null })
  })

  it('ignores a lead link that already belongs to another business', async () => {
    const u1 = await createUser(db, 'one@x.com')
    const b1 = await createBusiness(db, u1)
    const lead = await one(db, `INSERT INTO growth_leads (name, source, business_id) VALUES ('عيادة 1', 'manual', $1) RETURNING *`, [b1.id])
    const u2 = await createUser(db, 'two@x.com')
    await createBusiness(db, u2, { name: 'عيادة 2' })
    await attribute(u2, lead.ref_code)
    expect((await one(db, 'SELECT business_id FROM growth_leads WHERE id = $1', [lead.id])).business_id).toBe(b1.id)
    expect((await one(db, 'SELECT name FROM growth_leads WHERE owner_user_id = $1', [u2])).name).toBe('عيادة 2')
  })

  it('requires a signed-in user with a business', async () => {
    expect(await attribute(null, null)).toMatchObject({ ok: false, error: 'not_signed_in' })
    const uid = await createUser(db, 'x@x.com')
    expect(await attribute(uid, null)).toMatchObject({ ok: false, error: 'no_business' })
  })
})

describe('growth_sync_platform', () => {
  it('mirrors trial/paid status, flags expiring trials, and picks up unfinished signups', async () => {
    const db = await freshDb()
    const trialUid = await createUser(db, 'trial@x.com')
    const trial = await createBusiness(db, trialUid, { trial_ends_at: new Date(Date.now() + 2 * 864e5).toISOString() })
    const paidUid = await createUser(db, 'paid@x.com')
    const paid = await createBusiness(db, paidUid, { subscription_type: 'paid', activated_at: new Date().toISOString() })
    const expUid = await createUser(db, 'exp@x.com')
    await createBusiness(db, expUid, { trial_ends_at: new Date(Date.now() - 864e5).toISOString() })
    await createUser(db, 'stuck@x.com', new Date(Date.now() - 3 * 3600e3).toISOString())
    await createUser(db, 'justnow@x.com')

    const r = (await one(db, 'SELECT growth_sync_platform() AS r')).r
    expect(r).toEqual({ created: 3, updated: 0, signup_incomplete: 1 })

    const t = await one(db, 'SELECT * FROM growth_leads WHERE business_id = $1', [trial.id])
    expect(t).toMatchObject({ stage: 'trial', source: 'organic_signup', email: 'trial@x.com' })
    expect(t.signals.map((s) => s.type)).toEqual(['trial_expiring'])
    expect(t.next_follow_up_at).not.toBeNull()

    expect((await one(db, 'SELECT stage FROM growth_leads WHERE business_id = $1', [paid.id])).stage).toBe('paid')
    const e = await one(db, 'SELECT signals FROM growth_leads WHERE owner_user_id = $1', [expUid])
    expect(e.signals.map((s) => s.type)).toEqual(['trial_expired'])
    const stuck = await one(db, `SELECT * FROM growth_leads WHERE source = 'signup_incomplete'`)
    expect(stuck).toMatchObject({ email: 'stuck@x.com', stage: 'new' })

    // Idempotent: a second run changes nothing and duplicates no signal.
    expect((await one(db, 'SELECT growth_sync_platform() AS r')).r).toEqual({ created: 0, updated: 0, signup_incomplete: 0 })
    const again = await one(db, 'SELECT signals FROM growth_leads WHERE business_id = $1', [trial.id])
    expect(again.signals).toHaveLength(1)
  })

  it('moves a contacted lead to paid when their business pays', async () => {
    const db = await freshDb()
    const uid = await createUser(db, 'p@x.com')
    const biz = await createBusiness(db, uid, { owner_phone: '01000000007' })
    const lead = await one(db, `INSERT INTO growth_leads (name, phone, source, stage) VALUES ('عيادة', '201000000007', 'google_maps_manual', 'interested') RETURNING id`)
    await one(db, 'SELECT growth_sync_platform()')
    expect(await one(db, 'SELECT stage, business_id FROM growth_leads WHERE id = $1', [lead.id])).toEqual({ stage: 'trial', business_id: biz.id })
    await db.query(`UPDATE businesses SET subscription_type = 'paid', activated_at = now() WHERE id = $1`, [biz.id])
    await one(db, 'SELECT growth_sync_platform()')
    const l = await one(db, 'SELECT stage, paid_at FROM growth_leads WHERE id = $1', [lead.id])
    expect(l.stage).toBe('paid')
    expect(l.paid_at).not.toBeNull()
  })
})

describe('growth_get_preview', () => {
  it('returns nothing unless the preview is enabled and the lead is contactable', async () => {
    const db = await freshDb()
    const lead = await one(db, `INSERT INTO growth_leads (name, source) VALUES ('عيادة', 'manual') RETURNING *`)
    const get = async () => (await one(db, 'SELECT growth_get_preview($1) AS p', [lead.ref_code])).p
    expect(await get()).toBeNull()
    await db.query(`UPDATE growth_leads SET preview = '{"enabled":true}' WHERE id = $1`, [lead.id])
    expect(await get()).toMatchObject({ name: 'عيادة', services: [] })
    await db.query(`UPDATE growth_leads SET stage = 'do_not_contact' WHERE id = $1`, [lead.id])
    expect(await get()).toBeNull()
  })
})

describe('growth_take_places_quota', () => {
  it('allows calls up to the daily cap', async () => {
    const db = await freshDb()
    await db.query('UPDATE growth_settings SET places_daily_cap = 2')
    const take = async () => (await one(db, 'SELECT growth_take_places_quota() AS ok')).ok
    expect([await take(), await take(), await take()]).toEqual([true, true, false])
    await db.query(`UPDATE growth_settings SET places_calls_date = current_date - 1`)
    expect(await take()).toBe(true)
  })
})
