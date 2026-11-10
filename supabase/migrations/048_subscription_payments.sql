-- What a clinic paid for a subscription and how, entered by the owner from
-- /admin when activating it. Both are optional, so a row exists only when one
-- of them was filled in.
--
-- Only the admin Edge Function reaches this table, through the service role.
-- Clinics and visitors have no access.

CREATE TABLE IF NOT EXISTS subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  days integer NOT NULL CHECK (days > 0),
  amount numeric(12, 2) CHECK (amount IS NULL OR amount >= 0),
  currency text NOT NULL DEFAULT 'EGP',
  method text CHECK (method IS NULL OR char_length(method) <= 100),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscription_payments_business_idx
  ON subscription_payments (business_id, created_at DESC);

ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON subscription_payments FROM anon, authenticated;
