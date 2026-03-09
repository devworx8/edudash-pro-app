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

      const promise = (async () => {
        setTranscribing((prev) => new Set(prev).add(cacheKey));

        try {
          const client = assertSupabase();

          const { data, error } = await client.functions.invoke('stt-proxy', {
            body: {
              audio_url: audioUrl,
              language: 'auto',
              auto_detect: true,
            },
          });

          if (error) {
            logger.warn('useVoiceTranscription', `Transcription failed: ${error.message}`);
            throw error;
          }

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
        } catch (err) {
          logger.error('useVoiceTranscription', 'Transcription error:', err);
          const fallback = 'Transcription unavailable';
          setTranscriptions((prev) => {
            const next = new Map(prev);
            next.set(cacheKey, fallback);
            return next;
          });
          return fallback;
        } finally {
          setTranscribing((prev) => {
            const next = new Set(prev);
            next.delete(cacheKey);
            return next;
          });
          inflightRef.current.delete(cacheKey);
        }
      })();

      inflightRef.current.set(cacheKey, promise);
      return promise;
    },
    [transcriptions],
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
