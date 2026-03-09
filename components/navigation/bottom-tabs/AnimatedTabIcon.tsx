import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

interface AnimatedTabIconProps {
  name: string;
  size: number;
  color: string;
  active: boolean;
}

export function AnimatedTabIcon({ name, size, color, active }: AnimatedTabIconProps) {
  const scale = useSharedValue(1);

  React.useEffect(() => {
    scale.value = active
      ? withSpring(1.12, { damping: 10, stiffness: 200 })
      : withSpring(1, { damping: 14, stiffness: 120 });
  }, [active, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Ionicons name={name as never} size={size} color={color} />
    </Animated.View>
  );
}
