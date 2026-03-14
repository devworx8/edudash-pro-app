/**
 * Dash AI Automation Edge Function
 * 
 * Provides AI-powered content generation for school admin automation tools.
 * Used from the org-admin/ai-automation screen.
 * 
 * Expected body: { tool_id, prompt, organization_id, action: 'generate' }
 * Auth: Bearer token required
 */

import { serve } from 'https://deno.land/std@0.214.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';

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

const TOOL_PROMPTS: Record<string, string> = {
  'newsletter-generator': 'You are a helpful school newsletter writer. Generate a professional, warm school newsletter based on the provided topic/details. Use clear sections, include a greeting and closing. Keep the tone friendly and informative for parents.',
  'report-writer': 'You are an educational report writer. Generate a professional student progress report based on the provided details. Include strengths, areas for improvement, and recommendations. Be constructive and supportive.',
  'policy-drafter': 'You are a school policy expert. Draft a clear, comprehensive school policy document based on the provided topic. Include purpose, scope, guidelines, and enforcement details. Use professional language appropriate for a South African preschool/ECD context.',
  'communication-template': 'You are a school communication specialist. Create a professional communication template (letter, email, or notice) based on the provided topic. Include appropriate greeting, body, and closing. Suitable for parent-school communication.',
  'curriculum-planner': 'You are a CAPS-aligned curriculum planning assistant. Create a structured curriculum plan based on the provided subject and grade details. Include learning objectives, activities, assessment criteria, and resources needed.',
  'learner-matching': 'You are an educational placement specialist. Based on the provided learner details and available programs, suggest optimal program matches with reasoning. Consider learning style, age, and developmental stage.',
};

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY!);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { tool_id, prompt, organization_id, action, model: bodyModel } = body;

    const { data: tier } = await supabase.rpc('get_user_subscription_tier', { user_id: user.id });
    const model = bodyModel || getDefaultModelForTier(tier);

    if (!tool_id || !prompt) {
      return new Response(JSON.stringify({ error: 'Missing required fields: tool_id, prompt' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user belongs to the organization
    if (organization_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id, preschool_id, role')
        .eq('id', user.id)
        .maybeSingle();

      const userOrgId = profile?.organization_id || profile?.preschool_id;
      if (userOrgId && userOrgId !== organization_id) {
        return new Response(JSON.stringify({ error: 'Organization mismatch' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const systemPrompt = TOOL_PROMPTS[tool_id] ||
      'You are a helpful AI assistant for school administration. Generate professional content based on the user\'s request.';

    // Quota check — prevent unbounded automation requests
    const environment = Deno.env.get('ENVIRONMENT') || 'production';
    const devBypass = Deno.env.get('AI_QUOTA_BYPASS') === 'true' &&
                      (environment === 'development' || environment === 'local');

    if (!devBypass) {
      const quota = await supabase.rpc('check_ai_usage_limit', {
        p_user_id: user.id,
        p_request_type: 'chat_message',
      });

      if (quota.error) {
        console.error('[dash-ai-automation] check_ai_usage_limit failed:', quota.error);
        return new Response(
          JSON.stringify({
            error: 'quota_check_failed',
            message: 'Unable to verify AI usage quota. Please try again in a few minutes.',
          }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const quotaData = quota.data as Record<string, unknown> | null;
      if (quotaData && typeof quotaData.allowed === 'boolean' && !quotaData.allowed) {
        return new Response(
          JSON.stringify({
            error: 'quota_exceeded',
            message: "You've reached your AI usage limit for this period. Upgrade for more.",
            details: quotaData,
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    console.log('[dash-ai-automation] Generating content:', { tool_id, userId: user.id });

    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('[dash-ai-automation] AI error:', aiResponse.status, errText);
      throw new Error('AI service temporarily unavailable');
    }

    const aiData = await aiResponse.json();
    const content = aiData.content?.[0]?.text || '';

    // Record usage after successful generation
    if (!devBypass) {
      try {
        await supabase.rpc('increment_ai_usage', {
          p_user_id: user.id,
          p_request_type: 'chat_message',
          p_status: 'success',
          p_metadata: { scope: 'dash_ai_automation', tool_id },
        });
      } catch (usageErr) {
        console.warn('[dash-ai-automation] increment_ai_usage failed (non-fatal):', usageErr);
      }
    }

    return new Response(
      JSON.stringify({ success: true, content, result: content, tool_id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[dash-ai-automation] Error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
