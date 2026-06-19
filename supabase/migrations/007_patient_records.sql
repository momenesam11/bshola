CREATE TABLE patient_records (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  client_phone text NOT NULL,
  client_name text NOT NULL,
  date_of_birth date,
  gender text CHECK (gender IN ('male','female')),
  national_id text,
  email text,
  address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  blood_type text CHECK (blood_type IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  allergies text[] DEFAULT '{}',
  chronic_conditions text[] DEFAULT '{}',
  current_medications text[] DEFAULT '{}',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(business_id, client_phone)
);

CREATE TABLE diagnoses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  client_phone text NOT NULL,
  diagnosis text NOT NULL,
  treatment text,
  notes text,
  follow_up_date date,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE prescriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  client_phone text NOT NULL,
  medications jsonb NOT NULL DEFAULT '[]',
  instructions text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE medical_attachments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  client_phone text NOT NULL,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text CHECK (file_type IN ('xray','lab','report','other')),
  file_size int,
  notes text,
  uploaded_at timestamptz DEFAULT now()
);

ALTER TABLE patient_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnoses ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all" ON patient_records FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));
CREATE POLICY "owner_all" ON diagnoses FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));
CREATE POLICY "owner_all" ON prescriptions FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));
CREATE POLICY "owner_all" ON medical_attachments FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER patient_records_updated_at
  BEFORE UPDATE ON patient_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
