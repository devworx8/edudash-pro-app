/**
 * useDashVoiceHandlers — callback handlers and lifecycle effects for Dash Voice.
 *
 * Extracted from app/screens/dash-voice.tsx per WARP.md guidelines.
 * Contains: stopDashActivity, voice input, greeting, composer, focus/unmount.
 */

import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { formatTranscript } from '@/lib/voice/formatTranscript';
import { shouldGreetToday, buildDynamicGreeting } from '@/lib/ai/greetingManager';
import type { SupportedLanguage } from '@/components/super-admin/voice-orb/useVoiceSTT';
import type { ConversationEntry, DashVoiceDictationProbe, PendingVoiceTurn } from './types';
import { mapVoiceError } from './voiceErrorMapper';
import {
  VOICE_COMPOSER_COMPACT_HEIGHT,
  getWebComposerHeight,
} from './composerUtils';

export interface UseDashVoiceHandlersDeps {
  profile: any; user: any; role: string; orgType: string;
  preferredLanguage: SupportedLanguage;
  setPreferredLanguage: (lang: SupportedLanguage) => void;
  isProcessing: boolean; isSpeaking: boolean; isListening: boolean; inputText: string;
  setIsListening: (v: boolean) => void;
  setIsProcessing: (v: boolean) => void;
  setStreamingText: (v: string) => void;
  setRestartBlocked: (v: boolean) => void;
  setIsSpeaking: (v: boolean) => void;
  setVoiceErrorBanner: (v: string | null) => void;
  setInputText: (v: string) => void;
  setInputHeight: React.Dispatch<React.SetStateAction<number>>;
  setLiveUserTranscript: (v: string) => void;
  setLastUserTranscript: (v: string) => void;
  setLastResponse: (v: string) => void;
  setConversationHistory: React.Dispatch<React.SetStateAction<ConversationEntry[]>>;
  setIsGreetingLoading: (v: boolean) => void;
  voiceOrbRef: React.RefObject<any>;
  isSpeakingRef: React.MutableRefObject<boolean>;
  activeRequestRef: React.MutableRefObject<{ abort: () => void } | null>;
  conversationHistoryRef: React.MutableRefObject<ConversationEntry[]>;
  pendingVoiceTurnRef: React.MutableRefObject<PendingVoiceTurn | null>;
  voiceDictationProbeRef: React.MutableRefObject<DashVoiceDictationProbe | null>;
  sendMessage: (text: string, options?: { dictationProbe?: DashVoiceDictationProbe }) => void;
  cancelSpeech: () => void;
  resetStreamingSpeech: () => void;
  logDashTrace: (event: string, payload?: Record<string, unknown>) => void;
  flowMode: { enabled: boolean; recordCorrection: (raw: string, clean: string) => void };
}

export function useDashVoiceHandlers(deps: UseDashVoiceHandlersDeps) {
  const {
    profile, user, role, orgType, preferredLanguage, setPreferredLanguage,
    isProcessing, isSpeaking, isListening, inputText,
    setIsListening, setIsProcessing, setStreamingText, setRestartBlocked,
    setIsSpeaking, setVoiceErrorBanner, setInputText, setInputHeight,
    setLiveUserTranscript, setLastUserTranscript, setLastResponse,
    setConversationHistory, setIsGreetingLoading,
    voiceOrbRef, isSpeakingRef, activeRequestRef,
    conversationHistoryRef, pendingVoiceTurnRef, voiceDictationProbeRef,
    sendMessage, cancelSpeech, resetStreamingSpeech, logDashTrace, flowMode,
  } = deps;

  // ── Greeting ──────────────────────────────────────────────────────
  const hasGreetedRef = useRef(false);
  useEffect(() => {
    if (hasGreetedRef.current || conversationHistoryRef.current.length > 0) return;
    hasGreetedRef.current = true;
    const name = profile?.first_name || profile?.full_name?.split(' ')[0] || '';
    (async () => {
      const shouldGreet = await shouldGreetToday(user?.id);
      const opener = shouldGreet
        ? buildDynamicGreeting({ userName: name || null, role, orgType, language: preferredLanguage })
        : name ? `Hey ${name}, what can I help with?` : 'What can I help with?';
      const hist: ConversationEntry[] = [{ role: 'assistant', content: opener }];
      conversationHistoryRef.current = hist;
      setConversationHistory(hist);
      setLastResponse(opener);
      setIsGreetingLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgType, preferredLanguage, profile?.first_name, profile?.full_name, role, user?.id]);

  // ── Stop Dash activity ────────────────────────────────────────────
  const stopDashActivity = useCallback(
    (reason = 'manual_stop', blockRestart = false) => {
      logDashTrace('dash_stop', { reason, blockRestart });
      if (blockRestart) setRestartBlocked(true);
      activeRequestRef.current?.abort();
      activeRequestRef.current = null;
      cancelSpeech();
      resetStreamingSpeech();
      setIsListening(false);
      setIsProcessing(false);
      setStreamingText('');
    },
    [logDashTrace, cancelSpeech, resetStreamingSpeech, setRestartBlocked, setIsListening, setIsProcessing, setStreamingText],
  );

  useFocusEffect(
    useCallback(() => {
      setRestartBlocked(false);
      return () => { stopDashActivity('navigation_blur', true); };
    }, [stopDashActivity, setRestartBlocked]),
  );

  useEffect(
    () => () => {
      activeRequestRef.current?.abort();
      stopDashActivity('unmount', true);
    },
    [stopDashActivity],
  );

  // ── Voice error ───────────────────────────────────────────────────
  const handleVoiceError = useCallback(
    (message: string) => setVoiceErrorBanner(mapVoiceError(message)),
    [setVoiceErrorBanner],
  );

  // ── Voice input ───────────────────────────────────────────────────
  const handleVoiceInput = useCallback(
    (transcript: string, language?: SupportedLanguage) => {
      const nextLanguage = language || preferredLanguage;
      const formatted = formatTranscript(transcript, language, {
        whisperFlow: true, summarize: false,
        preschoolMode: orgType === 'preschool',
        maxSummaryWords: orgType === 'preschool' ? 16 : 20,
      });
      logDashTrace('voice_input_received', {
        language: nextLanguage, rawChars: String(transcript || '').length,
        cleanChars: formatted.trim().length,
        rawPreview: String(transcript || '').slice(0, 120),
        cleanPreview: formatted.trim().slice(0, 120),
      });
      if (language) setPreferredLanguage(language);
      const cleaned = formatted.trim();
      if (!cleaned) return;
      if (flowMode.enabled) flowMode.recordCorrection(String(transcript || ''), cleaned);

      const nowIso = new Date().toISOString();
      const benchmarkRunId = String(process.env.EXPO_PUBLIC_VOICE_BENCHMARK_RUN_ID || '').trim();
      const dictationProbe: DashVoiceDictationProbe = {
        ...(voiceDictationProbeRef.current || { platform: 'mobile', source: 'dash_voice_orb' }),
        platform: 'mobile', source: 'dash_voice_orb',
        final_transcript_at: voiceDictationProbeRef.current?.final_transcript_at || nowIso,
        commit_at: nowIso,
        ...(benchmarkRunId ? { run_id: benchmarkRunId } : {}),
      };
      voiceDictationProbeRef.current = null;
      setLiveUserTranscript('');
      setLastUserTranscript(cleaned);
      if (isProcessing) {
        pendingVoiceTurnRef.current = { text: cleaned, language: nextLanguage, dictationProbe };
        logDashTrace('voice_input_queued', { reason: 'processing', language: nextLanguage, preview: cleaned.slice(0, 120) });
        return;
      }
      sendMessage(cleaned, { dictationProbe });
    },
    [isProcessing, logDashTrace, orgType, preferredLanguage, sendMessage, flowMode, setPreferredLanguage, setLiveUserTranscript, setLastUserTranscript],
  );

  // ── Flush pending voice turn when processing finishes ─────────────
  // When the AI response is done and a pending voice turn exists, wait for
  // any in-progress TTS to finish before dispatching the next turn. This
  // prevents the common "speech stop spam" where cancelSpeech() was called
  // immediately, cutting the ORB's response short.
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (isProcessing) return;
    const pendingTurn = pendingVoiceTurnRef.current;
    if (!pendingTurn) return;
    pendingVoiceTurnRef.current = null;
    if (pendingTurn.language && pendingTurn.language !== preferredLanguage)
      setPreferredLanguage(pendingTurn.language);

    const dispatch = () => {
      logDashTrace('voice_input_flushed', {
        language: pendingTurn.language || preferredLanguage, preview: pendingTurn.text.slice(0, 120),
      });
      sendMessage(pendingTurn.text, pendingTurn.dictationProbe ? { dictationProbe: pendingTurn.dictationProbe } : undefined);
    };

    // If not speaking, dispatch immediately
    if (!isSpeakingRef.current) {
      dispatch();
      return;
    }

    // Speech is active — poll until TTS finishes (max ~8s) then dispatch
    logDashTrace('voice_input_waiting_for_tts', { preview: pendingTurn.text.slice(0, 120) });
    let elapsed = 0;
    const POLL_MS = 200;
    const MAX_WAIT_MS = 8000;
    flushTimerRef.current = setInterval(() => {
      elapsed += POLL_MS;
      if (!isSpeakingRef.current || elapsed >= MAX_WAIT_MS) {
        if (flushTimerRef.current) { clearInterval(flushTimerRef.current); flushTimerRef.current = null; }
        if (isSpeakingRef.current) {
          cancelSpeech(); isSpeakingRef.current = false; setIsSpeaking(false);
          logDashTrace('dash_stop', { reason: 'flush_pending_voice_turn_timeout' });
        }
        dispatch();
      }
    }, POLL_MS);

    return () => {
      if (flushTimerRef.current) { clearInterval(flushTimerRef.current); flushTimerRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProcessing, logDashTrace, preferredLanguage, sendMessage, cancelSpeech, setIsSpeaking]);

  // ── Composer ──────────────────────────────────────────────────────
  const handleComposerTextChange = useCallback((text: string) => {
    setInputText(text);
    if (!text.trim()) { setInputHeight(VOICE_COMPOSER_COMPACT_HEIGHT); return; }
    if (Platform.OS === 'web') setInputHeight(getWebComposerHeight(text));
  }, [setInputText, setInputHeight]);

  const handleSubmit = useCallback(() => {
    if (inputText.trim()) {
      sendMessage(inputText); setInputText(''); setInputHeight(VOICE_COMPOSER_COMPACT_HEIGHT);
    }
  }, [inputText, sendMessage, setInputText, setInputHeight]);

  const handleInputFocus = useCallback(() => {
    if (isSpeakingRef.current || isSpeaking) {
      voiceOrbRef.current?.stopSpeaking?.().catch(() => {});
      logDashTrace('dash_stop', { reason: 'input_focus_stop_speaking' });
    }
    if (isListening) {
      voiceOrbRef.current?.stopListening?.().catch(() => {});
      setIsListening(false);
      logDashTrace('dash_stop', { reason: 'input_focus_stop_listening' });
    }
  }, [isListening, isSpeaking, logDashTrace, setIsListening]);

  return {
    stopDashActivity, handleVoiceError, handleVoiceInput,
    handleComposerTextChange, handleSubmit, handleInputFocus,
  };
}
