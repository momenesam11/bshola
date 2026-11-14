-- Undoes 052_admin_business_summary.sql. It only read data, so nothing else changes.
DROP FUNCTION IF EXISTS admin_business_summary(uuid, integer);
