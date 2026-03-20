/**
 * Voice-to-Text Transcription Hook (M14)
 *
 * Transcribes voice messages using the stt-proxy edge function.
 * Caches transcriptions in AsyncStorage for persistence across sessions.
 * Supports auto-transcribe for incoming voice messages.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { assertSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import * as Sentry from '@sentry/react-native';
import { resolveAudioPayload } from './voiceTranscriptionUtils';

const CACHE_PREFIX = 'voice_transcript:';

interface UseVoiceTranscriptionReturn {
  transcribeVoice: (audioUrl: string, messageId?: string) => Promise<string>;
  transcriptions: Map<string, string>;
  transcribing: Set<string>;
  autoTranscribeVoice: (audioUrl: string, messageId: string) => void;
}

export function useVoiceTranscription(): UseVoiceTranscriptionReturn {
  const [transcriptions, setTranscriptions] = useState<Map<string, string>>(new Map());
  const [transcribing, setTranscribing] = useState<Set<string>>(new Set());
  const inflightRef = useRef<Map<string, Promise<string>>>(new Map());
  const functionUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/stt-proxy`;

  // Load cached transcriptions on mount
  useEffect(() => {
    (async () => {
      try {
        const keys = await AsyncStorage.getAllKeys();
        const transcriptKeys = keys.filter((k) => k.startsWith(CACHE_PREFIX));
        if (transcriptKeys.length === 0) return;
        const entries = await AsyncStorage.multiGet(transcriptKeys);
        const loaded = new Map<string, string>();
        for (const [key, value] of entries) {
          if (value) loaded.set(key.slice(CACHE_PREFIX.length), value);
        }
        if (loaded.size > 0) {
          setTranscriptions((prev) => new Map([...prev, ...loaded]));
        }
      } catch {
        // Non-critical — transcriptions just won't be pre-loaded
      }
    })();
  }, []);

  const transcribeVoice = useCallback(
    async (audioUrl: string, messageId?: string): Promise<string> => {
      const cacheKey = messageId || audioUrl;

      const cached = transcriptions.get(cacheKey);
      if (cached) return cached;

      const inflight = inflightRef.current.get(cacheKey);
      if (inflight) return inflight;

      const MAX_RETRIES = 2;
      let attempt = 0;
      let lastError: any = null;

      const promise = (async () => {
        setTranscribing((prev) => new Set(prev).add(cacheKey));

        const bodyPayload = await resolveAudioPayload(audioUrl);

        while (attempt <= MAX_RETRIES) {
          try {
            const client = assertSupabase();
            const { data: { session } } = await client.auth.getSession();
            if (!session?.access_token) {
              const authError = new Error('Not authenticated');
              (authError as any).status = 401;
              throw authError;
            }

            const response = await fetch(functionUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify(bodyPayload),
            });

            if (!response.ok) {
              const rawError = await response.text();
              let message = `Request failed (${response.status})`;
              try {
                const parsed = JSON.parse(rawError) as { error?: string; message?: string; details?: string };
                message = String(parsed.error || parsed.message || parsed.details || message);
              } catch {
                if (rawError.trim()) message = rawError.trim();
              }
              const requestError = new Error(message);
              (requestError as any).status = response.status;
              logger.warn('useVoiceTranscription', `Transcription failed: ${message}`);
              throw requestError;
            }

            const data = await response.json().catch(() => ({} as Record<string, unknown>));

            const text =
              typeof data === 'string'
                ? data.trim()
                : (data?.text || data?.transcription || '').trim();

            if (!text) {
              throw new Error('Empty transcription response');
            }

            setTranscriptions((prev) => {
              const next = new Map(prev);
              next.set(cacheKey, text);
              return next;
            });

            // Persist to AsyncStorage
            AsyncStorage.setItem(`${CACHE_PREFIX}${cacheKey}`, text).catch(() => {});

            return text;
          } catch (err: any) {
            lastError = err;
            logger.error('useVoiceTranscription', 'Transcription error:', err);
            const status = Number(err?.status || 0);
            if ([401, 403].includes(status) && attempt < MAX_RETRIES) {
              try { await assertSupabase().auth.refreshSession(); } catch {}
            }
            if ([401, 403, 429, 500, 502, 503, 504].includes(status) && attempt < MAX_RETRIES) {
              attempt++;
              await new Promise((res) => setTimeout(res, 600 * attempt));
              continue;
            }
            break;
          }
        }

        // Capture in Sentry with context
        Sentry.captureException(lastError, {
          tags: { feature: 'voice-transcription' },
          extra: {
            audioUrl: audioUrl?.substring(0, 80),
            messageId,
            attempt,
            payloadSource: bodyPayload.storage_path ? 'storage_path' : bodyPayload.audio_base64 ? 'base64' : 'audio_url',
            error: lastError?.message || lastError,
          },
        });

        const fallback = 'Transcription unavailable. Please try again later.';
        setTranscriptions((prev) => {
          const next = new Map(prev);
          next.set(cacheKey, fallback);
          return next;
        });
        return fallback;
      })().finally(() => {
        inflightRef.current.delete(cacheKey);
        setTranscribing((prev) => {
          const next = new Set(prev);
          next.delete(cacheKey);
          return next;
        });
      });

      inflightRef.current.set(cacheKey, promise);
      return promise;
    },
    [functionUrl, transcriptions],
  );

  const autoTranscribeVoice = useCallback(
    (audioUrl: string, messageId: string) => {
      const cached = transcriptions.get(messageId);
      if (cached || inflightRef.current.has(messageId)) return;
      transcribeVoice(audioUrl, messageId).catch(() => {
        // Silently fail for auto-transcribe
      });
    },
    [transcribeVoice, transcriptions],
  );

  return { transcribeVoice, transcriptions, transcribing, autoTranscribeVoice };
}
