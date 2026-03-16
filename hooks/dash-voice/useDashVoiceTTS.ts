/**
 * useDashVoiceTTS — Single-stream TTS for Dash Voice ORB.
 *
 * Designed to produce ONE CONTINUOUS speech flow with minimal pauses:
 *  1. FIRST PHRASE — spoken as soon as ~100 chars at a sentence boundary
 *     arrive during SSE (low first-word latency).
 *  2. REMAINDER — everything else spoken as ONE chunk when the stream ends.
 *     The speak() pipeline sends it as a single Azure request (up to ~3000
 *     chars) so the entire remainder plays as one continuous audio file.
 *
 * Why 2-phase, not progressive chunks?
 * Each enqueueSpeech() → speak() → Azure TTS request → new AudioPlayer.
 * More calls = more inter-chunk gaps. Two calls (first phrase + remainder)
 * means at most ONE transition. The speak() prefetch pipeline handles any
 * internal splitting with pre-buffered players for zero-gap handoff.
 */

import { useState, useRef, useCallback } from 'react';
import type { SupportedLanguage } from '@/components/super-admin/voice-orb/useVoiceSTT';
import { cleanForTTS } from '@/lib/dash-voice-utils';
import { shouldUsePhonicsMode } from '@/lib/dash-ai/phonicsDetection';
import { getOrganizationType } from '@/lib/tenant/compat';

// ── Constants ────────────────────────────────────────────────────────────────
const FIRST_PHRASE_MIN = 40;     // min chars at sentence boundary to flush
const FIRST_PHRASE_TARGET = 100; // word-boundary fallback target

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
 * within the range [startFrom, text.length). Returns -1 if none found.
 */
function findLastSentenceBoundary(text: string, startFrom: number): number {
  let lastBoundary = -1;
  for (let i = startFrom; i < text.length; i++) {
    if (text[i] === '?' || text[i] === '!') { lastBoundary = i + 1; continue; }
    if (text[i] === '.' && (i + 1 >= text.length || text[i + 1] === ' ' || text[i + 1] === '\n')) { lastBoundary = i + 1; continue; }
    if (text[i] === '\n' && i + 1 < text.length && text[i + 1] === '\n') { lastBoundary = i + 2; continue; }
  }
  return lastBoundary;
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
  const spokenPrefixLenRef = useRef(0);       // How many chars have been queued
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
  // Only speaks the FIRST phrase (for low latency). All remaining text
  // accumulates and is spoken as ONE continuous chunk when stream ends.
  const maybeEnqueueStreamingSpeech = useCallback((displayText: string) => {
    if (!streamingTTSEnabled) return;
    const text = String(displayText || '').trim();
    if (!text) return;
    accumulatedTextRef.current = text;

    // After first phrase, just track — remainder spoken as one chunk at end
    if (firstPhraseSpokenRef.current) return;
    if (text.length < FIRST_PHRASE_MIN) return;

    // Find the LAST sentence boundary for maximum first-phrase content
    // (more audio = more time for the stream to finish before we need chunk 2)
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
  }, [enqueueSpeech, streamingTTSEnabled]);

  // ── Streaming: called when stream completes ────────────────────────────────
  // Speaks everything not yet spoken as ONE chunk. The speak() prefetch
  // pipeline handles internal cloud-chunking with pre-buffered players
  // for zero-gap transitions.
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
