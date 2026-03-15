/**
 * Math Diagram Parsers
 *
 * Helper functions to parse math expressions and extract diagram data
 */

import type {
  LongDivData,
  FractionData,
  ColumnOpData,
  MathExpression,
  DivStep,
  ColumnOpStep,
} from './types';

// =============================================================================
// Long Division Parser
// =============================================================================

/**
 * Perform long division and extract step data
 */
export function performLongDivision(dividend: number, divisor: number): LongDivData | null {
  if (divisor === 0) return null;

  const dividendStr = String(Math.abs(dividend));
  const divisorStr = String(Math.abs(divisor));
  const steps: DivStep[] = [];
  const qDigits: string[] = [];
  let current = 0;
  let started = false;

  for (let i = 0; i < dividendStr.length; i++) {
    current = current * 10 + parseInt(dividendStr[i], 10);
    if (!started && current < divisor && i < dividendStr.length - 1) continue;
    started = true;

    const qd = Math.floor(current / divisor);
    const product = qd * divisor;
    const rem = current - product;
    qDigits.push(String(qd));
    steps.push({ carry: current, quotientDigit: qd, product, remainder: rem, posEnd: i });
    current = rem;
  }

  return {
    dividend: Math.abs(dividend),
    divisor: Math.abs(divisor),
    dividendStr,
    divisorStr,
    quotientStr: qDigits.join('') || '0',
    steps,
    remainder: current,
  };
}

/**
 * Detect long division pattern in text
 * Formats: "144 ÷ 12", "144 / 12", "divide 144 by 12"
 */
export function parseLongDivision(text: string): LongDivData | null {
  // Try Unicode division sign first
  const divMatch = text.match(/(\d+)\s*÷\s*(\d+)/);
  if (divMatch) {
    const [, dividend, divisor] = divMatch;
    return performLongDivision(parseInt(dividend, 10), parseInt(divisor, 10));
  }

  // Try slash notation with context
  const slashMatch = text.match(/(?:divide|division|calculate)\s+(\d+)\s*\/\s*(\d+)/i);
  if (slashMatch) {
    const [, dividend, divisor] = slashMatch;
    return performLongDivision(parseInt(dividend, 10), parseInt(divisor, 10));
  }

  // Try "divide X by Y" pattern
  const byMatch = text.match(/divide\s+(\d+)\s+by\s+(\d+)/i);
  if (byMatch) {
    const [, dividend, divisor] = byMatch;
    return performLongDivision(parseInt(dividend, 10), parseInt(divisor, 10));
  }

  return null;
}

// =============================================================================
// Fraction Parser
// =============================================================================

/**
 * Parse fraction from text
 * Formats: "3/4", "¾", "three quarters"
 */
export function parseFraction(text: string): FractionData | null {
  // Standard fraction notation
  const fracMatch = text.match(/(\d+)\s*\/\s*(\d+)/);
  if (fracMatch) {
    const [, num, denom] = fracMatch;
    return {
      numerator: parseInt(num, 10),
      denominator: parseInt(denom, 10),
      visualBlocks: parseInt(denom, 10),
    };
  }

  // Unicode fractions
  const unicodeFractions: Record<string, FractionData> = {
    '½': { numerator: 1, denominator: 2, visualBlocks: 2 },
    '⅓': { numerator: 1, denominator: 3, visualBlocks: 3 },
    '⅔': { numerator: 2, denominator: 3, visualBlocks: 3 },
    '¼': { numerator: 1, denominator: 4, visualBlocks: 4 },
    '¾': { numerator: 3, denominator: 4, visualBlocks: 4 },
    '⅕': { numerator: 1, denominator: 5, visualBlocks: 5 },
    '⅖': { numerator: 2, denominator: 5, visualBlocks: 5 },
    '⅗': { numerator: 3, denominator: 5, visualBlocks: 5 },
    '⅘': { numerator: 4, denominator: 5, visualBlocks: 5 },
    '⅙': { numerator: 1, denominator: 6, visualBlocks: 6 },
    '⅚': { numerator: 5, denominator: 6, visualBlocks: 6 },
    '⅐': { numerator: 1, denominator: 7, visualBlocks: 7 },
    '⅛': { numerator: 1, denominator: 8, visualBlocks: 8 },
    '⅜': { numerator: 3, denominator: 8, visualBlocks: 8 },
    '⅝': { numerator: 5, denominator: 8, visualBlocks: 8 },
    '⅞': { numerator: 7, denominator: 8, visualBlocks: 8 },
    '⅑': { numerator: 1, denominator: 9, visualBlocks: 9 },
    '⅒': { numerator: 1, denominator: 10, visualBlocks: 10 },
  };

  for (const [char, data] of Object.entries(unicodeFractions)) {
    if (text.includes(char)) {
      return data;
    }
  }

  return null;
}

// =============================================================================
// Column Operations Parser
// =============================================================================

/**
 * Parse column addition
 */
export function parseColumnAddition(text: string): ColumnOpData | null {
  const addMatch = text.match(/(\d+)\s*\+\s*(\d+)/);
  if (!addMatch) return null;

  const num1 = parseInt(addMatch[1], 10);
  const num2 = parseInt(addMatch[2], 10);
  const result = num1 + num2;

  const str1 = String(num1);
  const str2 = String(num2);
  const maxLen = Math.max(str1.length, str2.length);

  const steps: ColumnOpStep[] = [];
  let carry = 0;

  for (let i = 0; i < maxLen; i++) {
    const d1 = parseInt(str1[str1.length - 1 - i] || '0', 10);
    const d2 = parseInt(str2[str2.length - 1 - i] || '0', 10);
    const sum = d1 + d2 + carry;
    const digitResult = sum % 10;
    carry = Math.floor(sum / 10);

    steps.unshift({
      digit1: d1,
      digit2: d2,
      result: digitResult,
      carry,
      position: maxLen - 1 - i,
    });
  }

  return { num1, num2, result, operation: 'add', steps };
}

/**
 * Parse column subtraction
 */
export function parseColumnSubtraction(text: string): ColumnOpData | null {
  const subMatch = text.match(/(\d+)\s*-\s*(\d+)/);
  if (!subMatch) return null;

  const num1 = parseInt(subMatch[1], 10);
  const num2 = parseInt(subMatch[2], 10);
  const result = num1 - num2;

  const str1 = String(num1);
  const str2 = String(num2);
  const maxLen = Math.max(str1.length, str2.length);

  const steps: ColumnOpStep[] = [];
  let borrow = 0;

  for (let i = 0; i < maxLen; i++) {
    let d1 = parseInt(str1[str1.length - 1 - i] || '0', 10);
    const d2 = parseInt(str2[str2.length - 1 - i] || '0', 10);
    d1 -= borrow;
    borrow = 0;

    if (d1 < d2) {
      d1 += 10;
      borrow = 1;
    }

    const digitResult = d1 - d2;
    steps.unshift({
      digit1: d1 + borrow * 10,
      digit2: d2,
      result: digitResult,
      carry: borrow,
      position: maxLen - 1 - i,
    });
  }

  return { num1, num2, result, operation: 'subtract', steps };
}

// =============================================================================
// Main Expression Parser
// =============================================================================

/**
 * Parse any math expression from text
 */
export function parseMathExpression(text: string): MathExpression | null {
  // Try division first
  const division = parseLongDivision(text);
  if (division) {
    return { type: 'division', raw: text, parsed: division };
  }

  // Try fraction
  const fraction = parseFraction(text);
  if (fraction) {
    return { type: 'fraction', raw: text, parsed: fraction };
  }

  // Try addition
  const addition = parseColumnAddition(text);
  if (addition) {
    return { type: 'addition', raw: text, parsed: addition };
  }

  // Try subtraction
  const subtraction = parseColumnSubtraction(text);
  if (subtraction) {
    return { type: 'subtraction', raw: text, parsed: subtraction };
  }

  return null;
}

/**
 * Extract all math expressions from text
 */
export function extractMathExpressions(text: string): MathExpression[] {
  const expressions: MathExpression[] = [];
  const sentences = text.split(/[.!?]+/);

  for (const sentence of sentences) {
    const expr = parseMathExpression(sentence);
    if (expr) {
      expressions.push(expr);
    }
  }

  return expressions;
}
