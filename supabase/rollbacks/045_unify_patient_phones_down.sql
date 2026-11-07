-- Rollback for supabase/migrations/045_unify_patient_phones.sql.
-- Puts every changed row back as it was, using the log 045 kept, then drops the
-- log. Newest changes are undone first. Bookings made after 045 keep their numbers.

BEGIN;

DO $$
DECLARE
  l phone_unify_log%ROWTYPE;
BEGIN
  FOR l IN SELECT * FROM phone_unify_log ORDER BY id DESC LOOP
    IF l.action = 'update' THEN
      EXECUTE format('UPDATE public.%I SET %I = $1 WHERE id = $2',
                     l.table_name, CASE WHEN l.table_name = 'clients' THEN 'phone' ELSE 'client_phone' END)
        USING l.old_phone, l.row_id;
    ELSIF l.action = 'delete' THEN
      INSERT INTO clients SELECT * FROM jsonb_populate_record(NULL::clients, l.old_row);
    ELSIF l.action = 'merge_target' THEN
      UPDATE clients c
      SET notes = r.notes, tags = r.tags
      FROM jsonb_populate_record(NULL::clients, l.old_row) r
      WHERE c.id = l.row_id;
    END IF;
  END LOOP;
END;
$$;

DROP TABLE phone_unify_log;

COMMIT;
