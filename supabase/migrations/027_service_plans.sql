-- Service plans (follow-up scheduling) + per-appointment payment tracking.
-- Additive only: new tables, new nullable/defaulted columns on appointments.
-- Nothing existing is altered or dropped.

CREATE TABLE IF NOT EXISTS service_plans (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS service_plan_steps (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id uuid NOT NULL REFERENCES service_plans(id) ON DELETE CASCADE,
  step_order int NOT NULL,
  name text NOT NULL,
  day_offset int NOT NULL,
  linked_service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  default_price decimal(10,2),
  default_payment_type text CHECK (default_payment_type IN ('cash', 'card', 'installment', 'other')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_plan_steps_plan ON service_plan_steps(plan_id, step_order);

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS price decimal(10,2),
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('paid', 'unpaid', 'partial')),
  ADD COLUMN IF NOT EXISTS payment_type text CHECK (payment_type IN ('cash', 'card', 'installment', 'other')),
  ADD COLUMN IF NOT EXISTS amount_paid decimal(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS plan_step_id uuid REFERENCES service_plan_steps(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS triggering_appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL;

ALTER TABLE service_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_plan_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all" ON service_plans
  FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));

CREATE POLICY "owner_all_steps" ON service_plan_steps
  FOR ALL
  USING (plan_id IN (
    SELECT id FROM service_plans WHERE business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  ))
  WITH CHECK (plan_id IN (
    SELECT id FROM service_plans WHERE business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  ));
