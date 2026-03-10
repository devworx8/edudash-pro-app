/**
 * DashTutorWhiteboardEnhanced - Enhanced Whiteboard with Math Rendering
 *
 * Premium whiteboard for K-12 education with:
 * - KaTeX/LaTeX math equation rendering
 * - Visual diagrams (long division, fractions, etc.)
 * - Step-by-step animations
 * - TTS integration - reads from whiteboard content
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  AccessibilityInfo,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { PREMIUM_COLORS } from '@/lib/theme/premiumDashTheme';
import { LongDivisionDiagram, FractionDiagram } from './math-diagrams';
import { ChalkLine, classifyLine, detectDiagramType } from './whiteboard';
import { MathText } from './KaTeXRenderer';

// =============================================================================
// Types
// =============================================================================

export interface WhiteboardContent {
  raw: string;
  lines: string[];
}

export interface DashTutorWhiteboardEnhancedProps {
  content: WhiteboardContent;
  onDismiss: () => void;
  onUnderstood?: () => void;
  onTTSRead?: (text: string) => void;
}

// =============================================================================
// Main Component
// =============================================================================

export function DashTutorWhiteboardEnhanced({
  content,
  onDismiss,
  onUnderstood,
  onTTSRead,
}: DashTutorWhiteboardEnhancedProps) {
  const [step, setStep] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  // Detect diagram type
  const diagram = useMemo(() => detectDiagramType(content.lines), [content.lines]);
  const hasDiagram = diagram !== null;

  // Calculate total steps
  const diagramSteps =
    hasDiagram && diagram?.type === 'long-division' && diagram.data
      ? (diagram.data as any).steps?.length || 1
      : 1;
  const textLines = content.lines;
  const totalSteps = hasDiagram ? diagramSteps + textLines.length : textLines.length;
  const allDone = step >= totalSteps - 1;

  // Handle next step
  const handleNext = useCallback(() => {
    if (allDone) {
      onUnderstood?.();
      onDismiss();
    } else {
      setStep((s) => s + 1);
    }
  }, [allDone, onDismiss, onUnderstood]);

  // Auto-scroll
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [step]);

  // Announce for screen readers
  useEffect(() => {
    if (step > 0 && textLines[step]) {
      AccessibilityInfo.announceForAccessibility(textLines[step]);
      onTTSRead?.(textLines[step]);
    }
  }, [step, textLines, onTTSRead]);

  // Diagram rendering state
  const diagramRevealed = hasDiagram ? Math.min(step, diagramSteps) : 0;
  const textRevealed = hasDiagram ? Math.max(0, step - diagramSteps) : step + 1;
  const visibleLines = textLines.slice(0, textRevealed);

  // Progress calculation
  const progressFrac = totalSteps > 0 ? step / (totalSteps - 1) : 1;

  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.overlay}>
      <BlurView intensity={35} tint="dark" style={StyleSheet.absoluteFill} />

      <Animated.View entering={FadeInDown.duration(300).springify()} style={styles.board}>
        {/* Board background */}
        <LinearGradient
          colors={['#1a3a2a', '#162e22', '#0f2018']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        {/* Header */}
        <View style={styles.tray}>
          <View style={styles.trayLeft}>
            <Ionicons name="school-outline" size={16} color={PREMIUM_COLORS.chalkGreen} />
            <Text style={styles.trayTitle}>Dash Board</Text>
          </View>
          <TouchableOpacity onPress={onDismiss} style={styles.closeBtn}>
            <Ionicons name="close-circle" size={22} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Diagram section */}
          {hasDiagram && diagram?.type === 'long-division' && diagram.data && (
            <View style={styles.diagramWrap}>
              <Text style={styles.diagramLabel}>
                {(diagram.data as any).dividend} ÷ {(diagram.data as any).divisor}
              </Text>
              <LongDivisionDiagram data={diagram.data as any} revealed={diagramRevealed} />
            </View>
          )}

          {hasDiagram && diagram?.type === 'fraction' && diagram.data && (
            <View style={styles.diagramWrap}>
              <FractionDiagram data={diagram.data as any} revealed={diagramRevealed >= 1} />
            </View>
          )}

          {/* Text explanation */}
          {visibleLines.length > 0 && (
            <View style={styles.textSection}>
              {visibleLines.map((line, i) => (
                <ChalkLine
                  key={i}
                  line={line}
                  index={i}
                  kind={classifyLine(line)}
                  onReveal={() => onTTSRead?.(line)}
                />
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
              colors={allDone ? ['#22c55e', '#16a34a'] : ['#8b5cf6', '#6366f1']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.nextGrad}
            >
              <Ionicons
                name={allDone ? 'checkmark-circle' : 'arrow-forward-circle'}
                size={18}
                color="#fff"
              />
              <Text style={styles.nextText}>{allDone ? 'Got it!' : 'Next'}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

// =============================================================================
// Styles
// =============================================================================

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    padding: 16,
  },
  board: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '88%',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 6,
    borderColor: '#5c3d1e',
  },
  tray: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#5c3d1e',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  trayLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trayTitle: {
    color: PREMIUM_COLORS.chalkGreen,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontFamily: Platform.OS === 'ios' ? 'Chalkboard SE' : 'monospace',
  },
  closeBtn: { padding: 2 },
  scroll: { maxHeight: 400 },
  scrollContent: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 8 },
  diagramWrap: {
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.2)',
    marginBottom: 8,
  },
  diagramLabel: {
    color: PREMIUM_COLORS.chalkWhite,
    fontSize: 12,
    letterSpacing: 0.6,
    marginBottom: 6,
    opacity: 0.6,
    fontFamily: Platform.OS === 'ios' ? 'Chalkboard SE' : 'monospace',
  },
  textSection: { paddingTop: 6 },
  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: 14,
    borderRadius: 2,
  },
  progressFill: {
    height: 3,
    backgroundColor: PREMIUM_COLORS.chalkGreen,
    borderRadius: 2,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 2,
    borderTopColor: '#5c3d1e',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  footerCenter: { flex: 1, alignItems: 'center' },
  footerHint: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    letterSpacing: 0.4,
    fontFamily: Platform.OS === 'ios' ? 'Chalkboard SE' : 'monospace',
  },
  skipBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  skipText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Chalkboard SE' : 'monospace',
  },
  nextBtn: { borderRadius: 24, overflow: 'hidden' },
  nextGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  nextText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
    fontFamily: Platform.OS === 'ios' ? 'Chalkboard SE' : 'monospace',
  },
});
