/**
 * PremiumCosmicOrb - Premium/Enterprise Tier Orb Visual
 * Matches the design reference with luminous spherical orb styling
 */

import React, { useEffect, useRef, useMemo } from 'react';
import { View, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { sparkles, rings, generateNebulaSparkles, styles } from './PremiumCosmicOrb.styles';

interface PremiumCosmicOrbProps {
  size: number;
  isProcessing: boolean;
  isSpeaking: boolean;
}

export const PremiumCosmicOrb: React.FC<PremiumCosmicOrbProps> = ({ size, isProcessing, isSpeaking }) => {
  const breathe = useRef(new Animated.Value(1)).current;
  const ringRotation = useRef(new Animated.Value(0)).current;
  const glowPulse = useRef(new Animated.Value(0.7)).current;
  const sparkleAnim = useRef(new Animated.Value(0.3)).current;
  const coreScale = useRef(new Animated.Value(1)).current;
  const ringPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const dur = isProcessing ? 800 : 2200;
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 1.06, duration: dur, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(breathe, { toValue: 1, duration: dur, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    anim.start();
    return () => anim.stop();
  }, [isProcessing]);

  useEffect(() => {
    const speed = isSpeaking ? 3500 : isProcessing ? 4500 : 9000;
    const anim = Animated.loop(Animated.timing(ringRotation, { toValue: 1, duration: speed, easing: Easing.linear, useNativeDriver: true }));
    anim.start();
    return () => anim.stop();
  }, [isProcessing, isSpeaking]);

  useEffect(() => {
    const hi = isSpeaking ? 1 : 0.85;
    const dur = isSpeaking ? 400 : 1800;
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(glowPulse, { toValue: hi, duration: dur, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(glowPulse, { toValue: 0.5, duration: dur, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    anim.start();
    return () => anim.stop();
  }, [isSpeaking]);

  useEffect(() => {
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(sparkleAnim, { toValue: 0.9, duration: 1200, useNativeDriver: true }),
      Animated.timing(sparkleAnim, { toValue: 0.2, duration: 1200, useNativeDriver: true }),
    ]));
    anim.start();
    return () => anim.stop();
  }, []);

  useEffect(() => {
    Animated.timing(coreScale, { toValue: isSpeaking ? 1.08 : 1, duration: 250, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
  }, [isSpeaking]);

  useEffect(() => {
    const dur = isSpeaking ? 600 : 1500;
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(ringPulse, { toValue: 1.02, duration: dur, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(ringPulse, { toValue: 1, duration: dur, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    anim.start();
    return () => anim.stop();
  }, [isSpeaking]);

  const ringDeg = ringRotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const sphereSize = size * 0.52;
  const innerGlowSize = size * 0.88;
  const outerGlowSize = size * 1.12;
  const nebulaSparkles = useMemo(() => generateNebulaSparkles(38), []);

  return (
    <View style={{ width: size, height: size, ...styles.container }}>
      {sparkles.map((sp, i) => (
        <Animated.View key={`sp-${i}`} style={{ position: 'absolute', width: sp.size, height: sp.size, borderRadius: sp.size, backgroundColor: sp.color, left: `${sp.x}%`, top: `${sp.y}%`, opacity: sparkleAnim }} />
      ))}

      <Animated.View style={{ position: 'absolute', width: outerGlowSize, height: outerGlowSize, borderRadius: outerGlowSize / 2, opacity: glowPulse, transform: [{ scale: breathe }] }}>
        <LinearGradient colors={['rgba(57,22,161,0.28)', 'rgba(197,71,255,0.20)', 'rgba(16,108,157,0.20)', 'transparent']} style={{ width: outerGlowSize, height: outerGlowSize, borderRadius: outerGlowSize / 2 }} start={{ x: 0.42, y: 0.22 }} end={{ x: 0.65, y: 0.88 }} />
      </Animated.View>

      <Animated.View style={{ position: 'absolute', width: innerGlowSize, height: innerGlowSize, borderRadius: innerGlowSize / 2, transform: [{ scale: breathe }] }}>
        <LinearGradient colors={['rgba(105,39,217,0.14)', 'rgba(229,94,255,0.32)', 'rgba(56,189,248,0.26)', 'transparent']} style={{ width: innerGlowSize, height: innerGlowSize, borderRadius: innerGlowSize / 2 }} start={{ x: 0.25, y: 0.24 }} end={{ x: 0.78, y: 0.84 }} />
      </Animated.View>

      {rings.map((ring, i) => {
        const d = ring.radius * size;
        return <Animated.View key={`ring-${i}`} style={{ position: 'absolute', width: d, height: d, borderRadius: d / 2, borderWidth: ring.width, borderColor: ring.color, opacity: i < 3 ? 1 : 0.9, transform: [{ rotate: ringDeg }, { scale: ringPulse }] }} />;
      })}

      {[0.78, 0.96, 1.14].map((radius, i) => {
        const orbit = radius * size;
        return (
          <Animated.View key={`glint-${i}`} style={{ position: 'absolute', width: orbit, height: orbit, transform: [{ rotate: ringDeg }] }}>
            <View style={{ position: 'absolute', top: orbit * 0.48, left: -2, width: 22, height: 3.5, borderRadius: 999, backgroundColor: i === 1 ? 'rgba(255,255,255,0.94)' : 'rgba(245,215,255,0.96)', shadowColor: '#d946ef', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 14 }} />
          </Animated.View>
        );
      })}

      <Animated.View style={{ width: sphereSize, height: sphereSize, borderRadius: sphereSize / 2, ...styles.sphere, transform: [{ scale: coreScale }] }}>
        <LinearGradient colors={['#040a1c', '#08162f', '#0f347f', '#4d1db3']} locations={[0, 0.22, 0.62, 1]} style={{ width: sphereSize, height: sphereSize, borderRadius: sphereSize / 2 }} />
        <LinearGradient colors={['rgba(6,12,30,0.20)', 'transparent', 'transparent', 'rgba(7,10,25,0.45)']} locations={[0, 0.22, 0.62, 1]} style={{ position: 'absolute', width: sphereSize, height: sphereSize, borderRadius: sphereSize / 2 }} />
        <LinearGradient colors={['rgba(194,250,255,0.98)', 'rgba(94,232,255,0.85)', 'rgba(84,168,255,0.50)', 'rgba(230,115,255,0.38)', 'transparent']} locations={[0, 0.12, 0.4, 0.7, 1]} style={{ position: 'absolute', width: sphereSize, height: sphereSize, borderRadius: sphereSize / 2 }} />
        <View style={{ position: 'absolute', width: sphereSize * 0.40, height: sphereSize * 0.40, borderRadius: 999, left: sphereSize * 0.30, top: sphereSize * 0.18, backgroundColor: 'rgba(158,248,255,0.98)', shadowColor: '#67e8f9', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 28 }} />
        <View style={{ position: 'absolute', width: sphereSize * 0.07, height: sphereSize * 0.07, borderRadius: 999, left: sphereSize * 0.465, top: sphereSize * 0.42, backgroundColor: 'rgba(245,255,255,0.99)', shadowColor: '#9df6ff', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 14 }} />
        <View style={{ position: 'absolute', width: sphereSize * 0.34, height: sphereSize * 0.34, borderRadius: 999, left: sphereSize * 0.50, top: sphereSize * 0.06, backgroundColor: 'rgba(120,235,255,0.28)', shadowColor: '#67e8f9', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.82, shadowRadius: 22 }} />
        <View style={{ position: 'absolute', width: sphereSize * 0.26, height: sphereSize * 0.26, borderRadius: 999, right: sphereSize * 0.04, top: sphereSize * 0.10, backgroundColor: 'rgba(255,170,248,0.72)', shadowColor: '#f0abfc', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 24 }} />
        <LinearGradient colors={['transparent', 'rgba(146,85,255,0.16)', 'rgba(223,121,255,0.30)']} locations={[0, 0.56, 1]} style={{ position: 'absolute', width: sphereSize, height: sphereSize, borderRadius: sphereSize / 2 }} />
        {nebulaSparkles.map((dot, i) => <View key={`ns-${i}`} style={{ position: 'absolute', width: dot.r * 2, height: dot.r * 2, borderRadius: dot.r, backgroundColor: dot.c, left: `${dot.x}%`, top: `${dot.y}%` }} />)}
        <LinearGradient colors={['rgba(255,255,255,0.12)', 'rgba(145,214,255,0.06)', 'transparent']} locations={[0, 0.38, 1]} style={{ position: 'absolute', width: sphereSize, height: sphereSize, borderRadius: sphereSize / 2 }} />
        <View style={{ position: 'absolute', inset: 0, borderRadius: sphereSize / 2, borderWidth: 2.2, borderColor: 'rgba(255,209,252,0.90)' }} />
        <View style={{ position: 'absolute', inset: 3, borderRadius: sphereSize / 2, borderWidth: 1.2, borderColor: 'rgba(117,234,255,0.48)' }} />
      </Animated.View>

      <View style={{ position: 'absolute', width: sphereSize * 0.30, height: sphereSize * 0.12, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.22)', top: size / 2 - sphereSize * 0.22, left: size / 2 - sphereSize * 0.14 }} />
      <View style={{ position: 'absolute', width: sphereSize * 0.14, height: sphereSize * 0.05, borderRadius: 999, backgroundColor: 'rgba(118,211,255,0.16)', top: size / 2 + sphereSize * 0.20 }} />
    </View>
  );
};

export default PremiumCosmicOrb;