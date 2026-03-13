import { detectPhonicsIntent } from '@/lib/dash-ai/phonicsDetection';
type SupportedLang = 'en' | 'af' | 'zu';

export interface TranscriptFormatOptions {
  whisperFlow?: boolean;
  summarize?: boolean;
  preschoolMode?: boolean;
  maxSummaryWords?: number;
}

export interface TranscriptModelPromptOptions {
  locale?: string | null;
  preschoolMode?: boolean;
}

const detectLanguage = (locale?: string | null): SupportedLang => {
  const short = (locale || 'en').toLowerCase();
  if (short.startsWith('af')) return 'af';
  if (short.startsWith('zu')) return 'zu';
  return 'en';
};

const QUESTION_STARTERS: Record<SupportedLang, string[]> = {
  en: [
    'who', 'what', 'where', 'when', 'why', 'how',
    'can', 'could', 'should', 'is', 'are', 'do', 'does', 'did',
    'will', 'would', 'may', 'might', 'am', 'was', 'were',
    'please', 'tell me', 'help me', 'explain', 'show me', 'give me',
  ],
  af: [
    'wie', 'wat', 'waar', 'wanneer', 'hoekom', 'waarom', 'hoe',
    'kan', 'sal', 'sou', 'moet', 'is', 'was', 'wil', 'mag', 'het',
    'help my', 'verduidelik', 'sê vir my',
  ],
  zu: [
    'ngubani', 'yini', 'kuphi', 'nini', 'kungani', 'ngani', 'kanjani',
    'ingabe', 'ngicela', 'ungangisiza', 'ungachaza', 'siza',
  ],
};

const FILLER_PATTERNS: Array<[RegExp, string]> = [
  [/\b(um+|uh+|erm+|hmm+|ah+)\b/gi, ''],
  [/\b(you know|like|sort of|kind of|basically|actually)\b/gi, ''],
  [/\b(i mean|so basically|right so)\b/gi, ''],
];

/**
 * Fix common STT grammar artifacts where the recognizer produces
 * nonsensical pronoun/verb combinations.
 */
const GRAMMAR_FIXES: Array<[RegExp, string]> = [
  [/\bwhat are meant\b/gi, 'what I meant'],
  [/\bwhat are mean\b/gi, 'what I mean'],
  [/\bwhat is meant was\b/gi, 'what I meant was'],
  [/\bwhat are meant was\b/gi, 'what I meant was'],
  [/\bhow is you\b/gi, 'how are you'],
  [/\bhow are you is\b/gi, 'how are you'],
  [/\bdo you can\b/gi, 'can you'],
  [/\bcan you please to\b/gi, 'can you please'],
  [/\bi wants\b/gi, 'I want'],
  [/\bi needs\b/gi, 'I need'],
  [/\bi doesn't\b/gi, "I don't"],
];

import { STT_CORRECTIONS } from '@/lib/voice/sttDictionary';

// Domain-specific + generic corrections (shared via sttDictionary)
const COMMON_STT_CORRECTIONS: Array<[RegExp, string]> = STT_CORRECTIONS;

const looksLikeQuestion = (text: string, lang: SupportedLang): boolean => {
  const lower = text.toLowerCase();
  return QUESTION_STARTERS[lang].some((starter) => {
    return (
      lower === starter ||
      lower.startsWith(`${starter} `) ||
      lower.startsWith(`${starter},`) ||
      lower.startsWith(`${starter}?`)
    );
  });
};

const collapseDuplicateWords = (text: string): string => {
  // "please please help me" -> "please help me"
  return text.replace(/\b([a-z']+)(?:\s+\1){1,4}\b/gi, '$1');
};

const applyWhisperFlowAutoEdits = (
  input: string,
  lang: SupportedLang,
  preschoolMode: boolean
): string => {
  let next = input;

  for (const [pattern, replacement] of COMMON_STT_CORRECTIONS) {
    next = next.replace(pattern, replacement);
  }

  // Grammar fixes for common STT artifacts (run before filler removal)
  if (lang === 'en') {
    for (const [pattern, replacement] of GRAMMAR_FIXES) {
      next = next.replace(pattern, replacement);
    }
  }

  if (!preschoolMode) {
    for (const [pattern, replacement] of FILLER_PATTERNS) {
      next = next.replace(pattern, replacement);
    }
  }

  next = collapseDuplicateWords(next);

  if (lang === 'en') {
    next = next.replace(/\bi\b/g, 'I');
  }

  return next.replace(/\s{2,}/g, ' ').trim();
};

const summarizeTranscriptIntent = (
  text: string,
  lang: SupportedLang,
  maxWords = 20
): string => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  const words = normalized.split(' ').filter(Boolean);
  if (words.length <= maxWords) return normalized;

  // Keep phonics utterances untouched to avoid losing teaching markers.
  if (/[\/\[]([a-z]{1,8})[\/\]]/i.test(normalized) || /\bphonics\b/i.test(normalized)) {
    return normalized;
  }

  const sentences = normalized
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const questionSentence = sentences.find((s) => looksLikeQuestion(s, lang) || /\?$/.test(s));
  const candidate = questionSentence || sentences[0] || normalized;
  const candidateWords = candidate.split(' ').filter(Boolean);

  if (candidateWords.length <= maxWords) return candidate;

  const trimmed = candidateWords.slice(0, maxWords).join(' ');
  return /[.?!]$/.test(trimmed) ? trimmed : `${trimmed}...`;
};

const normalizePhonicsTranscript = (text: string, lang: SupportedLang): string => {
  if (lang !== 'en') return text;
  let next = text;

  // Common STT confusion when learner says "letter sound ..."
  next = next.replace(/\b(latest|later|late)\s+sound\s+([a-z])\b/gi, 'letter sound /$2/');
  next = next.replace(/\bletter\s+sound\s+([a-z])\b/gi, 'letter sound /$1/');
  next = next.replace(/\bthe\s+sound\s+is\s+([a-z])\b/gi, 'the sound is /$1/');
  next = next.replace(/\bsound\s+([a-z])\b/gi, 'sound /$1/');

  // "sss" / "ffff" / "mmmm" -> "/s/" / "/f/" / "/m/" for better phonics capture.
  // This helps when the learner says only a letter sound and STT returns repeated chars.
  next = next.replace(/\b([b-df-hj-np-tv-z])\1{2,8}\b/gi, (_m, letter: string) => {
    return `/${String(letter || '').toLowerCase()}/`;
  });

  // "/sss/" -> "/s/" (normalize over-extended markers to a single phoneme symbol)
  next = next.replace(/\/([b-df-hj-np-tv-z])\1{1,8}\//gi, (_m, letter: string) => {
    return `/${String(letter || '').toLowerCase()}/`;
  });

  // Repeated single letters become one phoneme marker.
  next = next.replace(
    /\b([b-df-hj-np-tv-z])(?:[\s,;:/\\|._-]+\1){1,8}\b/gi,
    (_, letter: string) => `/${String(letter || '').toLowerCase()}/`
  );

  return next;
};

const shouldNormalizePhonicsTranscript = (
  text: string,
  lang: SupportedLang,
  preschoolMode: boolean
): boolean => {
  if (lang !== 'en') return false;
  const value = String(text || '');
  if (!value.trim()) return false;
  if (detectPhonicsIntent(value)) return true;
  if (/[\/\[]([a-z]{1,8})[\/\]]/i.test(value)) return true;
  if (/\b[a-z]-[a-z](?:-[a-z])+\b/i.test(value)) return true;
  if (!preschoolMode) return false;
  return /\b(letter(?:s)?|phoneme|phonics|alphabet|sound\s+out|reading\s+letters?|reading\s+words?)\b/i.test(value);
};

export const formatTranscript = (
  rawText: string,
  locale?: string | null,
  options: TranscriptFormatOptions = {}
): string => {
  return formatTranscriptWithOptions(rawText, locale, options);
};

export const formatTranscriptWithOptions = (
  rawText: string,
  locale?: string | null,
  options: TranscriptFormatOptions = {}
): string => {
  const {
    whisperFlow = true,
    summarize = false,
    preschoolMode = false,
    maxSummaryWords = 20,
  } = options;

  const cleaned = rawText.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';

  const lang = detectLanguage(locale);
  let result = cleaned.replace(/\s+([?.!])/g, '$1');

  if (whisperFlow) {
    result = applyWhisperFlowAutoEdits(result, lang, preschoolMode);
  }

  if (shouldNormalizePhonicsTranscript(result, lang, preschoolMode)) {
    result = normalizePhonicsTranscript(result, lang);
  }

  // Preserve common education/domain acronyms and names.
  result = result
    .replace(/\bfnb\b/gi, 'FNB')
    .replace(/\bcaps\b/gi, 'CAPS')
    .replace(/\bpdf\b/gi, 'PDF')
    .replace(/\bstt\b/gi, 'STT')
    .replace(/\btts\b/gi, 'TTS')
    .replace(/\bai\b/gi, 'AI')
    .replace(/\bedudash\b/gi, 'EduDash')
    .replace(/\bdash ai\b/gi, 'Dash AI');

  result = result.charAt(0).toUpperCase() + result.slice(1);

  const hasTerminalPunctuation = /[.?!]$/.test(result);
  if (!hasTerminalPunctuation) {
    result += looksLikeQuestion(result, lang) ? '?' : '.';
  } else {
    const trailing = result.match(/[.?!]+$/);
    if (trailing && trailing[0].length > 1) {
      result = result.slice(0, -trailing[0].length) + trailing[0].slice(-1);
    }
  }

  if (summarize) {
    result = summarizeTranscriptIntent(result, lang, maxSummaryWords);
  }

  return result;
};

export const formatTranscriptSmart = formatTranscriptWithOptions;

const ACTION_INTENT_PATTERN =
  /\b(explain|help|show|solve|teach|quiz|test|practice|summari[sz]e|compare|create|write|mark|review|check|calculate|draw|generate)\b/i;

export const buildTranscriptModelPrompt = (
  rawText: string,
  options: TranscriptModelPromptOptions = {},
): string => {
  const locale = options.locale || null;
  const polished = formatTranscriptWithOptions(rawText, locale, {
    whisperFlow: true,
    summarize: true,
    preschoolMode: options.preschoolMode || false,
    maxSummaryWords: options.preschoolMode ? 16 : 28,
  });

  const cleaned = polished
    .replace(/^dash[,:\s-]+/i, '')
    .replace(/^okay[,:\s-]+/i, '')
    .trim();
  if (!cleaned) return '';

  const lang = detectLanguage(locale);
  const lower = cleaned.toLowerCase();
  const looksActionable = ACTION_INTENT_PATTERN.test(lower) || looksLikeQuestion(cleaned, lang) || /\?$/.test(cleaned);

  if (looksActionable) return cleaned;

  if (cleaned.split(/\s+/).length <= 6) {
    return `Please help me with this topic: ${cleaned}`;
  }

  return `Please help me with this request: ${cleaned}`;
};
