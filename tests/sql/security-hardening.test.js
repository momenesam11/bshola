import { describe, it, expect } from 'vitest'
import { freshDb, readSql, as, createUser, createBusiness, one } from './harness.js'

// Builds the slice of the live schema these rules act on, using the real
// capacity migrations, then applies 039 and optionally 040.
const SCHEMA = `
  ALTER TABLE businesses
    ADD COLUMN working_hours jsonb, ADD COLUMN slot_duration int DEFAULT 30,
    ADD COLUMN logo_url text, ADD COLUMN cover_url text, ADD COLUMN brand_color text,
    ADD COLUMN bio text, ADD COLUMN years_experience int, ADD COLUMN welcome_message text,
    ADD COLUMN cancellation_policy text, ADD COLUMN instagram_url text, ADD COLUMN facebook_url text,
    ADD COLUMN google_reviews_url text, ADD COLUMN public_phone text, ADD COLUMN activated_by text;
  CREATE TABLE branches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
    name text NOT NULL DEFAULT 'فرع',
    capacity int DEFAULT 1
  );
  CREATE TABLE services (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
    name text NOT NULL DEFAULT 'كشف'
  );
  ALTER TABLE appointments
    ADD COLUMN branch_id uuid REFERENCES branches(id),
    ADD COLUMN service_id uuid REFERENCES services(id),
    ADD COLUMN appointment_date date NOT NULL DEFAULT CURRENT_DATE,
    ADD COLUMN appointment_time time NOT NULL DEFAULT '10:00',
    ADD COLUMN status text NOT NULL DEFAULT 'confirmed',
    ADD COLUMN reminder_sent boolean NOT NULL DEFAULT false,
    ADD COLUMN notes text,
    ADD COLUMN price numeric,
    ADD COLUMN payment_status text NOT NULL DEFAULT 'unpaid',
    ADD COLUMN payment_type text,
    ADD COLUMN amount_paid numeric NOT NULL DEFAULT 0,
    ADD COLUMN plan_visit_id uuid;

  ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
  ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
  ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
  ALTER TABLE services ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "owner_all" ON businesses FOR ALL TO authenticated
    USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
  CREATE POLICY "public_select_businesses" ON businesses FOR SELECT TO anon, authenticated USING (true);
  CREATE POLICY "public_read_branches" ON branches FOR SELECT TO anon, authenticated USING (true);
  CREATE POLICY "public_select" ON services FOR SELECT TO anon, authenticated USING (true);
  CREATE POLICY "owner_all" ON appointments FOR ALL TO authenticated
    USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()))
    WITH CHECK (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));

  CREATE SCHEMA storage;
  CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text);
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
    SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
  $$;
  CREATE POLICY "public read business assets" ON storage.objects FOR SELECT TO anon, authenticated
    USING (bucket_id = 'business-assets');
  GRANT USAGE ON SCHEMA storage TO anon, authenticated;
  GRANT ALL ON storage.objects TO anon, authenticated;
`

async function setup({ lock = true } = {}) {
  const db = await freshDb({ migrate: false })
  await db.exec(SCHEMA)
  await db.exec(readSql('supabase/migrations/021_capacity_lock_trigger.sql'))
  await db.exec(readSql('supabase/migrations/023_fix_rls_self_reference_and_capacity_lock.sql'))
  await db.exec(readSql('supabase/migrations/024_fix_capacity_trigger_rls_blindness.sql'))
  await db.exec(readSql('supabase/migrations/039_security_hardening.sql'))
  await db.exec(readSql('supabase/migrations/041_raise_booking_cap.sql'))
  if (lock) await db.exec(readSql('supabase/migrations/040_lock_business_reads.sql'))
  // Supabase grants these by default on public tables; RLS is what restricts them.
  await db.exec(`
    GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
    REVOKE ALL ON admin_login_attempts FROM anon, authenticated;
  `)

  const ownerId = await createUser(db, 'owner@x.com')
  const business = await createBusiness(db, ownerId, { booking_slug: 'alamal', owner_phone: '01099999999', public_phone: '0220000000' })
  const branch = await one(db, 'INSERT INTO branches (business_id) VALUES ($1) RETURNING id', [business.id])
  const service = await one(db, 'INSERT INTO services (business_id) VALUES ($1) RETURNING id', [business.id])
  // From the database, not the JS clock: around midnight the two can disagree on
  // the date, and bookings for a day the database sees as past are refused.
  const { today } = await one(db, 'SELECT CURRENT_DATE::text AS today')
  return { db, ownerId, business, branch, service, today }
}

function book(tx, ctx, fields = {}) {
  const row = {
    business_id: ctx.business.id,
    branch_id: ctx.branch.id,
    service_id: ctx.service.id,
    client_name: 'مريض تجربة',
    client_phone: '01000000001',
    appointment_date: ctx.today,
    appointment_time: '10:00',
    status: 'confirmed',
    ...fields,
  }
  const keys = Object.keys(row)
  return tx.query(
    `INSERT INTO appointments (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')})`,
    Object.values(row)
  )
}

const bookAsVisitor = (ctx, fields, ip = '1.1.1.1') => as(ctx.db, 'anon', async (tx) => {
  await tx.query(`SELECT set_config('request.headers', $1, true)`, [JSON.stringify({ 'cf-connecting-ip': ip })])
  return book(tx, ctx, fields)
})

describe('private business data', () => {
  it('hides every business from visitors and from other logged-in users', async () => {
    const ctx = await setup()
    const asVisitor = await as(ctx.db, 'anon', (tx) => tx.query('SELECT * FROM businesses'))
    expect(asVisitor.rows).toHaveLength(0)
    const other = await createUser(ctx.db, 'other@x.com')
    const asOther = await as(ctx.db, 'authenticated', (tx) => tx.query('SELECT * FROM businesses'), other)
    expect(asOther.rows).toHaveLength(0)
  })

  it('still lets an owner read their own business', async () => {
    const ctx = await setup()
    const { rows } = await as(ctx.db, 'authenticated', (tx) => tx.query('SELECT owner_phone FROM businesses'), ctx.ownerId)
    expect(rows).toEqual([{ owner_phone: '01099999999' }])
  })

  it('gives the booking page its profile without any private field', async () => {
    const ctx = await setup()
    const { rows } = await as(ctx.db, 'anon', (tx) => tx.query(`SELECT * FROM public_business_profile('alamal')`))
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe(ctx.business.name)
    expect(rows[0].public_phone).toBe('0220000000')
    expect(rows[0].is_locked).toBe(false)
    for (const key of ['owner_phone', 'owner_id', 'phone', 'trial_ends_at', 'subscription_type']) {
      expect(rows[0]).not.toHaveProperty(key)
    }
  })

  it('finds a business by id too, for old booking links', async () => {
    const ctx = await setup()
    const { rows } = await as(ctx.db, 'anon', (tx) => tx.query('SELECT id FROM public_business_profile($1)', [ctx.business.id]))
    expect(rows[0].id).toBe(ctx.business.id)
  })

  it('reports a lapsed subscription as locked', async () => {
    const ctx = await setup()
    await ctx.db.query(`UPDATE businesses SET trial_ends_at = now() - interval '1 day' WHERE id = $1`, [ctx.business.id])
    const { rows } = await as(ctx.db, 'anon', (tx) => tx.query(`SELECT is_locked FROM public_business_profile('alamal')`))
    expect(rows[0].is_locked).toBe(true)
  })

  it('answers whether a booking link is taken, for logged-in users only', async () => {
    const ctx = await setup()
    const { rows } = await as(ctx.db, 'authenticated', (tx) => tx.query(`SELECT booking_slug_taken('alamal') AS t`), ctx.ownerId)
    expect(rows[0].t).toBe(true)
    await expect(as(ctx.db, 'anon', (tx) => tx.query(`SELECT booking_slug_taken('alamal')`))).rejects.toThrow()
  })
})

describe('booked slots on the public page', () => {
  it('shows a booked time as counts only', async () => {
    const ctx = await setup()
    await bookAsVisitor(ctx)
    const { rows } = await as(ctx.db, 'anon', (tx) => tx.query('SELECT * FROM public_booked_slots($1, $2, $3)', [ctx.business.id, ctx.today, ctx.branch.id]))
    expect(rows).toEqual([{ slot_time: '10:00', booked: 1 }])
  })

  it('leaves appointments themselves unreadable', async () => {
    const ctx = await setup()
    await bookAsVisitor(ctx)
    const { rows } = await as(ctx.db, 'anon', (tx) => tx.query('SELECT * FROM appointments'))
    expect(rows).toHaveLength(0)
  })

  it('ignores waitlist entries and past days', async () => {
    const ctx = await setup()
    await bookAsVisitor(ctx, { status: 'waitlist' })
    const now = await as(ctx.db, 'anon', (tx) => tx.query('SELECT * FROM public_booked_slots($1, $2)', [ctx.business.id, ctx.today]))
    expect(now.rows).toEqual([])
    await ctx.db.query(`INSERT INTO appointments (business_id, branch_id, client_phone, appointment_date) VALUES ($1, $2, '01000000009', CURRENT_DATE - 30)`, [ctx.business.id, ctx.branch.id])
    const old = await as(ctx.db, 'anon', (tx) => tx.query(`SELECT * FROM public_booked_slots($1, (CURRENT_DATE - 30)::date)`, [ctx.business.id]))
    expect(old.rows).toEqual([])
  })
})

describe('public booking rules', () => {
  it('still accepts a normal visitor booking after the lock', async () => {
    const ctx = await setup()
    await bookAsVisitor(ctx)
    expect((await one(ctx.db, 'SELECT count(*)::int AS c FROM appointments')).c).toBe(1)
  })

  it('still refuses a business whose subscription lapsed', async () => {
    const ctx = await setup()
    await ctx.db.query('UPDATE businesses SET is_active = false WHERE id = $1', [ctx.business.id])
    await expect(bookAsVisitor(ctx)).rejects.toThrow()
  })

  it('still blocks a double booking of the same slot', async () => {
    const ctx = await setup()
    await bookAsVisitor(ctx)
    await expect(bookAsVisitor(ctx, { client_phone: '01000000002' })).rejects.toThrow(/CAPACITY_EXCEEDED/)
  })

  it('enforces two active bookings per phone in the database', async () => {
    const ctx = await setup()
    await bookAsVisitor(ctx, { appointment_time: '10:00' })
    await bookAsVisitor(ctx, { appointment_time: '11:00' })
    await expect(bookAsVisitor(ctx, { appointment_time: '12:00' })).rejects.toThrow(/BOOKING_LIMIT/)
  })

  it('wipes money and plan fields sent by a visitor', async () => {
    const ctx = await setup()
    await bookAsVisitor(ctx, { price: 1, amount_paid: 500, payment_status: 'paid', notes: 'spam', plan_visit_id: ctx.branch.id, reminder_sent: true })
    const row = await one(ctx.db, 'SELECT price, amount_paid, payment_status, notes, plan_visit_id, reminder_sent FROM appointments')
    expect(row).toEqual({ price: null, amount_paid: '0', payment_status: 'unpaid', notes: null, plan_visit_id: null, reminder_sent: false })
  })

  it('refuses a bad phone, a blank name, and another business service', async () => {
    const ctx = await setup()
    await expect(bookAsVisitor(ctx, { client_phone: 'abc' })).rejects.toThrow(/INVALID_BOOKING/)
    await expect(bookAsVisitor(ctx, { client_name: ' ' })).rejects.toThrow(/INVALID_BOOKING/)
    const u = await createUser(ctx.db, 'b@x.com')
    const b2 = await createBusiness(ctx.db, u, { booking_slug: 'b2' })
    const s2 = await one(ctx.db, 'INSERT INTO services (business_id) VALUES ($1) RETURNING id', [b2.id])
    await expect(bookAsVisitor(ctx, { service_id: s2.id })).rejects.toThrow(/INVALID_BOOKING/)
  })

  it('caps bookings from one address per business, without touching other addresses', async () => {
    const ctx = await setup()
    await ctx.db.query('UPDATE branches SET capacity = 1000')
    const seed = (count) => ctx.db.query(
      `INSERT INTO appointments (business_id, branch_id, client_phone, booking_ip_hash)
       SELECT $1, $2, '0109' || lpad(n::text, 7, '0'), md5('1.1.1.1') FROM generate_series(1, ${count}) n`,
      [ctx.business.id, ctx.branch.id]
    )
    await seed(59)
    await bookAsVisitor(ctx, { client_phone: '01000001999' })
    await expect(bookAsVisitor(ctx, { client_phone: '01000002000' })).rejects.toThrow(/RATE_LIMITED/)
    await bookAsVisitor(ctx, { client_phone: '01000002001' }, '2.2.2.2')
  })

  it('leaves the owner free to book without these limits and keeps their price', async () => {
    const ctx = await setup()
    await as(ctx.db, 'authenticated', async (tx) => {
      await book(tx, ctx, { appointment_time: '10:00', price: 300 })
      await book(tx, ctx, { appointment_time: '11:00' })
      await book(tx, ctx, { appointment_time: '12:00' })
    }, ctx.ownerId)
    const { rows } = await ctx.db.query('SELECT price FROM appointments WHERE price IS NOT NULL')
    expect(rows).toEqual([{ price: '300' }])
  })
})

describe('subscription fields', () => {
  it('stops an owner activating their own subscription, while other edits still save', async () => {
    const ctx = await setup()
    await as(ctx.db, 'authenticated', (tx) => tx.query(
      `UPDATE businesses SET subscription_type = 'paid', is_active = true, trial_ends_at = '2099-01-01', name = 'اسم جديد' WHERE id = $1`,
      [ctx.business.id]
    ), ctx.ownerId)
    const row = await one(ctx.db, 'SELECT subscription_type, trial_ends_at, name FROM businesses WHERE id = $1', [ctx.business.id])
    expect(row.subscription_type).toBe('trial')
    expect(new Date(row.trial_ends_at).getFullYear()).toBeLessThan(2099)
    expect(row.name).toBe('اسم جديد')
  })

  it('stops a new sign-up starting as paid', async () => {
    const ctx = await setup()
    const u = await createUser(ctx.db, 'new@x.com')
    await as(ctx.db, 'authenticated', (tx) => tx.query(
      `INSERT INTO businesses (owner_id, name, subscription_type, trial_ends_at) VALUES ($1, 'جديد', 'paid', '2099-01-01')`, [u]
    ), u)
    const row = await one(ctx.db, 'SELECT subscription_type, trial_ends_at FROM businesses WHERE owner_id = $1', [u])
    expect(row.subscription_type).toBe('trial')
    expect(new Date(row.trial_ends_at).getFullYear()).toBeLessThan(2099)
  })

  it('still lets the admin function activate a business', async () => {
    const ctx = await setup()
    await as(ctx.db, 'service_role', (tx) => tx.query(`UPDATE businesses SET subscription_type = 'paid' WHERE id = $1`, [ctx.business.id]))
    expect((await one(ctx.db, 'SELECT subscription_type FROM businesses')).subscription_type).toBe('paid')
  })
})

describe('logos and covers', () => {
  it('lets an owner manage only their own images', async () => {
    const ctx = await setup()
    const mine = `${ctx.business.id}/logo.png`
    await ctx.db.query(`INSERT INTO storage.objects (bucket_id, name) VALUES ('business-assets', $1)`, [mine])
    const other = await createUser(ctx.db, 'other@x.com')
    const del = await as(ctx.db, 'authenticated', (tx) => tx.query('DELETE FROM storage.objects WHERE name = $1', [mine]), other)
    expect(del.affectedRows).toBe(0)
    const insert = (tx) => tx.query(`INSERT INTO storage.objects (bucket_id, name) VALUES ('business-assets', $1)`, [`${ctx.business.id}/cover.png`])
    await expect(as(ctx.db, 'authenticated', insert, other)).rejects.toThrow()
    await as(ctx.db, 'authenticated', insert, ctx.ownerId)
    const own = await as(ctx.db, 'authenticated', (tx) => tx.query('DELETE FROM storage.objects WHERE name = $1', [mine]), ctx.ownerId)
    expect(own.affectedRows).toBe(1)
  })
})

describe('admin login attempts', () => {
  it('cannot be reached from the browser', async () => {
    const ctx = await setup()
    await expect(as(ctx.db, 'anon', (tx) => tx.query('SELECT * FROM admin_login_attempts'))).rejects.toThrow()
    await expect(as(ctx.db, 'authenticated', (tx) => tx.query(`INSERT INTO admin_login_attempts (ip_hash) VALUES ('x')`), ctx.ownerId)).rejects.toThrow()
  })
})

describe('order of rollout', () => {
  it('keeps the live site working after 039 and before 040', async () => {
    const ctx = await setup({ lock: false })
    const { rows } = await as(ctx.db, 'anon', (tx) => tx.query('SELECT name FROM businesses'))
    expect(rows).toHaveLength(1)
    await bookAsVisitor(ctx)
    expect((await one(ctx.db, 'SELECT count(*)::int AS c FROM appointments')).c).toBe(1)
  })
})
