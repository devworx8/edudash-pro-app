/**
 * useStreamingTTS Hook - Instant TTS Response
 * Provides pre-buffering, sentence-level chunking, and predictive synthesis
 */

import { useCallback, useRef, useEffect, useState } from 'react';
import { SentenceChunker, cleanTextForTTS, TTS_CONFIG } from '@/lib/voice/ttsLatencyOptimization';
import type { TTSOptions, StreamingTTSState, SpeechChunk } from './types';

// =============================================================================
// Hook Implementation
// =============================================================================

export function useStreamingTTS(
  speakFn: (text: string, language?: string, options?: { phonicsMode?: boolean }) => Promise<void>,
  stopFn: () => Promise<void>,
) {
  const [state, setState] = useState<StreamingTTSState>({
    isSpeaking: false,
    currentText: '',
    queueLength: 0,
    latency: 0,
  });

  const chunkerRef = useRef<SentenceChunker | null>(null);
  const queueRef = useRef<SpeechChunk[]>([]);
  const isProcessingRef = useRef(false);
  const currentSpeechRef = useRef<string | null>(null);
  const metricsRef = useRef({ startTime: 0, totalLatency: 0 });

  // Initialize chunker
  useEffect(() => {
    chunkerRef.current = new SentenceChunker();
    return () => {
      chunkerRef.current?.reset();
    };
  }, []);

  /** Process the speech queue - speak chunks in order */
  const processQueue = useCallback(async () => {
    if (isProcessingRef.current || queueRef.current.length === 0) {
      return;
    }

    isProcessingRef.current = true;
    setState((prev) => ({ ...prev, isSpeaking: true }));

    while (queueRef.current.length > 0) {
      const chunk = queueRef.current.shift();
      if (!chunk) break;

      currentSpeechRef.current = chunk.id;
      setState((prev) => ({
        ...prev,
        currentText: chunk.text,
        queueLength: queueRef.current.length,
      }));

      try {
        const cleanText = cleanTextForTTS(chunk.text);
        if (cleanText) {
          await speakFn(cleanText);
        }
      } catch (error) {
        console.error('[useStreamingTTS] Speech error:', error);
      }
    }

    isProcessingRef.current = false;
    currentSpeechRef.current = null;
    setState((prev) => ({
      ...prev,
      isSpeaking: false,
      currentText: '',
      queueLength: 0,
    }));
  }, [speakFn]);

  /** Add streaming text and extract sentences for TTS */
  const addStreamingText = useCallback(
    (text: string) => {
      if (!chunkerRef.current) return;

      const startTime = Date.now();
      if (metricsRef.current.startTime === 0) {
        metricsRef.current.startTime = startTime;
      }

      const chunks = chunkerRef.current.addText(text);

      for (const chunk of chunks) {
        if (chunk.text.length >= TTS_CONFIG.MIN_CHUNK_SIZE) {
          queueRef.current.push({
            id: chunk.id,
            text: chunk.text,
            priority: chunk.priority,
          });
        }
      }

      setState((prev) => ({ ...prev, queueLength: queueRef.current.length }));

      if (!isProcessingRef.current && queueRef.current.length > 0) {
        processQueue();
      }
    },
    [processQueue],
  );

  /** Flush remaining text and ensure all speech is queued */
  const flushText = useCallback(() => {
    if (!chunkerRef.current) return;

    const finalChunk = chunkerRef.current.flush();
    if (finalChunk && finalChunk.text.trim()) {
      queueRef.current.push({
        id: finalChunk.id,
        text: finalChunk.text,
        priority: finalChunk.priority,
      });

      setState((prev) => ({ ...prev, queueLength: queueRef.current.length }));

      if (!isProcessingRef.current) {
        processQueue();
      }
    }
  }, [processQueue]);

  /** Speak complete text (non-streaming mode) */
  const speak = useCallback(
    async (text: string, options?: TTSOptions) => {
      const cleanText = cleanTextForTTS(text);
      if (!cleanText) return;

      options?.onStart?.();

      try {
        setState((prev) => ({ ...prev, isSpeaking: true, currentText: cleanText }));
        await speakFn(cleanText, options?.language, { phonicsMode: options?.phonicsMode });
      } catch (error) {
        options?.onError?.(error instanceof Error ? error : new Error(String(error)));
      } finally {
        setState((prev) => ({ ...prev, isSpeaking: false, currentText: '' }));
        options?.onComplete?.();
      }
    },
    [speakFn],
  );

  /** Stop all speech and clear queue */
  const stop = useCallback(async () => {
    await stopFn();
    queueRef.current = [];
    chunkerRef.current?.reset();
    isProcessingRef.current = false;
    currentSpeechRef.current = null;
    metricsRef.current = { startTime: 0, totalLatency: 0 };

    setState({
      isSpeaking: false,
      currentText: '',
      queueLength: 0,
      latency: 0,
    });
  }, [stopFn]);

  /** Reset all state */
  const reset = useCallback(() => {
    queueRef.current = [];
    chunkerRef.current?.reset();
    isProcessingRef.current = false;
    currentSpeechRef.current = null;
    metricsRef.current = { startTime: 0, totalLatency: 0 };

    setState({
      isSpeaking: false,
      currentText: '',
      queueLength: 0,
      latency: 0,
    });
  }, []);

  return {
    ...state,
    addStreamingText,
    flushText,
    speak,
    stop,
    reset,
  };
}

export default useStreamingTTS;
