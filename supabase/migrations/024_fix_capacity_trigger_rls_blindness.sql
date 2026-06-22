-- CRITICAL BUGFIX: check_capacity_before_insert() (021/023) is a default
-- SECURITY INVOKER function — it runs with the privileges AND the RLS
-- restrictions of whoever fires the trigger. The public booking page
-- inserts as the "anon" role, and anon has NO SELECT policy on
-- appointments at all (only "public_insert", and "owner_all" is scoped
-- TO authenticated). That means the trigger's own
-- `SELECT COUNT(*) FROM appointments WHERE ...` was being silently
-- filtered by RLS down to zero rows every single time it ran for an anon
-- insert — regardless of concurrency, regardless of how many appointments
-- actually existed for that slot. Confirmed live: even with the advisory
-- lock from 023 in place (correctly serializing concurrent transactions),
-- two simultaneous anon bookings for a capacity=1 slot still both
-- succeeded, because the count the trigger computed was always 0 for
-- anon. This means public bookings were NEVER capacity-checked by this
-- trigger, not just under a race — a 3rd, 4th, 5th sequential public
-- booking past capacity would have succeeded too.
--
-- Fix: SECURITY DEFINER makes the function run as its owner (postgres),
-- which — like any table owner — bypasses RLS on tables it owns (RLS is
-- never forced here, no FORCE ROW LEVEL SECURITY was ever set), so the
-- COUNT sees every row regardless of which role fired the insert.
-- search_path is pinned explicitly, which is required practice for
-- SECURITY DEFINER functions to prevent search_path-hijacking.

ALTER FUNCTION check_capacity_before_insert() SECURITY DEFINER;
ALTER FUNCTION check_capacity_before_insert() SET search_path = public, pg_temp;
