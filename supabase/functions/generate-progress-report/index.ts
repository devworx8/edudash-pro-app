/**
 * generate-progress-report — Supabase Edge Function
 *
 * Generates parent-friendly AI progress reports from teacher assessment data.
 * Uses claude-haiku for speed (parents see this in near real-time).
 *
 * Deploy: supabase functions deploy generate-progress-report
 */

import { serve } from 'https://deno.land/std@0.214.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

// ─── Models ───────────────────────────────────────────────────────────────────
// Haiku for speed — progress reports are high-volume and latency-sensitive
const REPORT_MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 2048;

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubjectResult {
  subject: string;
  mark?: number;         // percentage 0–100
  symbol?: string;       // e.g. 'A', 'B', '4', '5'
  comment?: string;      // teacher's raw comment
  attendancePercent?: number;
}

interface ProgressReportRequest {
  // Learner
  learnerName: string;
  grade: number;
  term: 1 | 2 | 3 | 4;

  // Results
  subjects: SubjectResult[];

  // Context
  overallAttendancePercent?: number;
  teacherOverallComment?: string;
  language: string;         // language to write the report in
  schoolName?: string;
  reportStyle?: 'brief' | 'detailed'; // default: 'detailed'

  // Internal
  userId?: string;
  preschoolId?: string;
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validate(body: Record<string, unknown>): string | null {
  if (!body.learnerName || typeof body.learnerName !== 'string') return 'learnerName is required';
  if (body.grade === undefined || typeof body.grade !== 'number') return 'grade is required (0–12)';
  if (!body.term || ![1, 2, 3, 4].includes(body.term as number)) return 'term must be 1–4';
  if (!Array.isArray(body.subjects) || body.subjects.length === 0) return 'subjects array is required';
  if (!body.language || typeof body.language !== 'string') return 'language is required';
  return null;
}

// ─── Prompt builders ──────────────────────────────────────────────────────────

function buildReportSystemPrompt(): string {
  return `You are Dash AI, the intelligent school assistant in EduDash Pro — built for South African schools.

Your role here is to convert raw teacher assessment data into warm, clear, parent-friendly progress reports that South African parents can easily understand — regardless of their education level or home language.

## Tone and style
- Warm, encouraging, and honest — never harsh or discouraging
- Plain language — avoid academic jargon. Write as if speaking to a parent face-to-face.
- Specific — reference actual subjects, marks, and behaviours, not generic praise
- Constructive — for weaker areas, always include a practical tip for parents to support at home
- Culturally aware — use SA names naturally, respect Ubuntu values of community and support

## SA context
- Marks are percentages (0–100). Symbols: A (80–100%), B (70–79%), C (60–69%), D (50–59%), E (40–49%), F (below 40%)
- CAPS subjects: use correct SA subject names (Mathematical Literacy not "Math Lit", Life Orientation not "LO")
- SA spelling: colour, programme, organise, behaviour, neighbour
- Currency: Rands (R), not dollars

## Language rules
- Write the ENTIRE report in the requested language
- If the language is Afrikaans, isiZulu, or any other SA language — write ALL content in that language
- Keep the tone warm and accessible in that language — not a literal word-for-word translation

## Format rules — CRITICAL
- Return ONLY valid JSON matching the schema in the user message
- No markdown, no preamble, no text outside the JSON
- All string values must be complete — never leave placeholders`;
}

function buildReportUserPrompt(req: ProgressReportRequest): string {
  const gradeLabel = req.grade === 0 ? 'Grade R' : `Grade ${req.grade}`;
  const style = req.reportStyle ?? 'detailed';

  const subjectLines = req.subjects.map((s) => {
    const parts = [`Subject: ${s.subject}`];
    if (s.mark !== undefined) parts.push(`Mark: ${s.mark}%`);
    if (s.symbol) parts.push(`Symbol: ${s.symbol}`);
    if (s.attendancePercent !== undefined) parts.push(`Attendance: ${s.attendancePercent}%`);
    if (s.comment) parts.push(`Teacher comment: "${s.comment}"`);
    return parts.join(' | ');
  }).join('\n');

  return `Generate a ${style} parent-friendly progress report for:

Learner: ${req.learnerName}
Grade: ${gradeLabel}
Term: Term ${req.term}
School: ${req.schoolName ?? 'Not specified'}
Overall attendance: ${req.overallAttendancePercent !== undefined ? `${req.overallAttendancePercent}%` : 'Not provided'}
Teacher overall comment: ${req.teacherOverallComment ?? 'None provided'}
Language for report: ${req.language}

Subject results:
${subjectLines}

IMPORTANT:
- Write the entire report in ${req.language}
- Use warm, plain language a South African parent can easily understand
- For each subject below 60%, include one practical home-support tip
- Return ONLY valid JSON in this exact structure:

{
  "learnerName": "${req.learnerName}",
  "grade": "${gradeLabel}",
  "term": ${req.term},
  "language": "${req.language}",
  "generatedAt": "<ISO timestamp>",

  "overallSummary": "<2–3 warm sentences summarising this term's performance overall. Reference the learner by first name. Acknowledge effort as well as results.>",

  "attendanceSummary": "<1 sentence on attendance — positive if good, gentle concern if below 85%.>",

  "subjectReports": [
    {
      "subject": "<subject name>",
      "mark": <number or null>,
      "symbol": "<letter symbol or null>",
      "narrative": "<2–3 sentences: what went well, what needs work, specific and warm>",
      "homeSupportTip": "<1 practical tip for parents — only include if mark is below 60%, otherwise null>"
    }
  ],

  "strengthsHighlight": "<1–2 sentences highlighting the learner's strongest area(s) this term>",

  "focusForNextTerm": "<1–2 sentences on the most important area to focus on next term — constructive, not discouraging>",

  "closingMessage": "<A warm closing sentence to the parent, signed from the teacher — in ${req.language}>"
}`;
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
      service_type: 'progress_analysis',
      provider: 'anthropic',
      model: REPORT_MODEL,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      success: params.success,
    });
  } catch (err) {
    console.warn('[generate-progress-report] usage log failed:', err);
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

  const reportReq = body as unknown as ProgressReportRequest;
  const userId = String(body.userId ?? '');
  const preschoolId = String(body.preschoolId ?? '');

  const systemPrompt = buildReportSystemPrompt();
  const userPrompt = buildReportUserPrompt(reportReq);

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
        model: REPORT_MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic error: ${response.status}`);
    }

    const data = await response.json();
    const rawText = String(data?.content?.[0]?.text ?? '').trim();
    inputTokens = data?.usage?.input_tokens ?? 0;
    outputTokens = data?.usage?.output_tokens ?? 0;

    // Clean and parse
    const cleaned = rawText
      .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    const report = JSON.parse(cleaned);

    if (!report.generatedAt) report.generatedAt = new Date().toISOString();

    await logUsage(supabaseUrl, serviceRoleKey, {
      userId, preschoolId, inputTokens, outputTokens, success: true,
    });

    return new Response(
      JSON.stringify({ success: true, report, meta: { model: REPORT_MODEL, inputTokens, outputTokens } }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[generate-progress-report] error:', err);
    await logUsage(supabaseUrl, serviceRoleKey, {
      userId, preschoolId, inputTokens, outputTokens, success: false,
    });
    return new Response(JSON.stringify({ error: 'Report generation failed. Please try again.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
