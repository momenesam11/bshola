-- Undoes 053_queue_ahead.sql. Drops the setting and the record of who was told
-- their place; nothing else depends on them.
ALTER TABLE appointments DROP COLUMN IF EXISTS queue_notified_at;
ALTER TABLE businesses DROP COLUMN IF EXISTS queue_notify_ahead;
