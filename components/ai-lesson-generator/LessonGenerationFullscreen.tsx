import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/contexts/ThemeContext';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { clampPercent, percentWidth } from '@/lib/progress/clampPercent';
import type { LessonPlanV2 } from '@/lib/ai/lessonPlanSchema';

type FooterAction = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'secondary' | 'danger';
};

export type LessonGenerationFullscreenProps = {
  visible: boolean;
  isGenerating: boolean;
  progress: number;
  phase: string;
  progressMessage?: string;
  plan: LessonPlanV2 | null;
  rawContent?: string;
  supplementarySections?: Array<{ title: string; body: string }>;
  footerActions?: FooterAction[];
  onCancel?: () => void;
  onClose: () => void;
};

const PHASES = [
  { id: 'init', label: 'Initialize' },
  { id: 'quota_check', label: 'Quota check' },
  { id: 'request', label: 'Request model' },
  { id: 'parse', label: 'Parse response' },
  { id: 'complete', label: 'Complete' },
];

function phaseIndex(phase: string): number {
  const idx = PHASES.findIndex((item) => item.id === phase);
  return idx === -1 ? 0 : idx;
}

export function LessonGenerationFullscreen({
  visible,
  isGenerating,
  progress,
  phase,
  progressMessage,
  plan,
  rawContent,
  supplementarySections,
  footerActions,
  onCancel,
  onClose,
}: LessonGenerationFullscreenProps) {
  const { theme } = useTheme();
  const percent = clampPercent(progress, { source: 'LessonGenerationFullscreen.progress' });
  const activePhaseIndex = phaseIndex(phase);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]}>
            {isGenerating ? 'Generating lesson...' : 'Lesson details'}
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn} accessibilityRole="button" accessibilityLabel="Close lesson detail">
            <Ionicons name="close" size={20} color={theme.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.phaseWrap}>
          <View
            style={[styles.track, { backgroundColor: theme.border }]}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(percent) }}
          >
            <View style={[styles.fill, { width: percentWidth(percent), backgroundColor: theme.primary }]} />
          </View>
          <Text style={[styles.phaseText, { color: theme.textSecondary }]}>
            {Math.round(percent)}% • {progressMessage || PHASES[activePhaseIndex]?.label || 'Processing'}
          </Text>
          <View style={styles.phaseRow}>
            {PHASES.map((item, idx) => {
              const done = idx < activePhaseIndex || (!isGenerating && idx <= activePhaseIndex);
              return (
                <View key={item.id} style={styles.phaseItem}>
                  <View
                    style={[
                      styles.phaseDot,
                      {
                        backgroundColor: done ? theme.primary : theme.border,
                      },
                    ]}
                  />
                  <Text style={[styles.phaseLabel, { color: done ? theme.text : theme.textSecondary }]}>
                    {item.label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {isGenerating && (
            <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]}>
              <View style={styles.row}>
                <EduDashSpinner color={theme.primary} />
                <Text style={[styles.panelTitle, { color: theme.text }]}>Building your lesson plan</Text>
              </View>
              <Text style={[styles.bodyText, { color: theme.textSecondary }]}>
                Dash is generating step-by-step teaching instructions with worked examples.
              </Text>
              {onCancel && (
                <TouchableOpacity
                  onPress={onCancel}
                  style={[styles.cancelBtn, { borderColor: theme.error || '#ef4444' }]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.cancelText, { color: theme.error || '#ef4444' }]}>Cancel generation</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {!isGenerating && plan && (
            <>
              <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                <Text style={[styles.planTitle, { color: theme.text }]}>{plan.title}</Text>
                <Text style={[styles.bodyText, { color: theme.textSecondary }]}>{plan.summary}</Text>
                <Text style={[styles.meta, { color: theme.textSecondary }]}>
                  Duration: {plan.durationMinutes} min • Source: {plan.sourceFormat === 'json' ? 'Structured JSON' : 'Markdown fallback'}
                </Text>
              </View>

              <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Objectives</Text>
                {plan.objectives.map((item, idx) => (
                  <Text key={`objective-${idx}`} style={[styles.listItem, { color: theme.textSecondary }]}>• {item}</Text>
                ))}
              </View>

              <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Materials</Text>
                {plan.materials.map((item, idx) => (
                  <Text key={`material-${idx}`} style={[styles.listItem, { color: theme.textSecondary }]}>• {item}</Text>
                ))}
              </View>

              <View style={styles.stepsWrap}>
                {plan.steps.map((step, idx) => (
                  <View key={`${step.title}-${idx}`} style={[styles.stepCard, { borderColor: theme.primary + '40', backgroundColor: theme.surface }]}>
                    <View style={styles.stepHeader}>
                      <Text style={[styles.stepTitle, { color: theme.text }]}>{idx + 1}. {step.title}</Text>
                      <Text style={[styles.stepTime, { color: theme.primary }]}>{step.minutes} min</Text>
                    </View>
                    <Text style={[styles.bodyText, { color: theme.textSecondary }]}>Objective: {step.objective}</Text>
                    <Text style={[styles.subTitle, { color: theme.text }]}>Instructions</Text>
                    {step.instructions.map((instruction, instructionIdx) => (
                      <Text key={`${step.title}-instruction-${instructionIdx}`} style={[styles.listItem, { color: theme.textSecondary }]}>
                        • {instruction}
                      </Text>
                    ))}
                    <Text style={[styles.subTitle, { color: theme.text }]}>Teacher Prompt</Text>
                    <Text style={[styles.bodyText, { color: theme.textSecondary }]}>{step.teacherPrompt}</Text>
                    <Text style={[styles.subTitle, { color: theme.text }]}>Worked Example</Text>
                    <Text style={[styles.bodyText, { color: theme.textSecondary }]}>{step.example}</Text>
                  </View>
                ))}
              </View>

              <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Assessment</Text>
                {plan.assessment.map((item, idx) => (
                  <Text key={`assessment-${idx}`} style={[styles.listItem, { color: theme.textSecondary }]}>• {item}</Text>
                ))}
              </View>

              <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Differentiation</Text>
                <Text style={[styles.bodyText, { color: theme.textSecondary }]}>
                  Support: {plan.differentiation.support}
                </Text>
                <Text style={[styles.bodyText, { color: theme.textSecondary }]}>
                  Extension: {plan.differentiation.extension}
                </Text>
              </View>

              <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Closure</Text>
                <Text style={[styles.bodyText, { color: theme.textSecondary }]}>{plan.closure}</Text>
              </View>

              {(supplementarySections || []).map((section) => (
                <View key={section.title} style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>{section.title}</Text>
                  <Text style={[styles.bodyText, { color: theme.textSecondary }]}>{section.body}</Text>
                </View>
              ))}

              {!!rawContent && (
                <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>Raw Response</Text>
                  <Text style={[styles.rawText, { color: theme.textSecondary }]}>{rawContent}</Text>
                </View>
              )}
            </>
          )}
        </ScrollView>

        {!!footerActions?.length && (
          <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
            {footerActions.map((action) => {
              const tone = action.tone || 'primary';
              const backgroundColor =
                tone === 'primary'
                  ? theme.primary
                  : tone === 'danger'
                    ? theme.error || '#ef4444'
                    : theme.surface;
              const textColor =
                tone === 'secondary'
                  ? theme.text
                  : theme.onPrimary || '#fff';
              return (
                <TouchableOpacity
                  key={action.label}
                  onPress={action.onPress}
                  disabled={action.disabled}
                  style={[
                    styles.footerBtn,
                    {
                      backgroundColor,
                      borderColor: tone === 'secondary' ? theme.border : backgroundColor,
                      opacity: action.disabled ? 0.5 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.footerBtnText, { color: textColor }]}>{action.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  phaseWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 8,
  },
  track: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
  },
  phaseText: {
    fontSize: 12,
    fontWeight: '600',
  },
  phaseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  phaseItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  phaseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  phaseLabel: {
    fontSize: 10,
    textAlign: 'center',
  },
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 120,
  },
  panel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  panelTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  planTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  subTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  bodyText: {
    fontSize: 13,
    lineHeight: 20,
  },
  rawText: {
    fontSize: 12,
    lineHeight: 18,
  },
  listItem: {
    fontSize: 13,
    lineHeight: 20,
  },
  meta: {
    fontSize: 11,
  },
  stepsWrap: {
    gap: 10,
  },
  stepCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 4,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  stepTitle: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  stepTime: {
    fontSize: 11,
    fontWeight: '700',
  },
  cancelBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  cancelText: {
    fontSize: 12,
    fontWeight: '700',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 14,
    flexDirection: 'row',
    gap: 8,
  },
  footerBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
});

export default LessonGenerationFullscreen;

