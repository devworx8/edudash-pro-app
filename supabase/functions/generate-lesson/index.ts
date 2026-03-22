/**
 * generate-lesson — Supabase Edge Function
 *
 * Generates CAPS-aligned lesson plans via Anthropic Claude.
 * Follows the same architecture as generate-exam/index.ts.
 *
 * Deploy: supabase functions deploy generate-lesson
 */

import { serve } from 'https://deno.land/std@0.214.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import {
  buildLessonSystemPrompt,
  buildLessonUserPrompt,
  getCAPSPhase,
  gradeLabel,
  type LessonPlanRequest,
  type SupportedLanguage,
  type LessonDuration,
} from './promptBuilder.ts';

// ─── Model config ─────────────────────────────────────────────────────────────
// Matches AI_MODELS.balanced in lib/ai/aiConfig.ts
const LESSON_MODEL = 'claude-3-7-sonnet-20250219';
const LESSON_MODEL_PREMIUM = 'claude-sonnet-4-20250514'; // fallback for repair
const MAX_TOKENS = 4096;

// ─── Input validation ─────────────────────────────────────────────────────────

const VALID_DURATIONS: LessonDuration[] = [30, 45, 60, 90];
const VALID_TERMS = [1, 2, 3, 4];
const VALID_LANGUAGES: SupportedLanguage[] = [
  'English', 'Afrikaans', 'isiZulu', 'isiXhosa',
  'Sesotho', 'Setswana', 'Sepedi', 'Xitsonga',
  'Siswati', 'Tshivenda', 'isiNdebele',
];

function validateRequest(body: Record<string, unknown>): string | null {
  if (!body.subject || typeof body.subject !== 'string') return 'subject is required';
  if (body.grade === undefined || typeof body.grade !== 'number' || body.grade < 0 || body.grade > 12) {
    return 'grade must be a number 0 (Grade R) to 12';
  }
  if (!body.term || !VALID_TERMS.includes(body.term as number)) return 'term must be 1–4';
  if (!body.topic || typeof body.topic !== 'string' || body.topic.trim().length < 3) {
    return 'topic is required (min 3 characters)';
  }
  if (!body.language || !VALID_LANGUAGES.includes(body.language as SupportedLanguage)) {
    return `language must be one of: ${VALID_LANGUAGES.join(', ')}`;
  }
  if (!body.duration || !VALID_DURATIONS.includes(body.duration as LessonDuration)) {
    return 'duration must be 30, 45, 60, or 90 (minutes)';
  }
  return null;
}

// ─── JSON cleaning ────────────────────────────────────────────────────────────

function cleanAndParseJSON(raw: string): unknown {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

// ─── Quality repair (mirrors generate-exam/qualityRepair.ts) ─────────────────

async function repairLessonPlan(
  anthropicKey: string,
  systemPrompt: string,
  issues: string[],
  brokenDraft: unknown,
  req: LessonPlanRequest,
): Promise<string | null> {
  const issueList = issues.map((iss, i) => `${i + 1}. ${iss}`).join('\n');
  const repairPrompt = [
    `The previous lesson plan JSON draft failed quality checks.`,
    `Repair it and return a corrected full lesson plan JSON only (no markdown).`,
    ``,
    `Quality issues to fix:`,
    issueList,
    ``,
    `Requirements: language must be ${req.language}, duration must be exactly ${req.duration} minutes.`,
    `Use SA spelling and SA examples throughout.`,
    ``,
    `Previous draft:`,
    JSON.stringify(brokenDraft),
  ].join('\n');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: LESSON_MODEL_PREMIUM,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: repairPrompt }],
    }),
  });

  if (!response.ok) {
    console.warn('[generate-lesson] quality repair failed', response.status);
    return null;
  }

  const data = await response.json();
  return String(data?.content?.[0]?.text || '').trim() || null;
}

// ─── Quality checks ───────────────────────────────────────────────────────────

function checkLessonQuality(plan: Record<string, unknown>, req: LessonPlanRequest): string[] {
  const issues: string[] = [];

  if (!Array.isArray(plan.activities) || plan.activities.length < 3) {
    issues.push('Must have at least 3 activity phases (Introduction, Development, Consolidation)');
  }

  if (Array.isArray(plan.activities)) {
    const totalDuration = (plan.activities as Array<{ durationMinutes?: number }>)
      .reduce((sum, a) => sum + (a.durationMinutes ?? 0), 0);
    if (Math.abs(totalDuration - req.duration) > 2) {
      issues.push(`Activity durations sum to ${totalDuration} but lesson is ${req.duration} minutes`);
    }
  }

  if (!Array.isArray(plan.capsLearningOutcomes) || plan.capsLearningOutcomes.length === 0) {
    issues.push('capsLearningOutcomes must be a non-empty array');
  }

  if (!plan.capsContentArea || typeof plan.capsContentArea !== 'string') {
    issues.push('capsContentArea is required');
  }

  if (!plan.assessment || typeof plan.assessment !== 'object') {
    issues.push('assessment object is required');
  }

  if (!plan.differentiation || typeof plan.differentiation !== 'object') {
    issues.push('differentiation object is required');
  }

  // Check for placeholder text
  const planStr = JSON.stringify(plan);
  if (planStr.includes('<') && planStr.includes('>')) {
    issues.push('Response contains unfilled template placeholders (< ... >)');
  }

  return issues;
}

// ─── Log AI usage (mirrors ai-usage pattern) ─────────────────────────────────

async function logUsage(
  supabaseUrl: string,
  serviceRoleKey: string,
  params: {
    userId: string;
    preschoolId: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    success: boolean;
  },
) {
  try {
    const client = createClient(supabaseUrl, serviceRoleKey);
    await client.from('ai_usage_logs').insert({
      user_id: params.userId,
      preschool_id: params.preschoolId,
      service_type: 'lesson_generation',
      provider: 'anthropic',
      model: params.model,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      success: params.success,
    });
  } catch (err) {
    // Non-fatal — don't fail the request over logging
    console.warn('[generate-lesson] usage log failed:', err);
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  const corsHeaders = getCorsHeaders(req);

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed. Use POST.' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!anthropicKey) {
    return new Response(JSON.stringify({ error: 'AI service not configured.' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Validate
  const validationError = validateRequest(body);
  if (validationError) {
    return new Response(JSON.stringify({ error: validationError }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Authenticate (mirrors generate-exam pattern)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid session' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Quota check
  const quota = await supabase.rpc('check_ai_usage_limit', {
    p_user_id: user.id,
    p_request_type: 'lesson_generation',
  });

  if (quota.error) {
    console.error('[generate-lesson] quota check failed:', quota.error);
  } else {
    const quotaData = quota.data as Record<string, unknown> | null;
    if (quotaData && typeof quotaData.allowed === 'boolean' && !quotaData.allowed) {
      return new Response(JSON.stringify({
        error: 'quota_exceeded',
        message: "You've reached your AI usage limit for this period.",
        details: quotaData,
      }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  const lessonReq = body as unknown as LessonPlanRequest;
  const userId = user.id;
  const preschoolId = String(body.preschoolId ?? '');

  // ── Build prompts
  const systemPrompt = buildLessonSystemPrompt();
  const userPrompt = buildLessonUserPrompt(lessonReq);

  // ── Call Claude
  let rawText = '';
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: LESSON_MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[generate-lesson] Anthropic error', response.status, errText);
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    rawText = String(data?.content?.[0]?.text ?? '').trim();
    inputTokens = data?.usage?.input_tokens ?? 0;
    outputTokens = data?.usage?.output_tokens ?? 0;
  } catch (err) {
    await logUsage(supabaseUrl, serviceRoleKey, {
      userId, preschoolId, model: LESSON_MODEL,
      inputTokens, outputTokens, success: false,
    });
    return new Response(JSON.stringify({ error: 'AI generation failed. Please try again.' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Parse JSON
  let lessonPlan: Record<string, unknown>;
  try {
    lessonPlan = cleanAndParseJSON(rawText) as Record<string, unknown>;
  } catch (err) {
    console.error('[generate-lesson] JSON parse failed. Raw:', rawText.slice(0, 500));
    await logUsage(supabaseUrl, serviceRoleKey, {
      userId, preschoolId, model: LESSON_MODEL,
      inputTokens, outputTokens, success: false,
    });
    return new Response(JSON.stringify({ error: 'Dash AI returned an invalid response. Please try again.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Quality check + repair (mirrors generate-exam pattern)
  const issues = checkLessonQuality(lessonPlan, lessonReq);
  if (issues.length > 0) {
    console.warn('[generate-lesson] Quality issues, attempting repair:', issues);
    const repairRaw = await repairLessonPlan(anthropicKey, systemPrompt, issues, lessonPlan, lessonReq);
    if (repairRaw) {
      try {
        lessonPlan = cleanAndParseJSON(repairRaw) as Record<string, unknown>;
      } catch {
        console.warn('[generate-lesson] Repair parse failed — using original');
      }
    }
  }

  // ── Stamp generatedAt if missing
  if (!lessonPlan.generatedAt) {
    lessonPlan.generatedAt = new Date().toISOString();
  }

  // ── Log success
  await logUsage(supabaseUrl, serviceRoleKey, {
    userId, preschoolId, model: LESSON_MODEL,
    inputTokens, outputTokens, success: true,
  });

  return new Response(
    JSON.stringify({
      success: true,
      lessonPlan,
      meta: {
        model: LESSON_MODEL,
        inputTokens,
        outputTokens,
        qualityIssues: issues.length > 0 ? issues : undefined,
      },
    }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  );
});
