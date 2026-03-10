/**
 * DashTutorWhiteboard — Chalkboard with live diagram rendering
 *
 * When Dash wraps content in [WHITEBOARD]...[/WHITEBOARD]:
 *  - Detects the diagram type (long division, fraction, column addition, etc.)
 *  - Renders an actual SVG diagram as a teacher would draw it on a board
 *  - Reveals each step as the student taps "Next"
 *  - Falls back to chalk text lines when no diagram is detected
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  FadeIn,
  FadeInDown,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Svg, {
  Line,
  Rect,
  Text as SvgText,
  G,
} from 'react-native-svg';
import { clampPercent } from '@/lib/progress/clampPercent';
import MathRenderer from '../ai/dash-assistant/MathRenderer';
import { stripContentForTTS } from './DashBoardContent';

// ─── Regex helpers ────────────────────────────────────────────────────────────
function whiteboardRegex(): RegExp {
  return /\[WHITEBOARD\]([\s\S]*?)\[\/WHITEBOARD\]/gi;
}
function orphanTagRegex(): RegExp {
  return /\[\/?\s*WHITEBOARD\s*\]/gi;
}

export interface WhiteboardContent {
  raw: string;
  lines: string[];
}

export function extractWhiteboardContent(response: string): WhiteboardContent | null {
  const match = whiteboardRegex().exec(response);
  if (!match?.[1]) return null;
  const raw = match[1].trim();
  if (!raw) return null;
  const lines = raw.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  return { raw, lines };
}

export function stripWhiteboardFromDisplay(text: string): string {
  return text
    .replace(whiteboardRegex(), '')
    .replace(orphanTagRegex(), '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Get TTS-friendly content from whiteboard content
 * This ensures Dash reads from the Dash Board content, not captions
 */
export function getWhiteboardTTSContent(content: WhiteboardContent): string {
  // Strip markdown and math delimiters for natural TTS reading
  const cleanLines = content.lines.map(line => stripContentForTTS(line));
  return cleanLines.join(' ').trim();
}

// ─── Design palette ───────────────────────────────────────────────────────────
const C = {
  // Text / chalk
  white:  '#f1f5f9',
  yellow: '#fde68a',
  cyan:   '#67e8f9',
  green:  '#86efac',
  pink:   '#f9a8d4',
  dim:    'rgba(241,245,249,0.4)',
  board:  'transparent',
  // UI chrome — indigo/violet theme
  indigo:   '#6366f1',
  violet:   '#8b5cf6',
  indigoD:  '#4f46e5',
  indigoGl: 'rgba(99,102,241,0.15)',
  border:   'rgba(99,102,241,0.4)',
};

// ─── Long Division ────────────────────────────────────────────────────────────
interface DivStep {
  carry:        number;  // working number at this step
  quotientDigit:number;
  product:      number;  // quotientDigit × divisor
  remainder:    number;
  posEnd:       number;  // rightmost dividend column this step covers
}

interface LongDivData {
  dividend:    number;
  divisor:     number;
  dividendStr: string;
  divisorStr:  string;
  quotientStr: string;
  steps:       DivStep[];
}

function performLongDivision(dividend: number, divisor: number): LongDivData {
  const dividendStr = String(dividend);
  const divisorStr  = String(divisor);
  const steps: DivStep[] = [];
  const qDigits: string[] = [];
  let current = 0;
  let started = false;

  for (let i = 0; i < dividendStr.length; i++) {
    current = current * 10 + parseInt(dividendStr[i], 10);
    if (!started && current < divisor && i < dividendStr.length - 1) continue;
    started = true;

    const qd      = Math.floor(current / divisor);
    const product  = qd * divisor;
    const rem      = current - product;
    qDigits.push(String(qd));
    steps.push({ carry: current, quotientDigit: qd, product, remainder: rem, posEnd: i });
    current = rem;
  }

  return {
    dividend, divisor, dividendStr, divisorStr,
    quotientStr: qDigits.join('') || '0',
    steps,
  };
}

function parseLongDivision(lines: string[]): LongDivData | null {
  const re = /(\d+)\s*[÷\/]\s*(\d+)/;
  for (const l of lines) {
    const m = re.exec(l);
    if (m) {
      const dividend = parseInt(m[1], 10);
      const divisor  = parseInt(m[2], 10);
      if (divisor === 0) return null;
      return performLongDivision(dividend, divisor);
    }
  }
  return null;
}

// ─── Long Division SVG Diagram ────────────────────────────────────────────────
const CELL    = 30;   // px per digit column
const ROW_H   = 44;   // px per row
const FS      = 20;   // font size
const MONO    = Platform.OS === 'ios' ? 'Courier New' : 'monospace';

function LongDivisionDiagram({
  data,
  revealed,
}: {
  data:     LongDivData;
  revealed: number; // 0 = problem only; 1..N = each step revealed
}) {
  const { dividendStr, divisorStr, steps } = data;
  const dvnLen  = dividendStr.length;
  const divLen  = divisorStr.length;

  // Layout constants
  const GUTTER     = 14;
  const DIV_AREA_W = divLen * CELL + 32;   // space for divisor digits + bracket gap
  const DVN_W      = dvnLen * CELL;
  const SVG_W      = GUTTER * 2 + DIV_AREA_W + DVN_W;

  // Total rows: quotient(1) + dividend(1) + per step: product(1) + remainder/carry(1)
  const totalRows = 2 + steps.length * 2;
  const SVG_H     = totalRows * ROW_H + 12;

  // x center of dividend column `col`
  const cx = (col: number) => GUTTER + DIV_AREA_W + col * CELL + CELL / 2;
  // y center of row `row`
  const ry = (row: number) => row * ROW_H + ROW_H / 2 + 6;

  const vincX  = GUTTER + DIV_AREA_W - 6;
  const vincX2 = GUTTER + DIV_AREA_W + DVN_W + 6;
  const vincY  = ROW_H;   // top of vinculum = bottom of quotient row

  return (
    <Svg width={SVG_W} height={SVG_H}>

      {/* Divisor */}
      <SvgText
        x={GUTTER + DIV_AREA_W - 28}
        y={ry(1)}
        textAnchor="end"
        fill={C.white} fontSize={FS} fontFamily={MONO}
      >
        {divisorStr}
      </SvgText>

      {/* Division bracket ⌐ — vinculum (top) + vertical arm */}
      <Line x1={vincX} y1={vincY} x2={vincX2} y2={vincY}
            stroke={C.white} strokeWidth={2} />
      <Line x1={vincX} y1={vincY} x2={vincX} y2={vincY + ROW_H + 6}
            stroke={C.white} strokeWidth={2} />

      {/* Dividend digits */}
      {dividendStr.split('').map((d, i) => (
        <SvgText key={`dvn${i}`}
          x={cx(i)} y={ry(1)}
          textAnchor="middle"
          fill={C.white} fontSize={FS} fontFamily={MONO}
        >{d}</SvgText>
      ))}

      {/* Steps — revealed one at a time */}
      {steps.map((step, si) => {
        if (si >= revealed) return null;

        const prodStr = String(step.product);
        const prodLen = prodStr.length;
        const prodStart = step.posEnd - prodLen + 1;
        const stepRow   = 2 + si * 2;
        const remRow    = stepRow + 1;
        const isLast    = si === steps.length - 1;

        // Rule line under subtraction
        const ruleX1 = cx(prodStart) - CELL / 2 - 4;
        const ruleX2 = cx(step.posEnd)  + CELL / 2 + 4;
        const ruleY  = stepRow * ROW_H + ROW_H - 4;

        // Carry / bring-down string for non-last steps
        const carryStr = isLast ? String(step.remainder) : String(steps[si + 1]?.carry ?? '');
        const carryLen = carryStr.length;
        // The carry sits ending at column posEnd+1 (i.e. one further right than current posEnd)
        const carryEndCol = isLast ? step.posEnd : step.posEnd + 1;
        const carryStart  = carryEndCol - carryLen + 1;

        return (
          <G key={`step${si}`}>
            {/* Minus sign */}
            <SvgText
              x={cx(prodStart) - CELL * 0.75}
              y={ry(stepRow)}
              textAnchor="middle"
              fill={C.cyan} fontSize={FS} fontFamily={MONO}
            >−</SvgText>

            {/* Product digits */}
            {prodStr.split('').map((d, di) => (
              <SvgText key={`prod${si}${di}`}
                x={cx(prodStart + di)} y={ry(stepRow)}
                textAnchor="middle"
                fill={C.cyan} fontSize={FS} fontFamily={MONO}
              >{d}</SvgText>
            ))}

            {/* Rule */}
            <Line x1={ruleX1} y1={ruleY} x2={ruleX2} y2={ruleY}
                  stroke={C.white} strokeWidth={1.5} />

            {/* Remainder / carry */}
            {carryStr.split('').map((d, di) => (
              <SvgText key={`carry${si}${di}`}
                x={cx(carryStart + di)} y={ry(remRow)}
                textAnchor="middle"
                fill={isLast ? (step.remainder === 0 ? C.green : C.pink) : C.white}
                fontSize={FS} fontFamily={MONO}
              >{d}</SvgText>
            ))}

            {/* Quotient digit — appears above the vinculum over column posEnd */}
            <SvgText
              x={cx(step.posEnd)} y={ry(0)}
              textAnchor="middle"
              fill={C.yellow} fontSize={FS} fontFamily={MONO}
              fontWeight="bold"
            >{step.quotientDigit}</SvgText>
          </G>
        );
      })}

      {/* Answer label — only when all steps revealed */}
      {revealed >= steps.length && (
        <SvgText
          x={vincX2 + 8} y={ry(0)}
          textAnchor="start"
          fill={C.green} fontSize={14} fontFamily={MONO}
        >✓</SvgText>
      )}
    </Svg>
  );
}

// ─── Lattice Multiplication ───────────────────────────────────────────────────
interface LatticeData {
  multiplicand: number;
  multiplier: number;
  product: number;
  multiplicandStr: string;
  multiplierStr: string;
  numCols: number;
  numRows: number;
  cells: Array<Array<{ tens: number; units: number }>>;
  diagDigits: number[];
}

function performLattice(multiplicand: number, multiplier: number): LatticeData {
  const multiplicandStr = String(multiplicand);
  const multiplierStr   = String(multiplier);
  const numCols = multiplicandStr.length;
  const numRows = multiplierStr.length;
  const cells: Array<Array<{ tens: number; units: number }>> = [];
  for (let r = 0; r < numRows; r++) {
    const row: Array<{ tens: number; units: number }> = [];
    for (let c = 0; c < numCols; c++) {
      const prod = parseInt(multiplicandStr[c], 10) * parseInt(multiplierStr[r], 10);
      row.push({ tens: Math.floor(prod / 10), units: prod % 10 });
    }
    cells.push(row);
  }
  // Raw diagonal sums — d=0 is bottom-right
  const rawDiags: number[] = Array(numCols + numRows).fill(0);
  for (let r = 0; r < numRows; r++) {
    for (let c = 0; c < numCols; c++) {
      const d = (numCols - 1 - c) + (numRows - 1 - r);
      rawDiags[d]     += cells[r][c].units;
      rawDiags[d + 1] += cells[r][c].tens;
    }
  }
  // Carry
  for (let d = 0; d < rawDiags.length - 1; d++) {
    rawDiags[d + 1] += Math.floor(rawDiags[d] / 10);
    rawDiags[d]      = rawDiags[d] % 10;
  }
  return { multiplicand, multiplier, product: multiplicand * multiplier,
    multiplicandStr, multiplierStr, numCols, numRows, cells, diagDigits: rawDiags };
}

// Any character that can represent multiplication in AI output
const MUL_RE = /(\d+)\s*(?:[×✕⨉\u00D7xX*·\u22C5]|\bby\b|\btimes\b)\s*(\d+)/i;

// Context clues that identify lattice multiplication content even without the word "lattice"
const LATTICE_CONTEXT_RE = /lattice|grid\s*method|diagonal.*cell|cell.*diagonal|ones\s*place|top.left.*cell|bottom.right.*cell|reads.*outside|outside.*grid|write.*above.*below|above.*below.*diagonal/i;

function parseLatticeMultiplication(lines: string[]): LatticeData | null {
  const joined = lines.join(' ');
  if (!LATTICE_CONTEXT_RE.test(joined)) return null;

  // Collect all candidate multiplication pairs, preferring the largest numbers
  // (the main problem, not the sub-product descriptions like "3 × 5 = 15")
  const candidates: Array<{ a: number; b: number }> = [];
  for (const l of lines) {
    let m: RegExpExecArray | null;
    const re = new RegExp(MUL_RE.source, MUL_RE.flags);
    while ((m = re.exec(l)) !== null) {
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      if (a && b && a <= 9999 && b <= 9999 && a > 9 && b > 9) {
        candidates.push({ a, b });
      }
    }
  }

  // Prefer the pair where both numbers are multi-digit (the original problem)
  if (candidates.length > 0) {
    // Sort by digit count descending to prefer the main problem over sub-products
    candidates.sort((x, y) => (String(y.a).length + String(y.b).length) - (String(x.a).length + String(x.b).length));
    return performLattice(candidates[0].a, candidates[0].b);
  }

  // Fallback: any multiplication pair (including single-digit × single-digit)
  const fm = MUL_RE.exec(joined);
  if (fm) {
    const a = parseInt(fm[1], 10);
    const b = parseInt(fm[2], 10);
    if (a && b && a <= 9999 && b <= 9999) return performLattice(a, b);
  }
  return null;
}

const LAT_CELL    = 54;
const LAT_TOP     = 40;
const LAT_RIGHT   = 44;
const LAT_LEFT_X  = 42;  // space for left-side diagonal labels
const LAT_GUTTER  = 10;
const LAT_BOT     = 90;  // space for diagonal sums + answer

function LatticeDiagram({ data, revealed }: { data: LatticeData; revealed: number }) {
  const { multiplicandStr, multiplierStr, numCols, numRows, cells, diagDigits } = data;
  const totalCells = numCols * numRows;
  const showDiags  = revealed > totalCells;
  const showAnswer = revealed > totalCells + 1;

  const gx = LAT_GUTTER + LAT_LEFT_X;
  const gy = LAT_TOP;
  const gw = numCols * LAT_CELL;
  const gh = numRows * LAT_CELL;
  const svgW = gx + gw + LAT_RIGHT;
  const svgH = gy + gh + LAT_BOT;

  return (
    <Svg width={svgW} height={svgH}>
      {/* Grid outline */}
      <Rect x={gx} y={gy} width={gw} height={gh}
        fill="none" stroke={C.white} strokeWidth={1.5} rx={2} />

      {/* Interior grid lines */}
      {Array.from({ length: numCols - 1 }, (_, i) => i + 1).map(c => (
        <Line key={`vl${c}`} x1={gx + c * LAT_CELL} y1={gy}
          x2={gx + c * LAT_CELL} y2={gy + gh} stroke={C.white} strokeWidth={1} opacity={0.4} />
      ))}
      {Array.from({ length: numRows - 1 }, (_, i) => i + 1).map(r => (
        <Line key={`hl${r}`} x1={gx} y1={gy + r * LAT_CELL}
          x2={gx + gw} y2={gy + r * LAT_CELL} stroke={C.white} strokeWidth={1} opacity={0.4} />
      ))}

      {/* Cells — diagonal + digits */}
      {cells.map((row, r) => row.map((cell, c) => {
        const cx = gx + c * LAT_CELL;
        const cy = gy + r * LAT_CELL;
        const cellVisible = revealed >= r * numCols + c + 1;
        return (
          <G key={`cell-${r}-${c}`}>
            {/* Diagonal line top-right → bottom-left */}
            <Line x1={cx + LAT_CELL} y1={cy} x2={cx} y2={cy + LAT_CELL}
              stroke={C.dim} strokeWidth={1} />
            {/* Tens (upper-left triangle) */}
            {cellVisible && (
              <SvgText x={cx + LAT_CELL * 0.28} y={cy + LAT_CELL * 0.44}
                textAnchor="middle" fill={C.cyan} fontSize={17} fontFamily={MONO}>
                {cell.tens}
              </SvgText>
            )}
            {/* Units (lower-right triangle) */}
            {cellVisible && (
              <SvgText x={cx + LAT_CELL * 0.72} y={cy + LAT_CELL * 0.82}
                textAnchor="middle" fill={C.white} fontSize={17} fontFamily={MONO}>
                {cell.units}
              </SvgText>
            )}
          </G>
        );
      }))}

      {/* Multiplicand digits — top */}
      {multiplicandStr.split('').map((d, c) => (
        <SvgText key={`col${c}`}
          x={gx + c * LAT_CELL + LAT_CELL / 2} y={gy - 14}
          textAnchor="middle" fill={C.yellow} fontSize={20} fontFamily={MONO} fontWeight="bold">
          {d}
        </SvgText>
      ))}

      {/* Multiplier digits — right */}
      {multiplierStr.split('').map((d, r) => (
        <SvgText key={`row${r}`}
          x={gx + gw + 22} y={gy + r * LAT_CELL + LAT_CELL / 2 + 7}
          textAnchor="middle" fill={C.yellow} fontSize={20} fontFamily={MONO} fontWeight="bold">
          {d}
        </SvgText>
      ))}

      {/* Diagonal separator lines extending into the left + bottom areas */}
      {Array.from({ length: numCols + 1 }, (_, c) => {
        const x1 = gx + c * LAT_CELL;
        const ext = Math.min(c * LAT_CELL, gx - LAT_GUTTER);
        if (ext <= 0) return null;
        return <Line key={`bsep${c}`} x1={x1} y1={gy + gh}
          x2={x1 - ext} y2={gy + gh + ext} stroke={C.dim} strokeWidth={1} opacity={0.6} />;
      })}
      {Array.from({ length: numRows + 1 }, (_, r) => {
        const y1 = gy + r * LAT_CELL;
        const ext = Math.min((numRows - r) * LAT_CELL, gx - LAT_GUTTER);
        if (ext <= 0) return null;
        return <Line key={`lsep${r}`} x1={gx} y1={y1}
          x2={gx - ext} y2={y1 + ext} stroke={C.dim} strokeWidth={1} opacity={0.6} />;
      })}

      {/* Diagonal sums — bottom (d=0..numCols-1) */}
      {showDiags && diagDigits.slice(0, numCols).map((digit, d) => (
        <SvgText key={`bd${d}`}
          x={gx + (numCols - 1 - d) * LAT_CELL + LAT_CELL / 2}
          y={gy + gh + 30}
          textAnchor="middle"
          fill={C.green} fontSize={20} fontFamily={MONO} fontWeight="bold">
          {digit}
        </SvgText>
      ))}

      {/* Diagonal sums — left side (d=numCols..numCols+numRows-1) */}
      {showDiags && diagDigits.slice(numCols, numCols + numRows).map((digit, i) => {
        const r = numRows - 1 - i;
        return (
          <SvgText key={`ld${i}`}
            x={LAT_GUTTER + LAT_LEFT_X / 2}
            y={gy + r * LAT_CELL + LAT_CELL / 2 + 7}
            textAnchor="middle"
            fill={C.green} fontSize={20} fontFamily={MONO} fontWeight="bold">
            {digit}
          </SvgText>
        );
      })}

      {/* Final answer */}
      {showAnswer && (
        <SvgText
          x={svgW / 2} y={gy + gh + 64}
          textAnchor="middle"
          fill={C.green} fontSize={15} fontFamily={MONO} fontWeight="bold">
          {data.multiplicand} × {data.multiplier} = {data.product}  ✓
        </SvgText>
      )}
    </Svg>
  );
}

// ─── Number Line ─────────────────────────────────────────────────────────────
interface NumberLineData { start: number; end: number; step: number; }

const NUMBER_LINE_RE = /number\s*line/i;
function parseNumberLine(lines: string[]): NumberLineData | null {
  const joined = lines.join(' ');
  if (!NUMBER_LINE_RE.test(joined)) return null;
  const m = /\b(\d+)\s+to\s+(\d+)\b/i.exec(joined);
  if (m) {
    const start = parseInt(m[1], 10);
    const end   = parseInt(m[2], 10);
    if (end > start && end - start <= 30) {
      const range = end - start;
      return { start, end, step: range <= 10 ? 1 : range <= 20 ? 2 : 5 };
    }
  }
  return { start: 0, end: 10, step: 1 };
}

const NL_TICK   = 28;
const NL_PAD    = 32;
const NL_LINE_Y = 44;

function NumberLineDiagram({ data, revealed }: { data: NumberLineData; revealed: number }) {
  const { start, end, step } = data;
  const MONO  = Platform.OS === 'ios' ? 'Courier New' : 'monospace';
  const range = end - start;
  const svgW  = range * NL_TICK + NL_PAD * 2;
  const svgH  = 76;
  const px = (n: number) => NL_PAD + (n - start) * NL_TICK;

  return (
    <Svg width={svgW} height={svgH}>
      {/* Axis */}
      <Line x1={NL_PAD - 12} y1={NL_LINE_Y} x2={svgW - NL_PAD + 12} y2={NL_LINE_Y}
        stroke={C.white} strokeWidth={2} />
      {/* Left arrowhead */}
      <Line x1={NL_PAD - 12} y1={NL_LINE_Y} x2={NL_PAD - 5} y2={NL_LINE_Y - 5}
        stroke={C.white} strokeWidth={1.5} />
      <Line x1={NL_PAD - 12} y1={NL_LINE_Y} x2={NL_PAD - 5} y2={NL_LINE_Y + 5}
        stroke={C.white} strokeWidth={1.5} />
      {/* Right arrowhead */}
      <Line x1={svgW - NL_PAD + 12} y1={NL_LINE_Y} x2={svgW - NL_PAD + 5} y2={NL_LINE_Y - 5}
        stroke={C.white} strokeWidth={1.5} />
      <Line x1={svgW - NL_PAD + 12} y1={NL_LINE_Y} x2={svgW - NL_PAD + 5} y2={NL_LINE_Y + 5}
        stroke={C.white} strokeWidth={1.5} />
      {/* Ticks — revealed progressively */}
      {Array.from({ length: range + 1 }, (_, i) => {
        if (i > revealed) return null;
        const n = start + i;
        const isMajor = n % step === 0 || n === start || n === end;
        const x = px(n);
        return (
          <G key={`t${n}`}>
            <Line x1={x} y1={NL_LINE_Y - (isMajor ? 10 : 5)}
              x2={x} y2={NL_LINE_Y + (isMajor ? 10 : 5)}
              stroke={isMajor ? C.cyan : C.dim} strokeWidth={isMajor ? 2 : 1} />
            {isMajor && (
              <SvgText x={x} y={NL_LINE_Y + 26} textAnchor="middle"
                fill={C.white} fontSize={13} fontFamily={MONO}>{n}</SvgText>
            )}
          </G>
        );
      })}
    </Svg>
  );
}

// ─── Fraction Bar ─────────────────────────────────────────────────────────────
interface FractionBarData { numerator: number; denominator: number; }

const FRACTION_CONTEXT_RE = /\bfraction|numerator|denominator|one[\s-]half|one[\s-]quarter|one[\s-]third\b/i;
function parseFractionBar(lines: string[]): FractionBarData | null {
  const joined = lines.join(' ');
  if (!FRACTION_CONTEXT_RE.test(joined)) return null;
  const re = /\b([1-9]\d*)\s*\/\s*([1-9]\d*)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(joined)) !== null) {
    const num = parseInt(m[1], 10);
    const den = parseInt(m[2], 10);
    if (den > 1 && den <= 12 && num < den) return { numerator: num, denominator: den };
  }
  if (/one[\s-]half|½/i.test(joined))    return { numerator: 1, denominator: 2 };
  if (/one[\s-]quarter|¼/i.test(joined)) return { numerator: 1, denominator: 4 };
  if (/one[\s-]third|⅓/i.test(joined))   return { numerator: 1, denominator: 3 };
  return null;
}

const FB_W = 260, FB_H = 40, FB_PX = 18, FB_PY = 16;
function FractionBarDiagram({ data, revealed }: { data: FractionBarData; revealed: number }) {
  const { numerator, denominator } = data;
  const MONO   = Platform.OS === 'ios' ? 'Courier New' : 'monospace';
  const cellW  = FB_W / denominator;
  const svgW   = FB_W + FB_PX * 2;
  const svgH   = FB_H + FB_PY + 42;
  const shaded = Math.min(numerator, revealed);

  return (
    <Svg width={svgW} height={svgH}>
      {/* Shaded (filled) cells */}
      {Array.from({ length: shaded }, (_, i) => (
        <Rect key={`sh${i}`}
          x={FB_PX + i * cellW} y={FB_PY} width={cellW} height={FB_H}
          fill="rgba(99,102,241,0.5)" />
      ))}
      {/* Bar outline */}
      <Rect x={FB_PX} y={FB_PY} width={FB_W} height={FB_H}
        fill="none" stroke={C.white} strokeWidth={1.5} rx={4} />
      {/* Cell dividers */}
      {Array.from({ length: denominator - 1 }, (_, i) => (
        <Line key={`dv${i}`}
          x1={FB_PX + (i + 1) * cellW} y1={FB_PY}
          x2={FB_PX + (i + 1) * cellW} y2={FB_PY + FB_H}
          stroke={C.white} strokeWidth={1} opacity={0.45} />
      ))}
      {/* Fraction label */}
      <SvgText x={svgW / 2} y={FB_PY + FB_H + 28}
        textAnchor="middle"
        fill={C.cyan} fontSize={18} fontFamily={MONO} fontWeight="bold">
        {shaded}/{denominator}
      </SvgText>
    </Svg>
  );
}

// ─── Markdown stripper ────────────────────────────────────────────────────────
function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/, '')           // ## headings
    .replace(/\*\*(.+?)\*\*/g, '$1')     // **bold**
    .replace(/\*(.+?)\*/g, '$1')         // *italic*
    .replace(/__(.+?)__/g, '$1')         // __bold__
    .replace(/_([^_]+)_/g, '$1')         // _italic_
    .replace(/`([^`]+)`/g, '$1');        // `code`
}

// ─── Math segment parser ──────────────────────────────────────────────────────
type ChalkSegment = { type: 'text' | 'inlineMath'; content: string };

function splitInlineMath(text: string): ChalkSegment[] {
  const segments: ChalkSegment[] = [];
  const re = /\$([^$\n]+?)\$/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > cursor) segments.push({ type: 'text', content: text.slice(cursor, match.index) });
    segments.push({ type: 'inlineMath', content: match[1] });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) segments.push({ type: 'text', content: text.slice(cursor) });
  return segments;
}

// ─── Line classifier (for text fallback) ─────────────────────────────────────
type LineKind = 'heading' | 'equation' | 'step' | 'result' | 'plain';

function classifyLine(line: string): LineKind {
  if (/^#+\s/.test(line) || /^[A-Z\s\d:]{6,}$/.test(line)) return 'heading';
  if (/[=÷×+\-±√∑∫∞→]/.test(line) || /\d+\s*[÷×+\-]\s*\d+/.test(line)) return 'equation';
  if (/^\d+[.)]\s|^Step\s*\d|^[•·▶]\s/.test(line)) return 'step';
  if (/^(Answer|Result|So|Therefore|∴)\b/i.test(line)) return 'result';
  return 'plain';
}

const KIND_COLORS: Record<LineKind, string> = {
  heading:  C.yellow,
  equation: C.cyan,
  step:     C.green,
  result:   C.pink,
  plain:    C.white,
};
const KIND_SIZES: Record<LineKind, number> = {
  heading: 19, equation: 21, step: 16, result: 18, plain: 15,
};

function ChalkLine({ line, index }: { line: string; index: number }) {
  const kind  = classifyLine(line);
  const color = KIND_COLORS[kind];
  const size  = KIND_SIZES[kind];

  const wipe    = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const delay = index * 260;
    opacity.value = withDelay(delay, withTiming(1, { duration: 100 }));
    wipe.value    = withDelay(delay, withTiming(1, {
      duration: Math.max(280, line.length * 16),
      easing: Easing.out(Easing.quad),
    }));
  }, []);

  const anim = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scaleX: wipe.value }],
  }));

  const stepNum = kind === 'step'
    ? (line.match(/^(\d+)[.)]/) || line.match(/Step\s*(\d+)/i) || [])[1]
    : null;

  const rawDisplay = kind === 'step'
    ? line.replace(/^[•·▶]\s|^\d+[.)]\s/, '').replace(/^Step\s*\d+:?\s*/i, '')
    : line;
  const display = stripMarkdown(rawDisplay);

  const chalkTextStyle = [styles.chalkText, {
    color, fontSize: size,
    fontFamily: Platform.OS === 'ios' ? 'Chalkboard SE' : MONO,
    fontWeight: (kind === 'heading' || kind === 'result') ? '700' : '400',
    textShadowColor: color + '44',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  } as const, kind === 'heading' && { letterSpacing: 1, textTransform: 'uppercase' as const }];

  // ── Display math: entire line is $$...$$
  const displayMathMatch = /^\$\$([\s\S]*?)\$\$$/.exec(display.trim());
  if (displayMathMatch) {
    return (
      <Animated.View style={[styles.lineRow, styles.equationRow, anim]}>
        <MathRenderer expression={displayMathMatch[1].trim()} displayMode={true} />
      </Animated.View>
    );
  }

  // ── Inline math: line contains $...$
  const hasInlineMath = /\$[^$\n]+?\$/.test(display);
  if (hasInlineMath) {
    const segments = splitInlineMath(display);
    return (
      <Animated.View style={[styles.lineRow,
        kind === 'heading' && styles.headingRow,
        kind === 'equation' && styles.equationRow,
        kind === 'result'  && styles.resultRow,
        anim,
      ]}>
        {stepNum ? (
          <View style={[styles.stepBadge, { borderColor: color }]}>
            <Text style={[styles.stepNum, { color }]}>{stepNum}</Text>
          </View>
        ) : null}
        {/* Flex row: Text for plain segments, MathRenderer for math — proper KaTeX */}
        <View style={styles.inlineMathRow}>
          {segments.map((seg, i) =>
            seg.type === 'text' ? (
              <Text key={i} style={chalkTextStyle}>{seg.content}</Text>
            ) : (
              <MathRenderer key={i} expression={seg.content} displayMode={false} />
            )
          )}
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.lineRow,
      kind === 'heading' && styles.headingRow,
      kind === 'equation' && styles.equationRow,
      kind === 'result'  && styles.resultRow,
      anim,
    ]}>
      {stepNum ? (
        <View style={[styles.stepBadge, { borderColor: color }]}>
          <Text style={[styles.stepNum, { color }]}>{stepNum}</Text>
        </View>
      ) : null}
      <Text style={chalkTextStyle}>
        {display}
      </Text>
    </Animated.View>
  );
}

function RulingLines() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: 12 }).map((_, i) => (
        <View key={i} style={{
          position: 'absolute', top: 68 + i * 44, left: 14, right: 14,
          height: 1, backgroundColor: 'rgba(99,102,241,0.07)',
        }} />
      ))}
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export interface DashTutorWhiteboardProps {
  content:      WhiteboardContent;
  onDismiss:    () => void;
  onUnderstood?: () => void;
}

export function DashTutorWhiteboard({ content, onDismiss, onUnderstood }: DashTutorWhiteboardProps) {
  // Detect diagram type — evaluated in priority order
  const latticeData    = parseLatticeMultiplication(content.lines);
  const divData        = latticeData ? null : parseLongDivision(content.lines);
  const numberLineData = (!latticeData && !divData) ? parseNumberLine(content.lines) : null;
  const fractionData   = (!latticeData && !divData && !numberLineData) ? parseFractionBar(content.lines) : null;
  const hasDiagram     = !!latticeData || !!divData || !!numberLineData || !!fractionData;

  // Total reveal steps: one per diagram element
  const diagramSteps = latticeData
    ? latticeData.numCols * latticeData.numRows + 2
    : divData        ? divData.steps.length
    : numberLineData ? (numberLineData.end - numberLineData.start)
    : fractionData   ? (fractionData.numerator + 1)
    : 0;
  const textLines    = content.lines;
  const totalSteps   = hasDiagram
    ? diagramSteps + textLines.length
    : textLines.length;

  const [step, setStep]         = useState(0);
  const [paused, setPaused]     = useState(false);
  const [finished, setFinished] = useState(false);
  const scrollRef               = useRef<ScrollView>(null);

  const AUTOPLAY_MS = hasDiagram ? 1600 : 2200;

  const diagramRevealed = hasDiagram ? Math.min(step, diagramSteps) : 0;
  const textRevealed    = hasDiagram
    ? Math.max(0, step - diagramSteps)
    : step + 1;

  const allDone = step >= totalSteps - (hasDiagram ? 0 : 1);

  // Auto-advance
  useEffect(() => {
    if (paused || allDone) return;
    const t = setTimeout(() => setStep((s) => s + 1), AUTOPLAY_MS);
    return () => clearTimeout(t);
  }, [step, paused, allDone, AUTOPLAY_MS]);

  // Mark finished so replay button can appear
  useEffect(() => {
    if (allDone) setFinished(true);
  }, [allDone]);

  const handleNext = useCallback(() => {
    if (allDone) {
      onUnderstood?.();
      onDismiss();
    } else {
      setStep((s) => s + 1);
    }
  }, [allDone, onDismiss, onUnderstood]);

  const handleReplay = useCallback(() => {
    setStep(0);
    setFinished(false);
    setPaused(false);
  }, []);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  }, [step]);

  const visibleLines = textLines.slice(0, textRevealed);

  // Progress: how far through the total journey
  const progressFrac = totalSteps > 0 ? Math.min(step / (totalSteps - (hasDiagram ? 0 : 1)), 1) : 1;
  const progressWidth = clampPercent(progressFrac * 100, {
    source: 'components/ai/DashTutorWhiteboard.progress',
  });

  return (
    <Animated.View entering={FadeIn.duration(180)} style={styles.overlay}>
      <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />

      <Animated.View entering={FadeInDown.duration(280).springify()} style={styles.board}>
        {/* Deep-space background */}
        <LinearGradient
          colors={['#080d1e', '#0c1233', '#080a18']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Indigo top-glow vignette */}
        <LinearGradient
          colors={['rgba(99,102,241,0.18)', 'rgba(99,102,241,0.04)', 'transparent']}
          start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.5 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {/* Edge darkening */}
        <LinearGradient
          colors={['rgba(0,0,0,0.35)', 'transparent', 'rgba(0,0,0,0.25)']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <RulingLines />

        {/* Header tray */}
        <View style={styles.tray}>
          <View style={styles.trayLeft}>
            <View style={styles.trayIconWrap}>
              <Ionicons name="telescope-outline" size={14} color={C.indigo} />
            </View>
            <Text style={styles.trayTitle}>Dash Board</Text>
          </View>
          <TouchableOpacity onPress={onDismiss} style={styles.closeBtn}>
            <Ionicons name="close-circle" size={21} color="rgba(165,180,252,0.45)" />
          </TouchableOpacity>
        </View>

        <ScrollView ref={scrollRef} style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>

          {/* ── SVG Diagram ── */}
          {hasDiagram && latticeData && (
            <View style={styles.diagramWrap}>
              <Text style={styles.diagramLabel}>
                {latticeData.multiplicand} × {latticeData.multiplier}
              </Text>
              <LatticeDiagram data={latticeData} revealed={diagramRevealed} />
            </View>
          )}
          {hasDiagram && divData && (
            <View style={styles.diagramWrap}>
              <Text style={styles.diagramLabel}>
                {divData.dividend} ÷ {divData.divisor}
              </Text>
              <LongDivisionDiagram data={divData} revealed={diagramRevealed} />
              {diagramRevealed >= diagramSteps && (
                <Animated.View entering={FadeIn.duration(300)} style={styles.answerBubble}>
                  <Text style={styles.answerText}>
                    {divData.dividend} ÷ {divData.divisor} = {divData.quotientStr}
                  </Text>
                </Animated.View>
              )}
            </View>
          )}

          {hasDiagram && numberLineData && (
            <View style={styles.diagramWrap}>
              <Text style={styles.diagramLabel}>
                Number Line: {numberLineData.start} – {numberLineData.end}
              </Text>
              <NumberLineDiagram data={numberLineData} revealed={diagramRevealed} />
            </View>
          )}

          {hasDiagram && fractionData && (
            <View style={styles.diagramWrap}>
              <Text style={styles.diagramLabel}>
                Fraction: {fractionData.numerator}/{fractionData.denominator}
              </Text>
              <FractionBarDiagram data={fractionData} revealed={diagramRevealed} />
            </View>
          )}

          {/* ── Chalk text explanation ── */}
          {visibleLines.length > 0 && (
            <View style={styles.textSection}>
              {hasDiagram && (
                <View style={styles.textDivider}>
                  <View style={styles.textDividerLine} />
                  <Text style={styles.textDividerLabel}>How it works</Text>
                  <View style={styles.textDividerLine} />
                </View>
              )}
              {visibleLines.map((line, i) => (
                <ChalkLine key={i} line={line} index={i} />
              ))}
            </View>
          )}
        </ScrollView>

        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressWidth}%` as any }]} />
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          {finished ? (
            <TouchableOpacity style={styles.skipBtn} onPress={handleReplay}>
              <Ionicons name="refresh" size={16} color={C.cyan} />
              <Text style={[styles.skipText, { color: C.cyan, marginLeft: 4 }]}>Replay</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.skipBtn} onPress={() => setPaused((p) => !p)}>
              <Ionicons name={paused ? 'play' : 'pause'} size={16} color="rgba(165,180,252,0.5)" />
            </TouchableOpacity>
          )}

          <View style={styles.footerCenter}>
            <Text style={styles.footerHint}>
              {hasDiagram && step < diagramSteps
                ? latticeData
                  ? step === 0 ? 'Building grid…' : step <= latticeData.numCols * latticeData.numRows ? `Cell ${step} of ${latticeData.numCols * latticeData.numRows}` : 'Diagonal sums'
                : numberLineData
                  ? `Tick ${Math.min(diagramRevealed, diagramSteps)} of ${diagramSteps}`
                  : fractionData
                  ? `${Math.min(diagramRevealed, fractionData.numerator)} of ${fractionData.denominator} parts`
                  : `Step ${step + 1} of ${diagramSteps}`
                : allDone
                  ? 'All done!'
                  : `${textRevealed} / ${textLines.length}`}
            </Text>
          </View>

          <TouchableOpacity style={styles.nextBtn} onPress={handleNext} activeOpacity={0.8}>
            <LinearGradient
              colors={allDone ? ['#10b981', '#059669'] : ['#6366f1', '#4f46e5']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.nextGrad}
            >
              <Ionicons
                name={allDone ? 'checkmark-circle' : 'arrow-forward-circle'}
                size={18} color="#fff"
              />
              <Text style={styles.nextText}>
                {allDone ? 'Got it!' : hasDiagram && step < diagramSteps ? 'Next step' : 'Next'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: 16,
  },
  board: {
    width: '100%', maxWidth: 430, maxHeight: '86%',
    borderRadius: 16, overflow: 'hidden',
    borderWidth: 1.5, borderColor: 'rgba(99,102,241,0.5)',
    elevation: 24,
    shadowColor: '#6366f1', shadowOpacity: 0.35, shadowRadius: 32, shadowOffset: { width: 0, height: 12 },
  },
  tray: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(99,102,241,0.25)',
    backgroundColor: 'rgba(99,102,241,0.1)',
  },
  trayLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  trayIconWrap: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(99,102,241,0.2)',
    borderWidth: 1, borderColor: 'rgba(99,102,241,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  trayTitle: {
    color: '#a5b4fc', fontSize: 12, fontWeight: '700', letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  closeBtn: { padding: 2 },

  scroll: { maxHeight: 380 },
  scrollContent: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6 },

  // Diagram
  diagramWrap: {
    alignItems: 'center', paddingTop: 8, paddingBottom: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(99,102,241,0.08)',
    borderWidth: 1, borderColor: 'rgba(99,102,241,0.2)',
    marginBottom: 8,
  },
  diagramLabel: {
    color: 'rgba(165,180,252,0.6)', fontSize: 11, letterSpacing: 0.8,
    fontWeight: '600', marginBottom: 6, textTransform: 'uppercase',
  },
  answerBubble: {
    marginTop: 10,
    paddingHorizontal: 18, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1.5, borderColor: C.green,
    backgroundColor: 'rgba(134,239,172,0.1)',
  },
  answerText: {
    color: C.green, fontSize: 17, fontWeight: '700', letterSpacing: 0.4,
    fontFamily: Platform.OS === 'ios' ? 'Chalkboard SE' : 'monospace',
  },

  // Text section
  textSection: { paddingTop: 4 },
  textDivider: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: 4 },
  textDividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(99,102,241,0.2)' },
  textDividerLabel: {
    color: 'rgba(165,180,252,0.45)', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase',
  },

  // Chalk lines
  lineRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 9, gap: 8,
  },
  inlineMathRow: {
    flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 2,
  },
  headingRow: {
    borderBottomWidth: 1, borderBottomColor: 'rgba(253,230,138,0.2)',
    paddingBottom: 5, marginBottom: 12,
  },
  equationRow: {
    backgroundColor: 'rgba(99,102,241,0.1)',
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
    borderLeftWidth: 2, borderLeftColor: 'rgba(99,102,241,0.6)',
  },
  resultRow: {
    backgroundColor: 'rgba(249,168,212,0.07)',
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
    borderLeftWidth: 2.5, borderLeftColor: C.pink,
  },
  chalkText: { flex: 1, lineHeight: 26 },
  stepBadge: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  stepNum: { fontSize: 11, fontWeight: '700' },

  // Progress
  progressTrack: {
    height: 3, backgroundColor: 'rgba(99,102,241,0.15)', marginHorizontal: 14, borderRadius: 2,
  },
  progressFill: {
    height: 3, backgroundColor: C.indigo, borderRadius: 2,
  },

  // Footer
  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 11,
    borderTopWidth: 1, borderTopColor: 'rgba(99,102,241,0.25)',
    backgroundColor: 'rgba(8,13,30,0.85)',
  },
  footerCenter: { flex: 1, alignItems: 'center' },
  footerHint: {
    color: 'rgba(165,180,252,0.5)', fontSize: 11, letterSpacing: 0.5,
  },
  skipBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  skipText: { color: 'rgba(165,180,252,0.6)', fontSize: 13 },
  nextBtn: { borderRadius: 22, overflow: 'hidden' },
  nextGrad: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 18, paddingVertical: 9,
  },
  nextText: { color: '#fff', fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },
});
