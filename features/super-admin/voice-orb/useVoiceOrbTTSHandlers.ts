import { useRef, useCallback, useEffect, useImperativeHandle } from 'react';
import type { SupportedLanguage } from '@/components/super-admin/voice-orb/useVoiceSTT';
import type { TTSOptions } from '@/components/super-admin/voice-orb/useVoiceTTS';
import type { VoiceOrbRef } from './types';

interface TTSHandlerParams {
  ref: React.ForwardedRef<VoiceOrbRef>;
  recorderState: { isRecording: boolean };
  recorderActions: { stopRecording: () => Promise<string | null> };
  usingLiveSTTRef: React.MutableRefObject<boolean>;
  cancelLiveListening: () => Promise<void>;
  clearLiveTimers: () => void;
  setUsingLiveSTT: (v: boolean) => void;
  onStopListening: () => void;
  setStatusText: (v: string) => void;
  isSpeaking: boolean;
  ttsIsSpeaking: boolean;
  isListening: boolean;
  isMuted: boolean;
  isProcessing: boolean;
  isParentProcessing: boolean;
  restartBlocked: boolean;
  restartBlockedRef: React.MutableRefObject<boolean>;
  autoStartListening: boolean;
  autoRestartAfterTTS: boolean;
  speak: (text: string, language?: SupportedLanguage, options?: TTSOptions) => Promise<void>;
  stopSpeaking: () => Promise<void>;
  selectedLanguage: SupportedLanguage;
  lastDetectedLanguage: SupportedLanguage | null;
  onTTSStart?: () => void;
  onTTSEnd?: () => void;
  handleStartRecordingRef: React.MutableRefObject<(() => Promise<void>) | null>;
  handlePrimaryActionRef: React.MutableRefObject<(() => Promise<void>) | null>;
  skipNextAutoRestartRef: React.MutableRefObject<boolean>;
}

export function useVoiceOrbTTSHandlers({
  ref,
  recorderState,
  recorderActions,
  usingLiveSTTRef,
  cancelLiveListening,
  clearLiveTimers,
  setUsingLiveSTT,
  onStopListening,
  setStatusText,
  isSpeaking,
  ttsIsSpeaking,
  isListening,
  isMuted,
  isProcessing,
  isParentProcessing,
  restartBlocked,
  restartBlockedRef,
  autoStartListening,
  autoRestartAfterTTS,
  speak,
  stopSpeaking,
  selectedLanguage,
  lastDetectedLanguage,
  onTTSStart,
  onTTSEnd,
  handleStartRecordingRef,
  handlePrimaryActionRef,
  skipNextAutoRestartRef,
}: TTSHandlerParams) {
  const autoRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const AUTO_RESTART_DELAY_MS = 400;

  const suspendListeningForTTS = useCallback(async () => {
    if (recorderState.isRecording) {
      try {
        await recorderActions.stopRecording();
      } catch (stopError) {
        console.warn('[VoiceOrb] Failed to stop recorder before TTS:', stopError);
      }
    }
    if (usingLiveSTTRef.current) {
      try {
        await cancelLiveListening();
      } catch (stopError) {
        console.warn('[VoiceOrb] Failed to cancel live STT before TTS:', stopError);
      }
      clearLiveTimers();
      setUsingLiveSTT(false);
    }
    onStopListening();
    setStatusText('Speaking...');
  }, [cancelLiveListening, clearLiveTimers, onStopListening, recorderActions, recorderState.isRecording, setStatusText, setUsingLiveSTT, usingLiveSTTRef]);

  useImperativeHandle(ref, () => ({
    speakText: async (text: string, language?: SupportedLanguage, options?: TTSOptions) => {
      await suspendListeningForTTS();
      onTTSStart?.();
      try {
        const ttsLanguage = language || lastDetectedLanguage || selectedLanguage;
        console.log('[VoiceOrb] Speaking with language:', ttsLanguage);
        await speak(text, ttsLanguage, options);
      } finally {
        onTTSEnd?.();
      }
    },
    stopSpeaking: async () => {
      await stopSpeaking();
    },
    startListening: async () => {
      await handleStartRecordingRef.current?.();
    },
    stopListening: async () => {
      console.log('[VoiceOrb] stopListening reason=external_stop');
      if (recorderState.isRecording) {
        try { await recorderActions.stopRecording(); } catch (stopErr) { console.warn('[VoiceOrb] stopListening recorder stop failed:', stopErr); }
      }
      if (usingLiveSTTRef.current) {
        try { await cancelLiveListening(); } catch (stopErr) { console.warn('[VoiceOrb] stopListening live STT cancel failed:', stopErr); }
        clearLiveTimers();
        setUsingLiveSTT(false);
      }
      onStopListening();
      setStatusText('Listening...');
    },
    toggleListening: async () => {
      await handlePrimaryActionRef.current?.();
    },
    get isSpeaking() { return ttsIsSpeaking; },
  }), [speak, stopSpeaking, ttsIsSpeaking, selectedLanguage, onTTSStart, onTTSEnd, suspendListeningForTTS, handlePrimaryActionRef, handleStartRecordingRef, recorderState.isRecording, recorderActions, cancelLiveListening, clearLiveTimers, onStopListening, lastDetectedLanguage, setStatusText, setUsingLiveSTT, usingLiveSTTRef]);

  // CRITICAL: Stop recording when TTS starts to prevent feedback loop
  useEffect(() => {
    if (ttsIsSpeaking || isSpeaking) {
      if (recorderState.isRecording) {
        console.log('[VoiceOrb] 🔇 Stopping recording - TTS starting (prevent feedback)');
        recorderActions.stopRecording();
        onStopListening();
      }
      if (usingLiveSTTRef.current) {
        console.log('[VoiceOrb] 🔇 Stopping live STT - TTS starting (prevent feedback)');
        cancelLiveListening().catch(() => {});
        clearLiveTimers();
        setUsingLiveSTT(false);
        onStopListening();
      }
      setStatusText('Speaking...');
      onTTSStart?.();
    } else {
      onTTSEnd?.();
    }
  }, [ttsIsSpeaking, isSpeaking, recorderState.isRecording, recorderActions, onStopListening, onTTSStart, onTTSEnd, cancelLiveListening, clearLiveTimers, setStatusText, setUsingLiveSTT, usingLiveSTTRef]);

  const scheduleAutoRestart = useCallback((source: string) => {
    if (autoRestartTimerRef.current) clearTimeout(autoRestartTimerRef.current);
    autoRestartTimerRef.current = setTimeout(() => {
      autoRestartTimerRef.current = null;
      if (!isSpeaking && !ttsIsSpeaking && !isMuted && !restartBlockedRef.current && !isListening && !recorderState.isRecording && !usingLiveSTTRef.current && !isParentProcessing) {
        console.log(`[VoiceOrb] auto-restart (${source})`);
        handleStartRecordingRef.current?.();
      }
    }, AUTO_RESTART_DELAY_MS);
  }, [isSpeaking, ttsIsSpeaking, isMuted, isListening, recorderState.isRecording, isParentProcessing, restartBlockedRef, usingLiveSTTRef, handleStartRecordingRef]);

  // Auto-restart after TTS finishes
  const prevTtsSpeaking = useRef(ttsIsSpeaking);
  useEffect(() => {
    if (prevTtsSpeaking.current && !ttsIsSpeaking && !isSpeaking && autoRestartAfterTTS && !isMuted && !isProcessing && !restartBlocked) {
      if (skipNextAutoRestartRef.current) {
        skipNextAutoRestartRef.current = false;
        prevTtsSpeaking.current = ttsIsSpeaking;
        return;
      }
      scheduleAutoRestart('tts-stop');
    }
    prevTtsSpeaking.current = ttsIsSpeaking;
  }, [isSpeaking, ttsIsSpeaking, autoRestartAfterTTS, isMuted, isProcessing, restartBlocked, scheduleAutoRestart, skipNextAutoRestartRef]);

  // Auto-restart after transcription completes
  const prevIsProcessingRef = useRef(isProcessing);
  const prevIsParentProcessingRef = useRef(isParentProcessing);
  useEffect(() => {
    if (prevIsProcessingRef.current && !isProcessing && !isSpeaking && !ttsIsSpeaking && !isMuted && autoRestartAfterTTS && !restartBlocked) {
      scheduleAutoRestart('transcription-end');
    }
    prevIsProcessingRef.current = isProcessing;
  }, [isProcessing, isSpeaking, ttsIsSpeaking, isMuted, autoRestartAfterTTS, restartBlocked, scheduleAutoRestart]);

  // Auto-restart after parent finishes processing
  useEffect(() => {
    if (prevIsParentProcessingRef.current && !isParentProcessing && !isSpeaking && !ttsIsSpeaking && !isMuted && autoRestartAfterTTS && !restartBlocked) {
      scheduleAutoRestart('parent-done');
    }
    prevIsParentProcessingRef.current = isParentProcessing;
  }, [isParentProcessing, isSpeaking, ttsIsSpeaking, isMuted, autoRestartAfterTTS, restartBlocked, scheduleAutoRestart]);

  // Cleanup timer on unmount
  useEffect(() => () => { if (autoRestartTimerRef.current) clearTimeout(autoRestartTimerRef.current); }, []);

  return { suspendListeningForTTS, scheduleAutoRestart };
}
