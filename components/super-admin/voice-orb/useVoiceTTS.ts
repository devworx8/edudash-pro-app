/**
 * useVoiceTTS Hook
 * 
 * Handles Text-to-Speech with Azure TTS (primary) and device fallback.
 * Uses natural-sounding Azure voices with expo-speech as backup.
 * 
 * @module components/super-admin/voice-orb/useVoiceTTS
 */

import { useCallback, useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Speech from 'expo-speech';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { assertSupabase } from '../../../lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { SupportedLanguage } from './useVoiceSTT';
import { normalizeForTTS } from '@/lib/dash-ai/ttsNormalize';
import { shouldUsePhonicsMode } from '@/lib/dash-ai/phonicsDetection';
import { getVoiceIdForLanguage } from '@/lib/voice/voiceMapping';
import { track } from '@/lib/analytics';
import { resolveCapabilityTier } from '@/lib/tiers/resolveEffectiveTier';
import { getFeatureFlagsSync } from '@/lib/featureFlags';
import { trackTutorVoicePreferenceApplied } from '@/lib/ai/trackingEvents';
import { getPersonality, getVoicePrefs } from '@/lib/ai/dashSettings';
import type { VoicePreference } from '@/lib/voice/types';
import {
  consumePremiumVoiceActivity,
  getVoicePolicyDecision,
} from '@/lib/dash-ai/voicePolicy';

export interface TTSOptions {
  voice?: string;
  rate?: number;
  pitch?: number;
  phonicsMode?: boolean;
}

export interface UseVoiceTTSReturn {
  speak: (text: string, language?: SupportedLanguage, options?: TTSOptions) => Promise<void>;
  stop: () => Promise<void>;
  isSpeaking: boolean;
  error: string | null;
}

import {
  AZURE_RATE_NORMAL,
  AZURE_RATE_PHONICS,
  DEVICE_RATE_NORMAL,
  DEVICE_RATE_PHONICS,
} from '@/lib/dash-ai/ttsConstants';

/** Normal speech rate — imported from ttsConstants SSOT */
const DEFAULT_AZURE_RATE = AZURE_RATE_NORMAL;
/** Phonics sentence-level rate — imported from ttsConstants SSOT */
const DEFAULT_PHONICS_AZURE_RATE = AZURE_RATE_PHONICS;
/** Device TTS normal rate — imported from ttsConstants SSOT */
const DEFAULT_DEVICE_RATE = DEVICE_RATE_NORMAL;
/** Device TTS phonics rate — imported from ttsConstants SSOT */
const DEFAULT_PHONICS_DEVICE_RATE = DEVICE_RATE_PHONICS;
const ALLOW_DEVICE_FALLBACK_IN_PHONICS =
  process.env.EXPO_PUBLIC_ALLOW_DEVICE_FALLBACK_IN_PHONICS === 'true';
const TTS_FAST_START_FIRST_CHUNK_MAX_CHARS = 260;
const TTS_FAST_START_FIRST_CHUNK_MAX_SENTENCES = 1;
const TTS_PROXY_TIMEOUT_DEFAULT_MS = 4200;

const DEVICE_PHONICS_SOUND_MAP: Record<string, string> = {
  a: 'ah',
  b: 'buh',
  c: 'kuh',
  d: 'duh',
  e: 'eh',
  f: 'ffffff',
  g: 'guh',
  h: 'hhhhhh',
  i: 'ih',
  j: 'juh',
  k: 'kuh',
  l: 'llllll',
  m: 'mmmmmm',
  n: 'nnnnnn',
  o: 'aw',
  p: 'puh',
  q: 'kuh',
  r: 'rrrrrr',
  s: 'ssssss',
  t: 'tuh',
  u: 'uh',
  v: 'vvvvvv',
  w: 'wuh',
  x: 'ks',
  y: 'yuh',
  z: 'zzzzzz',
  sh: 'shhhhh',
  ch: 'chhhhh',
  th: 'thhhhh',
  ph: 'ffffff',
  ng: 'nggggg',
};

const normalizeVoiceGender = (value: unknown): 'male' | 'female' => {
  return String(value || '').toLowerCase() === 'male' ? 'male' : 'female';
};

const VOICE_ID_PATTERN = /^[a-z]{2}-[a-z]{2}-[a-z0-9-]+neural$/i;

const normalizeLanguageBase = (language: string): string =>
  String(language || 'en')
    .toLowerCase()
    .split('-')[0]
    .trim() || 'en';

const resolveLocaleDefaultVoice = (language: string, fallbackGender: 'male' | 'female'): string => {
  return getVoiceIdForLanguage(language, fallbackGender);
};

const isVoiceId = (value: unknown): boolean => {
  return typeof value === 'string' && VOICE_ID_PATTERN.test(String(value || '').trim());
};

const voiceIdMatchesLanguage = (voiceId: string, language: string): boolean => {
  const prefix = String(voiceId || '').split('-')[0]?.toLowerCase() || '';
  return prefix === normalizeLanguageBase(language);
};

type VoiceResolutionSource =
  | 'request_override'
  | 'voice_preferences'
  | 'ai_settings'
  | 'locale_default';

export interface EffectiveVoiceResolution {
  voiceId: string;
  source: VoiceResolutionSource;
  fallbackGender: 'male' | 'female';
}

export function resolveEffectiveVoiceId(input: {
  language: string;
  requestOverride?: unknown;
  preferenceVoiceId?: unknown;
  aiSettingsVoice?: unknown;
  fallbackGender?: 'male' | 'female';
}): EffectiveVoiceResolution {
  const fallbackGender = normalizeVoiceGender(input.fallbackGender);
  const localeDefault = resolveLocaleDefaultVoice(input.language, fallbackGender);
  const base = normalizeLanguageBase(input.language);

  const candidates: Array<{ value: unknown; source: VoiceResolutionSource }> = [
    { value: input.requestOverride, source: 'request_override' },
    { value: input.preferenceVoiceId, source: 'voice_preferences' },
    { value: input.aiSettingsVoice, source: 'ai_settings' },
  ];

  for (const candidate of candidates) {
    const value = String(candidate.value || '').trim();
    if (!value) continue;

    if (isVoiceId(value)) {
      if (candidate.source === 'request_override' || voiceIdMatchesLanguage(value, base)) {
        return {
          voiceId: value,
          source: candidate.source,
          fallbackGender,
        };
      }
      continue;
    }

    const lower = String(value || '').toLowerCase();
    if (lower === 'male' || lower === 'female') {
      return {
        voiceId: resolveLocaleDefaultVoice(base, normalizeVoiceGender(lower)),
        source: candidate.source,
        fallbackGender: normalizeVoiceGender(lower),
      };
    }
  }

  return {
    voiceId: localeDefault,
    source: 'locale_default',
    fallbackGender,
  };
}

const resolveAzureVoiceId = (language: string, preferredVoice?: unknown): string | undefined => {
  const resolved = resolveEffectiveVoiceId({
    language,
    requestOverride: preferredVoice,
  });
  return resolved.voiceId;
};

export type TTSErrorCategory =
  | 'quota_exhausted'
  | 'auth_missing'
  | 'throttled'
  | 'service_unconfigured'
  | 'phonics_requires_azure'
  | 'network_error'
  | 'playback_error'
  | 'unknown';

const mapToDeviceLocale = (language: string): string => {
  const normalized = (language || 'en-ZA').toLowerCase();
  if (normalized.startsWith('af')) return 'af-ZA';
  if (normalized.startsWith('zu')) return 'zu-ZA';
  if (normalized.startsWith('en')) return 'en-ZA';
  return 'en-ZA';
};

const clampDeviceRate = (rate: number): number => Math.max(0.5, Math.min(rate, 2.0));

/**
 * Convert incoming rate to device TTS semantics.
 * - Device expects ~0.5..2.0
 * - Azure-style percentages use -100..100 where 0 is normal
 */
const resolveDeviceRate = (rate: unknown, defaultRate: number): number => {
  const parsed = Number(rate);
  if (!Number.isFinite(parsed)) return defaultRate;

  if (parsed >= 0.5 && parsed <= 2.0) {
    return clampDeviceRate(parsed);
  }

  if (parsed >= -100 && parsed <= 100) {
    return clampDeviceRate(1 + (parsed / 100));
  }

  return defaultRate;
};

const shouldRetryAzureChunk = (error: unknown): boolean => {
  const normalized = String(error instanceof Error ? error.message : error || '').toLowerCase();
  return (
    normalized.includes('tts_throttled_429') ||
    normalized.includes('network_error_status_429') ||
    normalized.includes('service_unconfigured_502') ||
    normalized.includes('service_unconfigured_503') ||
    normalized.includes('service_unconfigured_504') ||
    normalized.includes('service_unavailable_503') ||
    normalized.includes('network_error') ||
    normalized.includes('timeout')
  );
};

const parseTTSDiagnostics = (reason: unknown) => {
  const message = String(reason instanceof Error ? reason.message : reason || '');
  const statusMatch = message.match(/(?:upstream_status|status)=(\d{3})/i);
  const requestMatch = message.match(/req=([a-z0-9-]+)/i);
  const errorCodeMatch = message.match(/error_code=([a-z0-9_:-]+)/i);

  return {
    statusCode: statusMatch ? Number(statusMatch[1]) : undefined,
    requestId: requestMatch?.[1],
    errorCode: errorCodeMatch?.[1],
    raw: message,
  };
};

const pickDeviceVoiceIdentifier = async (
  locale: string,
  preferredVoice?: unknown
): Promise<string | undefined> => {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const langBase = String(locale || 'en-ZA').split('-')[0].toLowerCase();
    const matching = voices.filter((voice) => String(voice.language || '').toLowerCase().startsWith(langBase));
    if (matching.length === 0) return undefined;

    const preferredValue = String(preferredVoice || '').trim();
    if (isVoiceId(preferredValue)) {
      const exact = matching.find((voice) =>
        String(voice.identifier || '').toLowerCase() === preferredValue.toLowerCase()
      );
      if (exact?.identifier) return exact.identifier;
    }

    const target = normalizeVoiceGender(preferredVoice);
    if (target === 'male') {
      const male = matching.find((voice) =>
        String(voice.name || '').toLowerCase().includes('male') || (voice as any)?.gender === 'male'
      );
      return male?.identifier || matching[0]?.identifier;
    }

    const female = matching.find((voice) =>
      String(voice.name || '').toLowerCase().includes('female') || (voice as any)?.gender === 'female'
    );
    return female?.identifier || matching[0]?.identifier;
  } catch {
    return undefined;
  }
};

const prepareDevicePhonicsText = (text: string): string => {
  let next = String(text || '');
  // /s/ -> sss, /sh/ -> shhh, [m] -> mmm, etc.
  next = next.replace(/\/([a-z]{1,8})\//gi, (_m, token: string) => {
    const key = String(token || '').toLowerCase();
    return DEVICE_PHONICS_SOUND_MAP[key] || key;
  });
  next = next.replace(/\[([a-z]{1,8})\]/gi, (_m, token: string) => {
    const key = String(token || '').toLowerCase();
    return DEVICE_PHONICS_SOUND_MAP[key] || key;
  });
  // c-a-t -> kuh . ah . tuh (short pause to keep pace natural for young learners)
  next = next.replace(/\b([a-z](?:-[a-z]){1,7})\b/gi, (token) => {
    const letters = token.split('-').map((v) => v.trim().toLowerCase()).filter(Boolean);
    if (letters.some((v) => v.length !== 1)) return token;
    return letters.map((l) => DEVICE_PHONICS_SOUND_MAP[l] || l).join(' . ');
  });
  // Ensure marker punctuation is never spoken literally.
  next = next.replace(/[\/[\]]/g, ' ');
  return next;
};

export const categorizeTTSError = (error: unknown): TTSErrorCategory => {
  const message = error instanceof Error ? error.message : String(error || '');
  const normalized = message.toLowerCase();

  if (
    normalized.includes('free_quota_exhausted') ||
    normalized.includes('premium voice quota')
  ) {
    return 'quota_exhausted';
  }

  if (
    normalized.includes('auth_missing') ||
    normalized.includes('no session') ||
    normalized.includes('401') ||
    normalized.includes('403')
  ) {
    return 'auth_missing';
  }

  if (
    normalized.includes('phonics_requires_azure') ||
    normalized.includes('phonics mode requires azure') ||
    normalized.includes('phonics_needs_azure')
  ) {
    return 'phonics_requires_azure';
  }

  if (
    normalized.includes('tts_throttled') ||
    normalized.includes('too many requests') ||
    normalized.includes('429')
  ) {
    return 'throttled';
  }

  if (
    normalized.includes('service_unconfigured') ||
    normalized.includes('service_unavailable') ||
    normalized.includes('tts unavailable') ||
    normalized.includes('supabase_url') ||
    normalized.includes('fallback') ||
    normalized.includes('not configured')
  ) {
    return 'service_unconfigured';
  }

  if (
    normalized.includes('audio_player') ||
    normalized.includes('playback') ||
    normalized.includes('device_tts_failed')
  ) {
    return 'playback_error';
  }

  if (
    normalized.includes('network') ||
    normalized.includes('fetch') ||
    normalized.includes('timeout') ||
    normalized.includes('econn') ||
    normalized.includes('enotfound')
  ) {
    return 'network_error';
  }

  return 'unknown';
};

export const getTTSErrorMessage = (category: TTSErrorCategory): string => {
  switch (category) {
    case 'quota_exhausted':
      return 'Premium voice limit reached. Using standard voice until reset.';
    case 'auth_missing':
      return 'Voice needs an active login session.';
    case 'throttled':
      return 'Voice is busy right now. Retrying shortly.';
    case 'phonics_requires_azure':
      return 'Phonics voice needs cloud TTS. Please check connection and retry.';
    case 'service_unconfigured':
      return 'Voice service is unavailable. Using device voice.';
    case 'network_error':
      return 'Network issue detected. Using device voice.';
    case 'playback_error':
      return 'Audio playback failed. Using device voice.';
    default:
      return 'Voice is temporarily unavailable.';
  }
};

export function useVoiceTTS(): UseVoiceTTSReturn {
  const { user, profile } = useAuth();
  const { tier } = useSubscription();
  const VOICE_TRACE_ENABLED = __DEV__ || process.env.EXPO_PUBLIC_DASH_VOICE_TRACE === 'true';
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const stopRequestedRef = useRef(false);
  const reportedErrorCategoriesRef = useRef<Set<TTSErrorCategory>>(new Set());
  const playbackIdRef = useRef(0);
  const playbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioModeConfiguredRef = useRef(false);
  const cachedVoicePreferenceRef = useRef<VoicePreference | null | undefined>(undefined);
  const cachedAISettingsVoiceRef = useRef<string | null | undefined>(undefined);
  const lastAppliedVoiceSignatureRef = useRef<string | null>(null);

  const logVoiceTrace = useCallback((event: string, payload?: Record<string, unknown>) => {
    if (!VOICE_TRACE_ENABLED) return;
    console.log(`[VoiceTTSTrace] ${event}`, payload || {});
  }, [VOICE_TRACE_ENABLED]);

  // ── Session cache: avoid getSession() on every TTS chunk ──────────
  const sessionCacheRef = useRef<{ token: string; expiresAt: number } | null>(null);
  const getSessionTokenCached = useCallback(async (): Promise<string> => {
    const now = Date.now();
    if (sessionCacheRef.current && sessionCacheRef.current.expiresAt > now) {
      return sessionCacheRef.current.token;
    }
    const supabase = assertSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('AUTH_MISSING');
    // Cache for 4 minutes (tokens typically valid 1 hour)
    sessionCacheRef.current = { token: session.access_token, expiresAt: now + 4 * 60 * 1000 };
    return session.access_token;
  }, []);

  const clearPlaybackTimers = useCallback(() => {
    if (playbackIntervalRef.current) {
      clearInterval(playbackIntervalRef.current);
      playbackIntervalRef.current = null;
    }
    if (playbackTimeoutRef.current) {
      clearTimeout(playbackTimeoutRef.current);
      playbackTimeoutRef.current = null;
    }
  }, []);

  const cleanupPlayer = useCallback((player?: AudioPlayer | null) => {
    if (!player) return;
    try {
      player.pause();
    } catch {
      // ignore pause errors
    }
    try {
      player.release();
    } catch {
      // ignore release errors
    }
    if (playerRef.current === player) {
      playerRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Speech.stop();
      clearPlaybackTimers();
      cleanupPlayer(playerRef.current);
    };
  }, [clearPlaybackTimers, cleanupPlayer]);

  const stopPlayback = useCallback(async () => {
    try {
      Speech.stop();
      playbackIdRef.current += 1; // invalidate any pending intervals
      clearPlaybackTimers();
      cleanupPlayer(playerRef.current);
    } catch (err) {
      console.error('[VoiceTTS] Error stopping playback:', err);
    }
  }, [clearPlaybackTimers, cleanupPlayer]);

  const stop = useCallback(async () => {
    stopRequestedRef.current = true;
    await stopPlayback();
    setIsSpeaking(false);
  }, [stopPlayback]);

  const reportTTSError = useCallback((reason: unknown) => {
    const category = categorizeTTSError(reason);
    if (reportedErrorCategoriesRef.current.has(category)) {
      return category;
    }
    reportedErrorCategoriesRef.current.add(category);
    setError(getTTSErrorMessage(category));
    return category;
  }, []);

  const estimatePlaybackTimeoutMs = useCallback((text: string): number => {
    const length = (text || '').length;
    // Conservative estimate for slower voices; clamp to avoid unbounded waits.
    const estimated = length * 120;
    return Math.min(120000, Math.max(20000, estimated));
  }, []);

  const playAudioUrl = useCallback((audioUrl: string, timeoutMs: number): Promise<void> => {
    return new Promise<void>(async (resolve, reject) => {
      // Configure audio mode on first use (ensures playback works on Android)
      if (!audioModeConfiguredRef.current) {
        try {
          await setAudioModeAsync({
            playsInSilentMode: true,
            shouldPlayInBackground: false,
            interruptionMode: 'duckOthers',
          });
          audioModeConfiguredRef.current = true;
        } catch (modeErr) {
          console.warn('[VoiceTTS] Audio mode config failed (non-fatal):', modeErr);
        }
      }

      let settled = false;
      let hasStarted = false;
      let stallTicks = 0;
      let endConfidenceTicks = 0;
      let lastPositionMs = 0;
      let lastSnapshot = { durationMs: 0, positionMs: 0, playing: false };
      const playbackId = playbackIdRef.current + 1;
      playbackIdRef.current = playbackId;

      clearPlaybackTimers();
      cleanupPlayer(playerRef.current);

      const finalize = (err?: Error) => {
        if (settled) return;
        settled = true;
        clearPlaybackTimers();
        cleanupPlayer(playerRef.current);
        if (err) {
          reject(err);
          return;
        }
        resolve();
      };

      let player: AudioPlayer | null = null;
      try {
        player = createAudioPlayer(audioUrl);
        playerRef.current = player;
        player.play();
      } catch (err) {
        console.error('[VoiceTTS] Failed to start audio playback:', err);
        finalize(new Error('AUDIO_PLAYER_INIT_FAILED'));
        return;
      }

      playbackIntervalRef.current = setInterval(() => {
        if (playbackIdRef.current !== playbackId) {
          finalize();
          return;
        }
        if (!player) {
          finalize(new Error('AUDIO_PLAYER_MISSING'));
          return;
        }
        let playing = false;
        let durationMs = 0;
        let positionMs = 0;
        try {
          playing = player.playing;
          durationMs = (player.duration || 0) * 1000;
          positionMs = (player.currentTime || 0) * 1000;
          lastSnapshot = { durationMs, positionMs, playing };
        } catch (err) {
          console.warn('[VoiceTTS] Playback status error, stopping:', err);
          finalize(new Error('AUDIO_PLAYER_STATUS_ERROR'));
          return;
        }
        if (playing) {
          hasStarted = true;
          stallTicks = 0;
          endConfidenceTicks = 0;
          if (positionMs > lastPositionMs) {
            lastPositionMs = positionMs;
          }
          return;
        }
        if (!hasStarted) {
          return;
        }

        const hasProgressed = positionMs > lastPositionMs + 20;
        if (hasProgressed) {
          lastPositionMs = positionMs;
          stallTicks = 0;
        } else {
          stallTicks += 1;
        }

        const reachedEnd = durationMs > 0 && positionMs >= Math.max(durationMs - 180, 0);
        if (reachedEnd) {
          endConfidenceTicks += 1;
          if (endConfidenceTicks >= 1) {
            finalize();
          }
          return;
        }

        const nearEndStall = durationMs > 0 && positionMs >= durationMs * 0.95 && stallTicks >= 3;
        if (nearEndStall) {
          finalize();
        }
      }, 150);

      playbackTimeoutRef.current = setTimeout(() => {
        if (!hasStarted) {
          finalize(new Error('AUDIO_PLAYBACK_TIMEOUT'));
          return;
        }
        if (lastSnapshot.playing) {
          finalize(new Error('AUDIO_PLAYBACK_TIMEOUT'));
          return;
        }
        const unfinished = lastSnapshot.durationMs > 0 && lastSnapshot.positionMs < lastSnapshot.durationMs * 0.8;
        if (unfinished) {
          finalize(new Error('AUDIO_PLAYBACK_STALL'));
          return;
        }
        finalize();
      }, timeoutMs);
    });
  }, [clearPlaybackTimers, cleanupPlayer]);

  const getCachedVoicePreference = useCallback(async (): Promise<VoicePreference | null> => {
    if (cachedVoicePreferenceRef.current !== undefined) {
      return cachedVoicePreferenceRef.current;
    }
    try {
      const prefs = await getVoicePrefs();
      cachedVoicePreferenceRef.current = prefs;
      return prefs;
    } catch {
      cachedVoicePreferenceRef.current = null;
      return null;
    }
  }, []);

  const getCachedAISettingsVoice = useCallback((): string | null => {
    if (cachedAISettingsVoiceRef.current !== undefined) {
      return cachedAISettingsVoiceRef.current;
    }
    try {
      const personality = getPersonality?.();
      const voiceValue = String(
        personality?.voice_settings?.voice_id ||
        personality?.voice_settings?.voice ||
        personality?.voice ||
        ''
      ).trim();
      cachedAISettingsVoiceRef.current = voiceValue || null;
      return cachedAISettingsVoiceRef.current;
    } catch {
      cachedAISettingsVoiceRef.current = null;
      return null;
    }
  }, []);

  const resolveSessionVoice = useCallback(async (
    language: string,
    requestOverride?: unknown
  ): Promise<EffectiveVoiceResolution> => {
    const flags = getFeatureFlagsSync();
    const fallbackGender = normalizeVoiceGender((profile as any)?.voice_gender || (profile as any)?.gender);

    if (!flags.dash_tutor_voice_sticky_v1) {
      return resolveEffectiveVoiceId({
        language,
        requestOverride,
        fallbackGender,
      });
    }

    const [voicePreference, aiSettingsVoice] = await Promise.all([
      getCachedVoicePreference(),
      Promise.resolve(getCachedAISettingsVoice()),
    ]);

    return resolveEffectiveVoiceId({
      language,
      requestOverride,
      preferenceVoiceId: voicePreference?.voice_id,
      aiSettingsVoice,
      fallbackGender,
    });
  }, [getCachedAISettingsVoice, getCachedVoicePreference, profile]);

  const speakWithDeviceTTS = useCallback(async (
    text: string,
    language: string,
    options: TTSOptions = {}
  ): Promise<void> => {
    const locale = mapToDeviceLocale(language);
    const phonicsMode = options.phonicsMode === true;
    const fallbackRate = phonicsMode ? DEFAULT_PHONICS_DEVICE_RATE : DEFAULT_DEVICE_RATE;
    const effectiveRate = resolveDeviceRate(options.rate, fallbackRate);
    const safePitch = Number(options.pitch);
    const effectivePitch = Number.isFinite(safePitch)
      ? Math.max(0.5, Math.min(safePitch, 2.0))
      : 1.0;
    const spokenText = phonicsMode ? prepareDevicePhonicsText(text) : text;
    const selectedVoice = await pickDeviceVoiceIdentifier(locale, options.voice);
    await stopPlayback();
    // Delay after Speech.stop() to prevent Android race condition where
    // an immediate Speech.speak() call is silently ignored.
    if (Platform.OS === 'android') {
      await new Promise(r => setTimeout(r, 150));
    }
    await new Promise<void>((resolve, reject) => {
      // Safety timeout: if neither onDone nor onError fires within 30s, resolve
      const safetyTimer = setTimeout(() => {
        console.warn('[VoiceTTS] Device TTS safety timeout — resolving');
        resolve();
      }, 30000);

      const deviceOptions: Speech.SpeechOptions = {
        language: locale,
        rate: effectiveRate,
        pitch: effectivePitch,
        onDone: () => { clearTimeout(safetyTimer); resolve(); },
        onStopped: () => { clearTimeout(safetyTimer); resolve(); },
        onError: (err) => {
          clearTimeout(safetyTimer);
          reject(err instanceof Error ? err : new Error('DEVICE_TTS_FAILED'));
        },
      };
      if (selectedVoice) {
        deviceOptions.voice = selectedVoice;
      }
      Speech.speak(spokenText, deviceOptions);
    });
  }, [stopPlayback]);

  /**
   * Speak using Azure TTS (primary method)
   */
  /**
   * Fetch audio URL from tts-proxy WITHOUT playing it.
   * This is used for prefetching so the next chunk is ready by the time the
   * current chunk finishes playing.
   */
  const requestAzureAudioUrl = useCallback(async (
    cleanText: string,
    language: SupportedLanguage,
    options: TTSOptions = {},
    cachedToken?: string,
  ): Promise<string> => {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) throw new Error('SERVICE_UNCONFIGURED_SUPABASE_URL');

    const token = cachedToken || await getSessionTokenCached();
    const langCode = language.split('-')[0] as 'en' | 'af' | 'zu';
    const endpoint = `${supabaseUrl}/functions/v1/tts-proxy`;
    const phonicsMode = options.phonicsMode === true;
    const voiceId = resolveAzureVoiceId(langCode, options.voice);
    const effectiveRate = Number.isFinite(options.rate as number)
      ? Number(options.rate)
      : (phonicsMode ? DEFAULT_PHONICS_AZURE_RATE : DEFAULT_AZURE_RATE);
    const effectivePitch = Number.isFinite(options.pitch as number) ? Number(options.pitch) : 0;
    const timeoutRaw = Number.parseInt(
      String(process.env.EXPO_PUBLIC_TTS_PROXY_TIMEOUT_MS || String(TTS_PROXY_TIMEOUT_DEFAULT_MS)),
      10
    );
    const requestTimeoutMs = Number.isFinite(timeoutRaw)
      ? Math.min(12000, Math.max(1800, timeoutRaw))
      : TTS_PROXY_TIMEOUT_DEFAULT_MS;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          text: cleanText,
          lang: langCode,
          voice_id: voiceId,
          rate: effectiveRate,
          pitch: effectivePitch,
          style: 'friendly',
          phonics_mode: phonicsMode,
          format: 'mp3',
        }),
        signal: controller.signal,
      });
    } catch (networkError) {
      if (networkError instanceof Error && networkError.name === 'AbortError') {
        throw new Error(`NETWORK_TIMEOUT_${requestTimeoutMs}MS`);
      }
      throw new Error(`NETWORK_ERROR:${networkError instanceof Error ? networkError.message : String(networkError)}`);
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const status = response.status;
      const requestId =
        response.headers.get('sb-request-id') ||
        response.headers.get('x-sb-request-id') ||
        '';
      let backendDetails = '';
      try {
        const bodyText = await response.text();
        if (bodyText) {
          try {
            const payload = JSON.parse(bodyText) as {
              error?: string;
              error_code?: string;
              details?: string;
              provider?: string;
              fallback?: string;
              upstream_status?: number;
            };
            backendDetails = [
              payload.error || '',
              payload.error_code ? `error_code=${payload.error_code}` : '',
              payload.details || '',
              payload.provider ? `provider=${payload.provider}` : '',
              payload.fallback ? `fallback=${payload.fallback}` : '',
              Number.isFinite(payload.upstream_status) ? `upstream_status=${payload.upstream_status}` : '',
            ]
              .filter(Boolean)
              .join(' | ');
          } catch {
            backendDetails = bodyText.slice(0, 260);
          }
        }
      } catch {
        // ignore body parsing errors
      }
      const diagnostic = [requestId ? `req=${requestId}` : '', backendDetails ? `details=${backendDetails}` : '']
        .filter(Boolean)
        .join(' | ');

      if (status === 401 || status === 403) {
        throw new Error(`AUTH_MISSING_${status}${diagnostic ? `:${diagnostic}` : ''}`);
      }
      if (status === 429) {
        throw new Error(`TTS_THROTTLED_429${diagnostic ? `:${diagnostic}` : ''}`);
      }
      if (status === 503) {
        throw new Error(`SERVICE_UNAVAILABLE_503${diagnostic ? `:${diagnostic}` : ''}`);
      }
      if (status === 500) {
        throw new Error(`SERVICE_INTERNAL_500${diagnostic ? `:${diagnostic}` : ''}`);
      }
      if (status >= 500 || status === 404 || status === 422) {
        throw new Error(`SERVICE_UNCONFIGURED_${status}${diagnostic ? `:${diagnostic}` : ''}`);
      }
      throw new Error(`NETWORK_ERROR_STATUS_${status}${diagnostic ? `:${diagnostic}` : ''}`);
    }

    const data = await response.json();
    if (data?.fallback === 'device') {
      throw new Error('SERVICE_UNCONFIGURED_DEVICE_FALLBACK');
    }
    if (!data?.audio_url) {
      throw new Error('SERVICE_UNCONFIGURED_NO_AUDIO_URL');
    }
    return data.audio_url;
  }, [getSessionTokenCached]);

  const splitIntoChunks = (text: string, maxLength: number): string[] => {
    const sentences: string[] = [];
    let buffer = '';

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      buffer += char;
      if (char === '.' || char === '!' || char === '?') {
        if (buffer.trim()) {
          sentences.push(buffer.trim());
        }
        buffer = '';
      }
    }
    if (buffer.trim()) {
      sentences.push(buffer.trim());
    }
    const chunks: string[] = [];
    let current = '';

    for (const sentence of sentences) {
      if (!sentence.trim()) continue;
      if ((current + ' ' + sentence).trim().length > maxLength) {
        if (current.trim()) chunks.push(current.trim());
        current = sentence;
      } else {
        current = current ? `${current} ${sentence}` : sentence;
      }
    }

    if (current.trim()) chunks.push(current.trim());

    if (chunks.length === 0) {
      return text.length > 0 ? [text] : [];
    }

    // Hard split any oversized chunks
    const normalized: string[] = [];
    chunks.forEach((chunk) => {
      if (chunk.length <= maxLength) {
        normalized.push(chunk);
      } else {
        for (let i = 0; i < chunk.length; i += maxLength) {
          normalized.push(chunk.slice(i, i + maxLength));
        }
      }
    });

    return normalized;
  };

  const buildFastStartChunks = (text: string, maxLength: number): string[] => {
    const baseChunks = splitIntoChunks(text, maxLength);
    if (baseChunks.length === 0) return [];

    const firstChunk = String(baseChunks[0] || '').trim();
    if (!firstChunk || firstChunk.length <= TTS_FAST_START_FIRST_CHUNK_MAX_CHARS) {
      return baseChunks;
    }

    const sentences = firstChunk
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);

    let fastStartChunk = '';
    for (let i = 0; i < sentences.length && i < TTS_FAST_START_FIRST_CHUNK_MAX_SENTENCES; i += 1) {
      const candidate = fastStartChunk ? `${fastStartChunk} ${sentences[i]}` : sentences[i];
      if (candidate.length > TTS_FAST_START_FIRST_CHUNK_MAX_CHARS) break;
      fastStartChunk = candidate;
    }

    if (!fastStartChunk) {
      const clipped = firstChunk.slice(0, TTS_FAST_START_FIRST_CHUNK_MAX_CHARS);
      const lastSpace = clipped.lastIndexOf(' ');
      fastStartChunk = (lastSpace > 40 ? clipped.slice(0, lastSpace) : clipped).trim();
    }

    if (!fastStartChunk || fastStartChunk.length >= firstChunk.length) {
      return baseChunks;
    }

    const firstRemainder = firstChunk.slice(fastStartChunk.length).trim();
    const remainingText = [firstRemainder, ...baseChunks.slice(1)]
      .map((chunk) => String(chunk || '').trim())
      .filter(Boolean)
      .join(' ')
      .trim();

    return [
      fastStartChunk,
      ...splitIntoChunks(remainingText, maxLength),
    ];
  };

  const speak = useCallback(async (
    text: string,
    language: SupportedLanguage = 'en-ZA',
    options: TTSOptions = {}
  ) => {
    stopRequestedRef.current = false;
    setIsSpeaking(true);
    setError(null);
    // Reset error dedup each invocation so persistent failures aren't silenced
    reportedErrorCategoriesRef.current.clear();
    
    try {
      // Stop any current playback without cancelling this session
      await stopPlayback();

      const policy = await getVoicePolicyDecision(
        {
          role: profile?.role,
          profileTier: tier,
        },
        user?.id,
      );
      let cloudAttempted = false;
      let fallbackUsed: 'none' | 'device' | 'phonics_blocked' = 'none';
      let telemetryError: unknown = null;
      
      // Azure supports all 9 i18n languages (st uses en-ZA fallback)
      const SUPPORTED_TTS_LANGS = ['en', 'af', 'zu', 'xh', 'nso', 'st', 'fr', 'pt', 'es', 'de'];
      const baseLang = language.split('-')[0];
      const phonicsMode = typeof options.phonicsMode === 'boolean'
        ? options.phonicsMode
        : shouldUsePhonicsMode(text);
      const resolvedVoice = await resolveSessionVoice(language, options.voice);
      const effectiveOptions: TTSOptions = {
        ...options,
        voice: resolvedVoice.voiceId,
        phonicsMode,
      };
      const voiceSignature = `${language}|${resolvedVoice.source}|${resolvedVoice.voiceId}`;
      if (lastAppliedVoiceSignatureRef.current !== voiceSignature) {
        lastAppliedVoiceSignatureRef.current = voiceSignature;
        trackTutorVoicePreferenceApplied({
          voiceId: resolvedVoice.voiceId,
          source: resolvedVoice.source,
          language,
          role: String(profile?.role || 'unknown'),
        });
      }
      
      if (!SUPPORTED_TTS_LANGS.includes(baseLang)) {
        console.warn(`[VoiceTTS] Language ${language} not supported by Azure path. Falling back to device TTS.`);
        fallbackUsed = 'device';
        await speakWithDeviceTTS(text, language, {
          ...effectiveOptions,
        });
        return;
      }
      
      const effectiveLanguage: SupportedLanguage = language;
      const cleanText = normalizeForTTS(text, {
        phonicsMode,
        preservePhonicsMarkers: phonicsMode,
      });
      
      if (!cleanText) {
        console.log('[VoiceTTS] No text to speak');
        setIsSpeaking(false);
        return;
      }
      
      console.log('[VoiceTTS] Speaking text, length:', cleanText.length);
      // Keep chunking consistent in phonics mode to avoid extra request gaps.
      const chunks = buildFastStartChunks(cleanText, 1200);
      const speechStartedAt = Date.now();
      const azureRate = Number.isFinite(effectiveOptions.rate as number)
        ? Number(effectiveOptions.rate)
        : (phonicsMode ? DEFAULT_PHONICS_AZURE_RATE : DEFAULT_AZURE_RATE);
      logVoiceTrace('tts_start', {
        language: effectiveLanguage,
        voiceId: effectiveOptions.voice || 'default',
        phonicsMode,
        rate: azureRate,
        chars: cleanText.length,
        chunks: chunks.length,
        preview: cleanText.slice(0, 160),
      });

      // Pre-cache auth token so chunks don't each call getSession()
      const cachedToken = await getSessionTokenCached();

      if (!policy.shouldUseCloudVoice) {
        reportTTSError(new Error('FREE_QUOTA_EXHAUSTED_DEVICE_VOICE'));
        fallbackUsed = 'device';
        let firstDeviceChunkAt: number | null = null;
        for (const chunk of chunks) {
          if (stopRequestedRef.current) break;
          const chunkStartedAt = Date.now();
          logVoiceTrace('tts_chunk_device', {
            language: effectiveLanguage,
            chars: chunk.length,
            preview: chunk.slice(0, 120),
          });
          await speakWithDeviceTTS(chunk, effectiveLanguage, {
            ...effectiveOptions,
          });
          if (firstDeviceChunkAt === null) {
            firstDeviceChunkAt = Date.now();
            logVoiceTrace('tts_first_chunk_complete', {
              firstChunkIndex: 1,
              timeToFirstChunkCompleteMs: firstDeviceChunkAt - speechStartedAt,
              transport: 'device',
            });
          }
          logVoiceTrace('tts_chunk_done', {
            transport: 'device',
            chars: chunk.length,
            totalMs: Date.now() - chunkStartedAt,
          });
        }
        logVoiceTrace('tts_done', {
          mode: 'device_only',
          durationMs: Date.now() - speechStartedAt,
          chunksSpoken: chunks.length,
        });
        return;
      }
      
      // Speak chunks with look-ahead prefetching to eliminate inter-chunk silence.
      // While chunk N plays, chunk N+1's audio URL is already being fetched.
      let anyChunkSucceeded = false;
      let cloudChunkSucceeded = false;
      let lastErr: Error | null = null;
      let firstChunkPlayedAt: number | null = null;
      let firstAudioReadyAt: number | null = null;
      let prefetchedNextIndex: number | null = null;
      let prefetchedNextPromise: Promise<string | null> | null = null;

      const consumePrefetched = async (index: number): Promise<string | null> => {
        if (prefetchedNextIndex !== index || !prefetchedNextPromise) return null;
        const promise = prefetchedNextPromise;
        prefetchedNextIndex = null;
        prefetchedNextPromise = null;
        try {
          return await promise;
        } catch {
          return null;
        }
      };

      const ensurePrefetch = (index: number) => {
        if (index < 0 || index >= chunks.length) return;
        if (prefetchedNextIndex === index && prefetchedNextPromise) return;
        prefetchedNextIndex = index;
        prefetchedNextPromise = requestAzureAudioUrl(chunks[index], effectiveLanguage, effectiveOptions, cachedToken)
          .catch(() => null);
      };

      for (let ci = 0; ci < chunks.length; ci += 1) {
        const chunk = chunks[ci];
        if (stopRequestedRef.current) break;
        const chunkStartedAt = Date.now();
        let requestDurationMs: number | null = null;
        const prefetchedUrl = await consumePrefetched(ci);
        logVoiceTrace('tts_chunk_start', {
          index: ci + 1,
          total: chunks.length,
          chars: chunk.length,
          preview: chunk.slice(0, 120),
          prefetched: !!prefetchedUrl,
        });

        try {
          cloudAttempted = true;

          // Eagerly kick off next-chunk prefetch in parallel with current fetch.
          // For ci=0 this means chunk 1 fetches alongside chunk 0 (separate HTTP).
          // For ci=1+ the current chunk was already prefetched; this fires chunk+2.
          ensurePrefetch(ci + 1);

          const requestStartedAt = Date.now();
          const audioUrl = prefetchedUrl || await requestAzureAudioUrl(chunk, effectiveLanguage, effectiveOptions, cachedToken);
          requestDurationMs = Date.now() - requestStartedAt;
          if (firstAudioReadyAt === null) {
            firstAudioReadyAt = Date.now();
            logVoiceTrace('tts_first_audio_ready', {
              firstChunkIndex: ci + 1,
              timeToAudioReadyMs: firstAudioReadyAt - speechStartedAt,
              requestMs: requestDurationMs,
            });
          }

          const playbackStartedAt = Date.now();
          await playAudioUrl(audioUrl, estimatePlaybackTimeoutMs(chunk));
          const playbackDurationMs = Date.now() - playbackStartedAt;
          anyChunkSucceeded = true;
          cloudChunkSucceeded = true;
          if (firstChunkPlayedAt === null) {
            firstChunkPlayedAt = Date.now();
            logVoiceTrace('tts_first_chunk_complete', {
              firstChunkIndex: ci + 1,
              timeToFirstChunkCompleteMs: firstChunkPlayedAt - speechStartedAt,
            });
          }
          logVoiceTrace('tts_chunk_done', {
            index: ci + 1,
            total: chunks.length,
            transport: 'azure',
            chars: chunk.length,
            requestMs: requestDurationMs,
            playbackMs: playbackDurationMs,
            totalMs: Date.now() - chunkStartedAt,
          });
        } catch (azureErr) {
          let effectiveAzureErr: unknown = azureErr;
          logVoiceTrace('tts_chunk_error', {
            index: ci + 1,
            total: chunks.length,
            chars: chunk.length,
            error: String(azureErr instanceof Error ? azureErr.message : azureErr || 'unknown'),
          });
          const throttleRetry = String(effectiveAzureErr instanceof Error ? effectiveAzureErr.message : effectiveAzureErr || '')
            .toLowerCase()
            .includes('tts_throttled_429');
          const maxRetries = shouldRetryAzureChunk(effectiveAzureErr)
            ? (throttleRetry ? 2 : 1)
            : 0;

          for (let retry = 0; retry < maxRetries && !stopRequestedRef.current; retry += 1) {
            const baseDelay = throttleRetry ? 420 : 280;
            const jitter = Math.floor(Math.random() * (throttleRetry ? 260 : 120));
            try {
              await new Promise((resolve) => setTimeout(resolve, baseDelay + jitter));
              cloudAttempted = true;
              const retryUrl = await requestAzureAudioUrl(chunk, effectiveLanguage, effectiveOptions, cachedToken);
              ensurePrefetch(ci + 1);
              await playAudioUrl(retryUrl, estimatePlaybackTimeoutMs(chunk));
              anyChunkSucceeded = true;
              cloudChunkSucceeded = true;
              effectiveAzureErr = null;
              break;
            } catch (retryErr) {
              effectiveAzureErr = retryErr;
            }
          }

          if (!effectiveAzureErr) {
            continue;
          }

          if (phonicsMode && !ALLOW_DEVICE_FALLBACK_IN_PHONICS) {
            const phonicsErr = effectiveAzureErr instanceof Error
              ? new Error(`PHONICS_REQUIRES_AZURE:${effectiveAzureErr.message}`)
              : new Error('PHONICS_REQUIRES_AZURE');
            console.warn('[VoiceTTS] Azure chunk failed in phonics mode; device fallback disabled:', effectiveAzureErr);
            reportTTSError(phonicsErr);
            lastErr = phonicsErr;
            telemetryError = phonicsErr;
            fallbackUsed = 'phonics_blocked';
            break;
          }

          console.warn('[VoiceTTS] Azure chunk failed; trying device fallback:', effectiveAzureErr);
          reportTTSError(effectiveAzureErr);
          fallbackUsed = 'device';
          try {
            await speakWithDeviceTTS(chunk, effectiveLanguage, {
              ...effectiveOptions,
            });
            anyChunkSucceeded = true;
            logVoiceTrace('tts_chunk_done', {
              index: ci + 1,
              total: chunks.length,
              transport: 'device_fallback',
              chars: chunk.length,
              totalMs: Date.now() - chunkStartedAt,
            });
          } catch (deviceErr) {
            console.warn('[VoiceTTS] Device fallback also failed:', deviceErr);
            reportTTSError(deviceErr);
            lastErr = deviceErr instanceof Error ? deviceErr : new Error(String(deviceErr));
            telemetryError = lastErr;
            // Continue — partial speech is better than none
          }
        }
      }

      // If no chunks played, rethrow so the caller can show a user-facing message
      if (!anyChunkSucceeded && lastErr) {
        telemetryError = lastErr;
        throw lastErr;
      }

      if (!policy.isPremiumTier && cloudChunkSucceeded) {
        await consumePremiumVoiceActivity(user?.id);
      }

      const successDiagnostics = parseTTSDiagnostics(telemetryError);
      track('edudash.voice.tts_turn', {
        tier: tier || 'free',
        capability_tier: policy.capabilityTier,
        cloud_attempted: cloudAttempted,
        fallback_used: fallbackUsed,
        error_code: successDiagnostics.errorCode || null,
        upstream_status: successDiagnostics.statusCode || null,
        request_id: successDiagnostics.requestId || null,
        success: true,
      });
      logVoiceTrace('tts_done', {
        mode: cloudChunkSucceeded ? 'azure' : fallbackUsed || 'device',
        durationMs: Date.now() - speechStartedAt,
        chunksSpoken: chunks.length,
      });
      
    } catch (err) {
      console.error('[VoiceTTS] Error:', err);
      reportTTSError(err);
      const diagnostics = parseTTSDiagnostics(err);
      track('edudash.voice.tts_turn', {
        tier: tier || 'free',
        capability_tier: resolveCapabilityTier(String(tier || 'free')),
        cloud_attempted: true,
        fallback_used: 'none',
        error_code: diagnostics.errorCode || null,
        upstream_status: diagnostics.statusCode || null,
        request_id: diagnostics.requestId || null,
        success: false,
      });
    } finally {
      setIsSpeaking(false);
    }
  }, [
    stopPlayback,
    getSessionTokenCached,
    requestAzureAudioUrl,
    playAudioUrl,
    estimatePlaybackTimeoutMs,
    buildFastStartChunks,
    speakWithDeviceTTS,
    reportTTSError,
    resolveSessionVoice,
    profile?.role,
    tier,
    user?.id,
  ]);

  return { speak, stop, isSpeaking, error };
}

export default useVoiceTTS;
