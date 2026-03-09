/**
 * South African Language Constants
 * 
 * Shared voice mappings and language codes for TTS/STT consistency
 * Ensures correct accent and pronunciation across the voice pipeline
 */

export type SALanguageCode = 'en-ZA' | 'af-ZA' | 'zu-ZA' | 'xh-ZA' | 'nso-ZA';

export interface SALanguage {
  code: SALanguageCode;
  name: string;
  nativeName: string;
  hasAzureTTS: boolean;
  hasAzureSTT: boolean;
  hasDeviceTTS: 'excellent' | 'good' | 'poor' | 'none';
  hasDeviceSTT: 'excellent' | 'good' | 'poor' | 'none';
  recommendedTTS: 'azure' | 'device';
  recommendedSTT: 'openai' | 'azure' | 'device';
}

/**
 * South African language metadata
 */
export const SA_LANGUAGES: Record<SALanguageCode, SALanguage> = {
  'en-ZA': {
    code: 'en-ZA',
    name: 'English (South Africa)',
    nativeName: 'English',
    hasAzureTTS: true,
    hasAzureSTT: false, // SDK not compatible with React Native
    hasDeviceTTS: 'excellent',
    hasDeviceSTT: 'excellent',
    recommendedTTS: 'azure',  // Best quality
    recommendedSTT: 'openai', // Best accuracy
  },
  'af-ZA': {
    code: 'af-ZA',
    name: 'Afrikaans',
    nativeName: 'Afrikaans',
    hasAzureTTS: true,
    hasAzureSTT: false,
    hasDeviceTTS: 'excellent',
    hasDeviceSTT: 'good',
    recommendedTTS: 'azure',  // Best quality
    recommendedSTT: 'openai', // Better than device
  },
  'zu-ZA': {
    code: 'zu-ZA',
    name: 'Zulu',
    nativeName: 'isiZulu',
    hasAzureTTS: true,
    hasAzureSTT: false,
    hasDeviceTTS: 'poor',      // Limited device support
    hasDeviceSTT: 'poor',      // Limited device support
    recommendedTTS: 'azure',   // Much better than device
    recommendedSTT: 'openai',  // Much better than device
  },
  'xh-ZA': {
    code: 'xh-ZA',
    name: 'Xhosa',
    nativeName: 'isiXhosa',
    hasAzureTTS: true,
    hasAzureSTT: false,
    hasDeviceTTS: 'poor',      // Limited device support
    hasDeviceSTT: 'poor',      // Limited device support
    recommendedTTS: 'azure',
    recommendedSTT: 'openai',  // Best option available
  },
  'nso-ZA': {
    code: 'nso-ZA',
    name: 'Northern Sotho',
    nativeName: 'Sepedi',
    hasAzureTTS: true,
    hasAzureSTT: false,
    hasDeviceTTS: 'none',      // Almost never available
    hasDeviceSTT: 'none',      // Almost never available
    recommendedTTS: 'azure',
    recommendedSTT: 'openai',  // Best option available
  },
};

/**
 * Azure TTS Neural voice mappings (verified voices only)
 * These are the actual voice IDs available in Azure Speech Service
 */
export const AZURE_TTS_VOICES: Record<string, string> = {
  // English (South Africa) - Verified ✅
  'en-ZA': 'en-ZA-LukeNeural',
  'en-ZA-male': 'en-ZA-LukeNeural',
  
  // Afrikaans - Verified ✅
  'af-ZA': 'af-ZA-AdriNeural',
  'af-ZA-male': 'af-ZA-WillemNeural',
  
  // isiZulu - Verified ✅
  'zu-ZA': 'zu-ZA-ThandoNeural',
  'zu-ZA-male': 'zu-ZA-ThembaNeural',
  
  // Additional SA voices
  'xh-ZA': 'xh-ZA-NomalungaNeural',
  'xh-ZA-male': 'xh-ZA-NomalungaNeural',
  'nso-ZA': 'nso-ZA-DidiNeural',
  'nso-ZA-male': 'nso-ZA-DidiNeural',
};

/**
 * Get Azure voice ID for a language and gender
 */
export function getAzureVoiceId(
  languageCode: SALanguageCode,
  gender: 'female' | 'male' = 'female'
): string {
  const key = gender === 'male' ? `${languageCode}-male` : languageCode;
  return AZURE_TTS_VOICES[key] || AZURE_TTS_VOICES['en-ZA'];
}

/**
 * Check if language has native Azure TTS support
 */
export function hasNativeAzureTTS(languageCode: SALanguageCode): boolean {
  return SA_LANGUAGES[languageCode]?.hasAzureTTS ?? false;
}

/**
 * Get recommended TTS provider for a language
 */
export function getRecommendedTTSProvider(
  languageCode: SALanguageCode
): 'azure' | 'device' {
  return SA_LANGUAGES[languageCode]?.recommendedTTS ?? 'device';
}

/**
 * Get recommended STT provider for a language
 */
export function getRecommendedSTTProvider(
  languageCode: SALanguageCode
): 'openai' | 'azure' | 'device' {
  return SA_LANGUAGES[languageCode]?.recommendedSTT ?? 'device';
}

/**
 * Normalize language code from various formats
 */
export function normalizeLanguageCode(input?: string): SALanguageCode {
  if (!input) return 'en-ZA';
  
  const normalized = input.toLowerCase().trim();
  
  // Direct match
  if (normalized === 'en-za' || normalized === 'en') return 'en-ZA';
  if (normalized === 'af-za' || normalized === 'af') return 'af-ZA';
  if (normalized === 'zu-za' || normalized === 'zu') return 'zu-ZA';
  if (normalized === 'xh-za' || normalized === 'xh') return 'xh-ZA';
  if (normalized === 'nso-za' || normalized === 'nso' || normalized === 'st') return 'nso-ZA';
  
  // Fallback
  return 'en-ZA';
}

/**
 * Get user-friendly language name
 */
export function getLanguageName(
  languageCode: SALanguageCode,
  useNativeName = false
): string {
  const lang = SA_LANGUAGES[languageCode];
  return lang ? (useNativeName ? lang.nativeName : lang.name) : 'English (South Africa)';
}
