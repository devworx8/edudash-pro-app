/**
 * Exam Session Hook
 * 
 * Manages exam state, student answers, and persistence.
 * Ported from web app for native app usage.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ParsedExam, ExamQuestion, gradeAnswer } from '@/lib/examParser';
import { assertSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import {
  type AdaptiveState,
  createAdaptiveState,
  recordCorrect,
  recordWrong,
} from '@/lib/activities/adaptiveDifficulty';

export interface StudentAnswer {
  questionId: string;
  answer: string;
  selectedOptionId?: string;
  isCorrect?: boolean;
  feedback?: string;
  marks?: number;
  gradingMode?: 'deterministic' | 'heuristic';
  submittedAt?: string;
}

export interface SectionBreakdown {
  sectionId: string;
  title: string;
  earnedMarks: number;
  totalMarks: number;
  questionCount: number;
  correctCount: number;
}

export interface TopicFeedback {
  topic: string;
  earnedMarks: number;
  totalMarks: number;
  percentage: number;
  priority: 'high' | 'medium' | 'low';
}

export interface ExamSessionState {
  examId: string;
  exam: ParsedExam;
  answers: Record<string, StudentAnswer>;
  currentQuestionIndex: number;
  startedAt: string;
  completedAt?: string;
  totalMarks: number;
  earnedMarks: number;
  gradingStatus?: string;
  sectionBreakdown?: SectionBreakdown[];
  topicFeedback?: TopicFeedback[];
  recommendedPractice?: string[];
  persistenceWarning?: string | null;
  cloudSessionId?: string | null;
  status: 'in_progress' | 'completed' | 'abandoned';
}

interface UseExamSessionOptions {
  examId: string;
  exam: ParsedExam;
  userId?: string;
  studentId?: string;
  classId?: string;
  schoolId?: string;
  autoSave?: boolean;
}

interface GradeExamAttemptResponse {
  success: boolean;
  sessionId?: string | null;
  earnedMarks?: number;
  totalMarks?: number;
  percentage?: number;
  gradingStatus?: string;
  questionFeedback?: Record<
    string,
    {
      isCorrect: boolean;
      marksAwarded: number;
      feedback: string;
      gradingMode: 'deterministic' | 'heuristic';
    }
  >;
  sectionBreakdown?: SectionBreakdown[];
  topicFeedback?: TopicFeedback[];
  recommendedPractice?: string[];
  persistenceWarning?: string | null;
  error?: string;
}

export function useExamSession(options: UseExamSessionOptions) {
  const { examId, exam, userId, studentId, classId, schoolId, autoSave = true } = options;
  const [session, setSession] = useState<ExamSessionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [adaptiveState, setAdaptiveState] = useState<AdaptiveState>(createAdaptiveState());
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Storage key
  const storageKey = `exam_session_${examId}_${userId || 'guest'}`;

  /**
   * Load existing session from storage
   */
  const loadSession = useCallback(async () => {
    try {
      setLoading(true);

      // Try loading from AsyncStorage first (local)
      const stored = await AsyncStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as ExamSessionState;
        setSession(parsed);
        logger.info('[ExamSession] Loaded from AsyncStorage', { examId });
        return parsed;
      }

      // Try loading from Supabase (cloud backup)
      if (userId) {
        const supabase = assertSupabase();
        const { data, error } = await supabase
          .from('exam_sessions')
          .select('*')
          .eq('exam_id', examId)
          .eq('user_id', userId)
          .eq('status', 'in_progress')
          .maybeSingle();

        if (data && !error) {
          const cloudSession = {
            ...(data.session_data as ExamSessionState),
            cloudSessionId: data.id as string,
          };
          setSession(cloudSession);
          // Cache locally
          await AsyncStorage.setItem(storageKey, JSON.stringify(cloudSession));
          logger.info('[ExamSession] Loaded from Supabase', { examId });
          return cloudSession;
        }
      }

      // Create new session
      const newSession: ExamSessionState = {
        examId,
        exam,
        answers: {},
        currentQuestionIndex: 0,
        startedAt: new Date().toISOString(),
        totalMarks: exam.totalMarks,
        earnedMarks: 0,
        cloudSessionId: null,
        status: 'in_progress',
      };

      setSession(newSession);
      await saveSession(newSession);
      logger.info('[ExamSession] Created new session', { examId });
      return newSession;
    } catch (error) {
      logger.error('[ExamSession] Failed to load session', { examId, error });
      return null;
    } finally {
      setLoading(false);
    }
  }, [examId, exam, userId, storageKey]);

  /**
   * Save session to storage
   */
  const saveSession = useCallback(
    async (sessionData: ExamSessionState) => {
      try {
        // Save to AsyncStorage (local)
        await AsyncStorage.setItem(storageKey, JSON.stringify(sessionData));

        // Save to Supabase (cloud backup)
        if (userId) {
          const supabase = assertSupabase();
          const { data: existing } = await supabase
            .from('exam_sessions')
            .select('id')
            .eq('exam_id', examId)
            .eq('user_id', userId)
            .eq('status', 'in_progress')
            .maybeSingle();

          const payload = {
            exam_id: examId,
            user_id: userId,
            session_data: sessionData,
            status: sessionData.status,
            started_at: sessionData.startedAt,
            completed_at: sessionData.completedAt,
            total_marks: sessionData.totalMarks,
            earned_marks: sessionData.earnedMarks,
            updated_at: new Date().toISOString(),
            preschool_id: schoolId || null,
          };

          if (existing?.id) {
            await supabase.from('exam_sessions').update(payload).eq('id', existing.id);
          } else {
            await supabase.from('exam_sessions').insert(payload);
          }
        }

        logger.debug('[ExamSession] Saved session', { examId });
      } catch (error) {
        logger.error('[ExamSession] Failed to save session', { examId, error });
      }
    },
    [examId, userId, schoolId, storageKey]
  );

  /**
   * Debounced auto-save
   */
  const scheduleAutoSave = useCallback(
    (sessionData: ExamSessionState) => {
      if (!autoSave) return;

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        saveSession(sessionData);
      }, 1000); // Save after 1s of inactivity
    },
    [autoSave, saveSession]
  );

  /**
   * Update student answer
   */
  const submitAnswer = useCallback(
    async (
      questionId: string,
      answer: string,
      autoGrade = true,
      selectedOptionId?: string,
    ) => {
      if (!session) return;

      // Find question
      const question = exam.sections
        .flatMap(s => s.questions)
        .find(q => q.id === questionId);

      if (!question) {
        logger.warn('[ExamSession] Question not found', { questionId });
        return;
      }

      let studentAnswer: StudentAnswer = {
        questionId,
        answer,
        selectedOptionId,
        submittedAt: new Date().toISOString(),
      };

      // Auto-grade for immediate inline feedback.
      if (autoGrade) {
        const gradeResult = gradeAnswer(question, answer, { selectedOptionId });
        studentAnswer = {
          ...studentAnswer,
          isCorrect: gradeResult.isCorrect,
          feedback: gradeResult.feedback,
          marks: gradeResult.marks,
          gradingMode: 'deterministic',
        };

        // Update adaptive difficulty based on answer correctness
        setAdaptiveState((prev) =>
          gradeResult.isCorrect ? recordCorrect(prev) : recordWrong(prev)
        );
      }

      // Update session
      const updatedSession: ExamSessionState = {
        ...session,
        answers: {
          ...session.answers,
          [questionId]: studentAnswer,
        },
        earnedMarks: Object.values({
          ...session.answers,
          [questionId]: studentAnswer,
        }).reduce((sum, a) => sum + (a.marks || 0), 0),
      };

      setSession(updatedSession);
      scheduleAutoSave(updatedSession);

      logger.info('[ExamSession] Answer submitted', {
        questionId,
        isCorrect: studentAnswer.isCorrect,
        marks: studentAnswer.marks,
      });

      return studentAnswer;
    },
    [session, exam, scheduleAutoSave]
  );

  /**
   * Navigate to question
   */
  const goToQuestion = useCallback(
    (index: number) => {
      if (!session) return;

      const totalQuestions = exam.sections.reduce((sum, s) => sum + s.questions.length, 0);
      const clampedIndex = Math.max(0, Math.min(index, totalQuestions - 1));

      const updatedSession = {
        ...session,
        currentQuestionIndex: clampedIndex,
      };

      setSession(updatedSession);
      scheduleAutoSave(updatedSession);
    },
    [session, exam, scheduleAutoSave]
  );

  /**
   * Complete exam
   */
  const completeExam = useCallback(async () => {
    if (!session) return;

    let completedSession: ExamSessionState = {
      ...session,
      status: 'completed',
      completedAt: new Date().toISOString(),
    };

    try {
      const supabase = assertSupabase();
      const { data, error } = await supabase.functions.invoke<GradeExamAttemptResponse>(
        'grade-exam-attempt',
        {
          body: {
            examId,
            exam,
            answers: Object.fromEntries(
              Object.entries(session.answers).map(([questionId, value]) => [
                questionId,
                {
                  answer: value.answer,
                  selectedOptionId: value.selectedOptionId,
                },
              ]),
            ),
            studentId: studentId || undefined,
            classId: classId || undefined,
            schoolId: schoolId || undefined,
          },
        },
      );

      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || 'Failed to grade exam attempt');
      }

      const mergedAnswers: Record<string, StudentAnswer> = { ...session.answers };
      Object.entries(data.questionFeedback || {}).forEach(([questionId, feedback]) => {
        mergedAnswers[questionId] = {
          ...(mergedAnswers[questionId] || {
            questionId,
            answer: '',
          }),
          isCorrect: feedback.isCorrect,
          feedback: feedback.feedback,
          marks: feedback.marksAwarded,
          gradingMode: feedback.gradingMode,
        };
      });

      completedSession = {
        ...completedSession,
        answers: mergedAnswers,
        earnedMarks: Number(data.earnedMarks ?? completedSession.earnedMarks ?? 0),
        totalMarks: Number(data.totalMarks ?? completedSession.totalMarks ?? exam.totalMarks ?? 0),
        gradingStatus: data.gradingStatus || completedSession.gradingStatus,
        sectionBreakdown: data.sectionBreakdown || [],
        topicFeedback: data.topicFeedback || [],
        recommendedPractice: data.recommendedPractice || [],
        persistenceWarning: data.persistenceWarning || null,
        cloudSessionId: data.sessionId || completedSession.cloudSessionId || null,
      };
    } catch (gradingError) {
      logger.error('[ExamSession] Cloud grading failed, falling back to local score', {
        examId,
        gradingError,
      });
    }

    setSession(completedSession);
    await saveSession(completedSession);

    logger.info('[ExamSession] Exam completed', {
      examId,
      earnedMarks: completedSession.earnedMarks,
      totalMarks: completedSession.totalMarks,
    });

    return completedSession;
  }, [session, examId, exam, studentId, classId, schoolId, saveSession]);

  /**
   * Reset exam
   */
  const resetExam = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(storageKey);

      if (userId) {
        const supabase = assertSupabase();
        await supabase.from('exam_sessions').delete().eq('exam_id', examId).eq('user_id', userId);
      }

      await loadSession();
      logger.info('[ExamSession] Exam reset', { examId });
    } catch (error) {
      logger.error('[ExamSession] Failed to reset exam', { examId, error });
    }
  }, [examId, userId, storageKey, loadSession]);

  /**
   * Get progress percentage
   */
  const getProgress = useCallback(() => {
    if (!session) return 0;

    const totalQuestions = exam.sections.reduce((sum, s) => sum + s.questions.length, 0);
    const answeredQuestions = Object.keys(session.answers).length;

    return Math.round((answeredQuestions / totalQuestions) * 100);
  }, [session, exam]);

  // Load session on mount
  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    session,
    loading,
    submitAnswer,
    goToQuestion,
    completeExam,
    resetExam,
    getProgress,
    saveSession,
    adaptiveState,
  };
}
