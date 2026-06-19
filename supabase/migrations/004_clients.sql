-- clients table
CREATE TABLE clients (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  notes text DEFAULT '',
  tags text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  UNIQUE(business_id, phone)
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all" ON clients FOR ALL USING (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())
);

-- Auto-insert client when new appointment is booked
CREATE OR REPLACE FUNCTION handle_new_appointment_client()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO clients (business_id, name, phone)
  VALUES (NEW.business_id, NEW.client_name, NEW.client_phone)
  ON CONFLICT (business_id, phone) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_new_appointment
AFTER INSERT ON appointments
FOR EACH ROW EXECUTE FUNCTION handle_new_appointment_client();
