-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- BUSINESSES
-- ============================================================
CREATE TABLE IF NOT EXISTS businesses (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name              text NOT NULL,
  type              text NOT NULL CHECK (type IN ('clinic','salon','trainer','other')),
  phone             text,
  whatsapp_token    text,
  phone_number_id   text,
  working_hours     jsonb DEFAULT '{
    "sat":{"open":"09:00","close":"18:00","active":true},
    "sun":{"open":"09:00","close":"18:00","active":true},
    "mon":{"open":"09:00","close":"18:00","active":true},
    "tue":{"open":"09:00","close":"18:00","active":true},
    "wed":{"open":"09:00","close":"18:00","active":true},
    "thu":{"open":"09:00","close":"18:00","active":true},
    "fri":{"open":"09:00","close":"18:00","active":false}
  }'::jsonb,
  slot_duration     int NOT NULL DEFAULT 30,
  reminder_hours    int NOT NULL DEFAULT 24,
  reminder_template text DEFAULT 'مرحباً {client_name}، نذكرك بموعدك في {business_name} لخدمة {service} الساعة {time}. نتطلع لرؤيتك!',
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all" ON businesses
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- ============================================================
-- SERVICES
-- ============================================================
CREATE TABLE IF NOT EXISTS services (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id      uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name             text NOT NULL,
  duration_minutes int NOT NULL DEFAULT 30,
  price            decimal(10,2),
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all" ON services
  FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));

CREATE POLICY "public_select" ON services
  FOR SELECT USING (true);

-- ============================================================
-- APPOINTMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS appointments (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id       uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  service_id        uuid REFERENCES services(id) ON DELETE SET NULL,
  client_name       text NOT NULL,
  client_phone      text NOT NULL,
  appointment_date  date NOT NULL,
  appointment_time  time NOT NULL,
  status            text NOT NULL DEFAULT 'confirmed'
                    CHECK (status IN ('confirmed','cancelled','no_show','completed')),
  reminder_sent     boolean NOT NULL DEFAULT false,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all" ON appointments
  FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));

-- Public can INSERT (for the public booking page)
CREATE POLICY "public_insert" ON appointments
  FOR INSERT WITH CHECK (true);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_appointments_business_date
  ON appointments(business_id, appointment_date);

CREATE INDEX IF NOT EXISTS idx_appointments_reminder
  ON appointments(status, reminder_sent, appointment_date, appointment_time);

CREATE INDEX IF NOT EXISTS idx_services_business
  ON services(business_id);
