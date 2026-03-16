/**
 * useDashVoiceTTS — TTS queue for Dash Voice.
 *
 * Single source of truth for speech queuing.  Two modes:
 *  - Default (streamingTTSEnabled=false): full response spoken after AI finishes.
 *  - Phrase-streaming (streamingTTSEnabled=true): streaming deltas are buffered
 *    into natural phrase chunks and spoken progressively, so Dash starts talking
 *    before the response completes.
 *
 * Phrase-buffer flush rules (streaming mode only):
 *  1. Sentence boundary (.?! or \n\n) when chunk ≥ PHRASE_MIN_SENTENCE chars.
 *  2. Target-size flush at last whitespace before target length
 *     (PHRASE_FIRST_TARGET for first phrase, PHRASE_FOLLOW_TARGET thereafter).
 *  3. Safety valve: if no flush for PHRASE_SAFETY_VALVE_MS and buffer ≥ 60 chars,
 *     flush at last whitespace.
 *
 * Extracted from app/screens/dash-voice.tsx as part of the WARP refactor.
 */

import { useState, useRef, useCallback } from 'react';
import type { SupportedLanguage } from '@/components/super-admin/voice-orb/useVoiceSTT';
import { cleanForTTS } from '@/lib/dash-voice-utils';
import { shouldUsePhonicsMode } from '@/lib/dash-ai/phonicsDetection';
import { getOrganizationType } from '@/lib/tenant/compat';

// ── Phrase-buffer constants ──────────────────────────────────────────────────
const PHRASE_FIRST_TARGET = 60;        // chars — first phrase (quick start)
const PHRASE_FOLLOW_TARGET = 150;     // chars — subsequent phrases
const PHRASE_MIN_SENTENCE = 25;       // chars — min length to flush at sentence boundary
const PHRASE_SAFETY_VALVE_MS = 800;   // ms — time-based flush threshold

type VoiceOrbRef = {
  speakText: (text: string, language?: SupportedLanguage, options?: { phonicsMode?: boolean }) => Promise<void>;
  stopSpeaking: () => Promise<void>;
  stopListening?: () => Promise<void>;
  isSpeaking: boolean;
};

interface UseDashVoiceTTSParams {
  voiceOrbRef: React.RefObject<VoiceOrbRef | null>;
  preferredLanguage: SupportedLanguage;
  orgType: ReturnType<typeof getOrganizationType>;
  streamingTTSEnabled?: boolean;
}

const longestCommonPrefixLen = (a: string, b: string): number => {
  const left = String(a || '');
  const right = String(b || '');
  const max = Math.min(left.length, right.length);
  let i = 0;
  while (i < max && left[i] === right[i]) i += 1;
  return i;
};

/** Find the last sentence boundary (.?!\n) index in `text`, or -1. */
function lastSentenceBoundary(text: string): number {
  // Look for double-newline paragraph break first (highest priority)
  const paraIdx = text.lastIndexOf('\n\n');
  if (paraIdx !== -1) return paraIdx + 1;
  // Single sentence-ending punctuation
  for (let i = text.length - 1; i >= 0; i--) {
    if (text[i] === '.' || text[i] === '?' || text[i] === '!') return i + 1;
  }
  return -1;
}

/** Find the last whitespace index at or before `maxLen`, or -1. */
function lastWhitespaceBefore(text: string, maxLen: number): number {
  const end = Math.min(maxLen, text.length);
  for (let i = end - 1; i >= 0; i--) {
    if (text[i] === ' ' || text[i] === '\n') return i;
  }
  return -1;
}

export function useDashVoiceTTS({
  voiceOrbRef,
  preferredLanguage,
  orgType,
  streamingTTSEnabled = true,
}: UseDashVoiceTTSParams) {
  const [isSpeaking, setIsSpeaking] = useState(false);

  const speechQueueRef = useRef<string[]>([]);
  const speechMutexRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const streamedPrefixQueuedRef = useRef('');

  // Phrase-buffer state (streaming mode)
  const pendingSpeakBufferRef = useRef('');
  const safetyValveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasSpokenFirstPhraseRef = useRef(false);

  const speakResponse = useCallback(async (text: string) => {
    if (!voiceOrbRef.current) return;
    const phonicsMode = shouldUsePhonicsMode(text, { organizationType: orgType });
    const clean = cleanForTTS(text, { phonicsMode });
    if (!clean) return;
    try {
      isSpeakingRef.current = true;
      setIsSpeaking(true);
      const lang = preferredLanguage || 'en-ZA';
      await voiceOrbRef.current.speakText(clean, lang, { phonicsMode });
    } catch (ttsErr) {
      if (__DEV__) console.warn('[DashVoiceTTS] speakResponse error:', ttsErr);
    } finally {
      isSpeakingRef.current = false;
      setIsSpeaking(false);
    }
  }, [preferredLanguage, orgType, voiceOrbRef]);

  const processSpeechQueue = useCallback(async () => {
    if (speechMutexRef.current) return;
    speechMutexRef.current = true;
    try {
      const next = speechQueueRef.current.shift();
      if (!next) return;
      await speakResponse(next);
      if (speechQueueRef.current.length > 0) {
        processSpeechQueue();
      }
    } finally {
      speechMutexRef.current = false;
    }
  }, [speakResponse]);

  const enqueueSpeech = useCallback((text: string) => {
    if (!text?.trim()) return;
    speechQueueRef.current.push(text.trim());
    processSpeechQueue();
  }, [processSpeechQueue]);

  // ── Phrase buffer ──────────────────────────────────────────────────────────

  /**
   * Attempt to flush a phrase chunk from pendingSpeakBufferRef.
   * If `force` is true, flush everything remaining.
   */
  const flushPhraseBuffer = useCallback((force: boolean) => {
    const buf = pendingSpeakBufferRef.current;
    if (!buf.trim()) return;

    const target = hasSpokenFirstPhraseRef.current ? PHRASE_FOLLOW_TARGET : PHRASE_FIRST_TARGET;

    if (force) {
      // Speak whatever is left
      pendingSpeakBufferRef.current = '';
      hasSpokenFirstPhraseRef.current = true;
      enqueueSpeech(buf);
      return;
    }

    // 1. Sentence boundary flush
    const sentIdx = lastSentenceBoundary(buf);
    if (sentIdx !== -1 && sentIdx >= PHRASE_MIN_SENTENCE) {
      const chunk = buf.slice(0, sentIdx).trim();
      pendingSpeakBufferRef.current = buf.slice(sentIdx);
      hasSpokenFirstPhraseRef.current = true;
      if (chunk) enqueueSpeech(chunk);
      return;
    }

    // 2. Target-size flush at last whitespace
    if (buf.length >= target) {
      const wsIdx = lastWhitespaceBefore(buf, target);
      if (wsIdx > 0) {
        const chunk = buf.slice(0, wsIdx).trim();
        pendingSpeakBufferRef.current = buf.slice(wsIdx + 1);
        hasSpokenFirstPhraseRef.current = true;
        if (chunk) enqueueSpeech(chunk);
      }
    }
  }, [enqueueSpeech]);

  const resetStreamingSpeech = useCallback(() => {
    streamedPrefixQueuedRef.current = '';
    pendingSpeakBufferRef.current = '';
    hasSpokenFirstPhraseRef.current = false;
    if (safetyValveTimerRef.current) {
      clearTimeout(safetyValveTimerRef.current);
      safetyValveTimerRef.current = null;
    }
  }, []);

  const maybeEnqueueStreamingSpeech = useCallback((nextText: string) => {
    if (!streamingTTSEnabled) return;
    const fullText = String(nextText || '').trim();
    if (!fullText) return;

    // O(1) delta: accumulated text only grows during streaming, so slice
    // from the stored prefix length instead of character-by-character comparison.
    const delta = fullText.slice(streamedPrefixQueuedRef.current.length);
    if (!delta) return;

    streamedPrefixQueuedRef.current = fullText;
    pendingSpeakBufferRef.current += delta;

    if (safetyValveTimerRef.current) clearTimeout(safetyValveTimerRef.current);
    flushPhraseBuffer(false);
    safetyValveTimerRef.current = setTimeout(() => {
      if (pendingSpeakBufferRef.current.trim().length >= 60) flushPhraseBuffer(false);
    }, PHRASE_SAFETY_VALVE_MS);
  }, [flushPhraseBuffer, streamingTTSEnabled]);

  /**
   * Called at stream completion. Computes any tail text not yet spoken,
   * appends it to the buffer, and force-flushes everything remaining.
   * Pass the full final text (before markdown stripping) so the tail
   * can be calculated against `streamedPrefixQueuedRef`.
   */
  const flushStreamingSpeechFinal = useCallback((finalFullText: string) => {
    if (safetyValveTimerRef.current) {
      clearTimeout(safetyValveTimerRef.current);
      safetyValveTimerRef.current = null;
    }
    const tail = finalFullText.slice(
      longestCommonPrefixLen(streamedPrefixQueuedRef.current, finalFullText),
    );
    if (tail) pendingSpeakBufferRef.current += tail;
    flushPhraseBuffer(true);
    streamedPrefixQueuedRef.current = '';
    hasSpokenFirstPhraseRef.current = false;
  }, [flushPhraseBuffer]);

  return {
    isSpeaking,
    setIsSpeaking,
    isSpeakingRef,
    speechQueueRef,
    speakResponse,
    processSpeechQueue,
    enqueueSpeech,
    resetStreamingSpeech,
    maybeEnqueueStreamingSpeech,
    flushStreamingSpeechFinal,
    longestCommonPrefixLen,
    streamedPrefixQueuedRef,
  };
}
