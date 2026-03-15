import { useRef, useCallback, useEffect } from 'react';
import { formatTranscript } from '@/lib/voice/formatTranscript';
import type { SupportedLanguage } from '@/components/super-admin/voice-orb/useVoiceSTT';
import type { VoiceTranscriptMeta } from './types';

interface LiveSessionParams {
  stopLiveListening: () => Promise<void>;
  onPartialTranscript?: (text: string, language?: SupportedLanguage) => void;
  onTranscript: (text: string, language?: SupportedLanguage, meta?: VoiceTranscriptMeta) => void;
  onStopListening: () => void;
  selectedLanguage: SupportedLanguage;
  profile: any;
  setLastDetectedLanguage: (lang: SupportedLanguage) => void;
  setUsingLiveSTT: (v: boolean) => void;
  setIsProcessing: (v: boolean) => void;
  setStatusText: (v: string) => void;
  setLiveTranscript: (v: string) => void;
  VOICE_TRACE_ENABLED: boolean;
  LIVE_SILENCE_TIMEOUT_MS: number;
  LIVE_FINAL_FALLBACK_MS: number;
  scheduleLiveFallbackRef: React.MutableRefObject<(() => void) | null>;
}

export function useVoiceOrbLiveSession({
  stopLiveListening,
  onPartialTranscript,
  onTranscript,
  onStopListening,
  selectedLanguage,
  profile,
  setLastDetectedLanguage,
  setUsingLiveSTT,
  setIsProcessing,
  setStatusText,
  setLiveTranscript: _setLiveTranscript,
  VOICE_TRACE_ENABLED,
  LIVE_SILENCE_TIMEOUT_MS,
  LIVE_FINAL_FALLBACK_MS,
  scheduleLiveFallbackRef,
}: LiveSessionParams) {
  const usingLiveSTTRef = useRef(false);
  const liveSessionRef = useRef(0);
  const liveFinalizedRef = useRef(false);
  const lastPartialRef = useRef('');
  const liveSessionStartedAtRef = useRef<number | null>(null);
  const liveLastPartialAtRef = useRef<number | null>(null);
  const liveSilenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalizeLiveRef = useRef<((text: string) => void) | null>(null);
  const resetLiveSilenceTimerRef = useRef<(() => void) | null>(null);

  const logVoiceTrace = useCallback((event: string, payload?: Record<string, unknown>) => {
    if (!VOICE_TRACE_ENABLED) return;
    console.log(`[VoiceOrbTrace] ${event}`, payload || {});
  }, [VOICE_TRACE_ENABLED]);

  const clearLiveTimers = useCallback(() => {
    if (liveSilenceTimerRef.current) {
      clearTimeout(liveSilenceTimerRef.current);
      liveSilenceTimerRef.current = null;
    }
    if (liveFallbackTimerRef.current) {
      clearTimeout(liveFallbackTimerRef.current);
      liveFallbackTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearLiveTimers();
  }, [clearLiveTimers]);

  const finalizeLiveTranscript = useCallback((text: string) => {
    if (liveFinalizedRef.current) return;
    liveFinalizedRef.current = true;
    const finalizedAt = Date.now();
    const startedAt = liveSessionStartedAtRef.current;
    const sessionMs = startedAt ? finalizedAt - startedAt : null;
    const lastPartialAgoMs = liveLastPartialAtRef.current ? finalizedAt - liveLastPartialAtRef.current : null;
    clearLiveTimers();
    setUsingLiveSTT(false);
    setIsProcessing(false);
    onPartialTranscript?.('', selectedLanguage);

    const isPreschool = (profile as any)?.school_type === 'preschool' || (profile as any)?.organization_type === 'preschool';
    const formatted = formatTranscript(text || '', selectedLanguage, {
      whisperFlow: true,
      summarize: false,
      preschoolMode: isPreschool,
      maxSummaryWords: 16,
    });
    const cleaned = formatted.trim();
    if (cleaned) {
      setLastDetectedLanguage(selectedLanguage);
      logVoiceTrace('stt_finalize_success', { sessionId: liveSessionRef.current, source: 'final', sessionMs, lastPartialAgoMs, chars: cleaned.length, preview: cleaned.slice(0, 120) });
      onTranscript(cleaned, selectedLanguage, { source: 'live', capturedAt: Date.now() });
      setStatusText('Thinking...');
      return;
    }

    const fallback = formatTranscript(lastPartialRef.current, selectedLanguage, {
      whisperFlow: true,
      summarize: false,
      preschoolMode: isPreschool,
      maxSummaryWords: 16,
    }).trim();
    if (fallback) {
      setLastDetectedLanguage(selectedLanguage);
      logVoiceTrace('stt_finalize_success', { sessionId: liveSessionRef.current, source: 'partial_fallback', sessionMs, lastPartialAgoMs, chars: fallback.length, preview: fallback.slice(0, 120) });
      onTranscript(fallback, selectedLanguage, { source: 'live', capturedAt: Date.now() });
      setStatusText('Thinking...');
      return;
    }

    logVoiceTrace('stt_finalize_empty', { sessionId: liveSessionRef.current, sessionMs, lastPartialAgoMs, lastPartialChars: lastPartialRef.current.length, lastPartialPreview: lastPartialRef.current.slice(0, 120) });
    setStatusText('No speech detected');
    setTimeout(() => setStatusText('Listening...'), 2000);
  }, [clearLiveTimers, onPartialTranscript, onTranscript, selectedLanguage, logVoiceTrace, profile, setLastDetectedLanguage, setUsingLiveSTT, setIsProcessing, setStatusText]);

  useEffect(() => {
    finalizeLiveRef.current = finalizeLiveTranscript;
  }, [finalizeLiveTranscript]);

  const scheduleLiveFallback = useCallback(() => {
    if (liveFallbackTimerRef.current) clearTimeout(liveFallbackTimerRef.current);
    const sessionId = liveSessionRef.current;
    liveFallbackTimerRef.current = setTimeout(() => {
      if (liveSessionRef.current !== sessionId || liveFinalizedRef.current) return;
      finalizeLiveTranscript('');
    }, LIVE_FINAL_FALLBACK_MS);
  }, [finalizeLiveTranscript, LIVE_FINAL_FALLBACK_MS]);

  useEffect(() => {
    scheduleLiveFallbackRef.current = scheduleLiveFallback;
  }, [scheduleLiveFallback, scheduleLiveFallbackRef]);

  const resetLiveSilenceTimer = useCallback(() => {
    if (liveSilenceTimerRef.current) clearTimeout(liveSilenceTimerRef.current);
    const sessionId = liveSessionRef.current;
    liveSilenceTimerRef.current = setTimeout(() => {
      if (liveSessionRef.current !== sessionId || liveFinalizedRef.current) return;
      console.log('[VoiceOrb] 🔇 Live STT silence detected, stopping...');
      const partialSnapshot = lastPartialRef.current.trim();
      logVoiceTrace('stt_silence_timeout', { sessionId, timeoutMs: LIVE_SILENCE_TIMEOUT_MS, lastPartialChars: partialSnapshot.length, lastPartialPreview: partialSnapshot.slice(0, 120) });
      if (partialSnapshot.length > 0) {
        setStatusText('Thinking...');
        logVoiceTrace('stt_silence_finalize_partial', { sessionId, chars: partialSnapshot.length, preview: partialSnapshot.slice(0, 120) });
        stopLiveListening().catch(() => {});
        onStopListening();
        finalizeLiveTranscript(partialSnapshot);
        return;
      }
      stopLiveListening().catch(() => {});
      onStopListening();
      scheduleLiveFallback();
    }, LIVE_SILENCE_TIMEOUT_MS);
  }, [stopLiveListening, onStopListening, scheduleLiveFallback, LIVE_SILENCE_TIMEOUT_MS, logVoiceTrace, finalizeLiveTranscript, setStatusText]);

  useEffect(() => {
    resetLiveSilenceTimerRef.current = resetLiveSilenceTimer;
  }, [resetLiveSilenceTimer]);

  return {
    usingLiveSTTRef,
    liveSessionRef,
    liveFinalizedRef,
    lastPartialRef,
    liveSessionStartedAtRef,
    liveLastPartialAtRef,
    clearLiveTimers,
    logVoiceTrace,
    finalizeLiveTranscript,
    scheduleLiveFallback,
    resetLiveSilenceTimer,
    resetLiveSilenceTimerRef,
    finalizeLiveRef,
  };
}