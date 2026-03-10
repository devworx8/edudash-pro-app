/**
 * PremiumCosmicOrb - Premium/Enterprise Tier Orb Visual
 * 
 * Matches the design reference with:
 * - Glowing spherical orb with cosmic nebula effect
 * - Gradient from deep blue/purple at edges to bright cyan/white at center
 * - Multiple concentric animated rings
 * - Particle/star effects inside the orb
 * - Luminous, pulsing animation
 */

import React, { useEffect, useRef, useMemo } from 'react';
import { View, Animated, Easing, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Stop, Circle, G } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface PremiumCosmicOrbProps {
  size: number;
  isProcessing: boolean;
  isSpeaking: boolean;
}

// Generate star particles for cosmic effect
const generateStars = (count: number) => {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 2 + 0.5,
    opacity: Math.random() * 0.6 + 0.2,
    delay: Math.random() * 2000,
  }));
};

export const PremiumCosmicOrb: React.FC<PremiumCosmicOrbProps> = ({ 
  size, 
  isProcessing, 
  isSpeaking 
}) => {
  // Animation values
  const corePulse = useRef(new Animated.Value(1)).current;
  const glowPulse = useRef(new Animated.Value(0.8)).current;
  const ring1Rotation = useRef(new Animated.Value(0)).current;
  const ring2Rotation = useRef(new Animated.Value(0)).current;
  const ring3Rotation = useRef(new Animated.Value(0)).current;
  const ring1Scale = useRef(new Animated.Value(1)).current;
  const ring2Scale = useRef(new Animated.Value(1)).current;
  const ring3Scale = useRef(new Animated.Value(1)).current;
  const starOpacity = useRef(new Animated.Value(0.3)).current;
  const innerGlow = useRef(new Animated.Value(0.6)).current;
  const speakingPulse = useRef(new Animated.Value(1)).current;

  // Generate stars once
  const stars = useMemo(() => generateStars(25), []);

  // Core breathing animation
  useEffect(() => {
    const duration = isSpeaking ? 600 : isProcessing ? 1000 : 2000;
    const toValue = isSpeaking ? 1.08 : isProcessing ? 1.05 : 1.04;
    
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(corePulse, {
          toValue,
          duration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(corePulse, {
          toValue: 1,
          duration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [isProcessing, isSpeaking, corePulse]);

  // Glow pulse animation
  useEffect(() => {
    const hi = isSpeaking ? 1 : 0.95;
    const lo = isSpeaking ? 0.7 : 0.5;
    const dur = isSpeaking ? 400 : 1200;
    
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, {
          toValue: hi,
          duration: dur,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glowPulse, {
          toValue: lo,
          duration: dur,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [isSpeaking, glowPulse]);

  // Ring rotations
  useEffect(() => {
    const speed1 = isSpeaking ? 4000 : 12000;
    const speed2 = isSpeaking ? 6000 : 18000;
    const speed3 = isSpeaking ? 8000 : 24000;

    const anim1 = Animated.loop(
      Animated.timing(ring1Rotation, {
        toValue: 1,
        duration: speed1,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    const anim2 = Animated.loop(
      Animated.timing(ring2Rotation, {
        toValue: 1,
        duration: speed2,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    const anim3 = Animated.loop(
      Animated.timing(ring3Rotation, {
        toValue: 1,
        duration: speed3,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    anim1.start();
    anim2.start();
    anim3.start();

    return () => {
      anim1.stop();
      anim2.stop();
      anim3.stop();
    };
  }, [isSpeaking, ring1Rotation, ring2Rotation, ring3Rotation]);

  // Ring pulse animations
  useEffect(() => {
    const dur = isSpeaking ? 800 : 1500;
    
    const anim1 = Animated.loop(
      Animated.sequence([
        Animated.timing(ring1Scale, { toValue: 1.03, duration: dur, useNativeDriver: true }),
        Animated.timing(ring1Scale, { toValue: 1, duration: dur, useNativeDriver: true }),
      ])
    );
    const anim2 = Animated.loop(
      Animated.sequence([
        Animated.timing(ring2Scale, { toValue: 1.02, duration: dur + 200, useNativeDriver: true }),
        Animated.timing(ring2Scale, { toValue: 1, duration: dur + 200, useNativeDriver: true }),
      ])
    );
    const anim3 = Animated.loop(
      Animated.sequence([
        Animated.timing(ring3Scale, { toValue: 1.015, duration: dur + 400, useNativeDriver: true }),
        Animated.timing(ring3Scale, { toValue: 1, duration: dur + 400, useNativeDriver: true }),
      ])
    );

    anim1.start();
    anim2.start();
    anim3.start();

    return () => {
      anim1.stop();
      anim2.stop();
      anim3.stop();
    };
  }, [isSpeaking, ring1Scale, ring2Scale, ring3Scale]);

  // Star twinkle animation
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(starOpacity, { toValue: 0.8, duration: 1000, useNativeDriver: true }),
        Animated.timing(starOpacity, { toValue: 0.2, duration: 1000, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [starOpacity]);

  // Inner glow animation
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(innerGlow, { toValue: 0.85, duration: 800, useNativeDriver: true }),
        Animated.timing(innerGlow, { toValue: 0.5, duration: 800, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [innerGlow]);

  // Speaking pulse
  useEffect(() => {
    Animated.timing(speakingPulse, {
      toValue: isSpeaking ? 1.1 : 1,
      duration: 200,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [isSpeaking, speakingPulse]);

  // Interpolations
  const ring1Rotate = ring1Rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const ring2Rotate = ring2Rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-360deg'],
  });
  const ring3Rotate = ring3Rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Sizes
  const orbSize = size * 0.5;
  const ring1Size = size * 0.7;
  const ring2Size = size * 0.85;
  const ring3Size = size * 1.0;
  const glowSize = size * 1.15;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Outer glow */}
      <Animated.View 
        style={[
          styles.outerGlow,
          {
            width: glowSize,
            height: glowSize,
            borderRadius: glowSize / 2,
            opacity: glowPulse,
            transform: [{ scale: corePulse }],
          }
        ]}
      >
        <LinearGradient
          colors={['rgba(139, 92, 246, 0.3)', 'rgba(59, 130, 246, 0.2)', 'rgba(6, 182, 212, 0.1)', 'transparent']}
          start={{ x: 0.3, y: 0.3 }}
          end={{ x: 0.7, y: 0.7 }}
          style={{ flex: 1, borderRadius: glowSize / 2 }}
        />
      </Animated.View>

      {/* Ring 3 - Outermost */}
      <Animated.View 
        style={[
          styles.ring,
          {
            width: ring3Size,
            height: ring3Size,
            borderRadius: ring3Size / 2,
            transform: [{ rotate: ring3Rotate }, { scale: ring3Scale }],
          }
        ]}
      >
        <View style={[styles.ringBorder, { borderRadius: ring3Size / 2, borderWidth: 1.5, borderColor: 'rgba(139, 92, 246, 0.4)' }]} />
      </Animated.View>

      {/* Ring 2 - Middle */}
      <Animated.View 
        style={[
          styles.ring,
          {
            width: ring2Size,
            height: ring2Size,
            borderRadius: ring2Size / 2,
            transform: [{ rotate: ring2Rotate }, { scale: ring2Scale }],
          }
        ]}
      >
        <View style={[styles.ringBorder, { borderRadius: ring2Size / 2, borderWidth: 2, borderColor: 'rgba(59, 130, 246, 0.5)' }]} />
      </Animated.View>

      {/* Ring 1 - Inner */}
      <Animated.View 
        style={[
          styles.ring,
          {
            width: ring1Size,
            height: ring1Size,
            borderRadius: ring1Size / 2,
            transform: [{ rotate: ring1Rotate }, { scale: ring1Scale }],
          }
        ]}
      >
        <View style={[styles.ringBorder, { borderRadius: ring1Size / 2, borderWidth: 2.5, borderColor: 'rgba(6, 182, 212, 0.6)' }]} />
      </Animated.View>

      {/* Main orb */}
      <Animated.View 
        style={[
          styles.orb,
          {
            width: orbSize,
            height: orbSize,
            borderRadius: orbSize / 2,
            transform: [{ scale: speakingPulse }],
          }
        ]}
      >
        {/* Base gradient - deep blue/purple to cyan center */}
        <LinearGradient
          colors={['#0a0a1a', '#1e1b4b', '#312e81', '#4338ca', '#6366f1']}
          locations={[0, 0.3, 0.5, 0.75, 1]}
          start={{ x: 0.5, y: 1 }}
          end={{ x: 0.5, y: 0 }}
          style={{ flex: 1, borderRadius: orbSize / 2 }}
        />

        {/* Center bright glow */}
        <Animated.View 
          style={[
            styles.centerGlow,
            {
              width: orbSize * 0.5,
              height: orbSize * 0.5,
              borderRadius: orbSize * 0.25,
              opacity: innerGlow,
            }
          ]}
        >
          <LinearGradient
            colors={['#ffffff', '#67e8f9', '#22d3ee', 'transparent']}
            locations={[0, 0.3, 0.6, 1]}
            start={{ x: 0.5, y: 0.5 }}
            end={{ x: 1, y: 1 }}
            style={{ flex: 1, borderRadius: orbSize * 0.25 }}
          />
        </Animated.View>

        {/* Secondary glow spot */}
        <View 
          style={[
            styles.secondaryGlow,
            {
              width: orbSize * 0.25,
              height: orbSize * 0.25,
              borderRadius: orbSize * 0.125,
              top: orbSize * 0.1,
              right: orbSize * 0.15,
            }
          ]}
        >
          <LinearGradient
            colors={['rgba(217, 70, 239, 0.8)', 'rgba(168, 85, 247, 0.4)', 'transparent']}
            style={{ flex: 1, borderRadius: orbSize * 0.125 }}
          />
        </View>

        {/* Star particles */}
        {stars.map((star) => (
          <Animated.View
            key={star.id}
            style={{
              position: 'absolute',
              width: star.size,
              height: star.size,
              borderRadius: star.size / 2,
              backgroundColor: star.id % 3 === 0 ? '#67e8f9' : star.id % 3 === 1 ? '#a78bfa' : '#ffffff',
              left: `${star.x}%`,
              top: `${star.y}%`,
              opacity: starOpacity,
              shadowColor: '#67e8f9',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.8,
              shadowRadius: 3,
            }}
          />
        ))}

        {/* Orb border glow */}
        <View 
          style={[
            styles.orbBorder,
            {
              borderRadius: orbSize / 2,
              borderWidth: 2,
              borderColor: 'rgba(103, 232, 249, 0.8)',
            }
          ]}
        />

        {/* Inner highlight */}
        <View 
          style={{
            position: 'absolute',
            width: orbSize * 0.15,
            height: orbSize * 0.08,
            borderRadius: orbSize * 0.1,
            backgroundColor: 'rgba(255, 255, 255, 0.4)',
            top: orbSize * 0.2,
            left: orbSize * 0.35,
          }}
        />
      </Animated.View>

      {/* Orbiting particles — single rotating container gives true orbital motion */}
      <Animated.View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          transform: [{ rotate: ring1Rotate }],
        }}
      >
        {[0, 1, 2].map((i) => {
          const dotSize = Math.max(10, Math.round(size * 0.18));
          const orbitRadius = ring1Size * 0.52;
          const angle = (i * 120) * Math.PI / 180;
          const x = size / 2 + Math.cos(angle) * orbitRadius - dotSize / 2;
          const y = size / 2 + Math.sin(angle) * orbitRadius - dotSize / 2;
          // Base, light (highlight), dark (shadow) per dot colour
          const baseColors  = ['#67e8f9', '#a78bfa', '#f472b6'];
          const lightColors = ['#cffafe', '#ede9fe', '#fce7f3'];
          const darkColors  = ['#0891b2', '#7c3aed', '#be185d'];
          const color = baseColors[i];

          return (
            <View
              key={i}
              style={{
                position: 'absolute',
                width: dotSize,
                height: dotSize,
                borderRadius: dotSize / 2,
                overflow: 'hidden',
                left: x,
                top: y,
                shadowColor: color,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.9,
                shadowRadius: 14,
              }}
            >
              {/* Sphere gradient — light top-left → base → dark bottom-right */}
              <LinearGradient
                colors={[lightColors[i], color, darkColors[i]]}
                start={{ x: 0.2, y: 0.1 }}
                end={{ x: 0.85, y: 0.9 }}
                style={{ flex: 1, borderRadius: dotSize / 2 }}
              />
              {/* Specular highlight — small bright spot top-left */}
              <View
                style={{
                  position: 'absolute',
                  width: dotSize * 0.38,
                  height: dotSize * 0.38,
                  borderRadius: dotSize * 0.19,
                  backgroundColor: 'rgba(255,255,255,0.6)',
                  top: dotSize * 0.1,
                  left: dotSize * 0.13,
                }}
              />
            </View>
          );
        })}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  outerGlow: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ring: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringBorder: {
    flex: 1,
  },
  orb: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  centerGlow: {
    position: 'absolute',
    alignSelf: 'center',
    top: '25%',
  },
  secondaryGlow: {
    position: 'absolute',
  },
  orbBorder: {
    position: 'absolute',
    inset: 0,
  },
});

export default PremiumCosmicOrb;