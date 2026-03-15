/**
 * useCosmicOrbAnimation - Animation hook for CosmicOrb component
 *
 * Manages all animation values and effects for the cosmic orb:
 * - Ripple rings with staggered timing
 * - Core glow pulse
 * - Rotation animation
 * - Sparkle/twinkle effects
 */

import { useEffect, useRef, useCallback } from 'react';
import { Animated, Easing } from 'react-native';

// =============================================================================
// Types
// =============================================================================

export interface CosmicOrbAnimationValues {
  ring1Scale: Animated.Value;
  ring2Scale: Animated.Value;
  ring3Scale: Animated.Value;
  ring1Opacity: Animated.Value;
  ring2Opacity: Animated.Value;
  ring3Opacity: Animated.Value;
  coreGlow: Animated.Value;
  rotation: Animated.Value;
  sparkleOpacity: Animated.Value;
  pulseScale: Animated.Value;
}

export interface CosmicOrbAnimationConfig {
  isProcessing: boolean;
  isSpeaking: boolean;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useCosmicOrbAnimation({
  isProcessing,
  isSpeaking,
}: CosmicOrbAnimationConfig): CosmicOrbAnimationValues {
  // Animation values
  const ring1Scale = useRef(new Animated.Value(1)).current;
  const ring2Scale = useRef(new Animated.Value(1)).current;
  const ring3Scale = useRef(new Animated.Value(1)).current;
  const ring1Opacity = useRef(new Animated.Value(0.7)).current;
  const ring2Opacity = useRef(new Animated.Value(0.5)).current;
  const ring3Opacity = useRef(new Animated.Value(0.3)).current;
  const coreGlow = useRef(new Animated.Value(1)).current;
  const rotation = useRef(new Animated.Value(0)).current;
  const sparkleOpacity = useRef(new Animated.Value(0)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;

  // Create ripple effect with staggered timing
  useEffect(() => {
    const createRipple = (
      scaleAnim: Animated.Value,
      opacityAnim: Animated.Value,
      delay: number,
    ) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(scaleAnim, {
              toValue: 1.5,
              duration: 2500,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(opacityAnim, {
              toValue: 0,
              duration: 2500,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 0,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0.7,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      );
    };

    const ripple1 = createRipple(ring1Scale, ring1Opacity, 0);
    const ripple2 = createRipple(ring2Scale, ring2Opacity, 800);
    const ripple3 = createRipple(ring3Scale, ring3Opacity, 1600);

    ripple1.start();
    ripple2.start();
    ripple3.start();

    return () => {
      ripple1.stop();
      ripple2.stop();
      ripple3.stop();
    };
  }, []);

  // Core glow pulse
  useEffect(() => {
    const pulseDuration = isSpeaking ? 1200 : isProcessing ? 1500 : 2000;
    const pulseScaleValue = isSpeaking ? 1.15 : isProcessing ? 1.1 : 1.05;

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(coreGlow, {
          toValue: pulseScaleValue,
          duration: pulseDuration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(coreGlow, {
          toValue: 1,
          duration: pulseDuration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [isSpeaking, isProcessing]);

  // Rotation animation
  useEffect(() => {
    const rotationDuration = isSpeaking ? 3000 : isProcessing ? 4000 : 6000;

    if (isProcessing || isSpeaking) {
      const rotate = Animated.loop(
        Animated.timing(rotation, {
          toValue: 1,
          duration: rotationDuration,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      rotate.start();
      return () => rotate.stop();
    } else {
      rotation.setValue(0);
    }
  }, [isProcessing, isSpeaking]);

  // Sparkle animation
  useEffect(() => {
    const sparkle = Animated.loop(
      Animated.sequence([
        Animated.timing(sparkleOpacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(sparkleOpacity, {
          toValue: 0.2,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    );
    sparkle.start();
    return () => sparkle.stop();
  }, []);

  // Pulse animation for speaking state
  useEffect(() => {
    if (isSpeaking) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseScale, {
            toValue: 1.08,
            duration: 400,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseScale, {
            toValue: 1,
            duration: 400,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseScale.setValue(1);
    }
  }, [isSpeaking]);

  return {
    ring1Scale,
    ring2Scale,
    ring3Scale,
    ring1Opacity,
    ring2Opacity,
    ring3Opacity,
    coreGlow,
    rotation,
    sparkleOpacity,
    pulseScale,
  };
}

export default useCosmicOrbAnimation;
