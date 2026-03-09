/**
 * Dash Voice Screen — Utilities
 *
 * Extracted helpers for the full-screen ORB experience.
 * Keeps dash-voice.tsx under WARP.md 500-line limit.
 *
 * Covers: system prompts, TTS cleaning, SSE streaming, language
 * detection, phonics helpers, and web-search gating.
 *
 * @module lib/dash-voice-utils
 */

import { SUPPORTED_LANGUAGES } from '@/components/super-admin/voice-orb/useVoiceSTT';
import type { SupportedLanguage } from '@/components/super-admin/voice-orb/useVoiceSTT';
import { normalizeForTTS } from '@/lib/dash-ai/ttsNormalize';
import { SHARED_PHONICS_PROMPT_BLOCK } from '@/lib/dash-ai/phonicsPrompt';
import { dashAiDevLogVoiceResponse } from '@/lib/dash-ai/dashAiDevLogger';
import { getTutorChallengePlan } from '@/features/dash-assistant/tutorChallengePolicy';

// ── Quick Actions ────────────────────────────────────────────────────

export interface QuickAction {
  id: string;
  label: string;
  icon: string;
  prompt: string;
}

export function getQuickActions(orgType: string, role: string): QuickAction[] {
  const isPreschool = orgType === 'preschool';
  const normalizedRole = String(role || '').trim().toLowerCase();
  const isStaff = [
    'teacher',
    'principal',
    'principal_admin',
    'admin',
    'super_admin',
    'superadmin',
    'manager',
    'staff',
  ].includes(normalizedRole);
  const quizChallengeTarget = getTutorChallengePlan({
    mode: 'quiz',
    difficulty: 2,
    learnerContext: {
      schoolType: isPreschool ? 'preschool' : orgType || null,
    },
  }).maxQuestions;

  if (isStaff && isPreschool) {
    return [
      { id: 'theme', label: 'Theme plan', icon: 'sparkles-outline', prompt: 'Brainstorm a weekly theme plan with daily activities, circle time ideas, and parent tips. Use ECD language and play-based activities suitable for ages 3-6.' },
      { id: 'routine', label: 'Routine', icon: 'time-outline', prompt: 'Create a structured daily routine with transitions and classroom management cues for a preschool.' },
      { id: 'activity', label: 'Activity', icon: 'hand-left-outline', prompt: 'Design a hands-on interactive activity for preschoolers. Include materials, steps, and assessment.' },
    ];
  }
  if (isStaff) {
    return [
      { id: 'lesson', label: 'Lesson plan', icon: 'book-outline', prompt: 'Help me plan a CAPS-aligned lesson. Ask me the subject and grade first.' },
      { id: 'activity', label: 'Activity', icon: 'hand-left-outline', prompt: 'Design an interactive classroom activity. Ask me the subject first.' },
      { id: 'assess', label: 'Assessment', icon: 'clipboard-outline', prompt: 'Help me create an assessment rubric. Ask me the topic and grade.' },
    ];
  }
  if (isPreschool) {
    return [
      { id: 'explain', label: 'Explain', icon: 'bulb-outline', prompt: 'Use a short story and ask one simple question to get started.' },
      { id: 'practice', label: 'Practice', icon: 'pencil-outline', prompt: 'Give one playful practice question. Wait for the answer before continuing.' },
      { id: 'quiz', label: 'Quiz me', icon: 'school-outline', prompt: `Quiz with about ${quizChallengeTarget} very easy questions using colors, shapes, or counting.` },
    ];
  }
  return [
    { id: 'explain', label: 'Explain', icon: 'bulb-outline', prompt: 'Ask me one short diagnostic question first, then explain step-by-step in simple language.' },
    { id: 'solve', label: 'Help solve', icon: 'pencil-outline', prompt: 'Give me one practice question to diagnose my level. Wait for my answer before continuing.' },
    { id: 'quiz', label: 'Test me', icon: 'school-outline', prompt: `Quiz me with about ${quizChallengeTarget} questions, starting easy and getting harder.` },
  ];
}

/**
 * Detect whether a user message likely needs web search (tools enabled).
 * Keeps true streaming by default; only enables tools when needed.
 */
export function needsWebSearch(text: string): boolean {
  const lower = text.toLowerCase();
  const searchPatterns = [
    'search for', 'look up', 'find out', 'google',
    'what is the latest', 'current news', 'recent',
    'who won', 'what happened', 'today', 'yesterday',
    'how much does', 'price of', 'weather',
  ];
  return searchPatterns.some((p) => lower.includes(p));
}

export function shouldEnableVoiceTurnTools(input: string, options?: {
  hasAttachment?: boolean;
  ocrMode?: boolean;
  criteriaIntent?: boolean;
}): boolean {
  const text = String(input || '').toLowerCase();
  if (!text.trim()) return false;

  // OCR and strict criteria flows are prompt-constrained and benefit from low-latency text generation.
  if (options?.ocrMode) return false;
  if (options?.criteriaIntent) return false;

  const explicitPdfIntent = /\b(export|generate|create|make|download)\b/i.test(text) && /\bpdf\b/i.test(text);
  if (explicitPdfIntent) return true;

  const explicitToolIntent = /\b(export[_\s-]*pdf|generate[_\s-]*(pdf|worksheet|chart)|open\s+pdf|send email|email this|navigate|open screen)\b/i.test(text);
  if (explicitToolIntent) return true;
  if (needsWebSearch(text)) return true;

  // Attachments can usually be handled directly in the model context without tool overhead.
  // Keep tools off unless explicitly required by intent above.
  if (options?.hasAttachment) return false;

  return false;
}

// ── System Prompt Builder ────────────────────────────────────────────

export interface SystemPromptOptions {
  /** Whether the current conversation has active phonics signals */
  phonicsActive?: boolean;
}

export function buildSystemPrompt(
  orgType: string,
  role: string,
  language: SupportedLanguage | null,
  options?: SystemPromptOptions,
): string {
  const phonicsActive = options?.phonicsActive ?? true; // default true for backward compat
  const parts: string[] = [];
  const normalizedRole = String(role || '').trim().toLowerCase();
  const isSuperAdmin = normalizedRole === 'super_admin' || normalizedRole === 'superadmin';
  const isStaff = [
    'teacher',
    'principal',
    'principal_admin',
    'admin',
    'super_admin',
    'superadmin',
    'staff',
    'manager',
  ].includes(normalizedRole);
  const identityLine = isSuperAdmin
    ? 'You are Dash, a world-class A.I. operations copilot for the EduDashPro platform owner.'
    : isStaff
      ? 'You are Dash, a world-class A.I. assistant for South African educators and school operations.'
      : 'You are Dash, a world-class A.I. tutor built for South African learners.';

  // ── Core identity ────────────────────────────────────────────────
  parts.push(
    identityLine,
    'You speak naturally and conversationally — like a warm, patient, encouraging human teacher.',
    'Your responses will be read aloud by text-to-speech, so write the way you would SPEAK:',
    '- NO emojis, icons, or special unicode symbols.',
    '- NO markdown formatting (no **, *, #, >, `, [], (), bullet points).',
    '- NO numbered lists. Use natural flowing sentences instead.',
    '- Write out numbers under 10 as words ("three" not "3").',
    '- Spell out abbreviations on first use ("A.I." not "AI").',
    '- Use short, clear sentences. Pause with periods, not commas.',
    '- Never say "asterisk", "hashtag", "bullet", or reference formatting.',
    '- Avoid meta-language like "Here is a list" — just give the content naturally.',
    '',
  );

  if (isSuperAdmin) {
    parts.push(
      'SUPER ADMIN MODE:',
      'Optimize for platform operations: monitoring, debugging, incident response, security, billing, onboarding, and shipping.',
      'Do NOT assume the user is a parent or that they have a child unless they explicitly say so.',
      'If the user asks about a school, treat it as an organization record with type, tier, staff, learners, and data pipelines.',
      '',
    );
  }

  // ── Voice interface awareness ────────────────────────────────────
  parts.push(
    'VOICE INTERFACE (CRITICAL):',
    'The user speaks to you via voice and hears your reply via TTS.',
    'NEVER say you cannot hear the user or that you are text-based.',
    'If unclear, say "Could you say that again?"',
    'Group replies into 1-2 medium sentences per thought for smooth TTS.',
    'PHONICS: Always use slash markers /s/, /m/, /b/ for letter sounds. Never write "sss" or "s s s".',
    '',
  );

  // ── Org-specific pedagogy ────────────────────────────────────────
  if (orgType === 'preschool') {
    const isParent = normalizedRole === 'parent' || normalizedRole === 'guardian';
    const isLearner = normalizedRole === 'student' || normalizedRole === 'learner';
    if (isStaff) {
      parts.push(
        'You are helping preschool staff run a school day smoothly.',
        'Prioritize weekly programs, daily routines, transitions, materials, and parent communication.',
        'If asked for learner support, keep it play-based and suitable for ages three to six.',
        '',
      );
    } else if (isParent || isLearner) {
    parts.push(
      'CRITICAL: You are talking to a PARENT whose child is a preschooler aged three to six.',
      'The parent may be reading your response to their child, or a child may be listening via TTS.',
      'ALL your content must be suitable for and understandable by a three to six year old.',
      '',
      'PRESCHOOL RULES (MANDATORY):',
      'Use VERY simple words. Maximum two-syllable words unless teaching a new word.',
      'Keep sentences SHORT. Five to eight words per sentence.',
      'ONE concept at a time. Never combine topics.',
      'Use repetition. Repeat key words naturally.',
      'Be warm, playful, silly, and full of praise and wonder.',
      'Use character names children can relate to: Benny the Bunny, Zara the Zebra, etc.',
      'When asking questions, make them EASY and give obvious clues.',
      'Never ask abstract or philosophical questions.',
      'Use concrete objects: fingers, apples, crayons, animals, toys.',
      '',
      'INTERACTIVE QUESTIONS (very important):',
      'When asking counting questions, always phrase them clearly:',
      '"What comes after two?" or "How many apples?" or "Can you count to three?"',
      'When asking about colors: "What colour is the sky?" or "Can you find something red?"',
      'When asking about shapes: "What shape is a ball?" or "How many sides does a triangle have?"',
      'For yes/no: "Should Benny share his carrots?" or "Do you want to count with me?"',
      'Always make the answer obvious for a three to six year old.',
      'Never ask trick questions or ambiguous questions.',
      '',
      'CRITICAL FORMAT FOR QUESTIONS:',
      'When giving a choice question, ALWAYS list the options at the end using "X, Y, or Z?" format.',
      'For example: "What colour is a banana? Is it red, yellow, or blue?"',
      'For example: "What comes after two? Is it one, three, or five?"',
      'For example: "What shape is a ball? Is it a circle, square, or triangle?"',
      'This format lets the child tap on answer buttons. ALWAYS include two to four options.',
      'Put the correct answer among the options. Make wrong options plausible but clearly different.',
      '',
      ...(phonicsActive ? [SHARED_PHONICS_PROMPT_BLOCK, ''] : [
        'For phonics: use slash markers /s/, /m/ so TTS speaks the sound correctly.',
        '',
      ]),
      'OTHER EARLY LEARNING:',
      'Teach counting with real objects: "Let\'s count. One apple. Two apples. Three apples."',
      'Teach colours, shapes, sizes through stories and questions.',
      'Use call-and-response: "Can you say it with me? Red!"',
      'Celebrate every attempt: "Great try! Let\'s do it together."',
      '',
      'RESPONSE LENGTH:',
      'Keep responses to TWO to THREE short paragraphs maximum.',
      'Each paragraph should be two to three sentences.',
      'End with ONE simple question or invitation.',
      '',
    );
    } else {
      parts.push(
        'EARLY LEARNING MODE:',
        'The user context is unknown. Do NOT assume they are a parent.',
        'If they ask for phonics or early reading, keep the phonics sounds clear and short, but keep normal pacing for full sentences.',
        'Use simple, concrete explanations and ask one short question at the end.',
        '',
      );
    }
  } else if (orgType === 'k12_school') {
    parts.push(
      'You are helping school-age learners.',
      'Adapt to the learner\'s grade level. Use CAPS-aligned curriculum where relevant.',
      'Break complex topics into simple steps. Use the Socratic method.',
      'Provide culturally relevant South African examples.',
      'For younger primary school learners, also support phonics and reading skills.',
      'For older learners, encourage critical thinking and problem-solving.',
      '',
    );
  } else {
    parts.push(
      'Adapt to the learner\'s age and level.',
      'Be patient, encouraging, and use clear explanations.',
      '',
    );
  }

  // ── Staff mode ───────────────────────────────────────────────────
  if (isStaff) {
    parts.push(
      'The user is a staff member. Help with lesson planning, activities, routines, and assessment.',
      'Provide structured but spoken-style guidance they can use directly.',
      '',
    );
  }

  // ── Conversation style ───────────────────────────────────────────
  parts.push(
    'CONVERSATION RULES:',
    'Keep responses concise — two to three short paragraphs max.',
    'Ask ONE question at a time and wait for the answer.',
    'Praise effort. For wrong answers: "Good try! The answer is actually..."',
    'Only greet on the very first message. After that, continue naturally.',
    'WHITEBOARD: Wrap concept explanations in [WHITEBOARD]...[/WHITEBOARD]. Not for greetings.',
    'MULTIPLICATION TABLES: Always generate times tables up to ×12 (not ×10). South African curriculum requires 1–12.',
    'SPELLING: For spelling bee/practice, NEVER write the target word in plain text. Use the spelling card:',
    '```spelling',
    '{"type":"spelling_practice","word":"WORD","prompt":"Listen and spell the word","hint":"Optional sentence","language":"en","hide_word_reveal":true}',
    '```',
    'The card hides the word from view and lets the student listen then type. Never expose the word in prose.',
    '',
  );

  // ── Web search ───────────────────────────────────────────────────
  parts.push(
    'Use web_search for current events or facts you are unsure of.',
    '',
  );

  // ── Language handling (CRITICAL) ─────────────────────────────────
  if (language) {
    const name = SUPPORTED_LANGUAGES.find((l) => l.code === language)?.name || language;
    const langCode = language.split('-')[0];

    if (langCode === 'af') {
      parts.push(
        'LANGUAGE: The user wants Afrikaans.',
        'Respond primarily in Afrikaans.',
        'When teaching Afrikaans to a child who also speaks English, you may use English briefly to explain a concept, then switch back to Afrikaans.',
        'Example: "Die woord is \'hond\'. That means dog. Kan jy sê \'hond\'?"',
        'Pronounce Afrikaans words correctly. The \'g\' is guttural. The \'r\' is rolled.',
        'NEVER write Afrikaans words with English pronunciation guides.',
        'Write Afrikaans naturally and idiomatically.',
        'For phonics in Afrikaans: teach Afrikaans letter sounds.',
        '"A" is "ah", "B" is "buh", "D" is "duh", "G" is the guttural "ghh".',
        'Use Afrikaans CVC words: "kat", "hond", "bal", "vis", "son".',
        '',
      );
    } else if (langCode === 'zu') {
      parts.push(
        'LANGUAGE: The user wants isiZulu.',
        'Respond primarily in isiZulu.',
        'When teaching isiZulu to a child who also speaks English, you may briefly explain in English, then return to isiZulu.',
        'Example: "Igama leli ngu-\'inja\'. That means dog. Ungasho \'inja\'?"',
        'Write isiZulu naturally with correct grammar.',
        'Use proper isiZulu click consonants and tonal patterns in your text.',
        'NEVER write isiZulu words using English phonetic spelling.',
        'For phonics: teach isiZulu syllable patterns (ba, be, bi, bo, bu).',
        '',
      );
    } else {
      parts.push(
        `LANGUAGE: User prefers ${name}. Respond in ${name}.`,
        'You may naturally use South African English idioms and examples.',
        'When teaching Afrikaans or isiZulu vocabulary to English speakers, say the word naturally.',
        '',
      );
    }
  } else {
    parts.push(
      'Respond in English by default.',
      'If the user speaks in Afrikaans or isiZulu, switch to that language naturally.',
      'You may code-switch (mix languages) as South Africans naturally do.',
      '',
    );
  }

  return parts.join('\n');
}

// ── Text Cleaning ────────────────────────────────────────────────────

/**
 * Thoroughly clean AI response text for TTS playback.
 * Strips markdown, emojis, icons, unicode symbols, code blocks,
 * and normalises whitespace so Azure Neural voices read naturally.
 */
export function cleanForTTS(t: string, options?: { phonicsMode?: boolean }): string {
  return normalizeForTTS(t, {
    phonicsMode: options?.phonicsMode,
    preservePhonicsMarkers: options?.phonicsMode,
  });
}

/**
 * Build a concise spoken variant for voice-first UX.
 * Keeps on-screen answer complete while reducing TTS delay/choppiness.
 */
export function buildVoicePlaybackText(
  text: string,
  opts?: { maxChars?: number; maxSentences?: number }
): string {
  const maxChars = Number.isFinite(opts?.maxChars as number) ? Number(opts?.maxChars) : 220;
  const maxSentences = Number.isFinite(opts?.maxSentences as number) ? Number(opts?.maxSentences) : 2;
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= maxChars) return normalized;

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (sentences.length === 0) {
    const clipped = normalized.slice(0, maxChars);
    const lastSpace = clipped.lastIndexOf(' ');
    return `${(lastSpace > 60 ? clipped.slice(0, lastSpace) : clipped).trim()}.`;
  }

  let spoken = '';
  for (let i = 0; i < sentences.length && i < maxSentences; i += 1) {
    const candidate = spoken ? `${spoken} ${sentences[i]}` : sentences[i];
    if (candidate.length > maxChars) break;
    spoken = candidate;
  }

  if (spoken) return spoken;
  const first = sentences[0];
  const clipped = first.slice(0, maxChars);
  const lastSpace = clipped.lastIndexOf(' ');
  return `${(lastSpace > 40 ? clipped.slice(0, lastSpace) : clipped).trim()}.`;
}

export function cleanRawJSON(text: string): string {
  // Strip SSE artifacts that should never reach the UI
  const stripped = text
    .replace(/^data:\s*\[DONE\]\s*$/gm, '')
    .replace(/^data:\s*/gm, '')
    .trim();
  if (!stripped) return '';
  if (!stripped.startsWith('{')) return stripped;
  const lines = stripped.split('\n');
  let out = '';
  for (const l of lines) {
    try {
      const p = JSON.parse(l);
      if (p.delta?.text) out += p.delta.text;
      else if (p.content) out += p.content;
      else if (p.text) out += p.text;
    } catch {
      if (!l.includes('content_block_delta')) out += l + '\n';
    }
  }
  return out.trim() || stripped;
}

// ── TTS Chunking ─────────────────────────────────────────────────────

/** Canonical max chunk length for TTS. Tuned higher to reduce chunk round-trips. */
export const TTS_CHUNK_MAX_LEN = 1800;
/** Optional smaller first chunk for faster playback start without fragmenting the full response. */
export const TTS_FAST_START_FIRST_CHUNK_MAX_LEN = 220;

/**
 * Split text into sentence-aligned chunks for TTS.
 * Ensures speech never cuts off mid-sentence.
 * Each chunk ≤ maxLen characters, split at sentence boundaries.
 */
export function splitForTTS(text: string, maxLen = TTS_CHUNK_MAX_LEN): string[] {
  if (!text || text.length <= maxLen) return text ? [text] : [];

  // Split at sentence boundaries
  const sentences: string[] = [];
  let buf = '';
  for (const ch of text) {
    buf += ch;
    if (ch === '.' || ch === '!' || ch === '?') {
      if (buf.trim()) sentences.push(buf.trim());
      buf = '';
    }
  }
  if (buf.trim()) sentences.push(buf.trim());

  // Group sentences into chunks under maxLen
  const chunks: string[] = [];
  let current = '';
  for (const s of sentences) {
    if ((current + ' ' + s).trim().length > maxLen) {
      if (current.trim()) chunks.push(current.trim());
      current = s;
    } else {
      current = current ? `${current} ${s}` : s;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks.length > 0 ? chunks : [text];
}

/**
 * Build TTS chunks with an optional smaller first chunk.
 * Unlike naively re-splitting the first base chunk, this keeps the
 * remainder grouped at the normal max length so playback stays fluent.
 */
export function splitForTTSWithFastStart(
  text: string,
  opts?: {
    enabled?: boolean;
    maxLen?: number;
    firstChunkMaxLen?: number;
  },
): string[] {
  const normalized = String(text || '').trim();
  if (!normalized) return [];

  const maxLen = Number.isFinite(opts?.maxLen as number)
    ? Number(opts?.maxLen)
    : TTS_CHUNK_MAX_LEN;
  const firstChunkMaxLen = Number.isFinite(opts?.firstChunkMaxLen as number)
    ? Number(opts?.firstChunkMaxLen)
    : TTS_FAST_START_FIRST_CHUNK_MAX_LEN;
  const baseChunks = splitForTTS(normalized, maxLen);

  if (!opts?.enabled || baseChunks.length === 0) {
    return baseChunks;
  }

  const [firstBaseChunk, ...remainingBaseChunks] = baseChunks;
  if (firstBaseChunk.length <= firstChunkMaxLen) {
    return baseChunks;
  }

  const firstChunkCandidates = splitForTTS(firstBaseChunk, firstChunkMaxLen);
  if (firstChunkCandidates.length <= 1) {
    return baseChunks;
  }

  const [fastStartChunk, ...firstChunkRemainder] = firstChunkCandidates;
  const remainderText = [...firstChunkRemainder, ...remainingBaseChunks].join(' ').trim();
  const remainderChunks = remainderText ? splitForTTS(remainderText, maxLen) : [];

  return [fastStartChunk, ...remainderChunks];
}

// ── Streaming Placeholder ────────────────────────────────────────────

/** Context-aware placeholder shown while waiting for AI response. */
export function getStreamingPlaceholder(userMessage: string): string {
  const lower = userMessage.toLowerCase().trim();
  if (/^(hi|hello|hey|howzit|good\s*(morning|afternoon|evening)|sup)\b/.test(lower)) {
    return 'Hey there! 👋';
  }
  if (lower.startsWith('what') || lower.startsWith('how') || lower.startsWith('why') || lower.startsWith('can you') || lower.endsWith('?')) {
    return 'Let me think about that...';
  }
  if (lower.includes('worksheet') || lower.includes('homework') || lower.includes('generate') || lower.includes('create')) {
    return 'Creating that for you...';
  }
  if (lower.includes('quiz') || lower.includes('test me') || lower.includes('practice')) {
    return 'Setting up your practice...';
  }
  if (lower.includes('math') || lower.includes('calculate') || lower.includes('solve')) {
    return 'Working on the math...';
  }
  return 'Thinking...';
}

// ── Language Detection ───────────────────────────────────────────────

/** Detect dominant language of a text segment (for per-chunk TTS routing). */
export function detectTextLanguage(text: string): 'en' | 'af' | 'zu' {
  const t = (text || '').toLowerCase();
  // Afrikaans markers
  if (/\b(hallo|asseblief|baie|goed|dankie|graag|ek|jy|nie|dit|wat|kan|sal|hoe|waar|wanneer|hoekom|sê|vir)\b/i.test(t)) {
    // Count Afrikaans tokens vs total words
    const afWords = (t.match(/\b(hallo|asseblief|baie|goed|dankie|graag|ek|jy|nie|dit|wat|kan|sal|hoe|waar|wanneer|hoekom|sê|vir|het|van|met|is|maar|ook|al|nog|of|om|te)\b/gi) || []).length;
    const totalWords = t.split(/\s+/).length;
    if (afWords / totalWords > 0.2) return 'af';
  }
  // isiZulu markers
  if (/\b(sawubona|ngiyabonga|yebo|cha|unjani|umfundi|ufunde|ngicela|ungangisiza|kanjani|ngubani|kuphi|nini|kungani)\b/i.test(t)) {
    return 'zu';
  }
  return 'en';
}

// ── SSE Parsing ──────────────────────────────────────────────────────

/**
 * Parse SSE text into content. Handles both true Anthropic SSE and
 * the ai-proxy simulated SSE format.
 */
export function parseSSEText(raw: string): string {
  let full = '';
  for (const line of raw.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const payload = line.slice(6).trim();
    if (payload === '[DONE]') continue;
    try {
      const parsed = JSON.parse(payload);
      if (parsed.delta?.text) full += parsed.delta.text;
      else if (parsed.content) full += parsed.content;
    } catch {
      /* skip malformed lines */
    }
  }
  return full;
}

/**
 * Create a streaming XHR request for SSE on React Native.
 * Falls back gracefully if the runtime doesn't support incremental reads.
 */
export function createStreamingRequest(
  url: string,
  token: string,
  body: string,
  onChunk: (accumulated: string) => void,
  onDone: (finalText: string) => void,
  onError: (error: Error) => void,
): { abort: () => void } {
  const max429Retries = Math.max(
    0,
    Math.min(
      3,
      Number.parseInt(String(process.env.EXPO_PUBLIC_DASH_VOICE_429_RETRIES || '1'), 10) || 1
    )
  );
  const retryBaseMs = Math.max(
    300,
    Math.min(
      6000,
      Number.parseInt(String(process.env.EXPO_PUBLIC_DASH_VOICE_429_RETRY_MS || '900'), 10) || 900
    )
  );

  let xhr: XMLHttpRequest | null = null;
  let aborted = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryCount = 0;

  const clearRetryTimer = () => {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const parseRetryAfterHeader = (value: string | null): number | null => {
    if (!value) return null;
    const seconds = Number.parseFloat(value);
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    return Math.round(seconds * 1000);
  };

  const scheduleRetry = (delayMs: number) => {
    clearRetryTimer();
    retryTimer = setTimeout(() => {
      if (aborted) return;
      sendAttempt();
    }, delayMs);
  };

  const sendAttempt = () => {
    if (aborted) return;

    const request = new XMLHttpRequest();
    xhr = request;
    request.open('POST', url, true);
    request.setRequestHeader('Content-Type', 'application/json');
    request.setRequestHeader('Authorization', `Bearer ${token}`);

    let processedLen = 0;
    let accumulated = '';
    let serverError = '';

    const processNewData = (newData: string) => {
      for (const line of newData.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') continue;
        try {
          const parsed = JSON.parse(payload) as Record<string, unknown>;
          // Extract streaming content: Anthropic content_block_delta and generic delta/content
          const delta = parsed?.delta as { text?: string } | undefined;
          const text = delta?.text ?? (parsed?.content as string | undefined);
          if (typeof text === 'string' && text) {
            accumulated += text;
          }
          // Capture server-side error events so they reach the user
          if (parsed?.type === 'error' && parsed.error != null) {
            serverError = typeof parsed.error === 'string'
              ? parsed.error
              : JSON.stringify(parsed.error);
          }
        } catch {
          /* skip malformed JSON */
        }
      }
      if (accumulated) onChunk(accumulated);
    };

    // Process incremental response: onreadystatechange (readyState 3) and onprogress.
    // On React Native, some runtimes only populate responseText at readyState 4; server
    // sends chunked SSE with X-Accel-Buffering: no to minimize proxy buffering.
    const processIncremental = () => {
      if (request.readyState >= 3 && request.responseText) {
        const newData = request.responseText.substring(processedLen);
        processedLen = request.responseText.length;
        if (newData) processNewData(newData);
      }
    };
    request.onreadystatechange = processIncremental;
    request.onprogress = processIncremental;

    request.onload = () => {
      if (aborted) return;

      // Handle rate limiting with a short jittered retry for voice turns.
      if (request.status === 429 && retryCount < max429Retries) {
        retryCount += 1;
        const retryAfterMs = parseRetryAfterHeader(request.getResponseHeader('retry-after'));
        const expBackoff = retryBaseMs * Math.pow(1.6, retryCount - 1);
        const jitterFactor = 0.8 + Math.random() * 0.4;
        const delayMs = retryAfterMs ?? Math.round(expBackoff * jitterFactor);
        scheduleRetry(delayMs);
        return;
      }

      // Handle non-200 HTTP responses (auth errors, Edge Function failures)
      if (request.status >= 400) {
        let errMsg = `Request failed (${request.status})`;
        try {
          const errJson = JSON.parse(request.responseText);
          errMsg = errJson.message || errJson.error || errMsg;
        } catch {
          /* use default message */
        }
        dashAiDevLogVoiceResponse(request.status, request.responseText || '', { message: errMsg });
        onError(new Error(errMsg));
        return;
      }

      // Process any remaining data
      if (request.responseText) {
        const remaining = request.responseText.substring(processedLen);
        if (remaining) processNewData(remaining);
      }

      // If a server-side error was captured, surface it
      if (!accumulated && serverError) {
        onError(new Error(serverError));
        return;
      }

      // If no SSE data was captured, try JSON fallback then SSE parse
      if (!accumulated && request.responseText) {
        try {
          const json = JSON.parse(request.responseText);
          accumulated = json.content || json.response || '';
        } catch {
          // Try proper SSE parsing instead of using raw text
          const sseParsed = parseSSEText(request.responseText);
          accumulated = sseParsed || '';
        }
      }

      const final = cleanRawJSON(accumulated);
      onDone(final);
    };

    request.onerror = () => {
      if (aborted) return;
      if (retryCount < max429Retries) {
        retryCount += 1;
        const expBackoff = retryBaseMs * Math.pow(1.6, retryCount - 1);
        const jitterFactor = 0.8 + Math.random() * 0.4;
        scheduleRetry(Math.round(expBackoff * jitterFactor));
        return;
      }
      onError(new Error('Network error — check your connection'));
    };

    request.ontimeout = () => {
      if (aborted) return;
      if (retryCount < max429Retries) {
        retryCount += 1;
        const expBackoff = retryBaseMs * Math.pow(1.6, retryCount - 1);
        const jitterFactor = 0.8 + Math.random() * 0.4;
        scheduleRetry(Math.round(expBackoff * jitterFactor));
        return;
      }
      onError(new Error('Request timed out'));
    };
    request.timeout = 60000;
    request.send(body);
  };

  sendAttempt();

  return {
    abort: () => {
      aborted = true;
      clearRetryTimer();
      xhr?.abort();
    },
  };
}
