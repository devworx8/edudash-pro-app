/**
 * GlassCaptionCard
 *
 * Extraordinary glassmorphism card for Dash Voice captions.
 * Layers (back → front):
 *   1. Animated aurora border — Reanimated hue-cycling gradient via SVG
 *   2. BlurView — frosted glass backdrop (expo-blur)
 *   3. LinearGradient tint — deep glass colour wash
 *   4. Inner highlight streak — light refraction simulation
 *   5. Content slot
 *   6. Streaming pulse dot
 */

import React, { useEffect, useRef, ReactNode } from 'react';
import { View, StyleSheet, ViewStyle, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolateColor,
  useAnimatedProps,
  type SharedValue,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect, Path } from 'react-native-svg';

// ─── Aurora border colour stops ──────────────────────────────────────────────
// Cycle through: violet → indigo → cyan → teal → violet
const AURORA_STOPS = [
  '#7c3aed', // violet
  '#4f46e5', // indigo
  '#0ea5e9', // sky
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#7c3aed', // loop back
];

const AnimatedRect = Animated.createAnimatedComponent(Rect);

interface Props {
  children: ReactNode;
  /** If true, shows the pulsing streaming indicator in the bottom-right */
  streaming?: boolean;
  style?: ViewStyle;
  /** 0–1 glass tint intensity (default 0.18) */
  tintOpacity?: number;
}

export function GlassCaptionCard({
  children,
  streaming = false,
  style,
  tintOpacity = 0.18,
}: Props) {
  // ── Hue rotation 0→1, looping ─────────────────────────────────────────────
  const hue = useSharedValue(0);

  useEffect(() => {
    hue.value = withRepeat(
      withTiming(1, { duration: 6000, easing: Easing.linear }),
      -1,   // infinite
      false // no reverse — smooth loop
    );
  }, []);

  // ── Animated border glow opacity (breathes 0.6 ↔ 1.0) ────────────────────
  const glow = useSharedValue(0.6);
  useEffect(() => {
    glow.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
  }, []);

  // ── Streaming pulse scale ─────────────────────────────────────────────────
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (streaming) {
      pulse.value = withRepeat(
        withTiming(1.6, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else {
      pulse.value = 1;
    }
  }, [streaming]);

  // ── Border gradient animated stop colours ────────────────────────────────
  const stop0 = useAnimatedStyle(() => ({
    opacity: glow.value,
  }));

  // Colour for outer glow shadow — interpolated along aurora cycle
  const glowStyle = useAnimatedStyle(() => {
    const color = interpolateColor(
      hue.value,
      [0, 0.2, 0.4, 0.6, 0.8, 1],
      ['#7c3aed', '#4f46e5', '#0ea5e9', '#06b6d4', '#10b981', '#7c3aed']
    );
    return {
      shadowColor: color,
      shadowOpacity: glow.value * 0.9,
    };
  });

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity: streaming ? glow.value : 0,
  }));

  // Corner radius matches card
  const R = 20;

  return (
    <Animated.View style={[styles.wrapper, glowStyle, style]}>
      {/* ── Layer 1: Aurora SVG border ──────────────────────────────────── */}
      <AuroraBorder hue={hue} radius={R} />

      {/* ── Layer 2 + 3: BlurView + gradient tint ───────────────────────── */}
      <View style={[styles.inner, { borderRadius: R }]}>
        <BlurView
          intensity={Platform.OS === 'android' ? 20 : 40}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
        {/* Glass tint gradient — diagonal deep blue/violet wash */}
        <LinearGradient
          colors={[
            `rgba(99,102,241,${tintOpacity})`,    // indigo
            `rgba(15,23,42,${tintOpacity + 0.08})`, // dark slate
            `rgba(6,182,212,${tintOpacity - 0.06})`, // cyan hint
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        {/* ── Layer 4: Top-edge refraction highlight ───────────────────── */}
        <LinearGradient
          colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.00)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.highlight}
        />

        {/* ── Layer 5: Content ─────────────────────────────────────────── */}
        <View style={styles.content}>
          {children}
        </View>

        {/* ── Layer 6: Streaming pulse dot ─────────────────────────────── */}
        {streaming && (
          <View style={styles.dotAnchor}>
            <Animated.View style={[styles.pulseRing, pulseStyle]} />
            <View style={styles.dot} />
          </View>
        )}
      </View>
    </Animated.View>
  );
}

// ─── Aurora SVG border as a separate sub-component ───────────────────────────
// We draw a rounded-rect path with a gradient stroke that shifts hue each frame.
// Because react-native-svg doesn't animate SVG props via Reanimated directly we
// use a JS-driven interpolation on an Animated.View opacity wrapper for each
// coloured layer, then show whichever is "active" through opacity blending.

const BORDER_CONFIGS: { colors: [string, string, string, string]; rotation: number }[] = [
  { colors: ['#7c3aed', '#4f46e5', '#0ea5e9', '#06b6d4'], rotation: 0 },
  { colors: ['#4f46e5', '#0ea5e9', '#06b6d4', '#10b981'], rotation: 1 },
  { colors: ['#0ea5e9', '#06b6d4', '#10b981', '#7c3aed'], rotation: 2 },
  { colors: ['#06b6d4', '#10b981', '#7c3aed', '#4f46e5'], rotation: 3 },
];

function AuroraBorder({
  hue,
  radius,
}: {
  hue: SharedValue<number>;
  radius: number;
}) {
  // Four gradient border layers, each fading in/out as hue cycles
  const styles0 = useAnimatedStyle(() => {
    const segment = hue.value * 4;
    const opacity = Math.max(0, 1 - Math.abs(segment % 4 - 0));
    return { opacity };
  });
  const styles1 = useAnimatedStyle(() => {
    const segment = hue.value * 4;
    const opacity = Math.max(0, 1 - Math.abs(segment % 4 - 1));
    return { opacity };
  });
  const styles2 = useAnimatedStyle(() => {
    const segment = hue.value * 4;
    const opacity = Math.max(0, 1 - Math.abs(segment % 4 - 2));
    return { opacity };
  });
  const styles3 = useAnimatedStyle(() => {
    const segment = hue.value * 4;
    const d = segment % 4;
    const opacity = Math.max(0, 1 - Math.min(Math.abs(d - 3), Math.abs(d - 4 + 0.001)));
    return { opacity };
  });

  const animStyles = [styles0, styles1, styles2, styles3];

  return (
    <View style={[StyleSheet.absoluteFill, borderStyles.borderWrapper]}>
      {BORDER_CONFIGS.map((cfg, i) => (
        <Animated.View key={i} style={[StyleSheet.absoluteFill, animStyles[i]]}>
          <Svg width="100%" height="100%">
            <Defs>
              <SvgLinearGradient
                id={`grad${i}`}
                x1="0%"
                y1="0%"
                x2={i % 2 === 0 ? '100%' : '0%'}
                y2={i % 2 === 0 ? '0%' : '100%'}
              >
                {cfg.colors.map((color, j) => (
                  <Stop
                    key={j}
                    offset={`${(j / (cfg.colors.length - 1)) * 100}%`}
                    stopColor={color}
                    stopOpacity="1"
                  />
                ))}
              </SvgLinearGradient>
            </Defs>
            <Rect
              x="1"
              y="1"
              width="99%"
              height="99%"
              rx={radius}
              ry={radius}
              fill="none"
              stroke={`url(#grad${i})`}
              strokeWidth="1.5"
            />
          </Svg>
        </Animated.View>
      ))}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    borderRadius: 20,
    // Glow shadow — color is animated above
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 18,
    elevation: 16,
    marginBottom: 12,
  },
  inner: {
    overflow: 'hidden',
    minHeight: 260,
    maxHeight: 520,
  },
  highlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 60,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  content: {
    flex: 1,
    padding: 18,
    paddingTop: 22,
    minHeight: 260,
    maxHeight: 520,
  },
  dotAnchor: {
    position: 'absolute',
    bottom: 12,
    right: 14,
    alignItems: 'center',
    justifyContent: 'center',
    width: 16,
    height: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#06b6d4',
    position: 'absolute',
  },
  pulseRing: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#06b6d4',
    position: 'absolute',
  },
});

const borderStyles = StyleSheet.create({
  borderWrapper: {
    borderRadius: 20,
    overflow: 'hidden',
  },
});
