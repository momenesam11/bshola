-- BUGFIX: BookingPage.onSubmitClient's "max 2 active bookings per phone"
-- guard ran `supabase.from('appointments').select('id', { count: 'exact',
-- head: true })...` as anon — same root cause as the useCreateAppointment
-- .select() bug just fixed: anon has no SELECT policy on appointments at
-- all, so this always silently returned count=0, and the guard never
-- triggered for real anonymous visitors (confirmed live: a 3rd booking
-- past the limit succeeded instead of being rejected).
--
-- Granting anon a blanket SELECT policy would fix the count but leak every
-- other client's name/phone/appointment history to any visitor — anon has
-- no stable identity to scope a row-policy to "your own phone number"
-- against (anyone could just query any phone number). Instead, expose a
-- narrow SECURITY DEFINER function that returns only a count, never rows.

CREATE OR REPLACE FUNCTION count_active_bookings(p_business_id uuid, p_phone text)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COUNT(*)::int FROM appointments
  WHERE business_id = p_business_id
    AND client_phone = p_phone
    AND status IN ('confirmed', 'waitlist')
    AND appointment_date >= CURRENT_DATE;
$$;

GRANT EXECUTE ON FUNCTION count_active_bookings(uuid, text) TO anon, authenticated;
