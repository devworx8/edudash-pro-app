/**
 * K-12 Game Engine — Type Definitions
 *
 * Covers grades 4–12, CAPS-aligned subjects.
 * Designed for teacher-assigned challenges and free play.
 */

export type K12GameType =
  | 'mental_math'     // Timed arithmetic sprint
  | 'maths_lit'       // Real-world SA scenario questions
  | 'spelling_bee'    // See/hear word, select correct spelling
  | 'word_scramble'   // Unscramble jumbled letters (MCQ)
  | 'vocab_match'     // Match definition to term
  | 'logic_sequence'  // Complete the number/shape pattern
  | 'memory_matrix'   // Memorise a grid, then reproduce
  | 'science_quiz'    // CAPS Life/Physical Science MCQ
  | 'geography_quiz'  // SA-focused geography MCQ
  | 'history_mcq';    // CAPS History MCQ

export type K12Subject =
  | 'mathematics'
  | 'maths_literacy'
  | 'english'
  | 'afrikaans'
  | 'life_science'
  | 'physical_science'
  | 'geography'
  | 'history'
  | 'technology'
  | 'general';

export type K12Difficulty = 'easy' | 'medium' | 'hard';

export type K12GradeRange = '4-6' | '7-9' | '10-12' | '4-9' | '7-12' | '4-12';

export interface K12GameOption {
  id: string;
  label: string;
  isCorrect: boolean;
}

export interface K12GameRound {
  id: string;
  question: string;
  /** Sub-context shown below question (e.g. SA rand scenario) */
  subText?: string;
  options?: K12GameOption[];
  /** For memory_matrix — flat array of true/false cells */
  matrixPattern?: boolean[];
  /** Grid dimension (matrixSize × matrixSize) */
  matrixSize?: number;
  hint?: string;
  /** Shown after the answer is revealed */
  explanation?: string;
  xpReward: number;
}

export interface K12Game {
  id: string;
  title: string;
  description: string;
  emoji: string;
  gameType: K12GameType;
  subject: K12Subject;
  gradeRange: K12GradeRange;
  difficulty: K12Difficulty;
  durationMinutes: number;
  gradient: [string, string];
  rounds: K12GameRound[];
  /** Per-game countdown in seconds (mental_math sprint) */
  globalTimeLimitSeconds?: number;
  tags: string[];
  /**
   * Gates which TEACHER tier can assign this game to a class.
   * Does NOT restrict student free-play — students are always free tier.
   * null = any teacher can assign it.
   */
  requiresTier?: 'starter' | 'premium' | null;
  teacherNotes?: string;
}

export interface K12GameAssignmentRow {
  id: string;
  game_id: string;
  class_id: string;
  teacher_id: string;
  difficulty: K12Difficulty;
  due_date: string | null;
  is_challenge: boolean;
  show_leaderboard: boolean;
  max_attempts: number;
  status: 'active' | 'closed' | 'archived';
  assigned_at: string;
  class?: { id: string; name: string } | null;
}

export interface K12GameSessionRow {
  id: string;
  assignment_id: string | null;
  student_id: string;
  game_id: string;
  score: number;
  max_score: number;
  correct_answers: number;
  total_questions: number;
  time_spent_seconds: number;
  stars: number;
  xp_earned: number;
  completed_at: string;
}

export interface K12StudentXPRow {
  student_id: string;
  total_xp: number;
  level: number;
  current_streak: number;
  longest_streak: number;
  last_played_at: string | null;
  subject_xp: Partial<Record<K12Subject, number>>;
}

// ── Derived helpers ──────────────────────────────────────

export function xpToLevel(xp: number): number {
  if (xp < 200) return 1;
  if (xp < 500) return 2;
  if (xp < 1000) return 3;
  if (xp < 2000) return 4;
  if (xp < 4000) return 5;
  if (xp < 7000) return 6;
  if (xp < 11000) return 7;
  if (xp < 16000) return 8;
  if (xp < 22000) return 9;
  return 10;
}

export function xpForNextLevel(currentLevel: number): number {
  const thresholds = [0, 200, 500, 1000, 2000, 4000, 7000, 11000, 16000, 22000, Infinity];
  return thresholds[Math.min(currentLevel, 10)];
}

export function calculateStars(correct: number, total: number): number {
  const pct = total > 0 ? correct / total : 0;
  if (pct >= 0.9) return 3;
  if (pct >= 0.7) return 2;
  if (pct >= 0.5) return 1;
  return 0;
}

export const SUBJECT_LABELS: Record<K12Subject, { label: string; emoji: string; color: string }> = {
  mathematics:       { label: 'Mathematics',       emoji: '🔢', color: '#4F46E5' },
  maths_literacy:    { label: 'Maths Literacy',    emoji: '💰', color: '#0D9488' },
  english:           { label: 'English',           emoji: '📖', color: '#2563EB' },
  afrikaans:         { label: 'Afrikaans',         emoji: '🇿🇦', color: '#7C3AED' },
  life_science:      { label: 'Life Science',      emoji: '🧬', color: '#16A34A' },
  physical_science:  { label: 'Physical Science',  emoji: '⚗️', color: '#DC2626' },
  geography:         { label: 'Geography',         emoji: '🌍', color: '#EA580C' },
  history:           { label: 'History',           emoji: '📜', color: '#92400E' },
  technology:        { label: 'Technology',        emoji: '💻', color: '#0891B2' },
  general:           { label: 'General',           emoji: '🎯', color: '#6B7280' },
};

export const GRADE_RANGE_LABELS: Record<K12GradeRange, string> = {
  '4-6':  'Grade 4–6',
  '7-9':  'Grade 7–9',
  '10-12': 'Grade 10–12',
  '4-9':  'Grade 4–9',
  '7-12': 'Grade 7–12',
  '4-12': 'Grade 4–12',
};
