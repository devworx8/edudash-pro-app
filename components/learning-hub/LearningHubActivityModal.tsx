/**
 * LearningHubActivityModal — Step-by-step activity modal
 * 
 * Renders the bottom-sheet modal with current step, options,
 * path board, feedback, AI hint button, and next/complete CTA.
 * 
 * ≤160 lines — WARP-compliant presentational component.
 */

import React, { memo } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { LearningHubPathBoard } from './LearningHubPathBoard';
import type { ActivityCard, ActivityStep, StepOption } from '@/lib/activities/preschoolLearningHub.data';
import type { StepFeedback } from '@/hooks/useLearningHubActivity';
import { percentWidth } from '@/lib/progress/clampPercent';

interface LearningHubActivityModalProps {
  activity: ActivityCard | null;
  currentStep: ActivityStep | null;
  stepIndex: number;
  selectedOptionId: string | null;
  selectedOption: StepOption | null;
  stepFeedback: StepFeedback | null;
  isAdvancing: boolean;
  onClose: () => void;
  onOptionSelect: (optionId: string) => void;
  onNextStep: () => void;
  onAiHint: () => void;
}

export const LearningHubActivityModal = memo(function LearningHubActivityModal({
  activity,
  currentStep,
  stepIndex,
  selectedOptionId,
  selectedOption,
  stepFeedback,
  isAdvancing,
  onClose,
  onOptionSelect,
  onNextStep,
  onAiHint,
}: LearningHubActivityModalProps) {
  const { theme } = useTheme();

  return (
    <Modal visible={!!activity} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          {activity && currentStep ? (
            <>
              <View style={styles.header}>
                <Text style={[styles.title, { color: theme.text }]}>{activity.title}</Text>
                <TouchableOpacity onPress={onClose}>
                  <Ionicons name="close" size={20} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                Step {stepIndex + 1} of {activity.steps.length}
              </Text>
              <View style={[styles.progressTrack, { backgroundColor: theme.elevated }]}>
                <View
                  style={[
                    styles.progressFill,
                    { backgroundColor: theme.primary, width: percentWidth(Math.round(((stepIndex + 1) / Math.max(activity.steps.length, 1)) * 100)) },
                  ]}
                />
              </View>

              <Text style={[styles.stepTitle, { color: theme.text }]}>{currentStep.title}</Text>
              <Text style={[styles.stepPrompt, { color: theme.textSecondary }]}>{currentStep.prompt}</Text>

              {currentStep.board && (
                <LearningHubPathBoard board={currentStep.board} selectedOption={selectedOption} />
              )}

              {!!currentStep.options?.length && (
                <View style={styles.optionsList}>
                  {currentStep.options.map((option, index) => {
                    const isSelected = selectedOptionId === option.id;
                    return (
                      <TouchableOpacity
                        key={option.id}
                        style={[styles.optionChip, { borderColor: isSelected ? theme.primary : theme.border, backgroundColor: isSelected ? `${theme.primary}22` : theme.elevated }]}
                        onPress={() => onOptionSelect(option.id)}
                      >
                        <View style={[styles.optionBadge, { backgroundColor: `${theme.primary}22` }]}>
                          <Text style={[styles.optionBadgeText, { color: theme.primary }]}>{String.fromCharCode(65 + index)}</Text>
                        </View>
                        <Text style={[styles.optionText, { color: isSelected ? theme.primary : theme.text }]}>{option.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {!!stepFeedback && (
                <View style={[
                  styles.feedbackCard,
                  stepFeedback.type === 'error' ? styles.feedbackError : stepFeedback.type === 'success' ? styles.feedbackSuccess : { borderColor: theme.border, backgroundColor: theme.elevated },
                ]}>
                  <Text style={styles.feedbackText}>{stepFeedback.text}</Text>
                </View>
              )}

              {!!activity.aiPrompt && (
                <TouchableOpacity style={[styles.aiHintButton, { backgroundColor: theme.primary }]} onPress={onAiHint}>
                  <Ionicons name="sparkles" size={16} color="#fff" />
                  <Text style={[styles.aiHintText, { color: theme.onPrimary }]}>Ask Dash AI</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.nextButton, { backgroundColor: theme.success }, isAdvancing && styles.nextButtonDisabled]}
                onPress={onNextStep}
                disabled={isAdvancing}
              >
                <Text style={[styles.nextButtonText, { color: theme.onPrimary }]}>
                  {currentStep.confirmOnly
                    ? stepIndex === activity.steps.length - 1 ? 'Complete' : 'Done'
                    : stepIndex === activity.steps.length - 1 ? 'Complete' : 'Next'}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <EduDashSpinner size="large" color={theme.primary} />
          )}
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  card: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 12, maxHeight: '92%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 20, fontWeight: '800', flex: 1 },
  subtitle: { fontSize: 12, fontWeight: '600' },
  progressTrack: { height: 8, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: 8 },
  stepTitle: { fontSize: 17, fontWeight: '800' },
  stepPrompt: { fontSize: 14, lineHeight: 20 },
  optionsList: { gap: 8, marginTop: 2 },
  optionChip: { borderRadius: 12, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  optionBadge: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  optionBadgeText: { fontSize: 12, fontWeight: '800' },
  optionText: { flex: 1, fontSize: 15, fontWeight: '700' },
  feedbackCard: { borderRadius: 10, borderWidth: 1, padding: 10, marginTop: 2 },
  feedbackSuccess: { borderColor: '#16A34A', backgroundColor: '#DCFCE7' },
  feedbackError: { borderColor: '#DC2626', backgroundColor: '#FEE2E2' },
  feedbackText: { color: '#1F2937', fontSize: 13, lineHeight: 18, fontWeight: '700' },
  aiHintButton: { borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  aiHintText: { fontSize: 14, fontWeight: '800' },
  nextButton: { borderRadius: 12, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  nextButtonDisabled: { opacity: 0.7 },
  nextButtonText: { fontSize: 15, fontWeight: '800' },
});

export default LearningHubActivityModal;
