-- Rollback for supabase/migrations/042_darken_default_brand_green.sql.
-- Every account on the darker green returns to the previous green, including any
-- account that picked it after 042 ran.

ALTER TABLE businesses ALTER COLUMN brand_color SET DEFAULT '#10B981';

UPDATE businesses
SET brand_color = '#10B981'
WHERE upper(brand_color) = '#0D9B6C';
