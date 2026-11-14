-- Undoes 054_patient_self_service.sql. Links already sent stop working.
-- Appointments patients cancelled stay cancelled.
DROP FUNCTION IF EXISTS patient_cancel_appointment(uuid, uuid);
DROP FUNCTION IF EXISTS patient_portal(uuid);
DROP FUNCTION IF EXISTS patient_can_cancel(appointments, businesses);
DROP FUNCTION IF EXISTS cancellation_notice_hours(text);
DROP FUNCTION IF EXISTS business_time_zone(text);
DROP TRIGGER IF EXISTS appointments_own_manage_token ON appointments;
DROP FUNCTION IF EXISTS appointments_own_manage_token();
DROP INDEX IF EXISTS appointments_manage_token_key;
ALTER TABLE appointments DROP COLUMN IF EXISTS cancelled_by_patient_at;
ALTER TABLE appointments DROP COLUMN IF EXISTS manage_token;
