-- The notifications bell relies on a Supabase Realtime postgres_changes
-- subscription (see src/hooks/useNotifications.js) to show new
-- notifications instantly. That only works if the table is added to the
-- supabase_realtime publication — it wasn't, so the bell stayed silent
-- until the next manual refetch (page refresh / window focus).
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
