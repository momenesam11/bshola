-- BUGFIX: two separate defects found while testing C2/C4 with real
-- concurrent requests (see investigation in chat — confirmed via
-- `supabase db query --linked` against the live policy/trigger).
--
-- 1) The public_insert policy (019/022) checked branch ownership with
--    `branch_id IN (SELECT b.id FROM branches b WHERE b.business_id =
--    appointments.business_id)` — a nested subquery self-referencing the
--    row being inserted by the TABLE NAME ("appointments.business_id").
--    Empirically this resolved inconsistently: the exact same insert, with
--    identical valid data, sometimes passed and sometimes failed RLS
--    (proven by running the identical payload twice against the live DB
--    and getting opposite outcomes). Comparing the same underlying values
--    via literals always evaluated correctly, isolating the self-reference
--    as the defect. Fixed by checking the branch's owning business_id
--    against the bare (unambiguous) `business_id` column instead of
--    qualifying it with the table name inside a nested subquery.
--
-- 2) check_capacity_before_insert() (021) counted existing confirmed rows
--    with a plain SELECT before inserting — no locking. Postgres can't
--    auto-serialize this: row-level locks only protect EXISTING rows, and
--    for a slot's first booking there is no existing row for either
--    concurrent transaction to lock. Both transactions' COUNT queries run
--    under their own snapshot and never see each other's uncommitted
--    insert, so both can see count=0 and both pass — a classic
--    check-then-insert race (confirmed: two real concurrent inserts both
--    succeeded against a capacity=1 branch). Fixed by taking a
--    transaction-scoped advisory lock keyed to the exact slot
--    (branch_id + date + time) before counting, so the second concurrent
--    transaction blocks until the first commits, then re-counts against
--    the now-correct, committed state.

DROP POLICY IF EXISTS "public_insert" ON appointments;

CREATE POLICY "public_insert" ON appointments
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    business_id IN (
      SELECT id FROM businesses
      WHERE is_active = true
        AND (trial_ends_at IS NULL OR trial_ends_at >= now())
    )
    AND (SELECT b.business_id FROM branches b WHERE b.id = branch_id) = business_id
    AND appointment_date >= CURRENT_DATE
    AND status IN ('confirmed', 'waitlist')
  );

CREATE OR REPLACE FUNCTION check_capacity_before_insert()
RETURNS TRIGGER AS $$
DECLARE
  current_count int;
  max_capacity int;
BEGIN
  IF NEW.status != 'confirmed' THEN
    RETURN NEW;
  END IF;

  -- Serialize concurrent writers targeting the exact same slot. Held for
  -- the duration of this transaction and released automatically on
  -- commit/rollback — a second transaction for the same slot blocks here
  -- until the first finishes, so its COUNT below always sees the first
  -- transaction's committed (or rolled-back) outcome instead of racing it.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.branch_id::text || '|' || NEW.appointment_date::text || '|' || NEW.appointment_time::text, 0)
  );

  SELECT capacity INTO max_capacity FROM branches WHERE id = NEW.branch_id;
  IF max_capacity IS NULL THEN
    max_capacity := 1;
  END IF;

  SELECT COUNT(*) INTO current_count
  FROM appointments
  WHERE branch_id = NEW.branch_id
    AND appointment_date = NEW.appointment_date
    AND appointment_time = NEW.appointment_time
    AND status = 'confirmed'
    AND id != COALESCE(NEW.id, gen_random_uuid());

  IF current_count >= max_capacity THEN
    RAISE EXCEPTION 'CAPACITY_EXCEEDED: This time slot is fully booked';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
