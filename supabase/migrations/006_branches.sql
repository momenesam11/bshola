CREATE TABLE branches (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  phone text,
  is_main boolean DEFAULT false,
  working_hours jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all_branches" ON branches FOR ALL
  USING (business_id IN (
    SELECT id FROM businesses WHERE owner_id = auth.uid()
  ));

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id);
ALTER TABLE services ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id);

INSERT INTO branches (business_id, name, is_main)
SELECT id, name || ' - الفرع الرئيسي', true FROM businesses
ON CONFLICT DO NOTHING;
