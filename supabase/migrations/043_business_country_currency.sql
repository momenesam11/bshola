-- Gives each account a country and a currency, for clinics outside Egypt. Every
-- existing account stays on Egypt and the pound through the defaults.
-- Run this BEFORE the matching frontend deploys, because the settings page saves
-- these columns. Safe to run while the current site is live, and safe to re-run.

BEGIN;

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'EG',
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'EGP';

ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_country_format;
ALTER TABLE businesses ADD CONSTRAINT businesses_country_format CHECK (country ~ '^[A-Z]{2}$');
ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_currency_format;
ALTER TABLE businesses ADD CONSTRAINT businesses_currency_format CHECK (currency ~ '^[A-Z]{3}$');

-- The booking page needs these to show prices and the right phone code. Adding
-- output columns changes the function's type, which requires dropping it first.
-- The transaction means booking pages never see it missing.
DROP FUNCTION IF EXISTS public_business_profile(text);

CREATE FUNCTION public_business_profile(p_ref text)
RETURNS TABLE (
  id uuid, name text, type text, working_hours jsonb, slot_duration int,
  logo_url text, cover_url text, brand_color text, bio text, specialty text,
  years_experience int, welcome_message text, cancellation_policy text,
  instagram_url text, facebook_url text, google_reviews_url text,
  booking_slug text, public_phone text, is_locked boolean,
  country text, currency text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT b.id, b.name, b.type, b.working_hours, b.slot_duration,
         b.logo_url, b.cover_url, b.brand_color, b.bio, b.specialty,
         b.years_experience, b.welcome_message, b.cancellation_policy,
         b.instagram_url, b.facebook_url, b.google_reviews_url,
         b.booking_slug, b.public_phone,
         (b.is_active IS FALSE OR (b.trial_ends_at IS NOT NULL AND b.trial_ends_at < now())),
         b.country, b.currency
  FROM businesses b
  WHERE b.booking_slug = p_ref OR b.id::text = p_ref
  ORDER BY (b.booking_slug = p_ref) DESC NULLS LAST
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public_business_profile(text) TO anon, authenticated;

COMMIT;
