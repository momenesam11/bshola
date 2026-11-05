// The whole partner and referral story, end to end, against real Postgres:
// every step a clinic, a partner, a customer and the owner can take, with the
// money checked to the pound. If one of these fails, somebody gets paid wrong.

import { describe, it, expect, beforeEach } from 'vitest'
import { freshDb, readSql, as, createUser, createBusiness, one } from './harness.js'

const BONUS = 50
const PCT = 20
const sync = (db) => one(db, 'SELECT growth_sync_platform() AS r').then((x) => x.r)
const book = (db, bizId, phones) => db.query(`INSERT INTO appointments (business_id, client_phone) SELECT $1, unnest($2::text[])`, [bizId, phones])
const REAL_PATIENTS = ['01100000001', '01100000002', '01100000003', '01100000004', '01100000005']

async function newPartner(db, fields = {}) {
  return one(db, `INSERT INTO growth_partners (name, phone, signup_bonus_egp, commission_pct) VALUES ($1, $2, $3, $4) RETURNING *`,
    [fields.name ?? 'أحمد المندوب', fields.phone ?? '201500000001', fields.bonus ?? BONUS, fields.pct ?? PCT])
}

/** A clinic signs up from a link: register (the code is saved on the account), onboarding, attribution. */
async function signUpFrom(db, ref, { email = 'clinic@x.com', ownerPhone = '01012000001', name = 'عيادة النور', slug = null } = {}) {
  const uid = await createUser(db, email, null, ref ? { ref } : {})
  const biz = await createBusiness(db, uid, { owner_phone: ownerPhone, name, booking_slug: slug })
  await as(db, 'authenticated', (tx) => tx.query('SELECT growth_attribute_signup($1)', [ref]), uid)
  const lead = await one(db, 'SELECT * FROM growth_leads WHERE business_id = $1', [biz.id])
  return { uid, biz, lead }
}

/** What /admin does when the owner activates a plan. */
const activate = (db, bizId, days) => db.query(
  `UPDATE businesses SET subscription_type = 'paid', is_active = true, activated_at = now(), trial_ends_at = now() + make_interval(days => $2) WHERE id = $1`,
  [bizId, days])

const commissions = async (db, partnerId) =>
  (await db.query(`SELECT kind, amount_egp::float AS amount, status FROM growth_commissions WHERE partner_id = $1 ORDER BY kind`, [partnerId])).rows
const dashboard = async (db, token) =>
  (await as(db, 'anon', (tx) => tx.query('SELECT growth_partner_dashboard($1) AS d', [token]))).rows[0].d

describe('partner story, start to finish', () => {
  let db
  beforeEach(async () => { db = await freshDb() })

  it('clinic signs up → gets real → subscribes → partner is paid the exact amounts, and sees each step', async () => {
    const partner = await newPartner(db)

    // 1. Signed up from the link: credited to the partner, no money yet.
    const { biz, lead } = await signUpFrom(db, partner.ref_code)
    expect(lead).toMatchObject({ partner_id: partner.id, source: 'partner', stage: 'trial' })
    await sync(db)
    expect(await commissions(db, partner.id)).toEqual([])
    let d = await dashboard(db, partner.access_token)
    expect(d.clinics[0]).toMatchObject({ name: 'عيادة النور', status: 'registered', progress: { appointments: 0, need_appointments: 5, need_clients: 3 } })

    // 2. Real patients book → the clinic is proven real → the bonus appears, waiting for review.
    await book(db, biz.id, REAL_PATIENTS)
    await sync(db)
    expect(await commissions(db, partner.id)).toEqual([{ kind: 'signup_bonus', amount: BONUS, status: 'pending' }])
    d = await dashboard(db, partner.access_token)
    expect(d.clinics[0].status).toBe('qualified')
    expect(d.clinics[0].progress).toBeNull()

    // 3. Subscribes to the 3-month plan (749) → 20% = 149.80.
    await activate(db, biz.id, 90)
    await sync(db)
    expect(await commissions(db, partner.id)).toEqual([
      { kind: 'signup_bonus', amount: BONUS, status: 'pending' },
      { kind: 'subscription', amount: 149.8, status: 'pending' },
    ])

    // 4. Owner approves both, then pays them in one click.
    for (const c of (await db.query('SELECT id FROM growth_commissions WHERE partner_id = $1', [partner.id])).rows) {
      await one(db, `SELECT growth_set_commission_status($1, 'approved')`, [c.id])
    }
    const pay = (await one(db, `SELECT growth_pay_partner($1, 'فودافون كاش') AS r`, [partner.id])).r
    expect(pay).toEqual({ count: 2, total: 199.8 })

    // 5. The partner sees it as paid, with nothing private in the payload.
    d = await dashboard(db, partner.access_token)
    expect(d.clinics[0].status).toBe('paid')
    expect(d.commissions.every((c) => c.status === 'paid' && c.paid_at)).toBe(true)
    const raw = JSON.stringify(d)
    expect(raw).not.toContain('01012000001')
    expect(raw).not.toContain('clinic@x.com')
    expect(raw).not.toContain('01100000001')
    expect(raw).not.toContain('فودافون كاش') // the owner's own note stays internal
  })

  it.each([[30, 299, 59.8], [90, 749, 149.8], [180, 1200, 240]])('%i days → the %i plan → %f commission', async (days, _price, expected) => {
    const partner = await newPartner(db, { bonus: 0 })
    const { biz } = await signUpFrom(db, partner.ref_code)
    await activate(db, biz.id, days)
    await sync(db)
    expect(await commissions(db, partner.id)).toEqual([{ kind: 'subscription', amount: expected, status: 'pending' }])
  })

  it('a clinic that subscribes before reaching the booking count still earns the bonus: paying proves it is real', async () => {
    const partner = await newPartner(db)
    const { biz, lead } = await signUpFrom(db, partner.ref_code)
    await activate(db, biz.id, 30)
    await sync(db)
    expect((await commissions(db, partner.id)).map((c) => c.kind)).toEqual(['signup_bonus', 'subscription'])
    expect((await one(db, 'SELECT qualified_by FROM growth_leads WHERE id = $1', [lead.id])).qualified_by).toBe('auto')
  })

  it('syncing every night for a year never pays twice, and renewals earn nothing', async () => {
    const partner = await newPartner(db)
    const { biz } = await signUpFrom(db, partner.ref_code)
    await book(db, biz.id, REAL_PATIENTS)
    await activate(db, biz.id, 30)
    for (let i = 0; i < 5; i++) await sync(db)
    await activate(db, biz.id, 180) // renewal
    await sync(db)
    const rows = await commissions(db, partner.id)
    expect(rows).toHaveLength(2)
    expect(rows.find((c) => c.kind === 'subscription').amount).toBe(59.8)
  })

  it('signing up on another device still credits the partner (code saved on the account)', async () => {
    const partner = await newPartner(db)
    const uid = await createUser(db, 'phone@x.com', null, { ref: partner.ref_code })
    const biz = await createBusiness(db, uid, { owner_phone: '01012000002' })
    await as(db, 'authenticated', (tx) => tx.query('SELECT growth_attribute_signup(NULL)'), uid)
    expect((await one(db, 'SELECT partner_id FROM growth_leads WHERE business_id = $1', [biz.id])).partner_id).toBe(partner.id)
  })

  it('a clinic you already had on the list, signing up from a partner link, is credited to the partner', async () => {
    const partner = await newPartner(db)
    await db.query(`INSERT INTO growth_leads (name, phone, source) VALUES ('عيادة من الخريطة', '201012000003', 'overture')`)
    const { lead } = await signUpFrom(db, partner.ref_code, { ownerPhone: '01012000003', name: 'عيادة النور' })
    expect(lead).toMatchObject({ partner_id: partner.id, name: 'عيادة النور', source: 'overture' })
  })
})

describe('partner story: attempts to cheat', () => {
  let db
  beforeEach(async () => { db = await freshDb() })

  it('fake sign-up with the owner booking themselves earns nothing', async () => {
    const partner = await newPartner(db)
    const { biz } = await signUpFrom(db, partner.ref_code)
    await book(db, biz.id, ['01012000001', '01012000001', '01012000001', '01012000001', '01012000001'])
    await sync(db)
    expect(await commissions(db, partner.id)).toEqual([])
  })

  it('one person, many accounts on the same number: none of them qualifies', async () => {
    const partner = await newPartner(db)
    const a = await signUpFrom(db, partner.ref_code, { email: 'a@x.com', ownerPhone: '01012000009' })
    await signUpFrom(db, partner.ref_code, { email: 'b@x.com', ownerPhone: '01012000009', name: 'عيادة تانية' })
    await book(db, a.biz.id, REAL_PATIENTS)
    await sync(db)
    expect(await commissions(db, partner.id)).toEqual([])
  })

  it("a partner signing up their own clinic earns nothing, even if it pays, and the reason is on the timeline", async () => {
    const partner = await newPartner(db, { phone: '201012000005' })
    const { biz, lead } = await signUpFrom(db, partner.ref_code, { ownerPhone: '01012000005' })
    await book(db, biz.id, REAL_PATIENTS)
    expect((await one(db, 'SELECT growth_qualify_check($1) AS c', [biz.id])).c).toMatchObject({ qualified: false, partner_own_number: true })
    await activate(db, biz.id, 90)
    await sync(db)
    await sync(db)
    expect(await commissions(db, partner.id)).toEqual([])
    const notes = await db.query(`SELECT body FROM growth_activities WHERE lead_id = $1 AND meta->>'reason' = 'partner_own_number'`, [lead.id])
    expect(notes.rows).toHaveLength(1)
  })

  it("the owner's test accounts earn nothing and stay off the partner's page", async () => {
    const partner = await newPartner(db)
    const { biz, lead } = await signUpFrom(db, partner.ref_code)
    await db.query('UPDATE growth_leads SET is_test = true WHERE id = $1', [lead.id])
    await book(db, biz.id, REAL_PATIENTS)
    await activate(db, biz.id, 30)
    await sync(db)
    expect(await commissions(db, partner.id)).toEqual([])
    expect((await dashboard(db, partner.access_token)).clinics).toEqual([])
  })

  it('a stopped partner’s link no longer credits new clinics, but what they earned stays', async () => {
    const partner = await newPartner(db)
    const first = await signUpFrom(db, partner.ref_code)
    await db.query('UPDATE growth_partners SET active = false WHERE id = $1', [partner.id])
    const later = await signUpFrom(db, partner.ref_code, { email: 'later@x.com', ownerPhone: '01012000007', name: 'عيادة بعد الإيقاف' })
    expect(later.lead.partner_id).toBeNull()
    await activate(db, first.biz.id, 30)
    await sync(db)
    expect((await commissions(db, partner.id)).length).toBe(2)
  })

  it('commission status only moves along allowed steps', async () => {
    const partner = await newPartner(db)
    const { biz } = await signUpFrom(db, partner.ref_code)
    await activate(db, biz.id, 30)
    await sync(db)
    const { id } = await one(db, `SELECT id FROM growth_commissions WHERE partner_id = $1 AND kind = 'subscription'`, [partner.id])
    const set = (s) => db.query(`SELECT growth_set_commission_status($1, $2)`, [id, s])
    await expect(set('paid')).rejects.toThrow() // can't pay what wasn't approved
    await set('approved')
    await set('paid')
    await expect(set('rejected')).rejects.toThrow() // can't reject money already paid
    await set('approved') // undo a wrong click
    expect((await one(db, 'SELECT paid_at FROM growth_commissions WHERE id = $1', [id])).paid_at).toBeNull()
  })

  it('pay-all only touches approved amounts', async () => {
    const partner = await newPartner(db)
    const { biz } = await signUpFrom(db, partner.ref_code)
    await activate(db, biz.id, 30)
    await sync(db)
    const { id } = await one(db, `SELECT id FROM growth_commissions WHERE partner_id = $1 AND kind = 'signup_bonus'`, [partner.id])
    await one(db, `SELECT growth_set_commission_status($1, 'approved')`, [id])
    expect((await one(db, 'SELECT growth_pay_partner($1) AS r', [partner.id])).r).toEqual({ count: 1, total: BONUS })
    expect((await one(db, `SELECT status FROM growth_commissions WHERE partner_id = $1 AND kind = 'subscription'`, [partner.id])).status).toBe('pending')
  })
})

describe('partner login', () => {
  let db, partner, pin
  const login = async (phone, code) => (await as(db, 'anon', (tx) => tx.query('SELECT growth_partner_login($1, $2) AS r', [phone, code]))).rows[0].r
  beforeEach(async () => {
    db = await freshDb()
    partner = await newPartner(db, { phone: '201012000011' })
    pin = (await one(db, 'SELECT growth_set_partner_pin($1) AS p', [partner.id])).p
  })

  it('phone + PIN gives the dashboard token; the PIN is not stored in the clear', async () => {
    expect(pin).toMatch(/^[0-9]{6}$/)
    expect(await login('0101 200 0011', pin)).toEqual({ ok: true, token: partner.access_token })
    expect(JSON.stringify(await one(db, 'SELECT * FROM growth_partners WHERE id = $1', [partner.id]))).not.toContain(pin)
  })

  it('wrong PIN or unknown phone give the same answer', async () => {
    const wrong = pin === '000000' ? '000001' : '000000'
    expect(await login('01012000011', wrong)).toEqual({ ok: false })
    expect(await login('01099999999', pin)).toEqual({ ok: false })
    expect(await login('nonsense', 'nonsense')).toEqual({ ok: false })
  })

  it('five wrong tries lock the login, even for the right PIN', async () => {
    const wrong = pin === '000000' ? '000001' : '000000'
    for (let i = 0; i < 5; i++) await login('01012000011', wrong)
    expect(await login('01012000011', pin)).toEqual({ ok: false })
    await db.query(`UPDATE growth_partners SET pin_locked_until = now() - interval '1 minute' WHERE id = $1`, [partner.id])
    expect((await login('01012000011', pin)).ok).toBe(true)
  })

  it('a new PIN or a new link cancels the old one', async () => {
    const fresh = (await one(db, 'SELECT growth_set_partner_pin($1) AS p', [partner.id])).p
    if (fresh !== pin) expect(await login('01012000011', pin)).toEqual({ ok: false })
    await one(db, 'SELECT * FROM growth_rotate_partner_token($1)', [partner.id])
    expect(await dashboard(db, partner.access_token)).toBeNull()
  })

  it('outsiders can reach only the login and the dashboard', async () => {
    for (const sql of [
      'SELECT growth_set_partner_pin(gen_random_uuid())',
      'SELECT growth_pay_partner(gen_random_uuid())',
      'SELECT * FROM growth_rotate_partner_token(gen_random_uuid())',
      'SELECT pin_hash FROM growth_partners',
      'SELECT * FROM growth_commissions',
      'SELECT * FROM growth_daily_list',
      'SELECT * FROM growth_referral_rewards',
    ]) {
      await expect(as(db, 'anon', (tx) => tx.query(sql))).rejects.toThrow(/permission denied/)
    }
  })
})

describe('customer referral story', () => {
  let db, referrer
  const rewards = async () => (await db.query('SELECT * FROM growth_referral_rewards')).rows
  const mine = async (uid) => (await as(db, 'authenticated', (tx) => tx.query('SELECT growth_my_referrals() AS r'), uid)).rows[0].r
  beforeEach(async () => {
    db = await freshDb()
    referrer = await signUpFrom(db, null, { email: 'ref@x.com', ownerPhone: '01012000020', name: 'عيادة المرشِّح', slug: 'noor' })
  })

  it('friend signs up → pays → reward appears → owner grants it → the subscription gets 30 more days', async () => {
    const friend = await signUpFrom(db, 'R-noor', { email: 'friend@x.com', ownerPhone: '01012000021', name: 'عيادة الزميل' })
    expect(friend.lead).toMatchObject({ source: 'referral', referrer_business_id: referrer.biz.id })

    // Signing up alone earns nothing.
    await sync(db)
    expect(await rewards()).toEqual([])
    expect(await mine(referrer.uid)).toEqual({ signed_up: 1, paid: 0, pending_rewards: 0, granted_rewards: 0, free_days: 0 })

    await activate(db, friend.biz.id, 30)
    await sync(db)
    await sync(db)
    const [reward] = await rewards()
    expect(reward).toMatchObject({ status: 'pending', days: 30, referrer_business_id: referrer.biz.id })

    const before = new Date((await one(db, 'SELECT trial_ends_at FROM businesses WHERE id = $1', [referrer.biz.id])).trial_ends_at)
    await one(db, `SELECT * FROM growth_decide_referral_reward($1, 'granted')`, [reward.id])
    const after = new Date((await one(db, 'SELECT trial_ends_at FROM businesses WHERE id = $1', [referrer.biz.id])).trial_ends_at)
    expect(Math.round((after - before) / 864e5)).toBe(30)
    expect(await mine(referrer.uid)).toEqual({ signed_up: 1, paid: 1, pending_rewards: 0, granted_rewards: 1, free_days: 30 })

    // Granting twice is refused: one reward, one extension.
    await expect(db.query(`SELECT * FROM growth_decide_referral_reward($1, 'granted')`, [reward.id])).rejects.toThrow()
  })

  it('a reward on an expired subscription counts from today, not from the old end date', async () => {
    await db.query(`UPDATE businesses SET trial_ends_at = now() - interval '40 days' WHERE id = $1`, [referrer.biz.id])
    const friend = await signUpFrom(db, 'R-noor', { email: 'f@x.com', ownerPhone: '01012000022' })
    await activate(db, friend.biz.id, 30)
    await sync(db)
    const [reward] = await rewards()
    await one(db, `SELECT * FROM growth_decide_referral_reward($1, 'granted')`, [reward.id])
    const end = new Date((await one(db, 'SELECT trial_ends_at FROM businesses WHERE id = $1', [referrer.biz.id])).trial_ends_at)
    expect(Math.round((end - Date.now()) / 864e5)).toBe(30)
  })

  it('no reward for referring yourself: not with the same account, nor another on the same number', async () => {
    const self = await signUpFrom(db, 'R-noor', { email: 'second@x.com', ownerPhone: '01012000020', name: 'حساب تاني لنفس الشخص' })
    await activate(db, self.biz.id, 30)
    await sync(db)
    expect(await rewards()).toEqual([])
  })

  it('no reward when the referrer or the referred is a test account', async () => {
    const friend = await signUpFrom(db, 'R-noor', { email: 'f2@x.com', ownerPhone: '01012000023' })
    await db.query('UPDATE growth_leads SET is_test = true WHERE id = $1', [referrer.lead.id])
    await activate(db, friend.biz.id, 30)
    await sync(db)
    expect(await rewards()).toEqual([])
  })

  it('a customer only ever sees their own numbers', async () => {
    const other = await signUpFrom(db, null, { email: 'other@x.com', ownerPhone: '01012000024', name: 'عميل تاني' })
    await signUpFrom(db, 'R-noor', { email: 'f3@x.com', ownerPhone: '01012000025' })
    expect((await mine(other.uid)).signed_up).toBe(0)
    expect((await mine(referrer.uid)).signed_up).toBe(1)
  })
})

describe("today's list", () => {
  let db, ids
  const today = '2030-01-10'
  const set = (list, mode, day = today) => one(db, 'SELECT growth_set_daily_list($1, $2, $3) AS r', [day, list, mode]).then((x) => x.r)
  const listed = async (day = today) => (await db.query('SELECT lead_id FROM growth_daily_list WHERE day = $1 ORDER BY position', [day])).rows.map((r) => r.lead_id)
  beforeEach(async () => {
    db = await freshDb()
    ids = []
    for (let i = 0; i < 4; i++) {
      ids.push((await one(db, `INSERT INTO growth_leads (name, phone, source) VALUES ($1, $2, 'overture') RETURNING id`, [`عيادة ${i}`, `20101200010${i}`])).id)
    }
  })

  it('the first writer wins, so the morning job and an open tab agree', async () => {
    expect(await set([ids[0], ids[1]], 'ensure')).toEqual({ added: 2, total: 2 })
    expect(await set([ids[2]], 'ensure')).toEqual({ added: 0, total: 2 })
    expect(await listed()).toEqual([ids[0], ids[1]])
  })

  it('tomorrow is a new list; the old day is gone after 60 days', async () => {
    await set([ids[0]], 'ensure', '2030-01-01')
    await set([ids[1]], 'ensure', '2030-01-02')
    expect(await listed('2030-01-02')).toEqual([ids[1]])
    await set([ids[2]], 'ensure', '2030-03-15')
    expect(await listed('2030-01-01')).toEqual([])
  })

  it('never lists a test, hidden, closed or phone-less lead, even if asked', async () => {
    await db.query(`UPDATE growth_leads SET is_test = true WHERE id = $1`, [ids[0]])
    await db.query(`UPDATE growth_leads SET archived_at = now() WHERE id = $1`, [ids[1]])
    await db.query(`UPDATE growth_leads SET stage = 'do_not_contact' WHERE id = $1`, [ids[2]])
    await db.query(`UPDATE growth_leads SET phone = NULL WHERE id = $1`, [ids[3]])
    expect(await set(ids, 'ensure')).toEqual({ added: 0, total: 0 })
  })

  it('swapping the list keeps worked rows and frees the rest for another day', async () => {
    await set([ids[0], ids[1]], 'ensure')
    await db.query(`SELECT * FROM growth_log_activity($1, 'call', 'no_answer')`, [ids[0]])
    await set([ids[2]], 'rebuild')
    expect((await listed()).sort()).toEqual([ids[0], ids[2]].sort())
    expect(await one(db, 'SELECT last_listed_on, times_listed FROM growth_leads WHERE id = $1', [ids[1]])).toEqual({ last_listed_on: null, times_listed: 0 })
  })

  it('«give me more» adds to today without touching what is there', async () => {
    await set([ids[0]], 'ensure')
    expect(await set([ids[1], ids[2]], 'append')).toEqual({ added: 2, total: 3 })
    expect(await listed()).toEqual([ids[0], ids[1], ids[2]])
  })
})

describe('no answer stops coming back', () => {
  it('retries after 1, 3, 7 days and closes on the 4th', async () => {
    const db = await freshDb()
    const { id } = await one(db, `INSERT INTO growth_leads (name, phone, source) VALUES ('عيادة', '201012000200', 'overture') RETURNING id`)
    const noAnswer = () => one(db, `SELECT * FROM growth_log_activity($1, 'call', 'no_answer')`, [id])
    const inDays = (l) => Math.round((new Date(l.next_follow_up_at) - Date.now()) / 864e5)
    expect(inDays(await noAnswer())).toBe(1)
    expect(inDays(await noAnswer())).toBe(3)
    expect(inDays(await noAnswer())).toBe(7)
    expect(await noAnswer()).toMatchObject({ stage: 'lost', lost_reason: 'no_response', next_follow_up_at: null })
  })

  it('never closes a clinic in trial', async () => {
    const db = await freshDb()
    const { id } = await one(db, `INSERT INTO growth_leads (name, phone, source, stage) VALUES ('عيادة', '201012000201', 'overture', 'trial') RETURNING id`)
    for (let i = 0; i < 6; i++) await one(db, `SELECT * FROM growth_log_activity($1, 'call', 'no_answer')`, [id])
    expect((await one(db, 'SELECT stage FROM growth_leads WHERE id = $1', [id])).stage).toBe('trial')
  })
})

describe('list clean-up', () => {
  let db
  beforeEach(async () => { db = await freshDb() })

  it('a hidden lead stays out of re-imports, can be restored, and comes back when the person signs up', async () => {
    const { id } = await one(db, `INSERT INTO growth_leads (name, phone, source) VALUES ('عيادة', '201012000300', 'overture') RETURNING id`)
    expect((await one(db, `SELECT growth_bulk_leads($1, 'archive', 'رقم غلط') AS r`, [[id]])).r).toEqual({ done: 1, skipped: 0 })
    const again = (await one(db, `SELECT growth_import_leads($1::jsonb, 'overture') AS r`, [JSON.stringify([{ name: 'عيادة', phone: '01012000300' }])])).r
    expect(again).toMatchObject({ inserted: 0, skipped: 1 })

    await signUpFrom(db, null, { ownerPhone: '01012000300' })
    expect((await one(db, 'SELECT archived_at FROM growth_leads WHERE id = $1', [id])).archived_at).toBeNull()
  })

  it('refuses to hide a customer or a lead with commissions', async () => {
    const partner = await newPartner(db)
    const { biz, lead } = await signUpFrom(db, partner.ref_code)
    await activate(db, biz.id, 30)
    await sync(db)
    expect((await one(db, `SELECT growth_bulk_leads($1, 'archive') AS r`, [[lead.id]])).r).toEqual({ done: 0, skipped: 1 })
  })

  it('imports Overture rows with their coordinates and skips them the second time', async () => {
    const row = { name: 'عيادة أسنان', phone: '01012000301', category: 'dental', area: 'المعادي', lat: 29.96, lng: 31.25, overture_id: 'ov-1' }
    const run = () => one(db, `SELECT growth_import_leads($1::jsonb, 'overture') AS r`, [JSON.stringify([row])]).then((x) => x.r)
    expect(await run()).toMatchObject({ inserted: 1 })
    expect(await run()).toMatchObject({ inserted: 0, skipped: 1 })
    expect(await one(db, `SELECT source, lat, lng, overture_id FROM growth_leads WHERE overture_id = 'ov-1'`)).toEqual({ source: 'overture', lat: 29.96, lng: 31.25, overture_id: 'ov-1' })
  })
})

describe('Google budget', () => {
  it('stops at the monthly cap, and a new month starts fresh', async () => {
    const db = await freshDb()
    await db.query('UPDATE growth_settings SET places_monthly_cap = 2')
    const take = async () => (await one(db, 'SELECT growth_take_places_quota() AS ok')).ok
    expect([await take(), await take(), await take()]).toEqual([true, true, false])
    await db.query(`UPDATE growth_settings SET places_month = '2000-01', places_month_count = 2`)
    expect(await take()).toBe(true)
  })
})

describe('038 rollback', () => {
  it('goes back cleanly and re-applies', async () => {
    const db = await freshDb()
    await one(db, `INSERT INTO growth_leads (name, source, overture_id) VALUES ('عيادة', 'overture', 'x') RETURNING id`)
    await db.exec(readSql('supabase/rollbacks/038_growth_daily_partners_down.sql'))
    expect((await one(db, `SELECT source FROM growth_leads`)).source).toBe('import')
    expect((await one(db, `SELECT to_regclass('public.growth_daily_list') AS t`)).t).toBeNull()
    expect((await one(db, 'SELECT growth_sync_platform() AS r')).r).toMatchObject({ created: 0 })
    await db.exec(readSql('supabase/migrations/038_growth_daily_partners.sql'))
    expect((await one(db, `SELECT to_regclass('public.growth_daily_list') AS t`)).t).toBe('growth_daily_list')
  })
})
