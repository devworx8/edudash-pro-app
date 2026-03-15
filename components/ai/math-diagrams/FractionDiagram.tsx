/**
 * Fraction Diagram Component
 *
 * Renders a visual fraction representation with blocks
 */

import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import { PREMIUM_COLORS } from '@/lib/theme/premiumDashTheme';
import type { FractionData, FractionDiagramProps } from './types';

// Layout constants
const BLOCK_W = 36;
const BLOCK_H = 24;
const BLOCK_GAP = 4;
const FS = 20;
const MONO = Platform.OS === 'ios' ? 'Courier New' : 'monospace';

// Chalk colors
const CHALK = {
  white: PREMIUM_COLORS.chalkWhite,
  yellow: PREMIUM_COLORS.chalkYellow,
  cyan: PREMIUM_COLORS.chalkCyan,
  green: PREMIUM_COLORS.chalkGreen,
  filled: PREMIUM_COLORS.primary + '80', // Semi-transparent fill
  empty: 'rgba(255, 255, 255, 0.1)',
};

/**
 * Fraction Diagram Component
 */
export function FractionDiagram({ data, revealed = 999 }: FractionDiagramProps) {
  const { numerator, denominator, visualBlocks = denominator } = data;

  // Ensure we don't show more blocks than denominator
  const totalBlocks = Math.min(visualBlocks, 12); // Cap at 12 for visual clarity
  const filledBlocks = Math.round((numerator / denominator) * totalBlocks);

  // Calculate SVG dimensions
  const totalWidth = totalBlocks * (BLOCK_W + BLOCK_GAP) - BLOCK_GAP;
  const SVG_W = Math.max(totalWidth, 200);
  const SVG_H = BLOCK_H + 60;

  return (
    <View style={styles.container}>
      {/* Fraction display */}
      <View style={styles.fractionDisplay}>
        <Text style={styles.numerator}>{numerator}</Text>
        <View style={styles.fractionLine} />
        <Text style={styles.denominator}>{denominator}</Text>
      </View>

      {/* Visual blocks */}
      <Svg width={SVG_W} height={SVG_H}>
        {Array.from({ length: totalBlocks }).map((_, i) => {
          const x = i * (BLOCK_W + BLOCK_GAP);
          const isFilled = i < filledBlocks;

          return (
            <Rect
              key={`block-${i}`}
              x={x}
              y={30}
              width={BLOCK_W}
              height={BLOCK_H}
              fill={isFilled ? CHALK.filled : CHALK.empty}
              stroke={CHALK.white}
              strokeWidth={1.5}
              rx={4}
            />
          );
        })}

        {/* Percentage label */}
        <SvgText
          x={SVG_W / 2}
          y={20}
          textAnchor="middle"
          fill={CHALK.cyan}
          fontSize={14}
          fontFamily={MONO}
        >
          {Math.round((numerator / denominator) * 100)}%
        </SvgText>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  fractionDisplay: {
    alignItems: 'center',
    marginBottom: 16,
  },
  numerator: {
    fontSize: 28,
    fontWeight: '700',
    color: PREMIUM_COLORS.chalkWhite,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  fractionLine: {
    width: 48,
    height: 3,
    backgroundColor: PREMIUM_COLORS.chalkWhite,
    marginVertical: 4,
  },
  denominator: {
    fontSize: 28,
    fontWeight: '700',
    color: PREMIUM_COLORS.chalkWhite,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
});

export default FractionDiagram;
