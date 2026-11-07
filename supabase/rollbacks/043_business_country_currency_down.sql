-- Rollback for supabase/migrations/043_business_country_currency.sql.
-- Restores the function as 039 created it, then removes both columns. Every
-- account's chosen country and currency is lost. Roll the frontend back first,
-- because the settings page saves these columns.

BEGIN;

DROP FUNCTION IF EXISTS public_business_profile(text);

CREATE FUNCTION public_business_profile(p_ref text)
RETURNS TABLE (
  id uuid, name text, type text, working_hours jsonb, slot_duration int,
  logo_url text, cover_url text, brand_color text, bio text, specialty text,
  years_experience int, welcome_message text, cancellation_policy text,
  instagram_url text, facebook_url text, google_reviews_url text,
  booking_slug text, public_phone text, is_locked boolean
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
         (b.is_active IS FALSE OR (b.trial_ends_at IS NOT NULL AND b.trial_ends_at < now()))
  FROM businesses b
  WHERE b.booking_slug = p_ref OR b.id::text = p_ref
  ORDER BY (b.booking_slug = p_ref) DESC NULLS LAST
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public_business_profile(text) TO anon, authenticated;

ALTER TABLE businesses
  DROP CONSTRAINT IF EXISTS businesses_country_format,
  DROP CONSTRAINT IF EXISTS businesses_currency_format,
  DROP COLUMN IF EXISTS country,
  DROP COLUMN IF EXISTS currency;

COMMIT;
