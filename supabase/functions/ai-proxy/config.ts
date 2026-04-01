// ── Constants and configuration ────────────────────────────────────────────

export const DEFAULT_OPENAI_ALLOWED_MODELS = ['gpt-4o-mini', 'gpt-4o'];

export const DEFAULT_ANTHROPIC_ALLOWED_MODELS = [
  'claude-3-haiku-20240307',
  'claude-haiku-4-5-20251001',
  'claude-3-5-haiku-20241022',
  'claude-3-5-sonnet-20241022',
  'claude-3-7-sonnet-20250219',
  'claude-sonnet-4-20250514',
  'claude-sonnet-4-5-20250514',
  'claude-opus-4-20250514',
  'claude-3-sonnet-20240229',
  'claude-3-opus-20240229',
];

export const DEFAULT_SUPERADMIN_ALLOWED_MODELS = [
  'claude-sonnet-4-20250514',
  'claude-sonnet-4-5-20250514',
];

// ── MAX TOKENS BY SERVICE TYPE ──────────────────────────────────────
// Different service types need different token budgets
export const MAX_TOKENS_BY_SERVICE: Record<string, number> = {
  chat_message: 2048,
  lesson_generation: 4096,
  homework_generation: 4096,
  grading: 2048,
  exam_generation: 4096,
  agent_plan: 1024,
  agent_reflection: 256,
  web_search: 1024,
  image_analysis: 2048,
  image_generation: 512,
  smart_reply: 256,
  message_translation: 512,
  agent_remediation: 4096,
  // Specialist service types
  caps_curriculum_query: 3072,
  caps_lesson_alignment: 3072,
  progress_report_generation: 4096,
  progress_report_comment: 2048,
  parent_notification: 1024,
  parent_message_draft: 1024,
  sms_template: 256,
  whatsapp_message: 512,
  quiz_generation: 3072,
  homework_help: 2048,
  explain_concept: 2048,
};

export const DEFAULT_MAX_TOKENS = 2048;
export const DEFAULT_TEMPERATURE = 0.4;
export const VOICE_CHAT_TEMPERATURE = 0.15;

export const SERVER_TOOL_NAMES = new Set([
  'web_search',
  'search_caps_curriculum',
  'get_caps_documents',
  'get_caps_subjects',
  'caps_curriculum_query',
]);

export const DEFAULT_SYSTEM_PROMPT = `You are Dash, an AI learning companion for South African schools and families.

PERSONALITY:
- Warm, encouraging, and enthusiastic — especially with learners.
- Celebrate curiosity: open answers with a brief, genuine acknowledgement ("Great question!", "Good thinking!", "Let's explore this together!").
- Use relevant emojis naturally to add energy (1–3 per response, never forced).
- Be age-appropriate: simpler vocabulary and short sentences for younger learners; richer detail for older students and teachers.
- Never make a learner feel bad for not knowing something.
- NEVER address anyone as "User" — if you don't know their name, use "you" or skip the name entirely.

CORE BEHAVIOR:
- Give accurate, specific, context-aware answers.
- Break explanations into clear steps or short paragraphs — avoid walls of text.
- Use analogies and real-world examples from South African life where helpful.
- If attachments are provided, analyze them directly and reference concrete details.
- Ask at most one clarifying question only when required.
- For homework help: guide and scaffold — ask a leading question first rather than giving the answer outright. For direct questions from parents or teachers, answer directly.

TOOLS:
- Use available tools when real data or external information is needed.
- For current, local, or high-stakes topics such as health, legal, financial, safety, local services, prices, schedules, or news, use web_search before answering.
- Do not claim actions were completed unless a tool confirms it.
- If live web search fails or returns no relevant results, say that clearly and do not present the answer as verified web research.

LANGUAGE:
- Follow explicit language instructions from the user or metadata.
- If no language is specified, respond in clear English (South Africa).
- Use South African terminology: "learner" not "student", "term" not "semester", "Grade R" not "Kindergarten".

MATH RENDERING CONTRACT:
- Use $...$ for inline math and $$...$$ for display equations/steps.
- Do not output escaped delimiters like \\$...\\$.
- Keep math syntax KaTeX-compatible and avoid raw LaTeX outside delimiters.

CONVERSATION CONTINUITY:
- Treat short replies like "yes", "okay", "please help", "continue", or "what about number 2?" as follow-ups to the immediately preceding turn when that context is available.
- Do not reset with a generic greeting when the user is clearly continuing the same conversation.
- Never invent a future user reply or include lines that begin with "User:", "Learner:", "Student:", or "Parent:" unless the user explicitly asked for a script or transcript.`;

// ── PII FILTERING ─────────────────────────────────────────────────────
// Redact sensitive personal information before sending to AI providers
export const PII_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[EMAIL]' },
  { pattern: /\b(?:\+27|0)[0-9]{9,10}\b/g, replacement: '[PHONE]' },
  { pattern: /\b\d{2}[01]\d[0-3]\d\d{4}[01]\d{2}\b/g, replacement: '[SA_ID]' },
  { pattern: /\b\d{13}\b/g, replacement: '[ID_NUMBER]' },
  { pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b/g, replacement: '[CARD_NUMBER]' },
];

export const IMAGE_BUCKET = 'dash-generated-images';
export const IMAGE_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24; // 24 hours

/** Quota weight per model — must stay in sync with lib/ai/models.ts MODEL_WEIGHTS */
export const MODEL_QUOTA_WEIGHTS: Record<string, number> = {
  'claude-3-haiku-20240307': 1,
  'claude-haiku-4-5-20251001': 2,
  'claude-3-5-haiku-20241022': 3,
  'claude-3-5-sonnet-20241022': 5,
  'claude-3-7-sonnet-20250219': 6,
  'claude-sonnet-4-20250514': 8,
  'claude-sonnet-4-5-20250514': 10,
  'claude-opus-4-20250514': 12,
  'claude-3-opus-20240229': 10,
  'claude-3-sonnet-20240229': 5,
  'gpt-4o': 5,
  'gpt-4o-mini': 1,
};

export function getMaxTokensForService(serviceType: string): number {
  return MAX_TOKENS_BY_SERVICE[serviceType] || DEFAULT_MAX_TOKENS;
}

export function resolveTemperature(requestMetadata?: Record<string, unknown>): number {
  const context = String(requestMetadata?.context || requestMetadata?.source || '').toLowerCase();
  return context.includes('voice_chat') || context.includes('dash_voice_orb')
    ? VOICE_CHAT_TEMPERATURE
    : DEFAULT_TEMPERATURE;
}

export function normalizeServiceType(serviceType?: string): string {
  if (!serviceType) return 'chat_message';
  if (serviceType === 'dash_conversation' || serviceType === 'dash_ai') {
    return 'chat_message';
  }
  if (serviceType === 'grading_assistance') {
    return 'grading';
  }
  if (serviceType === 'remediation_lead' || serviceType === 'code_remediation') {
    return 'agent_remediation';
  }
  return serviceType;
}

export function getModelQuotaWeight(model?: string | null): number {
  if (!model) return 1;
  return MODEL_QUOTA_WEIGHTS[model] ?? 1;
}
