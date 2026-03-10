/**
 * SINGLE SOURCE OF TRUTH for Dash TTS voice IDs.
 * All TTS consumers (useVoiceTTS, DashVoiceController, DashVoiceService, web useTTS, tts-proxy)
 * MUST use this module. Aligns with supabase/functions/tts-proxy defaults.
 *
 * @module lib/voice/voiceMapping
 */

/** Dash's primary voice — multilingual, handles all SA languages natively.
 *  Must match DASH_VOICE in tts-proxy. */
export const DASH_VOICE_ID = 'en-US-AndrewMultilingualNeural';

/** Short language codes accepted by tts-proxy and client TTS */
export type TTSShortLang = 'en' | 'af' | 'zu' | 'xh' | 'nso' | 'st' | 'fr' | 'pt' | 'es' | 'de';

export type VoiceGender = 'male' | 'female';

/** Multilingual voices — handle code-switching across SA languages in one utterance */
export const MULTILINGUAL_VOICES = {
  male: 'en-US-AndrewMultilingualNeural',
  female: 'en-US-AvaMultilingualNeural',
} as const;

/** HD (DragonHDLatest) voices — more expressive prosody for EN-ZA */
export const HD_VOICES = {
  'en-ZA-male': 'en-ZA-LukeNeural',
  'en-ZA-female': 'en-ZA-LeahNeural',
  'en-GB-male': 'en-GB-RyanNeural',
  'en-GB-female': 'en-GB-SoniaNeural',
  'en-US-male': 'en-US-GuyNeural',
  'en-US-female': 'en-US-AriaNeural',
} as const;

/** Voice IDs by short code and gender. Male defaults use multilingual for Dash. */
const VOICES_BY_LANG: Record<TTSShortLang, { male: string; female: string }> = {
  en: { male: 'en-US-AndrewMultilingualNeural', female: 'en-US-AvaMultilingualNeural' },
  af: { male: 'en-US-AndrewMultilingualNeural', female: 'en-US-AvaMultilingualNeural' },
  zu: { male: 'en-US-AndrewMultilingualNeural', female: 'en-US-AvaMultilingualNeural' },
  xh: { male: 'en-US-AndrewMultilingualNeural', female: 'en-US-AvaMultilingualNeural' },
  nso: { male: 'en-US-AndrewMultilingualNeural', female: 'en-US-AvaMultilingualNeural' },
  st: { male: 'en-US-AndrewMultilingualNeural', female: 'en-US-AvaMultilingualNeural' },
  fr: { male: 'en-US-AndrewMultilingualNeural', female: 'en-US-AvaMultilingualNeural' },
  pt: { male: 'en-US-AndrewMultilingualNeural', female: 'en-US-AvaMultilingualNeural' },
  es: { male: 'en-US-AndrewMultilingualNeural', female: 'en-US-AvaMultilingualNeural' },
  de: { male: 'en-US-AndrewMultilingualNeural', female: 'en-US-AvaMultilingualNeural' },
};

/** Legacy per-language voices (used when multilingual voices are unavailable) */
export const LEGACY_VOICES_BY_LANG: Record<TTSShortLang, { male: string; female: string }> = {
  en: { male: 'en-ZA-LukeNeural', female: 'en-ZA-LeahNeural' },
  af: { male: 'af-ZA-WillemNeural', female: 'af-ZA-AdriNeural' },
  zu: { male: 'zu-ZA-ThembaNeural', female: 'zu-ZA-ThandoNeural' },
  xh: { male: 'xh-ZA-LungeloNeural', female: 'xh-ZA-NomalungaNeural' },
  nso: { male: 'nso-ZA-OupaNeural', female: 'nso-ZA-DidiNeural' },
  st: { male: 'en-ZA-LukeNeural', female: 'en-ZA-LeahNeural' },
  fr: { male: 'fr-FR-HenriNeural', female: 'fr-FR-DeniseNeural' },
  pt: { male: 'pt-BR-AntonioNeural', female: 'pt-BR-FranciscaNeural' },
  es: { male: 'es-ES-AlvaroNeural', female: 'es-ES-ElviraNeural' },
  de: { male: 'de-DE-ConradNeural', female: 'de-DE-KatjaNeural' },
};

/** Map BCP-47 or short code to short code for lookup */
function toShortCode(lang: string): TTSShortLang {
  const raw = (lang || 'en').toLowerCase();
  if (raw.startsWith('en')) return 'en';
  if (raw.startsWith('af')) return 'af';
  if (raw.startsWith('zu')) return 'zu';
  if (raw.startsWith('xh')) return 'xh';
  if (raw.startsWith('st')) return 'st';
  if (raw.startsWith('nso') || raw.includes('sepedi') || raw.includes('northern sotho')) return 'nso';
  if (raw.startsWith('fr')) return 'fr';
  if (raw.startsWith('pt')) return 'pt';
  if (raw.startsWith('es')) return 'es';
  if (raw.startsWith('de')) return 'de';
  return 'en';
}

/**
 * Get Azure voice ID for a language and optional gender.
 * Used by all TTS consumers.
 */
export function getVoiceIdForLanguage(
  lang: string,
  gender: VoiceGender = 'female'
): string {
  const short = toShortCode(lang);
  const voices = VOICES_BY_LANG[short] ?? VOICES_BY_LANG.en;
  return gender === 'male' ? voices.male : voices.female;
}

/** Legacy: single voice per language (no gender). Uses female as default. */
export function getVoiceIdForLanguageLegacy(lang: string): string {
  return getVoiceIdForLanguage(lang, 'female');
}

export function isProviderVoiceId(value?: string | null): boolean {
  const normalized = String(value || '').trim();
  return Boolean(normalized) && (
    /Neural$/i.test(normalized) ||
    /^[a-z]{2,3}-[A-Z]{2}-/i.test(normalized)
  );
}

export function getDefaultVoiceGenderForLanguage(lang: string): VoiceGender {
  return toShortCode(lang) === 'en' ? 'male' : 'female';
}

export function resolveSelectedVoiceId(options: {
  language: string;
  requestedVoiceId?: string | null;
  preferenceVoiceId?: string | null;
  preferenceLanguage?: string | null;
  fallbackGender?: VoiceGender;
}): string {
  const short = toShortCode(options.language);
  const requestedVoice = String(options.requestedVoiceId || '').trim();
  const preferenceVoice = String(options.preferenceVoiceId || '').trim();
  const preferenceLanguage = String(options.preferenceLanguage || '').trim();

  if (isProviderVoiceId(preferenceVoice)) {
    if (!preferenceLanguage || toShortCode(preferenceLanguage) === short) {
      return preferenceVoice;
    }
  }

  if (isProviderVoiceId(requestedVoice)) {
    return requestedVoice;
  }

  const requestedGender = requestedVoice === 'male' || requestedVoice === 'female'
    ? requestedVoice
    : undefined;

  return getVoiceIdForLanguage(short, requestedGender || options.fallbackGender || getDefaultVoiceGenderForLanguage(short));
}
