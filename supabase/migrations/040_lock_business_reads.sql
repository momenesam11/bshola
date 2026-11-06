-- Security hardening, part 2 of 2. Run this only AFTER the frontend that uses
-- public_business_profile() is live. Running it earlier takes booking pages down.
--
-- Closes the open read on businesses: visitors and other logged-in users could
-- read every column of every business, including owner phone numbers. Owners keep
-- reading their own row through owner_all.

DROP POLICY IF EXISTS "public_select_businesses" ON businesses;
