/**
 * Math Calculator Component
 *
 * Simple calculator for maths work during exams and homework.
 * Supports basic operations: +, −, ×, ÷, and inserts result into work text.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

interface MathCalculatorProps {
  theme: Record<string, string>;
  onInsertResult?: (value: string) => void;
  style?: ViewStyle;
}

type Op = '+' | '−' | '×' | '÷' | null;

function safeEval(a: number, op: Op, b: number): number | null {
  try {
    switch (op) {
      case '+':
        return a + b;
      case '−':
        return a - b;
      case '×':
        return a * b;
      case '÷':
        return b === 0 ? null : a / b;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export function MathCalculator({ theme, onInsertResult, style }: MathCalculatorProps) {
  const [display, setDisplay] = useState('0');
  const [pendingOp, setPendingOp] = useState<Op>(null);
  const [prevValue, setPrevValue] = useState<number | null>(null);

  const clear = useCallback(() => {
    setDisplay('0');
    setPendingOp(null);
    setPrevValue(null);
  }, []);

  const appendDigit = useCallback(
    (digit: string) => {
      setDisplay((prev) => {
        if (prev === '0' && digit !== '.') return digit;
        if (digit === '.' && prev.includes('.')) return prev;
        if (prev === '0.' && digit === '.') return prev;
        return prev + digit;
      });
    },
    [],
  );

  const applyOp = useCallback(
    (op: Op) => {
      const current = parseFloat(display);
      if (Number.isNaN(current)) return;

      if (pendingOp !== null && prevValue !== null) {
        const result = safeEval(prevValue, pendingOp, current);
        if (result !== null) {
          const formatted = result % 1 === 0 ? String(result) : result.toFixed(6).replace(/\.?0+$/, '');
          setDisplay(formatted);
          setPrevValue(result);
        }
      } else {
        setPrevValue(current);
      }
      setPendingOp(op);
      setDisplay('0'); // Ready for next number
    },
    [display, pendingOp, prevValue],
  );

  const equals = useCallback(() => {
    if (pendingOp === null || prevValue === null) return;
    const current = parseFloat(display);
    if (Number.isNaN(current)) return;
    const result = safeEval(prevValue, pendingOp, current);
    if (result !== null) {
      const formatted = result % 1 === 0 ? String(result) : result.toFixed(6).replace(/\.?0+$/, '');
      setDisplay(formatted);
      setPrevValue(null);
      setPendingOp(null);
    }
  }, [display, pendingOp, prevValue]);

  const insertResult = useCallback(() => {
    onInsertResult?.(display);
  }, [display, onInsertResult]);

  const btnBg = (active?: boolean) => ({
    backgroundColor: active ? theme.primary + '30' : theme.surface,
    borderColor: theme.border,
  });
  const btnText = (active?: boolean) => ({ color: active ? theme.primary : theme.text });

  return (
    <View style={[styles.root, { borderColor: theme.border, backgroundColor: theme.surface }, style]}>
      <Text style={[styles.display, { color: theme.text, borderColor: theme.border }]} numberOfLines={1}>
        {display}
      </Text>

      <View style={styles.row}>
        <CalcBtn label="C" onPress={clear} style={btnBg()} textStyle={btnText()} />
        <CalcBtn label="÷" onPress={() => applyOp('÷')} style={btnBg(pendingOp === '÷')} textStyle={btnText(pendingOp === '÷')} />
        <CalcBtn label="×" onPress={() => applyOp('×')} style={btnBg(pendingOp === '×')} textStyle={btnText(pendingOp === '×')} />
        <CalcBtn label="−" onPress={() => applyOp('−')} style={btnBg(pendingOp === '−')} textStyle={btnText(pendingOp === '−')} />
      </View>
      <View style={styles.row}>
        <CalcBtn label="7" onPress={() => appendDigit('7')} style={btnBg()} textStyle={btnText()} />
        <CalcBtn label="8" onPress={() => appendDigit('8')} style={btnBg()} textStyle={btnText()} />
        <CalcBtn label="9" onPress={() => appendDigit('9')} style={btnBg()} textStyle={btnText()} />
        <CalcBtn label="+" onPress={() => applyOp('+')} style={btnBg(pendingOp === '+')} textStyle={btnText(pendingOp === '+')} />
      </View>
      <View style={styles.row}>
        <CalcBtn label="4" onPress={() => appendDigit('4')} style={btnBg()} textStyle={btnText()} />
        <CalcBtn label="5" onPress={() => appendDigit('5')} style={btnBg()} textStyle={btnText()} />
        <CalcBtn label="6" onPress={() => appendDigit('6')} style={btnBg()} textStyle={btnText()} />
        <CalcBtn label="=" onPress={equals} style={[btnBg(), { flex: 1 }]} textStyle={btnText()} />
      </View>
      <View style={styles.row}>
        <CalcBtn label="1" onPress={() => appendDigit('1')} style={btnBg()} textStyle={btnText()} />
        <CalcBtn label="2" onPress={() => appendDigit('2')} style={btnBg()} textStyle={btnText()} />
        <CalcBtn label="3" onPress={() => appendDigit('3')} style={btnBg()} textStyle={btnText()} />
        <CalcBtn label="." onPress={() => appendDigit('.')} style={btnBg()} textStyle={btnText()} />
      </View>
      <View style={styles.row}>
        <CalcBtn label="0" onPress={() => appendDigit('0')} style={[btnBg(), { flex: 2 }]} textStyle={btnText()} />
        <CalcBtn label="Insert" onPress={insertResult} style={[btnBg(), { flex: 2, backgroundColor: theme.primary + '25' }]} textStyle={{ color: theme.primary, fontWeight: '700' }} />
      </View>
    </View>
  );
}

function CalcBtn({
  label,
  onPress,
  style,
  textStyle,
}: {
  label: string;
  onPress: () => void;
  style: StyleProp<ViewStyle>;
  textStyle: StyleProp<TextStyle>;
}) {
  return (
    <TouchableOpacity style={[styles.btn, style]} onPress={onPress} activeOpacity={0.7}>
      <Text style={[styles.btnText, textStyle]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 8,
  },
  display: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'right',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 8,
    fontVariant: ['tabular-nums'],
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  btn: {
    flex: 1,
    minWidth: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
