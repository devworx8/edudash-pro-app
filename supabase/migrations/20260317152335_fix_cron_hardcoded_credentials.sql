-- Fix: "permission denied to set parameter app.supabase_url" (SQLSTATE 42501)
-- On Supabase hosted Free plan, ALTER ROLE/DATABASE SET is blocked for custom params.
-- Solution: hardcode the public project URL and anon key directly in cron jobs.
-- The anon key is already public (committed in eas.json, client-side bundles).
-- Edge Functions deployed with --no-verify-jwt don't validate the Bearer token.

-- ─────────────────────────────────────────────────────────────
-- Reschedule platform-error-monitor with hardcoded values
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
    url := 'https://lvvvjywrmpcqrpvuptdi.supabase.co/functions/v1/platform-error-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2dnZqeXdybXBjcXJwdnVwdGRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MjA3NjYsImV4cCI6MjA4ODE4MDc2Nn0.wmoA2YsOHjYxdMggkVhWn8P7qw0YILG4WgKQXGVASfg'
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
    url := 'https://lvvvjywrmpcqrpvuptdi.supabase.co/functions/v1/platform-error-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2dnZqeXdybXBjcXJwdnVwdGRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MjA3NjYsImV4cCI6MjA4ODE4MDc2Nn0.wmoA2YsOHjYxdMggkVhWn8P7qw0YILG4WgKQXGVASfg'
    ),
    body := '{"source": "pg_cron", "scheduled": true, "scan_minutes": 1440, "max_errors": 200}'::jsonb
  );
  $$
);
