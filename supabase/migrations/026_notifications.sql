-- Dashboard notifications: bell icon feed for new bookings, cancellations,
-- and waitlist joins. Additive only — new table + triggers, no existing
-- schema touched.

CREATE TABLE IF NOT EXISTS notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('new_booking', 'cancellation', 'waitlist_joined')),
  title text NOT NULL,
  body text,
  related_appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_business_unread ON notifications(business_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_business_created ON notifications(business_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all" ON notifications
  FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));

-- SECURITY DEFINER: the public booking page inserts appointments as the
-- anon role, which has no INSERT policy on notifications. The trigger must
-- be able to write the notification regardless of who created the row.
CREATE OR REPLACE FUNCTION notify_new_appointment()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'confirmed' THEN
    INSERT INTO notifications (business_id, type, title, body, related_appointment_id)
    VALUES (
      NEW.business_id, 'new_booking', 'حجز جديد',
      NEW.client_name || ' حجز موعد جديد', NEW.id
    );
  ELSIF NEW.status = 'waitlist' THEN
    INSERT INTO notifications (business_id, type, title, body, related_appointment_id)
    VALUES (
      NEW.business_id, 'waitlist_joined', 'انضمام لقائمة الانتظار',
      NEW.client_name || ' انضم لقائمة الانتظار', NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_appointment_insert_notify ON appointments;
CREATE TRIGGER on_appointment_insert_notify
AFTER INSERT ON appointments
FOR EACH ROW EXECUTE FUNCTION notify_new_appointment();

CREATE OR REPLACE FUNCTION notify_cancellation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    INSERT INTO notifications (business_id, type, title, body, related_appointment_id)
    VALUES (
      NEW.business_id, 'cancellation', 'إلغاء موعد',
      'تم إلغاء موعد ' || NEW.client_name, NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_appointment_update_notify ON appointments;
CREATE TRIGGER on_appointment_update_notify
AFTER UPDATE ON appointments
FOR EACH ROW EXECUTE FUNCTION notify_cancellation();
