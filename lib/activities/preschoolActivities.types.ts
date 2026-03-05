/**
 * Preschool Activities — Type Definitions
 *
 * Types for interactive, child-centric activities designed for 3–5 year olds.
 * Used in the DashPlayground screen and Learning Hub.
 */

/** Supported activity game types */
export type ActivityGameType =
  | 'emoji_counting'     // Count emoji objects
  | 'color_match'        // Match colors to objects
  | 'shape_hunt'         // Identify shapes
  | 'sound_match'        // Match animals to sounds
  | 'letter_trace'       // Trace letters (tap-based)
  | 'pattern_complete'   // Complete the pattern
  | 'story_builder'      // Pick-a-path mini story
  | 'body_move'          // Physical movement activity
  | 'memory_flip'        // Memory card game
  | 'sorting_fun'        // Sort items into categories
  | 'rhyme_time'         // Find the rhyming word
  | 'size_order'         // Order items by size
  | 'emotion_match';     // Match faces/emojis to feelings

/** Difficulty levels for preschool range */
export type PreschoolDifficulty = 'easy' | 'medium' | 'tricky';

/** Age suitability within the 3-5 range */
export type AgeRange = '3-4' | '4-5' | '3-5';

/** Learning domain aligned to early childhood development */
export type LearningDomain =
  | 'numeracy'
  | 'literacy'
  | 'science'
  | 'creative_arts'
  | 'gross_motor'
  | 'fine_motor'
  | 'social_emotional'
  | 'cognitive';

/** A single option in a multiple-choice question */
export interface ActivityOption {
  id: string;
  label: string;
  emoji?: string;
  isCorrect: boolean;
}

/** A physical movement instruction (body_move type) */
export interface MovementStep {
  instruction: string;
  emoji: string;
  durationSeconds: number;
}

/** A memory-flip card pair */
export interface MemoryPair {
  emoji: string;
}

/** A single step/round in an activity */
export interface ActivityRound {
  id: string;
  prompt: string;
  /** Visual grid of emojis to display (for counting, pattern, etc.) */
  emojiGrid?: string[];
  /** Multiple-choice options */
  options?: ActivityOption[];
  /** Confirm-only step (tap "Done!" to proceed) */
  confirmOnly?: boolean;
  /** Movement steps for body_move activities */
  movements?: MovementStep[];
  /** Memory card pairs for memory_flip rounds */
  memoryPairs?: MemoryPair[];
  /** Auto-confirm when movement timer completes */
  timedConfirm?: boolean;
  /** Celebration text when completed */
  celebration?: string;
  /** Hint text shown after wrong answer */
  hint?: string;
  /** Wrong attempts required before showing hint */
  minWrongForHint?: number;
  /** Image URL if applicable */
  image?: string;
}

/** A complete preschool activity definition */
export interface PreschoolActivity {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  gameType: ActivityGameType;
  domain: LearningDomain;
  ageRange: AgeRange;
  difficulty: PreschoolDifficulty;
  durationMinutes: number;
  /** Gradient colors for the card */
  gradient: [string, string];
  /** Skills developed */
  skills: string[];
  /** Learning objective — shown to parents */
  learningObjective: string;
  /** Parent tip — how to extend the activity at home */
  parentTip: string;
  /** What Dash says to introduce the activity (voice-friendly) */
  dashIntro: string;
  /** What Dash says when child completes it */
  dashCelebration: string;
  /** The activity rounds/steps */
  rounds: ActivityRound[];
  /** Require a specific tier? (null = free) */
  requiresTier?: 'starter' | 'plus' | null;
  /** Dash follow-up prompt for AI conversation */
  dashFollowUp?: string;
}

/** Result of a completed activity */
export interface ActivityResult {
  activityId: string;
  childId: string;
  totalRounds: number;
  correctAnswers: number;
  timeSpentSeconds: number;
  completedAt: string;
  /** 0-3 star rating */
  stars: number;
  /** Did the child ask for hints? */
  usedHints: boolean;
}

/** Progress tracking per child */
export interface ChildActivityProgress {
  childId: string;
  completedActivities: string[];
  totalStars: number;
  streakDays: number;
  lastPlayedAt: string | null;
  favouriteDomain: LearningDomain | null;
}
