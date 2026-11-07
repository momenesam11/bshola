-- Darkens the green that accounts get by default or pick from the colour list,
-- so white text on booking pages is easier to read. Other colours are untouched.
-- Safe to run more than once.

ALTER TABLE businesses ALTER COLUMN brand_color SET DEFAULT '#0D9B6C';

UPDATE businesses
SET brand_color = '#0D9B6C'
WHERE upper(brand_color) = '#10B981';
