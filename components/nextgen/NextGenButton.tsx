/**
 * NextGenButton — Modern button with gradient, glass, and press animation.
 *
 * Variants:
 * - `gradient`  — filled with a linear gradient (primary → accent)
 * - `glass`     — frosted glass surface with border
 * - `outline`   — transparent with accent border
 * - `ghost`     — no background, text-only
 *
 * All variants include a Reanimated spring-scale press effect.
 */

import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle, type TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Pressable } from 'react-native';
import { useNextGenTheme } from '@/contexts/K12NextGenThemeContext';
import { nextGenPalette, nextGenAnimation } from '@/contexts/theme/nextGenTokens';

import EduDashSpinner from '@/components/ui/EduDashSpinner';

type ButtonVariant = 'gradient' | 'glass' | 'outline' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface NextGenButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  /** Gradient colors (for `gradient` variant). Defaults to purple gradient. */
  gradientColors?: readonly [string, string] | readonly [string, string, string];
  /** Icon name (Ionicons) to show left of the title */
  iconLeft?: keyof typeof Ionicons.glyphMap;
  /** Icon name (Ionicons) to show right of the title */
  iconRight?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  /** Accent color override for outline/ghost variants */
  accentColor?: string;
}

const SIZE_CONFIG = {
  sm: { paddingHorizontal: 14, paddingVertical: 8, fontSize: 12, iconSize: 14, minHeight: 34, borderRadius: 10 },
  md: { paddingHorizontal: 20, paddingVertical: 12, fontSize: 14, iconSize: 16, minHeight: 44, borderRadius: 12 },
  lg: { paddingHorizontal: 26, paddingVertical: 16, fontSize: 16, iconSize: 18, minHeight: 52, borderRadius: 14 },
} as const;

export function NextGenButton({
  title,
  onPress,
  variant = 'gradient',
  size = 'md',
  disabled = false,
  loading = false,
  gradientColors,
  iconLeft,
  iconRight,
  style,
  textStyle,
  accentColor,
}: NextGenButtonProps) {
  const { theme } = useNextGenTheme();
  const sc = SIZE_CONFIG[size];
  const isDisabled = disabled || loading;

  // Press scale animation
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.96, {
      damping: nextGenAnimation.bouncy.damping,
      stiffness: nextGenAnimation.bouncy.stiffness,
    });
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, {
      damping: nextGenAnimation.spring.damping,
      stiffness: nextGenAnimation.spring.stiffness,
    });
  };

  const accent = accentColor || theme.primary;

  const getTextColor = (): string => {
    if (isDisabled) return 'rgba(234,240,255,0.4)';
    switch (variant) {
      case 'gradient': return '#FFFFFF';
      case 'glass': return nextGenPalette.text;
      case 'outline': return accent;
      case 'ghost': return accent;
      default: return '#FFFFFF';
    }
  };

  const resolvedTextColor = getTextColor();

  const innerContent = (
    <View style={[styles.inner, { paddingHorizontal: sc.paddingHorizontal, paddingVertical: sc.paddingVertical, minHeight: sc.minHeight }]}>
      {loading ? (
        <EduDashSpinner size="small" color={resolvedTextColor} />
      ) : (
        <>
          {iconLeft && (
            <Ionicons name={iconLeft} size={sc.iconSize} color={resolvedTextColor} style={styles.iconLeft} />
          )}
          <Text style={[styles.text, { fontSize: sc.fontSize, color: resolvedTextColor }, textStyle]}>
            {title}
          </Text>
          {iconRight && (
            <Ionicons name={iconRight} size={sc.iconSize} color={resolvedTextColor} style={styles.iconRight} />
          )}
        </>
      )}
    </View>
  );

  const containerStyle: ViewStyle = {
    borderRadius: sc.borderRadius,
    overflow: 'hidden' as const,
    opacity: isDisabled ? 0.5 : 1,
  };

  const renderBody = () => {
    switch (variant) {
      case 'gradient': {
        const colors = gradientColors || [nextGenPalette.purple1, nextGenPalette.purple2];
        return (
          <LinearGradient
            colors={colors as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[containerStyle, style]}
          >
            {innerContent}
          </LinearGradient>
        );
      }
      case 'glass':
        return (
          <View
            style={[
              containerStyle,
              {
                backgroundColor: 'rgba(255,255,255,0.06)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.12)',
              },
              style,
            ]}
          >
            {innerContent}
          </View>
        );
      case 'outline':
        return (
          <View
            style={[
              containerStyle,
              {
                backgroundColor: 'transparent',
                borderWidth: 1.5,
                borderColor: `${accent}66`,
              },
              style,
            ]}
          >
            {innerContent}
          </View>
        );
      case 'ghost':
        return (
          <View style={[containerStyle, { backgroundColor: 'transparent' }, style]}>
            {innerContent}
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPress={isDisabled ? undefined : onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ disabled: isDisabled, busy: loading }}
      >
        {renderBody()}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontWeight: '700',
  },
  iconLeft: {
    marginRight: 6,
  },
  iconRight: {
    marginLeft: 6,
  },
});

export default NextGenButton;
