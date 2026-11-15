-- Asking patients for a Google review after a visit.
--
--   businesses.google_review_url      the clinic's "write a review" link, set in Settings
--   appointments.review_requested_at  when the clinic sent the request for that visit
--
-- The message goes out by hand through wa.me like every other message. A patient
-- is asked once per clinic: the dashboard skips numbers that were asked before.
--
-- Rollback: supabase/rollbacks/051_google_review_request_down.sql.

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS google_review_url text
  CONSTRAINT businesses_google_review_url_check
  CHECK (google_review_url IS NULL OR (google_review_url ~ '^https://' AND char_length(google_review_url) <= 500));

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS review_requested_at timestamptz;

-- The dashboard looks up who was already asked, per clinic.
CREATE INDEX IF NOT EXISTS appointments_review_requested_idx
  ON appointments (business_id, client_phone) WHERE review_requested_at IS NOT NULL;
