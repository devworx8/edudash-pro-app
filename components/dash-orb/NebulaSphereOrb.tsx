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

const SPARKLES = Array.from({ length: 48 }, (_, i) => ({
  x: (i * 19 + 7) % 96,
  y: (i * 29 + 13) % 96,
  s: i % 8 === 0 ? 3 : i % 5 === 0 ? 2.3 : i % 3 === 0 ? 1.9 : 1.2,
  color: i % 5 === 0
    ? 'rgba(244,208,255,0.92)'
    : i % 3 === 0
      ? 'rgba(125,241,255,0.88)'
      : 'rgba(255,255,255,0.8)',
}));

const RINGS = [
  { r: 0.92, w: 2.05, color: 'rgba(234,122,255,0.68)' },
  { r: 1.0, w: 1.8, color: 'rgba(208,104,255,0.58)' },
  { r: 1.08, w: 1.55, color: 'rgba(186,92,255,0.46)' },
  { r: 1.16, w: 1.35, color: 'rgba(166,86,255,0.34)' },
  { r: 1.24, w: 1.15, color: 'rgba(164,96,255,0.22)' },
  { r: 1.32, w: 0.95, color: 'rgba(164,96,255,0.14)' },
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

  const sphereSize = size * 0.55;
  const innerGlowSize = size * 0.92;
  const outerGlowSize = size * 1.16;

  // Internal nebula sparkle dots inside the sphere
  const nebulaSparkles = useMemo(() => {
    const dots: { x: number; y: number; r: number; c: string }[] = [];
    for (let i = 0; i < 34; i++) {
      const angle = (i * 137.5 * Math.PI) / 180; // golden angle distribution
      const dist = ((i * 9 + 4) % 44) / 100; // 0-0.44 from center
      const cx = 50 + Math.cos(angle) * dist * 100;
      const cy = 50 + Math.sin(angle) * dist * 100;
      dots.push({
        x: Math.max(8, Math.min(92, cx)),
        y: Math.max(8, Math.min(92, cy)),
        r: i % 8 === 0 ? 2.5 : i % 3 === 0 ? 1.6 : 0.95,
        c: i % 4 === 0
          ? 'rgba(255,255,255,0.92)'
          : i % 3 === 0
            ? 'rgba(125,241,255,0.82)'
            : i % 2 === 0
              ? 'rgba(147,197,253,0.68)'
              : 'rgba(225,190,255,0.56)',
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
            'rgba(57,22,161,0.26)',
            'rgba(197,71,255,0.18)',
            'rgba(16,108,157,0.18)',
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
            'rgba(105,39,217,0.12)',
            'rgba(229,94,255,0.3)',
            'rgba(56,189,248,0.24)',
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
              opacity: i < 3 ? 1 : 0.92,
              transform: [
                { rotate: ringDeg },
                { scale: i % 2 === 0 ? 1 : 1.006 },
              ],
            }}
          />
        );
      })}

      {/* Ring glints */}
      {[0.82, 1, 1.18].map((radius, i) => {
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
                width: 20,
                height: 3,
                borderRadius: 999,
                backgroundColor: i === 1 ? 'rgba(255,255,255,0.92)' : 'rgba(245,215,255,0.95)',
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
          colors={['#040a1c', '#08162f', '#0f347f', '#4d1db3']}
          locations={[0, 0.22, 0.62, 1]}
          start={{ x: 0.82, y: 0.86 }}
          end={{ x: 0.18, y: 0.08 }}
          style={{ width: sphereSize, height: sphereSize, borderRadius: sphereSize / 2 }}
        />

        {/* Internal dark vignette to keep the sphere deep rather than washed out */}
        <LinearGradient
          colors={[
            'rgba(6,12,30,0.18)',
            'transparent',
            'transparent',
            'rgba(7,10,25,0.42)',
          ]}
          locations={[0, 0.22, 0.62, 1]}
          start={{ x: 0.1, y: 0.08 }}
          end={{ x: 0.88, y: 0.92 }}
          style={{
            position: 'absolute',
            width: sphereSize,
            height: sphereSize,
            borderRadius: sphereSize / 2,
          }}
        />

        {/* Cyan/magenta nebula bloom */}
        <LinearGradient
          colors={[
            'rgba(194,250,255,0.96)',
            'rgba(94,232,255,0.82)',
            'rgba(84,168,255,0.46)',
            'rgba(230,115,255,0.34)',
            'transparent',
          ]}
          locations={[0, 0.12, 0.4, 0.7, 1]}
          start={{ x: 0.52, y: 0.28 }}
          end={{ x: 0.93, y: 0.9 }}
          style={{
            position: 'absolute',
            width: sphereSize,
            height: sphereSize,
            borderRadius: sphereSize / 2,
          }}
        />

        {/* Bright central cyan glow */}
        <View
          style={{
            position: 'absolute',
            width: sphereSize * 0.38,
            height: sphereSize * 0.38,
            borderRadius: 999,
            left: sphereSize * 0.31,
            top: sphereSize * 0.19,
            backgroundColor: 'rgba(158,248,255,0.96)',
            shadowColor: '#67e8f9',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 1,
            shadowRadius: 26,
          }}
        />

        {/* Hot center star */}
        <View
          style={{
            position: 'absolute',
            width: sphereSize * 0.065,
            height: sphereSize * 0.065,
            borderRadius: 999,
            left: sphereSize * 0.467,
            top: sphereSize * 0.42,
            backgroundColor: 'rgba(245,255,255,0.98)',
            shadowColor: '#9df6ff',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 1,
            shadowRadius: 12,
          }}
        />

        {/* Secondary cyan bloom */}
        <View
          style={{
            position: 'absolute',
            width: sphereSize * 0.32,
            height: sphereSize * 0.32,
            borderRadius: 999,
            left: sphereSize * 0.48,
            top: sphereSize * 0.08,
            backgroundColor: 'rgba(120,235,255,0.26)',
            shadowColor: '#67e8f9',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.78,
            shadowRadius: 20,
          }}
        />

        {/* Magenta edge flare */}
        <View
          style={{
            position: 'absolute',
            width: sphereSize * 0.24,
            height: sphereSize * 0.24,
            borderRadius: 999,
            right: sphereSize * 0.06,
            top: sphereSize * 0.12,
            backgroundColor: 'rgba(255,170,248,0.68)',
            shadowColor: '#f0abfc',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 1,
            shadowRadius: 22,
          }}
        />

        {/* Lower violet atmosphere */}
        <LinearGradient
          colors={[
            'transparent',
            'rgba(146,85,255,0.14)',
            'rgba(223,121,255,0.28)',
          ]}
          locations={[0, 0.56, 1]}
          start={{ x: 0.3, y: 0.28 }}
          end={{ x: 0.7, y: 1 }}
          style={{
            position: 'absolute',
            width: sphereSize,
            height: sphereSize,
            borderRadius: sphereSize / 2,
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

        {/* Soft internal mist to blend the starfield */}
        <LinearGradient
          colors={[
            'rgba(255,255,255,0.1)',
            'rgba(145,214,255,0.05)',
            'transparent',
          ]}
          locations={[0, 0.38, 1]}
          start={{ x: 0.58, y: 0.1 }}
          end={{ x: 0.42, y: 0.9 }}
          style={{
            position: 'absolute',
            width: sphereSize,
            height: sphereSize,
            borderRadius: sphereSize / 2,
          }}
        />

        {/* Rim light */}
        <View
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: sphereSize / 2,
            borderWidth: 2.1,
            borderColor: 'rgba(255,209,252,0.88)',
          }}
        />
        <View
          style={{
            position: 'absolute',
            inset: 3,
            borderRadius: sphereSize / 2,
            borderWidth: 1.15,
            borderColor: 'rgba(117,234,255,0.44)',
          }}
        />
      </Animated.View>

      {/* Glass highlight */}
      <View
        style={{
          position: 'absolute',
          width: sphereSize * 0.28,
          height: sphereSize * 0.1,
          borderRadius: 999,
          backgroundColor: 'rgba(255,255,255,0.2)',
          top: size / 2 - sphereSize * 0.21,
          left: size / 2 - sphereSize * 0.12,
        }}
      />

      {/* Lower reflection */}
      <View
        style={{
          position: 'absolute',
          width: sphereSize * 0.12,
          height: sphereSize * 0.042,
          borderRadius: 999,
          backgroundColor: 'rgba(118,211,255,0.14)',
          top: size / 2 + sphereSize * 0.18,
        }}
      />
    </View>
  );
};
