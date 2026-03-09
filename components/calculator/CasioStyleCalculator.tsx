/**
 * Casio-style calculator (single source of truth ported from casio-calculator-full.jsx).
 * Includes SHIFT/ALPHA layers, memory, DEG/RAD, scientific functions, and safe parsing.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { evaluateExpression, formatResult } from '@/lib/calculator/scientificEval';

type KeyType =
  | 'shift'
  | 'alpha'
  | 'sys'
  | 'nav'
  | 'del'
  | 'ac'
  | 'func'
  | 'mem'
  | 'trig'
  | 'const'
  | 'punc'
  | 'num'
  | 'ans'
  | 'eq'
  | 'op';

type CalcKey = {
  p: string;
  s?: string;
  a?: string;
  type: KeyType;
};

const DISPLAY_MAX_LEN = 140;

const ROWS: ReadonlyArray<ReadonlyArray<CalcKey>> = [
  [
    { p: 'SHIFT', type: 'shift' },
    { p: 'ALPHA', type: 'alpha' },
    { p: 'MODE', s: 'RESET', type: 'sys' },
    { p: '←', s: 'INS', type: 'nav' },
    { p: '→', type: 'nav' },
    { p: '⌫', type: 'del' },
    { p: 'AC', s: 'OFF', type: 'ac' },
  ],
  [
    { p: 'CALC', s: 'd/dx', a: 'A', type: 'func' },
    { p: '∫dx', s: 'Σ', a: 'B', type: 'func' },
    { p: 'Pol(', s: 'Rec(', a: 'C', type: 'func' },
    { p: 'M+', s: 'M-', a: 'D', type: 'mem' },
    { p: 'RCL', s: 'STO', a: 'E', type: 'mem' },
  ],
  [
    { p: 'sin', s: 'sin⁻¹', a: 'F', type: 'trig' },
    { p: 'cos', s: 'cos⁻¹', a: 'G', type: 'trig' },
    { p: 'tan', s: 'tan⁻¹', a: 'H', type: 'trig' },
    { p: 'log', s: '10ˣ', a: 'I', type: 'trig' },
    { p: 'ln', s: 'eˣ', a: 'J', type: 'trig' },
  ],
  [
    { p: 'x²', s: '√¯', a: 'K', type: 'func' },
    { p: 'x³', s: '∛¯', a: 'L', type: 'func' },
    { p: 'xʸ', s: 'ʸ√x', a: 'M', type: 'func' },
    { p: 'x⁻¹', s: 'Abs', a: 'N', type: 'func' },
    { p: '%', s: 'n!', a: 'O', type: 'func' },
  ],
  [
    { p: '(', s: '[', a: 'P', type: 'punc' },
    { p: ')', s: ']', a: 'Q', type: 'punc' },
    { p: 'S⇔D', a: 'R', type: 'func' },
    { p: 'π', s: 'e', a: 'S', type: 'const' },
    { p: 'EXP', s: '×10', a: 'T', type: 'func' },
  ],
  [
    { p: '7', a: '&', type: 'num' },
    { p: '8', a: '(', type: 'num' },
    { p: '9', a: ')', type: 'num' },
    { p: 'DEL', s: 'INS', type: 'del' },
    { p: 'AC', type: 'ac' },
  ],
  [
    { p: '4', a: '"', type: 'num' },
    { p: '5', a: '#', type: 'num' },
    { p: '6', a: '$', type: 'num' },
    { p: '×', s: 'nPr', type: 'op' },
    { p: '÷', s: 'nCr', type: 'op' },
  ],
  [
    { p: '1', a: '=', type: 'num' },
    { p: '2', a: '?', type: 'num' },
    { p: '3', a: '@', type: 'num' },
    { p: '+', type: 'op' },
    { p: '−', type: 'op' },
  ],
  [
    { p: '0', s: 'Ran#', a: ' ', type: 'num' },
    { p: '.', s: '⁻¹', a: ',', type: 'num' },
    { p: 'Ans', s: 'DRG►', type: 'ans' },
    { p: '=', type: 'eq' },
  ],
];

const BODY_BG = '#1b2030';
const BODY_DARK = '#0f1219';
const DISPLAY_BG = '#b8c9a8';
const DISPLAY_DARK = '#2a3518';
const DISPLAY_MID = '#7a9660';
const KEY_BASE = '#242838';
const KEY_TOP = '#2e3448';
const KEY_OP = '#1a2a4a';
const KEY_OP_TOP = '#223060';
const KEY_EQ = '#0a2e78';
const KEY_EQ_TOP = '#0e3d9e';
const KEY_AC = '#6b1a1a';
const KEY_AC_TOP = '#8a2020';
const KEY_DEL = '#2a2020';
const KEY_DEL_TOP = '#3a2c2c';
const KEY_SYS = '#1a2238';
const KEY_SYS_TOP = '#222c48';
const SHIFT_COLOR = '#f0c030';
const ALPHA_COLOR = '#40c080';
const KEY_TEXT = '#e8ecf4';
const KEY_SUB = '#a8b0c8';

function getKeyColors(key: CalcKey, shiftOn: boolean, alphaOn: boolean): {
  bg: string;
  top: string;
  text: string;
} {
  if (key.type === 'shift' && shiftOn) return { bg: SHIFT_COLOR, top: '#f8d848', text: '#1a1000' };
  if (key.type === 'alpha' && alphaOn) return { bg: ALPHA_COLOR, top: '#50d090', text: '#001a0e' };

  switch (key.type) {
    case 'shift':
      return { bg: '#3a3010', top: '#4a4018', text: SHIFT_COLOR };
    case 'alpha':
      return { bg: '#0a2a18', top: '#102e20', text: ALPHA_COLOR };
    case 'eq':
      return { bg: KEY_EQ, top: KEY_EQ_TOP, text: '#80b4ff' };
    case 'op':
      return { bg: KEY_OP, top: KEY_OP_TOP, text: '#90c0ff' };
    case 'ac':
      return { bg: KEY_AC, top: KEY_AC_TOP, text: '#ff9090' };
    case 'del':
      return { bg: KEY_DEL, top: KEY_DEL_TOP, text: '#ffb090' };
    case 'sys':
    case 'nav':
      return { bg: KEY_SYS, top: KEY_SYS_TOP, text: KEY_SUB };
    case 'trig':
      return { bg: '#162040', top: '#1e2c54', text: '#a0c8ff' };
    case 'func':
      return { bg: '#1a1e30', top: '#242840', text: '#c0c8e8' };
    case 'mem':
      return { bg: '#1e2030', top: '#282a42', text: '#c8d0f0' };
    case 'const':
      return { bg: '#1a2030', top: '#22283e', text: '#e0d890' };
    case 'punc':
      return { bg: '#202030', top: '#2a2a42', text: '#d0d8f0' };
    case 'ans':
      return { bg: '#1e2438', top: '#283050', text: '#c0c8e8' };
    case 'num':
    default:
      return { bg: KEY_BASE, top: KEY_TOP, text: KEY_TEXT };
  }
}

function normalizeDisplayNumber(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function CasioStyleCalculator() {
  const [expression, setExpression] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [lastAns, setLastAns] = useState<number | null>(null);
  const [memory, setMemory] = useState(0);
  const [shift, setShift] = useState(false);
  const [alpha, setAlpha] = useState(false);
  const [radians, setRadians] = useState(true);

  const expressionScrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    expressionScrollRef.current?.scrollToEnd({ animated: false });
  }, [expression]);

  const append = useCallback((snippet: string) => {
    setResult(null);
    setExpression((prev) => {
      const next = `${prev}${snippet}`;
      return next.length > DISPLAY_MAX_LEN ? prev : next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setExpression('');
    setResult(null);
  }, []);

  const backspace = useCallback(() => {
    setResult(null);
    setExpression((prev) => prev.slice(0, -1));
  }, []);

  const evaluate = useCallback(() => {
    let expr = expression.replace(/\s/g, '');
    if (!expr) return;

    expr = expr.replace(/Ans/g, lastAns != null ? String(lastAns) : '0');
    const openCount = (expr.match(/\(/g) || []).length - (expr.match(/\)/g) || []).length;
    if (openCount > 0) {
      expr += ')'.repeat(openCount);
    }

    const value = evaluateExpression(expr, radians);
    if (value == null) {
      setResult('Math ERROR');
      return;
    }

    setExpression(expr);
    setResult(formatResult(value));
    setLastAns(value);
  }, [expression, lastAns, radians]);

  const applyShiftLayer = useCallback(
    (shiftLabel: string): boolean => {
      switch (shiftLabel) {
        case 'sin⁻¹':
          append('asin(');
          return true;
        case 'cos⁻¹':
          append('acos(');
          return true;
        case 'tan⁻¹':
          append('atan(');
          return true;
        case '10ˣ':
          append('10^(');
          return true;
        case 'eˣ':
          append('exp(');
          return true;
        case '√¯':
          append('√(');
          return true;
        case '∛¯':
          append('∛(');
          return true;
        case 'ʸ√x':
          append('^(1/');
          return true;
        case 'Abs':
          append('abs(');
          return true;
        case 'n!':
          append('!');
          return true;
        case 'e':
          append('e');
          return true;
        case 'M-': {
          const current = result && result !== 'Math ERROR'
            ? normalizeDisplayNumber(result)
            : lastAns ?? 0;
          setMemory((prev) => prev - current);
          return true;
        }
        case 'STO': {
          const current = result && result !== 'Math ERROR'
            ? normalizeDisplayNumber(result)
            : lastAns ?? evaluateExpression(expression, radians) ?? 0;
          setMemory(current);
          return true;
        }
        case 'DRG►':
          setRadians((prev) => !prev);
          return true;
        default:
          return false;
      }
    },
    [append, expression, lastAns, radians, result],
  );

  const handleKey = useCallback(
    (key: CalcKey) => {
      if (key.type === 'shift') {
        setShift((prev) => !prev);
        setAlpha(false);
        return;
      }
      if (key.type === 'alpha') {
        setAlpha((prev) => !prev);
        setShift(false);
        return;
      }

      const wasShift = shift;
      setShift(false);
      setAlpha(false);

      if (key.p === 'AC') {
        clearAll();
        return;
      }
      if (key.p === '⌫' || key.p === 'DEL') {
        backspace();
        return;
      }
      if (key.p === '=') {
        evaluate();
        return;
      }
      if (key.p === 'MODE') {
        setRadians((prev) => !prev);
        return;
      }
      if (key.p === 'M+') {
        const current = result && result !== 'Math ERROR'
          ? normalizeDisplayNumber(result)
          : lastAns ?? evaluateExpression(expression, radians) ?? 0;
        setMemory((prev) => prev + current);
        return;
      }
      if (key.p === 'RCL') {
        append(formatResult(memory));
        return;
      }
      if (key.p === 'Ans') {
        if (lastAns != null) {
          append(String(lastAns));
        }
        return;
      }

      const shiftHandled = wasShift && key.s ? applyShiftLayer(key.s) : false;
      if (shiftHandled) {
        return;
      }

      setResult(null);
      switch (key.p) {
        case 'sin':
          append('sin(');
          return;
        case 'cos':
          append('cos(');
          return;
        case 'tan':
          append('tan(');
          return;
        case 'log':
          append('log(');
          return;
        case 'ln':
          append('ln(');
          return;
        case 'x²':
          append('^2');
          return;
        case 'x³':
          append('^3');
          return;
        case 'xʸ':
          append('^(');
          return;
        case 'x⁻¹': {
          if (result && result !== 'Math ERROR') {
            setExpression(`(${result})^(-1)`);
            setResult(null);
            return;
          }
          append('^(-1)');
          return;
        }
        case '%':
          append('%');
          return;
        case 'π':
          append('π');
          return;
        case 'EXP':
          append('×10^(');
          return;
        case '√':
        case '√¯':
          append('√(');
          return;
        case '∛':
        case '∛¯':
          append('∛(');
          return;
        case 'S⇔D':
          if (lastAns != null) {
            setExpression(formatResult(lastAns));
            setResult(null);
          }
          return;
        case 'CALC':
        case '∫dx':
        case 'Pol(':
        case '←':
        case '→':
          return;
        default:
          append(key.p);
      }
    },
    [
      alpha,
      append,
      applyShiftLayer,
      backspace,
      clearAll,
      evaluate,
      expression,
      lastAns,
      memory,
      radians,
      result,
      shift,
    ],
  );

  const displayExpression = expression || ' ';
  const displayResult = useMemo(() => {
    if (result != null) return result;
    // AC clears result to null — show 0, not the stale last answer.
    // (lastAns is still accessible via the Ans button.)
    return '0';
  }, [result]);
  const isError = displayResult === 'Math ERROR';

  return (
    <View style={styles.outerShell}>
      <View style={styles.shellInner}>
        <View style={styles.brandStrip}>
          <View>
            <Text style={styles.brandTitle}>
              EduDash <Text style={styles.brandAccent}>Pro</Text>
            </Text>
            <Text style={styles.brandSubtitle}>SCIENTIFIC fx-K12</Text>
          </View>
          <View style={styles.modeGroup}>
            <TouchableOpacity
              style={[styles.modeButton, !radians && styles.modeButtonActive]}
              onPress={() => setRadians(false)}
            >
              <Text style={[styles.modeButtonText, !radians && styles.modeButtonTextActive]}>DEG</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeButton, radians && styles.modeButtonActive]}
              onPress={() => setRadians(true)}
            >
              <Text style={[styles.modeButtonText, radians && styles.modeButtonTextActive]}>RAD</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.displayBezel}>
          <View style={styles.display}>
            <View style={styles.statusRow}>
              <Text style={[styles.statusPill, shift ? styles.statusOnShift : styles.statusOff]}>S</Text>
              <Text style={[styles.statusPill, alpha ? styles.statusOnAlpha : styles.statusOff]}>A</Text>
              <Text style={[styles.statusPill, memory !== 0 ? styles.statusOnMemory : styles.statusOff]}>M</Text>
              <Text style={[styles.statusPill, styles.statusOnMode]}>{radians ? 'RAD' : 'DEG'}</Text>
              <Text style={[styles.statusPill, lastAns != null ? styles.statusOnAns : styles.statusOff]}>ANS</Text>
            </View>
            <ScrollView
              horizontal
              ref={expressionScrollRef}
              style={styles.expressionScroll}
              contentContainerStyle={styles.expressionScrollContent}
              showsHorizontalScrollIndicator={false}
            >
              <Text style={styles.expressionText} numberOfLines={1}>
                {displayExpression}
              </Text>
            </ScrollView>
            <Text style={[styles.resultText, isError && styles.resultTextError]} numberOfLines={1}>
              {displayResult}
            </Text>
          </View>
        </View>

        <View style={styles.keypad}>
          {ROWS.map((row, rowIndex) => (
            <View
              key={`row-${rowIndex}`}
              style={[
                styles.keyRow,
                rowIndex === 0 ? styles.keyRowSystem : null,
                rowIndex >= 5 ? styles.keyRowNumeric : null,
              ]}
            >
              {row.map((key) => {
                const colors = getKeyColors(key, shift, alpha);
                const isSmallRow = rowIndex === 0;
                const isWide = key.p === '=' || (key.p === 'AC' && rowIndex === 0);
                const flexWeight = isWide ? 2 : 1;
                const keyLabelFontSize = isSmallRow ? 10 : key.p.length > 3 ? 10 : key.p.length > 2 ? 12 : 14;

                return (
                  <View key={`${rowIndex}-${key.p}`} style={[styles.keyCell, { flex: flexWeight }]}>
                    {!isSmallRow && key.s ? (
                      <Text style={[styles.keyShiftHint, shift ? styles.keyShiftHintActive : styles.keyShiftHintDim]}>
                        {key.s}
                      </Text>
                    ) : (
                      <View style={isSmallRow ? styles.keyShiftHintSpacerCompact : styles.keyShiftHintSpacer} />
                    )}

                    <Pressable onPress={() => handleKey(key)} style={({ pressed }) => [styles.keyPressable, pressed && styles.keyPressablePressed]}>
                      {({ pressed }) => (
                        <LinearGradient
                          colors={[pressed ? colors.bg : colors.top, colors.bg, BODY_DARK]}
                          start={{ x: 0.5, y: 0 }}
                          end={{ x: 0.5, y: 1 }}
                          style={[
                            styles.keyFace,
                            isSmallRow && styles.keyFaceCompact,
                            pressed ? styles.keyFacePressed : styles.keyFaceRaised,
                          ]}
                        >
                          {key.a && !isSmallRow ? (
                            <Text style={[styles.keyAlphaHint, alpha ? styles.keyAlphaHintActive : styles.keyAlphaHintDim]}>
                              {key.a}
                            </Text>
                          ) : null}
                          <Text
                            style={[
                              styles.keyLabelBase,
                              { color: colors.text },
                              { fontSize: keyLabelFontSize },
                            ]}
                            numberOfLines={1}
                          >
                            {key.p}
                          </Text>
                        </LinearGradient>
                      )}
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerShell: {
    flex: 1,
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
    borderRadius: 18,
    padding: 8,
    backgroundColor: BODY_DARK,
    ...Platform.select({
      web: {
        boxShadow: '0 18px 48px rgba(0,0,0,0.45)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
        elevation: 10,
      },
    }),
  },
  shellInner: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: BODY_BG,
  },
  brandStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    marginBottom: 8,
    paddingBottom: 7,
    paddingHorizontal: 2,
  },
  brandTitle: {
    color: '#e8ecf4',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  brandAccent: {
    color: '#4a90ff',
  },
  brandSubtitle: {
    marginTop: 1,
    color: '#5060a0',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.8,
  },
  modeGroup: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
    padding: 2,
  },
  modeButton: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'transparent',
  },
  modeButtonActive: {
    backgroundColor: 'rgba(74,144,255,0.2)',
  },
  modeButtonText: {
    color: '#404868',
    fontSize: 10,
    fontWeight: '700',
  },
  modeButtonTextActive: {
    color: '#80b4ff',
  },
  displayBezel: {
    borderRadius: 8,
    padding: 4,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.4)',
    backgroundColor: BODY_DARK,
  },
  display: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#92a781',
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: DISPLAY_BG,
    minHeight: 108,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  statusPill: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  statusOff: {
    color: DISPLAY_MID,
    opacity: 0.45,
  },
  statusOnShift: {
    color: SHIFT_COLOR,
  },
  statusOnAlpha: {
    color: ALPHA_COLOR,
  },
  statusOnMemory: {
    color: '#c08030',
  },
  statusOnMode: {
    color: DISPLAY_DARK,
  },
  statusOnAns: {
    color: DISPLAY_MID,
    opacity: 1,
  },
  expressionScroll: {
    maxHeight: 22,
    marginBottom: 6,
  },
  expressionScrollContent: {
    minWidth: '100%',
    justifyContent: 'flex-end',
  },
  expressionText: {
    color: DISPLAY_DARK,
    opacity: 0.68,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.4,
    textAlign: 'right',
  },
  resultText: {
    color: DISPLAY_DARK,
    fontSize: 27,
    fontWeight: '700',
    textAlign: 'right',
    letterSpacing: 0.9,
    minHeight: 38,
  },
  resultTextError: {
    color: '#cc2020',
    fontSize: 16,
    letterSpacing: 0,
    paddingTop: 8,
  },
  keypad: {
    flex: 1,
    gap: 5,
    justifyContent: 'flex-start',
  },
  keyRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 5,
  },
  keyRowSystem: {
    gap: 4,
    justifyContent: 'space-between',
  },
  keyRowNumeric: {
    justifyContent: 'flex-start',
  },
  keyCell: {
    minWidth: 0,
    gap: 2,
  },
  keyShiftHintSpacer: {
    height: 14,
  },
  keyShiftHintSpacerCompact: {
    height: 0,
  },
  keyShiftHint: {
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 12,
    letterSpacing: 0.2,
    minHeight: 13,
  },
  keyShiftHintActive: {
    color: SHIFT_COLOR,
  },
  keyShiftHintDim: {
    color: 'rgba(200,160,40,0.45)',
  },
  keyPressable: {
    minWidth: 0,
    width: '100%',
  },
  keyPressablePressed: {
    transform: [{ translateY: 2 }],
  },
  keyFace: {
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    paddingVertical: 2,
    overflow: 'hidden',
    gap: 1,
  },
  keyFaceRaised: {
    ...Platform.select({
      web: {
        boxShadow: `0 3px 0 ${BODY_DARK}, 0 4px 6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.10)`,
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.45,
        shadowRadius: 3,
        elevation: 5,
      },
    }),
  },
  keyFacePressed: {
    ...Platform.select({
      web: {
        boxShadow: `0 1px 2px rgba(0,0,0,0.5), inset 0 2px 4px rgba(0,0,0,0.4)`,
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.32,
        shadowRadius: 1.5,
        elevation: 2,
      },
    }),
  },
  keyFaceCompact: {
    minHeight: 30,
    borderRadius: 6,
  },
  keyAlphaHint: {
    position: 'absolute',
    top: 2,
    left: 4,
    fontSize: 7,
    fontWeight: '700',
    lineHeight: 8,
  },
  keyAlphaHintActive: {
    color: ALPHA_COLOR,
  },
  keyAlphaHintDim: {
    color: 'rgba(64,192,128,0.3)',
  },
  keyLabelBase: {
    fontWeight: '700',
    letterSpacing: 0.2,
    fontFamily: Platform.select({
      ios: 'Courier',
      android: 'monospace',
      default: 'monospace',
    }),
  },
});
