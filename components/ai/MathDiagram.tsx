/**
 * MathDiagram - Visual math diagrams for educational content
 * 
 * Renders visual diagrams for math concepts:
 * - Long division with step-by-step visualization
 * - Column addition/subtraction
 * - Fraction representations
 * - Multiplication tables
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Line, Rect, Text as SvgText, G, Circle } from 'react-native-svg';

// Color palette
const C = {
  white: '#f1f5f9',
  yellow: '#fde68a',
  cyan: '#67e8f9',
  green: '#86efac',
  pink: '#f9a8d4',
  purple: '#a78bfa',
  indigo: '#6366f1',
  board: '#0c1233',
  dim: 'rgba(241,245,249,0.4)',
};

const CELL = 32;
const ROW_H = 48;
const FS = 22;
const MONO = Platform.OS === 'ios' ? 'Courier New' : 'monospace';

// ────────────────────────────────────────────────────────────────────────────────
// Long Division Types & Logic
// ────────────────────────────────────────────────────────────────────────────────

interface DivisionStep {
  carry: number;
  quotientDigit: number;
  product: number;
  remainder: number;
  posEnd: number;
}

interface LongDivisionData {
  dividend: number;
  divisor: number;
  dividendStr: string;
  divisorStr: string;
  quotientStr: string;
  steps: DivisionStep[];
}

function performLongDivision(dividend: number, divisor: number): LongDivisionData {
  const dividendStr = String(dividend);
  const divisorStr = String(divisor);
  const steps: DivisionStep[] = [];
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
    dividend,
    divisor,
    dividendStr,
    divisorStr,
    quotientStr: qDigits.join('') || '0',
    steps,
  };
}

// ────────────────────────────────────────────────────────────────────────────────
// Long Division SVG Diagram
// ────────────────────────────────────────────────────────────────────────────────

interface LongDivisionDiagramProps {
  data: LongDivisionData;
  revealed: number;
  showLabels?: boolean;
}

function LongDivisionDiagram({ data, revealed, showLabels = true }: LongDivisionDiagramProps) {
  const { dividendStr, divisorStr, steps, quotientStr } = data;
  const dvnLen = dividendStr.length;
  const divLen = divisorStr.length;

  const GUTTER = 16;
  const DIV_AREA_W = divLen * CELL + 36;
  const DVN_W = dvnLen * CELL;
  const SVG_W = GUTTER * 2 + DIV_AREA_W + DVN_W;
  const totalRows = 2 + steps.length * 2;
  const SVG_H = totalRows * ROW_H + 16;

  const cx = (col: number) => GUTTER + DIV_AREA_W + col * CELL + CELL / 2;
  const ry = (row: number) => row * ROW_H + ROW_H / 2 + 8;

  const vincX = GUTTER + DIV_AREA_W - 6;
  const vincX2 = GUTTER + DIV_AREA_W + DVN_W + 6;
  const vincY = ROW_H;

  return (
    <Svg width={SVG_W} height={SVG_H}>
      {/* Problem label */}
      {showLabels && (
        <SvgText
          x={SVG_W / 2}
          y={18}
          textAnchor="middle"
          fill="rgba(167,139,250,0.7)"
          fontSize={11}
          fontFamily={MONO}
          fontWeight="600"
        >
          Long Division
        </SvgText>
      )}

      {/* Divisor */}
      <SvgText
        x={GUTTER + DIV_AREA_W - 32}
        y={ry(1)}
        textAnchor="end"
        fill={C.white}
        fontSize={FS}
        fontFamily={MONO}
        fontWeight="600"
      >
        {divisorStr}
      </SvgText>

      {/* Division bracket ┌ ─ */}
      <Line x1={vincX} y1={vincY} x2={vincX2} y2={vincY} stroke={C.white} strokeWidth={2.5} />
      <Line x1={vincX} y1={vincY} x2={vincX} y2={vincY + ROW_H + 8} stroke={C.white} strokeWidth={2.5} />

      {/* Dividend digits */}
      {dividendStr.split('').map((d, i) => (
        <SvgText key={`dvn${i}`} x={cx(i)} y={ry(1)} textAnchor="middle" fill={C.white} fontSize={FS} fontFamily={MONO}>
          {d}
        </SvgText>
      ))}

      {/* Steps - revealed one at a time */}
      {steps.map((step, si) => {
        if (si >= revealed) return null;

        const prodStr = String(step.product);
        const prodLen = prodStr.length;
        const prodStart = step.posEnd - prodLen + 1;
        const stepRow = 2 + si * 2;
        const remRow = stepRow + 1;
        const isLast = si === steps.length - 1;

        const ruleX1 = cx(prodStart) - CELL / 2 - 4;
        const ruleX2 = cx(step.posEnd) + CELL / 2 + 4;
        const ruleY = stepRow * ROW_H + ROW_H - 4;

        const carryStr = isLast ? String(step.remainder) : String(steps[si + 1]?.carry ?? '');
        const carryLen = carryStr.length;
        const carryEndCol = isLast ? step.posEnd : step.posEnd + 1;
        const carryStart = carryEndCol - carryLen + 1;

        return (
          <G key={`step${si}`}>
            {/* Minus sign */}
            <SvgText
              x={cx(prodStart) - CELL * 0.75}
              y={ry(stepRow)}
              textAnchor="middle"
              fill={C.cyan}
              fontSize={FS}
              fontFamily={MONO}
            >
              −
            </SvgText>

            {/* Product digits */}
            {prodStr.split('').map((d, di) => (
              <SvgText key={`prod${si}${di}`} x={cx(prodStart + di)} y={ry(stepRow)} textAnchor="middle" fill={C.cyan} fontSize={FS} fontFamily={MONO}>
                {d}
              </SvgText>
            ))}

            {/* Rule line */}
            <Line x1={ruleX1} y1={ruleY} x2={ruleX2} y2={ruleY} stroke={C.white} strokeWidth={1.5} />

            {/* Remainder / carry */}
            {carryStr.split('').map((d, di) => (
              <SvgText
                key={`carry${si}${di}`}
                x={cx(carryStart + di)}
                y={ry(remRow)}
                textAnchor="middle"
                fill={isLast ? (step.remainder === 0 ? C.green : C.pink) : C.white}
                fontSize={FS}
                fontFamily={MONO}
              >
                {d}
              </SvgText>
            ))}

            {/* Quotient digit */}
            <SvgText
              x={cx(step.posEnd)}
              y={ry(0)}
              textAnchor="middle"
              fill={C.yellow}
              fontSize={FS}
              fontFamily={MONO}
              fontWeight="bold"
            >
              {step.quotientDigit}
            </SvgText>
          </G>
        );
      })}

      {/* Answer label */}
      {revealed >= steps.length && (
        <G>
          <SvgText
            x={vincX2 + 10}
            y={ry(0)}
            textAnchor="start"
            fill={C.green}
            fontSize={14}
            fontFamily={MONO}
            fontWeight="700"
          >
            ✓
          </SvgText>
          <SvgText
            x={SVG_W / 2}
            y={SVG_H - 10}
            textAnchor="middle"
            fill={C.green}
            fontSize={16}
            fontFamily={MONO}
            fontWeight="700"
          >
            Answer: {quotientStr}
          </SvgText>
        </G>
      )}
    </Svg>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Main MathDiagram Component
// ────────────────────────────────────────────────────────────────────────────────

interface MathDiagramProps {
  type: 'long-division' | 'column-addition' | 'multiplication';
  numbers: number[];
  autoReveal?: boolean;
  revealInterval?: number;
  onRevealStep?: (step: number) => void;
  onComplete?: () => void;
}

export function MathDiagram({
  type,
  numbers,
  autoReveal = true,
  revealInterval = 1800,
  onRevealStep,
  onComplete,
}: MathDiagramProps) {
  const [revealed, setRevealed] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Parse based on type
  const diagramData = useMemo(() => {
    switch (type) {
      case 'long-division':
        if (numbers.length >= 2) {
          return performLongDivision(numbers[0], numbers[1]);
        }
        return null;
      default:
        return null;
    }
  }, [type, numbers]);

  // Total steps
  const totalSteps = diagramData?.steps.length ?? 0;

  // Auto-reveal animation
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, []);

  useEffect(() => {
    if (!autoReveal || !diagramData) return;

    const timer = setInterval(() => {
      setRevealed((prev) => {
        const next = prev + 1;
        onRevealStep?.(next);
        if (next >= totalSteps) {
          clearInterval(timer);
          onComplete?.();
        }
        return next;
      });
    }, revealInterval);

    return () => clearInterval(timer);
  }, [autoReveal, diagramData, revealInterval, totalSteps, onRevealStep, onComplete]);

  if (!diagramData) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Unable to generate diagram</Text>
      </View>
    );
  }

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <LinearGradient
        colors={['rgba(99,102,241,0.12)', 'rgba(99,102,241,0.05)', 'transparent']}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.diagramWrap}>
        {type === 'long-division' && diagramData && (
          <LongDivisionDiagram data={diagramData} revealed={revealed} />
        )}
      </View>
      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.controlBtn}
          onPress={() => setRevealed((p) => Math.max(0, p - 1))}
        >
          <Text style={styles.controlBtnText}>← Previous</Text>
        </TouchableOpacity>
        <Text style={styles.stepIndicator}>
          Step {Math.min(revealed + 1, totalSteps)} of {totalSteps}
        </Text>
        <TouchableOpacity
          style={[styles.controlBtn, revealed >= totalSteps && styles.controlBtnDisabled]}
          onPress={() => setRevealed((p) => Math.min(totalSteps, p + 1))}
          disabled={revealed >= totalSteps}
        >
          <Text style={styles.controlBtnText}>Next →</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    padding: 16,
    backgroundColor: 'rgba(12,18,51,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.3)',
    marginVertical: 8,
  },
  diagramWrap: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(99,102,241,0.2)',
  },
  controlBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(99,102,241,0.2)',
  },
  controlBtnDisabled: {
    opacity: 0.4,
  },
  controlBtnText: {
    color: C.indigo,
    fontSize: 13,
    fontWeight: '600',
  },
  stepIndicator: {
    color: 'rgba(167,139,250,0.7)',
    fontSize: 12,
    fontWeight: '500',
  },
  errorContainer: {
    padding: 20,
    alignItems: 'center',
  },
  errorText: {
    color: C.pink,
    fontSize: 14,
  },
});

// Helper hook for memoization
import { useMemo } from 'react';

export default MathDiagram;