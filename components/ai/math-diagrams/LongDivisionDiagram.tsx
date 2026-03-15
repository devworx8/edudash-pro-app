/**
 * Long Division Diagram Component
 *
 * Renders a step-by-step long division visualization with chalkboard styling
 */

import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import Svg, { Line, Text as SvgText, G } from 'react-native-svg';
import { PREMIUM_COLORS } from '@/lib/theme/premiumDashTheme';
import type { LongDivData, LongDivisionDiagramProps } from './types';

// Layout constants
const CELL = 32;
const ROW_H = 48;
const FS = 22;
const MONO = Platform.OS === 'ios' ? 'Courier New' : 'monospace';

// Chalk colors
const CHALK = {
  white: PREMIUM_COLORS.chalkWhite,
  yellow: PREMIUM_COLORS.chalkYellow,
  cyan: PREMIUM_COLORS.chalkCyan,
  green: PREMIUM_COLORS.chalkGreen,
  dim: 'rgba(241,245,249,0.35)',
};

/**
 * Long Division Diagram Component
 */
export function LongDivisionDiagram({
  data,
  revealed = 999,
  onStepComplete,
}: LongDivisionDiagramProps) {
  const { dividendStr, divisorStr, steps, quotientStr } = data;
  const dvnLen = dividendStr.length;
  const divLen = divisorStr.length;

  // Calculate SVG dimensions
  const GUTTER = 16;
  const DIV_AREA_W = divLen * CELL + 36;
  const DVN_W = dvnLen * CELL;
  const SVG_W = GUTTER * 2 + DIV_AREA_W + DVN_W;
  const totalRows = 2 + steps.length * 2;
  const SVG_H = totalRows * ROW_H + 16;

  // Coordinate helpers
  const cx = (col: number) => GUTTER + DIV_AREA_W + col * CELL + CELL / 2;
  const ry = (row: number) => row * ROW_H + ROW_H / 2 + 8;

  const vincX = GUTTER + DIV_AREA_W - 8;
  const vincX2 = GUTTER + DIV_AREA_W + DVN_W + 8;
  const vincY = ROW_H;

  return (
    <View style={styles.container}>
      <Svg width={SVG_W} height={SVG_H}>
        {/* Divisor */}
        <SvgText
          x={GUTTER + DIV_AREA_W - 32}
          y={ry(1)}
          textAnchor="end"
          fill={CHALK.white}
          fontSize={FS}
          fontFamily={MONO}
          fontWeight="600"
        >
          {divisorStr}
        </SvgText>

        {/* Division bracket - vinculum + vertical arm */}
        <Line x1={vincX} y1={vincY} x2={vincX2} y2={vincY} stroke={CHALK.white} strokeWidth={2.5} />
        <Line
          x1={vincX}
          y1={vincY}
          x2={vincX}
          y2={vincY + ROW_H + 8}
          stroke={CHALK.white}
          strokeWidth={2.5}
        />

        {/* Dividend digits */}
        {dividendStr.split('').map((d, i) => (
          <SvgText
            key={`dvn${i}`}
            x={cx(i)}
            y={ry(1)}
            textAnchor="middle"
            fill={CHALK.white}
            fontSize={FS}
            fontFamily={MONO}
            fontWeight="600"
          >
            {d}
          </SvgText>
        ))}

        {/* Quotient above the vinculum */}
        {quotientStr.split('').map((q, i) => (
          <SvgText
            key={`qt${i}`}
            x={cx(i)}
            y={ry(0) - 4}
            textAnchor="middle"
            fill={CHALK.yellow}
            fontSize={FS}
            fontFamily={MONO}
            fontWeight="700"
          >
            {q}
          </SvgText>
        ))}

        {/* Steps - revealed one at a time */}
        {steps.map((step, si) => {
          if (si >= revealed) return null;

          const prodStr = String(step.product);
          const prodLen = prodStr.length;
          const prodStart = step.posEnd - prodLen + 1;
          const stepRow = 2 + si * 2;
          const isLast = si === steps.length - 1;

          const ruleX1 = cx(prodStart) - CELL / 2 - 6;
          const ruleX2 = cx(step.posEnd) + CELL / 2 + 6;
          const ruleY = stepRow * ROW_H + ROW_H - 4;

          const carryStr = isLast ? String(step.remainder) : String(steps[si + 1]?.carry ?? '');
          const carryLen = carryStr.length;
          const carryEndCol = isLast ? step.posEnd : step.posEnd + 1;
          const carryStart = carryEndCol - carryLen + 1;

          return (
            <G key={`step${si}`}>
              {/* Minus sign */}
              <SvgText
                x={cx(prodStart) - CELL * 0.8}
                y={ry(stepRow)}
                textAnchor="middle"
                fill={CHALK.cyan}
                fontSize={FS}
                fontFamily={MONO}
              >
                −
              </SvgText>

              {/* Product digits */}
              {prodStr.split('').map((p, pi) => (
                <SvgText
                  key={`p${si}-${pi}`}
                  x={cx(prodStart + pi)}
                  y={ry(stepRow)}
                  textAnchor="middle"
                  fill={CHALK.dim}
                  fontSize={FS}
                  fontFamily={MONO}
                >
                  {p}
                </SvgText>
              ))}

              {/* Horizontal rule */}
              <Line
                x1={ruleX1}
                y1={ruleY}
                x2={ruleX2}
                y2={ruleY}
                stroke={CHALK.white}
                strokeWidth={2}
              />

              {/* Carry/Remainder digits */}
              {carryStr.split('').map((c, ci) => (
                <SvgText
                  key={`c${si}-${ci}`}
                  x={cx(carryStart + ci)}
                  y={ry(stepRow + 1)}
                  textAnchor="middle"
                  fill={isLast ? CHALK.green : CHALK.white}
                  fontSize={FS}
                  fontFamily={MONO}
                  fontWeight={isLast ? '700' : '400'}
                >
                  {c}
                </SvgText>
              ))}
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 12,
  },
});

export default LongDivisionDiagram;
