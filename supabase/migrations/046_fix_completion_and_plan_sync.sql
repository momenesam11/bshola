-- Three fixes found by testing the app against a real Postgres. Only function
-- bodies change, no table or column does.
--
-- 1. Marking an appointment that has a price as "completed" failed with
--    "there is no unique or exclusion constraint matching the ON CONFLICT
--    specification" (42P10). The ON CONFLICT clause has to imply the partial
--    unique index's full predicate, and it left out
--    "related_appointment_id IS NOT NULL".
--
-- 2. Online bookings have no price of their own (guard_public_booking clears it),
--    so completing one never reached the client's statement, even though the
--    client profile already counts it at the service's price. Fall back to the
--    service's price here too.
--
-- 3. Moving a completed or no-show appointment back to "confirmed" left its plan
--    visit on "attended"/"no_show", so the plan counted a visit that didn't happen.

CREATE OR REPLACE FUNCTION create_ledger_charge_on_completion()
RETURNS TRIGGER AS $$
DECLARE
  svc_name text;
  svc_price numeric;
  charge numeric;
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    SELECT name, price INTO svc_name, svc_price FROM services WHERE id = NEW.service_id;
    charge := COALESCE(NEW.price, svc_price);
    IF charge IS NOT NULL AND charge > 0 THEN
      INSERT INTO client_ledger_entries (business_id, client_phone, entry_type, amount, description, related_appointment_id)
      VALUES (NEW.business_id, NEW.client_phone, 'charge', charge, COALESCE(svc_name, 'خدمة'), NEW.id)
      ON CONFLICT (related_appointment_id) WHERE entry_type = 'charge' AND related_appointment_id IS NOT NULL
      DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION sync_plan_visit_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.plan_visit_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    UPDATE client_plan_visits
    SET status = 'scheduled', appointment_id = NEW.id, updated_at = now()
    WHERE id = NEW.plan_visit_id;
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'completed' THEN
      UPDATE client_plan_visits SET status = 'attended', updated_at = now() WHERE id = NEW.plan_visit_id;
    ELSIF NEW.status = 'no_show' THEN
      UPDATE client_plan_visits SET status = 'no_show', updated_at = now() WHERE id = NEW.plan_visit_id;
    ELSIF NEW.status = 'cancelled' THEN
      UPDATE client_plan_visits SET status = 'cancelled', appointment_id = NULL, updated_at = now() WHERE id = NEW.plan_visit_id;
    ELSIF NEW.status = 'confirmed' THEN
      -- Only while the visit is still this appointment's. After a cancellation
      -- the same visit may already belong to a newer appointment.
      UPDATE client_plan_visits
      SET status = 'scheduled', appointment_id = NEW.id, updated_at = now()
      WHERE id = NEW.plan_visit_id AND (appointment_id = NEW.id OR appointment_id IS NULL);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
