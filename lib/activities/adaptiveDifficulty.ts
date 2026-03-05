/**
 * Adaptive Difficulty — In-session difficulty adjustment
 *
 * Tracks correct/wrong streaks within a single activity session and
 * dynamically adjusts the current round's difficulty:
 * - 3 consecutive correct → add a distractor option, lower hint threshold
 * - 2 consecutive wrong → remove a distractor, show hints sooner
 *
 * Pure functions — no side effects, no hooks.
 * ≤200 lines (WARP.md compliant)
 */

import type { ActivityOption, ActivityRound } from './preschoolActivities.types';

// ── State ────────────────────────────────────────────────────

export interface AdaptiveState {
  /** Running streak of consecutive correct answers (resets on wrong) */
  correctStreak: number;
  /** Running streak of consecutive wrong answers (resets on correct) */
  wrongStreak: number;
  /** Net adjustment applied: positive = harder, negative = easier */
  adjustment: number;
  /** Total correct so far */
  totalCorrect: number;
  /** Total wrong so far */
  totalWrong: number;
}

const STREAK_TO_HARDER = 3;
const STREAK_TO_EASIER = 2;
const MAX_ADJUSTMENT = 2;
const MIN_ADJUSTMENT = -2;

const FALLBACK_LABELS = ['Hmm...', 'Tricky!', 'Nope!', 'Not this'];

export function createAdaptiveState(): AdaptiveState {
  return {
    correctStreak: 0,
    wrongStreak: 0,
    adjustment: 0,
    totalCorrect: 0,
    totalWrong: 0,
  };
}

// ── Update ───────────────────────────────────────────────────

export function recordCorrect(state: AdaptiveState): AdaptiveState {
  const correctStreak = state.correctStreak + 1;
  const newAdjustment =
    correctStreak >= STREAK_TO_HARDER
      ? Math.min(state.adjustment + 1, MAX_ADJUSTMENT)
      : state.adjustment;

  return {
    correctStreak: correctStreak >= STREAK_TO_HARDER ? 0 : correctStreak,
    wrongStreak: 0,
    adjustment: newAdjustment,
    totalCorrect: state.totalCorrect + 1,
    totalWrong: state.totalWrong,
  };
}

export function recordWrong(state: AdaptiveState): AdaptiveState {
  const wrongStreak = state.wrongStreak + 1;
  const newAdjustment =
    wrongStreak >= STREAK_TO_EASIER
      ? Math.max(state.adjustment - 1, MIN_ADJUSTMENT)
      : state.adjustment;

  return {
    correctStreak: 0,
    wrongStreak: wrongStreak >= STREAK_TO_EASIER ? 0 : wrongStreak,
    adjustment: newAdjustment,
    totalCorrect: state.totalCorrect,
    totalWrong: state.totalWrong + 1,
  };
}

// ── Apply to round ───────────────────────────────────────────

/**
 * Build a distractor option that doesn't duplicate existing labels.
 */
function buildDistractor(options: ActivityOption[], roundIndex: number): ActivityOption {
  const labels = new Set(options.map((o) => o.label));
  let candidate = FALLBACK_LABELS[roundIndex % FALLBACK_LABELS.length];
  let suffix = 1;
  while (labels.has(candidate)) {
    candidate = `${FALLBACK_LABELS[(roundIndex + suffix) % FALLBACK_LABELS.length]} ${suffix}`;
    suffix += 1;
  }
  return {
    id: `adaptive-${roundIndex}-${options.length}`,
    label: candidate,
    isCorrect: false,
  };
}

/**
 * Apply adaptive adjustment to a round's options.
 *
 * - Positive adjustment → add distractors, raise hint threshold
 * - Negative adjustment → remove wrong options, lower hint threshold
 * - Zero → return round unchanged
 */
export function applyAdaptive(
  round: ActivityRound,
  state: AdaptiveState,
  roundIndex: number,
): ActivityRound {
  const { adjustment } = state;
  if (adjustment === 0 || !round.options || round.confirmOnly) return round;

  let options = [...round.options];
  let minWrongForHint = round.minWrongForHint ?? 1;

  if (adjustment > 0) {
    // Harder: add distractors (up to +2)
    for (let i = 0; i < adjustment; i++) {
      if (options.length < 6) {
        options.push(buildDistractor(options, roundIndex + i));
      }
    }
    minWrongForHint = Math.min(minWrongForHint + 1, 4);
  } else {
    // Easier: remove wrong options (keep at least 2 total, 1 correct)
    const wrongOptions = options.filter((o) => !o.isCorrect);
    const toRemove = Math.min(Math.abs(adjustment), wrongOptions.length - 1);
    if (toRemove > 0) {
      const removeSet = new Set(wrongOptions.slice(-toRemove).map((o) => o.id));
      options = options.filter((o) => !removeSet.has(o.id));
    }
    minWrongForHint = Math.max(minWrongForHint - 1, 1);
  }

  return { ...round, options, minWrongForHint };
}

/**
 * Get a user-facing label describing the current adaptive state.
 */
export function getAdaptiveLabel(state: AdaptiveState): string | null {
  if (state.adjustment >= 2) return '🔥 Challenge Mode';
  if (state.adjustment >= 1) return '⬆️ Getting harder';
  if (state.adjustment <= -2) return '💪 Extra help on';
  if (state.adjustment <= -1) return '🤝 Made it easier';
  return null;
}
