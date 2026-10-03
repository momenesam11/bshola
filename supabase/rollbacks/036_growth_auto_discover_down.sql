-- Rollback for supabase/migrations/036_growth_auto_discover.sql.
ALTER TABLE growth_settings
  DROP COLUMN IF EXISTS auto_discover_enabled,
  DROP COLUMN IF EXISTS auto_discover_categories,
  DROP COLUMN IF EXISTS auto_discover_areas,
  DROP COLUMN IF EXISTS auto_discover_per_day,
  DROP COLUMN IF EXISTS auto_discover_cursor,
  DROP COLUMN IF EXISTS auto_discover_last_run;
