-- Run this in Supabase SQL Editor after enabling pg_cron extension
-- (Database → Extensions → pg_cron)

-- Schedule the send-reminders edge function every 30 minutes
SELECT cron.schedule(
  'send-whatsapp-reminders',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
