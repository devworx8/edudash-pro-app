-- Fix: "unrecognized configuration parameter app.supabase_url" (SQLSTATE 42704)
-- The platform-error-monitor cron used current_setting() without the missing_ok flag.
-- This migration reschedules the cron jobs with the safe current_setting(..., true) pattern
-- and COALESCE fallbacks.

-- NOTE: You must set these via Supabase Dashboard > Project Settings > Database:
--   app.supabase_url = 'https://lvvvjywrmpcqrpvuptdi.supabase.co'
--   app.cron_secret = '<your service_role key>'
-- Without these, cron jobs will silently skip (no error, but no execution).

-- ─────────────────────────────────────────────────────────────
-- Reschedule platform-error-monitor cron with safe pattern
-- ─────────────────────────────────────────────────────────────
SELECT cron.unschedule('platform-error-monitor-scan')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'platform-error-monitor-scan'
);

SELECT cron.unschedule('platform-error-monitor-daily')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'platform-error-monitor-daily'
);

-- Every 15 minutes scan
SELECT cron.schedule(
  'platform-error-monitor-scan',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := coalesce(
      current_setting('app.supabase_url', true),
      'https://lvvvjywrmpcqrpvuptdi.supabase.co'
    ) || '/functions/v1/platform-error-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(
        current_setting('app.cron_secret', true),
        current_setting('app.supabase_service_role_key', true),
        ''
      )
    ),
    body := '{"source": "pg_cron", "scheduled": true}'::jsonb
  );
  $$
);

-- Daily deep scan at 03:00 UTC (05:00 SAST)
SELECT cron.schedule(
  'platform-error-monitor-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := coalesce(
      current_setting('app.supabase_url', true),
      'https://lvvvjywrmpcqrpvuptdi.supabase.co'
    ) || '/functions/v1/platform-error-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(
        current_setting('app.cron_secret', true),
        current_setting('app.supabase_service_role_key', true),
        ''
      )
    ),
    body := '{"source": "pg_cron", "scheduled": true, "scan_minutes": 1440, "max_errors": 200}'::jsonb
  );
  $$
);
