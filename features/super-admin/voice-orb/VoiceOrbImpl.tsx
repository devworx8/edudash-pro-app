/**
 * VoiceOrb - Main component (refactored into voice-orb/ subfolder)
 *
 * Integrates with Azure Speech Services for STT/TTS.
 * Split per WARP.md: types → types.ts, animation → useVoiceOrbAnimations,
 * live-STT session → useVoiceOrbLiveSession, TTS/auto-restart → useVoiceOrbTTSHandlers
 */

import { useState, useCallback, useEffect, forwardRef, useRef, memo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useOnDeviceVoice } from '@/hooks/useOnDeviceVoice';

import { styles, COLORS, ORB_SIZE } from '@/components/super-admin/voice-orb/VoiceOrb.styles';
import {
  FloatingParticle,
  ShootingStar,
  PulsingRing,
} from '@/components/super-admin/voice-orb/VoiceOrbAnimations';
import { useVoiceRecorder } from '@/components/super-admin/voice-orb/useVoiceRecorder';
import { useVoiceSTT, type SupportedLanguage, type TranscribeLanguage } from '@/components/super-admin/voice-orb/useVoiceSTT';
import { useVoiceTTS } from '@/components/super-admin/voice-orb/useVoiceTTS';
import { canAutoRestartAfterInterrupt, INTERRUPT_RESTART_DELAY_MS } from '@/components/super-admin/voice-orb/interrupt';

import type { VoiceOrbRef, VoiceOrbProps } from './types';
import { useVoiceOrbLiveSession } from './useVoiceOrbLiveSession';
import { useVoiceOrbAnimations } from './useVoiceOrbAnimations';
import { useVoiceOrbTTSHandlers } from './useVoiceOrbTTSHandlers';

// ============================================================================
// Main Component
// ============================================================================

const VoiceOrb = forwardRef<VoiceOrbRef, VoiceOrbProps>(({
  isListening,
  isSpeaking,
  isParentProcessing = false,
  onStartListening,
  onStopListening,
  onPartialTranscript,
  onTranscript,
  onTTSStart,
  onTTSEnd,
  onVoiceError,
  onMuteChange,
  language: externalLanguage,
  size = ORB_SIZE,
  autoStartListening = true,
  autoRestartAfterTTS = true,
  restartBlocked = false,
  preschoolMode = false,
  showLiveTranscript = true,
}, ref) => {
  const { theme } = useTheme();
  const { profile } = useAuth();
  const tenantId = profile?.organization_id || profile?.preschool_id || null;

  // State
  const [statusText, setStatusText] = useState('Listening...');
  const hasAutoStarted = useRef(false);
  const [selectedLanguage, setSelectedLanguage] = useState<SupportedLanguage>('en-ZA');
  const [lastDetectedLanguage, setLastDetectedLanguage] = useState<SupportedLanguage | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [usingLiveSTT, setUsingLiveSTT] = useState(false);

  // Sync external language
  useEffect(() => {
    if (externalLanguage && externalLanguage !== selectedLanguage) {
      setSelectedLanguage(externalLanguage);
    }
  }, [externalLanguage, selectedLanguage]);

  // Config constants
  const LIVE_TRANSCRIPTION_ENABLED = process.env.EXPO_PUBLIC_VOICE_LIVE_TRANSCRIPTION_ENABLED !== 'false';
  const VOICE_TRACE_ENABLED = __DEV__ || process.env.EXPO_PUBLIC_DASH_VOICE_TRACE === 'true';
  const defaultLiveSilenceMs = preschoolMode ? 3000 : 2400;
  const liveSilenceTimeoutRaw = Number.parseInt(process.env.EXPO_PUBLIC_VOICE_LIVE_SILENCE_TIMEOUT_MS || String(defaultLiveSilenceMs), 10);
  const liveSilenceMin = preschoolMode ? 2500 : 2000;
  const LIVE_SILENCE_TIMEOUT_MS = Number.isFinite(liveSilenceTimeoutRaw) ? Math.min(12000, Math.max(liveSilenceMin, liveSilenceTimeoutRaw)) : defaultLiveSilenceMs;
  const defaultFinalFallbackMs = preschoolMode ? 420 : 320;
  const liveFinalFallbackRaw = Number.parseInt(process.env.EXPO_PUBLIC_VOICE_LIVE_FINAL_FALLBACK_MS || String(defaultFinalFallbackMs), 10);
  const LIVE_FINAL_FALLBACK_MS = Number.isFinite(liveFinalFallbackRaw) ? Math.min(3000, Math.max(250, liveFinalFallbackRaw)) : defaultFinalFallbackMs;

  // Voice hooks
  const transcribeRef = useRef<((uri: string) => Promise<void>) | null>(null);
  const handleSilenceDetected = useCallback(() => { transcribeRef.current?.('silence'); }, []);

  const [recorderState, recorderActions] = useVoiceRecorder(
    handleSilenceDetected,
    preschoolMode ? { speechThreshold: -35, silenceDuration: 3000 } : { speechThreshold: -30, silenceDuration: 2400 },
  );
  const { transcribe, isTranscribing, error: sttError } = useVoiceSTT({ preschoolId: tenantId });
  const { speak, stop: stopSpeaking, isSpeaking: ttsIsSpeaking, error: ttsError } = useVoiceTTS();

  const isSpeakingRef = useRef(isSpeaking);
  const ttsSpeakingRef = useRef(ttsIsSpeaking);
  const restartBlockedRef = useRef(restartBlocked);
  const skipNextAutoRestartRef = useRef(false);
  /** Timestamp until which transcripts are discarded (post-TTS echo gate) */
  const postTTSSilentUntilRef = useRef<number>(0);
  const handleStartRecordingRef = useRef<(() => Promise<void>) | null>(null);
  const handlePrimaryActionRef = useRef<(() => Promise<void>) | null>(null);
  const scheduleLiveFallbackRef = useRef<(() => void) | null>(null);
  const ttsStartedAtRef = useRef<number | null>(null);
  const bargeInTriggeredRef = useRef(false);

  useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking]);
  useEffect(() => { ttsSpeakingRef.current = ttsIsSpeaking; }, [ttsIsSpeaking]);
  useEffect(() => { restartBlockedRef.current = restartBlocked; }, [restartBlocked]);

  useEffect(() => {
    if (isSpeaking || ttsIsSpeaking) {
      if (ttsStartedAtRef.current == null) ttsStartedAtRef.current = Date.now();
      bargeInTriggeredRef.current = false;
      return;
    }
    ttsStartedAtRef.current = null;
    bargeInTriggeredRef.current = false;
  }, [isSpeaking, ttsIsSpeaking]);

  // Wrap onTranscript to silently drop echo after TTS ends
  const safeOnTranscript = useCallback((text: string, lang?: SupportedLanguage, meta?: Parameters<typeof onTranscript>[2]) => {
    if (Date.now() < postTTSSilentUntilRef.current) {
      if (__DEV__) console.log('[VoiceOrb] 🔇 Post-TTS echo gate — discarding transcript to prevent self-interruption');
      return;
    }
    onTranscript(text, lang, meta);
  }, [onTranscript]);

  const bargeInGraceMsRef = useRef(
    Number.parseInt(String(process.env.EXPO_PUBLIC_VOICE_BARGE_IN_GRACE_MS || '2500'), 10) || 2500
  );
  const shouldTriggerBargeIn = useCallback((text: string) => {
    const spoken = String(text || '').trim();
    if (isMuted || !spoken) return false;
    if (!(isSpeakingRef.current || ttsSpeakingRef.current)) return false;
    if (bargeInTriggeredRef.current) return false;
    const ttsStartedAt = ttsStartedAtRef.current;
    if (ttsStartedAt != null && Date.now() - ttsStartedAt < 2000) return false;
    return spoken.length >= 10;
  }, [isMuted]);

  const triggerBargeIn = useCallback(async (text: string) => {
    if (!shouldTriggerBargeIn(text)) return;
    bargeInTriggeredRef.current = true;
    console.log('[VoiceOrb] 🎙️ Auto barge-in detected - stopping TTS');
    try {
      await stopSpeaking();
    } catch (stopError) {
      console.warn('[VoiceOrb] Failed to stop TTS during auto barge-in:', stopError);
    }
    setStatusText('Listening...');
  }, [setStatusText, shouldTriggerBargeIn, stopSpeaking]);

  // Error effects
  useEffect(() => {
    if (!sttError) return;
    setStatusText('Voice recognition error');
    onVoiceError?.(sttError);
    const timer = setTimeout(() => setStatusText('Listening...'), 2500);
    return () => clearTimeout(timer);
  }, [sttError, onVoiceError]);

  useEffect(() => {
    if (!ttsError) return;
    skipNextAutoRestartRef.current = true;
    setStatusText('Voice synthesis error');
    onVoiceError?.(ttsError);
    const timer = setTimeout(() => setStatusText('Listening...'), 3000);
    return () => clearTimeout(timer);
  }, [ttsError, onVoiceError]);

  useEffect(() => {
    if (isParentProcessing) { setStatusText('Thinking...'); return; }
    if (isTranscribing || isSpeaking || ttsIsSpeaking) return;
    if (!recorderState.isRecording && !usingLiveSTT) setStatusText('Listening...');
  }, [isParentProcessing, isTranscribing, isSpeaking, ttsIsSpeaking, recorderState.isRecording, usingLiveSTT]);

  // Live session hook
  const {
    usingLiveSTTRef,
    liveSessionRef,
    liveFinalizedRef,
    lastPartialRef,
    liveSessionStartedAtRef,
    liveLastPartialAtRef,
    clearLiveTimers,
    logVoiceTrace,
    resetLiveSilenceTimerRef,
    finalizeLiveRef,
  } = useVoiceOrbLiveSession({
    stopLiveListening: async () => { await stopLiveListening(); },
    onPartialTranscript,
    onTranscript: safeOnTranscript,
    onStopListening,
    selectedLanguage,
    profile,
    setLastDetectedLanguage,
    setUsingLiveSTT,
    setIsProcessing,
    setStatusText,
    setLiveTranscript,
    VOICE_TRACE_ENABLED,
    LIVE_SILENCE_TIMEOUT_MS,
    LIVE_FINAL_FALLBACK_MS,
    scheduleLiveFallbackRef,
  });

  // Keep usingLiveSTTRef in sync with usingLiveSTT state
  useEffect(() => { usingLiveSTTRef.current = usingLiveSTT; }, [usingLiveSTT, usingLiveSTTRef]);

  // On-device voice (must be after live session hook so refs are ready)
  const {
    isAvailable: liveAvailable,
    startListening: startLiveListening,
    stopListening: stopLiveListening,
    cancelListening: cancelLiveListening,
    clearResults: clearLiveResults,
  } = useOnDeviceVoice({
    language: selectedLanguage,
    onPartialResult: (text) => {
      if (!usingLiveSTTRef.current) return;
      void triggerBargeIn(text);
      // Guard: don't overwrite accumulated speech with an empty reset from the STT engine.
      // On-device STT occasionally resets its buffer mid-sentence and emits an empty partial;
      // preserving lastPartialRef here ensures the silence handler still has real speech to finalize.
      if (text) {
        lastPartialRef.current = text;
        liveLastPartialAtRef.current = Date.now();
        // Only reset silence timer on real speech — don't extend the window for empty resets
        resetLiveSilenceTimerRef.current?.();
      }
      setLiveTranscript(text);
      onPartialTranscript?.(text, selectedLanguage);
      logVoiceTrace('stt_partial', { sessionId: liveSessionRef.current, chars: text.length, preview: text.slice(0, 80) });
    },
    onFinalResult: (text) => {
      if (!usingLiveSTTRef.current) return;
      void triggerBargeIn(text);
      logVoiceTrace('stt_final_event', { sessionId: liveSessionRef.current, chars: text.length, preview: text.slice(0, 80) });
      finalizeLiveRef.current?.(text);
    },
    onError: (errorMsg) => {
      console.warn('[VoiceOrb] Live STT error:', errorMsg);
      logVoiceTrace('stt_error', { sessionId: liveSessionRef.current, error: errorMsg });
      if (usingLiveSTTRef.current) setUsingLiveSTT(false);
      setStatusText('Voice recognition error');
      onVoiceError?.(errorMsg);
    },
  });

  // handleStopAndTranscribe
  const handleStopAndTranscribe = useCallback(async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      if (usingLiveSTTRef.current) {
        setStatusText('Thinking...');
        try { await stopLiveListening(); } catch (stopError) { console.warn('[VoiceOrb] Live STT stop failed:', stopError); }
        onStopListening();
        scheduleLiveFallbackRef.current?.();
        return;
      }
      const uri = await recorderActions.stopRecording();
      onStopListening();
      if (!uri) {
        setStatusText('No audio recorded');
        setTimeout(() => setStatusText('Listening...'), 2000);
        return;
      }
      setStatusText('Transcribing...');
      const sttLanguage: TranscribeLanguage = selectedLanguage === 'en-ZA' ? 'auto' : selectedLanguage;
      const result = await transcribe(uri, sttLanguage, { includeAudioBase64: true });
      if (result?.text) {
        const detected = result.language;
        if (detected === 'en-ZA' || detected === 'af-ZA' || detected === 'zu-ZA') setLastDetectedLanguage(detected);
        safeOnTranscript(result.text, result.language as SupportedLanguage | undefined, { source: 'recorded', capturedAt: Date.now(), audioBase64: result.audio_base64, audioContentType: result.audio_content_type });
        setStatusText('Listening...');
      } else {
        setStatusText('No speech detected');
        setTimeout(() => setStatusText('Listening...'), 2000);
      }
    } finally {
      if (!usingLiveSTTRef.current) setIsProcessing(false);
    }
  }, [recorderActions, onStopListening, transcribe, selectedLanguage, safeOnTranscript, isProcessing, stopLiveListening, usingLiveSTTRef, setLastDetectedLanguage]);

  useEffect(() => { transcribeRef.current = handleStopAndTranscribe; }, [handleStopAndTranscribe]);

  const applyMuteState = useCallback(async (nextMuted: boolean) => {
    setIsMuted(nextMuted);
    onMuteChange?.(nextMuted);

    if (nextMuted) {
      if (recorderState.isRecording) {
        try {
          await recorderActions.stopRecording();
        } catch (stopError) {
          console.warn('[VoiceOrb] Failed to stop recorder while muting:', stopError);
        }
      }
      if (usingLiveSTTRef.current) {
        try {
          await cancelLiveListening();
        } catch (stopError) {
          console.warn('[VoiceOrb] Failed to stop live STT while muting:', stopError);
        }
        clearLiveTimers();
        setUsingLiveSTT(false);
      }
      onStopListening();
      setStatusText('Barge-in off');
      return;
    }

    if (!restartBlockedRef.current && !isProcessing && !isParentProcessing) {
      setTimeout(() => {
        if (!restartBlockedRef.current && !isSpeakingRef.current && !ttsSpeakingRef.current) {
          handleStartRecordingRef.current?.();
        }
      }, 120);
    }

    if (isParentProcessing) {
      setStatusText('Thinking...');
      return;
    }

    if (isSpeaking || ttsIsSpeaking) {
      setStatusText('Speaking...');
      return;
    }

    if (isProcessing) {
      setStatusText('Transcribing...');
      return;
    }

    setStatusText('Listening...');
  }, [
    cancelLiveListening,
    clearLiveTimers,
    isParentProcessing,
    isProcessing,
    isSpeaking,
    onMuteChange,
    onStopListening,
    recorderActions,
    recorderState.isRecording,
    restartBlockedRef,
    setUsingLiveSTT,
    setStatusText,
    ttsIsSpeaking,
    usingLiveSTTRef,
  ]);

  // TTS handlers + auto-restart (imperative handle, feedback prevention, auto-restart effects)
  const { cancelAutoRestart } = useVoiceOrbTTSHandlers({
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
    setMuted: applyMuteState,
    postTTSSilentUntilRef,
  });

  // Derived sizes
  const orbSize = Math.max(110, size);
  const ringThickness = Math.max(10, Math.round(orbSize * 0.08));
  const innerSize = orbSize - ringThickness * 2;
  const coreSize = Math.max(44, Math.round(orbSize * 0.32));

  // Animations
  const { orbScaleStyle, ringRotateStyle, auraRotateStyle, particles, shootingStars, rings, starfield } = useVoiceOrbAnimations({
    isListening,
    isSpeaking,
    ttsIsSpeaking,
    isParentProcessing,
    recorderState,
    usingLiveSTT,
    liveTranscript,
    orbSize,
    innerSize,
  });

  // handleStartRecording
  const handleStartRecording = useCallback(async () => {
    const allowBargeInStart = (isSpeaking || ttsIsSpeaking) && !isMuted && LIVE_TRANSCRIPTION_ENABLED && liveAvailable;
    if ((isSpeaking || ttsIsSpeaking) && !allowBargeInStart) {
      console.log('[VoiceOrb] 🚫 Blocking record start - TTS is playing and barge-in listening is unavailable');
      return;
    }
    if (restartBlockedRef.current) {
      console.log('[VoiceOrb] 🚫 Blocking record start - restart blocked by parent transition');
      return;
    }
    if (isProcessing || isListening || recorderState.isRecording || usingLiveSTTRef.current) {
      console.log('[VoiceOrb] Skipping start - processing:', isProcessing, 'recording:', recorderState.isRecording);
      return;
    }
    console.log('[VoiceOrb] 🎤 Starting recording', allowBargeInStart ? '(barge-in monitor)' : '(normal)');

    if (LIVE_TRANSCRIPTION_ENABLED && liveAvailable) {
      liveSessionRef.current += 1;
      liveFinalizedRef.current = false;
      lastPartialRef.current = '';
      liveSessionStartedAtRef.current = Date.now();
      liveLastPartialAtRef.current = null;
      logVoiceTrace('stt_session_start', { sessionId: liveSessionRef.current, language: selectedLanguage, liveSilenceTimeoutMs: LIVE_SILENCE_TIMEOUT_MS, finalFallbackMs: LIVE_FINAL_FALLBACK_MS });
      setLiveTranscript('');
      clearLiveTimers();
      clearLiveResults();
      setUsingLiveSTT(true);
      try {
        await startLiveListening();
        onStartListening();
        setStatusText('Listening...');
        return;
      } catch (liveError) {
        console.warn('[VoiceOrb] Live STT start failed, falling back to audio:', liveError);
        onVoiceError?.(liveError instanceof Error ? liveError.message : 'Live voice recognition unavailable');
        setUsingLiveSTT(false);
      }
    }

    const success = await recorderActions.startRecording();
    if (success) {
      onStartListening();
      setStatusText('Listening...');
    } else {
      setStatusText('Microphone permission denied');
      onVoiceError?.('Microphone permission denied');
      setTimeout(() => setStatusText('Listening...'), 2000);
    }
  }, [
    isProcessing, isListening, recorderState.isRecording, recorderActions,
    onStartListening, isSpeaking, ttsIsSpeaking, liveAvailable, startLiveListening,
    clearLiveResults, clearLiveTimers, onVoiceError, logVoiceTrace, selectedLanguage,
    LIVE_SILENCE_TIMEOUT_MS, LIVE_FINAL_FALLBACK_MS, usingLiveSTTRef, liveSessionRef,
    liveFinalizedRef, lastPartialRef, liveSessionStartedAtRef, liveLastPartialAtRef,
    restartBlockedRef, LIVE_TRANSCRIPTION_ENABLED, isMuted,
  ]);

  useEffect(() => { handleStartRecordingRef.current = handleStartRecording; }, [handleStartRecording]);

  // Auto-start on mount
  useEffect(() => {
    if (autoStartListening && !hasAutoStarted.current && !isSpeaking && !ttsIsSpeaking && !restartBlocked) {
      hasAutoStarted.current = true;
      console.log('[VoiceOrb] Auto-starting listening on mount...');
      const timer = setTimeout(() => {
        if (!isSpeaking && !ttsIsSpeaking && !restartBlockedRef.current) handleStartRecordingRef.current?.();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [autoStartListening, isSpeaking, ttsIsSpeaking, restartBlocked]);

  // Handle orb press
  const handlePress = useCallback(async () => {
    if (isSpeaking || ttsIsSpeaking) {
      if (isMuted) {
        setStatusText('Barge-in off');
        return;
      }
      console.log('[VoiceOrb] 🛑 User interrupted TTS - stopping speech');
      await stopSpeaking();
      if (recorderState.isRecording) {
        try { await recorderActions.stopRecording(); } catch { /* best-effort */ }
      }
      if (usingLiveSTTRef.current) {
        try { await cancelLiveListening(); } catch { /* best-effort */ }
        clearLiveTimers();
        setUsingLiveSTT(false);
      }
      onStopListening();
      setStatusText('Listening...');
      setTimeout(() => {
        if (restartBlockedRef.current || isMuted) {
          console.log('[VoiceOrb] Interrupt restart blocked (restartBlocked or muted)');
          return;
        }
        if (canAutoRestartAfterInterrupt({ isMuted, isProcessing, isRecording: false, usingLiveSTT: false, isSpeaking: false, ttsIsSpeaking: false })) {
          console.log('[VoiceOrb] ✅ Interrupt → restart listening');
          handleStartRecordingRef.current?.();
        }
      }, INTERRUPT_RESTART_DELAY_MS);
      return;
    }
    if (isListening || recorderState.isRecording || usingLiveSTTRef.current) {
      handleStopAndTranscribe();
    } else if (!isSpeaking && !ttsIsSpeaking) {
      handleStartRecording();
    }
  }, [
    handleStartRecording,
    handleStopAndTranscribe,
    isListening,
    isMuted,
    isProcessing,
    isSpeaking,
    recorderState.isRecording,
    recorderActions,
    restartBlockedRef,
    stopSpeaking,
    ttsIsSpeaking,
    usingLiveSTTRef,
    cancelLiveListening,
    clearLiveTimers,
    setUsingLiveSTT,
    onStopListening,
  ]);

  useEffect(() => {
    handlePrimaryActionRef.current = handlePress;
  }, [handlePress]);

  // Handle long press
  const handleLongPress = () => {
    console.log('[VoiceOrb] stop reason=long_press');
    if (recorderState.isRecording) { recorderActions.stopRecording(); onStopListening(); }
    if (usingLiveSTTRef.current) { cancelLiveListening().catch(() => {}); clearLiveTimers(); setUsingLiveSTT(false); onStopListening(); }
    stopSpeaking();
    setStatusText('Listening...');
  };

  // Computed values
  const liveHasSpeech = liveTranscript.trim().length > 0;
  const listeningActive = isListening || recorderState.isRecording || usingLiveSTT;
  const speechActive = usingLiveSTT ? liveHasSpeech : recorderState.hasSpeechStarted;
  const isCurrentlySpeaking = isSpeaking || ttsIsSpeaking;
  const coreColor = isCurrentlySpeaking ? '#ef4444' : (listeningActive && speechActive) ? COLORS.listening : 'rgba(255, 255, 255, 0.98)';
  const glowColor = isCurrentlySpeaking ? coreColor : (listeningActive && speechActive) ? coreColor : COLORS.violet;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={handlePress}
        onLongPress={handleLongPress}
        style={[styles.orbContainer, { width: orbSize, height: orbSize }]}
      >
        {rings.map((ring, index) => (<PulsingRing key={`ring-${index}`} {...ring} />))}
        {shootingStars.map((star, index) => (<ShootingStar key={`star-${index}`} {...star} />))}

        <Animated.View style={[styles.orbShell, { width: orbSize, height: orbSize, borderRadius: orbSize / 2 }, orbScaleStyle]}>
          <Animated.View style={[styles.ringShell, { width: orbSize, height: orbSize, borderRadius: orbSize / 2, padding: ringThickness }, ringRotateStyle]}>
            <LinearGradient
              colors={['#ff6ad5', '#c774e8', '#6ee7ff', '#ffd670', '#ff6ad5']}
              style={[styles.ringGradient, { borderRadius: orbSize / 2 }]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            <View style={[styles.innerSphere, { width: innerSize, height: innerSize, borderRadius: innerSize / 2 }]}>
              {starfield.map((s0, idx) => (
                <View key={`star-${idx}`} style={[styles.star, { left: s0.x - s0.size / 2, top: s0.y - s0.size / 2, width: s0.size, height: s0.size, borderRadius: s0.size / 2, opacity: s0.opacity, backgroundColor: s0.color }]} />
              ))}
              <Animated.View style={[styles.auroraOverlay, auraRotateStyle]}>
                <LinearGradient
                  colors={['rgba(255,106,213,0.20)', 'transparent', 'rgba(110,231,255,0.20)', 'transparent']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.auroraGradient}
                />
              </Animated.View>
              <View style={[styles.centerCore, { width: coreSize, height: coreSize, borderRadius: coreSize / 2, backgroundColor: coreColor, shadowColor: glowColor }]} />
              <View style={[styles.centerCoreHighlight, { width: Math.round(coreSize * 0.42), height: Math.round(coreSize * 0.16), borderRadius: 999 }]} />
            </View>
          </Animated.View>
        </Animated.View>

        {particles.map((particle, index) => (<FloatingParticle key={`particle-${index}`} {...particle} />))}
      </TouchableOpacity>

      {(isMuted || isTranscribing || statusText === 'No speech detected' || statusText === 'Microphone permission denied') ? (
        <Text style={[styles.statusText, { color: isMuted ? '#f59e0b' : theme.textSecondary }]}>
          {isMuted ? 'Barge-in off' : isTranscribing ? 'Transcribing...' : statusText}
        </Text>
      ) : null}

      {showLiveTranscript && usingLiveSTT && liveHasSpeech && (
        <View style={styles.liveTranscriptContainer}>
          <Text style={[styles.liveTranscriptText, { color: theme.text }]} numberOfLines={4}>
            {liveTranscript}
          </Text>
        </View>
      )}

      <TouchableOpacity
        onPress={() => {
          cancelAutoRestart();
          void applyMuteState(!isMuted);
        }}
        style={[styles.muteButton, { borderColor: isMuted ? '#ef4444' : theme.border, backgroundColor: isMuted ? 'rgba(239,68,68,0.15)' : 'transparent', marginTop: 16 }]}
      >
        <Ionicons name={isMuted ? 'mic-off' : 'mic'} size={22} color={isMuted ? '#ef4444' : theme.textSecondary} />
      </TouchableOpacity>
    </View>
  );
});

VoiceOrb.displayName = 'VoiceOrb';

const MemoizedVoiceOrb = memo(VoiceOrb);

export type { VoiceOrbRef, VoiceTranscriptMeta } from './types';
export default MemoizedVoiceOrb;
