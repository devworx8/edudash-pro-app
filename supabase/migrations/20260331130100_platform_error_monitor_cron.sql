-- ============================================================
-- Cron: Platform Error Monitor — every 15 minutes
-- ============================================================
-- Scans Supabase logs for errors, classifies with Haiku,
-- escalates complex issues to Sonnet, notifies super admins.
-- ============================================================

SELECT cron.unschedule('platform-error-monitor-scan')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'platform-error-monitor-scan'
);

SELECT cron.schedule(
  'platform-error-monitor-scan',
  '*/15 * * * *',  -- every 15 minutes
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/platform-error-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.cron_secret')
    ),
    body := '{"source": "pg_cron", "scheduled": true}'::jsonb
  );
  $$
);

-- Also run a daily deep-scan at 03:00 UTC (05:00 SAST) with larger window
SELECT cron.unschedule('platform-error-monitor-daily')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'platform-error-monitor-daily'
);

SELECT cron.schedule(
  'platform-error-monitor-daily',
  '0 3 * * *',  -- 03:00 UTC / 05:00 SAST
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/platform-error-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.cron_secret')
    ),
    body := '{"source": "pg_cron", "scheduled": true, "scan_minutes": 1440, "max_errors": 200}'::jsonb
  );
  $$
);
