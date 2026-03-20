/**
 * DashQuizService
 *
 * AI-powered quiz generation, session management, and learning progress
 * tracking. Integrates with Supabase for persistence and Claude via
 * ai-proxy for question generation.
 *
 * Features:
 * - AI question generation (CAPS-aligned, multi-type, multi-difficulty)
 * - Session lifecycle (start → answer → complete)
 * - Spaced repetition (SM-2 algorithm)
 * - Achievement tracking
 * - Learning progress & mastery scoring
 */

import { supabase } from '@/lib/supabase';
import { AI_SERVICE_TYPES } from '@/lib/ai/aiConfig';
import { assertQuotaForService } from '@/lib/ai/guards';
import type {
  QuizConfig,
  QuizQuestion,
  QuizSession,
  QuizGenerationResult,
  AnswerResult,
  SessionResult,
  Achievement,
  LearningProgress,
  ReviewSchedule,
  AIQuizResponse,
  SkillLevel,
  QuestionType,
} from '@/lib/types/quiz';

// ============================================
// Constants
// ============================================

const MAX_QUESTIONS_PER_QUIZ = 20;
const MIN_QUESTIONS_PER_QUIZ = 3;
const DEFAULT_QUESTION_COUNT = 10;
const DEFAULT_TIME_LIMIT = 0; // No limit
const MASTERY_THRESHOLD = 80; // Score needed for mastery
const FILL_BLANK_SIMILARITY_THRESHOLD = 0.8;
const PHONICS_SIMILARITY_THRESHOLD = 0.84;

const PHONICS_QUESTION_TYPES: QuestionType[] = [
  'letter_sound_match',
  'rhyme_match',
  'blend_word',
  'vowel_identify',
];

/** SM-2 defaults */
const SM2_INITIAL_EASE = 2.5;
const SM2_MIN_EASE = 1.3;

/** Skill level thresholds (mastery_score) */
const SKILL_THRESHOLDS: Record<SkillLevel, number> = {
  beginner: 0,
  developing: 20,
  proficient: 50,
  advanced: 75,
  mastery: 90,
};

// ============================================
// Service
// ============================================

export class DashQuizService {
  private static isEarlyPhonicsGrade(gradeLevel: string | null | undefined): boolean {
    const normalized = String(gradeLevel || '').trim().toLowerCase();
    return normalized === 'pre-r'
      || normalized === 'pre r'
      || normalized === 'grade r'
      || normalized === 'r'
      || normalized === 'grade 1'
      || normalized === '1';
  }

  private static resolveQuestionTypes(config: QuizConfig): QuestionType[] {
    const requested = Array.isArray(config.questionTypes) ? config.questionTypes.filter(Boolean) : [];
    if (requested.length > 0) return requested;

    if (DashQuizService.isEarlyPhonicsGrade(config.gradeLevel)) {
      return [...PHONICS_QUESTION_TYPES];
    }

    return ['multiple_choice', 'true_false', 'fill_blank', 'matching'];
  }

  /**
   * Generate a quiz using AI and start a session.
   */
  static async generateQuiz(
    userId: string,
    organizationId: string | null,
    config: QuizConfig
  ): Promise<QuizGenerationResult> {
    const questionTypes = DashQuizService.resolveQuestionTypes(config);
    const questionCount = Math.max(
      MIN_QUESTIONS_PER_QUIZ,
      Math.min(config.questionCount || DEFAULT_QUESTION_COUNT, MAX_QUESTIONS_PER_QUIZ)
    );
    const effectiveConfig: QuizConfig & { questionCount: number; questionTypes: QuestionType[] } = {
      ...config,
      questionCount,
      questionTypes,
    };

    // Build the prompt
    const prompt = DashQuizService.buildGenerationPrompt(effectiveConfig);

    // §3.1: Quota pre-check before AI call
    const quota = await assertQuotaForService('chat_message', 1, userId);
    if (!quota.allowed) throw new Error('AI quota exceeded — please upgrade or try again later.');

    // Call AI to generate questions
    const { data, error: fnError } = await supabase.functions.invoke('ai-proxy', {
      body: {
        scope: organizationId ?? 'personal',
        service_type: AI_SERVICE_TYPES.quizGeneration,
        payload: {
          prompt,
          model: 'claude-haiku',
          max_tokens: 4000,
        },
        metadata: {
          user_id: userId,
          subject: effectiveConfig.subject,
          topic: effectiveConfig.topic,
          grade_level: effectiveConfig.gradeLevel,
          difficulty: effectiveConfig.difficulty,
          question_types: effectiveConfig.questionTypes,
        },
      },
    });

    if (fnError) {
      throw new QuizServiceError('AI quiz generation failed', 'generation_failed', fnError);
    }

    const aiContent = data?.content ?? data?.choices?.[0]?.message?.content ?? '';
    const parsed = DashQuizService.parseQuizResponse(aiContent);

    if (!parsed.questions.length) {
      throw new QuizServiceError('AI returned no valid questions', 'empty_response');
    }

    // Save questions to database
    const savedQuestions = await DashQuizService.saveQuestions(
      parsed.questions,
      organizationId,
      userId,
      effectiveConfig
    );

    // Create quiz session
    const sessionId = await DashQuizService.createSession(
      userId,
      organizationId,
      effectiveConfig,
      savedQuestions.map((q) => q.id)
    );

    return {
      questions: savedQuestions,
      sessionId,
      totalQuestions: savedQuestions.length,
      estimatedTime: savedQuestions.length * 30, // ~30s per question estimate
    };
  }

  /**
   * Start a quiz session from existing questions (e.g., review session).
   */
  static async startReviewSession(
    userId: string,
    organizationId: string | null,
    config: QuizConfig
  ): Promise<QuizGenerationResult> {
    if (!config.includeQuestionIds?.length) {
      throw new QuizServiceError('No questions specified for review', 'invalid_config');
    }

    const { data: questions, error } = await supabase
      .from('dash_quiz_questions')
      .select('*')
      .in('id', config.includeQuestionIds);

    if (error || !questions?.length) {
      throw new QuizServiceError('Failed to load review questions', 'load_failed', error);
    }

    const sessionId = await DashQuizService.createSession(
      userId,
      organizationId,
      config,
      questions.map((q: QuizQuestion) => q.id)
    );

    return {
      questions: questions as QuizQuestion[],
      sessionId,
      totalQuestions: questions.length,
      estimatedTime: questions.length * 30,
    };
  }

  /**
   * Submit an answer for the current question in a session.
   */
  static async submitAnswer(
    sessionId: string,
    questionId: string,
    userAnswer: string,
    hintsUsed: number = 0,
    timeTakenSeconds: number = 0
  ): Promise<AnswerResult> {
    // Load question
    const { data: question, error: qErr } = await supabase
      .from('dash_quiz_questions')
      .select('*')
      .eq('id', questionId)
      .single();

    if (qErr || !question) {
      throw new QuizServiceError('Question not found', 'not_found', qErr);
    }

    // Load session
    const { data: session, error: sErr } = await supabase
      .from('dash_quiz_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (sErr || !session) {
      throw new QuizServiceError('Session not found', 'not_found', sErr);
    }

    if (session.status !== 'in_progress') {
      throw new QuizServiceError('Session is not active', 'session_closed');
    }

    // Check answer
    const isCorrect = DashQuizService.checkAnswer(
      userAnswer,
      question.correct_answer,
      question.question_type
    );

    // Save answer
    const { error: ansErr } = await supabase.from('dash_quiz_answers').insert({
      session_id: sessionId,
      question_id: questionId,
      user_answer: userAnswer,
      is_correct: isCorrect,
      hints_used: hintsUsed,
      time_taken_seconds: timeTakenSeconds,
    });

    if (ansErr) {
      throw new QuizServiceError('Failed to save answer', 'save_failed', ansErr);
    }

    // Update session progress
    const newIndex = session.current_question_index + 1;
    const newCorrect = session.correct_answers + (isCorrect ? 1 : 0);
    const newIncorrect = session.incorrect_answers + (isCorrect ? 0 : 1);
    const newHints = session.hints_used + hintsUsed;
    const newTime = session.time_spent_seconds + timeTakenSeconds;
    const newScore = (newCorrect / session.total_questions) * 100;

    const isLastQuestion = newIndex >= session.total_questions;

    await supabase
      .from('dash_quiz_sessions')
      .update({
        current_question_index: newIndex,
        correct_answers: newCorrect,
        incorrect_answers: newIncorrect,
        hints_used: newHints,
        time_spent_seconds: newTime,
        score: newScore,
        ...(isLastQuestion ? { status: 'completed', completed_at: new Date().toISOString() } : {}),
      })
      .eq('id', sessionId);

    // Update question usage stats (non-critical)
    try {
      await supabase.rpc('increment_question_usage', { p_question_id: questionId });
    } catch {
      // Ignore RPC failures
    }

    return {
      isCorrect,
      correctAnswer: question.correct_answer,
      explanation: question.explanation,
      hintsAvailable: (question.hints as string[])?.length ?? 0,
      nextQuestionIndex: isLastQuestion ? null : newIndex,
      sessionProgress: {
        current: newIndex,
        total: session.total_questions,
        score: Math.round(newScore * 100) / 100,
        correctSoFar: newCorrect,
      },
    };
  }

  /**
   * Complete a session and calculate final results.
   * Updates learning progress, checks achievements, and schedules reviews.
   */
  static async completeSession(sessionId: string, userId: string): Promise<SessionResult> {
    // Load session with answers
    const { data: session, error: sErr } = await supabase
      .from('dash_quiz_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single();

    if (sErr || !session) {
      throw new QuizServiceError('Session not found', 'not_found', sErr);
    }

    // Mark as completed if not already
    if (session.status === 'in_progress') {
      const score = session.total_questions > 0
        ? (session.correct_answers / session.total_questions) * 100
        : 0;

      await supabase
        .from('dash_quiz_sessions')
        .update({ status: 'completed', completed_at: new Date().toISOString(), score })
        .eq('id', sessionId);

      session.status = 'completed';
      session.score = score;
    }

    // Update learning progress
    const masteryDelta = await DashQuizService.updateLearningProgress(
      userId,
      session.organization_id,
      session.subject,
      session.topic,
      session.grade_level,
      session.correct_answers,
      session.incorrect_answers
    );

    // Get new skill level
    const { data: progress } = await supabase
      .from('dash_learning_progress')
      .select('skill_level')
      .eq('user_id', userId)
      .eq('subject', session.subject)
      .eq('topic', session.topic)
      .single();

    // Check achievements
    const achievementsEarned = await DashQuizService.checkAchievements(
      userId,
      session
    );

    // Schedule spaced repetition for incorrect answers
    const reviewQuestions = await DashQuizService.scheduleReviews(
      userId,
      sessionId
    );

    return {
      sessionId,
      score: Math.round(session.score * 100) / 100,
      totalQuestions: session.total_questions,
      correctAnswers: session.correct_answers,
      incorrectAnswers: session.incorrect_answers,
      hintsUsed: session.hints_used,
      timeSpentSeconds: session.time_spent_seconds,
      masteryDelta,
      newSkillLevel: (progress?.skill_level as SkillLevel) ?? null,
      achievementsEarned,
      reviewQuestions,
    };
  }

  /**
   * Get questions due for spaced repetition review.
   */
  static async getDueReviews(userId: string, limit: number = 10): Promise<ReviewSchedule[]> {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('dash_review_schedule')
      .select('*')
      .eq('user_id', userId)
      .lte('next_review_date', today)
      .order('next_review_date', { ascending: true })
      .limit(limit);

    if (error) {
      throw new QuizServiceError('Failed to load reviews', 'load_failed', error);
    }

    return (data ?? []) as ReviewSchedule[];
  }

  /**
   * Get learning progress summary for a user.
   */
  static async getLearningProgress(
    userId: string,
    subject?: string
  ): Promise<LearningProgress[]> {
    let query = supabase
      .from('dash_learning_progress')
      .select('*')
      .eq('user_id', userId)
      .order('last_activity_at', { ascending: false });

    if (subject) {
      query = query.eq('subject', subject);
    }

    const { data, error } = await query;

    if (error) {
      throw new QuizServiceError('Failed to load progress', 'load_failed', error);
    }

    return (data ?? []) as LearningProgress[];
  }

  /**
   * Get user's earned achievements.
   */
  static async getUserAchievements(userId: string): Promise<Achievement[]> {
    const { data, error } = await supabase
      .from('dash_user_achievements')
      .select('*, achievement:dash_achievements(*)')
      .eq('user_id', userId)
      .order('earned_at', { ascending: false });

    if (error) {
      throw new QuizServiceError('Failed to load achievements', 'load_failed', error);
    }

    return (data ?? []).map((ua: Record<string, unknown>) => ua.achievement as Achievement);
  }

  // ============================================
  // Private helpers
  // ============================================

  private static buildGenerationPrompt(config: QuizConfig & { questionCount: number; questionTypes: QuestionType[] }): string {
    const typeDescriptions: Record<string, string> = {
      multiple_choice: '4 options (A-D) with exactly one correct',
      true_false: 'True or False',
      fill_blank: 'Fill in the blank (single word or short phrase)',
      matching: '4 pairs to match (left column to right column)',
      letter_sound_match: 'Select the sound made by a letter (use sustained sounds like "sss", "mmm", "buh")',
      rhyme_match: 'Choose the word that rhymes with the target word',
      blend_word: 'Blend segmented sounds/letters into a full word (for example "c-a-t" -> "cat")',
      vowel_identify: 'Identify whether the vowel sound is short or long in a simple word',
    };

    const phonicsGrade = DashQuizService.isEarlyPhonicsGrade(config.gradeLevel);
    const typesRequested = config.questionTypes
      .map((t) => `${t}: ${typeDescriptions[t] ?? t}`)
      .join('\n  - ');

    return `Generate exactly ${config.questionCount} quiz questions for:

Subject: ${config.subject}
Topic: ${config.topic}
Grade Level: ${config.gradeLevel}
Difficulty: ${config.difficulty}
Language: ${config.language ?? 'en'}
${config.capsAligned ? 'Align with South African CAPS curriculum standards.' : ''}
${phonicsGrade ? 'Preschool phonics priority: focus on letter sounds, blending, rhymes, and short/long vowels.' : ''}

Question types to include:
  - ${typesRequested}

Distribute question types roughly evenly unless only one type is specified.

Respond ONLY with valid JSON in this exact format:
{
  "questions": [
    {
      "question_type": "multiple_choice",
      "question_text": "What is ...?",
      "correct_answer": "B",
      "options": [
        {"label": "A", "value": "First option"},
        {"label": "B", "value": "Correct option"},
        {"label": "C", "value": "Third option"},
        {"label": "D", "value": "Fourth option"}
      ],
      "explanation": "The answer is B because ...",
      "hints": ["Think about ...", "Consider ..."],
      "difficulty": "${config.difficulty}"
    },
    {
      "question_type": "true_false",
      "question_text": "Statement to evaluate",
      "correct_answer": "True",
      "options": [
        {"label": "A", "value": "True"},
        {"label": "B", "value": "False"}
      ],
      "explanation": "This is true because ...",
      "hints": ["Hint 1"],
      "difficulty": "${config.difficulty}"
    },
    {
      "question_type": "fill_blank",
      "question_text": "The ___ is the largest planet.",
      "correct_answer": "Jupiter",
      "explanation": "Jupiter is the largest planet in our solar system.",
      "hints": ["It starts with J", "It has a Great Red Spot"],
      "difficulty": "${config.difficulty}"
    },
    {
      "question_type": "matching",
      "question_text": "Match the items:",
      "correct_answer": "1-C,2-A,3-D,4-B",
      "matching_pairs": [
        {"left": "Item 1", "right": "Match C"},
        {"left": "Item 2", "right": "Match A"},
        {"left": "Item 3", "right": "Match D"},
        {"left": "Item 4", "right": "Match B"}
      ],
      "explanation": "Explanation of the matches.",
      "hints": ["Hint 1"],
      "difficulty": "${config.difficulty}"
    }
  ]
}

Requirements:
- Age-appropriate language for ${config.gradeLevel}
- Each question must have at least 1 hint
- Explanations should be educational and encouraging
- For fill_blank, accept reasonable synonyms
- For phonics questions, use sustained sounds ("sss", "mmm", "buh"), never spaced letters ("s s s")
- For blend_word, include segmented form and blended answer
- For vowel_identify, keep words simple (CVC or common sight words)
- No duplicate questions`;
  }

  /**
   * Parse AI response JSON into quiz questions.
   */
  static parseQuizResponse(content: string): AIQuizResponse {
    // Extract JSON from potential markdown code blocks
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [null, content];
    const raw = (jsonMatch[1] ?? content).trim();

    try {
      const parsed = JSON.parse(raw) as AIQuizResponse;
      if (!Array.isArray(parsed.questions)) {
        return { questions: [] };
      }

      // Validate each question has minimum required fields
      const valid = parsed.questions.filter(
        (q) => q.question_text && q.correct_answer && q.question_type
      );

      return { questions: valid };
    } catch {
      // Try to extract questions array from malformed JSON
      const arrayMatch = raw.match(/"questions"\s*:\s*(\[[\s\S]*\])/);
      if (arrayMatch) {
        try {
          const questions = JSON.parse(arrayMatch[1]) as AIQuizResponse['questions'];
          return { questions: questions.filter((q) => q.question_text && q.correct_answer) };
        } catch {
          return { questions: [] };
        }
      }
      return { questions: [] };
    }
  }

  /**
   * Save AI-generated questions to the database.
   */
  private static async saveQuestions(
    questions: AIQuizResponse['questions'],
    organizationId: string | null,
    createdBy: string,
    config: QuizConfig
  ): Promise<QuizQuestion[]> {
    const rows = questions.map((q) => ({
      organization_id: organizationId,
      created_by: createdBy,
      subject: config.subject,
      topic: config.topic,
      grade_level: config.gradeLevel,
      difficulty: q.difficulty ?? config.difficulty,
      question_type: q.question_type,
      question_text: q.question_text,
      correct_answer: q.correct_answer,
      options: q.options ?? q.matching_pairs ?? [],
      explanation: q.explanation ?? null,
      hints: q.hints ?? [],
      caps_aligned: config.capsAligned ?? false,
      language: config.language ?? 'en',
    }));

    const { data, error } = await supabase
      .from('dash_quiz_questions')
      .insert(rows)
      .select();

    if (error) {
      throw new QuizServiceError('Failed to save questions', 'save_failed', error);
    }

    return (data ?? []) as QuizQuestion[];
  }

  /**
   * Create a new quiz session.
   */
  private static async createSession(
    userId: string,
    organizationId: string | null,
    config: QuizConfig,
    questionIds: string[]
  ): Promise<string> {
    const { data, error } = await supabase
      .from('dash_quiz_sessions')
      .insert({
        user_id: userId,
        organization_id: organizationId,
        subject: config.subject,
        topic: config.topic,
        grade_level: config.gradeLevel,
        difficulty: config.difficulty,
        question_ids: questionIds,
        total_questions: questionIds.length,
        metadata: {
          time_limit: config.timeLimitSeconds ?? DEFAULT_TIME_LIMIT,
          question_types: config.questionTypes,
        },
      })
      .select('id')
      .single();

    if (error || !data) {
      throw new QuizServiceError('Failed to create session', 'create_failed', error);
    }

    return data.id as string;
  }

  /**
   * Check if an answer is correct, with fuzzy matching for fill_blank.
   */
  static checkAnswer(
    userAnswer: string,
    correctAnswer: string,
    questionType: string
  ): boolean {
    const normalizedUser = userAnswer.trim().toLowerCase();
    const normalizedCorrect = correctAnswer.trim().toLowerCase();

    if (questionType === 'fill_blank') {
      // Exact match first
      if (normalizedUser === normalizedCorrect) return true;

      // Fuzzy match using Levenshtein similarity
      const similarity = DashQuizService.stringSimilarity(normalizedUser, normalizedCorrect);
      return similarity >= FILL_BLANK_SIMILARITY_THRESHOLD;
    }

    if (questionType === 'blend_word') {
      const compactUser = normalizedUser.replace(/[^a-z]/g, '');
      const compactCorrect = normalizedCorrect.replace(/[^a-z]/g, '');
      if (!compactUser || !compactCorrect) return false;
      if (compactUser === compactCorrect) return true;
      return DashQuizService.stringSimilarity(compactUser, compactCorrect) >= PHONICS_SIMILARITY_THRESHOLD;
    }

    if (
      questionType === 'letter_sound_match' ||
      questionType === 'rhyme_match' ||
      questionType === 'vowel_identify'
    ) {
      if (normalizedUser === normalizedCorrect) return true;
      return DashQuizService.stringSimilarity(normalizedUser, normalizedCorrect) >= PHONICS_SIMILARITY_THRESHOLD;
    }

    // For multiple_choice, true_false, matching — exact match
    return normalizedUser === normalizedCorrect;
  }

  /**
   * Calculate string similarity (Levenshtein-based, 0..1).
   */
  static stringSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (!a.length || !b.length) return 0;

    const maxLen = Math.max(a.length, b.length);
    const distance = DashQuizService.levenshteinDistance(a, b);
    return 1 - distance / maxLen;
  }

  /**
   * Levenshtein edit distance.
   */
  private static levenshteinDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0) as number[]);

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }

    return dp[m][n];
  }

  /**
   * Update learning progress after a session.
   * Returns mastery delta (change in mastery_score).
   */
  private static async updateLearningProgress(
    userId: string,
    organizationId: string | null,
    subject: string,
    topic: string,
    gradeLevel: string | null,
    correct: number,
    incorrect: number
  ): Promise<number> {
    // Load or create progress record
    const { data: existing } = await supabase
      .from('dash_learning_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('subject', subject)
      .eq('topic', topic)
      .single();

    const total = correct + incorrect;
    const sessionAccuracy = total > 0 ? (correct / total) * 100 : 0;
    const now = new Date().toISOString();

    if (existing) {
      const newTotalAttempts = existing.total_attempts + total;
      const newCorrect = existing.correct_count + correct;
      const newIncorrect = existing.incorrect_count + incorrect;

      // Weighted mastery: 70% historical + 30% current session
      const newMastery = Math.min(
        100,
        existing.mastery_score * 0.7 + sessionAccuracy * 0.3
      );
      const delta = newMastery - existing.mastery_score;

      // Streak
      const lastActivity = existing.last_activity_at ? new Date(existing.last_activity_at) : null;
      const today = new Date();
      const isConsecutiveDay =
        lastActivity &&
        today.getTime() - lastActivity.getTime() < 48 * 60 * 60 * 1000 &&
        today.toDateString() !== lastActivity.toDateString();
      const newStreak = isConsecutiveDay ? existing.streak_current + 1 : 1;
      const bestStreak = Math.max(existing.streak_best, newStreak);

      // Determine skill level
      const newSkillLevel = DashQuizService.calculateSkillLevel(newMastery);

      await supabase
        .from('dash_learning_progress')
        .update({
          total_attempts: newTotalAttempts,
          correct_count: newCorrect,
          incorrect_count: newIncorrect,
          mastery_score: Math.round(newMastery * 100) / 100,
          skill_level: newSkillLevel,
          streak_current: newStreak,
          streak_best: bestStreak,
          last_activity_at: now,
          updated_at: now,
        })
        .eq('id', existing.id);

      return Math.round(delta * 100) / 100;
    }

    // Create new progress record
    const initialMastery = sessionAccuracy;
    const skillLevel = DashQuizService.calculateSkillLevel(initialMastery);

    await supabase.from('dash_learning_progress').insert({
      user_id: userId,
      organization_id: organizationId,
      subject,
      topic,
      grade_level: gradeLevel,
      skill_level: skillLevel,
      mastery_score: Math.round(initialMastery * 100) / 100,
      total_attempts: total,
      correct_count: correct,
      incorrect_count: incorrect,
      streak_current: 1,
      streak_best: 1,
      last_activity_at: now,
    });

    return Math.round(initialMastery * 100) / 100;
  }

  /**
   * Calculate skill level from mastery score.
   */
  static calculateSkillLevel(mastery: number): SkillLevel {
    if (mastery >= SKILL_THRESHOLDS.mastery) return 'mastery';
    if (mastery >= SKILL_THRESHOLDS.advanced) return 'advanced';
    if (mastery >= SKILL_THRESHOLDS.proficient) return 'proficient';
    if (mastery >= SKILL_THRESHOLDS.developing) return 'developing';
    return 'beginner';
  }

  /**
   * Check and award any new achievements.
   */
  private static async checkAchievements(
    userId: string,
    session: QuizSession
  ): Promise<Achievement[]> {
    // Load all achievements
    const { data: allAchievements } = await supabase
      .from('dash_achievements')
      .select('*');

    if (!allAchievements?.length) return [];

    // Load already earned
    const { data: earned } = await supabase
      .from('dash_user_achievements')
      .select('achievement_id')
      .eq('user_id', userId);

    const earnedIds = new Set((earned ?? []).map((e: Record<string, unknown>) => e.achievement_id));
    const newAchievements: Achievement[] = [];

    // Load user stats for achievement checks
    const { data: progressList } = await supabase
      .from('dash_learning_progress')
      .select('*')
      .eq('user_id', userId);

    const totalCorrect = (progressList ?? []).reduce(
      (sum: number, p: Record<string, unknown>) => sum + (Number(p.correct_count) || 0),
      0
    );
    const topicsMastered = (progressList ?? []).filter(
      (p: Record<string, unknown>) => Number(p.mastery_score) >= MASTERY_THRESHOLD
    ).length;
    const bestStreak = Math.max(
      ...(progressList ?? []).map((p: Record<string, unknown>) => Number(p.streak_best) || 0),
      0
    );

    const isPerfect = session.total_questions > 0 && session.correct_answers === session.total_questions;

    // Count perfect quizzes
    const { count: perfectCount } = await supabase
      .from('dash_quiz_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'completed')
      .gte('score', 100);

    for (const achievement of allAchievements as Achievement[]) {
      if (earnedIds.has(achievement.id)) continue;

      let met = false;

      switch (achievement.requirement_type) {
        case 'questions_answered':
          met = totalCorrect >= achievement.requirement_value;
          break;
        case 'perfect_quiz':
          met = isPerfect && (perfectCount ?? 0) >= achievement.requirement_value;
          break;
        case 'streak_days':
          met = bestStreak >= achievement.requirement_value;
          break;
        case 'topics_mastered':
          met = topicsMastered >= achievement.requirement_value;
          break;
        case 'speed_run':
          met = session.time_spent_seconds > 0 &&
                session.time_spent_seconds <= achievement.requirement_value &&
                session.total_questions >= 5;
          break;
        case 'quiz_score':
          if (achievement.requirement_subject) {
            const subjectCorrect = (progressList ?? [])
              .filter((p: Record<string, unknown>) => p.subject === achievement.requirement_subject)
              .reduce((sum: number, p: Record<string, unknown>) => sum + (Number(p.correct_count) || 0), 0);
            met = subjectCorrect >= achievement.requirement_value;
          } else {
            met = totalCorrect >= achievement.requirement_value;
          }
          break;
      }

      if (met) {
        const { error } = await supabase.from('dash_user_achievements').insert({
          user_id: userId,
          achievement_id: achievement.id,
          metadata: { session_id: session.id },
        });
        if (!error) {
          newAchievements.push(achievement);
        }
      }
    }

    return newAchievements;
  }

  /**
   * Schedule spaced repetition reviews for incorrect answers using SM-2 algorithm.
   */
  private static async scheduleReviews(
    userId: string,
    sessionId: string
  ): Promise<string[]> {
    // Get incorrect answers
    const { data: answers } = await supabase
      .from('dash_quiz_answers')
      .select('question_id')
      .eq('session_id', sessionId)
      .eq('is_correct', false);

    if (!answers?.length) return [];

    const questionIds = answers.map((a: Record<string, unknown>) => a.question_id as string);

    for (const questionId of questionIds) {
      // Upsert review schedule
      const { data: existing } = await supabase
        .from('dash_review_schedule')
        .select('*')
        .eq('user_id', userId)
        .eq('question_id', questionId)
        .single();

      if (existing) {
        // Update with SM-2: quality 1 (incorrect, needs more review)
        const updated = DashQuizService.sm2Update(existing as ReviewSchedule, 1);
        await supabase
          .from('dash_review_schedule')
          .update({
            ease_factor: updated.easeFactor,
            repetitions: updated.repetitions,
            interval_days: updated.intervalDays,
            next_review_date: updated.nextReviewDate,
            last_reviewed_at: new Date().toISOString(),
            quality_history: [...(existing.quality_history ?? []), 1],
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
        // Create new review entry — review tomorrow
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);

        await supabase.from('dash_review_schedule').insert({
          user_id: userId,
          question_id: questionId,
          ease_factor: SM2_INITIAL_EASE,
          repetitions: 0,
          interval_days: 1,
          next_review_date: tomorrow.toISOString().split('T')[0],
          quality_history: [1],
        });
      }
    }

    return questionIds;
  }

  /**
   * SM-2 spaced repetition algorithm.
   *
   * Quality: 0 = blackout, 1 = incorrect, 2 = hard, 3 = ok,
   *          4 = good recall, 5 = perfect recall
   */
  static sm2Update(
    current: ReviewSchedule,
    quality: number
  ): { easeFactor: number; repetitions: number; intervalDays: number; nextReviewDate: string } {
    let ef = current.ease_factor;
    let reps = current.repetitions;
    let interval: number;

    if (quality < 3) {
      // Failed — reset repetitions
      reps = 0;
      interval = 1;
    } else {
      // Passed — increase interval
      reps += 1;
      if (reps === 1) {
        interval = 1;
      } else if (reps === 2) {
        interval = 6;
      } else {
        interval = Math.round(current.interval_days * ef);
      }
    }

    // Update ease factor
    ef = ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    ef = Math.max(SM2_MIN_EASE, ef);

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + interval);

    return {
      easeFactor: Math.round(ef * 100) / 100,
      repetitions: reps,
      intervalDays: interval,
      nextReviewDate: nextDate.toISOString().split('T')[0],
    };
  }
}

// ============================================
// Error class
// ============================================

export class QuizServiceError extends Error {
  code: string;
  cause?: unknown;

  constructor(message: string, code: string, cause?: unknown) {
    super(message);
    this.name = 'QuizServiceError';
    this.code = code;
    this.cause = cause;
  }
}
