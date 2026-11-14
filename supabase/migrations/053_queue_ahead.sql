-- "How many are ahead of you" messages from the dashboard's today queue.
--
--   businesses.queue_notify_ahead    message a patient when this many are ahead (1..10, default 3)
--   appointments.queue_notified_at   when the clinic last sent that patient their place
--
-- The queue order is the booking time. The message goes out by hand through
-- wa.me from the clinic's own WhatsApp, like every other message.
--
-- Rollback: supabase/rollbacks/053_queue_ahead_down.sql.

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS queue_notify_ahead smallint NOT NULL DEFAULT 3
  CONSTRAINT businesses_queue_notify_ahead_check CHECK (queue_notify_ahead BETWEEN 1 AND 10);

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS queue_notified_at timestamptz;
