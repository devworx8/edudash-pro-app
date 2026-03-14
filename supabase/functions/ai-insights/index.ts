/**
 * AI Insights Edge Function
 * 
 * Generates AI-powered insights for dashboards (teacher, principal, parent).
 * Uses AI to analyze usage patterns and provide actionable recommendations.
 * 
 * Expected body: { scope, period_days?, context? }
 * Auth: Bearer token required
 */

import { serve } from 'https://deno.land/std@0.214.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';

function extractBearerToken(authHeader: string | null): string {
  const raw = String(authHeader || '').trim();
  if (!raw) return '';
  return raw.startsWith('Bearer ') ? raw.slice(7).trim() : raw;
}

function getJwtRole(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = JSON.parse(atob(parts[1]));
    return typeof payload?.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

function getDefaultModelForTier(tier: string | null | undefined): string {
  const t = String(tier ?? 'free').toLowerCase();
  if (t.includes('enterprise') || t === 'superadmin' || t === 'super_admin') return 'claude-sonnet-4-20250514';
  if (t.includes('premium') || t.includes('pro') || t.includes('plus') || t.includes('basic')) return 'claude-3-7-sonnet-20250219';
  if (t.includes('starter') || t === 'trial') return 'claude-3-7-sonnet-20250219';
  return 'claude-haiku-4-5-20251001';
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return handleCorsOptions(req);

  try {
    const authHeader = req.headers.get('Authorization');
    const token = extractBearerToken(authHeader);
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY!);
    const tokenRole = getJwtRole(token);
    const isServiceRoleToken =
      token === SUPABASE_SERVICE_ROLE_KEY || tokenRole === 'service_role';

    let user: { id: string } | null = null;
    if (!isServiceRoleToken) {
      const { data: authData, error: authError } = await supabase.auth.getUser(token);
      if (authError || !authData?.user) {
        return new Response(JSON.stringify({ error: 'Invalid session' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      user = { id: authData.user.id };
    }

    if (!isServiceRoleToken && !user?.id) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { scope, period_days = 14, context, model: bodyModel, user_id: bodyUserId } = body;
    const actingUserId = user?.id || (typeof bodyUserId === 'string' && bodyUserId.trim().length > 0 ? bodyUserId.trim() : null);

    let tier: string | null = null;
    if (actingUserId) {
      const { data } = await supabase.rpc('get_user_subscription_tier', { user_id: actingUserId });
      tier = data || null;
    }
    const model = bodyModel || getDefaultModelForTier(tier);

    if (!scope || !['teacher', 'principal', 'parent'].includes(scope)) {
      return new Response(JSON.stringify({ error: 'Invalid scope' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Quota check — only for non-service calls
    const environment = Deno.env.get('ENVIRONMENT') || 'production';
    const devBypass = Deno.env.get('AI_QUOTA_BYPASS') === 'true' &&
                      (environment === 'development' || environment === 'local');

    if (actingUserId && !isServiceRoleToken && !devBypass) {
      const quota = await supabase.rpc('check_ai_usage_limit', {
        p_user_id: actingUserId,
        p_request_type: 'chat_message',
      });

      if (quota.error) {
        console.error('[ai-insights] check_ai_usage_limit failed:', quota.error);
        return new Response(JSON.stringify({
          error: 'quota_check_failed',
          message: 'Unable to verify AI usage quota. Please try again in a few minutes.',
        }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const quotaData = quota.data as Record<string, unknown> | null;
      if (quotaData && typeof quotaData.allowed === 'boolean' && !quotaData.allowed) {
        return new Response(JSON.stringify({
          error: 'quota_exceeded',
          message: "You've reached your AI usage limit for this period. Upgrade for more.",
          details: quotaData,
        }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // Get user profile for context
    let profile: { role?: string | null; preschool_id?: string | null; organization_id?: string | null; first_name?: string | null } | null = null;
    if (actingUserId) {
      const { data } = await supabase
        .from('profiles')
        .select('role, preschool_id, organization_id, first_name')
        .eq('auth_user_id', actingUserId)
        .maybeSingle();
      profile = data as typeof profile;
    }

    const orgId = profile?.preschool_id || profile?.organization_id || context?.organization_id || context?.preschool_id || null;

    // Gather data for insights
    const now = new Date();
    const periodStart = new Date(now.getTime() - period_days * 24 * 60 * 60 * 1000).toISOString();

    // Get usage stats
    let aiRequestCount = 0;
    if (actingUserId) {
      const { count } = await supabase
        .from('ai_request_log')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', actingUserId)
        .gte('created_at', periodStart);
      aiRequestCount = Number(count || 0);
    }

    const contextStr = context ? JSON.stringify(context) : '';
    const identityContext = actingUserId ? `user_id: ${actingUserId}` : 'service_role_call: true';
    const tenantContext = orgId ? `organization_id: ${orgId}` : '';
    const dataContext = `User role: ${scope}, AI requests in last ${period_days} days: ${aiRequestCount || 0}. ${identityContext}. ${tenantContext}. ${contextStr}`;

    if (!ANTHROPIC_API_KEY) {
      // Return static insights when AI not configured
      return new Response(JSON.stringify({
        bullets: [
          `You've used ${aiRequestCount || 0} AI features in the last ${period_days} days.`,
          'Tip: Try using the lesson generator to save prep time.',
          'Explore the exam builder for quick assessment creation.',
        ],
        confidence: 0.5,
        generated_at: new Date().toISOString(),
        scope,
        period_days,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const prompt = `You are an educational technology advisor for a South African preschool/ECD platform called EduDash Pro.
Generate 3-5 short, actionable insight bullets for a ${scope} user.

Context: ${dataContext}

Rules:
- Each bullet should be 1-2 sentences max
- Be encouraging and practical
- Reference South African curriculum (CAPS) where relevant
- Suggest specific platform features they could use
- Keep language simple and positive

Return ONLY a JSON array of strings, e.g.: ["Insight 1", "Insight 2", "Insight 3"]`;

    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model!,
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    let bullets: string[] = [];
    if (aiResponse.ok) {
      const aiData = await aiResponse.json();
      const text = aiData.content?.[0]?.text || '[]';
      try {
        const match = text.match(/\[[\s\S]*\]/);
        bullets = match ? JSON.parse(match[0]) : [];
      } catch {
        bullets = [text];
      }
    }

    if (bullets.length === 0) {
      bullets = [`You've been active with ${aiRequestCount || 0} AI interactions recently. Keep it up!`];
    }

    // Record usage after successful AI generation (skip for static fallback and service role)
    if (actingUserId && !isServiceRoleToken && !devBypass && ANTHROPIC_API_KEY && aiResponse.ok) {
      try {
        await supabase.rpc('increment_ai_usage', {
          p_user_id: actingUserId,
          p_request_type: 'chat_message',
          p_status: 'success',
          p_metadata: { scope: 'ai_insights', scope_type: scope },
        });
      } catch (usageErr) {
        console.warn('[ai-insights] increment_ai_usage failed (non-fatal):', usageErr);
      }
    }

    return new Response(JSON.stringify({
      bullets,
      confidence: 0.8,
      generated_at: new Date().toISOString(),
      scope,
      period_days,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[ai-insights] Error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
