-- ============================================================
-- GROWTH ENGINE v5 — daily automatic lead discovery (settings)
-- ============================================================
-- Once a day, the first time /admin/growth opens, the dashboard runs a few
-- Google Places searches on its own (clinic type × area, rotating through
-- the list day by day), keeps clinics that are open and have a phone, and
-- adds the new ones with the pain signals found in their reviews.
-- Every search still goes through growth_take_places_quota(), so the daily
-- budget cap applies. These columns hold what to search and where it got to.
--
-- Rollback: supabase/rollbacks/036_growth_auto_discover_down.sql.

ALTER TABLE growth_settings
  ADD COLUMN IF NOT EXISTS auto_discover_enabled    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_discover_categories text[]  NOT NULL DEFAULT ARRAY['dental','derma'],
  ADD COLUMN IF NOT EXISTS auto_discover_areas      text[]  NOT NULL DEFAULT ARRAY[
    'مدينة نصر','مصر الجديدة','المعادي','التجمع الخامس','الشيخ زايد','6 أكتوبر','المهندسين','الدقي',
    'الزمالك','المقطم','شبرا','فيصل','الهرم','حدائق الأهرام','العباسية','وسط البلد'],
  ADD COLUMN IF NOT EXISTS auto_discover_per_day    int NOT NULL DEFAULT 4 CHECK (auto_discover_per_day BETWEEN 1 AND 50),
  -- Position in the category × area list; each run continues where the last stopped.
  ADD COLUMN IF NOT EXISTS auto_discover_cursor     int NOT NULL DEFAULT 0 CHECK (auto_discover_cursor >= 0),
  ADD COLUMN IF NOT EXISTS auto_discover_last_run   date;
