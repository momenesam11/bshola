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
--
-- All the work is one DO statement on purpose, so it either finishes or changes
-- nothing. The Supabase SQL Editor doesn't keep BEGIN ... COMMIT together: an earlier
-- version failed here with "relation does not exist" on its temporary table, yet its
-- CREATE TABLE stayed. That run changed no numbers and left phone_unify_log empty,
-- which this version reuses.

DO $migration$
DECLARE
  -- The new number for a stored one, or NULL if it isn't an Egyptian mobile.
  unified CONSTANT text := $sql$CASE
      WHEN %1$s ~ '^01[0125][0-9]{8}$' THEN '20' || substr(%1$s, 2)
      WHEN %1$s ~ '^1[0125][0-9]{8}$' THEN '20' || %1$s
    END$sql$;
  new_phone text := format(unified, 'r.client_phone');
  skipped text[];
  t text;
  c clients%ROWTYPE;
  target clients%ROWTYPE;
  v_new text;
BEGIN
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

  -- Patients whose medical record would collide, under either older format.
  EXECUTE format($sql$
    SELECT coalesce(array_agg(DISTINCT r.business_id::text || '|' || %1$s), '{}')
    FROM patient_records r
    JOIN patient_records other
      ON other.business_id = r.business_id
     AND other.id <> r.id
     AND coalesce(%2$s, other.client_phone) = %1$s
    WHERE %1$s IS NOT NULL
  $sql$, new_phone, format(unified, 'other.client_phone'))
  INTO skipped;

  -- The tables that only need the number rewritten. Checked one by one, because the
  -- live database can differ from the migration files.
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
      WHERE %2$s IS NOT NULL AND NOT (r.business_id::text || '|' || %2$s) = ANY ($1)
    $sql$, t, new_phone) USING skipped;
    EXECUTE format($sql$
      UPDATE public.%1$I r
      SET client_phone = %2$s
      WHERE %2$s IS NOT NULL AND NOT (r.business_id::text || '|' || %2$s) = ANY ($1)
    $sql$, t, new_phone) USING skipped;
  END LOOP;

  -- clients has one row per number, and bookings create it automatically, so someone
  -- who booked under both formats has two. These hold only a name, notes and tags, so
  -- they merge safely: notes and tags move across and nothing is lost.
  FOR c IN
    SELECT * FROM clients WHERE phone ~ '^(01|1)[0125][0-9]{8}$' ORDER BY created_at, id
  LOOP
    v_new := '20' || regexp_replace(c.phone, '^0', '');
    IF (c.business_id::text || '|' || v_new) = ANY (skipped) THEN
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
$migration$;

-- Totals only, with no patient data.
SELECT
  (SELECT count(*) FROM phone_unify_log WHERE table_name = 'appointments') AS appointments_updated,
  (SELECT count(*) FROM phone_unify_log WHERE action = 'delete') AS duplicate_clients_merged,
  (SELECT count(*) FROM patient_records old
     JOIN patient_records other ON other.business_id = old.business_id AND other.client_phone = '20' || substr(old.client_phone, 2)
     WHERE old.client_phone ~ '^01[0125][0-9]{8}$') AS patients_left_with_two_files,
  (SELECT count(*) FROM appointments WHERE client_phone LIKE '0%') AS appointments_still_old_format;
