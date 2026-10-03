-- Rollback for supabase/migrations/032_growth_engine.sql.
-- Drops everything that migration created and nothing else: no existing
-- table (businesses, appointments, …) is altered by 032, so none is touched here.
-- Run in the Supabase SQL editor. THIS DELETES ALL GROWTH DATA (leads,
-- activities, partners) — export them from /admin/growth first if needed.

DO $$
BEGIN
  -- Nested, not AND-ed: the cron.job reference must not even be planned
  -- when pg_cron is absent.
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'growth-sync-platform') THEN
      PERFORM cron.unschedule('growth-sync-platform');
    END IF;
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS growth_take_places_quota();
DROP FUNCTION IF EXISTS growth_log_activity(uuid, text, text, text, text, timestamptz, text);
DROP FUNCTION IF EXISTS growth_import_leads(jsonb, text);
DROP FUNCTION IF EXISTS growth_sync_platform();
DROP FUNCTION IF EXISTS growth_attribute_signup(text);
DROP FUNCTION IF EXISTS growth_get_preview(text);
DROP FUNCTION IF EXISTS growth_submit_lead(text, text, text, text, text, jsonb, text);
DROP FUNCTION IF EXISTS growth_resolve_ref(text);
DROP FUNCTION IF EXISTS growth_category_for_business(text, text);
DROP FUNCTION IF EXISTS growth_add_signal(uuid, text, text, text, text);

DROP TABLE IF EXISTS growth_activities;
DROP TABLE IF EXISTS growth_leads;
DROP TABLE IF EXISTS growth_partners;
DROP TABLE IF EXISTS growth_settings;

DROP FUNCTION IF EXISTS growth_touch_updated_at();
DROP FUNCTION IF EXISTS growth_normalize_phone(text);
