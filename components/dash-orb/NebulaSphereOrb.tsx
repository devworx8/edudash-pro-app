/**
 * NebulaSphereOrb — Premium/Pro Tier Orb Visual
 *
 * Designed to match the premium Dash AI orb reference:
 * - glassy nebula sphere with bright cyan core
 * - magenta/violet rim light
 * - concentric luminous rings behind the sphere
 * - subtle starfield both inside and around the orb
 */

import React, { useEffect, useRef, useMemo } from 'react';
import { View, Animated, Easing, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface NebulaSphereOrbProps {
  size: number;
  isProcessing: boolean;
  isSpeaking: boolean;
}

const SPARKLES = Array.from({ length: 34 }, (_, i) => ({
  x: (i * 19 + 7) % 96,
  y: (i * 29 + 13) % 96,
  s: i % 6 === 0 ? 2.6 : i % 3 === 0 ? 2 : 1.4,
  color: i % 5 === 0
    ? 'rgba(244,208,255,0.92)'
    : i % 3 === 0
      ? 'rgba(125,241,255,0.88)'
      : 'rgba(255,255,255,0.8)',
}));

const RINGS = [
  { r: 0.88, w: 2.6, color: 'rgba(205,118,255,0.62)' },
  { r: 0.96, w: 2.2, color: 'rgba(178,101,255,0.56)' },
  { r: 1.04, w: 2.0, color: 'rgba(161,91,255,0.46)' },
  { r: 1.12, w: 1.7, color: 'rgba(155,80,255,0.34)' },
  { r: 1.20, w: 1.4, color: 'rgba(184,106,255,0.24)' },
  { r: 1.28, w: 1.1, color: 'rgba(184,106,255,0.14)' },
];

export const NebulaSphereOrb: React.FC<NebulaSphereOrbProps> = ({ size, isProcessing, isSpeaking }) => {
  const breathe = useRef(new Animated.Value(1)).current;
  const ringRotation = useRef(new Animated.Value(0)).current;
  const glowPulse = useRef(new Animated.Value(0.7)).current;
  const sparkleAnim = useRef(new Animated.Value(0.3)).current;
  const coreScale = useRef(new Animated.Value(1)).current;

  // Breathing pulse — faster when processing
  useEffect(() => {
    const dur = isProcessing ? 900 : 2400;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1.05, duration: dur, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 1, duration: dur, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [isProcessing]);

  // Ring orbit — continuous rotation, speed responds to state
  useEffect(() => {
    const speed = isSpeaking ? 4000 : isProcessing ? 5000 : 10000;
    const anim = Animated.loop(
      Animated.timing(ringRotation, { toValue: 1, duration: speed, easing: Easing.linear, useNativeDriver: true })
    );
    anim.start();
    return () => anim.stop();
  }, [isProcessing, isSpeaking]);

  // Outer glow pulse
  useEffect(() => {
    const hi = isSpeaking ? 1 : 0.9;
    const dur = isSpeaking ? 500 : 2000;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, { toValue: hi, duration: dur, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glowPulse, { toValue: 0.55, duration: dur, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [isSpeaking]);

  // Sparkle twinkle
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(sparkleAnim, { toValue: 0.85, duration: 1400, useNativeDriver: true }),
        Animated.timing(sparkleAnim, { toValue: 0.15, duration: 1400, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  // Core scale bump on speaking
  useEffect(() => {
    Animated.timing(coreScale, {
      toValue: isSpeaking ? 1.06 : 1,
      duration: 300,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [isSpeaking]);

  const ringDeg = ringRotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const sphereSize = size * 0.54;
  const innerGlowSize = size * 0.9;
  const outerGlowSize = size * 1.18;

  // Internal nebula sparkle dots inside the sphere
  const nebulaSparkles = useMemo(() => {
    const dots: { x: number; y: number; r: number; c: string }[] = [];
    for (let i = 0; i < 18; i++) {
      const angle = (i * 137.5 * Math.PI) / 180; // golden angle distribution
      const dist = ((i * 7 + 3) % 40) / 100; // 0-0.40 from center
      const cx = 50 + Math.cos(angle) * dist * 100;
      const cy = 50 + Math.sin(angle) * dist * 100;
      dots.push({
        x: Math.max(8, Math.min(92, cx)),
        y: Math.max(8, Math.min(92, cy)),
        r: i % 4 === 0 ? 2 : 1.2,
        c: i % 3 === 0 ? 'rgba(255,255,255,0.7)' : i % 2 === 0 ? 'rgba(147,197,253,0.6)' : 'rgba(196,181,253,0.5)',
      });
    }
    return dots;
  }, []);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Background star sparkles */}
      {SPARKLES.map((sp, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            width: sp.s,
            height: sp.s,
            borderRadius: sp.s,
            backgroundColor: sp.color,
            left: `${sp.x}%`,
            top: `${sp.y}%`,
            opacity: sparkleAnim,
          }}
        />
      ))}

      {/* Outer diffuse glow */}
      <Animated.View
        style={{
          position: 'absolute',
          width: outerGlowSize,
          height: outerGlowSize,
          borderRadius: outerGlowSize / 2,
          opacity: glowPulse,
          transform: [{ scale: breathe }],
        }}
      >
        <LinearGradient
          colors={[
            'rgba(46,18,110,0.18)',
            'rgba(109,40,217,0.14)',
            'rgba(9,62,102,0.1)',
            'transparent',
          ]}
          style={{ width: outerGlowSize, height: outerGlowSize, borderRadius: outerGlowSize / 2 }}
          start={{ x: 0.42, y: 0.22 }}
          end={{ x: 0.65, y: 0.88 }}
        />
      </Animated.View>

      {/* Purple/cyan halo behind rings */}
      <Animated.View
        style={{
          position: 'absolute',
          width: innerGlowSize,
          height: innerGlowSize,
          borderRadius: innerGlowSize / 2,
          transform: [{ scale: breathe }],
        }}
      >
        <LinearGradient
          colors={[
            'rgba(126,34,206,0.22)',
            'rgba(212,70,255,0.24)',
            'rgba(59,130,246,0.18)',
            'transparent',
          ]}
          style={{ width: innerGlowSize, height: innerGlowSize, borderRadius: innerGlowSize / 2 }}
          start={{ x: 0.25, y: 0.24 }}
          end={{ x: 0.78, y: 0.84 }}
        />
      </Animated.View>

      {/* Concentric rings behind the sphere */}
      {RINGS.map((ring, i) => {
        const d = ring.r * size;
        return (
          <Animated.View
            key={`ring-${i}`}
            style={{
              position: 'absolute',
              width: d,
              height: d,
              borderRadius: d / 2,
              borderWidth: ring.w,
              borderColor: ring.color,
              transform: [
                { rotate: ringDeg },
                { scale: i % 2 === 0 ? 1 : 1.012 },
              ],
            }}
          />
        );
      })}

      {/* Ring glints */}
      {[0.78, 0.96, 1.1].map((radius, i) => {
        const orbit = radius * size;
        return (
          <Animated.View
            key={`glint-${i}`}
            style={{
              position: 'absolute',
              width: orbit,
              height: orbit,
              transform: [{ rotate: ringDeg }],
            }}
          >
            <View
              style={{
                position: 'absolute',
                top: orbit * 0.48,
                left: -1,
                width: 18,
                height: 3.5,
                borderRadius: 999,
                backgroundColor: 'rgba(245,215,255,0.95)',
                shadowColor: '#d946ef',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.9,
                shadowRadius: 12,
              }}
            />
          </Animated.View>
        );
      })}

      {/* Main sphere — glass nebula core */}
      <Animated.View
        style={{
          width: sphereSize,
          height: sphereSize,
          borderRadius: sphereSize / 2,
          overflow: 'hidden',
          transform: [{ scale: coreScale }],
          ...Platform.select({
            ios: {
              shadowColor: '#818cf8',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.8,
              shadowRadius: 30,
            },
            android: { elevation: 16 },
          }),
        }}
      >
        {/* Deep-space base */}
        <LinearGradient
          colors={['#071329', '#0c2041', '#203f9a', '#6127b8']}
          locations={[0, 0.24, 0.66, 1]}
          start={{ x: 0.78, y: 0.84 }}
          end={{ x: 0.2, y: 0.08 }}
          style={{ width: sphereSize, height: sphereSize, borderRadius: sphereSize / 2 }}
        />

        {/* Cyan/magenta nebula bloom */}
        <LinearGradient
          colors={[
            'rgba(176,248,255,0.96)',
            'rgba(98,229,255,0.74)',
            'rgba(112,140,255,0.4)',
            'rgba(241,130,255,0.28)',
            'transparent',
          ]}
          locations={[0, 0.18, 0.5, 0.76, 1]}
          start={{ x: 0.46, y: 0.36 }}
          end={{ x: 0.93, y: 0.9 }}
          style={{
            position: 'absolute',
            width: sphereSize,
            height: sphereSize,
            borderRadius: sphereSize / 2,
          }}
        />

        {/* Bright central glow */}
        <View
          style={{
            position: 'absolute',
            width: sphereSize * 0.44,
            height: sphereSize * 0.44,
            borderRadius: 999,
            left: sphereSize * 0.28,
            top: sphereSize * 0.2,
            backgroundColor: 'rgba(155,247,255,0.9)',
            shadowColor: '#67e8f9',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.95,
            shadowRadius: 28,
          }}
        />

        {/* Magenta edge flare */}
        <View
          style={{
            position: 'absolute',
            width: sphereSize * 0.22,
            height: sphereSize * 0.22,
            borderRadius: 999,
            right: sphereSize * 0.06,
            top: sphereSize * 0.12,
            backgroundColor: 'rgba(255,190,252,0.58)',
            shadowColor: '#f0abfc',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.9,
            shadowRadius: 18,
          }}
        />

        {/* Inner starfield */}
        {nebulaSparkles.map((dot, i) => (
          <View
            key={`ns-${i}`}
            style={{
              position: 'absolute',
              width: dot.r * 2,
              height: dot.r * 2,
              borderRadius: dot.r,
              backgroundColor: dot.c,
              left: `${dot.x}%`,
              top: `${dot.y}%`,
            }}
          />
        ))}

        {/* Rim light */}
        <View
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: sphereSize / 2,
            borderWidth: 2.2,
            borderColor: 'rgba(251,213,255,0.72)',
          }}
        />
      </Animated.View>

      {/* Glass highlight */}
      <View
        style={{
          position: 'absolute',
          width: sphereSize * 0.42,
          height: sphereSize * 0.14,
          borderRadius: 999,
          backgroundColor: 'rgba(255,255,255,0.5)',
          top: size / 2 - sphereSize * 0.21,
          left: size / 2 - sphereSize * 0.18,
        }}
      />

      {/* Lower reflection */}
      <View
        style={{
          position: 'absolute',
          width: sphereSize * 0.18,
          height: sphereSize * 0.065,
          borderRadius: 999,
          backgroundColor: 'rgba(118,211,255,0.24)',
          top: size / 2 + sphereSize * 0.16,
        }}
      />
    </View>
  );
};
