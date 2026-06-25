-- Client financial ledger: a chronological, running-balance record per
-- client, independent of any single appointment's price field. Every
-- charge (service/visit/ad-hoc) and every payment (full/partial, any
-- method) is one row; the balance accumulates over time like a bank
-- statement. Additive only — one new table.

CREATE TABLE IF NOT EXISTS client_ledger_entries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  client_phone text NOT NULL,
  entry_type text NOT NULL CHECK (entry_type IN ('charge', 'payment')),
  amount decimal(10,2) NOT NULL CHECK (amount > 0),
  payment_method text CHECK (payment_method IN ('cash', 'card', 'installment', 'other')),
  description text NOT NULL,
  related_appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_ledger_business_phone ON client_ledger_entries(business_id, client_phone, created_at);

-- Guards against the auto-charge trigger below double-billing the same
-- appointment if it's ever re-marked completed after being moved off
-- completed (toggle confirmed -> completed -> confirmed -> completed).
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_ledger_unique_appointment_charge
  ON client_ledger_entries(related_appointment_id)
  WHERE entry_type = 'charge' AND related_appointment_id IS NOT NULL;

ALTER TABLE client_ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all" ON client_ledger_entries
  FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));

-- Auto-creates a 'charge' entry when an appointment is completed with a
-- price set. appointments has no service_name column — the service name
-- is resolved via a JOIN to services through service_id.
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

DROP TRIGGER IF EXISTS on_appointment_complete_ledger ON appointments;
CREATE TRIGGER on_appointment_complete_ledger
AFTER UPDATE ON appointments
FOR EACH ROW WHEN (NEW.status IS DISTINCT FROM OLD.status)
EXECUTE FUNCTION create_ledger_charge_on_completion();
