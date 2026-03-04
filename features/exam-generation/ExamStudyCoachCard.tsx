/* eslint-disable i18next/no-literal-string */
import React from 'react';
import { Text, View } from 'react-native';
import type { ThemeColors } from '@/contexts/ThemeContext';
import type { ExamStudyCoachPack } from '@/components/exam-prep/types';
import { examGenerationStyles as styles } from '@/features/exam-generation/styles';

type ExamStudyCoachCardProps = {
  studyCoachPack: ExamStudyCoachPack | null;
  theme: ThemeColors;
};

export function ExamStudyCoachCard({
  studyCoachPack,
  theme,
}: ExamStudyCoachCardProps): React.ReactElement | null {
  if (!studyCoachPack) return null;

  return (
    <View style={[styles.studyCoachCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[styles.metaTitle, { color: theme.text }]}>
        {studyCoachPack.planTitle || '4-day study coach + test day'}
      </Text>
      {studyCoachPack.days?.slice(0, 2).map((day) => (
        <View key={day.day} style={styles.studyCoachRow}>
          <Text style={[styles.studyCoachDay, { color: theme.primary }]}>{day.day}</Text>
          <View style={styles.studyCoachCopy}>
            <Text style={[styles.studyCoachFocus, { color: theme.text }]}>{day.focus}</Text>
            <Text style={[styles.studyCoachHint, { color: theme.muted }]} numberOfLines={2}>
              Reading: {day.readingPiece}
            </Text>
            <Text style={[styles.studyCoachHint, { color: theme.muted }]} numberOfLines={2}>
              Paper drill: {day.paperWritingDrill}
            </Text>
            <Text style={[styles.studyCoachHint, { color: theme.muted }]} numberOfLines={2}>
              Memory: {day.memoryActivity}
            </Text>
          </View>
        </View>
      ))}
      {studyCoachPack.testDayChecklist?.length ? (
        <Text style={[styles.metaLine, { color: theme.muted }]}>
          Test-day checklist: {studyCoachPack.testDayChecklist.slice(0, 3).join(' • ')}
        </Text>
      ) : null}
    </View>
  );
}
