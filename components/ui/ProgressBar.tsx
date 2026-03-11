/**
 * ProgressBar Component
 * 
 * Progress indicator with customizable colors and animation
 */

import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { percentWidth } from '@/lib/progress/clampPercent';

export interface ProgressBarProps {
  progress: number; // 0 to 1
  color?: string;
  backgroundColor?: string;
  height?: number;
  style?: ViewStyle;
  animated?: boolean;
  testID?: string;
}

export function ProgressBar({
  progress,
  color,
  backgroundColor,
  height = 4,
  style,
  animated = true,
  testID,
  ...props
}: ProgressBarProps) {
  const { theme } = useTheme();
  const progressPercent = Math.max(0, Math.min(1, progress)) * 100;
  
  const fillColor = color || theme.primary;
  const trackColor = backgroundColor || theme.border;
  
  return (
    <View
      style={[
        styles.container,
        { height, backgroundColor: trackColor },
        style,
      ]}
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityValue={{
        min: 0,
        max: 100,
        now: progressPercent,
      }}
      {...props}
    >
      <View
        style={[
          styles.fill,
          {
            width: percentWidth(progressPercent),
            backgroundColor: fillColor,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 2,
  },
});