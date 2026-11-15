-- Undoes 059_admin_insights.sql: the /admin feature-usage column and platform
-- numbers stop showing (the page says the migration is missing). No data lost.
DROP FUNCTION IF EXISTS admin_feature_usage();
DROP FUNCTION IF EXISTS admin_platform_stats();
