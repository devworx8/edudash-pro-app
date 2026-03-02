/**
 * ExamInteractiveView Component
 *
 * Interactive exam display for mobile app with:
 * - Question navigation with progress dots
 * - Auto-submit for MC / True-False, explicit submit for text
 * - Auto-grading with improved feedback
 * - Progress tracking with elapsed timer
 * - CAPS curriculum badge
 *
 * Decomposed into ExamHeader, ExamQuestionCard, ExamFooter.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ParsedExam, ExamQuestion, ExamSection } from '@/lib/examParser';
import { useExamSession, StudentAnswer } from '@/hooks/useExamSession';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/lib/logger';
import { clampPercent } from '@/lib/progress/clampPercent';
import { ExamHeader } from './ExamHeader';
import { ExamQuestionCard } from './ExamQuestionCard';
import { ExamFooter } from './ExamFooter';

interface ExamInteractiveViewProps {
  exam: ParsedExam;
  examId: string;
  examLanguage?: string;
  studentId?: string;
  classId?: string;
  schoolId?: string;
  retakeMode?: boolean;
  onComplete?: (results: ExamResults) => void;
  onExit?: () => void;
}

export interface ExamResults {
  examId: string;
  examTitle: string;
  totalMarks: number;
  earnedMarks: number;
  percentage: number;
  answers: Record<string, StudentAnswer>;
  completedAt: string;
  duration: number;
}

const AUTO_SUBMIT_TYPES: ExamQuestion['type'][] = ['multiple_choice', 'true_false'];

export function ExamInteractiveView({
  exam,
  examId,
  examLanguage,
  studentId,
  classId,
  schoolId,
  retakeMode = false,
  onComplete,
  onExit,
}: ExamInteractiveViewProps) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const {
    session,
    loading: sessionLoading,
    submitAnswer,
    goToQuestion,
    completeExam,
    resetExam,
    getProgress,
  } = useExamSession({
    examId,
    exam,
    userId: user?.id,
    studentId,
    classId,
    schoolId,
    autoSave: true,
  });

  const [currentAnswer, setCurrentAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uiNotice, setUiNotice] = useState<{ type: 'info' | 'success' | 'warning' | 'error'; text: string } | null>(null);
  const [confirmIncompleteSubmit, setConfirmIncompleteSubmit] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);

  const allQuestions = useMemo(() => {
    return exam.sections.reduce<Array<{ section: ExamSection; question: ExamQuestion }>>((acc, section) => {
      section.questions.forEach(question => {
        acc.push({ section, question });
      });
      return acc;
    }, []);
  }, [exam]);

  // When retake mode, reset session on mount so user starts fresh
  useEffect(() => {
    if (retakeMode && resetExam) {
      resetExam();
    }
  }, [retakeMode, resetExam]);

  const currentQuestionData = allQuestions[session?.currentQuestionIndex || 0];
  const currentQuestion = currentQuestionData?.question;
  const currentSection = currentQuestionData?.section;

  const currentStudentAnswer = session?.answers[currentQuestion?.id || ''];

  const hasAnswered = useMemo(
    () => Object.keys(session?.answers || {}).length > 0,
    [session?.answers],
  );

  const answeredIndexSet = useMemo(() => {
    if (!session) return new Set<number>();
    const set = new Set<number>();
    allQuestions.forEach(({ question }, i) => {
      if (session.answers[question.id]) set.add(i);
    });
    return set;
  }, [session, allQuestions]);

  React.useEffect(() => {
    if (currentStudentAnswer) {
      setCurrentAnswer(currentStudentAnswer.answer);
    } else {
      setCurrentAnswer('');
    }
  }, [currentQuestion?.id, currentStudentAnswer]);

  /**
   * Core submit logic shared by explicit Submit and auto-submit.
   */
  const doSubmitAnswer = useCallback(async (answer: string, selectedOptionId?: string) => {
    if (!currentQuestion || !answer.trim()) return;

    try {
      setSubmitting(true);
      const result = await submitAnswer(currentQuestion.id, answer, true, selectedOptionId);

      setUiNotice({
        type: result?.isCorrect ? 'success' : 'info',
        text: result?.feedback || 'Answer submitted.',
      });

      logger.info('[ExamView] Answer submitted', {
        questionId: currentQuestion.id,
        isCorrect: result?.isCorrect,
      });
    } catch (error) {
      logger.error('[ExamView] Failed to submit answer', { error });
      setUiNotice({ type: 'error', text: 'Failed to submit answer. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  }, [currentQuestion, submitAnswer]);

  const handleSubmitAnswer = useCallback(() => {
    doSubmitAnswer(currentAnswer);
  }, [doSubmitAnswer, currentAnswer]);

  /**
   * Auto-submit for MC and True/False: select + grade immediately.
   */
  const handleSelectOption = useCallback((option: string, optionId?: string) => {
    setCurrentAnswer(option);
    if (currentQuestion && AUTO_SUBMIT_TYPES.includes(currentQuestion.type)) {
      doSubmitAnswer(option, optionId);
    }
  }, [currentQuestion, doSubmitAnswer]);

  /**
   * Auto-save current text answer (if any) before navigating.
   */
  const autoSaveBeforeNav = useCallback(async () => {
    if (
      currentQuestion &&
      currentAnswer.trim() &&
      !AUTO_SUBMIT_TYPES.includes(currentQuestion.type) &&
      !currentStudentAnswer
    ) {
      await doSubmitAnswer(currentAnswer);
    }
  }, [currentQuestion, currentAnswer, currentStudentAnswer, doSubmitAnswer]);

  const handleNext = useCallback(async () => {
    await autoSaveBeforeNav();
    const nextIndex = (session?.currentQuestionIndex || 0) + 1;
    if (nextIndex < allQuestions.length) {
      goToQuestion(nextIndex);
      setUiNotice(null);
      setConfirmIncompleteSubmit(false);
      setConfirmExit(false);
    }
  }, [session, allQuestions, goToQuestion, autoSaveBeforeNav]);

  const handlePrevious = useCallback(async () => {
    await autoSaveBeforeNav();
    const prevIndex = (session?.currentQuestionIndex || 0) - 1;
    if (prevIndex >= 0) {
      goToQuestion(prevIndex);
      setUiNotice(null);
      setConfirmIncompleteSubmit(false);
      setConfirmExit(false);
    }
  }, [session, goToQuestion, autoSaveBeforeNav]);

  const handleCompleteExam = useCallback(async () => {
    const answeredCount = Object.keys(session?.answers || {}).length;
    const totalCount = allQuestions.length;

    if (answeredCount < totalCount && !confirmIncompleteSubmit) {
      setConfirmIncompleteSubmit(true);
      setUiNotice({
        type: 'warning',
        text: `You answered ${answeredCount} of ${totalCount}. Tap Complete again to submit now.`,
      });
      return;
    }

    const completedSession = await completeExam();
    if (completedSession && onComplete) {
      const startTime = new Date(completedSession.startedAt).getTime();
      const endTime = new Date(completedSession.completedAt || new Date().toISOString()).getTime();
      const duration = Math.floor((endTime - startTime) / 1000);
      const safeTotalMarks = Math.max(1, completedSession.totalMarks || 0);

      const results: ExamResults = {
        examId: completedSession.examId,
        examTitle: exam.title,
        totalMarks: safeTotalMarks,
        earnedMarks: completedSession.earnedMarks,
        percentage: Math.round((completedSession.earnedMarks / safeTotalMarks) * 100),
        answers: completedSession.answers,
        completedAt: completedSession.completedAt || new Date().toISOString(),
        duration,
      };

      if (completedSession.persistenceWarning) {
        setUiNotice({ type: 'warning', text: completedSession.persistenceWarning });
      } else {
        setUiNotice({
          type: 'success',
          text: `Exam submitted. Score: ${results.percentage}% (${results.earnedMarks}/${results.totalMarks}).`,
        });
      }
      onComplete(results);
    }
  }, [session, allQuestions, exam, completeExam, onComplete, confirmIncompleteSubmit]);

  const handleExit = useCallback(() => {
    if (!confirmExit) {
      setConfirmExit(true);
      setUiNotice({
        type: 'warning',
        text: 'Tap close again to exit. Your progress stays saved.',
      });
      return;
    }
    if (onExit) onExit();
  }, [confirmExit, onExit]);

  if (sessionLoading || !session || !currentQuestion) {
    return (
      <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: theme.background }]}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Loading exam...
        </Text>
      </SafeAreaView>
    );
  }

  const currentIndex = session.currentQuestionIndex;
  const totalQuestions = allQuestions.length;

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar style="light" />
      <ExamHeader
        title={exam.title}
        currentIndex={currentIndex}
        totalQuestions={totalQuestions}
        totalMarks={session.totalMarks}
        earnedMarks={session.earnedMarks}
        hasAnswered={hasAnswered}
        answeredSet={answeredIndexSet}
        startedAt={session.startedAt}
        onExit={handleExit}
        theme={theme as unknown as Record<string, string>}
      />

      {/* Progress Bar */}
      <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
        <View
          style={[
            styles.progressFill,
            {
              backgroundColor: theme.primary,
              width: `${clampPercent(getProgress(), {
                source: 'ExamInteractiveView.progress',
              })}%`,
            },
          ]}
        />
      </View>

      {/* Content — keyboard-aware so Show Work composer stays visible */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
        >
          <ExamQuestionCard
          section={currentSection}
          question={currentQuestion}
          examLanguage={examLanguage}
          currentIndex={currentIndex}
          currentAnswer={currentAnswer}
          studentAnswer={currentStudentAnswer}
          isLocked={!!currentStudentAnswer}
          onChangeAnswer={setCurrentAnswer}
          onSelectOption={handleSelectOption}
          theme={theme as unknown as Record<string, string>}
        />
        </ScrollView>

        <ExamFooter
        currentIndex={currentIndex}
        totalQuestions={totalQuestions}
        questionType={currentQuestion.type}
        currentAnswer={currentAnswer}
        hasExistingAnswer={!!currentStudentAnswer}
        submitting={submitting}
        uiNotice={uiNotice}
        onPrevious={handlePrevious}
        onNext={handleNext}
        onSubmitAnswer={handleSubmitAnswer}
        onCompleteExam={handleCompleteExam}
        theme={theme as unknown as Record<string, string>}
      />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
  },
  progressBar: {
    height: 4,
  },
  progressFill: {
    height: '100%',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
});
