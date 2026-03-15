/**
 * DashOrb — 3D Spinning Sphere
 *
 * Solid spherical orb with 3D lighting, continuous rotation via a
 * scrolling gradient strip, and audio-reactive pulsing.
 * Uses react-native-reanimated v4 and expo-linear-gradient.
 *
 * States: idle · listening · thinking · speaking
 *
 * @module components/dash-orb/DashOrb
 */

import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  Extrapolate,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

// ── Types ───────────────────────────────────────────────────────────

export type DashOrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface DashOrbProps {
  /** Outer orb diameter in pixels */
  size: number;
  /** Current animation state */
  state?: DashOrbState;
  /** Normalized audio level 0-1 */
  audioLevel?: number;
  /** Optional viseme ID (0-n) when speaking */
  visemeId?: number;
}

// ── Helpers ─────────────────────────────────────────────────────────

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// ── Palette per state ───────────────────────────────────────────────

interface SpherePalette {
  /** Scrolling gradient strip colours (periodic: first ≈ last) */
  strip: readonly string[];
  /** Specular highlight tint */
  specular: string;
  /** Outer glow colour (idle intensity) */
  glow: string;
}

function paletteForState(state: DashOrbState): SpherePalette {
  switch (state) {
    case 'listening':
      return {
        strip: ['#051f1a', '#0a3d33', '#10b981', '#34d399', '#6ee7b7', '#34d399', '#10b981', '#0a3d33', '#051f1a'],
        specular: 'rgba(160,255,220,0.85)',
        glow: 'rgba(16,185,129,0.32)',
      };
    case 'thinking':
      return {
        strip: ['#0c0824', '#1e1054', '#6d28d9', '#8b5cf6', '#c4b5fd', '#8b5cf6', '#6d28d9', '#1e1054', '#0c0824'],
        specular: 'rgba(200,180,255,0.80)',
        glow: 'rgba(109,40,217,0.28)',
      };
    case 'speaking':
      return {
        strip: ['#1a0f00', '#3d2508', '#e67e22', '#f39c12', '#fad390', '#f39c12', '#e67e22', '#3d2508', '#1a0f00'],
        specular: 'rgba(255,240,200,0.90)',
        glow: 'rgba(230,126,34,0.38)',
      };
    case 'idle':
    default:
      return {
        strip: ['#04101a', '#0b2840', '#0891b2', '#22d3ee', '#67e8f9', '#22d3ee', '#0891b2', '#0b2840', '#04101a'],
        specular: 'rgba(180,240,255,0.75)',
        glow: 'rgba(8,145,178,0.22)',
      };
  }
}

// ── DashOrb ─────────────────────────────────────────────────────────

export function DashOrb({
  size,
  state = 'idle',
  audioLevel = 0,
}: DashOrbProps) {
  const spin = useSharedValue(0);
  const pulse = useSharedValue(1);
  const glowPulse = useSharedValue(0);
  const voiceAmp = useSharedValue(0);

  const a = clamp01(audioLevel || 0);
  const r = size / 2;
  // Strip is 2× sphere width: two identical gradient cycles → seamless scroll
  const stripW = size * 2;

  const palette = useMemo(() => paletteForState(state), [state]);

  // ── Drive animations per state ────────────────────────────────────
  useEffect(() => {
    voiceAmp.value = withTiming(a, { duration: 90 });

    // Spin: translateX from 0 → −size (one cycle)
    const spinMs =
      state === 'speaking' ? 1800 :
      state === 'listening' ? 2800 :
      state === 'thinking' ? 2200 : 4500;

    spin.value = 0;
    spin.value = withRepeat(
      withTiming(1, { duration: spinMs, easing: Easing.linear }),
      -1,
      false,
    );

    // Pulse / breathe
    const pulseCfg =
      state === 'speaking'
        ? { hi: 1.10, lo: 1.0, up: 280, dn: 320 }
        : state === 'listening'
          ? { hi: 1.05, lo: 1.0, up: 550, dn: 650 }
          : state === 'thinking'
            ? { hi: 1.04, lo: 0.97, up: 650, dn: 650 }
            : { hi: 1.02, lo: 1.0, up: 1100, dn: 1100 };
    pulse.value = withRepeat(
      withSequence(
        withTiming(pulseCfg.hi, { duration: pulseCfg.up }),
        withTiming(pulseCfg.lo, { duration: pulseCfg.dn }),
      ),
      -1,
      false,
    );

    // Glow intensity cycle
    glowPulse.value =
      state === 'speaking'
        ? withRepeat(withSequence(withTiming(1, { duration: 280 }), withTiming(0.30, { duration: 380 })), -1, false)
        : state === 'listening'
          ? withRepeat(withSequence(withTiming(0.85, { duration: 450 }), withTiming(0.20, { duration: 550 })), -1, false)
          : withRepeat(withSequence(withTiming(0.55, { duration: 750 }), withTiming(0.10, { duration: 850 })), -1, false);
  }, [a, state, spin, pulse, glowPulse, voiceAmp]);

  // ── Animated styles ───────────────────────────────────────────────

  // Scrolling gradient strip — creates the rotation illusion
  const stripStyle = useAnimatedStyle(() => {
    const tx = interpolate(spin.value, [0, 1], [0, -size], Extrapolate.CLAMP);
    const amp = voiceAmp.value;
    const voiceScale =
      state === 'speaking'
        ? interpolate(amp, [0, 1], [1.0, 1.12], Extrapolate.CLAMP)
        : 1;
    return {
      transform: [
        { translateX: tx } as any,
        { scale: (pulse.value * voiceScale) as number } as any,
      ],
    };
  }, [state, size]);

  // Outer glow
  const glowStyle = useAnimatedStyle(() => {
    const s = interpolate(glowPulse.value, [0, 1], [1.0, 1.18], Extrapolate.CLAMP);
    const o = interpolate(glowPulse.value, [0, 1], [0.25, 0.65], Extrapolate.CLAMP);
    return { opacity: o, transform: [{ scale: s }] };
  });

  // Specular highlight drifts with spin
  const specStyle = useAnimatedStyle(() => {
    const sx = interpolate(spin.value, [0, 0.5, 1], [-3, 3, -3], Extrapolate.CLAMP);
    return { transform: [{ translateX: sx }] };
  });

  // ── Render ────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { width: size, height: size }]}>
      {/* Outer glow halo */}
      <Animated.View
        style={[
          styles.glow,
          glowStyle,
          {
            width: size * 1.6,
            height: size * 1.6,
            borderRadius: size * 0.8,
            backgroundColor: palette.glow,
          },
        ]}
      />

      {/* Sphere body — circular clip */}
      <View style={[styles.sphereClip, { width: size, height: size, borderRadius: r }]}>
        {/* Scrolling strip (2 gradient cycles for seamless loop) */}
        <Animated.View style={[{ width: stripW, height: size, position: 'absolute', left: 0, top: 0 }, stripStyle]}>
          <LinearGradient
            colors={palette.strip as any}
            start={{ x: 0, y: 0.35 }}
            end={{ x: 1, y: 0.65 }}
            style={{ width: stripW, height: size }}
          />
        </Animated.View>

        {/* Spherical curvature overlay — dark edges, brighter centre */}
        <LinearGradient
          colors={['rgba(255,255,255,0.15)', 'rgba(255,255,255,0.03)', 'rgba(0,0,0,0.40)']}
          start={{ x: 0.3, y: 0.2 }}
          end={{ x: 0.8, y: 0.9 }}
          style={StyleSheet.absoluteFillObject}
        />

        {/* Top-to-bottom edge darkening (depth cue) */}
        <LinearGradient
          colors={['rgba(0,0,0,0.10)', 'transparent', 'rgba(0,0,0,0.18)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />

        {/* Specular highlight — bright spot near top-left */}
        <Animated.View
          style={[
            styles.specular,
            specStyle,
            {
              width: size * 0.32,
              height: size * 0.22,
              borderRadius: size * 0.16,
              top: size * 0.13,
              left: size * 0.20,
              backgroundColor: palette.specular,
            },
          ]}
        />

        {/* Secondary specular — smaller, sharper */}
        <View
          style={[
            styles.specularSharp,
            {
              width: size * 0.12,
              height: size * 0.08,
              borderRadius: size * 0.06,
              top: size * 0.17,
              left: size * 0.28,
              backgroundColor: 'rgba(255,255,255,0.70)',
            },
          ]}
        />

        {/* Rim-light — subtle bottom highlight */}
        <View
          style={[
            styles.rimLight,
            {
              width: size * 0.45,
              height: size * 0.06,
              borderRadius: size * 0.03,
              bottom: size * 0.09,
              left: size * 0.275,
              backgroundColor: 'rgba(255,255,255,0.06)',
            },
          ]}
        />
      </View>
    </View>
  );
}

export default DashOrb;

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  glow: {
    position: 'absolute',
    ...Platform.select({
      ios: {
        shadowColor: '#FFFFFF',
        shadowOpacity: 0.40,
        shadowRadius: 22,
        shadowOffset: { width: 0, height: 0 },
      },
      android: { elevation: 10 },
    }),
  },
  sphereClip: {
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOpacity: 0.55,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 6 },
      },
      android: { elevation: 14 },
    }),
  },
  specular: {
    position: 'absolute',
    opacity: 0.75,
  },
  specularSharp: {
    position: 'absolute',
    opacity: 0.50,
  },
  rimLight: {
    position: 'absolute',
  },
});
