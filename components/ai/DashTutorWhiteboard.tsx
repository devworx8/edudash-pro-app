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
  Text as SvgText,
  Rect,
  G,
  Path,
} from 'react-native-svg';

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

// ─── Chalk palette ────────────────────────────────────────────────────────────
const C = {
  white:  '#f1f5f9',
  yellow: '#fbbf24',
  cyan:   '#67e8f9',
  green:  '#86efac',
  pink:   '#f9a8d4',
  dim:    'rgba(241,245,249,0.35)',
  board:  'transparent',
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

  const display = kind === 'step'
    ? line.replace(/^[•·▶]\s|^\d+[.)]\s/, '').replace(/^Step\s*\d+:?\s*/i, '')
    : line;

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
      <Text style={[styles.chalkText, {
        color, fontSize: size,
        fontFamily: Platform.OS === 'ios' ? 'Chalkboard SE' : MONO,
        fontWeight: (kind === 'heading' || kind === 'result') ? '700' : '400',
        textShadowColor: color + '44',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 3,
      }, kind === 'heading' && { letterSpacing: 1, textTransform: 'uppercase' }]}>
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
          height: 1, backgroundColor: 'rgba(255,255,255,0.04)',
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
  // Detect diagram type
  const divData = parseLongDivision(content.lines);
  const hasDiagram = !!divData;

  // Total "pages": diagram steps + text lines
  const diagramSteps = divData ? divData.steps.length : 0;
  const textLines    = content.lines;
  const totalSteps   = hasDiagram
    ? diagramSteps + textLines.length   // diagram first, then text explanation
    : textLines.length;

  const [step, setStep]       = useState(hasDiagram ? 0 : 0);
  const scrollRef             = useRef<ScrollView>(null);

  const diagramRevealed = hasDiagram ? Math.min(step, diagramSteps) : 0;
  const textRevealed    = hasDiagram
    ? Math.max(0, step - diagramSteps)
    : step + 1;   // text-only: reveal from step 0 (show line 0 immediately)

  const allDone = step >= totalSteps - (hasDiagram ? 0 : 1);

  const handleNext = useCallback(() => {
    if (allDone) {
      onUnderstood?.();
      onDismiss();
    } else {
      setStep((s) => s + 1);
    }
  }, [allDone, onDismiss, onUnderstood]);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  }, [step]);

  const visibleLines = textLines.slice(0, textRevealed);

  // Progress: how far through the total journey
  const progressFrac = totalSteps > 0 ? Math.min(step / (totalSteps - (hasDiagram ? 0 : 1)), 1) : 1;

  return (
    <Animated.View entering={FadeIn.duration(180)} style={styles.overlay}>
      <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />

      <Animated.View entering={FadeInDown.duration(280).springify()} style={styles.board}>
        <LinearGradient
          colors={['#1a3a2a', '#162e22', '#0f2018']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={['rgba(0,0,0,0.3)', 'transparent', 'rgba(0,0,0,0.2)']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <RulingLines />

        {/* Header tray */}
        <View style={styles.tray}>
          <View style={styles.trayLeft}>
            <Ionicons name="school-outline" size={15} color={C.green} />
            <Text style={styles.trayTitle}>Dash Whiteboard</Text>
          </View>
          <TouchableOpacity onPress={onDismiss} style={styles.closeBtn}>
            <Ionicons name="close-circle" size={21} color="rgba(255,255,255,0.45)" />
          </TouchableOpacity>
        </View>

        <ScrollView ref={scrollRef} style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>

          {/* ── SVG Diagram ── */}
          {hasDiagram && divData && (
            <View style={styles.diagramWrap}>
              {/* Problem label */}
              <Text style={styles.diagramLabel}>
                {divData.dividend} ÷ {divData.divisor}
              </Text>
              <LongDivisionDiagram data={divData} revealed={diagramRevealed} />
              {/* Answer callout once all diagram steps are revealed */}
              {diagramRevealed >= diagramSteps && (
                <Animated.View entering={FadeIn.duration(300)} style={styles.answerBubble}>
                  <Text style={styles.answerText}>
                    {divData.dividend} ÷ {divData.divisor} = {divData.quotientStr}
                  </Text>
                </Animated.View>
              )}
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
          <View style={[styles.progressFill, { width: `${progressFrac * 100}%` as any }]} />
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.skipBtn} onPress={onDismiss}>
            <Text style={styles.skipText}>Close</Text>
          </TouchableOpacity>

          <View style={styles.footerCenter}>
            <Text style={styles.footerHint}>
              {hasDiagram && step < diagramSteps
                ? `Step ${step + 1} of ${diagramSteps}`
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
    borderRadius: 12, overflow: 'hidden',
    borderWidth: 6, borderColor: '#5c3d1e',
    elevation: 24,
    shadowColor: '#000', shadowOpacity: 0.65, shadowRadius: 28, shadowOffset: { width: 0, height: 14 },
  },
  tray: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 9,
    borderBottomWidth: 2, borderBottomColor: '#5c3d1e',
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  trayLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  trayTitle: {
    color: C.green, fontSize: 12, fontWeight: '700', letterSpacing: 0.9,
    textTransform: 'uppercase',
    fontFamily: Platform.OS === 'ios' ? 'Chalkboard SE' : 'monospace',
  },
  closeBtn: { padding: 2 },

  scroll: { maxHeight: 380 },
  scrollContent: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6 },

  // Diagram
  diagramWrap: {
    alignItems: 'center', paddingTop: 4, paddingBottom: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.18)',
    marginBottom: 6,
  },
  diagramLabel: {
    color: C.dim, fontSize: 11, letterSpacing: 0.6, marginBottom: 4,
    fontFamily: Platform.OS === 'ios' ? 'Chalkboard SE' : 'monospace',
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
  textDividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
  textDividerLabel: {
    color: 'rgba(255,255,255,0.3)', fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase',
  },

  // Chalk lines
  lineRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 9, gap: 8,
  },
  headingRow: {
    borderBottomWidth: 1, borderBottomColor: 'rgba(251,191,36,0.25)',
    paddingBottom: 5, marginBottom: 12,
  },
  equationRow: {
    backgroundColor: 'rgba(103,232,249,0.07)',
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
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
    height: 3, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 14, borderRadius: 2,
  },
  progressFill: {
    height: 3, backgroundColor: C.green, borderRadius: 2,
  },

  // Footer
  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 11,
    borderTopWidth: 2, borderTopColor: '#5c3d1e',
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  footerCenter: { flex: 1, alignItems: 'center' },
  footerHint: {
    color: 'rgba(255,255,255,0.3)', fontSize: 11, letterSpacing: 0.4,
  },
  skipBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  skipText: { color: 'rgba(255,255,255,0.4)', fontSize: 13 },
  nextBtn: { borderRadius: 22, overflow: 'hidden' },
  nextGrad: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 18, paddingVertical: 9,
  },
  nextText: { color: '#fff', fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },
});