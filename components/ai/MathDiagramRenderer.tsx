/**
 * MathDiagramRenderer - Visual Math Diagrams for Dash Board
 *
 * Main entry point for rendering math diagrams.
 * Delegates to modular components in ./math-diagrams/
 */

import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { PREMIUM_COLORS } from '@/lib/theme/premiumDashTheme';
import {
  LongDivisionDiagram,
  FractionDiagram,
  parseLongDivision,
  parseFraction,
  type LongDivData,
  type FractionData,
} from './math-diagrams';

// =============================================================================
// Types
// =============================================================================

export interface MathDiagramRendererProps {
  expression: string;
  revealed?: number;
  onStepComplete?: (step: number) => void;
  onTTSRead?: (text: string) => void;
}

// =============================================================================
// MathDiagramRenderer Component
// =============================================================================

/**
 * Render appropriate diagram based on math expression type
 */
export function MathDiagramRenderer({
  expression,
  revealed = 999,
  onStepComplete,
  onTTSRead,
}: MathDiagramRendererProps) {
  // Try to parse as long division
  const divisionData = useMemo(() => parseLongDivision(expression), [expression]);

  // Try to parse as fraction
  const fractionData = useMemo(() => parseFraction(expression), [expression]);

  // Render division diagram
  if (divisionData) {
    return (
      <View style={styles.container}>
        <LongDivisionDiagram
          data={divisionData}
          revealed={revealed}
          onStepComplete={onStepComplete}
        />
        {onTTSRead && (
          // Provide TTS description for accessibility
          <View style={styles.ttsHelper}>{/* TTS callback is handled by parent whiteboard */}</View>
        )}
      </View>
    );
  }

  // Render fraction diagram
  if (fractionData) {
    return (
      <View style={styles.container}>
        <FractionDiagram data={fractionData} revealed={revealed} />
      </View>
    );
  }

  // No diagram available for this expression
  return null;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if expression can be rendered as a diagram
 */
export function canRenderDiagram(expression: string): boolean {
  return parseLongDivision(expression) !== null || parseFraction(expression) !== null;
}

/**
 * Get diagram type for an expression
 */
export function getDiagramType(expression: string): 'division' | 'fraction' | null {
  if (parseLongDivision(expression)) return 'division';
  if (parseFraction(expression)) return 'fraction';
  return null;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: PREMIUM_COLORS.boardBackground,
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
  },
  ttsHelper: {
    position: 'absolute',
    opacity: 0,
  },
});

// Re-export types and utilities for convenience
export type { LongDivData, FractionData } from './math-diagrams';
export { parseLongDivision, parseFraction } from './math-diagrams';
