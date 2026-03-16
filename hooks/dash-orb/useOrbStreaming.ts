/**
 * useOrbStreaming — SSE streaming + sentence-level TTS pipelining for DashOrb
 *
 * 1. Real SSE streaming from ai-proxy (text appears as Claude generates it)
 * 2. Sentence-level TTS pipelining (speak sentence 1 while sentence 2 generates)
 * 3. Phoneme-estimated viseme IDs
 */

import { useCallback, useRef } from 'react';
import {
  estimateVisemeTimeline,
  estimateVisemeTimelinePhonics,
  type VisemeEvent,
} from '@/lib/voice/visemeEstimator';
import { extractCompleteSentences } from './sentenceSplitter';

// ── Types ───────────────────────────────────────────────────────────────

export interface StreamingCallbacks {
  onTextChunk: (chunk: string, accumulated: string) => void;
  onSentenceReady: (sentence: string, index: number) => void;
  onVisemeEvent: (event: VisemeEvent) => void;
  onComplete: (fullText: string) => void;
  onError: (error: Error) => void;
}

export interface StreamingRequest {
  endpoint: string;
  body: Record<string, unknown>;
  accessToken: string;
  phonicsMode?: boolean;
}

// ── Hook ────────────────────────────────────────────────────────────────

export function useOrbStreaming() {
  const abortRef = useRef<AbortController | null>(null);
  const isStreamingRef = useRef(false);

  /**
   * Stream a response from ai-proxy via SSE and pipe sentences to TTS
   * as they complete (instead of waiting for the full response).
   */
  const streamResponse = useCallback(
    async (request: StreamingRequest, callbacks: StreamingCallbacks) => {
      // Cancel any in-flight stream
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      isStreamingRef.current = true;

      let accumulated = '';
      let sentenceBuffer = '';
      let sentenceIndex = 0;

      const processLine = (line: string) => {
        if (!line.startsWith('data: ')) return;
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data);
          const text =
            parsed?.delta?.text ??
            parsed?.choices?.[0]?.delta?.content ??
            '';
          if (!text) return;

          accumulated += text;
          sentenceBuffer += text;
          callbacks.onTextChunk(text, accumulated);

          // Extract complete sentences and fire TTS for each
          const { sentences, remainder } = extractCompleteSentences(sentenceBuffer);
          sentenceBuffer = remainder;

          for (const sentence of sentences) {
            callbacks.onSentenceReady(sentence, sentenceIndex);

            // Estimate viseme timeline for this sentence and fire events
            const timeline = request.phonicsMode
              ? estimateVisemeTimelinePhonics(sentence)
              : estimateVisemeTimeline(sentence);
            for (const evt of timeline) {
              setTimeout(() => {
                if (isStreamingRef.current || sentenceIndex > 0) {
                  callbacks.onVisemeEvent(evt);
                }
              }, evt.offsetMs);
            }

            sentenceIndex++;
          }
        } catch {
          // Skip malformed SSE lines
        }
      };

      // Detect environment — RN uses XHR for true incremental streaming,
      // web uses ReadableStream.
      const isRN =
        typeof navigator !== 'undefined' && navigator.product === 'ReactNative';

      try {
        if (isRN) {
          // React Native: XHR with onreadystatechange gives incremental chunks
          // (much faster first-token than response.text() which blocks until complete)
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', request.endpoint);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.setRequestHeader('Authorization', `Bearer ${request.accessToken}`);
            xhr.responseType = 'text';

            let lastIdx = 0;
            let lineBuffer = '';
            const drain = () => {
              const chunk = xhr.responseText.slice(lastIdx);
              lastIdx = xhr.responseText.length;
              const lines = (lineBuffer + chunk).split('\n');
              lineBuffer = lines.pop() || '';
              for (const line of lines) processLine(line);
            };

            xhr.onreadystatechange = () => {
              if (xhr.readyState >= 3) drain();
              if (xhr.readyState === 4) {
                xhr.status >= 200 && xhr.status < 300
                  ? resolve()
                  : reject(new Error(`Streaming failed: ${xhr.status}`));
              }
            };

            xhr.onerror = () => reject(new Error('Network error during streaming'));

            const onAbort = () => { xhr.abort(); reject(Object.assign(new Error('AbortError'), { name: 'AbortError' })); };
            controller.signal.addEventListener('abort', onAbort);

            xhr.send(JSON.stringify({ ...request.body, stream: true }));
          });
        } else {
          // Web: fetch + ReadableStream
          const response = await fetch(request.endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${request.accessToken}`,
            },
            body: JSON.stringify({ ...request.body, stream: true }),
            signal: controller.signal,
          });

          if (!response.ok) {
            throw new Error(`Streaming failed: ${response.status}`);
          }

          const reader = response.body!.getReader();
          const decoder = new TextDecoder('utf-8');
          let buffer = '';

          // eslint-disable-next-line no-constant-condition
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) processLine(line);
          }
          if (buffer) processLine(buffer);
        }

        // Flush remaining text as final sentence
        if (sentenceBuffer.trim()) {
          callbacks.onSentenceReady(sentenceBuffer.trim(), sentenceIndex);
          const timeline = request.phonicsMode
            ? estimateVisemeTimelinePhonics(sentenceBuffer.trim())
            : estimateVisemeTimeline(sentenceBuffer.trim());
          for (const evt of timeline) {
            setTimeout(() => callbacks.onVisemeEvent(evt), evt.offsetMs);
          }
        }

        callbacks.onComplete(accumulated);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          callbacks.onError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        isStreamingRef.current = false;
      }
    },
    [],
  );

  /** Cancel any in-flight stream */
  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
    isStreamingRef.current = false;
  }, []);

  return { streamResponse, cancelStream };
}
