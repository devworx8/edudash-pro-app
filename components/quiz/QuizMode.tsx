/**
 * QuizMode — AI-powered interactive quiz experience
 *
 * Full quiz flow component that integrates with DashQuizService:
 * - Configuration → Generation → Question → Answer → Results
 * - Supports multiple_choice, true_false, fill_blank, matching
 * - Progress bar, hints, explanations, achievement toasts
 * - Responsive mobile-first design
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuiz } from '@/hooks/useQuiz';
import { percentWidth } from '@/lib/progress/clampPercent';
import type {
  QuizConfig,
  QuizQuestion,
  QuizGenerationResult,
  AnswerResult,
  SessionResult,
  QuizDifficulty,
  QuestionType,
  Achievement,
} from '@/lib/types/quiz';

// ============================================
// Types
// ============================================

interface QuizModeProps {
  userId: string;
  organizationId: string | null;
  /** Pre-fill config (skip config screen) */
  initialConfig?: Partial<QuizConfig>;
  /** Called when quiz is completed or user exits */
  onComplete?: (result: SessionResult | null) => void;
  /** Called when user wants to go back */
  onBack?: () => void;
}

type QuizPhase = 'config' | 'loading' | 'question' | 'feedback' | 'results';

// ============================================
// Constants
// ============================================

const SUBJECTS = ['Mathematics', 'Science', 'English', 'Life Skills', 'Social Sciences', 'Technology'];
const GRADE_LEVELS = ['Grade R', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7'];
const DIFFICULTIES: { label: string; value: QuizDifficulty; emoji: string }[] = [
  { label: 'Easy', value: 'easy', emoji: '🟢' },
  { label: 'Medium', value: 'medium', emoji: '🟡' },
  { label: 'Hard', value: 'hard', emoji: '🟠' },
  { label: 'Challenge', value: 'challenge', emoji: '🔴' },
];
const QUESTION_TYPES: { label: string; value: QuestionType }[] = [
  { label: 'Multiple Choice', value: 'multiple_choice' },
  { label: 'True / False', value: 'true_false' },
  { label: 'Fill in the Blank', value: 'fill_blank' },
  { label: 'Matching', value: 'matching' },
];

const COLORS = {
  primary: '#6366f1',
  primaryLight: '#818cf8',
  success: '#22c55e',
  error: '#ef4444',
  warning: '#f59e0b',
  bg: '#f8fafc',
  card: '#ffffff',
  text: '#1e293b',
  textSecondary: '#64748b',
  border: '#e2e8f0',
  correct: '#dcfce7',
  incorrect: '#fee2e2',
  hint: '#fef3c7',
};

// ============================================
// Component
// ============================================

export function QuizMode({
  userId,
  organizationId,
  initialConfig,
  onComplete,
  onBack,
}: QuizModeProps) {
  const quiz = useQuiz(userId, organizationId);

  // Phase
  const [phase, setPhase] = useState<QuizPhase>(initialConfig?.subject ? 'loading' : 'config');

  // Config state
  const [subject, setSubject] = useState(initialConfig?.subject ?? '');
  const [topic, setTopic] = useState(initialConfig?.topic ?? '');
  const [gradeLevel, setGradeLevel] = useState(initialConfig?.gradeLevel ?? '');
  const [difficulty, setDifficulty] = useState<QuizDifficulty>(initialConfig?.difficulty ?? 'medium');
  const [questionCount, setQuestionCount] = useState(initialConfig?.questionCount ?? 10);
  const [selectedTypes, setSelectedTypes] = useState<QuestionType[]>(
    initialConfig?.questionTypes ?? ['multiple_choice', 'true_false']
  );

  // Session state
  const [sessionData, setSessionData] = useState<QuizGenerationResult | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [fillBlankAnswer, setFillBlankAnswer] = useState('');
  const [lastFeedback, setLastFeedback] = useState<AnswerResult | null>(null);
  const [hintsRevealed, setHintsRevealed] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [finalResult, setFinalResult] = useState<SessionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Animation
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Auto-start if initialConfig provided
  useEffect(() => {
    if (initialConfig?.subject && initialConfig?.topic && initialConfig?.gradeLevel) {
      handleStartQuiz();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============================================
  // Handlers
  // ============================================

  const handleStartQuiz = useCallback(async () => {
    if (!subject || !topic || !gradeLevel) {
      setError('Please fill in subject, topic, and grade level');
      return;
    }
    if (selectedTypes.length === 0) {
      setError('Please select at least one question type');
      return;
    }

    setError(null);
    setPhase('loading');

    try {
      const config: QuizConfig = {
        subject,
        topic,
        gradeLevel,
        difficulty,
        questionCount,
        questionTypes: selectedTypes,
        capsAligned: true,
      };

      const result = await quiz.generateQuiz(config);
      setSessionData(result);
      setCurrentIndex(0);
      setStartTime(Date.now());
      setPhase('question');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Failed to generate quiz';
      setError(errMsg);
      setPhase('config');
    }
  }, [subject, topic, gradeLevel, difficulty, questionCount, selectedTypes, quiz]);

  const handleSubmitAnswer = useCallback(async () => {
    if (!sessionData) return;

    const currentQuestion = sessionData.questions[currentIndex];
    const userAnswer = currentQuestion.question_type === 'fill_blank'
      ? fillBlankAnswer
      : selectedOption ?? '';

    if (!userAnswer) return;

    const timeTaken = Math.round((Date.now() - startTime) / 1000);

    try {
      const result = await quiz.submitAnswer({
        sessionId: sessionData.sessionId,
        questionId: currentQuestion.id,
        userAnswer,
        hintsUsed: hintsRevealed,
        timeTakenSeconds: timeTaken,
      });

      setLastFeedback(result);
      setPhase('feedback');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Failed to submit answer';
      setError(errMsg);
    }
  }, [sessionData, currentIndex, selectedOption, fillBlankAnswer, hintsRevealed, startTime, quiz]);

  const handleNextQuestion = useCallback(async () => {
    if (!lastFeedback || !sessionData) return;

    if (lastFeedback.nextQuestionIndex !== null) {
      // Animate transition
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start();

      setCurrentIndex(lastFeedback.nextQuestionIndex);
      setSelectedOption(null);
      setFillBlankAnswer('');
      setHintsRevealed(0);
      setStartTime(Date.now());
      setLastFeedback(null);
      setPhase('question');
    } else {
      // Quiz complete
      try {
        const result = await quiz.completeSession(sessionData.sessionId);
        setFinalResult(result);
        setPhase('results');
      } catch {
        setPhase('results');
      }
    }
  }, [lastFeedback, sessionData, fadeAnim, quiz]);

  const handleTypeToggle = useCallback((type: QuestionType) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }, []);

  // ============================================
  // Render helpers
  // ============================================

  const currentQuestion = sessionData?.questions[currentIndex] ?? null;

  const renderConfig = () => (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.title}>Create a Quiz</Text>
      <Text style={styles.subtitle}>AI will generate questions tailored to your settings</Text>

      {error && (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={16} color={COLORS.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Subject */}
      <Text style={styles.label}>Subject *</Text>
      <View style={styles.chipRow}>
        {SUBJECTS.map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.chip, subject === s && styles.chipActive]}
            onPress={() => setSubject(s)}
          >
            <Text style={[styles.chipText, subject === s && styles.chipTextActive]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Topic */}
      <Text style={styles.label}>Topic *</Text>
      <TextInput
        style={styles.input}
        value={topic}
        onChangeText={setTopic}
        placeholder="e.g., Fractions, Photosynthesis, Vocabulary"
        placeholderTextColor={COLORS.textSecondary}
      />

      {/* Grade Level */}
      <Text style={styles.label}>Grade Level *</Text>
      <View style={styles.chipRow}>
        {GRADE_LEVELS.map((g) => (
          <TouchableOpacity
            key={g}
            style={[styles.chip, gradeLevel === g && styles.chipActive]}
            onPress={() => setGradeLevel(g)}
          >
            <Text style={[styles.chipText, gradeLevel === g && styles.chipTextActive]}>{g}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Difficulty */}
      <Text style={styles.label}>Difficulty</Text>
      <View style={styles.chipRow}>
        {DIFFICULTIES.map((d) => (
          <TouchableOpacity
            key={d.value}
            style={[styles.chip, difficulty === d.value && styles.chipActive]}
            onPress={() => setDifficulty(d.value)}
          >
            <Text style={[styles.chipText, difficulty === d.value && styles.chipTextActive]}>
              {d.emoji} {d.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Question Types */}
      <Text style={styles.label}>Question Types</Text>
      <View style={styles.chipRow}>
        {QUESTION_TYPES.map((qt) => (
          <TouchableOpacity
            key={qt.value}
            style={[styles.chip, selectedTypes.includes(qt.value) && styles.chipActive]}
            onPress={() => handleTypeToggle(qt.value)}
          >
            <Text style={[styles.chipText, selectedTypes.includes(qt.value) && styles.chipTextActive]}>
              {qt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Question Count */}
      <Text style={styles.label}>Number of Questions: {questionCount}</Text>
      <View style={styles.counterRow}>
        <TouchableOpacity
          style={styles.counterBtn}
          onPress={() => setQuestionCount((c: number) => Math.max(3, c - 1))}
        >
          <Ionicons name="remove" size={20} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.counterValue}>{questionCount}</Text>
        <TouchableOpacity
          style={styles.counterBtn}
          onPress={() => setQuestionCount((c: number) => Math.min(20, c + 1))}
        >
          <Ionicons name="add" size={20} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {/* Start Button */}
      <TouchableOpacity style={styles.primaryBtn} onPress={handleStartQuiz}>
        <Ionicons name="sparkles" size={20} color="#fff" />
        <Text style={styles.primaryBtnText}>Generate Quiz</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderLoading = () => (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color={COLORS.primary} />
      <Text style={styles.loadingText}>Generating your quiz...</Text>
      <Text style={styles.loadingSubtext}>AI is crafting questions on {topic}</Text>
    </View>
  );

  const renderQuestion = () => {
    if (!currentQuestion || !sessionData) return null;

    const progress = (currentIndex + 1) / sessionData.totalQuestions;

    return (
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Progress bar */}
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: percentWidth(progress * 100) }]} />
            </View>
            <Text style={styles.progressText}>
              {currentIndex + 1} / {sessionData.totalQuestions}
            </Text>
          </View>

          {/* Question */}
          <View style={styles.questionCard}>
            <View style={styles.questionMeta}>
              <Text style={styles.badge}>
                {currentQuestion.question_type.replace('_', ' ')}
              </Text>
              <Text style={styles.badge}>{currentQuestion.difficulty}</Text>
            </View>

            <Text style={styles.questionText}>{currentQuestion.question_text}</Text>

            {/* Hints */}
            {currentQuestion.hints && currentQuestion.hints.length > 0 && (
              <TouchableOpacity
                style={styles.hintBtn}
                onPress={() => setHintsRevealed((h) => Math.min(h + 1, currentQuestion.hints.length))}
              >
                <Ionicons name="bulb-outline" size={16} color={COLORS.warning} />
                <Text style={styles.hintBtnText}>
                  Hint ({hintsRevealed}/{currentQuestion.hints.length})
                </Text>
              </TouchableOpacity>
            )}
            {hintsRevealed > 0 && (
              <View style={styles.hintBox}>
                {currentQuestion.hints.slice(0, hintsRevealed).map((hint: string, i: number) => (
                  <Text key={i} style={styles.hintText}>
                    💡 {hint}
                  </Text>
                ))}
              </View>
            )}
          </View>

          {/* Answer input — varies by question type */}
          {renderAnswerInput(currentQuestion)}

          {/* Submit */}
          <TouchableOpacity
            style={[
              styles.primaryBtn,
              !(selectedOption || fillBlankAnswer) && styles.primaryBtnDisabled,
            ]}
            onPress={handleSubmitAnswer}
            disabled={!(selectedOption || fillBlankAnswer) || quiz.isSubmitting}
          >
            {quiz.isSubmitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={styles.primaryBtnText}>Submit Answer</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>
    );
  };

  const renderAnswerInput = (question: QuizQuestion) => {
    switch (question.question_type) {
      case 'multiple_choice':
      case 'true_false':
        return (
          <View style={styles.optionsList}>
            {(question.options as Array<{ label: string; value: string }>).map((opt) => (
              <TouchableOpacity
                key={opt.label}
                style={[
                  styles.optionCard,
                  selectedOption === opt.label && styles.optionCardSelected,
                ]}
                onPress={() => setSelectedOption(opt.label)}
              >
                <View style={[
                  styles.optionCircle,
                  selectedOption === opt.label && styles.optionCircleSelected,
                ]}>
                  <Text style={[
                    styles.optionLabel,
                    selectedOption === opt.label && styles.optionLabelSelected,
                  ]}>
                    {opt.label}
                  </Text>
                </View>
                <Text style={styles.optionText}>{opt.value}</Text>
              </TouchableOpacity>
            ))}
          </View>
        );

      case 'fill_blank':
        return (
          <View style={styles.fillBlankContainer}>
            <TextInput
              style={styles.fillBlankInput}
              value={fillBlankAnswer}
              onChangeText={setFillBlankAnswer}
              placeholder="Type your answer..."
              placeholderTextColor={COLORS.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        );

      case 'matching':
        // Simplified: user types the matching order
        return (
          <View style={styles.fillBlankContainer}>
            <Text style={styles.matchingInstructions}>
              Enter pairs like: 1-C,2-A,3-D,4-B
            </Text>
            <TextInput
              style={styles.fillBlankInput}
              value={fillBlankAnswer}
              onChangeText={setFillBlankAnswer}
              placeholder="1-A,2-B,3-C,4-D"
              placeholderTextColor={COLORS.textSecondary}
              autoCapitalize="characters"
            />
          </View>
        );

      default:
        return null;
    }
  };

  const renderFeedback = () => {
    if (!lastFeedback || !currentQuestion) return null;

    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <View style={[
          styles.feedbackCard,
          lastFeedback.isCorrect ? styles.feedbackCorrect : styles.feedbackIncorrect,
        ]}>
          <Ionicons
            name={lastFeedback.isCorrect ? 'checkmark-circle' : 'close-circle'}
            size={48}
            color={lastFeedback.isCorrect ? COLORS.success : COLORS.error}
          />
          <Text style={styles.feedbackTitle}>
            {lastFeedback.isCorrect ? 'Correct! 🎉' : 'Not quite 😊'}
          </Text>

          {!lastFeedback.isCorrect && (
            <Text style={styles.feedbackCorrectAnswer}>
              Correct answer: {lastFeedback.correctAnswer}
            </Text>
          )}

          {lastFeedback.explanation && (
            <View style={styles.explanationBox}>
              <Ionicons name="information-circle" size={16} color={COLORS.primary} />
              <Text style={styles.explanationText}>{lastFeedback.explanation}</Text>
            </View>
          )}

          {/* Progress summary */}
          <View style={styles.progressSummary}>
            <Text style={styles.progressSummaryText}>
              Score: {lastFeedback.sessionProgress.correctSoFar}/{lastFeedback.sessionProgress.total}
              {' '}({Math.round(lastFeedback.sessionProgress.score)}%)
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.primaryBtn} onPress={handleNextQuestion}>
          <Text style={styles.primaryBtnText}>
            {lastFeedback.nextQuestionIndex !== null ? 'Next Question' : 'See Results'}
          </Text>
          <Ionicons
            name={lastFeedback.nextQuestionIndex !== null ? 'arrow-forward' : 'trophy'}
            size={20}
            color="#fff"
          />
        </TouchableOpacity>
      </ScrollView>
    );
  };

  const renderResults = () => {
    const result = finalResult ?? quiz.sessionResult;
    if (!result) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Calculating results...</Text>
        </View>
      );
    }

    const scoreColor =
      result.score >= 80 ? COLORS.success :
      result.score >= 50 ? COLORS.warning : COLORS.error;

    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <View style={styles.resultsCard}>
          <Ionicons name="trophy" size={56} color={scoreColor} />
          <Text style={styles.resultsTitle}>Quiz Complete!</Text>

          <View style={styles.scoreCircle}>
            <Text style={[styles.scoreText, { color: scoreColor }]}>
              {Math.round(result.score)}%
            </Text>
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{result.correctAnswers}</Text>
              <Text style={styles.statLabel}>Correct</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{result.incorrectAnswers}</Text>
              <Text style={styles.statLabel}>Incorrect</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{result.hintsUsed}</Text>
              <Text style={styles.statLabel}>Hints</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {Math.floor(result.timeSpentSeconds / 60)}:{String(result.timeSpentSeconds % 60).padStart(2, '0')}
              </Text>
              <Text style={styles.statLabel}>Time</Text>
            </View>
          </View>

          {/* Mastery delta */}
          {result.masteryDelta !== 0 && (
            <View style={styles.masteryDelta}>
              <Ionicons
                name={result.masteryDelta > 0 ? 'trending-up' : 'trending-down'}
                size={16}
                color={result.masteryDelta > 0 ? COLORS.success : COLORS.error}
              />
              <Text style={styles.masteryText}>
                Mastery {result.masteryDelta > 0 ? '+' : ''}{result.masteryDelta.toFixed(1)}%
              </Text>
              {result.newSkillLevel && (
                <Text style={styles.skillLevel}>Level: {result.newSkillLevel}</Text>
              )}
            </View>
          )}

          {/* Achievements */}
          {result.achievementsEarned.length > 0 && (
            <View style={styles.achievementsSection}>
              <Text style={styles.achievementsTitle}>🏆 Achievements Earned</Text>
              {result.achievementsEarned.map((a: Achievement) => (
                <View key={a.id} style={styles.achievementRow}>
                  <Ionicons name="medal" size={20} color={COLORS.warning} />
                  <View>
                    <Text style={styles.achievementName}>{a.name}</Text>
                    <Text style={styles.achievementDesc}>{a.description}</Text>
                  </View>
                  <Text style={styles.xpBadge}>+{a.xp_reward} XP</Text>
                </View>
              ))}
            </View>
          )}

          {/* Review notice */}
          {result.reviewQuestions.length > 0 && (
            <View style={styles.reviewNotice}>
              <Ionicons name="repeat" size={16} color={COLORS.primary} />
              <Text style={styles.reviewText}>
                {result.reviewQuestions.length} question(s) scheduled for review
              </Text>
            </View>
          )}
        </View>

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={onBack}>
            <Text style={styles.secondaryBtnText}>Exit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => {
              setPhase('config');
              setSessionData(null);
              setCurrentIndex(0);
              setFinalResult(null);
              setLastFeedback(null);
            }}
          >
            <Text style={styles.primaryBtnText}>New Quiz</Text>
          </TouchableOpacity>
        </View>

        {onComplete && (
          <TouchableOpacity
            style={[styles.secondaryBtn, { marginTop: 8 }]}
            onPress={() => onComplete(result)}
          >
            <Text style={styles.secondaryBtnText}>Done</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    );
  };

  // ============================================
  // Main render
  // ============================================

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {phase === 'config' ? 'Quiz Setup' :
           phase === 'loading' ? 'Generating...' :
           phase === 'results' ? 'Results' :
           `Q${currentIndex + 1}`}
        </Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Content */}
      {phase === 'config' && renderConfig()}
      {phase === 'loading' && renderLoading()}
      {phase === 'question' && renderQuestion()}
      {phase === 'feedback' && renderFeedback()}
      {phase === 'results' && renderResults()}
    </View>
  );
}

// ============================================
// Styles
// ============================================

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },

  // Config
  title: { fontSize: 24, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginTop: 16, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: COLORS.text,
    backgroundColor: COLORS.card,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  chipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '15' },
  chipText: { fontSize: 13, color: COLORS.textSecondary },
  chipTextActive: { color: COLORS.primary, fontWeight: '600' },
  counterRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  counterBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  counterValue: { fontSize: 20, fontWeight: '700', color: COLORS.text, minWidth: 30, textAlign: 'center' },

  // Buttons
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 24,
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  secondaryBtnText: { color: COLORS.text, fontSize: 16, fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 12, marginTop: 16 },

  // Loading
  loadingText: { fontSize: 18, fontWeight: '600', color: COLORS.text, marginTop: 16 },
  loadingSubtext: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4 },

  // Progress
  progressContainer: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  progressBar: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.border,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 4 },
  progressText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },

  // Question
  questionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 2 },
      default: {},
    }),
  },
  questionMeta: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  badge: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
    backgroundColor: COLORS.bg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    textTransform: 'capitalize',
    overflow: 'hidden',
  },
  questionText: { fontSize: 18, fontWeight: '600', color: COLORS.text, lineHeight: 26 },

  // Hints
  hintBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12 },
  hintBtnText: { fontSize: 13, color: COLORS.warning, fontWeight: '600' },
  hintBox: {
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: COLORS.hint,
  },
  hintText: { fontSize: 13, color: '#92400e', marginBottom: 4 },

  // Options
  optionsList: { gap: 10 },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  optionCardSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '08' },
  optionCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionCircleSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  optionLabel: { fontSize: 14, fontWeight: '700', color: COLORS.textSecondary },
  optionLabelSelected: { color: '#fff' },
  optionText: { flex: 1, fontSize: 15, color: COLORS.text },

  // Fill blank
  fillBlankContainer: { marginTop: 8 },
  fillBlankInput: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: COLORS.text,
    backgroundColor: COLORS.card,
  },
  matchingInstructions: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 8 },

  // Feedback
  feedbackCard: {
    alignItems: 'center',
    padding: 24,
    borderRadius: 16,
    marginBottom: 16,
  },
  feedbackCorrect: { backgroundColor: COLORS.correct },
  feedbackIncorrect: { backgroundColor: COLORS.incorrect },
  feedbackTitle: { fontSize: 22, fontWeight: '700', color: COLORS.text, marginTop: 8 },
  feedbackCorrectAnswer: { fontSize: 15, color: COLORS.textSecondary, marginTop: 6 },
  explanationBox: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    padding: 12,
    borderRadius: 10,
    backgroundColor: COLORS.card,
  },
  explanationText: { flex: 1, fontSize: 14, color: COLORS.text, lineHeight: 20 },
  progressSummary: { marginTop: 16 },
  progressSummaryText: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },

  // Results
  resultsCard: {
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 24,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 4 },
      default: {},
    }),
  },
  resultsTitle: { fontSize: 24, fontWeight: '700', color: COLORS.text, marginTop: 8 },
  scoreCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 16,
  },
  scoreText: { fontSize: 32, fontWeight: '800' },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'center',
    marginTop: 8,
  },
  statItem: { alignItems: 'center', minWidth: 64 },
  statValue: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  statLabel: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  masteryDelta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: COLORS.bg,
  },
  masteryText: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  skillLevel: { fontSize: 13, color: COLORS.textSecondary, marginLeft: 4 },
  achievementsSection: { width: '100%', marginTop: 20 },
  achievementsTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  achievementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: COLORS.bg,
    marginBottom: 6,
  },
  achievementName: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  achievementDesc: { fontSize: 12, color: COLORS.textSecondary },
  xpBadge: {
    marginLeft: 'auto',
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.warning,
  },
  reviewNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: COLORS.primary + '10',
  },
  reviewText: { fontSize: 13, color: COLORS.primary, fontWeight: '500' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: COLORS.incorrect,
    marginBottom: 8,
  },
  errorText: { flex: 1, fontSize: 13, color: COLORS.error },
});
