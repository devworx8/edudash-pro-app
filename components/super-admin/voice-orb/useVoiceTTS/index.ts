/**
 * useVoiceTTS — Text-to-Speech hook.
 *
 * Orchestrates Azure TTS (primary) + device fallback.
 * Long responses are chunked so the first audio starts sooner.
 * Includes voice preference resolution and phonics mode support.
 *
 * @module components/super-admin/voice-orb/useVoiceTTS
 */

import { useState, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import * as Speech from 'expo-speech';
import { assertSupabase } from '../../../../lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { normalizeForTTS } from '@/lib/dash-ai/ttsNormalize';
import { shouldUsePhonicsMode } from '@/lib/dash-ai/phonicsDetection';
import { track } from '@/lib/analytics';
import { resolveCapabilityTier } from '@/lib/tiers/resolveEffectiveTier';
import { getFeatureFlagsSync } from '@/lib/featureFlags';
import { trackTutorVoicePreferenceApplied } from '@/lib/ai/trackingEvents';
import { getPersonality, getVoicePrefs } from '@/lib/ai/dashSettings';
import type { VoicePreference } from '@/lib/voice/types';
import { consumePremiumVoiceActivity, getVoicePolicyDecision } from '@/lib/dash-ai/voicePolicy';
import { getCachedToken, setCachedToken } from '@/lib/voice/sessionTokenCache';
import type { SupportedLanguage } from '../useVoiceSTT';

import type { TTSOptions, UseVoiceTTSReturn, TTSErrorCategory } from './types';
import {
  DEFAULT_AZURE_RATE, DEFAULT_PHONICS_AZURE_RATE, DEFAULT_DEVICE_RATE, DEFAULT_PHONICS_DEVICE_RATE,
  ALLOW_DEVICE_FALLBACK_IN_PHONICS, TTS_PROXY_TIMEOUT_DEFAULT_MS,
  resolveAzureVoiceId, resolveEffectiveVoiceId, normalizeVoiceGender, mapToDeviceLocale,
  resolveDeviceRate, shouldRetryAzureChunk, parseTTSDiagnostics,
  pickDeviceVoiceIdentifier, prepareDevicePhonicsText,
  categorizeTTSError, getTTSErrorMessage,
} from './ttsUtils';
import { useVoiceTTSPlayback } from './useVoiceTTSPlayback';

export { resolveEffectiveVoiceId } from './ttsUtils';
export type { TTSOptions, UseVoiceTTSReturn, TTSErrorCategory, EffectiveVoiceResolution } from './types';

// Increased chunk sizes to reduce the number of Azure TTS requests per response.
// Fewer requests = fewer potential timeouts. First chunk ~200 gives fast initial audio;
// follow-up chunks up to 700 chars keep total request count to 1-2 for most responses.
const FIRST_CHUNK_TARGET_CHARS = 200;
const FOLLOW_UP_CHUNK_MAX_CHARS = 700;

const normalizeChunkWhitespace = (text: string): string =>
  String(text || '').replace(/\s+/g, ' ').trim();

const splitChunkByWords = (text: string, maxChars: number): string[] => {
  const words = normalizeChunkWhitespace(text).split(' ').filter(Boolean);
  if (words.length === 0) return [];

  const chunks: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars || !current) {
      current = candidate;
      continue;
    }
    chunks.push(current.trim());
    current = word;
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
};

const splitTextForCloudTTS = (text: string, phonicsMode: boolean): string[] => {
  const normalized = normalizeChunkWhitespace(text);
  if (!normalized) return [];
  if (phonicsMode || normalized.length <= FIRST_CHUNK_TARGET_CHARS) return [normalized];

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (sentences.length <= 1) {
    return splitChunkByWords(normalized, FOLLOW_UP_CHUNK_MAX_CHARS);
  }

  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    const maxChars = chunks.length === 0 ? FIRST_CHUNK_TARGET_CHARS : FOLLOW_UP_CHUNK_MAX_CHARS;
    const candidate = current ? `${current} ${sentence}` : sentence;

    if (candidate.length <= maxChars || (chunks.length === 0 && current.length < 110)) {
      current = candidate;
      continue;
    }

    if (current.trim()) {
      chunks.push(current.trim());
    }

    if (sentence.length <= maxChars) {
      current = sentence;
      continue;
    }

    const overflowChunks = splitChunkByWords(sentence, maxChars);
    if (overflowChunks.length === 0) {
      current = '';
      continue;
    }

    chunks.push(...overflowChunks.slice(0, -1));
    current = overflowChunks[overflowChunks.length - 1] || '';
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks.filter(Boolean);
};

export function useVoiceTTS(): UseVoiceTTSReturn {
  const { user, profile } = useAuth();
  const { tier } = useSubscription();
  const VOICE_TRACE_ENABLED = __DEV__ || process.env.EXPO_PUBLIC_DASH_VOICE_TRACE === 'true';

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopRequestedRef = useRef(false);
  const reportedErrorCategoriesRef = useRef<Set<TTSErrorCategory>>(new Set());
  const cachedVoicePreferenceRef = useRef<VoicePreference | null | undefined>(undefined);
  const cachedAISettingsVoiceRef = useRef<string | null | undefined>(undefined);
  const lastAppliedVoiceSignatureRef = useRef<string | null>(null);

  const { stopPlayback, playAudioUrl, estimatePlaybackTimeoutMs } = useVoiceTTSPlayback();

  const logVoiceTrace = useCallback((event: string, payload?: Record<string, unknown>) => {
    if (!VOICE_TRACE_ENABLED) return;
    console.log(`[VoiceTTSTrace] ${event}`, payload || {});
  }, [VOICE_TRACE_ENABLED]);

  // ── Session token (shared cache with STT) ─────────────────────────────────
  const getSessionTokenCached = useCallback(async (): Promise<string> => {
    const cached = getCachedToken();
    if (cached) return cached;
    const supabase = assertSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('AUTH_MISSING');
    setCachedToken(session.access_token);
    return session.access_token;
  }, []);

  const stop = useCallback(async () => {
    stopRequestedRef.current = true;
    await stopPlayback();
    setIsSpeaking(false);
  }, [stopPlayback]);

  const reportTTSError = useCallback((reason: unknown) => {
    const category = categorizeTTSError(reason);
    if (reportedErrorCategoriesRef.current.has(category)) return category;
    reportedErrorCategoriesRef.current.add(category);
    setError(getTTSErrorMessage(category));
    return category;
  }, []);

  // ── Voice preference resolution ───────────────────────────────────────────
  const getCachedVoicePreference = useCallback(async (): Promise<VoicePreference | null> => {
    if (cachedVoicePreferenceRef.current !== undefined) return cachedVoicePreferenceRef.current;
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
    if (cachedAISettingsVoiceRef.current !== undefined) return cachedAISettingsVoiceRef.current;
    try {
      const personality = getPersonality?.();
      const voiceValue = String(
        personality?.voice_settings?.voice_id || personality?.voice_settings?.voice || personality?.voice || ''
      ).trim();
      cachedAISettingsVoiceRef.current = voiceValue || null;
      return cachedAISettingsVoiceRef.current;
    } catch {
      cachedAISettingsVoiceRef.current = null;
      return null;
    }
  }, []);

  const resolveSessionVoice = useCallback(async (language: string, requestOverride?: unknown) => {
    const flags = getFeatureFlagsSync();
    const fallbackGender = normalizeVoiceGender((profile as any)?.voice_gender || (profile as any)?.gender);
    if (!flags.dash_tutor_voice_sticky_v1) {
      return resolveEffectiveVoiceId({ language, requestOverride, fallbackGender });
    }
    const [voicePreference, aiSettingsVoice] = await Promise.all([
      getCachedVoicePreference(),
      Promise.resolve(getCachedAISettingsVoice()),
    ]);
    return resolveEffectiveVoiceId({
      language, requestOverride,
      preferenceVoiceId: voicePreference?.voice_id,
      aiSettingsVoice, fallbackGender,
    });
  }, [getCachedAISettingsVoice, getCachedVoicePreference, profile]);

  // ── Device TTS ────────────────────────────────────────────────────────────
  const speakWithDeviceTTS = useCallback(async (
    text: string, language: string, options: TTSOptions = {},
  ): Promise<void> => {
    const locale = mapToDeviceLocale(language);
    const phonicsMode = options.phonicsMode === true;
    const effectiveRate = resolveDeviceRate(options.rate, phonicsMode ? DEFAULT_PHONICS_DEVICE_RATE : DEFAULT_DEVICE_RATE);
    const safePitch = Number(options.pitch);
    const effectivePitch = Number.isFinite(safePitch) ? Math.max(0.5, Math.min(safePitch, 2.0)) : 1.0;
    const spokenText = phonicsMode ? prepareDevicePhonicsText(text) : text;
    const selectedVoice = await pickDeviceVoiceIdentifier(locale, options.voice);
    await stopPlayback();
    if (Platform.OS === 'android') await new Promise(r => setTimeout(r, 150));
    await new Promise<void>((resolve, reject) => {
      const safetyTimer = setTimeout(() => { console.warn('[VoiceTTS] Device TTS safety timeout'); resolve(); }, 30000);
      const deviceOptions: Speech.SpeechOptions = {
        language: locale, rate: effectiveRate, pitch: effectivePitch,
        onDone: () => { clearTimeout(safetyTimer); resolve(); },
        onStopped: () => { clearTimeout(safetyTimer); resolve(); },
        onError: (err) => { clearTimeout(safetyTimer); reject(err instanceof Error ? err : new Error('DEVICE_TTS_FAILED')); },
      };
      if (selectedVoice) deviceOptions.voice = selectedVoice;
      Speech.speak(spokenText, deviceOptions);
    });
  }, [stopPlayback]);

  // ── Azure TTS ─────────────────────────────────────────────────────────────
  const requestAzureAudioUrl = useCallback(async (
    cleanText: string, language: SupportedLanguage, options: TTSOptions = {}, cachedToken?: string,
  ): Promise<string> => {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) throw new Error('SERVICE_UNCONFIGURED_SUPABASE_URL');
    const token = cachedToken || await getSessionTokenCached();
    const langCode = language.split('-')[0] as 'en' | 'af' | 'zu';
    const phonicsMode = options.phonicsMode === true;
    const voiceId = resolveAzureVoiceId(langCode, options.voice);
    const effectiveRate = Number.isFinite(options.rate as number)
      ? Number(options.rate) : (phonicsMode ? DEFAULT_PHONICS_AZURE_RATE : DEFAULT_AZURE_RATE);
    const effectivePitch = Number.isFinite(options.pitch as number) ? Number(options.pitch) : 0;
    const timeoutRaw = Number.parseInt(String(process.env.EXPO_PUBLIC_TTS_PROXY_TIMEOUT_MS || String(TTS_PROXY_TIMEOUT_DEFAULT_MS)), 10);
    const requestTimeoutMs = Number.isFinite(timeoutRaw) ? Math.min(12000, Math.max(1800, timeoutRaw)) : TTS_PROXY_TIMEOUT_DEFAULT_MS;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);

    let response: Response;
    try {
      response = await fetch(`${supabaseUrl}/functions/v1/tts-proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ text: cleanText, lang: langCode, voice_id: voiceId, rate: effectiveRate, pitch: effectivePitch, style: 'friendly', phonics_mode: phonicsMode, format: 'mp3' }),
        signal: controller.signal,
      });
    } catch (networkError) {
      if (networkError instanceof Error && networkError.name === 'AbortError') throw new Error(`NETWORK_TIMEOUT_${requestTimeoutMs}MS`);
      throw new Error(`NETWORK_ERROR:${networkError instanceof Error ? networkError.message : String(networkError)}`);
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const status = response.status;
      const requestId = response.headers.get('sb-request-id') || response.headers.get('x-sb-request-id') || '';
      let backendDetails = '';
      try {
        const bodyText = await response.text();
        if (bodyText) {
          try {
            const payload = JSON.parse(bodyText) as { error?: string; error_code?: string; details?: string; provider?: string; fallback?: string; upstream_status?: number };
            backendDetails = [payload.error || '', payload.error_code ? `error_code=${payload.error_code}` : '', payload.details || '', payload.provider ? `provider=${payload.provider}` : '', payload.fallback ? `fallback=${payload.fallback}` : '', Number.isFinite(payload.upstream_status) ? `upstream_status=${payload.upstream_status}` : ''].filter(Boolean).join(' | ');
          } catch { backendDetails = bodyText.slice(0, 260); }
        }
      } catch { /* ignore */ }
      const diagnostic = [requestId ? `req=${requestId}` : '', backendDetails ? `details=${backendDetails}` : ''].filter(Boolean).join(' | ');
      if (status === 401 || status === 403) throw new Error(`AUTH_MISSING_${status}${diagnostic ? `:${diagnostic}` : ''}`);
      if (status === 429) throw new Error(`TTS_THROTTLED_429${diagnostic ? `:${diagnostic}` : ''}`);
      if (status === 503) throw new Error(`SERVICE_UNAVAILABLE_503${diagnostic ? `:${diagnostic}` : ''}`);
      if (status === 500) throw new Error(`SERVICE_INTERNAL_500${diagnostic ? `:${diagnostic}` : ''}`);
      if (status >= 500 || status === 404 || status === 422) throw new Error(`SERVICE_UNCONFIGURED_${status}${diagnostic ? `:${diagnostic}` : ''}`);
      throw new Error(`NETWORK_ERROR_STATUS_${status}${diagnostic ? `:${diagnostic}` : ''}`);
    }

    const data = await response.json();
    if (data?.fallback === 'device') throw new Error('SERVICE_UNCONFIGURED_DEVICE_FALLBACK');
    if (!data?.audio_url) throw new Error('SERVICE_UNCONFIGURED_NO_AUDIO_URL');
    return data.audio_url;
  }, [getSessionTokenCached]);

  // ── Main speak orchestration ──────────────────────────────────────────────
  const speak = useCallback(async (
    text: string,
    language: SupportedLanguage = 'en-ZA',
    options: TTSOptions = {},
  ) => {
    stopRequestedRef.current = false;
    setIsSpeaking(true);
    setError(null);
    reportedErrorCategoriesRef.current.clear();

    try {
      await stopPlayback();
      const policy = await getVoicePolicyDecision({ role: profile?.role, profileTier: tier }, user?.id);
      let cloudAttempted = false;
      let fallbackUsed: 'none' | 'device' | 'phonics_blocked' = 'none';
      let telemetryError: unknown = null;

      const SUPPORTED_TTS_LANGS = ['en', 'af', 'zu', 'xh', 'nso', 'st', 'fr', 'pt', 'es', 'de'];
      const baseLang = language.split('-')[0];
      const phonicsMode = typeof options.phonicsMode === 'boolean' ? options.phonicsMode : shouldUsePhonicsMode(text);
      const resolvedVoice = await resolveSessionVoice(language, options.voice);
      const effectiveOptions: TTSOptions = { ...options, voice: resolvedVoice.voiceId, phonicsMode };

      const voiceSignature = `${language}|${resolvedVoice.source}|${resolvedVoice.voiceId}`;
      if (lastAppliedVoiceSignatureRef.current !== voiceSignature) {
        lastAppliedVoiceSignatureRef.current = voiceSignature;
        trackTutorVoicePreferenceApplied({ voiceId: resolvedVoice.voiceId, source: resolvedVoice.source, language, role: String(profile?.role || 'unknown') });
      }

      if (!SUPPORTED_TTS_LANGS.includes(baseLang)) {
        fallbackUsed = 'device';
        await speakWithDeviceTTS(text, language, effectiveOptions);
        return;
      }

      const cleanText = normalizeForTTS(text, { phonicsMode, preservePhonicsMarkers: phonicsMode });
      if (!cleanText) { setIsSpeaking(false); return; }

      const speechStartedAt = Date.now();
      const azureRate = Number.isFinite(effectiveOptions.rate as number)
        ? Number(effectiveOptions.rate) : (phonicsMode ? DEFAULT_PHONICS_AZURE_RATE : DEFAULT_AZURE_RATE);
      logVoiceTrace('tts_start', { language, voiceId: effectiveOptions.voice || 'default', phonicsMode, rate: azureRate, chars: cleanText.length });

      const cachedToken = await getSessionTokenCached();

      // ── Device-only path ─────────────────────────────────────────────────
      if (!policy.shouldUseCloudVoice) {
        reportTTSError(new Error('FREE_QUOTA_EXHAUSTED_DEVICE_VOICE'));
        fallbackUsed = 'device';
        await speakWithDeviceTTS(cleanText, language, effectiveOptions);
        logVoiceTrace('tts_done', { mode: 'device_only', durationMs: Date.now() - speechStartedAt });
        return;
      }

      // ── Cloud path — chunk long responses so first audio is ready sooner ──
      let anyChunkSucceeded = false, cloudChunkSucceeded = false;
      let lastErr: Error | null = null;
      let firstAudioReadyAt: number | null = null;
      const cloudChunks = splitTextForCloudTTS(cleanText, phonicsMode);

      if (stopRequestedRef.current) return;

      cloudAttempted = true;

      for (let chunkIndex = 0; chunkIndex < cloudChunks.length; chunkIndex += 1) {
        if (stopRequestedRef.current) break;

        const chunkText = cloudChunks[chunkIndex];

        try {
          const requestStartedAt = Date.now();
          const audioUrl = await requestAzureAudioUrl(chunkText, language, effectiveOptions, cachedToken);
          const audioReadyAt = Date.now();
          if (firstAudioReadyAt == null) {
            firstAudioReadyAt = audioReadyAt;
            logVoiceTrace('tts_audio_ready', {
              timeToAudioReadyMs: firstAudioReadyAt - speechStartedAt,
              requestMs: firstAudioReadyAt - requestStartedAt,
              chunkIndex,
              chunkCount: cloudChunks.length,
            });
          }
          if (!stopRequestedRef.current) {
            await playAudioUrl(audioUrl, estimatePlaybackTimeoutMs(chunkText));
            anyChunkSucceeded = true;
            cloudChunkSucceeded = true;
          }
        } catch (azureErr) {
          let effectiveErr: unknown = azureErr;
          logVoiceTrace('tts_error', {
            error: String(azureErr instanceof Error ? azureErr.message : azureErr || 'unknown'),
            chunkIndex,
            chunkCount: cloudChunks.length,
          });
          if (shouldRetryAzureChunk(effectiveErr) && !stopRequestedRef.current) {
            const throttleRetry = String(effectiveErr instanceof Error ? effectiveErr.message : effectiveErr || '').toLowerCase().includes('tts_throttled_429');
            const delay = throttleRetry ? 500 : 300;
            try {
              await new Promise(r => setTimeout(r, delay));
              const retryUrl = await requestAzureAudioUrl(chunkText, language, effectiveOptions, cachedToken);
              if (!stopRequestedRef.current) {
                await playAudioUrl(retryUrl, estimatePlaybackTimeoutMs(chunkText));
                anyChunkSucceeded = true;
                cloudChunkSucceeded = true;
                effectiveErr = null;
              }
            } catch (retryErr) {
              effectiveErr = retryErr;
            }
          }

          if (!effectiveErr) {
            continue;
          }

          if (phonicsMode && !ALLOW_DEVICE_FALLBACK_IN_PHONICS) {
            const phonicsErr = effectiveErr instanceof Error ? new Error(`PHONICS_REQUIRES_AZURE:${effectiveErr.message}`) : new Error('PHONICS_REQUIRES_AZURE');
            reportTTSError(phonicsErr);
            lastErr = phonicsErr;
            telemetryError = phonicsErr;
            fallbackUsed = 'phonics_blocked';
            break;
          }

          reportTTSError(effectiveErr);
          fallbackUsed = 'device';
          try {
            const remainingText = cloudChunks.slice(chunkIndex).join(' ').trim();
            await speakWithDeviceTTS(remainingText || chunkText, language, effectiveOptions);
            anyChunkSucceeded = true;
            telemetryError = effectiveErr;
          } catch (deviceErr) {
            reportTTSError(deviceErr);
            lastErr = deviceErr instanceof Error ? deviceErr : new Error(String(deviceErr));
            telemetryError = lastErr;
          }
          break;
        }
      }

      if (!anyChunkSucceeded && lastErr) { telemetryError = lastErr; throw lastErr; }
      if (!policy.isPremiumTier && cloudChunkSucceeded) await consumePremiumVoiceActivity(user?.id);

      const successDiagnostics = parseTTSDiagnostics(telemetryError);
      track('edudash.voice.tts_turn', { tier: tier || 'free', capability_tier: policy.capabilityTier, cloud_attempted: cloudAttempted, fallback_used: fallbackUsed, error_code: successDiagnostics.errorCode || null, upstream_status: successDiagnostics.statusCode || null, request_id: successDiagnostics.requestId || null, success: true });
      logVoiceTrace('tts_done', { mode: cloudChunkSucceeded ? 'azure' : fallbackUsed || 'device', durationMs: Date.now() - speechStartedAt });

    } catch (err) {
      console.error('[VoiceTTS] Error:', err);
      reportTTSError(err);
      const diagnostics = parseTTSDiagnostics(err);
      track('edudash.voice.tts_turn', { tier: tier || 'free', capability_tier: resolveCapabilityTier(String(tier || 'free')), cloud_attempted: true, fallback_used: 'none', error_code: diagnostics.errorCode || null, upstream_status: diagnostics.statusCode || null, request_id: diagnostics.requestId || null, success: false });
    } finally {
      setIsSpeaking(false);
    }
  }, [
    stopPlayback, getSessionTokenCached, requestAzureAudioUrl, playAudioUrl,
    estimatePlaybackTimeoutMs, speakWithDeviceTTS, reportTTSError, resolveSessionVoice,
    logVoiceTrace, profile?.role, tier, user?.id,
  ]);

  return { speak, stop, isSpeaking, error };
}

export default useVoiceTTS;
