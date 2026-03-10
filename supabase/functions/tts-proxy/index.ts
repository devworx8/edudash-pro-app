/**
 * TTS Proxy Edge Function
 *
 * - Generates speech audio via Azure Speech Services (Neural TTS)
 * - Returns a public audio URL stored in Supabase Storage
 * - Requires authenticated requests (Bearer token)
 * - Supports SSML `<lang>` inline switching for SA multilingual content
 * - Uses pronunciation dictionary for brand/language name accuracy
 * - Supports Azure Pronunciation Assessment with phoneme granularity
 * - Supports streaming audio via ReadableStream
 * - Default voice: en-ZA-LukeNeural (Dash)
 *
 * Actions:
 *   'synthesize' (default) — standard TTS
 *   'assessAndRespond' — pronunciation assessment + coaching feedback
 *   'stream' — streaming audio response (no storage)
 *
 * Request body (supports multiple client shapes):
 * {
 *   action?: 'synthesize' | 'assessAndRespond' | 'stream',
 *   text: string,
 *   language?: 'en'|'af'|'zu'|'xh'|'nso'|...,
 *   lang?: string,
 *   voice_id?: string,
 *   speaking_rate?: number, // -50..50
 *   rate?: number,
 *   pitch?: number,         // -50..50
 *   format?: 'mp3'|'wav',
 *   style?: string,
 *   phonics_mode?: boolean,
 *   // assessAndRespond fields:
 *   reference_text?: string,
 *   audio_data?: string,      // base64 encoded audio
 *   audio_content_type?: string, // optional mime type for stored attempt audio
 *   target_lang?: string,     // BCP-47 of the target word
 *   phoneme_key?: string,     // key into PHONEME_LOOKUP
 *   target_phoneme?: string,  // explicit phoneme label for mastery tracking
 * }
 */

import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
};

const DEFAULT_BUCKET = 'tts-audio';
const DEFAULT_PHONICS_ATTEMPTS_BUCKET = 'tts-audio';

const LANG_TO_BCP47: Record<string, string> = {
  en: 'en-ZA',
  af: 'af-ZA',
  zu: 'zu-ZA',
  xh: 'xh-ZA',
  nso: 'nso-ZA',
  st: 'st-ZA',
  fr: 'fr-FR',
  pt: 'pt-BR',
  es: 'es-ES',
  de: 'de-DE',
};

const DEFAULT_VOICES: Record<string, string> = {
  'en-ZA': 'en-US-AndrewMultilingualNeural',
  'af-ZA': 'en-US-AndrewMultilingualNeural',
  'zu-ZA': 'en-US-AndrewMultilingualNeural',
  'xh-ZA': 'en-US-AndrewMultilingualNeural',
  'nso-ZA': 'en-US-AndrewMultilingualNeural',
  'st-ZA': 'en-US-AndrewMultilingualNeural',
  'fr-FR': 'en-US-AndrewMultilingualNeural',
  'pt-BR': 'en-US-AndrewMultilingualNeural',
  'es-ES': 'en-US-AndrewMultilingualNeural',
  'de-DE': 'en-US-AndrewMultilingualNeural',
};

/** Dash's primary voice — multilingual, handles all SA languages natively */
const DASH_VOICE = 'en-US-AndrewMultilingualNeural';
const DASH_MULTILINGUAL_FEMALE = 'en-US-AvaMultilingualNeural';
const DASH_FALLBACK_VOICE = 'en-ZA-LukeNeural';
const GLOBAL_EN_FALLBACK_VOICE = 'en-GB-RyanNeural';

const EN_MALE_FALLBACK_VOICES = ['en-ZA-LukeNeural', 'en-GB-RyanNeural', 'en-US-GuyNeural'];
const EN_FEMALE_FALLBACK_VOICES = ['en-US-AvaMultilingualNeural', 'en-ZA-LeahNeural', 'en-US-JennyNeural'];

const FALLBACK_VOICES_BY_LANG: Record<string, string[]> = {
  'en-ZA': EN_MALE_FALLBACK_VOICES,
  'af-ZA': ['af-ZA-WillemNeural', 'af-ZA-AdriNeural', DASH_FALLBACK_VOICE],
  'zu-ZA': ['zu-ZA-ThembaNeural', 'zu-ZA-ThandoNeural', DASH_FALLBACK_VOICE],
  'xh-ZA': ['xh-ZA-LungeloNeural', 'xh-ZA-NomalungaNeural', DASH_FALLBACK_VOICE],
  'nso-ZA': ['nso-ZA-OupaNeural', 'nso-ZA-DidiNeural', DASH_FALLBACK_VOICE],
  'st-ZA': [DASH_FALLBACK_VOICE, GLOBAL_EN_FALLBACK_VOICE], // Sesotho — no native Azure voice
  'fr-FR': ['fr-FR-HenriNeural', 'fr-FR-DeniseNeural'],
  'pt-BR': ['pt-BR-AntonioNeural', 'pt-BR-FranciscaNeural'],
  'es-ES': ['es-ES-AlvaroNeural', 'es-ES-ElviraNeural'],
  'de-DE': ['de-DE-ConradNeural', 'de-DE-KatjaNeural'],
};

/**
 * Phonics pacing policy:
 * - Do NOT slow entire sentences in phonics mode (keep natural pace).
 * - Only slow/hold the phoneme segments (slash markers) for clarity.
 * - Sustained/continuant phonemes (s, f, m, n, l, r, v, z, h, sh, th) use a
 *   much slower rate than stop consonants so children can clearly hear the sound.
 */
// ── Phonics pacing — values MUST match lib/dash-ai/ttsConstants.ts (SSOT) ──
const DEFAULT_PHONICS_SPEAKING_RATE = 0;     // AZURE_RATE_PHONICS
const PHONICS_PHONEME_RATE = -18;            // AZURE_RATE_PHONEME (stop consonants)
const PHONICS_SUSTAINED_RATE = -42;          // much slower for continuant phonemes
const PHONICS_MARKER_BREAK_MS = 320;         // pause after each phoneme marker
const PHONICS_SUSTAINED_BREAK_MS = 380;      // longer pause after sustained phonemes
const PHONICS_BLEND_SEGMENT_BREAK_MS = 280;
const PHONICS_BLEND_FINAL_BREAK_MS = 360;
const PHONICS_FALLBACK_LETTER_BREAK_MS = 250;

/** Audio format for pronunciation assessment & streaming */
const STREAMING_OUTPUT_FORMAT = 'audio-16khz-128kbitrate-mono-mp3';

/** SA slang encouragement by score bracket */
const SA_ENCOURAGEMENT: Record<string, string[]> = {
  excellent: ['Lekker!', 'Sharp sharp!', 'Awethu!', 'Hundred percent!', 'Eish, you nailed it!'],
  good: ['Not bad, hey!', 'Getting there!', 'Almost lekker!', 'Sharp!', 'Nice one!'],
  needsWork: ['Ag, try again!', 'Almost there, champ!', 'One more time, you got this!', 'Keep going, nè?'],
};

function pickEncouragement(score: number): string {
  const bucket =
    score >= 80 ? SA_ENCOURAGEMENT.excellent :
    score >= 60 ? SA_ENCOURAGEMENT.good :
    SA_ENCOURAGEMENT.needsWork;
  return bucket[Math.floor(Math.random() * bucket.length)];
}

/** Phoneme mouth-position tips for low-accuracy coaching */
const MOUTH_TIPS: Record<string, Record<string, string>> = {
  'en-ZA': {
    short_a: 'Open your mouth wide, tongue flat and low.',
    long_s: 'Push tongue behind top teeth, keep lips apart, hiss like a snake.',
    rhotic_r: "Curl tongue tip up toward the roof of your mouth — don't touch!",
    th_voiceless: 'Stick tongue tip between teeth and blow air gently.',
    th_voiced: 'Tongue between teeth, but hum — feel the vibration.',
    sh: 'Lips pushed forward in a round shape, tongue flat behind teeth.',
    ch: 'Start with tongue pressed on roof, then release with a rush of air.',
  },
  'zu-ZA': {
    c_click: 'Press tongue tip on the back of your top front teeth. Pull it down sharply.',
    q_click: 'Press tongue firmly on the roof of your mouth, about halfway back. Pull it down sharply.',
    x_click: 'Press tongue on one side against your cheek teeth. Pull it away sideways.',
    gc_click: 'Same as "c" click but hum while you click.',
    gq_click: 'Same as "q" click but hum — your voice box should vibrate.',
    gx_click: 'Same as "x" click but add your voice.',
  },
  'af-ZA': {
    g_velar: 'Lift the back of your tongue toward your soft palate and blow air.',
    u_rounded: 'Round your lips like "oh" but say "eh".',
    r_trill: 'Tongue tip vibrates against the ridge behind your top teeth.',
  },
};

// ---- Shared IPA letter map (canonical source: lib/dash-ai/phonics.ts) ----
const LETTER_IPA: Record<string, { ipa: string; sound: string }> = {
  a: { ipa: 'æ', sound: 'ah' },
  b: { ipa: 'b', sound: 'buh' },
  c: { ipa: 'k', sound: 'kuh' },
  d: { ipa: 'd', sound: 'duh' },
  e: { ipa: 'ɛ', sound: 'eh' },
  f: { ipa: 'f', sound: 'fff' },
  g: { ipa: 'g', sound: 'guh' },
  h: { ipa: 'h', sound: 'hhh' },
  i: { ipa: 'ɪ', sound: 'ih' },
  j: { ipa: 'dʒ', sound: 'juh' },
  k: { ipa: 'k', sound: 'kuh' },
  l: { ipa: 'l', sound: 'lll' },
  m: { ipa: 'm', sound: 'mmm' },
  n: { ipa: 'n', sound: 'nnn' },
  o: { ipa: 'ɒ', sound: 'aw' },
  p: { ipa: 'p', sound: 'puh' },
  q: { ipa: 'k', sound: 'kuh' },
  r: { ipa: 'ɹ', sound: 'rrr' },
  s: { ipa: 's', sound: 'sss' },
  t: { ipa: 't', sound: 'tuh' },
  u: { ipa: 'ʌ', sound: 'uh' },
  v: { ipa: 'v', sound: 'vvv' },
  w: { ipa: 'w', sound: 'wuh' },
  x: { ipa: 'ks', sound: 'ks' },
  y: { ipa: 'j', sound: 'yuh' },
  z: { ipa: 'z', sound: 'zzz' },
};

// ---- Pronunciation Dictionary (mirrors lib/dash-ai/pronunciationDictionary.ts) ----
interface PronEntry {
  pattern: RegExp;
  alias?: string;
  ipa?: string;
  lang?: string;
}

const PRONUNCIATION_DICT: PronEntry[] = [
  // Brand names
  { pattern: /\bEduDash\s*Pro\b/gi, ipa: 'ˌɛdjuːˈdæʃ proʊ' },
  { pattern: /\bEduDash\b/gi, ipa: 'ˌɛdjuːˈdæʃ' },
  { pattern: /\bDash\s*AI\b/gi, alias: 'Dash A.I.' },
  // SA language names with <lang> switching
  { pattern: /\bisiZulu\b/gi, ipa: 'ˌiːsiˈzuːluː', lang: 'zu-ZA' },
  { pattern: /\bisiXhosa\b/gi, ipa: 'ˌiːsiˈǁʰoːsa', lang: 'xh-ZA' },
  { pattern: /\bisiNdebele\b/gi, ipa: 'ˌiːsindeˈbeːle' },
  { pattern: /\bSepedi\b/gi, ipa: 'seˈpeːdi', lang: 'nso-ZA' },
  { pattern: /\bSesotho\b/gi, ipa: 'seˈsuːtʰuː' },
  { pattern: /\bSetswana\b/gi, ipa: 'seˈtswɑːnɑ' },
  { pattern: /\bTshivenda\b/gi, ipa: 'tʃɪˈvɛndɑ' },
  { pattern: /\bXitsonga\b/gi, ipa: 'ʃɪˈtsɔŋɡɑ' },
  { pattern: /\bAfrikaans\b/gi, ipa: 'ɑːfrɪˈkɑːns', lang: 'af-ZA' },
  // SA greetings with lang switching
  { pattern: /\bSawubona\b/gi, ipa: 'sɑːwuˈboːnɑ', lang: 'zu-ZA' },
  { pattern: /\bMolo\b/gi, ipa: 'ˈmoːlo', lang: 'xh-ZA' },
  { pattern: /\bDumela\b/gi, ipa: 'duˈmeːlɑ' },
  { pattern: /\bUbuntu\b/gi, ipa: 'ʊˈbʊntʊ', lang: 'zu-ZA' },
  { pattern: /\bNkosi\b/gi, ipa: 'ˈŋkoːsi', lang: 'zu-ZA' },
  { pattern: /\bGogo\b/gi, ipa: 'ˈɡoːɡo', lang: 'zu-ZA' },
  { pattern: /\bMadiba\b/gi, ipa: 'mɑˈdiːbɑ' },
  { pattern: /\boranges\b/gi, alias: 'or-in-jiz', ipa: 'ˈɔːrɪndʒɪz' },
  { pattern: /\borange\b/gi, alias: 'or-inj', ipa: 'ˈɔːrɪndʒ' },
  // Educational terms
  { pattern: /\bCAPS\b/g, alias: 'caps' },
  { pattern: /\bSTEM\b/g, alias: 'stem' },
  { pattern: /\bECD\b/g, alias: 'E.C.D.' },
  // Tech abbreviations
  { pattern: /\bAPI\b/g, alias: 'A.P.I.' },
  { pattern: /\bAI\b/g, alias: 'A.I.' },
  { pattern: /\bSTT\b/g, alias: 'speech to text' },
  { pattern: /\bTTS\b/g, alias: 'text to speech' },
  // Afrikaans names
  { pattern: /\bAnna?tjie\b/gi, alias: 'Anakie', lang: 'af-ZA' },
];

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function escapeXml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function phonemeTag(letter: string): string {
  const key = String(letter || '').toLowerCase();
  const entry = LETTER_IPA[key];
  if (!entry) return escapeXml(letter);
  // Slightly stretch each phoneme so it is clear for early readers.
  return `<prosody rate="${PHONICS_PHONEME_RATE}%"><phoneme alphabet="ipa" ph="${escapeXml(entry.ipa)}">${escapeXml(entry.sound)}</phoneme></prosody>`;
}

const SUSTAIN_CONSONANTS = new Set([
  'm', 'n', 's', 'f', 'v', 'z', 'l', 'r', 'th', 'sh', 'ch',
]);

const DIGRAPH_IPA: Record<string, string> = {
  th: 'θ',
  sh: 'ʃ',
  ch: 'tʃ',
};

const SUSTAINED_PHONEME_TEXT: Record<string, string> = {
  s: 'ssssss',
  m: 'mmmmmm',
  f: 'ffffff',
  z: 'zzzzzz',
  n: 'nnnnnn',
  l: 'llllll',
  r: 'rrrrrr',
  v: 'vvvvvv',
  h: 'hhhhhh',
  sh: 'shhhhh',
  th: 'thhhhh',
  ng: 'nggggg',
};

function phonemeTagSustained(tokenRaw: string): string {
  const token = String(tokenRaw || '').toLowerCase().replace(/[^a-z]/g, '');
  if (!token) return '';

  let ipa = '';
  let sound = token;

  if (token.length === 1) {
    const entry = LETTER_IPA[token];
    if (!entry) return escapeXml(tokenRaw);
    ipa = `${entry.ipa}ː`;
    sound = SUSTAINED_PHONEME_TEXT[token] || entry.sound || token;
  } else {
    const digraphIpa = DIGRAPH_IPA[token];
    if (!digraphIpa) return phonemeTag(token);
    ipa = `${digraphIpa}ː`;
    sound = SUSTAINED_PHONEME_TEXT[token] || token;
  }

  // Use a much slower rate for sustained/continuant phonemes so children
  // can hear the full sound clearly (e.g. /s/ → "ssss", not a quick burst).
  return `<prosody rate="${PHONICS_SUSTAINED_RATE}%"><phoneme alphabet="ipa" ph="${escapeXml(ipa)}">${escapeXml(sound)}</phoneme></prosody>`;
}

/** Strip [WHITEBOARD]...[/WHITEBOARD] blocks and orphan tags before SSML conversion. */
function stripWhiteboardTags(text: string): string {
  return text
    .replace(/\[WHITEBOARD\][\s\S]*?\[\/WHITEBOARD\]/gi, ' ')
    .replace(/\[\/?\s*WHITEBOARD\s*\]/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function buildBlendSSML(blend: string): string {
  const letters = String(blend || '')
    .toLowerCase()
    .split('-')
    .map((v) => v.trim())
    .filter(Boolean);

  if (letters.length < 2 || letters.some((v) => v.length !== 1)) {
    return escapeXml(blend);
  }

  const segmented = letters
    .map((letter) => `${phonemeTag(letter)}<break time="${PHONICS_BLEND_SEGMENT_BREAK_MS}ms"/>`)
    .join(' ');

  return `${segmented}<break time="${PHONICS_BLEND_FINAL_BREAK_MS}ms"/>${escapeXml(letters.join(''))}`;
}

/** Bare sustained-sound text → letter key for phonemeTag fallback */
const SUSTAINED_SOUND_TO_LETTER: Record<string, string> = {
  sss: 's', mmm: 'm', fff: 'f', zzz: 'z', nnn: 'n', lll: 'l',
  rrr: 'r', vvv: 'v', hhh: 'h',
  buh: 'b', duh: 'd', tuh: 't', puh: 'p', guh: 'g', kuh: 'k',
  juh: 'j', wuh: 'w', yuh: 'y',
  ah: 'a', eh: 'e', ih: 'i', aw: 'o', uh: 'u',
};
const DIGRAPH_FALLBACK_TO_LETTER: Record<string, string> = {
  sh: 's',
  ch: 'c',
  th: 't',
  ph: 'f',
  ng: 'n',
  qu: 'q',
  ck: 'k',
  wh: 'w',
  zh: 'z',
};

const SUSTAINED_SOUND_PATTERN = new RegExp(
  `\\b(${Object.keys(SUSTAINED_SOUND_TO_LETTER).join('|')})\\b`,
  'gi'
);
const REPEATED_LETTER_PATTERN = /\b([a-z])\1{2,11}\b/gi;
const SPACED_REPEATED_LETTER_PATTERN = /\b([a-z])(?:[\s,;:/\\|._-]+\1){1,8}\b/gi;
const SPACED_REPEATED_DIGRAPH_PATTERN = /\b(sh|ch|th|ph|ng)(?:[\s,;:/\\|._-]+\1){1,6}\b/gi;

function normalizeChoiceLabelsForSpeech(input: string): string {
  let next = String(input || '');
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
  return next.replace(/\bOption ([A-H])\.(?=\S)/g, (_m, label: string) => `Option ${label}. `);
}

function normalizeAcronymsForSpeech(input: string): string {
  return String(input || '')
    .replace(/\bP(?:\s*\.?\s*)D(?:\s*\.?\s*)F\b\.?/gi, 'PDF')
    .replace(/\bA(?:\s*\.?\s*)I\b\.?/gi, 'AI')
    .replace(/\bS(?:\s*\.?\s*)T(?:\s*\.?\s*)T\b\.?/gi, 'speech to text')
    .replace(/\bT(?:\s*\.?\s*)T(?:\s*\.?\s*)S\b\.?/gi, 'text to speech');
}

function convertPhonicsMarkersToSSML(rawText: string): string {
  // Strip whiteboard blocks before converting — they are visual-only and must not be spoken.
  const cleaned = stripWhiteboardTags(rawText || '');
  let text = escapeXml(normalizeChoiceLabelsForSpeech(cleaned));

  const isSustained = (token: string) => SUSTAIN_CONSONANTS.has(token);

  const markerTokenToSSML = (tokenRaw: string): string => {
    const token = String(tokenRaw || '').toLowerCase().replace(/[^a-z]/g, '');
    if (!token) return '';
    if (token.length === 1) {
      return isSustained(token)
        ? phonemeTagSustained(token)
        : phonemeTag(token);
    }

    const sustainedLetter = SUSTAINED_SOUND_TO_LETTER[token];
    if (sustainedLetter) return phonemeTagSustained(sustainedLetter);

    const digraphLetter = DIGRAPH_FALLBACK_TO_LETTER[token];
    if (digraphLetter) {
      return isSustained(token)
        ? phonemeTagSustained(token)
        : phonemeTag(digraphLetter);
    }

    // Unknown marker token: spell each letter as a safe fallback.
    if (token.length <= 8) {
      return token
        .split('')
        .map((letter) => phonemeTag(letter))
        .join(`<break time="${PHONICS_FALLBACK_LETTER_BREAK_MS}ms"/>`);
    }

    return escapeXml(token);
  };

  const breakAfterMarker = (token: string) =>
    isSustained(token)
      ? `<break time="${PHONICS_SUSTAINED_BREAK_MS}ms"/>`
      : `<break time="${PHONICS_MARKER_BREAK_MS}ms"/>`;

  // /b/ markers -> <phoneme> tags + appropriate pause
  text = text.replace(
    /\/\s*([a-z]{1,8})\s*\//gi,
    (_, token: string) => markerTokenToSSML(token) + breakAfterMarker(token.toLowerCase().replace(/[^a-z]/g, ''))
  );
  // [b] markers → <phoneme> tags + appropriate pause
  text = text.replace(
    /\[\s*([a-z]{1,8})\s*\]/gi,
    (_, token: string) => markerTokenToSSML(token) + breakAfterMarker(token.toLowerCase().replace(/[^a-z]/g, ''))
  );
  // c-a-t markers → blending SSML
  text = text.replace(/\b([a-z](?:-[a-z]){1,7})\b/gi, (match) => buildBlendSSML(match));

  // Convert repeated digraph cues like "sh sh sh" into sustained phoneme tags.
  text = text.replace(SPACED_REPEATED_DIGRAPH_PATTERN, (_match, token: string) => {
    return `${phonemeTagSustained(token)}<break time="${PHONICS_SUSTAINED_BREAK_MS}ms"/>`;
  });

  // Convert repeated single-letter cues like "s s s s" into sustained phoneme tags.
  text = text.replace(SPACED_REPEATED_LETTER_PATTERN, (_match, letter: string) => {
    return `${phonemeTagSustained(letter)}<break time="${PHONICS_SUSTAINED_BREAK_MS}ms"/>`;
  });

  // Fallback: catch bare sustained-sound text that slipped past the prompt
  // e.g. "sss" → <phoneme ipa="s">sss</phoneme>, "buh" → <phoneme ipa="b">buh</phoneme>
  text = text.replace(SUSTAINED_SOUND_PATTERN, (match) => {
    const letter = SUSTAINED_SOUND_TO_LETTER[match.toLowerCase()];
    return letter ? phonemeTagSustained(letter) : match;
  });

  // Also catch continuous repeated letters that are not in the fixed map (e.g. "ssss", "mmmm").
  text = text.replace(REPEATED_LETTER_PATTERN, (_match, letter: string) => {
    return phonemeTagSustained(letter);
  });

  // Remove only orphaned phonics-style slashes (e.g. a stray /s that was not
  // closed). Legitimate slashes in non-phonics text (fractions, URLs) are kept.
  text = text.replace(/\/(?=[a-z]{1,3}(?:\s|$))/gi, ' ')
             .replace(/(?<=\s|^)([a-z]{1,3})\/(?=\s|[.,!?;:]|$)/gi, '$1 ');

  return text;
}

function clampNumber(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return 0;
  return Math.min(max, Math.max(min, value));
}

function normalizeLanguage(raw?: string): { short: string; bcp47: string } {
  const lower = (raw || 'en').toLowerCase();
  const short = lower.split('-')[0];
  const bcp47 = LANG_TO_BCP47[short] || 'en-ZA';
  return { short, bcp47 };
}

function stripBase64Prefix(value: string): string {
  const raw = String(value || '').trim();
  const comma = raw.indexOf(',');
  if (comma > -1 && raw.slice(0, comma).includes('base64')) {
    return raw.slice(comma + 1).trim();
  }
  return raw;
}

function normalizePhonemeLabel(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function resolveTargetPhonemeScore(
  phonemes: Array<{ phoneme: string; accuracyScore: number }>,
  targetPhoneme: string
): number | null {
  if (!Array.isArray(phonemes) || phonemes.length === 0) return null;
  const normalizedTarget = normalizePhonemeLabel(targetPhoneme);
  if (!normalizedTarget) return null;

  // Exact match first.
  const exact = phonemes.find((entry) => {
    return normalizePhonemeLabel(entry.phoneme) === normalizedTarget;
  });
  if (exact) return exact.accuracyScore;

  // Relaxed containment for digraphs / click labels.
  const fuzzy = phonemes.find((entry) => {
    const normalized = normalizePhonemeLabel(entry.phoneme);
    return normalized.includes(normalizedTarget) || normalizedTarget.includes(normalized);
  });
  return fuzzy ? fuzzy.accuracyScore : null;
}

function buildHistoricalHint(targetPhoneme: string, scores: number[]): string | null {
  if (!scores.length) return null;
  const avg = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const rounded = Math.round(avg);
  if (avg < 50) {
    return `Learner is still struggling with "${targetPhoneme}" (${rounded}% avg over last ${scores.length} attempts). Slow down and give one focused mouth-shape cue before retrying.`;
  }
  if (avg > 80) {
    return `Learner has mostly mastered "${targetPhoneme}" (${rounded}% avg). Move to a harder blend after one quick reinforcement.`;
  }
  return `Learner is improving on "${targetPhoneme}" (${rounded}% avg). Keep one correction + one immediate retry.`;
}

/**
 * Apply pronunciation dictionary to SSML text.
 * Inserts `<phoneme>` and `<lang>` tags for known words.
 * Must be called AFTER escapeXml (text should be XML-safe already).
 */
function applyPronunciationToSSML(text: string): string {
  let result = text;
  for (const entry of PRONUNCIATION_DICT) {
    if (!entry.alias && !entry.ipa) continue;
    result = result.replace(entry.pattern, (matched) => {
      if (entry.ipa) {
        const langOpen = entry.lang ? `<lang xml:lang="${entry.lang}">` : '';
        const langClose = entry.lang ? '</lang>' : '';
        return `${langOpen}<phoneme alphabet="ipa" ph="${entry.ipa}">${matched}</phoneme>${langClose}`;
      }
      if (entry.alias) {
        return `<sub alias="${escapeXml(entry.alias)}">${matched}</sub>`;
      }
      return matched;
    });
    entry.pattern.lastIndex = 0;
  }
  return result;
}

/**
 * Apply inline `<lang>` switching for SA words that have a lang tag
 * but no IPA/alias (words we just want pronounced in the right language model).
 */
function applyInlineLangSwitching(text: string): string {
  let result = text;
  for (const entry of PRONUNCIATION_DICT) {
    if (!entry.lang || entry.ipa || entry.alias) continue;
    result = result.replace(entry.pattern, (matched) => {
      return `<lang xml:lang="${entry.lang}">${matched}</lang>`;
    });
    entry.pattern.lastIndex = 0;
  }
  return result;
}

interface AzureTTSAttemptResult {
  ok: boolean;
  status: number;
  audio?: Uint8Array;
  details?: string;
  /** The candidate name that succeeded after fallback (only set when recovery happened) */
  recoveredWith?: string;
}

interface AzureTTSCandidate {
  name: string;
  ssml: string;
}

async function azureSynthesizeOnce(params: {
  speechRegion: string;
  speechKey: string;
  outputFormat: string;
  ssml: string;
}): Promise<AzureTTSAttemptResult> {
  const { speechRegion, speechKey, outputFormat, ssml } = params;
  const resp = await fetch(
    `https://${speechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': speechKey,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': outputFormat,
        'User-Agent': 'edudashpro-tts-proxy',
      },
      body: ssml,
    }
  );

  if (!resp.ok) {
    const details = await resp.text().catch(() => '');
    return { ok: false, status: resp.status, details };
  }

  const audio = new Uint8Array(await resp.arrayBuffer());
  return { ok: true, status: resp.status, audio };
}

function compactAzureDetails(details: string): string {
  return String(details || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 260);
}

function classifyAzureFailure(params: { upstreamStatus?: number; details?: string }) {
  const upstreamStatus = Number(params.upstreamStatus || 0) || undefined;
  const details = String(params.details || '').toLowerCase();

  if (upstreamStatus === 401 || upstreamStatus === 403) {
    return { status: upstreamStatus, errorCode: 'AZURE_AUTH_ERROR' };
  }

  const throttled =
    upstreamStatus === 429 ||
    details.includes('throttle') ||
    details.includes('too many requests') ||
    details.includes('toomanyrequests');
  if (throttled) {
    return { status: 429, errorCode: 'AZURE_TTS_THROTTLED' };
  }

  const transient =
    upstreamStatus === 408 ||
    upstreamStatus === 425 ||
    upstreamStatus === 502 ||
    upstreamStatus === 503 ||
    upstreamStatus === 504 ||
    (typeof upstreamStatus === 'number' && upstreamStatus >= 500);

  if (transient) {
    return { status: 503, errorCode: 'AZURE_TTS_UPSTREAM_UNAVAILABLE' };
  }

  return { status: 503, errorCode: 'AZURE_TTS_UPSTREAM_ERROR' };
}

function azureFailureResponse(params: {
  message: string;
  upstreamStatus?: number;
  details?: string;
}) {
  const details = compactAzureDetails(params.details || '');
  const { status, errorCode } = classifyAzureFailure({
    upstreamStatus: params.upstreamStatus,
    details,
  });

  return jsonResponse(status, {
    error: params.message,
    error_code: errorCode,
    upstream_status: params.upstreamStatus || null,
    details,
    provider: 'azure',
  });
}

function buildVoiceFallbackList(primaryVoice: string, bcp47: string): string[] {
  const primaryLower = String(primaryVoice || '').toLowerCase();
  const isPrimaryLikelyFemale =
    /(leah|jenny|adri|thando|nomalunga|didi|female)/.test(primaryLower);
  const languageFallbacks =
    bcp47 === 'en-ZA'
      ? (isPrimaryLikelyFemale ? EN_FEMALE_FALLBACK_VOICES : EN_MALE_FALLBACK_VOICES)
      : (FALLBACK_VOICES_BY_LANG[bcp47] || []);

  const voices = [
    primaryVoice,
    DEFAULT_VOICES[bcp47],
    ...languageFallbacks,
    DASH_VOICE,
    DASH_FALLBACK_VOICE,
    GLOBAL_EN_FALLBACK_VOICE,
  ];

  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const voice of voices) {
    const candidate = String(voice || '').trim();
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    ordered.push(candidate);
  }
  return ordered;
}

function buildSsmlDoc(params: { bcp47: string; voiceName: string; inner: string }): string {
  const { bcp47, voiceName, inner } = params;
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${bcp47}">` +
    `<voice name="${voiceName}">${inner}</voice>` +
    `</speak>`
  );
}

async function azureSynthesizeWithCandidates(params: {
  speechRegion: string;
  speechKey: string;
  outputFormat: string;
  candidates: AzureTTSCandidate[];
}): Promise<AzureTTSAttemptResult> {
  const failures: string[] = [];
  let lastStatus = 502;

  for (const candidate of params.candidates) {
    const ssml = String(candidate.ssml || '').trim();
    if (!ssml) continue;

    const result = await azureSynthesizeOnce({
      speechRegion: params.speechRegion,
      speechKey: params.speechKey,
      outputFormat: params.outputFormat,
      ssml,
    });

    if (result.ok) {
      if (failures.length > 0) {
        console.log('[tts-proxy] Azure TTS recovered after fallback attempts', {
          recoveredWith: candidate.name,
          failedAttempts: failures.length,
        });
      }
      return { ...result, recoveredWith: failures.length > 0 ? candidate.name : undefined };
    }

    lastStatus = result.status || lastStatus;
    const compactDetails = compactAzureDetails(result.details || '');
    failures.push(`${candidate.name}[${result.status}]: ${compactDetails}`);
    console.warn('[tts-proxy] Azure TTS attempt failed', {
      candidate: candidate.name,
      status: result.status,
      details: compactDetails,
    });

    // Credentials / auth failures won't recover via SSML or voice fallback.
    if (result.status === 401 || result.status === 403) {
      break;
    }
  }

  return {
    ok: false,
    status: lastStatus,
    details: failures.join(' || ') || 'azure_tts_failed_unknown',
  };
}

async function azureSynthesizeWithStyleFallback(params: {
  speechRegion: string;
  speechKey: string;
  outputFormat: string;
  bcp47: string;
  primaryVoice: string;
  ssmlWithStyle: string;
  ssmlWithoutStyle?: string | null;
  plainInnerNoStyle?: string | null;
}): Promise<AzureTTSAttemptResult> {
  const styleCandidate = String(params.ssmlWithStyle || '').trim();
  const noStyleCandidate = String(params.ssmlWithoutStyle || '').trim();
  const plainInnerNoStyle = String(params.plainInnerNoStyle || '').trim();
  const fallbackVoices = buildVoiceFallbackList(params.primaryVoice, params.bcp47);

  const candidates: AzureTTSCandidate[] = [];
  const pushCandidate = (name: string, ssml: string) => {
    if (!ssml) return;
    if (candidates.some((entry) => entry.ssml === ssml)) return;
    candidates.push({ name, ssml });
  };

  // First pass: use caller-supplied SSML exactly as-is.
  if (styleCandidate) {
    pushCandidate(`primary_style:${params.primaryVoice}`, styleCandidate);
  }
  if (noStyleCandidate) {
    pushCandidate(`primary_nostyle:${params.primaryVoice}`, noStyleCandidate);
  }
  if (plainInnerNoStyle) {
    pushCandidate(
      `primary_plain:${params.primaryVoice}`,
      buildSsmlDoc({
        bcp47: params.bcp47,
        voiceName: params.primaryVoice,
        inner: plainInnerNoStyle,
      })
    );
  }

  // Broaden retries: voice fallback + plain SSML when rich SSML is rejected.
  for (const voice of fallbackVoices) {
    if (voice === params.primaryVoice) continue;
    if (noStyleCandidate) {
      const voiceNoStyle = noStyleCandidate.replace(
        `<voice name="${params.primaryVoice}">`,
        `<voice name="${voice}">`
      );
      pushCandidate(`voice_nostyle:${voice}`, voiceNoStyle);
    }
    if (plainInnerNoStyle) {
      pushCandidate(
        `voice_plain:${voice}`,
        buildSsmlDoc({
          bcp47: params.bcp47,
          voiceName: voice,
          inner: plainInnerNoStyle,
        })
      );
    }
  }

  return azureSynthesizeWithCandidates({
    speechRegion: params.speechRegion,
    speechKey: params.speechKey,
    outputFormat: params.outputFormat,
    candidates,
  });
}

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Pronunciation Assessment via Azure Speech SDK REST API
// ---------------------------------------------------------------------------

interface PronunciationResult {
  accuracyScore: number;
  fluencyScore: number;
  completenessScore: number;
  pronunciationScore: number;
  /** Per-word scores */
  words: Array<{
    word: string;
    accuracyScore: number;
    errorType: string;
  }>;
  /** Per-phoneme scores (when granularity = Phoneme) */
  phonemes: Array<{
    phoneme: string;
    accuracyScore: number;
  }>;
}

async function assessPronunciation(
  speechKey: string,
  speechRegion: string,
  audioData: Uint8Array,
  referenceText: string,
  bcp47: string
): Promise<PronunciationResult> {
  const assessmentConfig = {
    ReferenceText: referenceText,
    GradingSystem: 'HundredMark',
    Granularity: 'Phoneme',
    Dimension: 'Comprehensive',
    EnableMiscue: true,
  };

  const configBase64 = btoa(JSON.stringify(assessmentConfig));

  const endpoint = `https://${speechRegion}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${bcp47}&format=detailed`;

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': speechKey,
      'Content-Type': 'audio/wav',
      'Pronunciation-Assessment': configBase64,
      Accept: 'application/json',
    },
    body: audioData,
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Azure Pronunciation Assessment failed: ${resp.status} — ${errText}`);
  }

  const result = await resp.json();
  const nBest = result?.NBest?.[0];
  const assessment = nBest?.PronunciationAssessment;

  if (!assessment) {
    return {
      accuracyScore: 0,
      fluencyScore: 0,
      completenessScore: 0,
      pronunciationScore: 0,
      words: [],
      phonemes: [],
    };
  }

  const words = (nBest?.Words || []).map((w: Record<string, unknown>) => ({
    word: String(w.Word || ''),
    accuracyScore: Number(
      (w.PronunciationAssessment as Record<string, unknown>)?.AccuracyScore ?? 0
    ),
    errorType: String(
      (w.PronunciationAssessment as Record<string, unknown>)?.ErrorType ?? 'None'
    ),
  }));

  const phonemes: Array<{ phoneme: string; accuracyScore: number }> = [];
  for (const w of nBest?.Words || []) {
    for (const p of (w as Record<string, unknown[]>).Phonemes || []) {
      const pObj = p as Record<string, unknown>;
      phonemes.push({
        phoneme: String(pObj.Phoneme || ''),
        accuracyScore: Number(
          (pObj.PronunciationAssessment as Record<string, unknown>)?.AccuracyScore ?? 0
        ),
      });
    }
  }

  return {
    accuracyScore: Number(assessment.AccuracyScore ?? 0),
    fluencyScore: Number(assessment.FluencyScore ?? 0),
    completenessScore: Number(assessment.CompletenessScore ?? 0),
    pronunciationScore: Number(assessment.PronScore ?? 0),
    words,
    phonemes,
  };
}

// ---------------------------------------------------------------------------
// Build coaching SSML from assessment
// ---------------------------------------------------------------------------

function buildCoachingSSML(
  referenceText: string,
  assessResult: PronunciationResult,
  targetLang: string,
  phonemeKey: string,
  rate: number,
  includeStyle = true,
  voiceName = DASH_VOICE
): string {
  const score = assessResult.accuracyScore;
  const encouragement = pickEncouragement(score);

  let feedbackBody: string;

  if (score >= 80) {
    feedbackBody = `${encouragement} You said ${escapeXml(referenceText)} perfectly!`;
  } else if (score >= 60) {
    feedbackBody = `${encouragement} Try saying ${escapeXml(referenceText)} one more time — nice and clear.`;
  } else {
    // Score < 60: include mouth position tip
    const langTips = MOUTH_TIPS[targetLang] || MOUTH_TIPS['en-ZA'] || {};
    const mouthTip = langTips[phonemeKey] || 'Try to shape your mouth carefully and say it slowly.';
    feedbackBody = `${encouragement} Let me help you with ${escapeXml(referenceText)}. ${escapeXml(mouthTip)} Try again!`;
  }

  // If target language is different from en-ZA, wrap the reference in <lang>
  let targetSegment = escapeXml(referenceText);
  if (targetLang && targetLang !== 'en-ZA') {
    targetSegment = `<lang xml:lang="${targetLang}">${escapeXml(referenceText)}</lang>`;
  }

  // Replace the reference text in feedback with the lang-wrapped version
  feedbackBody = feedbackBody.replace(escapeXml(referenceText), targetSegment);

  const style = score >= 80 ? 'cheerful' : 'friendly';
  const prosody = `<prosody rate="${rate}%" pitch="0%">${feedbackBody}</prosody>`;
  const inner = includeStyle
    ? `<mstts:express-as style="${style}">${prosody}</mstts:express-as>`
    : prosody;

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" ` +
    `xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-ZA">` +
    `<voice name="${voiceName}">${inner}</voice>` +
    `</speak>`
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method === 'GET') {
    return jsonResponse(200, { status: 'ok', service: 'tts-proxy' });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const speechKey = (Deno.env.get('AZURE_SPEECH_KEY') || '').trim();
    const speechRegion = (Deno.env.get('AZURE_SPEECH_REGION') || '').trim();
    const bucket = (Deno.env.get('TTS_BUCKET') || DEFAULT_BUCKET).trim();
    const phonicsAttemptsBucket = (Deno.env.get('PHONICS_ATTEMPTS_BUCKET') || DEFAULT_PHONICS_ATTEMPTS_BUCKET).trim();

    if (!supabaseUrl || !serviceKey) {
      return jsonResponse(500, { error: 'Supabase service role not configured' });
    }

    if (!speechKey || !speechRegion) {
      return jsonResponse(503, {
        error: 'Azure Speech not configured',
        error_code: 'AZURE_NOT_CONFIGURED',
        provider: 'azure',
        fallback: 'device',
      });
    }

    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer', '').trim();
    if (!token) {
      return jsonResponse(401, { error: 'Unauthorized' });
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return jsonResponse(401, { error: 'Invalid token' });
    }

    // Quota check — prevent free-tier abuse of TTS/STT credits
    const environment = Deno.env.get('ENVIRONMENT') || 'production';
    const devBypass = Deno.env.get('AI_QUOTA_BYPASS') === 'true' &&
                      (environment === 'development' || environment === 'local');

    if (!devBypass) {
      const quota = await supabase.rpc('check_ai_usage_limit', {
        p_user_id: userData.user.id,
        p_request_type: 'tts',
      });

      if (quota.error) {
        console.error('[tts-proxy] check_ai_usage_limit failed:', quota.error);
        return jsonResponse(503, {
          error: 'quota_check_failed',
          message: 'AI service is temporarily unavailable. Please try again in a few minutes.',
        });
      }

      const quotaData = quota.data as Record<string, unknown> | null;
      if (quotaData && typeof quotaData.allowed === 'boolean' && !quotaData.allowed) {
        return jsonResponse(429, {
          error: 'quota_exceeded',
          message: "You've reached your AI usage limit for this period. Upgrade for more.",
          details: quotaData,
        });
      }
    }

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) {
      return jsonResponse(400, { error: 'Invalid JSON body' });
    }

    const text = String(body.text || '').trim();
    const action = String(body.action || 'synthesize').trim();

    // -----------------------------------------------------------------------
    // Action: assessAndRespond — pronunciation assessment + coaching TTS
    // -----------------------------------------------------------------------
    if (action === 'assessAndRespond') {
      const referenceText = String(body.reference_text || body.text || '').trim();
      const audioDataBase64 = stripBase64Prefix(String(body.audio_data || ''));
      const targetLang = String(body.target_lang || 'en-ZA').trim();
      const phonemeKeyVal = String(body.phoneme_key || '').trim();
      const targetPhonemeVal = String(body.target_phoneme || phonemeKeyVal || '').trim() || 'unknown';
      const audioContentType = String(body.audio_content_type || 'audio/wav').trim() || 'audio/wav';

      if (!referenceText) {
        return jsonResponse(400, { error: 'Missing reference_text for pronunciation assessment' });
      }
      if (!audioDataBase64) {
        return jsonResponse(400, { error: 'Missing audio_data (base64 encoded audio)' });
      }

      // Decode base64 audio
      const audioBytes = Uint8Array.from(atob(audioDataBase64), (c) => c.charCodeAt(0));

      // Assess pronunciation
      const assessResult = await assessPronunciation(
        speechKey,
        speechRegion,
        audioBytes,
        referenceText,
        targetLang
      );

      // Build coaching SSML
      const coachingRate = -5; // Slightly slower for clarity
      const coachingSSML = buildCoachingSSML(
        referenceText,
        assessResult,
        targetLang,
        phonemeKeyVal,
        coachingRate,
        true
      );
      const coachingSSMLNoStyle = buildCoachingSSML(
        referenceText,
        assessResult,
        targetLang,
        phonemeKeyVal,
        coachingRate,
        false
      );
      const coachingPlainInner = `<prosody rate="${coachingRate}%" pitch="0%">${escapeXml(referenceText)}</prosody>`;

      // Synthesize coaching audio
      const coachTTS = await azureSynthesizeWithStyleFallback({
        speechRegion,
        speechKey,
        outputFormat: STREAMING_OUTPUT_FORMAT,
        bcp47: 'en-ZA',
        primaryVoice: DASH_VOICE,
        ssmlWithStyle: coachingSSML,
        ssmlWithoutStyle: coachingSSMLNoStyle,
        plainInnerNoStyle: coachingPlainInner,
      });

      if (!coachTTS.ok || !coachTTS.audio) {
        return azureFailureResponse({
          message: 'Azure TTS coaching synthesis failed',
          upstreamStatus: coachTTS.status,
          details: coachTTS.details || '',
        });
      }

      const coachAudio = coachTTS.audio;
      const coachHash = await sha256(`coach|${referenceText}|${assessResult.accuracyScore}`);
      const coachPath = `tts/${userData.user.id}/coach_${coachHash}.mp3`;

      await supabase.storage.from(bucket).upload(coachPath, coachAudio, {
        contentType: 'audio/mpeg',
        upsert: true,
        cacheControl: '300',
      });

      const coachUrl = supabase.storage.from(bucket).getPublicUrl(coachPath).data.publicUrl;

      // Persist learner audio for parent replay (signed URL access in response).
      const attemptHash = await sha256(
        `attempt|${userData.user.id}|${referenceText}|${targetLang}|${Date.now()}|${audioBytes.length}`
      );
      const attemptDate = new Date().toISOString().slice(0, 10);
      const recordingPath = `phonics-attempts/${userData.user.id}/${attemptDate}/${attemptHash}.wav`;
      let recordingPathStored: string | null = null;
      let recordingSignedUrl: string | null = null;

      try {
        const recordingUpload = await supabase.storage
          .from(phonicsAttemptsBucket)
          .upload(recordingPath, audioBytes, {
            contentType: audioContentType,
            upsert: false,
            cacheControl: '3600',
          });

        if (recordingUpload.error) {
          console.error('[TTS-Proxy] Failed to upload phonics attempt audio:', recordingUpload.error);
        } else {
          recordingPathStored = recordingPath;
          const signed = await supabase.storage
            .from(phonicsAttemptsBucket)
            .createSignedUrl(recordingPath, 60 * 60 * 24);
          if (!signed.error) {
            recordingSignedUrl = signed.data?.signedUrl || null;
          }
        }
      } catch (uploadErr) {
        console.error('[TTS-Proxy] Unexpected phonics audio upload error:', uploadErr);
      }

      const targetPhonemeScore = resolveTargetPhonemeScore(
        assessResult.phonemes,
        targetPhonemeVal
      );
      const storedAccuracyScore = targetPhonemeScore ?? assessResult.accuracyScore;

      let phonicsAttemptId: string | null = null;
      try {
        const { data: attemptRow, error: attemptError } = await supabase
          .from('phonics_attempts')
          .insert({
            user_id: userData.user.id,
            language_code: targetLang,
            target_word: referenceText,
            target_phoneme: targetPhonemeVal,
            accuracy_score: storedAccuracyScore,
            fluency_score: assessResult.fluencyScore,
            completeness_score: assessResult.completenessScore,
            pron_score: assessResult.pronunciationScore,
            phoneme_json: {
              words: assessResult.words,
              phonemes: assessResult.phonemes,
              target_phoneme: targetPhonemeVal,
              target_phoneme_score: targetPhonemeScore,
              overall_accuracy_score: assessResult.accuracyScore,
              provider: 'azure_pronunciation_assessment',
            },
            audio_url: recordingPathStored,
          })
          .select('id')
          .single();

        if (attemptError) {
          console.error('[TTS-Proxy] Failed to persist phonics attempt row:', attemptError);
        } else {
          phonicsAttemptId = attemptRow?.id || null;
        }
      } catch (insertErr) {
        console.error('[TTS-Proxy] Unexpected phonics attempt insert error:', insertErr);
      }

      let historicalHint: string | null = null;
      try {
        const { data: recentAttempts, error: recentError } = await supabase
          .from('phonics_attempts')
          .select('accuracy_score')
          .eq('user_id', userData.user.id)
          .eq('target_phoneme', targetPhonemeVal)
          .eq('language_code', targetLang)
          .order('created_at', { ascending: false })
          .limit(3);

        if (recentError) {
          console.error('[TTS-Proxy] Failed to load phonics attempt history:', recentError);
        } else {
          const scoreHistory = (recentAttempts || [])
            .map((row) => Number((row as Record<string, unknown>).accuracy_score))
            .filter((value) => Number.isFinite(value));
          historicalHint = buildHistoricalHint(targetPhonemeVal, scoreHistory);
        }
      } catch (historyErr) {
        console.error('[TTS-Proxy] Unexpected phonics history lookup error:', historyErr);
      }

      return jsonResponse(200, {
        provider: 'azure',
        action: 'assessAndRespond',
        attempt_id: phonicsAttemptId,
        assessment: {
          accuracy_score: storedAccuracyScore,
          target_phoneme_accuracy: targetPhonemeScore,
          target_phoneme: targetPhonemeVal,
          fluency_score: assessResult.fluencyScore,
          completeness_score: assessResult.completenessScore,
          pronunciation_score: assessResult.pronunciationScore,
          words: assessResult.words,
          phonemes: assessResult.phonemes,
          needs_help: assessResult.accuracyScore < 60,
        },
        coaching: {
          audio_url: coachUrl,
          encouragement: pickEncouragement(assessResult.accuracyScore),
          mouth_tip: assessResult.accuracyScore < 60
            ? (MOUTH_TIPS[targetLang]?.[phonemeKeyVal] || MOUTH_TIPS['en-ZA']?.[phonemeKeyVal] || null)
            : null,
          historical_hint: historicalHint,
        },
        replay: {
          audio_storage_path: recordingPathStored,
          signed_url: recordingSignedUrl,
          bucket: phonicsAttemptsBucket,
        },
        voice_id: DASH_VOICE,
      });
    }

    // -----------------------------------------------------------------------
    // Action: stream — streaming audio (no storage, returns audio directly)
    // -----------------------------------------------------------------------
    if (action === 'stream') {
      if (!text) {
        return jsonResponse(400, { error: 'Missing text' });
      }
      // Strip [WHITEBOARD] blocks before TTS
      const spokenText = normalizeAcronymsForSpeech(stripWhiteboardTags(text));

      const languageRaw = String(body.language || body.lang || 'en');
      const { bcp47: streamBcp47 } = normalizeLanguage(languageRaw);
      const streamVoice = String(body.voice_id || '').trim() || DASH_VOICE;
      const isPhonics = body.phonics_mode === true;
      const streamRate = clampNumber(
        Number(body.rate ?? body.speaking_rate ?? (isPhonics ? DEFAULT_PHONICS_SPEAKING_RATE : 0)),
        -50,
        50
      );
      const streamPitch = clampNumber(Number(body.pitch ?? 0), -50, 50);
      const streamStyle = typeof body.style === 'string' ? body.style.trim() : 'friendly';

      const streamSSMLText = isPhonics
        ? convertPhonicsMarkersToSSML(spokenText)
        : escapeXml(normalizeChoiceLabelsForSpeech(spokenText));
      const streamPronunciation = applyPronunciationToSSML(streamSSMLText);
      const streamLang = applyInlineLangSwitching(streamPronunciation);
      const streamProsody = `<prosody rate="${streamRate}%" pitch="${streamPitch}%">${streamLang}</prosody>`;
      const streamPlainProsody = `<prosody rate="${streamRate}%" pitch="${streamPitch}%">${escapeXml(normalizeChoiceLabelsForSpeech(spokenText))}</prosody>`;
      const streamInner = streamStyle
        ? `<mstts:express-as style="${escapeXml(streamStyle)}">${streamProsody}</mstts:express-as>`
        : streamProsody;
      const streamInnerNoStyle = streamProsody;

      const streamSSML =
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${streamBcp47}">` +
        `<voice name="${streamVoice}">${streamInner}</voice>` +
        `</speak>`;
      const streamSSMLNoStyle =
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${streamBcp47}">` +
        `<voice name="${streamVoice}">${streamInnerNoStyle}</voice>` +
        `</speak>`;

      const streamTTS = await azureSynthesizeWithStyleFallback({
        speechRegion,
        speechKey,
        outputFormat: STREAMING_OUTPUT_FORMAT,
        bcp47: streamBcp47,
        primaryVoice: streamVoice,
        ssmlWithStyle: streamSSML,
        ssmlWithoutStyle: streamStyle ? streamSSMLNoStyle : null,
        plainInnerNoStyle: streamPlainProsody,
      });

      if (!streamTTS.ok || !streamTTS.audio) {
        return azureFailureResponse({
          message: 'Azure TTS stream failed',
          upstreamStatus: streamTTS.status,
          details: streamTTS.details || '',
        });
      }

      // Record usage (non-fatal) — audit log + quota counter
      try {
        await supabase.rpc('record_ai_usage', {
          p_user_id: userData.user.id,
          p_feature_used: 'tts',
          p_model_used: `azure-${streamVoice}`,
          p_tokens_used: 0,
          p_request_tokens: 0,
          p_response_tokens: 0,
          p_success: true,
          p_metadata: { scope: 'tts_stream', voice_id: streamVoice },
        });
        await supabase.rpc('increment_ai_usage', {
          p_user_id: userData.user.id,
          p_request_type: 'tts',
          p_status: 'success',
          p_metadata: { scope: 'tts_stream' },
        });
      } catch (usageErr) {
        console.warn('[tts-proxy] usage recording failed (non-fatal):', usageErr);
      }

      // Return audio response directly.
      return new Response(streamTTS.audio, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'audio/mpeg',
          'X-Voice-Id': streamVoice,
        },
      });
    }

    // -----------------------------------------------------------------------
    // Action: synthesize (default) — standard TTS with storage caching
    // -----------------------------------------------------------------------
    if (!text) {
      return jsonResponse(400, { error: 'Missing text' });
    }
    // Strip [WHITEBOARD] blocks before TTS — they are visual-only UI elements
    const spokenText = normalizeAcronymsForSpeech(stripWhiteboardTags(text));

    const languageRaw = String(body.language || body.lang || 'en');
    const { short: language, bcp47 } = normalizeLanguage(languageRaw);
    const voiceId = String(body.voice_id || body.voiceId || body.voice || '').trim() || DEFAULT_VOICES[bcp47];

    // Debug logging for language/voice selection
    console.log('[TTS] Language detection:', {
      raw: languageRaw,
      normalized: language,
      bcp47,
      selectedVoice: voiceId,
      textPreview: spokenText.substring(0, 50),
    });

    const phonicsMode = body.phonics_mode === true;

    const hasExplicitRate = typeof body.speaking_rate === 'number' || typeof body.rate === 'number';
    const speakingRateRaw = Number(body.speaking_rate ?? body.rate ?? (phonicsMode ? DEFAULT_PHONICS_SPEAKING_RATE : 0));
    const pitchRaw = Number(body.pitch ?? 0);
    const speakingRate = clampNumber(speakingRateRaw, -50, 50);
    const pitch = clampNumber(pitchRaw, -50, 50);

    const format = String(body.format || 'mp3').toLowerCase() === 'wav' ? 'wav' : 'mp3';
    const outputFormat = format === 'wav'
      ? 'riff-24khz-16bit-mono-pcm'
      : 'audio-24khz-96kbitrate-mono-mp3';

    const styleOverride = typeof body.style === 'string' ? body.style.trim() : '';
    const style = styleOverride || (phonicsMode ? 'friendly' : '');

    const ssmlText = phonicsMode
      ? convertPhonicsMarkersToSSML(spokenText)
      : escapeXml(normalizeChoiceLabelsForSpeech(spokenText));
    // Apply pronunciation dictionary (brand names, SA languages, <lang> switching)
    const ssmlWithPronunciation = applyPronunciationToSSML(ssmlText);
    const ssmlWithLang = applyInlineLangSwitching(ssmlWithPronunciation);
    const prosody = `<prosody rate="${speakingRate}%" pitch="${pitch}%">${ssmlWithLang}</prosody>`;
    const plainProsody = `<prosody rate="${speakingRate}%" pitch="${pitch}%">${escapeXml(normalizeChoiceLabelsForSpeech(spokenText))}</prosody>`;
    const inner = style
      ? `<mstts:express-as style="${escapeXml(style)}">${prosody}</mstts:express-as>`
      : prosody;
    const innerNoStyle = prosody;

    const ssml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${bcp47}">` +
      `<voice name="${voiceId}">${inner}</voice>` +
      `</speak>`;
    const ssmlNoStyle = `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${bcp47}">` +
      `<voice name="${voiceId}">${innerNoStyle}</voice>` +
      `</speak>`;

    const azureResp = await azureSynthesizeWithStyleFallback({
      speechRegion,
      speechKey,
      outputFormat,
      bcp47,
      primaryVoice: voiceId,
      ssmlWithStyle: ssml,
      ssmlWithoutStyle: style ? ssmlNoStyle : null,
      plainInnerNoStyle: plainProsody,
    });

    if (!azureResp.ok) {
      return azureFailureResponse({
        message: 'Azure TTS request failed',
        upstreamStatus: azureResp.status,
        details: azureResp.details || '',
      });
    }

    // Detect if voice/language fallback occurred
    const recoveredVoice = azureResp.recoveredWith || undefined;
    // Extract voice name from candidate label like "voice_plain:en-GB-RyanNeural"
    const actualVoiceName = recoveredVoice
      ? (recoveredVoice.split(':').pop() || voiceId)
      : voiceId;
    // Detect language fallback: primary voice locale prefix differs from actual voice locale prefix
    const requestedLangPrefix = voiceId.split('-').slice(0, 2).join('-');
    const actualLangPrefix = actualVoiceName.split('-').slice(0, 2).join('-');
    const languageFallback = recoveredVoice ? (requestedLangPrefix !== actualLangPrefix) : false;

    const contentHash = await sha256(
      `${spokenText}|${language}|${voiceId}|${hasExplicitRate ? speakingRate : speakingRateRaw}|${pitch}|${outputFormat}|${phonicsMode ? 'phonics' : 'normal'}`
    );
    const extension = format;
    const objectPath = `tts/${userData.user.id}/${contentHash}.${extension}`;

    // Check if cached audio already exists
    const { data: existingFile } = await supabase.storage
      .from(bucket)
      .list(`tts/${userData.user.id}`, {
        search: `${contentHash}.${extension}`,
      });

    if (existingFile && existingFile.length > 0) {
      const publicUrl = supabase.storage.from(bucket).getPublicUrl(objectPath).data.publicUrl;
      return jsonResponse(200, {
        provider: 'azure',
        audio_url: publicUrl,
        cache_hit: true,
        content_hash: contentHash,
        language,
        voice_id: voiceId,
      });
    }

    // Download audio buffer from Azure
    const audioBuffer = azureResp.audio || new Uint8Array();
    
    if (!audioBuffer || audioBuffer.length === 0) {
      return jsonResponse(503, {
        error: 'Azure returned empty audio buffer',
        error_code: 'AZURE_EMPTY_AUDIO',
        upstream_status: azureResp.status || null,
        provider: 'azure',
      });
    }

    // Upload to Supabase Storage
    const upload = await supabase.storage
      .from(bucket)
      .upload(objectPath, audioBuffer, {
        contentType: format === 'wav' ? 'audio/wav' : 'audio/mpeg',
        upsert: true,
        cacheControl: '3600',
      });

    if (upload.error) {
      console.error('[TTS-Proxy] Storage upload failed:', upload.error);
      return jsonResponse(500, {
        error: 'Failed to store audio',
        details: upload.error.message,
        fallback: 'device',
      });
    }

    const publicUrl = supabase.storage.from(bucket).getPublicUrl(objectPath).data.publicUrl;

    // Record usage (non-fatal) — audit log + quota counter
    try {
      await supabase.rpc('record_ai_usage', {
        p_user_id: userData.user.id,
        p_feature_used: 'tts',
        p_model_used: `azure-${voiceId}`,
        p_tokens_used: 0,
        p_request_tokens: 0,
        p_response_tokens: 0,
        p_success: true,
        p_metadata: { scope: 'tts_synthesize', voice_id: voiceId, language, text_length: spokenText.length, cache_hit: false },
      });
      await supabase.rpc('increment_ai_usage', {
        p_user_id: userData.user.id,
        p_request_type: 'tts',
        p_status: 'success',
        p_metadata: { scope: 'tts_synthesize' },
      });
    } catch (usageErr) {
      console.warn('[tts-proxy] usage recording failed (non-fatal):', usageErr);
    }

    return jsonResponse(200, {
      provider: 'azure',
      audio_url: publicUrl,
      cache_hit: false,
      content_hash: contentHash,
      language,
      voice_id: voiceId,
      size_bytes: audioBuffer.length,
      language_fallback: languageFallback,
      actual_voice: actualVoiceName,
    });
  } catch (error) {
    return jsonResponse(500, {
      error: 'Unexpected error',
      error_code: 'TTS_PROXY_INTERNAL_ERROR',
      provider: 'tts-proxy',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});
