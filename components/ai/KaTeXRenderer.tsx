/**
 * KaTeXRenderer - LaTeX Math Equation Rendering for Dash Board
 *
 * Renders mathematical equations from LaTeX notation:
 * - Inline math ($...$)
 * - Display math ($$...$$)
 * - Common math symbols and operations
 *
 * Uses modular utilities from ./katex-utils/
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { PREMIUM_COLORS } from '@/lib/theme/premiumDashTheme';
import { replaceLatexSymbols, processMathContent } from './katex-utils';

// =============================================================================
// MathText Component
// =============================================================================

interface MathTextProps {
  text: string;
  variant?: 'inline' | 'display';
  color?: string;
  size?: number;
}

export function MathText({ text, variant = 'inline', color, size }: MathTextProps) {
  const fontSize = size || (variant === 'display' ? 24 : 18);
  const textColor = color || PREMIUM_COLORS.chalkCyan;

  const rendered = useMemo(() => {
    let result = replaceLatexSymbols(text);

    // Handle simple fractions like \frac{1}{2}
    result = result.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, (_, num, den) => `${num}/${den}`);

    // Handle exponents
    result = result.replace(/\^{([^}]+)}/g, (_, exp) => `^${exp}`);
    result = result.replace(/\^(\d)/g, (_, exp) => `^${exp}`);

    // Remove remaining LaTeX commands
    result = result.replace(/\\[a-zA-Z]+/g, '');
    result = result.replace(/[{}]/g, '');

    return result;
  }, [text]);

  return (
    <Text
      style={[
        styles.mathText,
        { color: textColor, fontSize },
        variant === 'display' && styles.displayMath,
      ]}
    >
      {rendered}
    </Text>
  );
}

// =============================================================================
// FractionDisplay Component
// =============================================================================

interface FractionDisplayProps {
  numerator: string;
  denominator: string;
  color?: string;
  size?: number;
}

export function FractionDisplay({
  numerator,
  denominator,
  color,
  size = 20,
}: FractionDisplayProps) {
  const fractionColor = color || PREMIUM_COLORS.chalkYellow;

  return (
    <View style={styles.fractionDisplay}>
      <Text style={[styles.fractionNum, { color: fractionColor, fontSize: size }]}>
        {numerator}
      </Text>
      <View style={[styles.fractionLine, { backgroundColor: fractionColor }]} />
      <Text style={[styles.fractionDen, { color: fractionColor, fontSize: size }]}>
        {denominator}
      </Text>
    </View>
  );
}

// =============================================================================
// EquationDisplay Component
// =============================================================================

interface EquationDisplayProps {
  equation: string;
  step?: number;
  totalSteps?: number;
  revealed?: boolean;
}

export function EquationDisplay({
  equation,
  step,
  totalSteps,
  revealed = true,
}: EquationDisplayProps) {
  if (!revealed) return null;

  return (
    <Animated.View entering={FadeIn.duration(300)} style={styles.equationContainer}>
      <MathText text={equation} variant="display" />
      {step !== undefined && totalSteps !== undefined && (
        <Text style={styles.stepIndicator}>
          Step {step} of {totalSteps}
        </Text>
      )}
    </Animated.View>
  );
}

// =============================================================================
// MathContentRenderer Component
// =============================================================================

interface MathContentRendererProps {
  text: string;
  onTTSRead?: (text: string) => void;
}

/**
 * Render text containing mixed math and regular content
 */
export function MathContentRenderer({ text, onTTSRead }: MathContentRendererProps) {
  const content = useMemo(() => processMathContent(text), [text]);

  return (
    <View style={styles.contentContainer}>
      {content.map((item, index) => {
        switch (item.type) {
          case 'display-math':
            return (
              <View key={index} style={styles.displayMathContainer}>
                <MathText text={item.content} variant="display" />
              </View>
            );
          case 'inline-math':
            return <MathText key={index} text={item.content} variant="inline" />;
          case 'text':
          default:
            return (
              <Text key={index} style={styles.regularText}>
                {item.content}
              </Text>
            );
        }
      })}
    </View>
  );
}

// =============================================================================
// Styles
// =============================================================================

const styles = StyleSheet.create({
  mathText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  displayMath: {
    textAlign: 'center',
    paddingVertical: 8,
  },
  fractionDisplay: {
    alignItems: 'center',
    marginHorizontal: 4,
  },
  fractionNum: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontWeight: '700',
  },
  fractionLine: {
    width: 24,
    height: 2,
    marginVertical: 2,
  },
  fractionDen: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontWeight: '700',
  },
  equationContainer: {
    padding: 16,
    backgroundColor: 'rgba(103, 232, 249, 0.08)',
    borderRadius: 12,
    marginVertical: 8,
    alignItems: 'center',
  },
  stepIndicator: {
    color: PREMIUM_COLORS.textSecondary,
    fontSize: 12,
    marginTop: 8,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  contentContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  displayMathContainer: {
    width: '100%',
    alignItems: 'center',
    marginVertical: 8,
  },
  regularText: {
    color: PREMIUM_COLORS.text,
    fontSize: 16,
  },
});

// Re-export utilities for convenience
export { replaceLatexSymbols, processMathContent } from './katex-utils';
