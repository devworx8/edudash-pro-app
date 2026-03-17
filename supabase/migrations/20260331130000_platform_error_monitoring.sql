-- ============================================================
-- Platform Error Monitoring — 3-Tier System
-- ============================================================
-- Tier 1: Automated detection (cron scans logs → platform_error_logs)
-- Tier 2: Dash auto-debug (Haiku classifies → auto-resolves known patterns)
-- Tier 3: Team escalation (Sonnet diagnoses → platform_incidents → team routing)
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Error severity & status enums
-- ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE platform_error_severity AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE platform_error_status AS ENUM (
    'detected',        -- Tier 1: just found
    'classifying',     -- Tier 2: Dash Haiku analyzing
    'auto_resolved',   -- Tier 2: Dash fixed it
    'diagnosing',      -- Tier 3: Dash Sonnet deep analysis
    'escalated',       -- Tier 3: routed to team
    'acknowledged',    -- Team member picked it up
    'resolved',        -- Fixed
    'ignored'          -- False positive / acceptable
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE platform_incident_status AS ENUM (
    'open', 'investigating', 'mitigating', 'resolved', 'postmortem'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 2. platform_error_logs — every detected error
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_error_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Source identification
  source          TEXT NOT NULL DEFAULT 'supabase_logs',  -- supabase_logs, edge_function, client_sentry, manual
  source_log_id   TEXT,                                    -- original log ID for dedup
  -- Error details
  error_type      TEXT NOT NULL,                           -- schema_mismatch, rls_denial, auth_expired, server_error, timeout, rate_limit, unknown
  http_status     INT,
  http_method     TEXT,
  request_path    TEXT,
  error_message   TEXT,
  error_details   JSONB DEFAULT '{}',                      -- full log payload, headers, etc.
  -- Classification (filled by Tier 2)
  severity        platform_error_severity DEFAULT 'medium',
  status          platform_error_status DEFAULT 'detected',
  category        TEXT,                                    -- auth, data, payment, ai, communication, infrastructure
  -- AI analysis
  ai_diagnosis    TEXT,                                    -- Dash's analysis
  ai_model_used   TEXT,                                    -- haiku-4.5, sonnet-4.5, etc.
  ai_confidence   REAL,                                    -- 0.0–1.0
  ai_suggested_fix TEXT,                                   -- code/SQL suggestion
  auto_fix_applied BOOLEAN DEFAULT FALSE,
  -- Routing
  incident_id     UUID,                                    -- links to platform_incidents
  assigned_team   TEXT,                                    -- backend, frontend, auth, payments, ai, devops
  assigned_to     UUID,                                    -- specific team member
  -- Context
  affected_user_id UUID,                                   -- user who hit the error
  affected_org_id  UUID,                                   -- organization context
  user_agent      TEXT,
  ip_country      TEXT,
  -- Timestamps
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  classified_at   TIMESTAMPTZ,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dedup index: don't re-ingest the same log entry
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_errors_source_log
  ON platform_error_logs (source, source_log_id)
  WHERE source_log_id IS NOT NULL;

-- Hot-path queries: recent errors by status, by severity, by type
CREATE INDEX IF NOT EXISTS idx_platform_errors_status_created
  ON platform_error_logs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_errors_severity_created
  ON platform_error_logs (severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_errors_type_created
  ON platform_error_logs (error_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_errors_incident
  ON platform_error_logs (incident_id)
  WHERE incident_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 3. platform_incidents — grouped error patterns
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_incidents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  description     TEXT,
  status          platform_incident_status DEFAULT 'open',
  severity        platform_error_severity DEFAULT 'medium',
  -- Grouping
  error_type      TEXT NOT NULL,
  error_pattern   TEXT,                                    -- regex or key pattern for grouping
  category        TEXT,
  -- Metrics
  error_count     INT DEFAULT 1,
  affected_users  INT DEFAULT 0,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- AI analysis (Tier 3 — Sonnet)
  ai_root_cause   TEXT,
  ai_impact       TEXT,
  ai_recommended_fix TEXT,
  ai_model_used   TEXT,
  -- Routing
  assigned_team   TEXT,
  assigned_to     UUID,
  escalated_by    TEXT DEFAULT 'dash_ai',                  -- dash_ai, manual, threshold
  -- Resolution
  resolution_notes TEXT,
  resolved_by     UUID,
  resolved_at     TIMESTAMPTZ,
  -- Timestamps
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_incidents_status
  ON platform_incidents (status, severity, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_incidents_team
  ON platform_incidents (assigned_team, status);

-- ─────────────────────────────────────────────────────────────
-- 4. platform_error_resolutions — audit trail of fixes
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_error_resolutions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  error_log_id    UUID REFERENCES platform_error_logs(id) ON DELETE CASCADE,
  incident_id     UUID REFERENCES platform_incidents(id) ON DELETE SET NULL,
  -- What was done
  resolution_type TEXT NOT NULL,                           -- auto_fix, manual_fix, config_change, code_deploy, rollback, ignored
  description     TEXT NOT NULL,
  -- Who/what fixed it
  resolved_by     TEXT NOT NULL DEFAULT 'dash_ai',         -- dash_ai, user_id, system
  resolver_model  TEXT,                                    -- AI model if dash_ai
  -- Verification
  verified        BOOLEAN DEFAULT FALSE,
  verified_by     UUID,
  verified_at     TIMESTAMPTZ,
  -- Metadata
  fix_details     JSONB DEFAULT '{}',                      -- SQL run, config changed, etc.
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_resolutions_error
  ON platform_error_resolutions (error_log_id);
CREATE INDEX IF NOT EXISTS idx_platform_resolutions_incident
  ON platform_error_resolutions (incident_id)
  WHERE incident_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 5. platform_error_patterns — known patterns for fast matching
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_error_patterns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Pattern matching
  name            TEXT NOT NULL UNIQUE,
  error_type      TEXT NOT NULL,
  match_field     TEXT NOT NULL DEFAULT 'error_message',   -- which field to match
  match_pattern   TEXT NOT NULL,                           -- regex pattern
  -- Classification
  severity        platform_error_severity NOT NULL,
  category        TEXT NOT NULL,
  assigned_team   TEXT,
  -- Auto-resolution
  auto_resolvable BOOLEAN DEFAULT FALSE,
  fix_template    TEXT,                                    -- SQL/action template
  -- Metadata
  description     TEXT,
  hit_count       INT DEFAULT 0,
  last_hit_at     TIMESTAMPTZ,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 6. Seed known error patterns
-- ─────────────────────────────────────────────────────────────
INSERT INTO platform_error_patterns (name, error_type, match_field, match_pattern, severity, category, assigned_team, auto_resolvable, description)
VALUES
  ('schema_column_missing', 'schema_mismatch', 'error_message', 'column .+ does not exist|Could not find .+ in the schema', 'high', 'data', 'backend', FALSE, 'Query references a column that does not exist in the table schema'),
  ('rls_policy_violation', 'rls_denial', 'error_message', 'new row violates row-level security|permission denied for table', 'high', 'auth', 'backend', FALSE, 'RLS policy blocking a legitimate operation'),
  ('jwt_expired', 'auth_expired', 'error_message', 'JWT expired|token is expired', 'low', 'auth', 'frontend', TRUE, 'Client sent an expired JWT — auto-refresh should handle this'),
  ('rate_limited_429', 'rate_limit', 'error_message', '429|rate limit|too many requests', 'medium', 'infrastructure', 'devops', FALSE, 'API rate limit hit — check if quota needs adjustment'),
  ('edge_fn_timeout', 'timeout', 'error_message', 'timeout|FUNCTION_INVOCATION_TIMEOUT|context deadline exceeded', 'high', 'infrastructure', 'devops', FALSE, 'Edge function timed out — check payload size or downstream latency'),
  ('postgrest_400', 'schema_mismatch', 'request_path', '/rest/v1/', 'medium', 'data', 'backend', FALSE, 'PostgREST returned 400 — likely a schema/query mismatch'),
  ('storage_permission', 'rls_denial', 'request_path', '/storage/v1/', 'medium', 'auth', 'backend', FALSE, 'Storage access denied — check bucket RLS policies'),
  ('payment_webhook_fail', 'server_error', 'request_path', 'payfast', 'critical', 'payment', 'payments', FALSE, 'Payment webhook processing failed — revenue impact'),
  ('ai_proxy_error', 'server_error', 'request_path', 'ai-proxy', 'high', 'ai', 'ai', FALSE, 'AI proxy returned an error — check upstream API status'),
  ('notification_dispatch_fail', 'server_error', 'request_path', 'notifications-dispatcher', 'medium', 'communication', 'backend', FALSE, 'Notification dispatch failed — check email/push config')
ON CONFLICT (name) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 7. RLS policies — super_admin only
-- ─────────────────────────────────────────────────────────────
ALTER TABLE platform_error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_error_resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_error_patterns ENABLE ROW LEVEL SECURITY;

-- Helper: check if current user is super_admin
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin', 'superadmin', 'platform_admin', 'system_admin')
  );
$$;

-- All tables: super_admin full access
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'platform_error_logs',
    'platform_incidents',
    'platform_error_resolutions',
    'platform_error_patterns'
  ])
  LOOP
    EXECUTE format('
      CREATE POLICY "super_admin_full_%s" ON %I
        FOR ALL USING (is_platform_admin())
        WITH CHECK (is_platform_admin());
    ', tbl, tbl);
  END LOOP;
END $$;

-- Service role bypass for edge functions (implicit with service_role key)

-- ─────────────────────────────────────────────────────────────
-- 8. Helper RPC: increment incident counters
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION link_error_to_incident(
  p_error_id UUID,
  p_incident_id UUID,
  p_affected_user_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE platform_error_logs
  SET incident_id = p_incident_id
  WHERE id = p_error_id;

  UPDATE platform_incidents
  SET error_count = error_count + 1,
      last_seen_at = now(),
      affected_users = CASE
        WHEN p_affected_user_id IS NOT NULL THEN affected_users + 1
        ELSE affected_users
      END,
      updated_at = now()
  WHERE id = p_incident_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 9. Auto-update updated_at
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_platform_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_platform_incidents_updated
  BEFORE UPDATE ON platform_incidents
  FOR EACH ROW EXECUTE FUNCTION update_platform_updated_at();

CREATE TRIGGER trg_platform_error_patterns_updated
  BEFORE UPDATE ON platform_error_patterns
  FOR EACH ROW EXECUTE FUNCTION update_platform_updated_at();