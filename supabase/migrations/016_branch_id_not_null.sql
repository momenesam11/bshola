-- Enforce that every appointment is tied to a real branch. The previous bug
-- (BookingPage inserting branch_id = NULL for single-branch businesses) is
-- fixed at the application layer; this constraint prevents it from ever
-- silently regressing again. Safe to apply now — all test data was wiped.
ALTER TABLE appointments ALTER COLUMN branch_id SET NOT NULL;
