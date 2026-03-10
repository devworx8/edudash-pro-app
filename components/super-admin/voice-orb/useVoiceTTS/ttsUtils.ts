/**
 * useVoiceTTS — pure helper functions, constants, and error classification.
 * @module components/super-admin/voice-orb/useVoiceTTS/ttsUtils
 */

import * as Speech from 'expo-speech';
import { getVoiceIdForLanguage } from '@/lib/voice/voiceMapping';
import {
  AZURE_RATE_NORMAL,
  AZURE_RATE_PHONICS,
  DEVICE_RATE_NORMAL,
  DEVICE_RATE_PHONICS,
} from '@/lib/dash-ai/ttsConstants';
import type { TTSErrorCategory, EffectiveVoiceResolution, VoiceResolutionSource } from './types';

// ── Constants ─────────────────────────────────────────────────────────────────

export const DEFAULT_AZURE_RATE = AZURE_RATE_NORMAL;
export const DEFAULT_PHONICS_AZURE_RATE = AZURE_RATE_PHONICS;
export const DEFAULT_DEVICE_RATE = DEVICE_RATE_NORMAL;
export const DEFAULT_PHONICS_DEVICE_RATE = DEVICE_RATE_PHONICS;
export const ALLOW_DEVICE_FALLBACK_IN_PHONICS =
  process.env.EXPO_PUBLIC_ALLOW_DEVICE_FALLBACK_IN_PHONICS === 'true';
export const TTS_FAST_START_FIRST_CHUNK_MAX_CHARS = 200;
export const TTS_FAST_START_FIRST_CHUNK_MAX_SENTENCES = 1;
export const TTS_PROXY_TIMEOUT_DEFAULT_MS = 3200;
export const TTS_PREFETCH_ENABLED = true;
export const TTS_PARALLEL_PREFETCH_THRESHOLD_MS = 800;

export const VOICE_ID_PATTERN = /^[a-z]{2}-[a-z]{2}-[a-z0-9-]+neural$/i;

export const DEVICE_PHONICS_SOUND_MAP: Record<string, string> = {
  a: 'ah', b: 'buh', c: 'kuh', d: 'duh', e: 'eh', f: 'ffffff', g: 'guh',
  h: 'hhhhhh', i: 'ih', j: 'juh', k: 'kuh', l: 'llllll', m: 'mmmmmm',
  n: 'nnnnnn', o: 'aw', p: 'puh', q: 'kuh', r: 'rrrrrr', s: 'ssssss',
  t: 'tuh', u: 'uh', v: 'vvvvvv', w: 'wuh', x: 'ks', y: 'yuh', z: 'zzzzzz',
  sh: 'shhhhh', ch: 'chhhhh', th: 'thhhhh', ph: 'ffffff', ng: 'nggggg',
};

// ── Voice helpers ─────────────────────────────────────────────────────────────

export const normalizeVoiceGender = (value: unknown): 'male' | 'female' =>
  String(value || '').toLowerCase() === 'male' ? 'male' : 'female';

export const normalizeLanguageBase = (language: string): string =>
  String(language || 'en').toLowerCase().split('-')[0].trim() || 'en';

export const resolveLocaleDefaultVoice = (
  language: string,
  fallbackGender: 'male' | 'female',
): string => getVoiceIdForLanguage(language, fallbackGender);

export const isVoiceId = (value: unknown): boolean =>
  typeof value === 'string' && VOICE_ID_PATTERN.test(String(value || '').trim());

export const voiceIdMatchesLanguage = (voiceId: string, language: string): boolean => {
  const prefix = String(voiceId || '').split('-')[0]?.toLowerCase() || '';
  return prefix === normalizeLanguageBase(language);
};

export function resolveEffectiveVoiceId(input: {
  language: string;
  requestOverride?: unknown;
  preferenceVoiceId?: unknown;
  aiSettingsVoice?: unknown;
  fallbackGender?: 'male' | 'female';
}): EffectiveVoiceResolution {
  const fallbackGender = input.fallbackGender
    ? normalizeVoiceGender(input.fallbackGender)
    : normalizeLanguageBase(input.language) === 'en' ? 'male' : 'female';
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
        return { voiceId: value, source: candidate.source, fallbackGender };
      }
      continue;
    }
    const lower = value.toLowerCase();
    if (lower === 'male' || lower === 'female') {
      return {
        voiceId: resolveLocaleDefaultVoice(base, normalizeVoiceGender(lower)),
        source: candidate.source,
        fallbackGender: normalizeVoiceGender(lower),
      };
    }
  }

  return { voiceId: localeDefault, source: 'locale_default', fallbackGender };
}

export const resolveAzureVoiceId = (
  language: string,
  preferredVoice?: unknown,
): string | undefined => resolveEffectiveVoiceId({ language, requestOverride: preferredVoice }).voiceId;

export const mapToDeviceLocale = (language: string): string => {
  const normalized = (language || 'en-ZA').toLowerCase();
  if (normalized.startsWith('af')) return 'af-ZA';
  if (normalized.startsWith('zu')) return 'zu-ZA';
  return 'en-ZA';
};

export const clampDeviceRate = (rate: number): number => Math.max(0.5, Math.min(rate, 2.0));

export const resolveDeviceRate = (rate: unknown, defaultRate: number): number => {
  const parsed = Number(rate);
  if (!Number.isFinite(parsed)) return defaultRate;
  if (parsed >= 0.5 && parsed <= 2.0) return clampDeviceRate(parsed);
  if (parsed >= -100 && parsed <= 100) return clampDeviceRate(1 + parsed / 100);
  return defaultRate;
};

export const shouldRetryAzureChunk = (error: unknown): boolean => {
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

export const parseTTSDiagnostics = (reason: unknown) => {
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

export const pickDeviceVoiceIdentifier = async (
  locale: string,
  preferredVoice?: unknown,
): Promise<string | undefined> => {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const langBase = String(locale || 'en-ZA').split('-')[0].toLowerCase();
    const matching = voices.filter((v) => String(v.language || '').toLowerCase().startsWith(langBase));
    if (matching.length === 0) return undefined;
    const preferredValue = String(preferredVoice || '').trim();
    if (isVoiceId(preferredValue)) {
      const exact = matching.find(
        (v) => String(v.identifier || '').toLowerCase() === preferredValue.toLowerCase(),
      );
      if (exact?.identifier) return exact.identifier;
    }
    const target = normalizeVoiceGender(preferredVoice);
    if (target === 'male') {
      const male = matching.find(
        (v) => String(v.name || '').toLowerCase().includes('male') || (v as any)?.gender === 'male',
      );
      return male?.identifier || matching[0]?.identifier;
    }
    const female = matching.find(
      (v) => String(v.name || '').toLowerCase().includes('female') || (v as any)?.gender === 'female',
    );
    return female?.identifier || matching[0]?.identifier;
  } catch {
    return undefined;
  }
};

export const prepareDevicePhonicsText = (text: string): string => {
  let next = String(text || '');
  next = next.replace(/\/([a-z]{1,8})\//gi, (_m, token: string) => {
    const key = String(token || '').toLowerCase();
    return DEVICE_PHONICS_SOUND_MAP[key] || key;
  });
  next = next.replace(/\[([a-z]{1,8})\]/gi, (_m, token: string) => {
    const key = String(token || '').toLowerCase();
    return DEVICE_PHONICS_SOUND_MAP[key] || key;
  });
  next = next.replace(/\b([a-z](?:-[a-z]){1,7})\b/gi, (token) => {
    const letters = token.split('-').map((v) => v.trim().toLowerCase()).filter(Boolean);
    if (letters.some((v) => v.length !== 1)) return token;
    return letters.map((l) => DEVICE_PHONICS_SOUND_MAP[l] || l).join(' . ');
  });
  next = next.replace(/[/[\]]/g, ' ');
  return next;
};

// ── Error classification (restored from original) ─────────────────────────────

export const categorizeTTSError = (error: unknown): TTSErrorCategory => {
  const message = error instanceof Error ? error.message : String(error || '');
  const n = message.toLowerCase();
  if (n.includes('free_quota_exhausted') || n.includes('premium voice quota')) return 'quota_exhausted';
  if (n.includes('auth_missing') || n.includes('no session') || n.includes('401') || n.includes('403')) return 'auth_missing';
  if (n.includes('phonics_requires_azure') || n.includes('phonics mode requires azure') || n.includes('phonics_needs_azure')) return 'phonics_requires_azure';
  if (n.includes('tts_throttled') || n.includes('too many requests') || n.includes('429')) return 'throttled';
  if (n.includes('service_unconfigured') || n.includes('service_unavailable') || n.includes('tts unavailable') || n.includes('supabase_url') || n.includes('not configured')) return 'service_unconfigured';
  if (n.includes('audio_player') || n.includes('playback') || n.includes('device_tts_failed')) return 'playback_error';
  if (n.includes('network') || n.includes('fetch') || n.includes('timeout') || n.includes('econn') || n.includes('enotfound')) return 'network_error';
  return 'unknown';
};

export const getTTSErrorMessage = (category: TTSErrorCategory): string => {
  switch (category) {
    case 'quota_exhausted': return 'Premium voice limit reached. Using standard voice until reset.';
    case 'auth_missing': return 'Voice needs an active login session.';
    case 'throttled': return 'Voice is busy right now. Retrying shortly.';
    case 'phonics_requires_azure': return 'Phonics voice needs cloud TTS. Please check connection and retry.';
    case 'service_unconfigured': return 'Voice service is unavailable. Using device voice.';
    case 'network_error': return 'Network issue detected. Using device voice.';
    case 'playback_error': return 'Audio playback failed. Using device voice.';
    default: return 'Voice is temporarily unavailable.';
  }
};

// ── Chunking utilities ────────────────────────────────────────────────────────

export const splitIntoChunks = (text: string, maxLength: number): string[] => {
  const sentences: string[] = [];
  let buffer = '';
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    buffer += char;
    if ((char === '.' || char === '!' || char === '?') && buffer.trim()) {
      sentences.push(buffer.trim());
      buffer = '';
    }
  }
  if (buffer.trim()) sentences.push(buffer.trim());

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
  if (chunks.length === 0) return text.length > 0 ? [text] : [];

  const normalized: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length <= maxLength) { normalized.push(chunk); }
    else { for (let i = 0; i < chunk.length; i += maxLength) normalized.push(chunk.slice(i, i + maxLength)); }
  }
  return normalized;
};

export const buildFastStartChunks = (text: string, maxLength: number): string[] => {
  const baseChunks = splitIntoChunks(text, maxLength);
  if (baseChunks.length === 0) return [];
  const firstChunk = String(baseChunks[0] || '').trim();
  if (!firstChunk || firstChunk.length <= TTS_FAST_START_FIRST_CHUNK_MAX_CHARS) return baseChunks;

  const sentences = firstChunk.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
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
  if (!fastStartChunk || fastStartChunk.length >= firstChunk.length) return baseChunks;

  const firstRemainder = firstChunk.slice(fastStartChunk.length).trim();
  const remainingText = [firstRemainder, ...baseChunks.slice(1)]
    .map((c) => String(c || '').trim()).filter(Boolean).join(' ').trim();
  return [fastStartChunk, ...splitIntoChunks(remainingText, maxLength)];
};
