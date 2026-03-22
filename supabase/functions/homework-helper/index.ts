/**
 * homework-helper — Supabase Edge Function
 *
 * Powers the Dash AI homework helper for parents and learners.
 * Key principle: Dash scaffolds and guides — it NEVER just solves the problem.
 * Parents/learners learn HOW to think, not just get the answer.
 *
 * Deploy: supabase functions deploy homework-helper
 */

import { serve } from 'https://deno.land/std@0.214.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

// ─── Models ───────────────────────────────────────────────────────────────────
const HELPER_MODEL = 'claude-haiku-4-5-20251001';   // fast — learners need quick responses
const MAX_TOKENS = 1024;

// ─── Types ────────────────────────────────────────────────────────────────────

type HelpMode =
  | 'explain'        // Explain a concept clearly
  | 'hint'           // Give a hint without solving
  | 'check'          // Check the learner's attempt and give feedback
  | 'step_by_step'   // Walk through the method step by step (without solving their specific problem)
  | 'vocabulary';    // Explain a word or term

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface HomeworkHelperRequest {
  // The question or problem
  question: string;
  learnerAttempt?: string;   // what the learner tried (for 'check' mode)
  subject?: string;
  grade?: number;
  language: string;
  helpMode: HelpMode;

  // Conversation history for multi-turn
  conversationHistory?: ConversationMessage[];

  // Internal
  userId?: string;
  preschoolId?: string;
  callerRole?: 'parent' | 'student' | 'learner';
}

// ─── Validation ───────────────────────────────────────────────────────────────

const VALID_MODES: HelpMode[] = ['explain', 'hint', 'check', 'step_by_step', 'vocabulary'];

function validate(body: Record<string, unknown>): string | null {
  if (!body.question || typeof body.question !== 'string' || body.question.trim().length < 2) {
    return 'question is required';
  }
  if (!body.language || typeof body.language !== 'string') return 'language is required';
  if (!body.helpMode || !VALID_MODES.includes(body.helpMode as HelpMode)) {
    return `helpMode must be one of: ${VALID_MODES.join(', ')}`;
  }
  if (body.helpMode === 'check' && !body.learnerAttempt) {
    return 'learnerAttempt is required when helpMode is "check"';
  }
  return null;
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildHelperSystemPrompt(req: HomeworkHelperRequest): string {
  const gradeLabel = req.grade !== undefined
    ? (req.grade === 0 ? 'Grade R' : `Grade ${req.grade}`)
    : 'unknown grade';
  const isParent = req.callerRole === 'parent';

  return `You are Dash AI, the friendly homework helper in EduDash Pro — built for South African school learners and their parents.

## Your most important rule — NEVER JUST SOLVE
You MUST NEVER simply give the answer to a homework problem. Your job is to help the learner UNDERSTAND and THINK — not to do their homework for them.
- For 'hint' mode: give a clue or point in the right direction. Never the answer.
- For 'explain' mode: explain the concept or method, using a DIFFERENT example than their question.
- For 'step_by_step' mode: walk through the METHOD using a similar but DIFFERENT example. Do not solve their specific problem.
- For 'check' mode: give feedback on their attempt — what's right, what's wrong, and WHY. Do not give the correct answer outright; guide them to find it.
- For 'vocabulary' mode: explain the word or term clearly with examples.

## Learner context
- Grade: ${gradeLabel}
- Subject: ${req.subject ?? 'Not specified'}
- Caller: ${isParent ? 'Parent helping their child' : 'Learner'}
- Language: ${req.language}

## Tone
- Warm, patient, encouraging — never condescending
- ${isParent ? 'Explain things clearly enough that a parent can help their child at home. Give the parent the CONCEPT and METHOD so they can coach, not just the answer.' : 'Speak directly to the learner in age-appropriate language. Be encouraging and build confidence.'}
- Use SA names and examples: Thabo, Nomsa, Sipho. SA currency (Rands), SA contexts.
- SA spelling: colour, organise, programme

## CAPS alignment
- Keep explanations aligned with SA CAPS curriculum for ${gradeLabel}
- Use the correct SA terminology for the subject
- Foundation Phase (Gr R–3): very simple, concrete, relatable to everyday life
- Intermediate Phase (Gr 4–6): practical, real-world examples
- Senior Phase (Gr 7–9): more abstract reasoning, encourage "show your working"
- FET Phase (Gr 10–12): conceptual depth, link to exam technique

## Language rules
- Write your ENTIRE response in ${req.language}
- If ${req.language} is not English, use correct grammar and vocabulary for that language
- Keep explanations natural — not a literal translation

## Format rules
- Keep responses concise — learners have short attention spans
- Use simple numbered steps when explaining a method
- Use encouraging phrases: "Good thinking!", "You're on the right track!", "Let's look at this together"
- End with a question that nudges the learner to try the next step themselves
- Return a JSON object with this structure:
  {
    "response": "<your full response in ${req.language}>",
    "followUpPrompt": "<a question to ask the learner to keep them thinking — in ${req.language}>",
    "encouragement": "<a short encouraging phrase — in ${req.language}>",
    "didSolve": false
  }
- IMPORTANT: didSolve must ALWAYS be false. You never solve the problem — you guide.`;
}

// ─── Usage logger ─────────────────────────────────────────────────────────────

async function logUsage(
  supabaseUrl: string,
  serviceRoleKey: string,
  params: { userId: string; preschoolId: string; inputTokens: number; outputTokens: number; success: boolean },
) {
  try {
    const client = createClient(supabaseUrl, serviceRoleKey);
    await client.from('ai_usage_logs').insert({
      user_id: params.userId,
      preschool_id: params.preschoolId,
      service_type: 'homework_help',
      provider: 'anthropic',
      model: HELPER_MODEL,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      success: params.success,
    });
  } catch (err) {
    console.warn('[homework-helper] usage log failed:', err);
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCorsOptions(req);

  const corsHeaders = getCorsHeaders(req);

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Use POST.' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!anthropicKey) {
    return new Response(JSON.stringify({ error: 'AI service not configured.' }), {
      status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const validationError = validate(body);
  if (validationError) {
    return new Response(JSON.stringify({ error: validationError }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
    p_request_type: 'homework_help',
  });

  if (quota.error) {
    console.error('[homework-helper] quota check failed:', quota.error);
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

  const helperReq = body as unknown as HomeworkHelperRequest;
  const userId = user.id;
  const preschoolId = String(body.preschoolId ?? '');

  const systemPrompt = buildHelperSystemPrompt(helperReq);

  // Build the user message combining mode + question + attempt
  const modeLabels: Record<HelpMode, string> = {
    hint:         'Please give me a hint for this problem (not the answer)',
    explain:      'Please explain the concept behind this problem using a different example',
    check:        'Please check my attempt and tell me what I got right or wrong',
    step_by_step: 'Please walk me through the method using a similar example (not my exact problem)',
    vocabulary:   'Please explain this word or term',
  };

  const userMessage = [
    `Help mode: ${modeLabels[helperReq.helpMode]}`,
    ``,
    `Question/Problem: ${helperReq.question}`,
    helperReq.learnerAttempt ? `\nMy attempt: ${helperReq.learnerAttempt}` : '',
    ``,
    `Respond in ${helperReq.language}. Return only the JSON object described in your instructions.`,
  ].join('\n');

  // Build conversation history for multi-turn — sanitize roles to prevent injection
  const sanitizedHistory = (helperReq.conversationHistory ?? [])
    .filter((msg): msg is ConversationMessage =>
      msg != null && typeof msg === 'object' &&
      typeof msg.content === 'string' &&
      (msg.role === 'user' || msg.role === 'assistant')
    );
  const messages: ConversationMessage[] = [
    ...sanitizedHistory,
    { role: 'user', content: userMessage },
  ];

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
        model: HELPER_MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages,
      }),
    });

    if (!response.ok) throw new Error(`Anthropic error: ${response.status}`);

    const data = await response.json();
    const rawText = String(data?.content?.[0]?.text ?? '').trim();
    inputTokens = data?.usage?.input_tokens ?? 0;
    outputTokens = data?.usage?.output_tokens ?? 0;

    const cleaned = rawText
      .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

    let helperResponse: Record<string, unknown>;
    try {
      helperResponse = JSON.parse(cleaned);
    } catch {
      // Fallback: if JSON parse fails, wrap the raw text
      helperResponse = {
        response: rawText,
        followUpPrompt: null,
        encouragement: null,
        didSolve: false,
      };
    }

    // Safety check — ensure didSolve is always false
    helperResponse.didSolve = false;

    await logUsage(supabaseUrl, serviceRoleKey, {
      userId, preschoolId, inputTokens, outputTokens, success: true,
    });

    return new Response(
      JSON.stringify({
        success: true,
        helpMode: helperReq.helpMode,
        helperResponse,
        // Return the updated history so the app can maintain multi-turn state
        updatedHistory: [
          ...(helperReq.conversationHistory ?? []),
          { role: 'user', content: userMessage },
          { role: 'assistant', content: String(helperResponse.response ?? rawText) },
        ],
        meta: { model: HELPER_MODEL, inputTokens, outputTokens },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[homework-helper] error:', err);
    await logUsage(supabaseUrl, serviceRoleKey, {
      userId, preschoolId, inputTokens, outputTokens, success: false,
    });
    return new Response(JSON.stringify({ error: 'Dash AI is unavailable. Please try again.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
