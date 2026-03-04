/* eslint-disable i18next/no-literal-string */
import React from 'react';
import { Text, View } from 'react-native';
import type { ThemeColors } from '@/contexts/ThemeContext';
import type {
  ExamBlueprintAudit,
  ExamContextSummary,
  ExamScopeDiagnostics,
  ExamTeacherAlignmentSummary,
} from '@/components/exam-prep/types';
import { examGenerationStyles as styles } from '@/features/exam-generation/styles';

type ExamGenerationAuditCardProps = {
  blueprintAudit: ExamBlueprintAudit | null;
  contextSummary: ExamContextSummary | null;
  scopeDiagnostics: ExamScopeDiagnostics | null;
  teacherAlignment: ExamTeacherAlignmentSummary | null;
  theme: ThemeColors;
};

export function ExamGenerationAuditCard({
  blueprintAudit,
  contextSummary,
  scopeDiagnostics,
  teacherAlignment,
  theme,
}: ExamGenerationAuditCardProps): React.ReactElement | null {
  if (!contextSummary && !teacherAlignment && !blueprintAudit) {
    return null;
  }

  return (
    <View style={[styles.metaCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[styles.metaTitle, { color: theme.text }]}>Exam generation audit</Text>
      {contextSummary ? (
        <Text style={[styles.metaLine, { color: theme.muted }]}>
          Teacher context: {contextSummary.assignmentCount} assignments •{' '}
          {contextSummary.lessonCount} lessons
        </Text>
      ) : null}
      {teacherAlignment ? (
        <Text style={[styles.metaLine, { color: theme.muted }]}>
          Alignment score: {teacherAlignment.coverageScore}% • intent-tagged artifacts:{' '}
          {teacherAlignment.intentTaggedCount}
        </Text>
      ) : null}
      {blueprintAudit ? (
        <Text style={[styles.metaLine, { color: theme.muted }]}>
          Blueprint: {blueprintAudit.actualQuestions} questions ({blueprintAudit.minQuestions}-
          {blueprintAudit.maxQuestions}) • {blueprintAudit.totalMarks} marks
        </Text>
      ) : null}
      {scopeDiagnostics ? (
        <Text style={[styles.metaLine, { color: theme.muted }]}>
          Scope: student {scopeDiagnostics.effectiveStudentId || 'none'} • class{' '}
          {scopeDiagnostics.effectiveClassId || 'none'} • school{' '}
          {scopeDiagnostics.effectiveSchoolId || 'none'}
        </Text>
      ) : null}
    </View>
  );
}
