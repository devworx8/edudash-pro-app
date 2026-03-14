import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';

import { OCR_PROMPT_BY_TASK } from '../generated/ocrPrompts.ts';
import { RequestSchema } from '../schemas.ts';

export function getOCRPrompt(task: 'homework' | 'document' | 'handwriting'): string {
  return OCR_PROMPT_BY_TASK[task] || OCR_PROMPT_BY_TASK.document;
}

export const CRITERIA_RESPONSE_PROMPT = [
  'CRITERIA RESPONSE MODE:',
  '- Identify each criterion label exactly as written in the source.',
  '- Keep section order exactly aligned to the source labels.',
  '- Use one section per criterion with the exact heading text (for example: "a) Planning and delivery of learning programme").',
  '- Never rename or paraphrase criterion headings.',
  '- Do not skip or merge criteria.',
  '- Put evidence in a separate section titled exactly: "Attach all relevant documentation as evidence".',
  '- Do not add names, institutions, signatures, or dates unless explicitly provided by the user.',
].join('\n');

export const CRITERIA_RESPONSE_PATTERNS: RegExp[] = [
  /\b(help|assist|draft|write|answer|respond)\b.{0,30}\b(criteria|criterion|rubric|assessment)\b/i,
  /\b(criteria|criterion|rubric|assessment)\b.{0,30}\b(answer|response|draft|write|help)\b/i,
  /\bgroup discussion response\b/i,
  /\bassessment criteria?\b/i,
  /\bassessment criterion\s*(1|2|3|4|5)\b/i,
  /\banswer (a|b|c|d|e)\b/i,
  /\battach all relevant documentation as evidence\b/i,
];

export function extractMessageText(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      const entry = part as Record<string, unknown>;
      if (entry.type === 'text' && typeof entry.text === 'string') {
        return entry.text.trim();
      }
      return '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

export function countCriteriaLabels(text: string): number {
  const value = String(text || '').toLowerCase();
  if (!value) return 0;
  const alphaMatches = value.match(/\b([a-e])\)/g) || [];
  const alphaUnique = new Set(alphaMatches.map((item) => item.trim())).size;
  const numericMatches = value.match(/\b([1-9])[.)]/g) || [];
  const numericUnique = new Set(numericMatches.map((item) => item.trim())).size;
  return Math.max(alphaUnique, numericUnique);
}

export function getLatestUserTextForCriteria(
  requestPayload: z.infer<typeof RequestSchema>['payload'],
): string {
  if (Array.isArray(requestPayload.messages) && requestPayload.messages.length > 0) {
    for (let idx = requestPayload.messages.length - 1; idx >= 0; idx -= 1) {
      const msg = requestPayload.messages[idx];
      if (msg.role !== 'user') continue;
      const text = extractMessageText(msg.content);
      if (text) return text;
    }
  }

  if (Array.isArray(requestPayload.conversationHistory) && requestPayload.conversationHistory.length > 0) {
    for (let idx = requestPayload.conversationHistory.length - 1; idx >= 0; idx -= 1) {
      const msg = requestPayload.conversationHistory[idx];
      if (msg.role !== 'user') continue;
      const text = extractMessageText(msg.content);
      if (text) return text;
    }
  }

  return String(requestPayload.prompt || '').trim();
}

export function shouldUseCriteriaResponseMode(
  requestPayload: z.infer<typeof RequestSchema>['payload'],
  requestMetadata?: Record<string, unknown>,
): boolean {
  if (requestMetadata?.criteria_mode === true) {
    return true;
  }
  const text = getLatestUserTextForCriteria(requestPayload);
  if (!text) return false;
  if (CRITERIA_RESPONSE_PATTERNS.some((pattern) => pattern.test(text))) {
    return true;
  }
  return countCriteriaLabels(text) >= 3;
}

export function detectPhonicsMode(
  requestPayload: z.infer<typeof RequestSchema>['payload'],
  metadata?: Record<string, unknown>
): boolean {
  const context = [
    requestPayload.prompt,
    requestPayload.context,
    Array.isArray(requestPayload.messages)
      ? requestPayload.messages
          .map((msg) => (typeof msg.content === 'string' ? msg.content : ''))
          .join('\n')
      : '',
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();

  const role = String(metadata?.role || '').toLowerCase();
  const orgType = String(metadata?.org_type || metadata?.organization_type || '').toLowerCase();
  const ageYears = Number(metadata?.age_years ?? metadata?.learner_age_years ?? Number.NaN);
  const grade = String(metadata?.grade || metadata?.grade_level || '').toLowerCase();

  const explicitPhonics = /\bphonics\b|\bletter\s+sound|\bblend(?:ing)?\b|\bsegment(?:ing)?\b|\brhyme\b|\/[a-z]\//i.test(context);
  const preschoolSignals = (
    orgType.includes('preschool') ||
    orgType.includes('ecd') ||
    role === 'parent' ||
    role === 'student' ||
    (Number.isFinite(ageYears) && ageYears <= 6) ||
    grade === 'grade r' ||
    grade === 'pre-r' ||
    grade === 'pre r' ||
    grade === 'grade 1'
  );

  return explicitPhonics || (preschoolSignals && /\b(letter|sound|alphabet|reading)\b/i.test(context));
}

export function extractJsonObjectCandidate(content: string): Record<string, unknown> | null {
  const text = String(content || '').trim();
  if (!text) return null;
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenceMatch?.[1] || text).trim();
  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // Ignore and fall through
  }
  const loose = text.match(/\{[\s\S]*\}/);
  if (!loose) return null;
  try {
    const parsed = JSON.parse(loose[0]) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // Ignore
  }
  return null;
}

export function normalizeOCRResponse(params: {
  content: string;
  task: 'homework' | 'document' | 'handwriting';
}): {
  extracted_text: string;
  confidence: number;
  document_type: 'homework' | 'document' | 'handwriting';
  analysis: string;
  unclear_spans: string[];
} {
  const parsed = extractJsonObjectCandidate(params.content);
  const extractedText = typeof parsed?.extracted_text === 'string'
    ? parsed.extracted_text
    : typeof parsed?.text === 'string'
      ? parsed.text
      : String(params.content || '').trim();
  const analysis = typeof parsed?.analysis === 'string'
    ? parsed.analysis
    : String(params.content || '').trim();
  const confidenceRaw = typeof parsed?.confidence === 'number'
    ? parsed.confidence
    : typeof parsed?.confidence === 'string'
      ? Number.parseFloat(parsed.confidence)
      : 0.72;
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.min(1, Math.max(0, confidenceRaw))
    : 0.72;

  const documentType = (
    parsed?.document_type === 'homework' ||
    parsed?.document_type === 'document' ||
    parsed?.document_type === 'handwriting'
  )
    ? parsed.document_type
    : params.task;
  const unclearSpans = Array.isArray(parsed?.unclear_spans)
    ? parsed.unclear_spans
        .map((span) => String(span || '').trim())
        .filter((span) => span.length > 0)
        .slice(0, 6)
    : (() => {
        const matches = String(analysis || '')
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.includes('[?]'))
          .slice(0, 6);
        return matches;
      })();

  return {
    extracted_text: extractedText,
    confidence: Number(confidence.toFixed(2)),
    document_type: documentType,
    analysis,
    unclear_spans: unclearSpans,
  };
}
