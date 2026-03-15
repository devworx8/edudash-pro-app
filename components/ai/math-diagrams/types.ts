/**
 * Math Diagram Types
 *
 * Shared types and interfaces for math diagram components
 */

// =============================================================================
// Long Division Types
// =============================================================================

export interface DivStep {
  carry: number;
  quotientDigit: number;
  product: number;
  remainder: number;
  posEnd: number;
}

export interface LongDivData {
  dividend: number;
  divisor: number;
  dividendStr: string;
  divisorStr: string;
  quotientStr: string;
  steps: DivStep[];
  remainder: number;
}

// =============================================================================
// Fraction Types
// =============================================================================

export interface FractionData {
  numerator: number;
  denominator: number;
  visualBlocks?: number; // Number of blocks to show for visual representation
}

// =============================================================================
// Column Operation Types
// =============================================================================

export interface ColumnOpStep {
  digit1: number;
  digit2: number;
  result: number;
  carry: number;
  position: number;
}

export interface ColumnOpData {
  num1: number;
  num2: number;
  result: number;
  operation: 'add' | 'subtract' | 'multiply';
  steps: ColumnOpStep[];
}

// =============================================================================
// Expression Detection Types
// =============================================================================

export interface MathExpression {
  type: 'division' | 'fraction' | 'addition' | 'subtraction' | 'multiplication' | 'equation';
  raw: string;
  parsed: LongDivData | FractionData | ColumnOpData | null;
}

// =============================================================================
// Diagram Component Props
// =============================================================================

export interface BaseDiagramProps {
  revealed?: number;
  onStepComplete?: (step: number) => void;
  onTTSRead?: (text: string) => void;
}

export interface LongDivisionDiagramProps extends BaseDiagramProps {
  data: LongDivData;
}

export interface FractionDiagramProps extends BaseDiagramProps {
  data: FractionData;
}

export interface ColumnOpDiagramProps extends BaseDiagramProps {
  data: ColumnOpData;
}
