/**
 * ChalkLine - Animated Whiteboard Line Component
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { PREMIUM_COLORS } from '@/lib/theme/premiumDashTheme';

// =============================================================================
// Types
// =============================================================================

export type LineKind = 'heading' | 'equation' | 'step' | 'result' | 'explanation' | 'plain';

export interface ChalkLineProps {
  line: string;
  index: number;
  kind: LineKind;
  onReveal?: () => void;
}

// =============================================================================
// Line Classification Config
// =============================================================================

export const KIND_CONFIG: Record<LineKind, { color: string; size: number; weight: string }> = {
  heading: { color: PREMIUM_COLORS.chalkYellow, size: 18, weight: '700' },
  equation: { color: PREMIUM_COLORS.chalkCyan, size: 20, weight: '600' },
  step: { color: PREMIUM_COLORS.chalkGreen, size: 15, weight: '600' },
  result: { color: PREMIUM_COLORS.chalkPink, size: 17, weight: '700' },
  explanation: { color: PREMIUM_COLORS.chalkWhite, size: 14, weight: '400' },
  plain: { color: PREMIUM_COLORS.chalkWhite, size: 15, weight: '400' },
};

// =============================================================================
// ChalkLine Component
// =============================================================================

export function ChalkLine({ line, index, kind, onReveal }: ChalkLineProps) {
  const config = KIND_CONFIG[kind];
  const wipe = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const delay = index * 200;
    opacity.value = withDelay(delay, withTiming(1, { duration: 150 }));
    wipe.value = withDelay(
      delay,
      withTiming(1, {
        duration: Math.max(250, line.length * 12),
        easing: Easing.out(Easing.quad),
      }),
    );

    // Notify when revealed
    const timeout = setTimeout(() => onReveal?.(), delay + 100);
    return () => clearTimeout(timeout);
  }, [index, line, onReveal]);

  const anim = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scaleX: wipe.value }],
  }));

  const stepNum =
    kind === 'step' ? (line.match(/^(\d+)[.)]/) || line.match(/Step\s*(\d+)/i) || [])[1] : null;

  const display =
    kind === 'step'
      ? line.replace(/^[\u2022\u00b7\u25b6]\s|^\d+[.)]\s/, '').replace(/^Step\s*\d+:?\s*/i, '')
      : line;

  return (
    <Animated.View
      style={[
        styles.lineRow,
        kind === 'heading' && styles.headingRow,
        kind === 'equation' && styles.equationRow,
        kind === 'result' && styles.resultRow,
        anim,
      ]}
    >
      {stepNum && (
        <View style={[styles.stepBadge, { borderColor: config.color }]}>
          <Text style={[styles.stepNum, { color: config.color }]}>{stepNum}</Text>
        </View>
      )}
      <Text
        style={[
          styles.chalkText,
          {
            color: config.color,
            fontSize: config.size,
            fontWeight: config.weight as any,
          },
        ]}
        accessibilityRole="text"
      >
        {display}
      </Text>
    </Animated.View>
  );
}

// =============================================================================
// Styles
// =============================================================================

const styles = StyleSheet.create({
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  headingRow: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(251,191,36,0.3)',
    paddingBottom: 6,
    marginBottom: 14,
  },
  equationRow: {
    backgroundColor: 'rgba(103,232,249,0.1)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  resultRow: {
    backgroundColor: 'rgba(249,168,212,0.1)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderLeftWidth: 3,
    borderLeftColor: PREMIUM_COLORS.chalkPink,
  },
  chalkText: {
    flex: 1,
    lineHeight: 26,
    fontFamily: Platform.OS === 'ios' ? 'Chalkboard SE' : 'monospace',
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepNum: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Chalkboard SE' : 'monospace',
  },
});

export default ChalkLine;
