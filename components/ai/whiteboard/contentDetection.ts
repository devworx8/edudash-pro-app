/**
 * Whiteboard Content Detection Utilities
 */

import type { LongDivData, FractionData } from '../math-diagrams/types';
import { parseLongDivision, parseFraction } from '../math-diagrams/parsers';

// =============================================================================
// Types
// =============================================================================

export type DiagramType = 'long-division' | 'fraction' | 'column-addition' | 'none';

export interface DetectedDiagram {
  type: DiagramType;
  data: LongDivData | FractionData | null;
  startIndex: number;
}

// =============================================================================
// Line Classification
// =============================================================================

export type LineKind = 'heading' | 'equation' | 'step' | 'result' | 'explanation' | 'plain';

/**
 * Classify a line of text for whiteboard display
 */
export function classifyLine(line: string): LineKind {
  if (/^#+\s/.test(line) || /^[A-Z\s\d:]{6,}$/.test(line)) return 'heading';
  if (/[=÷×+\-±√∑∫∞→]/.test(line) || /\d+\s*[÷×+\-]\s*\d+/.test(line)) return 'equation';
  if (/^\d+[.)]\s|^Step\s*\d|^[\u2022\u00b7\u25b6]\s/.test(line)) return 'step';
  if (/^(Answer|Result|So|Therefore|\u2234)\b/i.test(line)) return 'result';
  if (/^(-|\u2022|\u00b7)\s/.test(line) || line.length > 40) return 'explanation';
  return 'plain';
}

// =============================================================================
// Diagram Detection
// =============================================================================

/**
 * Detect diagram type from text lines
 */
export function detectDiagramType(lines: string[]): DetectedDiagram | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for long division
    const divData = parseLongDivision(line);
    if (divData) {
      return { type: 'long-division', data: divData, startIndex: i };
    }

    // Check for fraction
    const fracData = parseFraction(line);
    if (fracData) {
      return { type: 'fraction', data: fracData, startIndex: i };
    }
  }
  return null;
}

/**
 * Check if content contains a diagram
 */
export function hasDiagramContent(lines: string[]): boolean {
  return detectDiagramType(lines) !== null;
}
