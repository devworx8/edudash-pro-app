/* eslint-disable i18next/no-literal-string */
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { QuotaRingWithStatus } from '@/components/ui/CircularQuotaRing';
import type { ThemeColors } from '@/contexts/ThemeContext';
import { examGenerationStyles as styles } from '@/features/exam-generation/styles';
import type { GenerationState } from '@/features/exam-generation/useExamGenerationController';

type ExamGenerationStatusStateProps = {
  contextSummary: { assignmentCount: number; lessonCount: number } | null;
  error: string | null;
  examQuotaLimit: number;
  examQuotaUsed: number;
  examQuotaWarning: string | null;
  generationLabel: string;
  state: GenerationState;
  theme: ThemeColors;
  useTeacherContext: boolean;
  onBack: () => void;
  onRetry: () => void;
};

export function ExamGenerationStatusState({
  contextSummary,
  error,
  examQuotaLimit,
  examQuotaUsed,
  examQuotaWarning,
  generationLabel,
  state,
  theme,
  useTeacherContext,
  onBack,
  onRetry,
}: ExamGenerationStatusStateProps) {
  if (state === 'loading') {
    return (
      <View style={styles.centerBlock}>
        <EduDashSpinner color={theme.primary} />
        <Text style={[styles.loadingTitle, { color: theme.text }]}>Please wait...</Text>
        <Text style={[styles.loadingText, { color: theme.muted }]}>{generationLabel}</Text>
        <Text style={[styles.loadingSubtext, { color: theme.muted }]}>
          Using {useTeacherContext ? 'teacher artifacts + CAPS' : 'CAPS baseline'} to build this paper.
        </Text>
        {examQuotaLimit > 0 ? (
          <View style={{ marginTop: 24 }}>
            <QuotaRingWithStatus
              featureName="Exam prep"
              used={examQuotaUsed}
              limit={examQuotaLimit}
              isGenerating
              size={70}
            />
          </View>
        ) : null}
        {examQuotaWarning ? (
          <Text style={[styles.quotaWarningText, { color: theme.warning }]}>{examQuotaWarning}</Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.centerBlock}>
      <View style={[styles.errorIconWrap, { backgroundColor: `${theme.error}22` }]}>
        <Ionicons name="alert-circle" size={28} color={theme.error} />
      </View>
      <Text style={[styles.errorTitle, { color: theme.text }]}>Generation failed</Text>
      <Text style={[styles.errorText, { color: theme.muted }]}>{error || 'Please try again.'}</Text>
      {examQuotaWarning ? (
        <Text style={[styles.quotaWarningText, { color: theme.warning }]}>{examQuotaWarning}</Text>
      ) : null}
      {contextSummary ? (
        <Text style={[styles.contextNote, { color: theme.muted }]}>
          Context found: {contextSummary.assignmentCount} assignments • {contextSummary.lessonCount} lessons
        </Text>
      ) : null}

      <View style={styles.errorButtons}>
        <TouchableOpacity
          style={[styles.secondaryButton, { borderColor: theme.border }]}
          onPress={onBack}
        >
          <Text style={[styles.secondaryButtonText, { color: theme.text }]}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.primaryButton, { backgroundColor: theme.primary }]} onPress={onRetry}>
          <Text style={styles.primaryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
