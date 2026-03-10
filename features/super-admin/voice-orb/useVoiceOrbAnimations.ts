import { useRef, useMemo, useEffect } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { COLORS } from '@/components/super-admin/voice-orb/VoiceOrb.styles';
import {
  generateParticles,
  generateShootingStars,
  generateRings,
} from '@/components/super-admin/voice-orb/VoiceOrbAnimations';

interface AnimationParams {
  isListening: boolean;
  isSpeaking: boolean;
  ttsIsSpeaking: boolean;
  isParentProcessing: boolean;
  recorderState: { audioLevel: number; isRecording: boolean; hasSpeechStarted: boolean };
  usingLiveSTT: boolean;
  isMuted: boolean;
  liveTranscript: string;
  orbSize: number;
  innerSize: number;
}

export function useVoiceOrbAnimations({
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
}: AnimationParams) {
  // Animation shared values
  const coreScale = useSharedValue(1);
  const corePulse = useSharedValue(1);
  const coreRotation = useSharedValue(0);
  const glowIntensity = useSharedValue(0.5);
  const voiceAmplitude = useSharedValue(1);
  const prevAudioLevel = useRef(0);

  // Pre-generate animation data
  const particles = useMemo(() => generateParticles(10, orbSize), [orbSize]);
  const shootingStars = useMemo(() => generateShootingStars(4, orbSize), [orbSize]);
  const rings = useMemo(() => generateRings(orbSize), [orbSize]);
  const starfield = useMemo(() => {
    const count = Math.max(26, Math.min(56, Math.round(orbSize * 0.22)));
    const radius = innerSize / 2;
    const colors = [COLORS.starlight, COLORS.lavender, COLORS.particle, COLORS.shooting] as const;
    return Array.from({ length: count }).map((_, idx) => {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.sqrt(Math.random()) * radius * 0.92;
      const x = radius + Math.cos(angle) * dist;
      const y = radius + Math.sin(angle) * dist;
      const size = 1 + Math.random() * 2.2;
      const opacity = 0.35 + Math.random() * 0.55;
      const color = colors[idx % colors.length];
      return { x, y, size, opacity, color };
    });
  }, [innerSize, orbSize]);

  // Voice amplitude reactive animation
  useEffect(() => {
    const level = recorderState.audioLevel;
    if ((isListening || recorderState.isRecording || usingLiveSTT) && !isMuted) {
      const normalized = Math.max(0, Math.min(1, (level + 60) / 60));
      const targetScale = 1 + normalized * 0.25;
      voiceAmplitude.value = withTiming(targetScale, { duration: 100, easing: Easing.out(Easing.quad) });
    } else {
      voiceAmplitude.value = withTiming(1, { duration: 300 });
    }
    prevAudioLevel.current = level;
  }, [recorderState.audioLevel, isListening, recorderState.isRecording, usingLiveSTT, isMuted]);

  // Pulse when live STT detects speech
  useEffect(() => {
    if (usingLiveSTT && liveTranscript.trim().length > 0) {
      voiceAmplitude.value = withTiming(1.18, { duration: 150 });
      const timer = setTimeout(() => {
        voiceAmplitude.value = withTiming(1.05, { duration: 200 });
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [liveTranscript, usingLiveSTT]);

  // Animation effects based on state
  useEffect(() => {
    if (isListening) {
      corePulse.value = withRepeat(
        withTiming(1.05, { duration: 1000, easing: Easing.inOut(Easing.sin) }),
        -1,
        true
      );
      glowIntensity.value = withTiming(0.9, { duration: 300 });
    } else if (isSpeaking || ttsIsSpeaking) {
      corePulse.value = withRepeat(
        withTiming(1.12, { duration: 400, easing: Easing.inOut(Easing.sin) }),
        -1,
        true
      );
      glowIntensity.value = withTiming(1, { duration: 200 });
    } else {
      corePulse.value = withRepeat(
        withTiming(1.03, { duration: 2500, easing: Easing.inOut(Easing.sin) }),
        -1,
        true
      );
      glowIntensity.value = withTiming(0.5, { duration: 500 });
    }

    const rotationMs = isParentProcessing
      ? 9000
      : (isSpeaking || ttsIsSpeaking)
        ? 14000
        : isListening
          ? 24000
          : 42000;
    coreRotation.value = withRepeat(
      withTiming(360, { duration: rotationMs, easing: Easing.linear }),
      -1,
      false
    );

    return () => {
      cancelAnimation(corePulse);
      cancelAnimation(coreRotation);
      cancelAnimation(glowIntensity);
    };
  }, [isListening, isSpeaking, ttsIsSpeaking, isParentProcessing]);

  // Animated styles
  const orbScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: coreScale.value * corePulse.value * voiceAmplitude.value }] as any,
  }));

  const ringRotateStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${coreRotation.value}deg` }] as any,
  }));

  const auraRotateStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-coreRotation.value * 0.65}deg` }] as any,
  }));

  return {
    orbScaleStyle,
    ringRotateStyle,
    auraRotateStyle,
    particles,
    shootingStars,
    rings,
    starfield,
  };
}