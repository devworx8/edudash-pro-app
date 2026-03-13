/**
 * useDashVoiceTTS — TTS queue for Dash Voice.
 *
 * Single source of truth for speech queuing. Responses are spoken in full
 * after the AI finishes — no chunking, no speak-pause splitting.
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

export function useDashVoiceTTS({
  voiceOrbRef,
  preferredLanguage,
  orgType,
  streamingTTSEnabled = false,
}: UseDashVoiceTTSParams) {
  const [isSpeaking, setIsSpeaking] = useState(false);

  const speechQueueRef = useRef<string[]>([]);
  const speechMutexRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const streamedPrefixQueuedRef = useRef('');

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

  const resetStreamingSpeech = useCallback(() => {
    streamedPrefixQueuedRef.current = '';
  }, []);

  const maybeEnqueueStreamingSpeech = useCallback((nextText: string) => {
    if (!streamingTTSEnabled) return;
    const fullText = String(nextText || '').trim();
    if (!fullText) return;

    const alreadyQueuedPrefix = streamedPrefixQueuedRef.current;
    const sharedPrefixLen = longestCommonPrefixLen(alreadyQueuedPrefix, fullText);
    const delta = fullText.slice(sharedPrefixLen).trim();
    if (!delta) return;

    streamedPrefixQueuedRef.current = fullText;
    enqueueSpeech(delta);
  }, [enqueueSpeech, streamingTTSEnabled]);

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
    longestCommonPrefixLen,
    streamedPrefixQueuedRef,
  };
}
