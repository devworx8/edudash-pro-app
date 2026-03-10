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
  }, [externalLanguage]);

  // Config constants
  const LIVE_TRANSCRIPTION_ENABLED = process.env.EXPO_PUBLIC_VOICE_LIVE_TRANSCRIPTION_ENABLED !== 'false';
  const VOICE_TRACE_ENABLED = __DEV__ || process.env.EXPO_PUBLIC_DASH_VOICE_TRACE === 'true';
  const defaultLiveSilenceMs = preschoolMode ? 2200 : 1400;
  const liveSilenceTimeoutRaw = Number.parseInt(process.env.EXPO_PUBLIC_VOICE_LIVE_SILENCE_TIMEOUT_MS || String(defaultLiveSilenceMs), 10);
  const liveSilenceMin = preschoolMode ? 1800 : 900;
  const LIVE_SILENCE_TIMEOUT_MS = Number.isFinite(liveSilenceTimeoutRaw) ? Math.min(12000, Math.max(liveSilenceMin, liveSilenceTimeoutRaw)) : defaultLiveSilenceMs;
  const defaultFinalFallbackMs = preschoolMode ? 420 : 320;
  const liveFinalFallbackRaw = Number.parseInt(process.env.EXPO_PUBLIC_VOICE_LIVE_FINAL_FALLBACK_MS || String(defaultFinalFallbackMs), 10);
  const LIVE_FINAL_FALLBACK_MS = Number.isFinite(liveFinalFallbackRaw) ? Math.min(3000, Math.max(250, liveFinalFallbackRaw)) : defaultFinalFallbackMs;

  // Voice hooks
  const transcribeRef = useRef<((uri: string) => Promise<void>) | null>(null);
  const handleSilenceDetected = useCallback(() => { transcribeRef.current?.('silence'); }, []);

  const [recorderState, recorderActions] = useVoiceRecorder(
    handleSilenceDetected,
    preschoolMode ? { speechThreshold: -35, silenceDuration: 3000 } : { speechThreshold: -30, silenceDuration: 1400 },
  );
  const { transcribe, isTranscribing, error: sttError } = useVoiceSTT({ preschoolId: tenantId });
  const { speak, stop: stopSpeaking, isSpeaking: ttsIsSpeaking, error: ttsError } = useVoiceTTS();

  const isSpeakingRef = useRef(isSpeaking);
  const ttsSpeakingRef = useRef(ttsIsSpeaking);
  const restartBlockedRef = useRef(restartBlocked);
  const skipNextAutoRestartRef = useRef(false);
  const handleStartRecordingRef = useRef<(() => Promise<void>) | null>(null);
  const handlePrimaryActionRef = useRef<(() => Promise<void>) | null>(null);
  const scheduleLiveFallbackRef = useRef<(() => void) | null>(null);

  useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking]);
  useEffect(() => { ttsSpeakingRef.current = ttsIsSpeaking; }, [ttsIsSpeaking]);
  useEffect(() => { restartBlockedRef.current = restartBlocked; }, [restartBlocked]);

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
    onTranscript,
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
      lastPartialRef.current = text;
      liveLastPartialAtRef.current = Date.now();
      setLiveTranscript(text);
      onPartialTranscript?.(text, selectedLanguage);
      logVoiceTrace('stt_partial', { sessionId: liveSessionRef.current, chars: text.length, preview: text.slice(0, 80) });
      resetLiveSilenceTimerRef.current?.();
    },
    onFinalResult: (text) => {
      if (!usingLiveSTTRef.current) return;
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
        onTranscript(result.text, result.language as SupportedLanguage | undefined, { source: 'recorded', capturedAt: Date.now(), audioBase64: result.audio_base64, audioContentType: result.audio_content_type });
        setStatusText('Listening...');
      } else {
        setStatusText('No speech detected');
        setTimeout(() => setStatusText('Listening...'), 2000);
      }
    } finally {
      if (!usingLiveSTTRef.current) setIsProcessing(false);
    }
  }, [recorderActions, onStopListening, transcribe, selectedLanguage, onTranscript, isProcessing, stopLiveListening, usingLiveSTTRef, setLastDetectedLanguage]);

  useEffect(() => { transcribeRef.current = handleStopAndTranscribe; }, [handleStopAndTranscribe]);

  // TTS handlers + auto-restart (imperative handle, feedback prevention, auto-restart effects)
  useVoiceOrbTTSHandlers({
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
    isMuted,
    liveTranscript,
    orbSize,
    innerSize,
  });

  // handleStartRecording
  const handleStartRecording = useCallback(async () => {
    if (isSpeaking || ttsIsSpeaking) {
      console.log('[VoiceOrb] 🚫 Blocking record start - TTS is playing (prevent feedback)');
      return;
    }
    if (restartBlockedRef.current) {
      console.log('[VoiceOrb] 🚫 Blocking record start - restart blocked by parent transition');
      return;
    }
    if (isMuted || isProcessing || isListening || recorderState.isRecording || usingLiveSTTRef.current) {
      console.log('[VoiceOrb] Skipping start - muted:', isMuted, 'processing:', isProcessing, 'recording:', recorderState.isRecording);
      return;
    }
    console.log('[VoiceOrb] 🎤 Starting recording (TTS confirmed not playing)');

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
    isMuted, isProcessing, isListening, recorderState.isRecording, recorderActions,
    onStartListening, isSpeaking, ttsIsSpeaking, liveAvailable, startLiveListening,
    clearLiveResults, clearLiveTimers, onVoiceError, logVoiceTrace, selectedLanguage,
    LIVE_SILENCE_TIMEOUT_MS, LIVE_FINAL_FALLBACK_MS, usingLiveSTTRef, liveSessionRef,
    liveFinalizedRef, lastPartialRef, liveSessionStartedAtRef, liveLastPartialAtRef,
    restartBlockedRef,
  ]);

  useEffect(() => { handleStartRecordingRef.current = handleStartRecording; }, [handleStartRecording]);

  // Auto-start on mount
  useEffect(() => {
    if (autoStartListening && !hasAutoStarted.current && !isMuted && !isSpeaking && !ttsIsSpeaking && !restartBlocked) {
      hasAutoStarted.current = true;
      console.log('[VoiceOrb] Auto-starting listening on mount...');
      const timer = setTimeout(() => {
        if (!isSpeaking && !ttsIsSpeaking && !restartBlockedRef.current) handleStartRecordingRef.current?.();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [autoStartListening, isMuted, isSpeaking, ttsIsSpeaking, restartBlocked]);

  // Handle orb press
  const handlePress = async () => {
    if (isSpeaking || ttsIsSpeaking) {
      console.log('[VoiceOrb] 🛑 User interrupted TTS - stopping speech');
      await stopSpeaking();
      setStatusText('Interrupted');
      setTimeout(() => {
        if (!restartBlockedRef.current && canAutoRestartAfterInterrupt({ isMuted, isProcessing, isRecording: recorderState.isRecording, usingLiveSTT: usingLiveSTTRef.current, isSpeaking: isSpeakingRef.current, ttsIsSpeaking: ttsSpeakingRef.current })) {
          console.log('[VoiceOrb] ✅ One-tap interrupt restart to listening');
          handleStartRecordingRef.current?.();
          setStatusText('Listening...');
        }
      }, INTERRUPT_RESTART_DELAY_MS);
      return;
    }
    if (isMuted) {
      setStatusText('Unmute to speak');
      setTimeout(() => setStatusText('Listening...'), 1500);
      return;
    }
    if (isListening || recorderState.isRecording || usingLiveSTTRef.current) {
      handleStopAndTranscribe();
    } else if (!isSpeaking && !ttsIsSpeaking) {
      handleStartRecording();
    }
  };

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
        <Text style={[styles.statusText, { color: isMuted ? '#ef4444' : theme.textSecondary }]}>
          {isMuted ? 'Muted' : isTranscribing ? 'Transcribing...' : statusText}
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
        onPress={() => setIsMuted(!isMuted)}
        style={[styles.muteButton, { borderColor: isMuted ? '#ef4444' : theme.border, backgroundColor: isMuted ? '#ef444420' : 'transparent', marginTop: 16 }]}
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
