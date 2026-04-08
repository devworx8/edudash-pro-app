/**
 * SINGLE SOURCE OF TRUTH for Dash TTS text normalization.
 * All TTS paths (VoiceOrb, DashVoiceController, DashVoiceService, web useTTS)
 * MUST use this module. Do not create platform-specific copies.
 *
 * Keeps pronunciation consistent across mobile/web/edge proxies.
 * Uses the central pronunciation dictionary for brand names, SA language
 * names, abbreviations, and educational terms.
 *
 * @see pronunciationDictionary.ts — master SSML pronunciation lookup
 */

import { applyPronunciationPlainText } from './pronunciationDictionary';

export interface TTSNormalizeOptions {
  expandContractions?: boolean;
  phonicsMode?: boolean;
  preservePhonicsMarkers?: boolean;
}

const CONTRACTION_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bI'm\b/gi, 'I am'],
  [/\bI've\b/gi, 'I have'],
  [/\bI'll\b/gi, 'I will'],
  [/\bI'd\b/gi, 'I would'],
  [/\byou're\b/gi, 'you are'],
  [/\byou've\b/gi, 'you have'],
  [/\byou'll\b/gi, 'you will'],
  [/\bwe're\b/gi, 'we are'],
  [/\bwe've\b/gi, 'we have'],
  [/\bwe'll\b/gi, 'we will'],
  [/\bthey're\b/gi, 'they are'],
  [/\bthey've\b/gi, 'they have'],
  [/\bcan't\b/gi, 'cannot'],
  [/\bwon't\b/gi, 'will not'],
  [/\bdon't\b/gi, 'do not'],
  [/\bdoesn't\b/gi, 'does not'],
  [/\bdidn't\b/gi, 'did not'],
  [/\bisn't\b/gi, 'is not'],
  [/\baren't\b/gi, 'are not'],
  [/\bwasn't\b/gi, 'was not'],
  [/\bweren't\b/gi, 'were not'],
];

const NORMALIZE_CACHE_MAX = 200;
const normalizeCache = new Map<string, string>();

function getCacheKey(input: string, options: TTSNormalizeOptions): string {
  const expand = options.expandContractions !== false;
  const phonics = options.phonicsMode === true;
  const preserve = options.preservePhonicsMarkers ?? phonics;
  return `${expand ? 1 : 0}|${phonics ? 1 : 0}|${preserve ? 1 : 0}|${input}`;
}

function getCachedNormalized(key: string): string | null {
  const cached = normalizeCache.get(key);
  if (typeof cached !== 'string') return null;
  // Refresh LRU position
  normalizeCache.delete(key);
  normalizeCache.set(key, cached);
  return cached;
}

function setCachedNormalized(key: string, value: string): void {
  if (normalizeCache.has(key)) normalizeCache.delete(key);
  normalizeCache.set(key, value);
  if (normalizeCache.size > NORMALIZE_CACHE_MAX) {
    const oldest = normalizeCache.keys().next().value;
    if (oldest) normalizeCache.delete(oldest);
  }
}

/** Map of common sustained-sound text to their single-letter marker */
const SUSTAINED_SOUND_MAP: Record<string, string> = {
  sss: 's', mmm: 'm', fff: 'f', zzz: 'z', nnn: 'n', lll: 'l',
  rrr: 'r', vvv: 'v', hhh: 'h',
  buh: 'b', duh: 'd', tuh: 't', puh: 'p', guh: 'g', kuh: 'k',
  juh: 'j', wuh: 'w', yuh: 'y',
  ah: 'a', eh: 'e', ih: 'i', aw: 'o', uh: 'u',
};

function normalizeEduDashBrandForms(text: string): string {
  return text
    // "E D U DashPro" / "E.D.U Dash Pro" -> "EduDash Pro"
    .replace(/\bE[\s.\-]*D[\s.\-]*U[\s.\-]*DASH[\s-]*PRO\b/gi, 'EduDash Pro')
    // "Edu Dash Pro" / "Edu-Dash-Pro" -> "EduDash Pro"
    .replace(/\bEDU[\s-]*DASH[\s-]*PRO\b/gi, 'EduDash Pro')
    // "EduDashPro" -> "EduDash Pro"
    .replace(/\bEduDashPro\b/g, 'EduDash Pro');
}

function normalizePhonicsMarkers(
  text: string,
  phonicsMode: boolean,
  preservePhonicsMarkers: boolean
): string {
  let next = String(text || '');

  // Canonicalize loose marker spacing first: "/ s /" -> "/s/", "[ sh ]" -> "[sh]"
  next = next.replace(/\/\s*([a-z]{1,6})\s*\//gi, (_m, token: string) => {
    const normalized = String(token || '').toLowerCase();
    return phonicsMode && preservePhonicsMarkers ? `/${normalized}/` : normalized;
  });
  next = next.replace(/\[\s*([a-z]{1,6})\s*\]/gi, (_m, token: string) => {
    const normalized = String(token || '').toLowerCase();
    return phonicsMode && preservePhonicsMarkers ? `[${normalized}]` : normalized;
  });

  // In non-phonics speech paths, markers should never be spoken literally.
  if (!phonicsMode || !preservePhonicsMarkers) {
    next = next
      .replace(/\/([a-z]{1,6})\//gi, '$1')
      .replace(/\[([a-z]{1,6})\]/gi, '$1');
  }

  return next;
}

function collapseRepeatedLetterSounds(text: string, phonicsMode: boolean): string {
  // 1. Convert spaced repetitions: "s s s" → "/s/"
  let result = text.replace(
    /\b([a-z])(?:[\s,;:/\\|._-]+\1){1,8}\b/gi,
    (match, letter: string) => {
      const lower = letter.toLowerCase();
      if (phonicsMode) {
        return `/${lower}/`;
      }
      const repeats = match
        .replace(/[^\w\s-]/g, ' ')
        .split(/[\s-]+/)
        .filter(Boolean).length;
      const size = Math.max(3, Math.min(6, repeats));
      return lower.repeat(size);
    }
  );

  // 2. Convert continuous repeated letters: "ssss" -> "/s/" (phonics) or "ssss" (non-phonics)
  result = result.replace(
    /\b([a-z])\1{2,11}\b/gi,
    (match, letter: string) => {
      const lower = letter.toLowerCase();
      if (phonicsMode) return `/${lower}/`;
      const repeats = Math.max(3, Math.min(6, match.length));
      return lower.repeat(repeats);
    }
  );

  // 3. Convert spaced digraph repetitions: "sh sh sh" -> "/sh/"
  result = result.replace(
    /\b(sh|ch|th|ph|ng)(?:[\s,;:/\\|._-]+\1){1,6}\b/gi,
    (match, token: string) => {
      const lower = String(token || '').toLowerCase();
      if (phonicsMode) return `/${lower}/`;
      const repeats = match
        .replace(/[^\w\s-]/g, ' ')
        .split(/[\s-]+/)
        .filter(Boolean).length;
      const size = Math.max(2, Math.min(4, repeats));
      return lower.repeat(size);
    }
  );

  // 4. In phonics mode, convert sustained-sound words to slash markers:
  //    "sss" → "/s/", "buh" → "/b/", "mmm" → "/m/", etc.
  if (phonicsMode) {
    const sustainedPattern = new RegExp(
      `\\b(${Object.keys(SUSTAINED_SOUND_MAP).join('|')})\\b`,
      'gi'
    );
    result = result.replace(sustainedPattern, (match) => {
      const letter = SUSTAINED_SOUND_MAP[match.toLowerCase()];
      return letter ? `/${letter}/` : match;
    });
  }

  return result;
}

/**
 * Convert South African Rand amounts to spoken-word form.
 * "R 65.00" → "65 rands", "R1,234.56" → "1234 rands and 56 cents"
 */
function normalizeSouthAfricanCurrency(text: string): string {
  // Match R/ZAR followed by optional space + amount (handles R65, R 65.00, R1,234.56, ZAR 100)
  return text.replace(
    /\b(?:ZAR|R)\s?(\d{1,3}(?:[,\s]\d{3})*(?:\.\d{1,2})?)\b/gi,
    (_match, amount: string) => {
      const cleaned = amount.replace(/[,\s]/g, '');
      const num = parseFloat(cleaned);
      if (isNaN(num)) return _match;

      const whole = Math.floor(num);
      const centsRaw = Math.round((num - whole) * 100);

      if (whole === 0 && centsRaw === 0) return 'zero rands';
      if (whole === 0) return `${centsRaw} cent${centsRaw === 1 ? '' : 's'}`;
      if (centsRaw === 0) return `${whole} rand${whole === 1 ? '' : 's'}`;
      return `${whole} rand${whole === 1 ? '' : 's'} and ${centsRaw} cent${centsRaw === 1 ? '' : 's'}`;
    },
  );
}

function normalizeChoiceLabels(text: string): string {
  let next = String(text || '');

  // Preserve multiple-choice labels so TTS reads them as alphabet options
  // instead of blending into the answer value (e.g., "A)42" -> "Option A. 42").
  next = next.replace(
    /(^|[\n\r]\s*|[;:]\s*|,\s*|\s+)\(([a-hA-H])\)\s*(?=\S)/g,
    (_m, prefix: string, label: string) => `${prefix}Option ${label.toUpperCase()}. `
  );
  next = next.replace(
    /(^|[\n\r]\s*|[;:]\s*|,\s*|\s+)([a-hA-H])\)\s*(?=\S)/g,
    (_m, prefix: string, label: string) => `${prefix}Option ${label.toUpperCase()}. `
  );
  next = next.replace(
    /(^|[\n\r]\s*|[;:]\s*|,\s*|\s+)\[([A-H])\]\s*(?=\S)/g,
    (_m, prefix: string, label: string) => `${prefix}Option ${label.toUpperCase()}. `
  );
  next = next.replace(
    /\bOption ([A-H])\.(?=\S)/g,
    (_m, label: string) => `Option ${label}. `
  );

  return next;
}

function normalizeSouthAfricanLanguageNames(text: string): string {
  return text
    .replace(/\bi\s*s\s*i\s+zulu\b/gi, 'isiZulu')
    .replace(/\bi\s*s\s*i\s+xhosa\b/gi, 'isiXhosa')
    .replace(/\bi\s*s\s*i\s+ndebele\b/gi, 'isiNdebele')
    .replace(/\bisi\s+zulu\b/gi, 'isiZulu')
    .replace(/\bisi\s+xhosa\b/gi, 'isiXhosa')
    .replace(/\bisi\s+ndebele\b/gi, 'isiNdebele')
    .replace(/\bse\s+pedi\b/gi, 'Sepedi')
    .replace(/\bse\s+sotho\b/gi, 'Sesotho');
}

/**
 * Convert LaTeX math notation to plain text BEFORE normalizeMathExpressions runs.
 * Strips $...$ and $$...$$ delimiters, converts LaTeX commands to Unicode symbols
 * (which normalizeMathExpressions then converts to spoken words).
 */
function normalizeLatexMath(text: string): string {
  // Strip display math blocks $$...$$ first (greedy match)
  let result = text.replace(/\$\$([\s\S]*?)\$\$/g, '$1');
  // Strip inline math $...$  — but not lone $ for currency (handled earlier)
  result = result.replace(/\$([^$]+?)\$/g, '$1');

  // LaTeX fractions: \frac{a}{b} → "a over b"
  result = result.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1 over $2');
  // Square root: \sqrt{x} → "square root of x"
  result = result.replace(/\\sqrt\{([^}]*)\}/g, 'square root of $1');

  // Exponents: 5^{3} → "5 to the power of 3", 2^4 → "2 to the power of 4"
  // SA convention: "to the power of" (never "caret" or "hat")
  result = result.replace(/(\d+)\^{([^}]+)}/g, '$1 to the power of $2');
  result = result.replace(/(\d+)\^(\d+)/g, '$1 to the power of $2');
  // Unicode superscripts (from native renderer): 5² → "5 to the power of 2"
  result = result
    .replace(/(\d)⁰/g, '$1 to the power of 0')
    .replace(/(\d)¹/g, '$1 to the power of 1')
    .replace(/(\d)²/g, '$1 to the power of 2')
    .replace(/(\d)³/g, '$1 to the power of 3')
    .replace(/(\d)⁴/g, '$1 to the power of 4')
    .replace(/(\d)⁵/g, '$1 to the power of 5')
    .replace(/(\d)⁶/g, '$1 to the power of 6')
    .replace(/(\d)⁷/g, '$1 to the power of 7')
    .replace(/(\d)⁸/g, '$1 to the power of 8')
    .replace(/(\d)⁹/g, '$1 to the power of 9');

  // LaTeX commands → Unicode symbols (normalizeMathExpressions converts these to words)
  result = result
    .replace(/\\div\b/g, '÷')
    .replace(/\\times\b/g, '×')
    .replace(/\\cdot\b/g, '×')
    .replace(/\\pm\b/g, '±')
    .replace(/\\neq\b/g, '≠')
    .replace(/\\leq\b/g, '≤')
    .replace(/\\geq\b/g, '≥')
    .replace(/\\approx\b/g, '≈')
    .replace(/\\infty\b/g, 'infinity')
    .replace(/\\pi\b/g, 'pi')
    .replace(/\\sum\b/g, 'sum of')
    .replace(/\\text\{([^}]*)\}/g, '$1')
    // Clean up remaining backslash commands (e.g. \left, \right, \;, \,, \quad)
    .replace(/\\(?:left|right|quad|qquad)\b/g, ' ')
    .replace(/\\[,;!]/g, ' ')
    // Strip curly braces leftover from LaTeX grouping
    .replace(/[{}]/g, '');

  return result;
}

/**
 * Convert 24-hour and 12-hour time formats to natural spoken words.
 * Must run BEFORE normalizeMathExpressions so the colon in "18:00" is never
 * mistaken for a decimal point, and trailing zeros are never silently dropped.
 *
 * Examples (SA 24-hour clock context):
 *   "18:00" → "eighteen hundred"
 *   "18:30" → "eighteen thirty"
 *   "09:15" → "nine fifteen"
 *   "09:00" → "nine o'clock"
 *   "12:00" → "twelve o'clock"
 */
function normalizeTimeFormats(text: string): string {
  return text.replace(
    /\b(\d{1,2}):(\d{2})\b/g,
    (_match, hourStr: string, minuteStr: string) => {
      const hour = parseInt(hourStr, 10);
      const minute = parseInt(minuteStr, 10);

      // Spoken hour — drop leading zero for natural speech
      const hourWords: Record<number, string> = {
        0: 'midnight', 1: 'one', 2: 'two', 3: 'three', 4: 'four',
        5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine',
        10: 'ten', 11: 'eleven', 12: 'twelve', 13: 'thirteen',
        14: 'fourteen', 15: 'fifteen', 16: 'sixteen', 17: 'seventeen',
        18: 'eighteen', 19: 'nineteen', 20: 'twenty', 21: 'twenty one',
        22: 'twenty two', 23: 'twenty three',
      };
      const spokenHour = hourWords[hour] ?? String(hour);

      if (minute === 0) {
        // 18:00 → "eighteen hundred" (24hr), 9:00 → "nine o'clock" (12hr)
        return hour >= 13 || hour === 0 ? `${spokenHour} hundred` : `${spokenHour} o'clock`;
      }

      // Spoken minute — leading zero becomes "oh" (e.g. 09:05 → "nine oh five")
      const minuteWords: Record<number, string> = {
        1: 'oh one', 2: 'oh two', 3: 'oh three', 4: 'oh four', 5: 'oh five',
        6: 'oh six', 7: 'oh seven', 8: 'oh eight', 9: 'oh nine',
        10: 'ten', 11: 'eleven', 12: 'twelve', 13: 'thirteen', 14: 'fourteen',
        15: 'fifteen', 16: 'sixteen', 17: 'seventeen', 18: 'eighteen',
        19: 'nineteen', 20: 'twenty', 21: 'twenty one', 22: 'twenty two',
        23: 'twenty three', 24: 'twenty four', 25: 'twenty five',
        26: 'twenty six', 27: 'twenty seven', 28: 'twenty eight',
        29: 'twenty nine', 30: 'thirty', 31: 'thirty one', 32: 'thirty two',
        33: 'thirty three', 34: 'thirty four', 35: 'thirty five',
        36: 'thirty six', 37: 'thirty seven', 38: 'thirty eight',
        39: 'thirty nine', 40: 'forty', 41: 'forty one', 42: 'forty two',
        43: 'forty three', 44: 'forty four', 45: 'forty five',
        46: 'forty six', 47: 'forty seven', 48: 'forty eight',
        49: 'forty nine', 50: 'fifty', 51: 'fifty one', 52: 'fifty two',
        53: 'fifty three', 54: 'fifty four', 55: 'fifty five',
        56: 'fifty six', 57: 'fifty seven', 58: 'fifty eight', 59: 'fifty nine',
      };
      const spokenMinute = minuteWords[minute] ?? String(minute);
      return `${spokenHour} ${spokenMinute}`;
    }
  );
}

/**
 * Convert inline math symbols to spoken words so TTS engines don't guess.
 * Azure TTS reads "9-1" as "9 to 1" (a range) and may drop decimal points.
 * Must run AFTER currency normalization so "R 1.50" is already handled.
 */
function normalizeMathExpressions(text: string, phonicsMode: boolean): string {
  if (phonicsMode) return text;

  return text
    // "=" between digits → "equals"  (e.g. "9-1=8" → step 2 below converts to "9 minus 1 equals 8")
    .replace(/(\d)\s*=\s*(\d)/g, '$1 equals $2')
    // Leading equals: "=0.7" → "equals 0.7"
    .replace(/=\s*(\d)/g, 'equals $1')
    // Subtraction "-" tightly bound between digits → "minus"
    // Covers "9-1" but NOT "2024 - 2025" (year ranges with spaces stay as-is for TTS)
    .replace(/(\d)-(\d)/g, '$1 minus $2')
    // Decimal numbers: "0.5" → "0 point 5", "1.3534" → "1 point 3534"
    // Must convert ALL decimals so TTS doesn't confuse the period with a sentence end
    // (e.g. "0.5\n2." would otherwise read as "zero dot five period two")
    .replace(/\b(\d+)\.(\d+)\b/g, '$1 point $2')
    // Multiplication: × and * between digits
    .replace(/(\d)\s*[×*]\s*(\d)/g, '$1 times $2')
    // Division: ÷ between digits
    .replace(/(\d)\s*÷\s*(\d)/g, '$1 divided by $2')
    // Additional math symbols (from LaTeX normalization or direct use)
    .replace(/±/g, 'plus or minus')
    .replace(/≠/g, 'not equal to')
    .replace(/≤/g, 'less than or equal to')
    .replace(/≥/g, 'greater than or equal to')
    .replace(/≈/g, 'approximately');
}

function normalizeAcronymsForNaturalSpeech(text: string, phonicsMode: boolean): string {
  if (phonicsMode) return text;

  return text
    // Normalize dotted/spaced letter spell-outs into stable acronyms for natural TTS pacing.
    .replace(/\bP(?:\s*\.?\s*)D(?:\s*\.?\s*)F\b\.?/gi, 'PDF')
    .replace(/\bA(?:\s*\.?\s*)I\b\.?/gi, 'AI')
    .replace(/\bA(?:\s*\.?\s*)P(?:\s*\.?\s*)I\b\.?/gi, 'API')
    .replace(/\bS(?:\s*\.?\s*)T(?:\s*\.?\s*)T\b\.?/gi, 'speech to text')
    .replace(/\bT(?:\s*\.?\s*)T(?:\s*\.?\s*)S\b\.?/gi, 'text to speech')
    .replace(/\bU(?:\s*\.?\s*)R(?:\s*\.?\s*)L\b\.?/gi, 'link');
}

/** Replace long generated filenames (e.g. please-generate-an-alphabet-tracing-worksheet_2024...) with friendly speech. */
function replaceLongFilenamesWithFriendlySpeech(text: string): string {
  return text.replace(
    /[a-z0-9]+(?:-[a-z0-9]+)*_[a-z0-9]{8,}(?:\.[a-z]+)?/gi,
    (match) => {
      if (match.length > 30) {
        return /worksheet|tracing|alphabet|activity/i.test(match) ? 'Your worksheet' : 'Your PDF';
      }
      return match;
    }
  );
}

function stripMarkdownAndMeta(text: string, preservePhonicsMarkers: boolean): string {
  let next = text;

  // Strip [WHITEBOARD]...[/WHITEBOARD] blocks FIRST — they are visual-only UI elements
  // and must never be spoken regardless of phonics mode.
  next = next.replace(/\[WHITEBOARD\][\s\S]*?\[\/WHITEBOARD\]/gi, '');
  // Also strip any orphan/unclosed WHITEBOARD tags the AI may emit
  next = next.replace(/\[\/?\s*WHITEBOARD\s*\]/gi, '');

  next = next
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    // Strikethrough: ~~text~~ → text
    .replace(/~~([^~]+)~~/g, '$1')
    // Bold+italic (***text***) — must precede bold/italic
    .replace(/\*{3}([\s\S]*?)\*{3}/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // Answer blanks (_____ or more) → "blank"
    .replace(/_{3,}/g, 'blank')
    // Headers — \s* (not \s+) so ##Heading without space is also stripped
    .replace(/^#{1,6}\s*/gm, '')
    // Horizontal rules (---, ***, ___)
    .replace(/^[-*_]{3,}$/gm, '')
    .replace(/^\s*[-*+\u2022\u25e6\u25aa\u00b7]\s*/gm, '')
    // Convert "1. text" → [pause] "Item 1. text" — the period after the number
    // gives Azure TTS a natural breath-pause between list items.
    .replace(/^\s*(\d+)[.)]\s*/gm, '\n\nItem $1. ')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/^>\s*/gm, '')
    // Strip simple HTML tags (e.g. <b>, </div>, <br/>) but keep inner text
    .replace(/<[^>]+>/g, '')
    // Catch-all: strip remaining consecutive asterisks (unclosed/malformed bold markers)
    .replace(/\*{2,}/g, '');

  if (!preservePhonicsMarkers) {
    next = next.replace(/\[.*?\]/g, '');
  }

  return next
    .replace(/_Tools used:.*?_/gi, '')
    .replace(/_.*?tokens used_/gi, '')
    .replace(/^\s*(?:[^\w\s]\s*)*tools?\s*used\s*:.*$/gim, '')
    .replace(/^\s*(?:[^\w\s]\s*)*\d[\d,\s]*(?:\.\d+)?\s*tokens?\s*used\b.*$/gim, '')
    .replace(/^\s*(?:[^\w\s]\s*)*tokens?\s*used\b.*$/gim, '');
}

function stripEmojiAndSymbols(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
    .replace(/[\u{1FA00}-\u{1FAFF}]/gu, '')
    .replace(/[\u{2300}-\u{23FF}]/gu, '')  // Misc Technical (⏩⏳⌛ etc.)
    .replace(/[\u{2600}-\u{26FF}]/gu, '')
    .replace(/[\u{2700}-\u{27BF}]/gu, '')
    .replace(/[\u{2B00}-\u{2BFF}]/gu, '')  // Misc Symbols and Arrows (⭐⬆⬇ etc.)
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
    .replace(/[\u{200D}]/gu, '')
    .replace(/[\u{20E3}]/gu, '');           // Combining enclosing keycap
}

export function normalizeForTTS(input: string, options: TTSNormalizeOptions = {}): string {
  const {
    expandContractions = true,
    phonicsMode = false,
    preservePhonicsMarkers = phonicsMode,
  } = options;

  const rawInput = String(input || '');
  const cacheKey = getCacheKey(rawInput, options);
  const cachedValue = getCachedNormalized(cacheKey);
  if (cachedValue !== null) {
    return cachedValue;
  }

  let text = rawInput
    .replace(/\r\n/g, '\n')
    .replace(/[“”«»"]/g, '')
    .replace(/[‘’]/g, "'");

  if (!text.trim()) return '';

  if (expandContractions) {
    for (const [pattern, replacement] of CONTRACTION_REPLACEMENTS) {
      text = text.replace(pattern, replacement);
    }
  }

  text = stripMarkdownAndMeta(text, preservePhonicsMarkers);
  text = replaceLongFilenamesWithFriendlySpeech(text);
  text = stripEmojiAndSymbols(text);
  text = normalizeChoiceLabels(text);
  text = normalizeEduDashBrandForms(text);
  text = normalizeSouthAfricanCurrency(text);
  text = normalizeTimeFormats(text);
  text = normalizeLatexMath(text);
  text = normalizeMathExpressions(text, phonicsMode);

  // Apply pronunciation dictionary (brand names, SA languages, acronyms)
  text = applyPronunciationPlainText(text);

  // Normalize any remaining SA language name spacing issues
  text = normalizeSouthAfricanLanguageNames(text);
  text = normalizeAcronymsForNaturalSpeech(text, phonicsMode);

  // Keep marker punctuation in phonics mode.
  text = preservePhonicsMarkers
    ? text.replace(/[(){}<>]/g, '')
    : text.replace(/[()[\]{}<>]/g, '');

  text = collapseRepeatedLetterSounds(text, phonicsMode);
  text = normalizePhonicsMarkers(text, phonicsMode, preservePhonicsMarkers);

  const normalized = text
    .replace(/\bIt socks\b/g, "It's socks")
    .replace(/\bit socks\b/g, "it's socks")
    .replace(/\bCorrect answer:\s*/gi, '')
    .replace(/\bNext question:\s*/gi, '')
    .replace(/\bHint:\s*/gi, 'Hint. ')
    .replace(/^\s*User:\s*/gmi, '')
    .replace(/^\s*Assistant:\s*/gmi, '')
    // Double (or more) newlines mark list-item boundaries — convert to a
    // clear sentence boundary for TTS list separation.
    .replace(/\n{2,}/g, '. ')
    // Single newlines are sentence/phrase breaks — a period is sufficient.
    .replace(/\n/g, '. ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\.\s*\.\s*\./g, ' ... ')  // collapse "..." runs
    .replace(/\.\s*\./g, '. ')
    .trim();
  setCachedNormalized(cacheKey, normalized);
  return normalized;
}

export function normalizeForTTSPhonics(input: string): string {
  return normalizeForTTS(input, {
    expandContractions: true,
    phonicsMode: true,
    preservePhonicsMarkers: true,
  });
}
