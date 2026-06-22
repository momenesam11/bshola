-- SECURITY FIX (C3): migration 012 granted the "anon" role UPDATE on
-- businesses(subscription_type, is_active, trial_ends_at, activated_at,
-- activated_by) with a USING(true) policy, relying on a password screen in
-- the React component to gate access. But the anon key is public — it ships
-- in every visitor's browser — so that password screen enforced nothing at
-- the database level: anyone could activate/deactivate/extend ANY business
-- with a direct REST call, password or not.
--
-- All admin writes now go through the `admin` Edge Function, which checks
-- the password against a secret that never reaches the client and writes
-- using the service-role key (which bypasses RLS regardless of grants
-- below). So anon's grant here is no longer needed by the app and is
-- revoked entirely.

DROP POLICY IF EXISTS "admin_update_trial_fields" ON businesses;
REVOKE UPDATE ON businesses FROM anon;

-- Session storage for the admin dashboard. RLS is enabled with no policies
-- for anon/authenticated, so only the service-role key (used inside the
-- Edge Function) can read or write it — anon/authenticated get nothing.
CREATE TABLE IF NOT EXISTS admin_sessions (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '8 hours')
);
ALTER TABLE admin_sessions ENABLE ROW LEVEL SECURITY;
