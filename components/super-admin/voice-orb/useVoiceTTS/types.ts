/**
 * useVoiceTTS — shared types and interfaces.
 * @module components/super-admin/voice-orb/useVoiceTTS/types
 */

import type { SupportedLanguage } from '../useVoiceSTT';

export interface TTSOptions {
  voice?: string;
  rate?: number;
  pitch?: number;
  phonicsMode?: boolean;
  /** Called before each audio chunk plays — used to suspend barge-in recording. */
  onBeforePlay?: () => Promise<void> | void;
}

export interface UseVoiceTTSReturn {
  speak: (text: string, language?: SupportedLanguage, options?: TTSOptions) => Promise<void>;
  stop: () => Promise<void>;
  isSpeaking: boolean;
  error: string | null;
}

export type TTSErrorCategory =
  | 'quota_exhausted'
  | 'auth_missing'
  | 'throttled'
  | 'service_unconfigured'
  | 'phonics_requires_azure'
  | 'network_error'
  | 'playback_error'
  | 'unknown';

export type VoiceResolutionSource =
  | 'request_override'
  | 'voice_preferences'
  | 'ai_settings'
  | 'locale_default';

export interface EffectiveVoiceResolution {
  voiceId: string;
  source: VoiceResolutionSource;
  fallbackGender: 'male' | 'female';
}
