ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS cover_url text,
  ADD COLUMN IF NOT EXISTS brand_color text DEFAULT '#10B981',
  ADD COLUMN IF NOT EXISTS booking_slug text UNIQUE,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS years_experience int,
  ADD COLUMN IF NOT EXISTS specialty text,
  ADD COLUMN IF NOT EXISTS instagram_url text,
  ADD COLUMN IF NOT EXISTS facebook_url text,
  ADD COLUMN IF NOT EXISTS google_reviews_url text,
  ADD COLUMN IF NOT EXISTS welcome_message text,
  ADD COLUMN IF NOT EXISTS cancellation_policy text,
  ADD COLUMN IF NOT EXISTS share_kit_generated boolean DEFAULT false;

CREATE OR REPLACE FUNCTION generate_booking_slug()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.booking_slug IS NULL THEN
    NEW.booking_slug := 'biz-' || substr(NEW.id::text, 1, 8);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_booking_slug ON businesses;
CREATE TRIGGER set_booking_slug
  BEFORE INSERT ON businesses
  FOR EACH ROW EXECUTE FUNCTION generate_booking_slug();

-- Backfill slugs for existing businesses
UPDATE businesses
SET booking_slug = 'biz-' || substr(id::text, 1, 8)
WHERE booking_slug IS NULL;
