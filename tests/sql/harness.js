// Runs Supabase migrations inside an in-process Postgres (PGlite) so the
// growth engine's SQL — constraints, RLS grants and every RPC — is exercised
// for real without touching the production database.
//
// Only the slice of Supabase the growth migration depends on is stubbed:
// the anon/authenticated/service_role roles, auth.users + auth.uid(), and the
// businesses columns it reads.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const readSql = (rel) => readFileSync(join(root, rel), 'utf8')

const SUPABASE_STUB = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;

  CREATE SCHEMA auth;
  CREATE TABLE auth.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

  CREATE TABLE businesses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name text NOT NULL,
    type text NOT NULL DEFAULT 'clinic',
    specialty text,
    phone text,
    owner_phone text,
    booking_slug text UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    trial_started_at timestamptz DEFAULT now(),
    trial_ends_at timestamptz DEFAULT (now() + interval '14 days'),
    is_active boolean DEFAULT true,
    subscription_type text DEFAULT 'trial',
    activated_at timestamptz
  );
  CREATE TABLE appointments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    client_name text NOT NULL DEFAULT 'عميل',
    client_phone text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
`

export async function freshDb({ migrate = true } = {}) {
  const db = new PGlite()
  await db.exec(SUPABASE_STUB)
  if (migrate) {
    await db.exec(readSql('supabase/migrations/032_growth_engine.sql'))
    if (migrate !== '032') await db.exec(readSql('supabase/migrations/033_growth_commissions.sql'))
    if (migrate !== '032' && migrate !== '033') await db.exec(readSql('supabase/migrations/034_growth_signup_ref.sql'))
    // Supabase grants the service role everything on new tables by default.
    await db.exec('GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;')
  }
  return db
}

/** Runs fn as a given Postgres role (and, for authenticated, a given user). */
export async function as(db, role, fn, userId = null) {
  return db.transaction(async (tx) => {
    if (userId) await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId])
    await tx.exec(`SET LOCAL ROLE ${role}`)
    return fn(tx)
  })
}

export async function createUser(db, email, createdAt = null, meta = {}) {
  const { rows } = await db.query(
    `INSERT INTO auth.users (email, created_at, raw_user_meta_data) VALUES ($1, coalesce($2::timestamptz, now()), $3::jsonb) RETURNING id`,
    [email, createdAt, JSON.stringify(meta)]
  )
  return rows[0].id
}

export async function createBusiness(db, ownerId, fields = {}) {
  const cols = { owner_id: ownerId, name: 'عيادة تجربة', type: 'clinic', ...fields }
  const keys = Object.keys(cols)
  const { rows } = await db.query(
    `INSERT INTO businesses (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
    Object.values(cols)
  )
  return rows[0]
}

export const one = async (db, sql, params) => (await db.query(sql, params)).rows[0]
