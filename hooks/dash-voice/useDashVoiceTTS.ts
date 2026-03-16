/**
 * useDashVoiceTTS — Progressive streaming TTS for Dash Voice ORB.
 *
 * Near-realtime approach: speech keeps pace with the SSE token stream.
 *  1. FIRST PHRASE — spoken as soon as ~80 chars accumulate at a sentence
 *     boundary (low first-word latency).
 *  2. PROGRESSIVE PHRASES — every time ≥80 new chars accumulate past a
 *     sentence boundary, the new segment is enqueued. Speech plays
 *     continuously while the stream is still arriving.
 *  3. FLUSH — any remaining unspoken tail is enqueued when the stream ends.
 *
 * The underlying speak() prefetch pipeline handles internal cloud-chunk
 * splitting seamlessly with zero inter-chunk gaps.
 *
 * Result: TTS tracks the stream in near-realtime instead of waiting for
 * the full response, giving a smooth conversational feel.
 */

import { useState, useRef, useCallback } from 'react';
import type { SupportedLanguage } from '@/components/super-admin/voice-orb/useVoiceSTT';
import { cleanForTTS } from '@/lib/dash-voice-utils';
import { shouldUsePhonicsMode } from '@/lib/dash-ai/phonicsDetection';
import { getOrganizationType } from '@/lib/tenant/compat';

// ── Constants ────────────────────────────────────────────────────────────────
const FIRST_PHRASE_MIN = 40;          // min chars at sentence boundary to flush first phrase
const FIRST_PHRASE_TARGET = 80;       // word-boundary fallback for first phrase
const PROGRESSIVE_MIN_DELTA = 80;     // min new chars before flushing a progressive phrase

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

/**
 * Find the LAST sentence-ending boundary (.?! followed by space/end, or \n\n)
 * within the range [startFrom, endBefore). Returns -1 if none found.
 */
function findLastSentenceBoundary(text: string, startFrom: number, endBefore?: number): number {
  const end = endBefore ?? text.length;
  let lastBoundary = -1;
  for (let i = startFrom; i < end; i++) {
    if (text[i] === '?' || text[i] === '!') { lastBoundary = i + 1; continue; }
    if (text[i] === '.' && (i + 1 >= end || text[i + 1] === ' ' || text[i + 1] === '\n')) { lastBoundary = i + 1; continue; }
    if (text[i] === '\n' && i + 1 < end && text[i + 1] === '\n') { lastBoundary = i + 2; continue; }
  }
  return lastBoundary;
}

/** Find the first sentence-ending boundary at or after `startFrom`. */
function findFirstSentenceBoundary(text: string, startFrom: number): number {
  for (let i = startFrom; i < text.length; i++) {
    if (text[i] === '?' || text[i] === '!') return i + 1;
    if (text[i] === '.' && (i + 1 >= text.length || text[i + 1] === ' ' || text[i + 1] === '\n')) return i + 1;
    if (text[i] === '\n' && i + 1 < text.length && text[i + 1] === '\n') return i + 2;
  }
  return -1;
}

/** Length of the longest common prefix between two strings. */
function commonPrefixLen(a: string, b: string): number {
  const la = String(a || ''), lb = String(b || '');
  const max = Math.min(la.length, lb.length);
  let i = 0;
  while (i < max && la[i] === lb[i]) i += 1;
  return i;
}

export function useDashVoiceTTS({
  voiceOrbRef,
  preferredLanguage,
  orgType,
  streamingTTSEnabled = true,
}: UseDashVoiceTTSParams) {
  const [isSpeaking, setIsSpeaking] = useState(false);

  // ── Queue state ────────────────────────────────────────────────────────────
  const speechQueueRef = useRef<string[]>([]);
  const speechMutexRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const cancelledRef = useRef(false);

  // ── Streaming accumulation ─────────────────────────────────────────────────
  const accumulatedTextRef = useRef('');      // Full display text received so far
  const spokenPrefixLenRef = useRef(0);       // How many chars have been queued to TTS
  const firstPhraseSpokenRef = useRef(false); // Whether the first quick phrase was spoken

  // ── Core speak ─────────────────────────────────────────────────────────────
  const speakResponse = useCallback(async (text: string) => {
    if (!voiceOrbRef.current) return;
    const phonicsMode = shouldUsePhonicsMode(text, { organizationType: orgType });
    const clean = cleanForTTS(text, { phonicsMode });
    if (!clean) return;
    try {
      const lang = preferredLanguage || 'en-ZA';
      if (__DEV__) console.log('[TTS] speak:', clean.length, 'chars');
      await voiceOrbRef.current.speakText(clean, lang, { phonicsMode });
    } catch (ttsErr) {
      const msg = String(ttsErr instanceof Error ? ttsErr.message : ttsErr || '').toLowerCase();
      if (msg === 'stopped') {
        cancelledRef.current = true;
        speechQueueRef.current = [];
      }
      if (__DEV__) console.warn('[TTS] speakResponse error:', ttsErr);
    }
  }, [preferredLanguage, orgType, voiceOrbRef]);

  // ── Queue processor ────────────────────────────────────────────────────────
  const processSpeechQueue = useCallback(async () => {
    if (speechMutexRef.current) {
      if (__DEV__) console.log('[TTS] queue: mutex held (queued:', speechQueueRef.current.length, ')');
      return;
    }
    speechMutexRef.current = true;
    cancelledRef.current = false;
    isSpeakingRef.current = true;
    setIsSpeaking(true);
    if (__DEV__) console.log('[TTS] queue: start, items:', speechQueueRef.current.length);
    try {
      while (speechQueueRef.current.length > 0 && !cancelledRef.current) {
        const next = speechQueueRef.current.shift();
        if (!next) break;
        if (__DEV__) console.log('[TTS] playing:', next.length, 'chars, remaining:', speechQueueRef.current.length);
        await speakResponse(next);
      }
    } finally {
      speechMutexRef.current = false;
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      if (__DEV__) console.log('[TTS] queue: done');
    }
  }, [speakResponse]);

  // ── Enqueue ────────────────────────────────────────────────────────────────
  const enqueueSpeech = useCallback((text: string) => {
    if (!text?.trim()) return;
    speechQueueRef.current.push(text.trim());
    if (__DEV__) console.log('[TTS] enqueue:', text.trim().length, 'chars, total:', speechQueueRef.current.length);
    processSpeechQueue();
  }, [processSpeechQueue]);

  // ── Cancel ─────────────────────────────────────────────────────────────────
  const cancelSpeech = useCallback(() => {
    cancelledRef.current = true;
    speechQueueRef.current = [];
    accumulatedTextRef.current = '';
    spokenPrefixLenRef.current = 0;
    firstPhraseSpokenRef.current = false;
    voiceOrbRef.current?.stopSpeaking?.().catch(() => {});
    if (__DEV__) console.log('[TTS] cancelled');
  }, [voiceOrbRef]);

  // ── Reset streaming state ──────────────────────────────────────────────────
  const resetStreamingSpeech = useCallback(() => {
    accumulatedTextRef.current = '';
    spokenPrefixLenRef.current = 0;
    firstPhraseSpokenRef.current = false;
  }, []);

  // ── Streaming: called on each SSE chunk ────────────────────────────────────
  // Progressive multi-sentence streaming: enqueues new complete sentences as
  // they arrive so TTS keeps pace with the SSE stream in near-realtime.
  const maybeEnqueueStreamingSpeech = useCallback((displayText: string) => {
    if (!streamingTTSEnabled) return;
    const text = String(displayText || '').trim();
    if (!text) return;
    accumulatedTextRef.current = text;

    const spokenLen = spokenPrefixLenRef.current;
    const newChars = text.length - spokenLen;

    // ── First phrase: quick start with low threshold ──────────────────────
    if (!firstPhraseSpokenRef.current) {
      if (text.length < FIRST_PHRASE_MIN) return;

      // Look for the last sentence boundary so we speak as much as possible
      const boundary = findLastSentenceBoundary(text, FIRST_PHRASE_MIN - 1);
      if (boundary > 0) {
        const phrase = text.slice(0, boundary).trim();
        if (phrase) {
          firstPhraseSpokenRef.current = true;
          spokenPrefixLenRef.current = boundary;
          if (__DEV__) console.log('[TTS] first phrase:', phrase.length, 'chars');
          enqueueSpeech(phrase);
          return;
        }
      }

      // No sentence boundary yet — fall back to word boundary at target size
      if (text.length >= FIRST_PHRASE_TARGET) {
        let cutoff = FIRST_PHRASE_TARGET;
        for (let i = FIRST_PHRASE_TARGET; i >= FIRST_PHRASE_MIN; i--) {
          if (text[i] === ' ' || text[i] === '\n') { cutoff = i; break; }
        }
        const phrase = text.slice(0, cutoff).trim();
        if (phrase) {
          firstPhraseSpokenRef.current = true;
          spokenPrefixLenRef.current = cutoff;
          if (__DEV__) console.log('[TTS] first phrase (word-break):', phrase.length, 'chars');
          enqueueSpeech(phrase);
        }
      }
      return;
    }

    // ── Progressive phrases: enqueue new sentences as they stream in ──────
    // Wait until enough new content has arrived to avoid tiny fragments
    if (newChars < PROGRESSIVE_MIN_DELTA) return;

    // Find the last sentence boundary in the NEW (unspoken) portion of text.
    // Search from spokenLen but stop before the very end of the stream
    // (the last few chars might be mid-sentence).
    const boundary = findLastSentenceBoundary(text, spokenLen);
    if (boundary <= spokenLen) return;

    const phrase = text.slice(spokenLen, boundary).trim();
    if (!phrase || phrase.length < 20) return; // skip tiny fragments

    spokenPrefixLenRef.current = boundary;
    if (__DEV__) console.log('[TTS] progressive phrase:', phrase.length, 'chars, spoken total:', boundary);
    enqueueSpeech(phrase);
  }, [enqueueSpeech, streamingTTSEnabled]);

  // ── Streaming: called when stream completes ────────────────────────────────
  // Speaks any remaining unspoken tail. With progressive streaming, this is
  // typically just the last partial sentence (much smaller than before).
  const flushStreamingSpeechFinal = useCallback((finalFullText: string) => {
    const fullText = String(finalFullText || '').trim();
    if (!fullText) { resetStreamingSpeech(); return; }

    // Find how much of the final text overlaps with what was already spoken
    const spokenSoFar = accumulatedTextRef.current.slice(0, spokenPrefixLenRef.current);
    const overlapLen = spokenSoFar ? commonPrefixLen(spokenSoFar, fullText) : 0;
    const remainder = fullText.slice(overlapLen).trim();

    if (__DEV__) console.log('[TTS] final: spoken', overlapLen, 'remainder', remainder.length, 'total', fullText.length);

    if (remainder) {
      enqueueSpeech(remainder);
    } else if (!firstPhraseSpokenRef.current) {
      // Stream was too short for first phrase — speak everything
      enqueueSpeech(fullText);
    }

    // Reset streaming state
    accumulatedTextRef.current = '';
    spokenPrefixLenRef.current = 0;
    firstPhraseSpokenRef.current = false;
  }, [enqueueSpeech, resetStreamingSpeech]);

  // ── Backward-compat aliases ────────────────────────────────────────────────
  const streamedPrefixQueuedRef = accumulatedTextRef;
  const longestCommonPrefixLen = commonPrefixLen;

  return {
    isSpeaking,
    setIsSpeaking,
    isSpeakingRef,
    speechQueueRef,
    speakResponse,
    processSpeechQueue,
    enqueueSpeech,
    cancelSpeech,
    resetStreamingSpeech,
    maybeEnqueueStreamingSpeech,
    flushStreamingSpeechFinal,
    longestCommonPrefixLen,
    streamedPrefixQueuedRef,
  };
}
