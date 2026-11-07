-- Rewrites Egyptian mobile numbers saved as 01012345678 to 201012345678, the format
-- every phone field now saves. The phone is what ties a patient's history together,
-- so without this a returning patient shows up as a new one.
--
-- Run this AFTER the matching frontend deploys, so searching for 010... keeps
-- working. Take a backup first. It's safe to re-run, and the rollback undoes it.
--
-- What it leaves alone:
--   * Anything that isn't clearly an Egyptian mobile, such as landlines. 050... is
--     both a Mansoura landline and a Saudi mobile, so it can't be guessed.
--   * A patient with a medical record under both formats. Merging two medical files
--     by script could hide an allergy or attach it to the wrong person, so all of
--     that patient's rows stay as they are, and the result below counts them.
-- No appointment trigger fires on this: they all depend on status or time changing.

BEGIN;

-- Holds each row's previous value so the rollback can restore it. Patient phones
-- live here, so nobody but the database owner can read it.
CREATE TABLE IF NOT EXISTS phone_unify_log (
  id bigserial PRIMARY KEY,
  table_name text NOT NULL,
  row_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('update', 'delete', 'merge_target')),
  old_phone text,
  old_row jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE phone_unify_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON phone_unify_log FROM anon, authenticated;

CREATE OR REPLACE FUNCTION pg_temp.unified_phone(p text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p ~ '^01[0125][0-9]{8}$' THEN '20' || substr(p, 2)
    WHEN p ~ '^1[0125][0-9]{8}$' THEN '20' || p
  END
$$;

-- Patients whose medical record would collide, under either older format.
CREATE TEMP TABLE phone_unify_skipped ON COMMIT DROP AS
  SELECT old.business_id, pg_temp.unified_phone(old.client_phone) AS new_phone
  FROM patient_records old
  JOIN patient_records other
    ON other.business_id = old.business_id
   AND other.id <> old.id
   AND coalesce(pg_temp.unified_phone(other.client_phone), other.client_phone) = pg_temp.unified_phone(old.client_phone)
  WHERE pg_temp.unified_phone(old.client_phone) IS NOT NULL;

-- The tables that only need the number rewritten. Checked one by one, because the
-- live database can differ from the migration files.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['appointments', 'patient_records', 'diagnoses', 'prescriptions',
                           'medical_attachments', 'client_plans', 'client_ledger_entries']
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format($sql$
      INSERT INTO phone_unify_log (table_name, row_id, action, old_phone)
      SELECT %1$L, r.id, 'update', r.client_phone
      FROM public.%1$I r
      WHERE pg_temp.unified_phone(r.client_phone) IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM phone_unify_skipped s
          WHERE s.business_id = r.business_id AND s.new_phone = pg_temp.unified_phone(r.client_phone)
        )
    $sql$, t);
    EXECUTE format($sql$
      UPDATE public.%1$I r
      SET client_phone = pg_temp.unified_phone(r.client_phone)
      WHERE pg_temp.unified_phone(r.client_phone) IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM phone_unify_skipped s
          WHERE s.business_id = r.business_id AND s.new_phone = pg_temp.unified_phone(r.client_phone)
        )
    $sql$, t);
  END LOOP;
END;
$$;

-- clients has one row per number, and bookings create it automatically, so someone
-- who booked under both formats has two. These hold only a name, notes and tags, so
-- they merge safely: notes and tags move across and nothing is lost.
DO $$
DECLARE
  c clients%ROWTYPE;
  target clients%ROWTYPE;
  v_new text;
BEGIN
  FOR c IN
    SELECT * FROM clients
    WHERE pg_temp.unified_phone(phone) IS NOT NULL
    ORDER BY created_at, id
  LOOP
    v_new := pg_temp.unified_phone(c.phone);
    IF EXISTS (SELECT 1 FROM phone_unify_skipped s WHERE s.business_id = c.business_id AND s.new_phone = v_new) THEN
      CONTINUE;
    END IF;

    SELECT * INTO target FROM clients WHERE business_id = c.business_id AND phone = v_new;
    IF FOUND THEN
      INSERT INTO phone_unify_log (table_name, row_id, action, old_row) VALUES ('clients', target.id, 'merge_target', to_jsonb(target));
      INSERT INTO phone_unify_log (table_name, row_id, action, old_row) VALUES ('clients', c.id, 'delete', to_jsonb(c));
      UPDATE clients
      SET notes = nullif(concat_ws(E'\n', nullif(target.notes, ''), nullif(c.notes, '')), ''),
          tags = ARRAY(SELECT DISTINCT unnest(coalesce(target.tags, '{}') || coalesce(c.tags, '{}')))
      WHERE id = target.id;
      DELETE FROM clients WHERE id = c.id;
    ELSE
      INSERT INTO phone_unify_log (table_name, row_id, action, old_phone) VALUES ('clients', c.id, 'update', c.phone);
      UPDATE clients SET phone = v_new WHERE id = c.id;
    END IF;
  END LOOP;
END;
$$;

COMMIT;

-- Totals only, with no patient data.
SELECT
  (SELECT count(*) FROM phone_unify_log WHERE table_name = 'appointments') AS appointments_updated,
  (SELECT count(*) FROM phone_unify_log WHERE action = 'delete') AS duplicate_clients_merged,
  (SELECT count(*) FROM patient_records old
     JOIN patient_records other ON other.business_id = old.business_id AND other.client_phone = '20' || substr(old.client_phone, 2)
     WHERE old.client_phone ~ '^01[0125][0-9]{8}$') AS patients_left_with_two_files,
  (SELECT count(*) FROM appointments WHERE client_phone LIKE '0%') AS appointments_still_old_format;
