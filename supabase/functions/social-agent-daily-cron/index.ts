/**
 * Social Agent Daily Cron
 * Creates (and schedules) one safe, generic post per org/day when autopost is enabled.
 *
 * IMPORTANT:
 * - Only generates "autonomous" content categories (no student data, no media).
 * - Publishing is handled by social-publisher-cron (which claims due scheduled posts).
 */

import { serve } from 'https://deno.land/std@0.214.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const CRON_SECRET = Deno.env.get('CRON_SECRET') || 'your-cron-secret';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const OutputSchema = z.object({
  message: z.string().min(1),
  hashtags: z.array(z.string()).optional().default([]),
  category: z
    .enum(['word_of_day', 'study_tip', 'parent_tip', 'value_of_week', 'school_update', 'custom'])
    .optional(),
  safety: z
    .object({
      requires_approval: z.boolean().optional(),
      reason: z.string().optional(),
    })
    .optional(),
});

function extractJsonObject(text: string): unknown | null {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try { return JSON.parse(trimmed); } catch { /* continue */ }
  }
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  try { return JSON.parse(trimmed.slice(first, last + 1)); } catch { return null; }
}

function normalizeHashtags(src: string[]): string[] {
  const cleaned = (src || [])
    .map((t) => String(t || '').trim())
    .filter(Boolean)
    .map((t) => (t.startsWith('#') ? t : `#${t.replace(/^#+/, '')}`))
    .map((t) => t.replace(/\s+/g, ''));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of cleaned) {
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out.slice(0, 5);
}

function buildFacebookMessage(message: string, hashtags: string[]): string {
  const base = (message || '').trim();
  const tags = normalizeHashtags(hashtags);
  if (!tags.length) return base;
  return `${base}\n\n${tags.join(' ')}`.trim();
}

type ZonedDateTime = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function getZonedParts(date: Date, timeZone: string): ZonedDateTime {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function zonedToUtc(z: ZonedDateTime, timeZone: string): Date {
  // Iterative conversion: treat desired local as UTC, then adjust until formatter matches.
  let utc = new Date(Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute, z.second));
  const desiredNaive = Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute, z.second);
  for (let i = 0; i < 3; i++) {
    const actual = getZonedParts(utc, timeZone);
    const actualNaive = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    const diff = desiredNaive - actualNaive;
    if (diff === 0) break;
    utc = new Date(utc.getTime() + diff);
  }
  return utc;
}

async function generateWithAnthropic(systemPrompt: string, userPrompt: string) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY') || '';
  if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY');
  const modelName = (Deno.env.get('SOCIAL_AGENT_MODEL') || Deno.env.get('ANTHROPIC_MODEL') || 'claude-haiku-4-5-20251001').trim();

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: modelName,
      max_tokens: 900,
      temperature: 0.7,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  const text = await resp.text();
  if (!resp.ok) throw new Error(`Anthropic error: ${resp.status} ${text}`);
  const json = (() => { try { return JSON.parse(text) as any; } catch { return null; } })();
  const rawText = String(json?.content?.[0]?.text ?? '').trim();
  const obj = extractJsonObject(rawText);
  const parsed = OutputSchema.safeParse(obj);
  if (!parsed.success) throw new Error('AI output invalid JSON');
  return { provider: 'anthropic' as const, model: modelName, output: parsed.data };
}

async function generateWithOpenAI(systemPrompt: string, userPrompt: string) {
  const apiKey = Deno.env.get('OPENAI_API_KEY') || '';
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY');
  const modelName = (Deno.env.get('SOCIAL_AGENT_MODEL') || 'gpt-4o-mini').trim();

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelName,
      temperature: 0.7,
      max_tokens: 900,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  const text = await resp.text();
  if (!resp.ok) throw new Error(`OpenAI error: ${resp.status} ${text}`);
  const json = (() => { try { return JSON.parse(text) as any; } catch { return null; } })();
  const rawText = String(json?.choices?.[0]?.message?.content ?? '').trim();
  const obj = extractJsonObject(rawText);
  const parsed = OutputSchema.safeParse(obj);
  if (!parsed.success) throw new Error('AI output invalid JSON');
  return { provider: 'openai' as const, model: modelName, output: parsed.data };
}

async function generateSocialPost(systemPrompt: string, userPrompt: string) {
  const hasAnthropic = !!(Deno.env.get('ANTHROPIC_API_KEY') || '');
  const hasOpenAI = !!(Deno.env.get('OPENAI_API_KEY') || '');
  if (hasAnthropic) return generateWithAnthropic(systemPrompt, userPrompt);
  if (hasOpenAI) return generateWithOpenAI(systemPrompt, userPrompt);
  throw new Error('No AI provider configured (ANTHROPIC_API_KEY or OPENAI_API_KEY)');
}

function scheduleAllowsDay(autopostSchedule: string, dow: number): boolean {
  // dow: 0=Sun ... 6=Sat
  switch (autopostSchedule) {
    case 'mon_wed_fri':
      return dow === 1 || dow === 3 || dow === 5;
    case 'weekdays':
      return dow >= 1 && dow <= 5;
    case 'daily':
      return true;
    default:
      return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method === 'GET') {
    return jsonResponse(200, { status: 'ok', service: 'social-agent-daily-cron' });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'method_not_allowed' });
  }

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    const isCronJob = token === CRON_SECRET;
    const isServiceRole = token === SUPABASE_SERVICE_ROLE_KEY;

    let isValidServiceRoleJwt = false;
    if (token && !isCronJob && !isServiceRole) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        isValidServiceRoleJwt = payload.role === 'service_role';
      } catch {
        // ignore
      }
    }

    if (!isCronJob && !isServiceRole && !isValidServiceRoleJwt) {
      return jsonResponse(401, { error: 'unauthorized' });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(500, { error: 'server_misconfigured' });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const { data: settings, error: settingsError } = await supabase
      .from('social_agent_settings')
      .select('organization_id, enabled, autopost_enabled, autopost_schedule, autopost_time_local, timezone, default_category, brand_voice')
      .eq('enabled', true)
      .eq('autopost_enabled', true)
      .neq('autopost_schedule', 'off');

    if (settingsError) {
      return jsonResponse(500, { error: 'db_error', message: settingsError.message });
    }

    const results = {
      scanned: settings?.length || 0,
      scheduled: 0,
      skipped: 0,
      no_connection: 0,
      errors: 0,
      details: [] as Array<{ organization_id: string; action: string; reason?: string }>,
    };

    const now = new Date();

    for (const row of settings || []) {
      const organizationId = row.organization_id as string;
      const autopostSchedule = String(row.autopost_schedule || 'off');
      const brandVoice = (row.brand_voice ?? {}) as Record<string, unknown>;

      try {
        // Load org name/timezone (best-effort)
        const orgRes = await supabase
          .from('organizations')
          .select('name, timezone')
          .eq('id', organizationId)
          .maybeSingle();
        const orgName = orgRes.data?.name || 'Your School';
        const timeZone = String(row.timezone || orgRes.data?.timezone || 'Africa/Johannesburg');

        const localNow = getZonedParts(now, timeZone);
        const localNaive = new Date(Date.UTC(localNow.year, localNow.month - 1, localNow.day));
        const dow = localNaive.getUTCDay();

        if (!scheduleAllowsDay(autopostSchedule, dow)) {
          results.skipped++;
          results.details.push({ organization_id: organizationId, action: 'skip', reason: 'schedule_day_off' });
          continue;
        }

        // Must have an active connection
        const conn = await supabase
          .from('social_connections')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('platform', 'facebook_page')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const connectionId = conn.data?.id || null;
        if (!connectionId) {
          results.no_connection++;
          results.details.push({ organization_id: organizationId, action: 'skip', reason: 'no_active_connection' });
          continue;
        }

        // Compute local-day range in UTC to avoid duplicates
        const startUtc = zonedToUtc(
          { year: localNow.year, month: localNow.month, day: localNow.day, hour: 0, minute: 0, second: 0 },
          timeZone,
        );
        const nextDayNaive = new Date(Date.UTC(localNow.year, localNow.month - 1, localNow.day));
        nextDayNaive.setUTCDate(nextDayNaive.getUTCDate() + 1);
        const endUtc = zonedToUtc(
          {
            year: nextDayNaive.getUTCFullYear(),
            month: nextDayNaive.getUTCMonth() + 1,
            day: nextDayNaive.getUTCDate(),
            hour: 0,
            minute: 0,
            second: 0,
          },
          timeZone,
        );

        const existing = await supabase
          .from('social_posts')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('platform', 'facebook_page')
          .gte('scheduled_at', startUtc.toISOString())
          .lt('scheduled_at', endUtc.toISOString())
          .in('status', ['scheduled', 'published', 'publishing'])
          .limit(1);

        if (existing.data && existing.data.length > 0) {
          results.skipped++;
          results.details.push({ organization_id: organizationId, action: 'skip', reason: 'already_scheduled' });
          continue;
        }

        const [hourStr, minStr, secStr] = String(row.autopost_time_local || '08:00:00').split(':');
        const hour = Number(hourStr || 8);
        const minute = Number(minStr || 0);
        const second = Number((secStr || '0').split('.')[0] || 0);
        let scheduledAt = zonedToUtc(
          { year: localNow.year, month: localNow.month, day: localNow.day, hour, minute, second },
          timeZone,
        );
        if (scheduledAt.getTime() < now.getTime() - 60_000) {
          // Missed window: schedule soon to avoid "stale daily" posts
          scheduledAt = new Date(now.getTime() + 2 * 60_000);
        }

        let category = String(row.default_category || 'study_tip');
        if (category === 'custom' || category === 'school_update') {
          // Autopost is intended for safe, generic content only.
          category = 'study_tip';
        }

        const recentRes = await supabase
          .from('social_posts')
          .select('category, created_at, content')
          .eq('organization_id', organizationId)
          .eq('platform', 'facebook_page')
          .order('created_at', { ascending: false })
          .limit(6);
        const recentPosts = (recentRes.data || [])
          .map((p: any, idx: number) => {
            const snippet = String(p.content || '').replace(/\s+/g, ' ').trim().slice(0, 280);
            return `${idx + 1}. [${p.category || 'unknown'}] ${snippet}`;
          })
          .join('\n');

        const systemPrompt = [
          'You are Dash Social Agent for a school Facebook Page.',
          '',
          'OUTPUT FORMAT: Return ONLY a JSON object:',
          '{',
          '  "message": "string",',
          '  "hashtags": ["#tag1", "#tag2"],',
          '  "category": "word_of_day|study_tip|parent_tip|value_of_week|school_update|custom",',
          '  "safety": { "requires_approval": boolean, "reason": "string" }',
          '}',
          '',
          'SAFETY RULES (non-negotiable):',
          '- Do NOT include any personal data about students/parents/staff (no names, no IDs, no phone numbers, no addresses).',
          '- Do NOT mention individual student performance, behavior, or attendance.',
          '- Do NOT claim specific events/results (this is an autonomous post).',
          '- Keep it friendly, practical, and concise. Avoid spam.',
          '- Do NOT say you are an AI.',
          '',
          `School: ${orgName}`,
          `Timezone: ${timeZone}`,
          `Brand voice (JSON): ${JSON.stringify(brandVoice)}`,
        ].join('\n');

        const userPrompt = [
          `Create a ${category} post for the school Facebook Page.`,
          '',
          'Content requirements:',
          '- 1 to 3 short paragraphs.',
          '- Max 900 characters.',
          '- 0 to 3 hashtags.',
          '- South African English tone.',
          '',
          recentPosts ? `Recent posts (avoid repeating the same ideas/wording):\n${recentPosts}\n` : '',
          'Return the JSON now.',
        ].join('\n');

        const ai = await generateSocialPost(systemPrompt, userPrompt);
        const finalContent = buildFacebookMessage(ai.output.message, ai.output.hashtags || []);

        const insert = await supabase
          .from('social_posts')
          .insert({
            organization_id: organizationId,
            connection_id: connectionId,
            platform: 'facebook_page',
            category: ai.output.category || category,
            status: 'scheduled',
            content: finalContent,
            requires_approval: false,
            scheduled_at: scheduledAt.toISOString(),
            ai_metadata: {
              provider: ai.provider,
              model: ai.model,
              prompt_version: 'v1',
              generated_at: new Date().toISOString(),
              autonomous: true,
            },
            created_by: null,
          })
          .select('id')
          .single();

        if (insert.error) {
          results.errors++;
          results.details.push({ organization_id: organizationId, action: 'error', reason: insert.error.message });
          continue;
        }

        results.scheduled++;
        results.details.push({ organization_id: organizationId, action: 'scheduled' });
      } catch (e) {
        results.errors++;
        results.details.push({
          organization_id: organizationId,
          action: 'error',
          reason: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return jsonResponse(200, { success: true, results });
  } catch (error) {
    return jsonResponse(500, { error: 'social_agent_daily_cron_error', message: error instanceof Error ? error.message : String(error) });
  }
});
