-- Undoes 056_patient_short_link.sql: back to the 054 /my/<uuid> page.
-- Short links already sent stop working.
GRANT EXECUTE ON FUNCTION patient_portal(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION patient_cancel_appointment(uuid, uuid) TO anon, authenticated;
DROP FUNCTION IF EXISTS patient_cancel(text, uuid, text);
DROP FUNCTION IF EXISTS patient_page(text);
DROP FUNCTION IF EXISTS patients_ahead(appointments);
DROP TABLE IF EXISTS patient_link_attempts;

CREATE OR REPLACE FUNCTION appointments_own_manage_token()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.manage_token := gen_random_uuid();
    NEW.cancelled_by_patient_at := NULL;
    IF current_user = 'anon' THEN
      NEW.review_requested_at := NULL;
      NEW.queue_notified_at := NULL;
    END IF;
  ELSE
    NEW.manage_token := OLD.manage_token;
  END IF;
  RETURN NEW;
END;
$$;

DROP INDEX IF EXISTS appointments_manage_code_key;
ALTER TABLE appointments DROP COLUMN IF EXISTS manage_code;
DROP FUNCTION IF EXISTS new_manage_code();
