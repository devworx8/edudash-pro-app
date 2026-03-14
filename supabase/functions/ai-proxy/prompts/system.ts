import { DEFAULT_SYSTEM_PROMPT } from '../config.ts';

export const RETRYABLE_PROVIDER_STATUSES = new Set([429, 503, 529]);

export type ResponseMode = 'direct_writing' | 'explain_direct' | 'tutor_interactive';
export type LanguageSource = 'explicit_override' | 'auto_detect' | 'preference';
export type SupportedLocale = 'en-ZA' | 'af-ZA' | 'zu-ZA';

export function parseResponseMode(metadata?: Record<string, unknown>): ResponseMode | null {
  const raw = String(metadata?.response_mode || '').trim().toLowerCase();
  if (raw === 'direct_writing' || raw === 'explain_direct' || raw === 'tutor_interactive') {
    return raw;
  }
  return null;
}

export function parseLanguageSource(metadata?: Record<string, unknown>): LanguageSource | null {
  const raw = String(metadata?.language_source || '').trim().toLowerCase();
  if (raw === 'explicit_override' || raw === 'auto_detect' || raw === 'preference') {
    return raw;
  }
  return null;
}

export function parseDetectedLocale(metadata?: Record<string, unknown>): SupportedLocale | null {
  const raw = String(metadata?.detected_language || '').trim().toLowerCase();
  if (!raw) return null;
  if (raw === 'af' || raw === 'af-za') return 'af-ZA';
  if (raw === 'zu' || raw === 'zu-za') return 'zu-ZA';
  if (raw === 'en' || raw === 'en-za') return 'en-ZA';
  return null;
}

export function getLocaleLabel(locale: SupportedLocale): string {
  if (locale === 'af-ZA') return 'Afrikaans';
  if (locale === 'zu-ZA') return 'isiZulu';
  return 'English (South Africa)';
}

export function getLanguagePrompt(metadata?: Record<string, unknown>): string | null {
  const locale = parseDetectedLocale(metadata);
  if (!locale) return null;
  const source = parseLanguageSource(metadata);
  const label = getLocaleLabel(locale);

  if (source === 'explicit_override') {
    return [
      'LANGUAGE MODE: explicit_override',
      `- Reply fully in ${label} (${locale}) for this turn.`,
      '- Keep examples and explanations in the same language.',
    ].join('\n');
  }
  if (source === 'auto_detect') {
    return [
      'LANGUAGE MODE: auto_detect',
      `- The learner appears to be using ${label} (${locale}).`,
      '- Reply in the same language unless they ask to switch.',
    ].join('\n');
  }
  if (source === 'preference') {
    return [
      'LANGUAGE MODE: preference',
      `- Prefer ${label} (${locale}) unless the user requests another language explicitly.`,
    ].join('\n');
  }
  return null;
}

export function getResponseModePrompt(mode: ResponseMode | null): string | null {
  if (mode === 'direct_writing') {
    return [
      'RESPONSE MODE: direct_writing',
      '- Produce polished, complete writing output requested by the user.',
      '- Do not switch into quiz/tutor loop unless explicitly requested.',
      '- Keep structure clean and publication-ready.',
    ].join('\n');
  }
  if (mode === 'tutor_interactive') {
    return [
      'RESPONSE MODE: tutor_interactive',
      '- Use one-question-at-a-time tutoring.',
      '- Wait for learner response before moving on.',
      '- Give brief scaffolds and corrections between turns.',
      '- Use $...$ / $$...$$ when showing maths steps.',
    ].join('\n');
  }
  if (mode === 'explain_direct') {
    return [
      'RESPONSE MODE: explain_direct',
      '- Explain directly and clearly first.',
      '- Only add quiz-style interaction when the user asks for testing/practice.',
    ].join('\n');
  }
  return null;
}

export function buildSystemPrompt(
  extraContext?: string,
  serviceType?: string,
  requestMetadata?: Record<string, unknown>,
  pedagogicalMode?: 'direct' | 'socratic'
): string {
  // Grading requests get a specialised system prompt — the tutor persona
  // would otherwise attempt conversation instead of grading.
  if (serviceType === 'grading') {
    const GRADING_SYSTEM_PROMPT = [
      'You are an experienced South African teacher responsible for grading student work.',
      'Evaluate the student submission against the criteria provided in the user message.',
      'Always respond with ONLY valid JSON (no markdown fences, no preamble, no trailing text).',
      'JSON schema: { "score": <0-100>, "feedback": "<constructive, age-appropriate feedback>",',
      '  "strengths": ["..."], "areasForImprovement": ["..."], "suggestions": ["..."] }',
      'Be encouraging. Identify genuine strengths before listing areas for improvement.',
      'If a language preference is specified, respond in that language.',
    ].join('\n');
    return extraContext
      ? `${GRADING_SYSTEM_PROMPT}\n\nCONTEXT:\n${extraContext}`
      : GRADING_SYSTEM_PROMPT;
  }

  const responseModePrompt = getResponseModePrompt(parseResponseMode(requestMetadata));
  const languagePrompt = getLanguagePrompt(requestMetadata);

  // Socratic mode: guide the student with questions instead of direct answers
  const socraticPrompt = pedagogicalMode === 'socratic'
    ? [
        'SOCRATIC MODE (ACTIVE):',
        '- Do NOT give the answer directly. Instead, ask a guiding question that leads the student toward the answer.',
        '- Break complex problems into smaller steps and ask about the first step.',
        '- If the student is stuck after 2-3 exchanges, give a stronger hint but still frame it as a question.',
        '- Acknowledge correct reasoning enthusiastically before moving to the next step.',
        '- Only reveal the full answer if the student explicitly asks you to after trying.',
      ].join('\n')
    : null;

  const promptParts = [DEFAULT_SYSTEM_PROMPT, responseModePrompt, languagePrompt, socraticPrompt].filter(Boolean);
  const basePrompt = promptParts.join('\n\n');
  if (!extraContext) return basePrompt;

  // Check if extra context contains image/attachment directives (high priority)
  const hasImageDirective = extraContext.includes('IMAGE PROCESSING') ||
                            extraContext.includes('IMAGE ANALYSIS') ||
                            extraContext.includes('VISION PROCESSING');

  if (hasImageDirective) {
    // Put image directives FIRST (higher priority than default prompt)
    return `${extraContext}\n\n${basePrompt}`;
  }

  // Normal context appended after default prompt
  return `${basePrompt}\n\nCONTEXT:\n${extraContext}`;
}
