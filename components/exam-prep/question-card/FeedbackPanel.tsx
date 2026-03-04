import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ExamQuestion } from '@/lib/examParser';
import type { StudentAnswer } from '@/hooks/useExamSession';
import { MathRenderer } from '@/components/ai/dash-assistant/MathRenderer';
import { containsMathSyntax } from '@/components/exam-prep/mathSegments';
import { isComplexInlineMath } from '@/components/exam-prep/question-card/helpers';
import { questionCardStyles as styles } from '@/components/exam-prep/question-card/styles';

type FeedbackPanelProps = {
  correctAnswerMath: { expression: string; displayMode: boolean } | null;
  feedbackMath: { expression: string; displayMode: boolean } | null;
  question: ExamQuestion;
  resolvedCorrectAnswerDisplay: string;
  studentAnswer?: StudentAnswer;
  theme: Record<string, string>;
  renderRichMathText: (value: string, textStyle: any, textColor: string) => React.ReactNode;
};

export function FeedbackPanel({
  correctAnswerMath,
  feedbackMath,
  question,
  resolvedCorrectAnswerDisplay,
  studentAnswer,
  theme,
  renderRichMathText,
}: FeedbackPanelProps) {
  if (!studentAnswer?.feedback) return null;

  return (
    <View
      style={[
        styles.feedbackCard,
        {
          backgroundColor: studentAnswer.isCorrect ? '#10b98120' : '#ef444420',
          borderColor: studentAnswer.isCorrect ? '#10b981' : '#ef4444',
        },
      ]}
    >
      <View style={styles.feedbackHeader}>
        <Ionicons
          name={studentAnswer.isCorrect ? 'checkmark-circle' : 'close-circle'}
          size={24}
          color={studentAnswer.isCorrect ? '#10b981' : '#ef4444'}
        />
        <Text
          style={[
            styles.feedbackTitle,
            { color: studentAnswer.isCorrect ? '#10b981' : '#ef4444' },
          ]}
        >
          {studentAnswer.isCorrect ? 'Correct!' : 'Incorrect'}
        </Text>
        {studentAnswer.marks !== undefined && (
          <Text
            style={[
              styles.feedbackMarks,
              { color: studentAnswer.isCorrect ? '#10b981' : '#ef4444' },
            ]}
          >
            {studentAnswer.marks}/{question.marks}
          </Text>
        )}
      </View>

      {feedbackMath ? (
        <MathRenderer
          expression={feedbackMath.expression}
          displayMode={feedbackMath.displayMode || isComplexInlineMath(feedbackMath.expression)}
        />
      ) : containsMathSyntax(studentAnswer.feedback || '') ? (
        renderRichMathText(studentAnswer.feedback || '', styles.feedbackText, theme.text)
      ) : (
        <Text style={[styles.feedbackText, { color: theme.text }]}>{studentAnswer.feedback}</Text>
      )}

      {!studentAnswer.isCorrect && (question.correctAnswer || question.correctOptionId) && (
        <View style={styles.correctAnswerRow}>
          <Text style={[styles.correctAnswerLabel, { color: '#10b981' }]}>Correct answer:</Text>
          {correctAnswerMath ? (
            <MathRenderer
              expression={correctAnswerMath.expression}
              displayMode={
                correctAnswerMath.displayMode || isComplexInlineMath(correctAnswerMath.expression)
              }
            />
          ) : containsMathSyntax(
              resolvedCorrectAnswerDisplay || question.correctAnswer || question.correctOptionId || '',
            ) ? (
            renderRichMathText(
              resolvedCorrectAnswerDisplay || question.correctAnswer || question.correctOptionId || '',
              styles.correctAnswerValue,
              theme.text,
            )
          ) : (
            <Text style={[styles.correctAnswerValue, { color: theme.text }]}>
              {resolvedCorrectAnswerDisplay || question.correctAnswer || question.correctOptionId}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
