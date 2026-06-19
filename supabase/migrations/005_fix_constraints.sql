-- Fix 1: Remove hardcoded type constraint so all business verticals are accepted
ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_type_check;

-- Fix 2: Add 'waitlist' to appointments status so waitlist feature works
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE appointments ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('confirmed','cancelled','no_show','completed','waitlist'));
