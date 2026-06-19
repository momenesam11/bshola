-- Public contact number shown to customers on the booking page — distinct
-- from businesses.owner_phone (private, used for billing/trial contact).
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS public_phone text;
