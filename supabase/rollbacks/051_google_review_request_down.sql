-- Undoes 051_google_review_request.sql. Drops the review link and the record of
-- who was asked; nothing else depends on them.
DROP INDEX IF EXISTS appointments_review_requested_idx;
ALTER TABLE appointments DROP COLUMN IF EXISTS review_requested_at;
ALTER TABLE businesses DROP COLUMN IF EXISTS google_review_url;
