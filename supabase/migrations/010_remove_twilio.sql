-- Remove Twilio columns (they were never used — credentials live in edge function env vars)
ALTER TABLE businesses
  DROP COLUMN IF EXISTS twilio_account_sid,
  DROP COLUMN IF EXISTS twilio_auth_token,
  DROP COLUMN IF EXISTS twilio_whatsapp_from,
  DROP COLUMN IF EXISTS whatsapp_token,
  DROP COLUMN IF EXISTS phone_number_id;
