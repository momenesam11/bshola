-- Two patients must never hold the same number in the same period.
--
-- Until now a number was unique per start time (057's unique index), and a
-- booking snapped to its period's start. But when a clinic changed its hours
-- (the evening moved from 18:55 to 18:00), the bookings made before stayed on
-- 18:55 with numbers 1-3, and the next one at 18:00 started again at 1: one
-- period, two number 1s. Now the period decides, not the exact time:
--
--   queue_period_of(business, branch, date, time)
--       the period a booking is in: queue_period_start() (061), or its own
--       time when it falls in no period.
--   assign_queue_number()
--       the next number is the highest in the whole period + 1, and the
--       online limit counts the whole period, old start times included.
--   queue_period_key(appointment)
--       a booking's place in its period's line, counted from the period start.
--   public_queue_periods(), patients_ahead(), public_queue_screen()
--       count and show the whole period the same way.
--
-- Numbers already given are not changed: duplicates that already exist are
-- fixed by the clinic with queue_realign() (061, the «انقلهم لفتراتهم»
-- banner), which tells the patients whose number changes.
--
-- Same signatures; additive; safe to run again.
-- Rollback: supabase/rollbacks/062_queue_number_per_period_down.sql.

CREATE OR REPLACE FUNCTION queue_period_of(p_business_id uuid, p_branch_id uuid, p_date date, p_time time)
RETURNS time
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(queue_period_start(p_business_id, p_branch_id, p_date, p_time), p_time)
$$;

-- A booking's place in its period's line: like queue_key() (058), but counted
-- from the period's start, so a booking left on an old start time (18:55 in a
-- period that now starts 18:00) still lines up by its number. A place set by
-- "رجّعه" (queue_sort) wins, as in queue_key().
CREATE OR REPLACE FUNCTION queue_period_key(a appointments)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(a.queue_sort,
    extract(epoch FROM queue_period_of(a.business_id, a.branch_id, a.appointment_date, a.appointment_time))::numeric
      + coalesce(a.queue_number, 0)::numeric / 1000)
$$;

CREATE OR REPLACE FUNCTION assign_queue_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  b businesses%ROWTYPE;
  v_is_owner boolean;
  v_taken integer;
  v_start time;
BEGIN
  -- queue_realign() is placing these rows itself, in this transaction only.
  IF current_setting('beshola.queue_realign', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.status <> 'confirmed' THEN
    RETURN NEW;
  END IF;
  SELECT * INTO b FROM businesses WHERE id = NEW.business_id;
  IF b.booking_mode IS DISTINCT FROM 'queue' THEN
    NEW.queue_number := NULL;
    RETURN NEW;
  END IF;

  v_start := queue_period_start(NEW.business_id, NEW.branch_id, NEW.appointment_date, NEW.appointment_time);
  IF v_start IS NOT NULL THEN
    NEW.appointment_time := v_start;
  END IF;

  -- An update keeps its number unless the visit moved to another period.
  IF TG_OP = 'UPDATE' AND OLD.queue_number IS NOT NULL
     AND NEW.appointment_date = OLD.appointment_date
     AND NEW.branch_id IS NOT DISTINCT FROM OLD.branch_id
     AND queue_period_of(NEW.business_id, NEW.branch_id, NEW.appointment_date, NEW.appointment_time)
       = queue_period_of(OLD.business_id, OLD.branch_id, OLD.appointment_date, OLD.appointment_time) THEN
    NEW.appointment_time := OLD.appointment_time;
    NEW.queue_number := OLD.queue_number;
    RETURN NEW;
  END IF;

  -- One booking at a time per period (the key is the period's start).
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'queue|' || NEW.business_id::text || '|' || coalesce(NEW.branch_id::text, '') || '|'
      || NEW.appointment_date::text || '|' || NEW.appointment_time::text, 0));

  v_is_owner := auth.uid() IS NOT NULL AND b.owner_id = auth.uid();
  IF NOT v_is_owner AND coalesce(auth.role(), '') <> 'service_role' AND b.queue_limit IS NOT NULL THEN
    SELECT count(*) INTO v_taken FROM appointments a
      WHERE a.business_id = NEW.business_id AND a.branch_id IS NOT DISTINCT FROM NEW.branch_id
        AND a.appointment_date = NEW.appointment_date
        AND queue_period_of(a.business_id, a.branch_id, a.appointment_date, a.appointment_time) = NEW.appointment_time
        AND a.status IN ('confirmed', 'completed', 'no_show')
        AND a.id <> coalesce(NEW.id, gen_random_uuid());
    IF v_taken >= b.queue_limit THEN
      RAISE EXCEPTION 'QUEUE_FULL: this period is fully booked';
    END IF;
  END IF;

  -- The highest number anywhere in the period, old start times included.
  SELECT coalesce(max(a.queue_number), 0) + 1 INTO NEW.queue_number FROM appointments a
    WHERE a.business_id = NEW.business_id AND a.branch_id IS NOT DISTINCT FROM NEW.branch_id
      AND a.appointment_date = NEW.appointment_date
      AND a.id <> coalesce(NEW.id, gen_random_uuid())
      AND queue_period_of(a.business_id, a.branch_id, a.appointment_date, a.appointment_time) = NEW.appointment_time;
  RETURN NEW;
END;
$$;

-- 058's per-period counts, grouped by period rather than by exact time.
CREATE OR REPLACE FUNCTION public_queue_periods(p_business_id uuid, p_branch_id uuid, p_date date)
RETURNS TABLE (period_start time, taken integer, next_number integer, current_number integer, started boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    t.p,
    (count(*) FILTER (WHERE t.status IN ('confirmed', 'completed', 'no_show')))::int,
    (coalesce(max(t.queue_number), 0) + 1)::int,
    coalesce(
      (array_agg(t.queue_number ORDER BY t.called_at DESC) FILTER (WHERE t.status = 'confirmed' AND t.called_at IS NOT NULL))[1],
      (array_agg(t.queue_number ORDER BY t.queue_number, t.created_at) FILTER (WHERE t.status = 'confirmed'))[1]
    )::int,
    bool_or(t.status IN ('completed', 'no_show') OR t.called_at IS NOT NULL)
  FROM (
    SELECT a.*, queue_period_of(a.business_id, a.branch_id, a.appointment_date, a.appointment_time) AS p
    FROM appointments a
    WHERE a.business_id = p_business_id
      AND a.branch_id IS NOT DISTINCT FROM p_branch_id
      AND a.appointment_date = p_date
      AND a.queue_number IS NOT NULL
  ) t
  GROUP BY t.p
$$;

-- 060's count, with "the same period" decided by the period, not the exact time.
CREATE OR REPLACE FUNCTION patients_ahead(a appointments)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN a.called_at IS NOT NULL THEN 0 ELSE (
    SELECT count(*)::int FROM appointments x
    WHERE x.business_id = a.business_id
      AND x.appointment_date = a.appointment_date
      AND x.status = 'confirmed'
      AND x.id <> a.id
      AND (a.branch_id IS NULL OR x.branch_id IS NULL OR x.branch_id = a.branch_id)
      AND (x.called_at IS NOT NULL OR (
        CASE WHEN a.queue_number IS NOT NULL AND x.queue_number IS NOT NULL THEN
          -- By turn: the same period, lower number first.
          queue_period_of(x.business_id, x.branch_id, x.appointment_date, x.appointment_time)
            = queue_period_of(a.business_id, a.branch_id, a.appointment_date, a.appointment_time)
          AND (queue_period_key(x), x.created_at) < (queue_period_key(a), a.created_at)
        ELSE (queue_key(x), x.created_at) < (queue_key(a), a.created_at) END
      ))
  ) END
$$;

-- 060's waiting-room screen, with the current period's line taken by period.
CREATE OR REPLACE FUNCTION public_queue_screen(p_ref text, p_branch_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  b businesses%ROWTYPE;
  br branches%ROWTYPE;
  v_today date;
  v_now time;
  v_blocks jsonb;
  v_period time;
BEGIN
  SELECT * INTO b FROM businesses WHERE booking_slug = p_ref OR id::text = p_ref LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'NOT_FOUND'); END IF;
  IF b.is_active IS FALSE OR (b.trial_ends_at IS NOT NULL AND b.trial_ends_at < now()) THEN
    RETURN jsonb_build_object('error', 'LOCKED');
  END IF;
  SELECT * INTO br FROM branches
  WHERE business_id = b.id AND (p_branch_id IS NULL OR id = p_branch_id)
  ORDER BY is_main DESC, created_at LIMIT 1;
  v_today := (now() AT TIME ZONE business_time_zone(b.country))::date;
  v_now := (now() AT TIME ZONE business_time_zone(b.country))::time;

  IF b.booking_mode = 'queue' THEN
    -- The period running now (branch hours, else the clinic's), else the next today, else the last.
    v_period := queue_period_start(b.id, br.id, v_today, v_now);
    IF v_period IS NULL THEN
      v_blocks := coalesce(br.schedule_blocks -> (ARRAY['sun','mon','tue','wed','thu','fri','sat'])[extract(dow FROM v_today)::int + 1], '[]'::jsonb);
      SELECT coalesce(
        (SELECT min((k->>'start')::time) FROM jsonb_array_elements(v_blocks) k WHERE (k->>'start')::time > v_now),
        (SELECT max((k->>'start')::time) FROM jsonb_array_elements(v_blocks) k)
      ) INTO v_period;
    END IF;
    IF v_period IS NULL THEN
      SELECT coalesce(
        (SELECT queue_period_of(a.business_id, a.branch_id, a.appointment_date, a.appointment_time) FROM appointments a
          WHERE a.business_id = b.id AND a.appointment_date = v_today AND a.branch_id IS NOT DISTINCT FROM br.id
            AND a.status = 'confirmed' AND a.called_at IS NOT NULL ORDER BY a.called_at DESC LIMIT 1),
        (SELECT min(queue_period_of(a.business_id, a.branch_id, a.appointment_date, a.appointment_time)) FROM appointments a
          WHERE a.business_id = b.id AND a.appointment_date = v_today AND a.branch_id IS NOT DISTINCT FROM br.id
            AND a.status = 'confirmed'))
      INTO v_period;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'name', b.name,
    'logo_url', b.logo_url,
    'brand_color', b.brand_color,
    'mode', b.booking_mode,
    'today', v_today,
    'period_start', to_char(v_period, 'HH24:MI'),
    'minutes', consult_minutes(b.id),
    'branch', CASE WHEN br.id IS NULL THEN NULL ELSE jsonb_build_object('id', br.id, 'name', br.name) END,
    'branches', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name) ORDER BY x.is_main DESC, x.created_at), '[]'::jsonb)
                 FROM branches x WHERE x.business_id = b.id),
    'inside', (
      SELECT jsonb_build_object('number', a.queue_number, 'time', to_char(a.appointment_time, 'HH24:MI'))
      FROM appointments a
      WHERE a.business_id = b.id AND a.appointment_date = v_today
        AND a.branch_id IS NOT DISTINCT FROM br.id
        AND a.status = 'confirmed' AND a.called_at IS NOT NULL
      ORDER BY a.called_at DESC LIMIT 1),
    'line', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('number', t.queue_number, 'time', to_char(t.appointment_time, 'HH24:MI')) ORDER BY t.k, t.created_at), '[]'::jsonb)
      FROM (
        SELECT a.queue_number, a.appointment_time, a.created_at,
               -- By turn the line goes by number within the period.
               CASE WHEN b.booking_mode = 'queue' AND a.queue_number IS NOT NULL
                    THEN queue_period_key(a) ELSE queue_key(a) END AS k
        FROM appointments a
        WHERE a.business_id = b.id AND a.appointment_date = v_today
          AND a.branch_id IS NOT DISTINCT FROM br.id
          AND a.status = 'confirmed' AND a.called_at IS NULL
          AND (v_period IS NULL OR queue_period_of(a.business_id, a.branch_id, a.appointment_date, a.appointment_time) = v_period)
        ORDER BY 4, a.created_at
        LIMIT 200
      ) t)
  );
END;
$$;

REVOKE ALL ON FUNCTION queue_period_of(uuid, uuid, date, time) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION queue_period_key(appointments) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION queue_period_key(appointments) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION queue_period_of(uuid, uuid, date, time) TO authenticated, service_role;
REVOKE ALL ON FUNCTION patients_ahead(appointments) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public_queue_periods(uuid, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_queue_periods(uuid, uuid, date) TO anon, authenticated;
REVOKE ALL ON FUNCTION public_queue_screen(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_queue_screen(text, uuid) TO anon, authenticated;
