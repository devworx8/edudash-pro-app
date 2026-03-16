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
  setMuted: (muted: boolean) => Promise<void>;
  /** Ref set to Date.now() + grace_ms when TTS ends; onTranscript is gated until this timestamp */
  postTTSSilentUntilRef: React.MutableRefObject<number>;
  /** Optional external ref for TTS playback tracking */
  ttsPlaybackActiveRef?: React.MutableRefObject<boolean>;
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
  setMuted,
  postTTSSilentUntilRef,
  ttsPlaybackActiveRef: externalPlaybackActiveRef,
}: TTSHandlerParams) {
  const autoRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** True while the speakText imperative handle is executing (Azure request + audio playback).
   *  Prevents the barge-in listen effect from starting recording during TTS. */
  const internalPlaybackActiveRef = useRef(false);
  const ttsPlaybackActiveRef = externalPlaybackActiveRef ?? internalPlaybackActiveRef;
  // Delay before re-enabling mic after TTS ends — long enough for speaker echo to die down
  const AUTO_RESTART_DELAY_MS = 1500;
  // How long (ms) to gate onTranscript after TTS ends to prevent echo self-interruption
  const POST_TTS_ECHO_GATE_MS = 2000;

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
      ttsPlaybackActiveRef.current = true;
      await suspendListeningForTTS();
      onTTSStart?.();
      try {
        const ttsLanguage = language || lastDetectedLanguage || selectedLanguage;
        console.log('[VoiceOrb] Speaking with language:', ttsLanguage);
        await speak(text, ttsLanguage, { ...options, onBeforePlay: suspendListeningForTTS });
      } finally {
        ttsPlaybackActiveRef.current = false;
        onTTSEnd?.();
      }
    },
    stopSpeaking: async () => {
      await stopSpeaking();
    },
    setMuted: async (muted: boolean) => {
      await setMuted(muted);
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
    get isMuted() { return isMuted; },
  }), [speak, stopSpeaking, ttsIsSpeaking, selectedLanguage, onTTSStart, onTTSEnd, suspendListeningForTTS, handlePrimaryActionRef, handleStartRecordingRef, recorderState.isRecording, recorderActions, cancelLiveListening, clearLiveTimers, onStopListening, lastDetectedLanguage, setStatusText, setUsingLiveSTT, usingLiveSTTRef, setMuted, isMuted, ttsPlaybackActiveRef]);

  const cancelAutoRestart = useCallback(() => {
    if (autoRestartTimerRef.current) {
      clearTimeout(autoRestartTimerRef.current);
      autoRestartTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (ttsIsSpeaking || isSpeaking) {
      if (isMuted) {
        if (recorderState.isRecording) {
          console.log('[VoiceOrb] 🔇 Stopping recording - TTS starting while muted');
          recorderActions.stopRecording();
          onStopListening();
        }
        if (usingLiveSTTRef.current) {
          console.log('[VoiceOrb] 🔇 Stopping live STT - TTS starting while muted');
          cancelLiveListening().catch(() => {});
          clearLiveTimers();
          setUsingLiveSTT(false);
          onStopListening();
        }
      }
      setStatusText('Speaking...');
      onTTSStart?.();
    } else {
      onTTSEnd?.();
    }
  }, [ttsIsSpeaking, isSpeaking, recorderState.isRecording, recorderActions, onStopListening, onTTSStart, onTTSEnd, cancelLiveListening, clearLiveTimers, isMuted, setStatusText, setUsingLiveSTT, usingLiveSTTRef]);

  const scheduleAutoRestart = useCallback((source: string) => {
    cancelAutoRestart();
    autoRestartTimerRef.current = setTimeout(() => {
      autoRestartTimerRef.current = null;
      if (isMuted) {
        console.log(`[VoiceOrb] auto-restart blocked (muted, source=${source})`);
        return;
      }
      if (!isSpeaking && !ttsIsSpeaking && !restartBlockedRef.current && !isListening && !recorderState.isRecording && !usingLiveSTTRef.current && !isParentProcessing) {
        console.log(`[VoiceOrb] auto-restart (${source})`);
        handleStartRecordingRef.current?.();
      }
    }, AUTO_RESTART_DELAY_MS);
  }, [cancelAutoRestart, isMuted, isSpeaking, ttsIsSpeaking, isListening, recorderState.isRecording, isParentProcessing, restartBlockedRef, usingLiveSTTRef, handleStartRecordingRef]);

  // Auto-restart after TTS finishes
  const prevTtsSpeaking = useRef(ttsIsSpeaking);
  useEffect(() => {
    if (prevTtsSpeaking.current && !ttsIsSpeaking && !isSpeaking && autoRestartAfterTTS && !isProcessing && !restartBlocked) {
      // Set echo gate so any transcript picked up right after TTS ends is discarded
      postTTSSilentUntilRef.current = Date.now() + POST_TTS_ECHO_GATE_MS;
      if (skipNextAutoRestartRef.current) {
        skipNextAutoRestartRef.current = false;
        prevTtsSpeaking.current = ttsIsSpeaking;
        return;
      }
      scheduleAutoRestart('tts-stop');
    }
    prevTtsSpeaking.current = ttsIsSpeaking;
  }, [isSpeaking, ttsIsSpeaking, autoRestartAfterTTS, isProcessing, restartBlocked, scheduleAutoRestart, skipNextAutoRestartRef, postTTSSilentUntilRef, POST_TTS_ECHO_GATE_MS]);

  // Auto-restart after transcription completes
  const prevIsProcessingRef = useRef(isProcessing);
  const prevIsParentProcessingRef = useRef(isParentProcessing);
  useEffect(() => {
    if (prevIsProcessingRef.current && !isProcessing && !isSpeaking && !ttsIsSpeaking && autoRestartAfterTTS && !restartBlocked) {
      scheduleAutoRestart('transcription-end');
    }
    prevIsProcessingRef.current = isProcessing;
  }, [isProcessing, isSpeaking, ttsIsSpeaking, autoRestartAfterTTS, restartBlocked, scheduleAutoRestart]);

  // Auto-restart after parent finishes processing
  useEffect(() => {
    if (prevIsParentProcessingRef.current && !isParentProcessing && !isSpeaking && !ttsIsSpeaking && autoRestartAfterTTS && !restartBlocked) {
      scheduleAutoRestart('parent-done');
    }
    prevIsParentProcessingRef.current = isParentProcessing;
  }, [isParentProcessing, isSpeaking, ttsIsSpeaking, autoRestartAfterTTS, restartBlocked, scheduleAutoRestart]);

  // Cleanup timer on unmount
  useEffect(() => () => { cancelAutoRestart(); }, [cancelAutoRestart]);

  return { suspendListeningForTTS, scheduleAutoRestart, cancelAutoRestart, ttsPlaybackActiveRef };
}
