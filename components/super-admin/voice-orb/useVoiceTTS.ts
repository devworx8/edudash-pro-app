/**
 * useVoiceTTS — re-export barrel.
 * Implementation split per WARP.md into useVoiceTTS/ subfolder.
 */
export { useVoiceTTS as default, useVoiceTTS, resolveEffectiveVoiceId } from './useVoiceTTS/index';
export type { TTSOptions, UseVoiceTTSReturn, TTSErrorCategory, EffectiveVoiceResolution } from './useVoiceTTS/types';
export { categorizeTTSError, getTTSErrorMessage } from './useVoiceTTS/ttsUtils';
