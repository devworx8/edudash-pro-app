/**
 * Explain Answer Edge Function
 * 
 * Uses AI to explain why a student's answer to an exam question is correct or incorrect.
 * Provides educational feedback aligned with CAPS curriculum.
 * 
 * Expected body: { questionText, questionType, options?, studentAnswer, correctAnswer, grade }
 * Auth: Bearer token required
 * 
 * Returns: { explanation: string }
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
    // Auth check
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
    const { questionText, questionType, options, studentAnswer, correctAnswer, grade, model: bodyModel } = body;

    const { data: tier } = await supabase.rpc('get_user_subscription_tier', { user_id: user.id });
    const model = bodyModel || getDefaultModelForTier(tier);

    // Quota check — prevent unbounded explanation requests
    const environment = Deno.env.get('ENVIRONMENT') || 'production';
    const devBypass = Deno.env.get('AI_QUOTA_BYPASS') === 'true' &&
                      (environment === 'development' || environment === 'local');

    if (!devBypass) {
      const quota = await supabase.rpc('check_ai_usage_limit', {
        p_user_id: user.id,
        p_request_type: 'explanation',
      });

      if (quota.error) {
        console.error('[explain-answer] check_ai_usage_limit failed:', quota.error);
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

    if (!questionText || !correctAnswer) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build the explanation prompt
    const isCorrect = String(studentAnswer).trim().toLowerCase() === String(correctAnswer).trim().toLowerCase();
    const optionsText = options ? `\nOptions: ${options.join(', ')}` : '';

    const prompt = `You are a friendly, encouraging South African teacher explaining an exam answer to a Grade ${grade || 'unknown'} student.

Question: ${questionText}
Question Type: ${questionType || 'unknown'}${optionsText}
Student's Answer: ${studentAnswer || '(no answer)'}
Correct Answer: ${correctAnswer}
Result: ${isCorrect ? 'CORRECT ✓' : 'INCORRECT ✗'}

Provide a clear, age-appropriate explanation (2-4 sentences):
- If correct: Briefly confirm why this is right and reinforce the concept
- If incorrect: Gently explain why their answer is wrong and why the correct answer is right
- Use simple language appropriate for the grade level
- Reference CAPS curriculum concepts where relevant
- Be encouraging and supportive`;

    if (!ANTHROPIC_API_KEY) {
      // Fallback: return a basic explanation without AI
      const fallback = isCorrect
        ? `Well done! "${correctAnswer}" is the correct answer.`
        : `The correct answer is "${correctAnswer}". Your answer "${studentAnswer}" was not quite right. Keep practicing!`;
      return new Response(
        JSON.stringify({ explanation: fallback, warning: 'AI service not configured' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
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
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('[explain-answer] AI error:', aiResponse.status, errText);
      // Return fallback on AI failure
      const fallback = isCorrect
        ? `Correct! The answer is "${correctAnswer}".`
        : `The correct answer is "${correctAnswer}".`;
      return new Response(
        JSON.stringify({ explanation: fallback, warning: 'AI temporarily unavailable' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const aiData = await aiResponse.json();
    const explanation = aiData.content?.[0]?.text || 'Unable to generate explanation.';

    // Record usage after successful generation
    if (!devBypass) {
      try {
        await supabase.rpc('increment_ai_usage', {
          p_user_id: user.id,
          p_request_type: 'explanation',
          p_status: 'success',
          p_metadata: { scope: 'explain_answer', model },
        });
      } catch (usageErr) {
        console.warn('[explain-answer] increment_ai_usage failed (non-fatal):', usageErr);
      }
    }

    return new Response(
      JSON.stringify({ explanation }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (err) {
    console.error('[explain-answer] Error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
