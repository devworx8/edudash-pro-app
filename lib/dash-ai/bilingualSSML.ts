/**
 * Bilingual SSML Generator for Dash TTS.
 *
 * Generates SSML with `<lang>` tags for cross-language switching,
 * `<phoneme>` tags for IPA accuracy, and `<prosody>` for natural pacing.
 * Designed for Azure Neural voices with South African English (en-ZA)
 * as the instruction language and target vocabulary in af-ZA or zu-ZA.
 *
 * Primary voice: en-US-AndrewMultilingualNeural (Dash's voice)
 *
 * @module bilingualSSML
 * @see phonemeLookup.ts — PHONEME_LOOKUP with mouth tips
 * @see pronunciationDictionary.ts — word-level SSML substitutions
 * @see tts-proxy/index.ts — Edge Function consuming this SSML
 */

import {
  type PhonemeLanguage,
  PHONEME_LOOKUP,
  getEncouragement,
  lookupPhoneme,
} from './phonemeLookup';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Dash's primary voice — multilingual male (matches voiceMapping.ts DASH_VOICE_ID) */
export const DASH_VOICE = 'en-US-AndrewMultilingualNeural';

/** Default instruction language */
const INSTRUCTION_LANG = 'en-ZA';

/** Output audio format for streaming pipeline */
export const AUDIO_OUTPUT_FORMAT = 'audio-16khz-128kbitrate-mono-mp3';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Wrap text in an SSML `<lang>` tag for Azure inline language switching.
 */
function langWrap(text: string, bcp47: string): string {
  return `<lang xml:lang="${bcp47}">${text}</lang>`;
}

/**
 * Build an SSML `<phoneme>` tag from an IPA string.
 */
function phonemeWrap(displayText: string, ipa: string): string {
  return `<phoneme alphabet="ipa" ph="${escapeXml(ipa)}">${escapeXml(displayText)}</phoneme>`;
}

// ---------------------------------------------------------------------------
// generateBilingualSSML
// ---------------------------------------------------------------------------

export interface BilingualSSMLOptions {
  /** The feedback/instruction text in English */
  feedbackText: string;
  /** The target vocabulary word the learner is practising */
  targetWord: string;
  /** BCP-47 language tag of the target word */
  targetLang: PhonemeLanguage;
  /** Optional phoneme key from PHONEME_LOOKUP to attach IPA */
  phonemeKey?: string;
  /** Optional speaking rate adjustment (-50..50) */
  rate?: number;
  /** Optional pitch adjustment (-50..50) */
  pitch?: number;
  /** Optional style for mstts:express-as (e.g. 'friendly', 'cheerful') */
  style?: string;
}

/**
 * Generate bilingual SSML that wraps instruction in `en-ZA` and
 * target vocabulary in the learner's language with `<lang>` + `<phoneme>`.
 *
 * Example output:
 * ```xml
 * <speak version="1.0" xmlns="..." xml:lang="en-ZA">
 *   <voice name="en-ZA-LukeNeural">
 *     <prosody rate="0%" pitch="0%">
 *       Great try! Now say
 *       <lang xml:lang="zu-ZA">
 *         <phoneme alphabet="ipa" ph="kǀ">tsk</phoneme>
 *       </lang>
 *       — press your tongue behind your top teeth and pull down sharply.
 *     </prosody>
 *   </voice>
 * </speak>
 * ```
 */
export function generateBilingualSSML(options: BilingualSSMLOptions): string {
  const {
    feedbackText,
    targetWord,
    targetLang,
    phonemeKey,
    rate = 0,
    pitch = 0,
    style,
  } = options;

  // Build the target word segment
  let targetSegment: string;
  if (phonemeKey) {
    const entry = lookupPhoneme(phonemeKey, targetLang);
    if (entry) {
      targetSegment = langWrap(phonemeWrap(targetWord, entry.ipa), targetLang);
    } else {
      targetSegment = langWrap(escapeXml(targetWord), targetLang);
    }
  } else {
    targetSegment = langWrap(escapeXml(targetWord), targetLang);
  }

  // Split feedback around {{word}} placeholder or append
  const escapedFeedback = escapeXml(feedbackText);
  const body = escapedFeedback.includes('{{word}}')
    ? escapedFeedback.replace(/\{\{word\}\}/g, targetSegment)
    : `${escapedFeedback} ${targetSegment}`;

  const prosody = `<prosody rate="${rate}%" pitch="${pitch}%">${body}</prosody>`;
  const inner = style
    ? `<mstts:express-as style="${escapeXml(style)}">${prosody}</mstts:express-as>`
    : prosody;

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" ` +
    `xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${INSTRUCTION_LANG}">` +
    `<voice name="${DASH_VOICE}">${inner}</voice>` +
    `</speak>`
  );
}

// ---------------------------------------------------------------------------
// generateDashSSML
// ---------------------------------------------------------------------------

export interface DashSSMLOptions {
  /** The full text Dash will speak */
  text: string;
  /** Optional target word to highlight with lang/phoneme wrapping */
  targetWord?: string;
  /** Language of the target word */
  lang?: PhonemeLanguage;
  /** Phoneme key to look up IPA for the target word */
  phonemeKey?: string;
  /** Speaking rate (-50..50) */
  rate?: number;
  /** Pitch (-50..50) */
  pitch?: number;
  /** Express-as style */
  style?: string;
}

/**
 * Generate SSML for Dash to speak arbitrary text with optional
 * inline-language switching for a target word.
 *
 * Simpler than `generateBilingualSSML` — use for general Dash speech
 * where you optionally want one word highlighted in another language.
 */
export function generateDashSSML(options: DashSSMLOptions): string {
  const {
    text,
    targetWord,
    lang,
    phonemeKey,
    rate = 0,
    pitch = 0,
    style,
  } = options;

  let body = escapeXml(text);

  // If a target word is provided, wrap it in lang/phoneme tags
  if (targetWord && lang) {
    const escapedTarget = escapeXml(targetWord);
    let replacement: string;

    if (phonemeKey) {
      const entry = lookupPhoneme(phonemeKey, lang);
      if (entry) {
        replacement = langWrap(phonemeWrap(targetWord, entry.ipa), lang);
      } else {
        replacement = langWrap(escapedTarget, lang);
      }
    } else {
      replacement = langWrap(escapedTarget, lang);
    }

    // Replace the target word in the body (case-insensitive, first occurrence)
    const targetRegex = new RegExp(`\\b${escapeXml(targetWord)}\\b`, 'i');
    body = body.replace(targetRegex, replacement);
  }

  const prosody = `<prosody rate="${rate}%" pitch="${pitch}%">${body}</prosody>`;
  const inner = style
    ? `<mstts:express-as style="${escapeXml(style)}">${prosody}</mstts:express-as>`
    : prosody;

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" ` +
    `xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${INSTRUCTION_LANG}">` +
    `<voice name="${DASH_VOICE}">${inner}</voice>` +
    `</speak>`
  );
}

// ---------------------------------------------------------------------------
// generatePronunciationFeedbackSSML
// ---------------------------------------------------------------------------

export interface PronunciationFeedbackOptions {
  /** The word the learner attempted */
  targetWord: string;
  /** Language of the target word */
  targetLang: PhonemeLanguage;
  /** Phoneme key for the problematic sound */
  phonemeKey?: string;
  /** Azure Pronunciation Assessment accuracy score (0-100) */
  accuracyScore: number;
  /** Speaking rate for the feedback */
  rate?: number;
}

/**
 * Generate pronunciation coaching SSML based on Azure assessment scores.
 *
 * - Score >= 80: SA encouragement + "Lekker!" style praise
 * - Score 60-79: Gentle correction with the correct phoneme
 * - Score < 60: Detailed mouth position tip from PHONEME_LOOKUP
 */
export function generatePronunciationFeedbackSSML(
  options: PronunciationFeedbackOptions
): string {
  const { targetWord, targetLang, phonemeKey, accuracyScore, rate = -5 } = options;

  const encouragement = getEncouragement(accuracyScore);
  let feedbackText: string;

  if (accuracyScore >= 80) {
    feedbackText = `${encouragement} You said {{word}} perfectly!`;
  } else if (accuracyScore >= 60) {
    feedbackText = `${encouragement} Try {{word}} one more time — nice and clear.`;
  } else {
    // Score < 60: include mouth position tip
    let mouthTip = 'Try to shape your mouth carefully.';
    if (phonemeKey) {
      const entry = lookupPhoneme(phonemeKey, targetLang);
      if (entry) {
        mouthTip = entry.mouthTip;
      }
    }
    feedbackText = `${encouragement} Let me help you with {{word}}. ${mouthTip} Try again!`;
  }

  return generateBilingualSSML({
    feedbackText,
    targetWord,
    targetLang,
    phonemeKey,
    rate,
    style: accuracyScore >= 80 ? 'cheerful' : 'friendly',
  });
}

// ---------------------------------------------------------------------------
// Utility: Build phoneme instruction for Claude system prompt
// ---------------------------------------------------------------------------

/**
 * Build a phoneme reference table string that can be injected into
 * Claude system prompts — tells the AI which phonemes exist and how
 * to wrap them in tags.
 */
export function buildPhonemePromptReference(lang: PhonemeLanguage): string {
  const phonemes = PHONEME_LOOKUP[lang];
  if (!phonemes) return '';

  const lines = Object.entries(phonemes).map(([key, entry]) => {
    return `- ${key}: /${entry.ipa}/ — "${entry.sound}" (e.g. ${entry.example})`;
  });

  return [
    `## Available Phonemes (${lang})`,
    '',
    'When teaching pronunciation, wrap sounds in SSML <phoneme> tags:',
    '`<phoneme alphabet="ipa" ph="IPA_SYMBOL">display text</phoneme>`',
    '',
    ...lines,
    '',
    'For cross-language words, wrap in <lang> tags:',
    `\`<lang xml:lang="${lang}">word</lang>\``,
  ].join('\n');
}
