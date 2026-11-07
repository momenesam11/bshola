// Boots a real Postgres (PGlite) with the same schema production was built from:
// every file in supabase/migrations, in order, on top of a small stand-in for
// the parts Supabase provides (auth, storage, cron, realtime). Row level
// security, triggers and RPCs are the real ones, so a test that passes here has
// gone through the same database rules a browser hits on the live site.

import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const MIGRATIONS = join(root, 'supabase', 'migrations')

export const SUPABASE_STUB = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;

  CREATE SCHEMA extensions;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text UNIQUE,
    encrypted_password text,
    raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('request.jwt.claim.role', true), '')
  $$;
  CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
    SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;

  CREATE SCHEMA storage;
  CREATE TABLE storage.buckets (
    id text PRIMARY KEY, name text NOT NULL, public boolean DEFAULT false,
    file_size_limit bigint, allowed_mime_types text[],
    created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
  );
  CREATE TABLE storage.objects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket_id text REFERENCES storage.buckets(id),
    name text NOT NULL,
    owner uuid,
    metadata jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE (bucket_id, name)
  );
  CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
    SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
  $$;
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
  GRANT ALL ON storage.objects, storage.buckets TO anon, authenticated, service_role;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA storage TO anon, authenticated, service_role;

  CREATE SCHEMA cron;
  CREATE TABLE cron.job (jobid serial PRIMARY KEY, jobname text, schedule text, command text);
  CREATE FUNCTION cron.schedule(a text, b text, c text) RETURNS bigint LANGUAGE sql AS $$
    INSERT INTO cron.job (jobname, schedule, command) VALUES (a, b, c) RETURNING jobid::bigint
  $$;
  CREATE FUNCTION cron.unschedule(a text) RETURNS boolean LANGUAGE sql AS $$
    DELETE FROM cron.job WHERE jobname = a RETURNING true
  $$;
  CREATE SCHEMA net;
  CREATE FUNCTION net.http_post(url text, headers jsonb DEFAULT '{}', body jsonb DEFAULT '{}')
    RETURNS bigint LANGUAGE sql AS 'SELECT 0::bigint';

  CREATE PUBLICATION supabase_realtime;

  -- Supabase's default: everything created in public is reachable by these
  -- roles and RLS decides row access. Without this the grants differ from prod.
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
`

// pg_net / pg_cron calls in old migrations read settings that only exist in prod.
export const SETTINGS = `
  SET app.supabase_url = 'http://local';
  SET app.supabase_service_role_key = 'local';
`

export function listMigrations() {
  return readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()
}

export async function bootDatabase() {
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp')
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto')
  const db = new PGlite({ extensions: { uuid_ossp, pgcrypto } })
  await db.exec(SUPABASE_STUB)
  await db.exec(SETTINGS)
  for (const file of listMigrations()) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS, file), 'utf8'))
    } catch (e) {
      e.message = `${file}: ${e.message}`
      throw e
    }
  }
  return db
}
