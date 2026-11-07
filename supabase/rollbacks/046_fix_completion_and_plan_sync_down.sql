-- Puts both functions back as 029 and 030 left them. This restores the 42P10
-- failure when completing a priced appointment, so only use it to back 046 out.

CREATE OR REPLACE FUNCTION create_ledger_charge_on_completion()
RETURNS TRIGGER AS $$
DECLARE
  svc_name text;
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' AND NEW.price IS NOT NULL AND NEW.price > 0 THEN
    SELECT name INTO svc_name FROM services WHERE id = NEW.service_id;
    INSERT INTO client_ledger_entries (business_id, client_phone, entry_type, amount, description, related_appointment_id)
    VALUES (NEW.business_id, NEW.client_phone, 'charge', NEW.price, COALESCE(svc_name, 'خدمة'), NEW.id)
    ON CONFLICT (related_appointment_id) WHERE entry_type = 'charge' DO NOTHING;
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
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
