/**
 * SINGLE SOURCE OF TRUTH for Dash TTS voice IDs.
 * All TTS consumers (useVoiceTTS, DashVoiceController, DashVoiceService, web useTTS, tts-proxy)
 * MUST use this module. Aligns with supabase/functions/tts-proxy defaults.
 *
 * @module lib/voice/voiceMapping
 */

/** Dash's primary voice — must match DASH_VOICE in tts-proxy */
export const DASH_VOICE_ID = 'en-ZA-LukeNeural';

/** Short language codes accepted by tts-proxy and client TTS */
export type TTSShortLang = 'en' | 'af' | 'zu' | 'xh' | 'nso' | 'st' | 'fr' | 'pt' | 'es' | 'de';

export type VoiceGender = 'male' | 'female';

/** Voice IDs by short code and gender. Female defaults align with tts-proxy defaults. */
const VOICES_BY_LANG: Record<TTSShortLang, { male: string; female: string }> = {
  en: { male: 'en-ZA-LukeNeural', female: 'en-ZA-LeahNeural' },
  af: { male: 'af-ZA-WillemNeural', female: 'af-ZA-AdriNeural' },
  zu: { male: 'zu-ZA-ThembaNeural', female: 'zu-ZA-ThandoNeural' },
  xh: { male: 'xh-ZA-LungeloNeural', female: 'xh-ZA-NomalungaNeural' },
  nso: { male: 'nso-ZA-OupaNeural', female: 'nso-ZA-DidiNeural' },
  st: { male: 'en-ZA-LukeNeural', female: 'en-ZA-LeahNeural' }, // Sesotho — no native Azure
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
