/**
 * useDashVoiceTTS — TTS queue + streaming speech logic for Dash Voice.
 *
 * Extracted from app/screens/dash-voice.tsx as part of the WARP refactor.
 */

import { useState, useRef, useCallback } from 'react';
import type { SupportedLanguage } from '@/components/super-admin/voice-orb/useVoiceSTT';
import { cleanForTTS } from '@/lib/dash-voice-utils';
import { shouldUsePhonicsMode } from '@/lib/dash-ai/phonicsDetection';
import { getOrganizationType } from '@/lib/tenant/compat';

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
  streamingTTSEnabled: boolean;
}

export function useDashVoiceTTS({
  voiceOrbRef,
  preferredLanguage,
  orgType,
  streamingTTSEnabled,
}: UseDashVoiceTTSParams) {
  const [isSpeaking, setIsSpeaking] = useState(false);

  const speechQueueRef = useRef<string[]>([]);
  const speechMutexRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const streamedPrefixQueuedRef = useRef('');
  const streamedHasQueuedRef = useRef(false);
  const streamedLastQueuedAtRef = useRef(0);

  const speakResponse = useCallback(async (text: string) => {
    if (!voiceOrbRef.current) return;
    const phonicsMode = shouldUsePhonicsMode(text, { organizationType: orgType });
    const clean = cleanForTTS(text, { phonicsMode });
    if (!clean) return;
    try {
      isSpeakingRef.current = true;
      setIsSpeaking(true);
      const chunkLang = preferredLanguage || 'en-ZA';
      await voiceOrbRef.current.speakText(clean, chunkLang, { phonicsMode });
    } catch { /* ignore */ } finally {
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
        setTimeout(() => processSpeechQueue(), 50);
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

  const longestCommonPrefixLen = useCallback((a: string, b: string) => {
    const max = Math.min(a.length, b.length);
    let i = 0;
    for (; i < max; i += 1) {
      if (a[i] !== b[i]) break;
    }
    return i;
  }, []);

  const findSpeakBoundaryIndex = useCallback((text: string) => {
    if (!text) return -1;
    const sentence = /[.!?](?=\s|$)/.exec(text);
    if (sentence) return sentence.index;
    const soft = /[\n;:](?=\s|$)/.exec(text);
    if (soft) return soft.index;
    if (text.length > 50) {
      const comma = /,(?=\s)/.exec(text);
      if (comma) return comma.index;
    }
    const hardMax = 140;
    if (text.length > hardMax) {
      const slice = text.slice(0, hardMax);
      const lastSpace = Math.max(slice.lastIndexOf(' '), slice.lastIndexOf('\n'));
      if (lastSpace > 40) return lastSpace;
      return hardMax;
    }
    return -1;
  }, []);

  const resetStreamingSpeech = useCallback(() => {
    streamedPrefixQueuedRef.current = '';
    streamedHasQueuedRef.current = false;
    streamedLastQueuedAtRef.current = 0;
  }, []);

  const maybeEnqueueStreamingSpeech = useCallback((accumulated: string) => {
    if (!streamingTTSEnabled) return;
    if (!accumulated) return;

    const full = accumulated;
    const prev = streamedPrefixQueuedRef.current;

    let delta = '';
    if (!prev) {
      delta = full;
    } else if (full.startsWith(prev)) {
      delta = full.slice(prev.length);
    } else {
      const lcp = longestCommonPrefixLen(full, prev);
      streamedPrefixQueuedRef.current = full.slice(0, lcp);
      delta = full.slice(lcp);
    }

    if (delta.trim().length < 5) return;
    const sentenceEnd = /[.!?](?=\s|$)/.exec(delta);
    const boundaryIdx = sentenceEnd ? sentenceEnd.index : -1;
    if (boundaryIdx < 0) return;

    const rawChunk = delta.slice(0, boundaryIdx + 1);
    const speakChunk = rawChunk.trim();
    if (!speakChunk) return;

    const MIN_STREAMING_PHRASE_CHARS = 35;
    if (speakChunk.length < MIN_STREAMING_PHRASE_CHARS) return;
    if (/\/[a-z]*$/i.test(speakChunk) || /^[a-z]*\//i.test(speakChunk)) return;

    const now = Date.now();
    const throttleMs = 400;
    const minCharsToBypassThrottle = 60;
    if (now - streamedLastQueuedAtRef.current < throttleMs && speakChunk.length < minCharsToBypassThrottle) return;
    streamedLastQueuedAtRef.current = now;

    streamedHasQueuedRef.current = true;
    streamedPrefixQueuedRef.current = `${streamedPrefixQueuedRef.current}${rawChunk}`;
    enqueueSpeech(speakChunk);
  }, [streamingTTSEnabled, enqueueSpeech, longestCommonPrefixLen]);

  return {
    isSpeaking,
    setIsSpeaking,
    isSpeakingRef,
    speechQueueRef,
    speakResponse,
    processSpeechQueue,
    enqueueSpeech,
    longestCommonPrefixLen,
    findSpeakBoundaryIndex,
    resetStreamingSpeech,
    maybeEnqueueStreamingSpeech,
    streamedPrefixQueuedRef,
  };
}
