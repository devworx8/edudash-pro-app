/**
 * AnimatedGlassCard — Next-gen glass-morphism card with entrance animation.
 *
 * Features:
 * - Reanimated fade + slide-up entrance
 * - Optional glow border (accent-colored)
 * - iOS blur backdrop via expo-blur
 * - Accent tint overlay
 *
 * Use this as the primary container for dashboard widgets, feature cards,
 * and any elevated content surface in the next-gen design system.
 */

import React, { useEffect } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { useNextGenTheme } from '@/contexts/K12NextGenThemeContext';
import { nextGenAnimation, nextGenShadows } from '@/contexts/theme/nextGenTokens';

export interface AnimatedGlassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Inner padding (default 16) */
  padding?: number;
  /** Border radius (default 18) */
  radius?: number;
  /** Enable iOS blur backdrop (default true) */
  blur?: boolean;
  /** Enable entrance animation (default true) */
  animated?: boolean;
  /** Stagger delay in ms for list scenarios (default 0) */
  delay?: number;
  /** Show accent-colored glow border */
  glow?: boolean;
  /** Glow color override (defaults to theme.primary) */
  glowColor?: string;
  /** Accent tint color overlay on the glass surface */
  accentTint?: string;
  /** onPress handler — wraps in a Pressable if provided */
  onPress?: () => void;
}

export function AnimatedGlassCard({
  children,
  style,
  padding = 16,
  radius = 18,
  blur = true,
  animated = true,
  delay = 0,
  glow = false,
  glowColor,
  accentTint,
}: AnimatedGlassCardProps) {
  const { theme } = useNextGenTheme();
  const shouldBlur = blur && Platform.OS === 'ios';

  // Entrance animation
  const progress = useSharedValue(animated ? 0 : 1);

  useEffect(() => {
    if (!animated) return;
    const timeout = setTimeout(() => {
      progress.value = withTiming(1, {
        duration: nextGenAnimation.entrance,
        easing: Easing.out(Easing.cubic),
      });
    }, delay);
    return () => clearTimeout(timeout);
  }, [animated, delay, progress]);

  const entranceStyle = useAnimatedStyle(() => {
    const translateY = interpolate(progress.value, [0, 1], [16, 0]);
    const scale = interpolate(progress.value, [0, 1], [0.97, 1]);
    return {
      opacity: interpolate(progress.value, [0, 1], [0, 1]),
      transform: `translateY(${translateY}px) scale(${scale})`,
    };
  });

  // Glow border animation
  const glowProgress = useSharedValue(0);

  useEffect(() => {
    if (!glow) {
      glowProgress.value = 0;
      return;
    }
    glowProgress.value = withSpring(1, {
      damping: nextGenAnimation.spring.damping,
      stiffness: nextGenAnimation.spring.stiffness,
    });
  }, [glow, glowProgress]);

  const resolvedGlowColor = glowColor || theme.primary;

  const glowStyle = useAnimatedStyle(() => {
    if (!glow) return {};
    return {
      borderColor: `${resolvedGlowColor}${Math.round(glowProgress.value * 0.4 * 255).toString(16).padStart(2, '0')}`,
      borderWidth: interpolate(glowProgress.value, [0, 1], [1, 1.5]),
    };
  });

  return (
    <Animated.View
      style={[
        styles.card,
        {
          borderRadius: radius,
          backgroundColor: accentTint
            ? accentTint
            : theme.surface,
          borderColor: theme.border,
          padding,
        },
        glow ? glowStyle : undefined,
        ...(glow ? [nextGenShadows.glow(resolvedGlowColor, 0.2)] : [nextGenShadows.glass]),
        entranceStyle,
        style,
      ]}
    >
      {shouldBlur && (
        <BlurView
          intensity={20}
          tint="dark"
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, { borderRadius: radius }]}
        />
      )}
      {accentTint && (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            {
              borderRadius: radius,
              backgroundColor: accentTint,
              opacity: 0.06,
            },
          ]}
        />
      )}
      <View style={styles.content}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  content: {
    zIndex: 2,
  },
});

export default AnimatedGlassCard;
