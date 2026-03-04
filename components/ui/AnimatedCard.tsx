/**
 * AnimatedCard — spring entrance animation wrapper for dashboard cards.
 *
 * Usage:
 *   <AnimatedCard index={0}>
 *     <YourCardContent />
 *   </AnimatedCard>
 *
 * Each card fades + slides in with a stagger based on `index`.
 * Uses Reanimated 3 shared values + native driver for 60 fps.
 */
import React, { useEffect } from 'react';
import { ViewStyle, StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface AnimatedCardProps {
  children: React.ReactNode;
  /** Stagger index: 0 = first card, 1 = second, etc. */
  index?: number;
  /** Additional styles applied to the wrapper */
  style?: StyleProp<ViewStyle>;
  /** Disable entrance animation (e.g. for already-visible content) */
  disabled?: boolean;
}

const STAGGER_MS = 80;

export const AnimatedCard: React.FC<AnimatedCardProps> = ({
  children,
  index = 0,
  style,
  disabled = false,
}) => {
  const opacity = useSharedValue(disabled ? 1 : 0);
  const translateY = useSharedValue(disabled ? 0 : 18);
  const scale = useSharedValue(disabled ? 1 : 0.97);

  useEffect(() => {
    if (disabled) return;
    const delay = index * STAGGER_MS;

    opacity.value = withDelay(
      delay,
      withTiming(1, { duration: 340, easing: Easing.out(Easing.quad) }),
    );
    translateY.value = withDelay(
      delay,
      withSpring(0, { damping: 18, stiffness: 160, mass: 0.8 }),
    );
    scale.value = withDelay(
      delay,
      withSpring(1, { damping: 20, stiffness: 200 }),
    );
  }, [disabled, index, opacity, translateY, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Animated.View style={[animatedStyle, style]}>
      {children}
    </Animated.View>
  );
};

export default AnimatedCard;
