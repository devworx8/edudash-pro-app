/**
 * Platform Error Monitor — 3-Tier Error Detection & Resolution
 * ═══════════════════════════════════════════════════════════════
 * Tier 1: Scan Supabase logs for errors (400+, 500+)
 * Tier 2: Classify with Haiku (fast, cheap) — auto-resolve known patterns
 * Tier 3: Escalate unknowns to Sonnet (deep diagnosis) → create incidents
 *
 * Called by pg_cron every 15 minutes, or manually from super-admin dashboard.
 */

import { serve } from 'https://deno.land/std@0.214.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

// ─── Config ──────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
const DASH_SUPABASE_PROJECT_REF = Deno.env.get('DASH_SUPABASE_PROJECT_REF') || '';
const DASH_SUPABASE_ACCESS_TOKEN = Deno.env.get('DASH_SUPABASE_ACCESS_TOKEN') || ''; // Management API

const HAIKU_MODEL = 'claude-haiku-4-5-20241022';
const SONNET_MODEL = 'claude-sonnet-4-5-20250514';
const SCAN_WINDOW_MINUTES = 20; // overlap with 15-min cron to avoid gaps
const MAX_ERRORS_PER_SCAN = 50;
const CONFIDENCE_THRESHOLD_AUTO_RESOLVE = 0.85;
const CONFIDENCE_THRESHOLD_ESCALATE = 0.5; // below this → Sonnet analysis

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ─── Types ───────────────────────────────────────────────────
interface LogEntry {
  id: string;
  timestamp: number;
  event_message: string;
  metadata?: Record<string, unknown>[];
}

interface ClassifiedError {
  error_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  assigned_team: string;
  diagnosis: string;
  suggested_fix: string;
  confidence: number;
  auto_resolvable: boolean;
}

interface ErrorPattern {
  id: string;
  name: string;
  error_type: string;
  match_field: string;
  match_pattern: string;
  severity: string;
  category: string;
  assigned_team: string;
  auto_resolvable: boolean;
  fix_template: string | null;
}

// ─── Log Scanning (Tier 1) ──────────────────────────────────
function parseLogEntry(entry: LogEntry) {
  const msg = entry.event_message || '';
  const meta = Array.isArray(entry.metadata) ? entry.metadata[0] : (entry.metadata || {});

  // Extract HTTP status from event message: "GET | 400 | ..."
  const statusMatch = msg.match(/(?:GET|POST|PUT|PATCH|DELETE)\s*\|\s*(\d{3})\s*\|/);
  const httpStatus = statusMatch ? parseInt(statusMatch[1], 10) : null;

  // Extract method
  const methodMatch = msg.match(/^(GET|POST|PUT|PATCH|DELETE)\s*\|/);
  const httpMethod = methodMatch ? methodMatch[1] : null;

  // Extract path from URL in message
  const urlMatch = msg.match(/https?:\/\/[^/]+(\/.+?)(?:\?|$|\s|\|)/);
  const requestPath = urlMatch ? urlMatch[1] : null;

  // Extract request details from metadata
  const request = getNestedValue(meta, 'request') as Record<string, unknown> | null;
  const response = getNestedValue(meta, 'response') as Record<string, unknown> | null;
  const headers = getNestedValue(request, 'headers') as Record<string, unknown> | null;

  const userAgent = getStringValue(headers, 'user_agent') ||
    getStringValue(headers, 'x_forwarded_user_agent');
  const ipCountry = getStringValue(headers, 'cf_ipcountry');

  // Extract user ID from JWT metadata
  const sb = getNestedValue(request, 'sb') as Record<string, unknown> | null;
  const authUser = getStringValue(sb, 'auth_user');

  const responseStatus = getNumberValue(response, 'status_code') || httpStatus;

  return {
    source_log_id: entry.id,
    http_status: responseStatus,
    http_method: httpMethod,
    request_path: requestPath,
    error_message: msg,
    error_details: meta,
    user_agent: userAgent,
    ip_country: ipCountry,
    affected_user_id: authUser,
    occurred_at: new Date(entry.timestamp / 1000).toISOString(),
  };
}

// ─── Pattern Matching (Tier 2 — Fast Path) ──────────────────
function matchPattern(
  parsed: ReturnType<typeof parseLogEntry>,
  patterns: ErrorPattern[],
): ErrorPattern | null {
  for (const pattern of patterns) {
    const fieldValue = (parsed as Record<string, unknown>)[pattern.match_field];
    if (typeof fieldValue !== 'string') continue;

    try {
      const regex = new RegExp(pattern.match_pattern, 'i');
      if (regex.test(fieldValue)) return pattern;
    } catch {
      // Invalid regex in pattern — skip
    }
  }
  return null;
}

// ─── AI Classification (Tier 2/3) ───────────────────────────
async function classifyWithAI(
  parsed: ReturnType<typeof parseLogEntry>,
  model: string,
  tier: 'triage' | 'diagnosis',
): Promise<ClassifiedError> {
  const systemPrompt = tier === 'triage'
    ? `You are Dash, an AI operations assistant for EduDash Pro (a South African education platform).
Classify this API error quickly. Return ONLY valid JSON with these fields:
- error_type: schema_mismatch | rls_denial | auth_expired | server_error | timeout | rate_limit | config_error | unknown
- severity: low | medium | high | critical
- category: auth | data | payment | ai | communication | infrastructure
- assigned_team: backend | frontend | auth | payments | ai | devops
- diagnosis: 1-2 sentence summary of what went wrong
- suggested_fix: specific actionable fix (SQL, code change, or config)
- confidence: 0.0-1.0 how confident you are
- auto_resolvable: true only if this can be safely auto-fixed without human review`
    : `You are Dash, a senior platform engineer for EduDash Pro (SA education platform).
Perform deep root-cause analysis on this error. Consider:
1. The full request path, headers, and response metadata
2. Whether this is a recurring pattern or one-off
3. The impact on users (especially teachers, parents, students)
4. Whether this could indicate a broader system issue

Return ONLY valid JSON with:
- error_type, severity, category, assigned_team (same options as triage)
- diagnosis: detailed root-cause analysis (3-5 sentences)
- suggested_fix: specific fix with code/SQL if applicable
- confidence: 0.0-1.0
- auto_resolvable: boolean`;

  const userMessage = JSON.stringify({
    http_status: parsed.http_status,
    http_method: parsed.http_method,
    request_path: parsed.request_path,
    error_message: parsed.error_message.slice(0, 500),
    user_agent: parsed.user_agent,
    ip_country: parsed.ip_country,
    // Don't send full details to save tokens in triage
    ...(tier === 'diagnosis' ? { error_details: parsed.error_details } : {}),
  }, null, 2);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: tier === 'triage' ? 300 : 800,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      console.error(`[ErrorMonitor] AI ${tier} failed: ${response.status}`);
      return fallbackClassification(parsed);
    }

    const result = await response.json();
    const text = result.content?.[0]?.text || '';

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return fallbackClassification(parsed);

    const classified = JSON.parse(jsonMatch[0]) as ClassifiedError;
    return {
      error_type: classified.error_type || 'unknown',
      severity: classified.severity || 'medium',
      category: classified.category || 'infrastructure',
      assigned_team: classified.assigned_team || 'backend',
      diagnosis: classified.diagnosis || 'Unable to determine root cause',
      suggested_fix: classified.suggested_fix || 'Manual investigation required',
      confidence: Math.max(0, Math.min(1, classified.confidence || 0.5)),
      auto_resolvable: classified.auto_resolvable === true,
    };
  } catch (error) {
    console.error(`[ErrorMonitor] AI ${tier} error:`, error);
    return fallbackClassification(parsed);
  }
}

function fallbackClassification(parsed: ReturnType<typeof parseLogEntry>): ClassifiedError {
  const status = parsed.http_status || 0;
  return {
    error_type: status >= 500 ? 'server_error' : status === 401 ? 'auth_expired' : status === 403 ? 'rls_denial' : status === 400 ? 'schema_mismatch' : 'unknown',
    severity: status >= 500 ? 'high' : 'medium',
    category: status === 401 || status === 403 ? 'auth' : 'infrastructure',
    assigned_team: 'backend',
    diagnosis: `HTTP ${status} on ${parsed.request_path || 'unknown path'}`,
    suggested_fix: 'Check Supabase logs for details',
    confidence: 0.2,
    auto_resolvable: false,
  };
}

// ─── Incident Grouping ──────────────────────────────────────
async function findOrCreateIncident(
  supabase: ReturnType<typeof createClient>,
  classified: ClassifiedError,
  parsed: ReturnType<typeof parseLogEntry>,
): Promise<string> {
  // Look for existing open incident with same error_type + path pattern
  const pathBase = parsed.request_path?.split('?')[0] || 'unknown';
  const pattern = `${classified.error_type}::${pathBase}`;

  const { data: existing } = await supabase
    .from('platform_incidents')
    .select('id')
    .eq('error_pattern', pattern)
    .in('status', ['open', 'investigating', 'mitigating'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (existing) return existing.id;

  // Create new incident
  const { data: incident, error } = await supabase
    .from('platform_incidents')
    .insert({
      title: `[${classified.severity.toUpperCase()}] ${classified.error_type}: ${pathBase}`,
      description: classified.diagnosis,
      status: 'open',
      severity: classified.severity,
      error_type: classified.error_type,
      error_pattern: pattern,
      category: classified.category,
      ai_root_cause: classified.diagnosis,
      ai_recommended_fix: classified.suggested_fix,
      ai_model_used: classified.confidence < CONFIDENCE_THRESHOLD_ESCALATE ? SONNET_MODEL : HAIKU_MODEL,
      assigned_team: classified.assigned_team,
      escalated_by: 'dash_ai',
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create incident: ${error.message}`);
  return incident!.id;
}

// ─── Notification ────────────────────────────────────────────
async function notifyTeam(
  supabase: ReturnType<typeof createClient>,
  classified: ClassifiedError,
  incidentId: string,
) {
  // Only notify for high/critical severity
  if (classified.severity !== 'high' && classified.severity !== 'critical') return;

  // Find super_admin users to notify
  const { data: admins } = await supabase
    .from('profiles')
    .select('id')
    .in('role', ['super_admin', 'superadmin', 'platform_admin', 'system_admin'])
    .limit(10);

  if (!admins?.length) return;

  const notifications = admins.map((admin: { id: string }) => ({
    user_id: admin.id,
    title: `🚨 ${classified.severity.toUpperCase()}: ${classified.error_type}`,
    message: `${classified.diagnosis}\n\nSuggested fix: ${classified.suggested_fix}`,
    type: 'system',
    data: {
      incident_id: incidentId,
      severity: classified.severity,
      category: classified.category,
      assigned_team: classified.assigned_team,
      action: 'view_incident',
    },
  }));

  await supabase.from('in_app_notifications').insert(notifications);
}

// ─── Utility helpers ─────────────────────────────────────────
function getNestedValue(obj: unknown, key: string): unknown {
  if (!obj || typeof obj !== 'object') return null;
  const val = (obj as Record<string, unknown>)[key];
  if (Array.isArray(val) && val.length > 0) return val[0];
  return val ?? null;
}

function getStringValue(obj: unknown, key: string): string | null {
  const val = getNestedValue(obj, key);
  return typeof val === 'string' ? val : null;
}

function getNumberValue(obj: unknown, key: string): number | null {
  const val = getNestedValue(obj, key);
  return typeof val === 'number' ? val : null;
}

// ─── Main Handler ────────────────────────────────────────────
serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const startedAt = Date.now();

  try {
    // Parse optional params
    const bodyText = await req.text();
    const params = bodyText ? JSON.parse(bodyText) : {};
    const scanMinutes = params.scan_minutes || SCAN_WINDOW_MINUTES;
    const maxErrors = params.max_errors || MAX_ERRORS_PER_SCAN;
    const dryRun = params.dry_run === true;

    // ─── TIER 1: Scan Supabase Logs ──────────────────────────
    const sinceTimestamp = Date.now() - scanMinutes * 60 * 1000;
    const logs = await fetchErrorLogs(sinceTimestamp, maxErrors);

    if (!logs.length) {
      return jsonResponse({
        ok: true,
        tier1: { scanned: 0, errors_found: 0 },
        tier2: { classified: 0, auto_resolved: 0 },
        tier3: { escalated: 0, incidents_created: 0 },
        duration_ms: Date.now() - startedAt,
      });
    }

    // Load known patterns for fast matching
    const { data: patterns } = await supabase
      .from('platform_error_patterns')
      .select('*')
      .eq('is_active', true);

    const activePatterns: ErrorPattern[] = patterns || [];

    // ─── TIER 2: Classify & Auto-Resolve ─────────────────────
    const stats = {
      scanned: logs.length,
      errors_found: 0,
      classified: 0,
      auto_resolved: 0,
      escalated: 0,
      incidents_created: 0,
      skipped_dedup: 0,
    };

    for (const entry of logs) {
      const parsed = parseLogEntry(entry);

      // Skip non-error responses
      if (parsed.http_status && parsed.http_status < 400) continue;
      stats.errors_found++;

      // Dedup check
      if (parsed.source_log_id) {
        const { data: exists } = await supabase
          .from('platform_error_logs')
          .select('id')
          .eq('source_log_id', parsed.source_log_id)
          .eq('source', 'supabase_logs')
          .limit(1)
          .maybeSingle();

        if (exists) {
          stats.skipped_dedup++;
          continue;
        }
      }

      // Try pattern match first (free, instant)
      const matchedPattern = matchPattern(parsed, activePatterns);
      let classified: ClassifiedError;
      let modelUsed = 'pattern_match';

      if (matchedPattern) {
        classified = {
          error_type: matchedPattern.error_type,
          severity: matchedPattern.severity as ClassifiedError['severity'],
          category: matchedPattern.category,
          assigned_team: matchedPattern.assigned_team || 'backend',
          diagnosis: `Matched known pattern: ${matchedPattern.name}`,
          suggested_fix: matchedPattern.fix_template || 'See pattern documentation',
          confidence: 0.9,
          auto_resolvable: matchedPattern.auto_resolvable,
        };

        // Update pattern hit count
        await supabase
          .from('platform_error_patterns')
          .update({ hit_count: matchedPattern.hit_count + 1, last_hit_at: new Date().toISOString() })
          .eq('id', matchedPattern.id);
      } else if (ANTHROPIC_API_KEY) {
        // Tier 2: Haiku triage (fast, cheap — ~$0.001 per classification)
        classified = await classifyWithAI(parsed, HAIKU_MODEL, 'triage');
        modelUsed = HAIKU_MODEL;

        // Tier 3: If Haiku is unsure, escalate to Sonnet for deep diagnosis
        if (classified.confidence < CONFIDENCE_THRESHOLD_ESCALATE) {
          classified = await classifyWithAI(parsed, SONNET_MODEL, 'diagnosis');
          modelUsed = SONNET_MODEL;
          stats.escalated++;
        }
      } else {
        // No AI key — fallback classification
        classified = fallbackClassification(parsed);
        modelUsed = 'fallback';
      }

      stats.classified++;

      if (dryRun) continue;

      // Insert error log
      const { data: errorLog, error: insertError } = await supabase
        .from('platform_error_logs')
        .insert({
          source: 'supabase_logs',
          source_log_id: parsed.source_log_id,
          error_type: classified.error_type,
          http_status: parsed.http_status,
          http_method: parsed.http_method,
          request_path: parsed.request_path,
          error_message: parsed.error_message.slice(0, 2000),
          error_details: parsed.error_details,
          severity: classified.severity,
          status: classified.auto_resolvable ? 'auto_resolved' :
                  classified.confidence >= CONFIDENCE_THRESHOLD_AUTO_RESOLVE ? 'classifying' : 'detected',
          category: classified.category,
          ai_diagnosis: classified.diagnosis,
          ai_model_used: modelUsed,
          ai_confidence: classified.confidence,
          ai_suggested_fix: classified.suggested_fix,
          auto_fix_applied: false,
          assigned_team: classified.assigned_team,
          affected_user_id: parsed.affected_user_id || null,
          user_agent: parsed.user_agent,
          ip_country: parsed.ip_country,
          occurred_at: parsed.occurred_at,
          classified_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (insertError) {
        console.error(`[ErrorMonitor] Failed to insert error log: ${insertError.message}`);
        continue;
      }

      // High/critical or low confidence → create/link incident
      if (
        classified.severity === 'high' ||
        classified.severity === 'critical' ||
        classified.confidence < CONFIDENCE_THRESHOLD_ESCALATE
      ) {
        try {
          const incidentId = await findOrCreateIncident(supabase, classified, parsed);
          stats.incidents_created++;

          // Link error to incident
          await supabase.rpc('link_error_to_incident', {
            p_error_id: errorLog!.id,
            p_incident_id: incidentId,
            p_affected_user_id: parsed.affected_user_id || null,
          });

          // Notify super admins
          await notifyTeam(supabase, classified, incidentId);
        } catch (incidentError) {
          console.error('[ErrorMonitor] Incident creation failed:', incidentError);
        }
      }

      // Auto-resolve if pattern says so and confidence is high
      if (classified.auto_resolvable && classified.confidence >= CONFIDENCE_THRESHOLD_AUTO_RESOLVE) {
        await supabase.from('platform_error_resolutions').insert({
          error_log_id: errorLog!.id,
          resolution_type: 'auto_fix',
          description: classified.suggested_fix,
          resolved_by: 'dash_ai',
          resolver_model: modelUsed,
          fix_details: { auto: true, pattern: matchedPattern?.name },
        });

        await supabase
          .from('platform_error_logs')
          .update({
            status: 'auto_resolved',
            auto_fix_applied: true,
            resolved_at: new Date().toISOString(),
          })
          .eq('id', errorLog!.id);

        stats.auto_resolved++;
      }
    }

    return jsonResponse({
      ok: true,
      tier1: { scanned: stats.scanned, errors_found: stats.errors_found, skipped_dedup: stats.skipped_dedup },
      tier2: { classified: stats.classified, auto_resolved: stats.auto_resolved },
      tier3: { escalated: stats.escalated, incidents_created: stats.incidents_created },
      duration_ms: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[ErrorMonitor] Fatal:', message);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});

// ─── Log Fetching ────────────────────────────────────────────
async function fetchErrorLogs(sinceTimestamp: number, limit: number): Promise<LogEntry[]> {
  // Option 1: Supabase Management API (if access token available)
  if (DASH_SUPABASE_ACCESS_TOKEN && DASH_SUPABASE_PROJECT_REF) {
    return fetchViaManagementAPI(sinceTimestamp, limit);
  }

  // Option 2: Query edge-logs via PostgREST (if available)
  // Supabase doesn't expose raw logs via PostgREST, so we fall back
  // to the Management API. If neither is configured, return empty.
  console.warn('[ErrorMonitor] No DASH_SUPABASE_ACCESS_TOKEN — cannot fetch logs. Configure it for Tier 1 scanning.');
  return [];
}

async function fetchViaManagementAPI(sinceTimestamp: number, limit: number): Promise<LogEntry[]> {
  const isoStart = new Date(sinceTimestamp).toISOString();
  const isoEnd = new Date().toISOString();

  // Use the Supabase Analytics/Logs API
  const url = `https://api.supabase.com/v1/projects/${DASH_SUPABASE_PROJECT_REF}/analytics/endpoints/logs.all`;

  const query = `
    select id, timestamp, event_message, metadata
    from edge_logs
    where timestamp >= '${isoStart}'
      and timestamp <= '${isoEnd}'
      and (
        cast(metadata->0->'response'->0->>'status_code' as int) >= 400
        or event_message like '%| 4__ |%'
        or event_message like '%| 5__ |%'
      )
    order by timestamp desc
    limit ${limit}
  `;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DASH_SUPABASE_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({ sql: query }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[ErrorMonitor] Management API error ${response.status}: ${errText}`);
      return [];
    }

    const data = await response.json();
    return (data.result || data || []) as LogEntry[];
  } catch (error) {
    console.error('[ErrorMonitor] Failed to fetch logs:', error);
    return [];
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
