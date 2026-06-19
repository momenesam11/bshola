-- ============================================================
-- TRIAL MANAGEMENT SYSTEM
-- ============================================================
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz DEFAULT (now() + interval '14 days'),
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS subscription_type text DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS owner_phone text,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS activated_by text;

-- Backfill trial_ends_at for businesses created before this migration
UPDATE businesses
SET trial_ends_at = created_at + interval '14 days'
WHERE trial_ends_at IS NULL;

-- ============================================================
-- ADMIN DASHBOARD ACCESS (/mawid-super-admin-2025)
-- The admin dashboard is gated by a hardcoded password check in the
-- component, not Supabase auth — it always talks to Supabase as the
-- "anon" role (via a dedicated client with no session attached, see
-- src/lib/supabaseAdmin.js), even if the browser also has a logged-in
-- business owner session. Reading is already covered by the existing
-- "public_select_businesses" policy (migration 011). Writing is scoped
-- to only the trial/subscription columns via a column-level GRANT,
-- combined with a permissive RLS policy — both scoped to "anon" only,
-- so the existing owner_all policy and authenticated-role privileges
-- (used by Settings/onboarding) are left completely untouched.
-- ============================================================
DROP POLICY IF EXISTS "admin_update_trial_fields" ON businesses;
CREATE POLICY "admin_update_trial_fields" ON businesses
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

REVOKE UPDATE ON businesses FROM anon;
GRANT UPDATE (subscription_type, is_active, trial_ends_at, activated_at, activated_by)
  ON businesses TO anon;
