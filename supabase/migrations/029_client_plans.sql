-- Client visit plans: a manually-defined sequence of N visits for ONE
-- client (e.g. "كورس علاج الأسنان — 4 زيارات"), not tied to any specific
-- service. Each visit tracks its own booking/attendance status independent
-- of the others. Additive only — new tables + one new nullable column.

CREATE TABLE IF NOT EXISTS client_plans (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  client_phone text NOT NULL,
  name text NOT NULL,
  total_visits int NOT NULL CHECK (total_visits > 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_plan_visits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id uuid NOT NULL REFERENCES client_plans(id) ON DELETE CASCADE,
  visit_number int NOT NULL,
  suggested_date date,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'attended', 'no_show', 'cancelled')),
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_plans_business_phone ON client_plans(business_id, client_phone);
CREATE INDEX IF NOT EXISTS idx_client_plan_visits_plan ON client_plan_visits(plan_id, visit_number);

ALTER TABLE client_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_plan_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all" ON client_plans
  FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));

CREATE POLICY "owner_all_visits" ON client_plan_visits
  FOR ALL
  USING (plan_id IN (
    SELECT id FROM client_plans WHERE business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  ))
  WITH CHECK (plan_id IN (
    SELECT id FROM client_plans WHERE business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  ));

-- Links an appointment back to the plan-visit slot it fulfills. Set by the
-- app when the owner books a plan visit (via "حجز الآن"/"إعادة حجز").
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS plan_visit_id uuid REFERENCES client_plan_visits(id) ON DELETE SET NULL;

-- Keeps client_plan_visits.status in sync with the linked appointment's
-- status, in both directions:
--   INSERT  -> visit becomes 'scheduled', appointment_id set
--   completed/no_show/cancelled -> visit status mirrors it
-- A cancelled appointment clears appointment_id so the same visit slot can
-- be linked to a brand new appointment later (reschedule).
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

DROP TRIGGER IF EXISTS on_appointment_insert_sync_plan ON appointments;
CREATE TRIGGER on_appointment_insert_sync_plan
AFTER INSERT ON appointments
FOR EACH ROW EXECUTE FUNCTION sync_plan_visit_status();

DROP TRIGGER IF EXISTS on_appointment_update_sync_plan ON appointments;
CREATE TRIGGER on_appointment_update_sync_plan
AFTER UPDATE ON appointments
FOR EACH ROW WHEN (NEW.status IS DISTINCT FROM OLD.status)
EXECUTE FUNCTION sync_plan_visit_status();
