/**
 * CosmicOrb - Premium Cosmic Nebula Animation
 *
 * Premium design inspired by the reference images:
 * - Concentric ripple rings with glow effects
 * - Particle starfield with sparkles
 * - Aurora light bands
 * - Smooth pulsing glow
 * - Dynamic colors (purple, teal, gold)
 */

import React, { useMemo } from 'react';
import { View, Animated, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { PREMIUM_COLORS } from '@/lib/theme/premiumDashTheme';
import { useCosmicOrbAnimation } from './useCosmicOrbAnimation';
import { generateParticles, type Particle } from './particleUtils';

// =============================================================================
// Types
// =============================================================================

interface CosmicOrbProps {
  size: number;
  isProcessing: boolean;
  isSpeaking: boolean;
}

// =============================================================================
// CosmicOrb Component
// =============================================================================

export const CosmicOrb: React.FC<CosmicOrbProps> = ({ size, isProcessing, isSpeaking }) => {
  const animations = useCosmicOrbAnimation({ isProcessing, isSpeaking });
  const particles = useMemo(() => generateParticles(size), [size]);

  const rotateInterpolate = animations.rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const radius = size / 2;
  const ringDiameter = size * 0.75;
  const ringOffset = (size - ringDiameter) / 2;
  const coreSize = size * 0.4;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Outer glow effect */}
      <Animated.View
        style={{
          position: 'absolute',
          width: size * 1.8,
          height: size * 1.8,
          borderRadius: size * 0.9,
          backgroundColor: PREMIUM_COLORS.primaryGlow,
          opacity: animations.coreGlow.interpolate({
            inputRange: [1, 1.15],
            outputRange: [0.3, 0.5],
          }),
          transform: [{ scale: animations.coreGlow }],
        }}
      />

      {/* Background starfield */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'transparent' }]}>
        {particles.map((particle, i) => (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              width: particle.size,
              height: particle.size,
              borderRadius: particle.size / 2,
              backgroundColor: particle.color,
              left: particle.x - particle.size / 2,
              top: particle.y - particle.size / 2,
              opacity: animations.sparkleOpacity,
              transform: [
                {
                  scale: animations.sparkleOpacity.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.5, 1.2],
                  }),
                },
              ],
            }}
          />
        ))}
      </View>

      {/* Ripple rings */}
      <Ring
        diameter={ringDiameter}
        offset={ringOffset}
        color={PREMIUM_COLORS.orbRing3}
        scale={animations.ring3Scale}
        opacity={animations.ring3Opacity}
      />
      <Ring
        diameter={ringDiameter}
        offset={ringOffset}
        color={PREMIUM_COLORS.orbRing2}
        scale={animations.ring2Scale}
        opacity={animations.ring2Opacity}
      />
      <Ring
        diameter={ringDiameter}
        offset={ringOffset}
        color={PREMIUM_COLORS.orbRing1}
        scale={animations.ring1Scale}
        opacity={animations.ring1Opacity}
      />

      {/* Core orb with gradient */}
      <Animated.View
        style={{
          transform: [{ rotate: rotateInterpolate }, { scale: animations.pulseScale }],
        }}
      >
        <LinearGradient
          colors={[PREMIUM_COLORS.primaryLight, PREMIUM_COLORS.primary, PREMIUM_COLORS.primaryDark]}
          start={{ x: 0.3, y: 0.3 }}
          end={{ x: 0.7, y: 0.7 }}
          style={{
            width: coreSize,
            height: coreSize,
            borderRadius: coreSize / 2,
            alignItems: 'center',
            justifyContent: 'center',
            ...Platform.select({
              ios: {
                shadowColor: PREMIUM_COLORS.primary,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.8,
                shadowRadius: 20,
              },
              android: { elevation: 8 },
            }),
          }}
        >
          {/* Inner highlight */}
          <View
            style={{
              width: coreSize * 0.5,
              height: coreSize * 0.5,
              borderRadius: coreSize * 0.25,
              backgroundColor: 'rgba(255,255,255,0.2)',
              position: 'absolute',
              top: coreSize * 0.15,
              left: coreSize * 0.15,
            }}
          />
        </LinearGradient>
      </Animated.View>

      {/* Speaking indicator pulse */}
      {isSpeaking && (
        <Animated.View
          style={{
            position: 'absolute',
            width: coreSize * 1.3,
            height: coreSize * 1.3,
            borderRadius: coreSize * 0.65,
            borderWidth: 2,
            borderColor: PREMIUM_COLORS.tertiary,
            opacity: animations.pulseScale.interpolate({
              inputRange: [1, 1.08],
              outputRange: [0.8, 0.2],
            }),
            transform: [{ scale: animations.pulseScale }],
          }}
        />
      )}
    </View>
  );
};

// =============================================================================
// Ring Sub-Component
// =============================================================================

interface RingProps {
  diameter: number;
  offset: number;
  color: string;
  scale: Animated.Value;
  opacity: Animated.Value;
}

const Ring: React.FC<RingProps> = ({ diameter, offset, color, scale, opacity }) => (
  <Animated.View
    style={{
      position: 'absolute',
      width: diameter,
      height: diameter,
      top: offset,
      left: offset,
      borderRadius: diameter / 2,
      borderWidth: 2,
      borderColor: color,
      opacity,
      transform: [{ scale }],
      ...Platform.select({
        ios: {
          shadowColor: color,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.6,
          shadowRadius: 10,
        },
        android: { elevation: 4 },
      }),
    }}
  />
);

export default CosmicOrb;
