/**
 * Game Player Hook
 * Manages round-by-round game state: timer, scoring, and submission.
 * ≤200 lines (WARP)
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { K12Game, K12GameRound } from '@/lib/activities/k12Activities.types';
import { calculateStars } from '@/lib/activities/k12Activities.types';
import { useSubmitSession } from './useStudentGameHub';

export type GamePhase = 'ready' | 'playing' | 'reviewing' | 'complete';

export interface GameState {
  phase: GamePhase;
  currentRound: number;
  answers: Record<string, string>;
  correctCount: number;
  totalXP: number;
  timeElapsed: number;
  stars: number;
}

const INITIAL_STATE: GameState = {
  phase: 'ready',
  currentRound: 0,
  answers: {},
  correctCount: 0,
  totalXP: 0,
  timeElapsed: 0,
  stars: 0,
};

export function useGamePlayer(game: K12Game | null, assignmentId: string | null) {
  const [state, setState] = useState<GameState>(INITIAL_STATE);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const timerRunning = useRef(false);
  const submitSession = useSubmitSession();

  // ── Timer (runs continuously from start → complete) ─────────
  useEffect(() => {
    if (state.phase === 'playing' && !timerRunning.current) {
      timerRunning.current = true;
      startTimeRef.current = Date.now() - state.timeElapsed * 1000;
      timerRef.current = setInterval(() => {
        setState(prev => ({
          ...prev,
          timeElapsed: Math.floor((Date.now() - startTimeRef.current) / 1000),
        }));
      }, 1000);
    }
    if (state.phase === 'complete' || state.phase === 'ready') {
      timerRunning.current = false;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state.phase]);

  // ── Global time limit (mental_math sprint) ──────────────────
  useEffect(() => {
    if (
      game?.globalTimeLimitSeconds &&
      state.phase === 'playing' &&
      state.timeElapsed >= game.globalTimeLimitSeconds
    ) {
      finishGame();
    }
  }, [state.timeElapsed, state.phase, game?.globalTimeLimitSeconds]);

  const rounds = game?.rounds ?? [];
  const currentGameRound: K12GameRound | null = rounds[state.currentRound] ?? null;

  const startGame = useCallback(() => {
    startTimeRef.current = Date.now();
    setState({ ...INITIAL_STATE, phase: 'playing' });
  }, []);

  const answerRound = useCallback(
    (optionId: string) => {
      const round = rounds[state.currentRound];
      if (!round?.options) return;
      const isCorrect = round.options.find(o => o.id === optionId)?.isCorrect ?? false;
      setState(prev => ({
        ...prev,
        answers: { ...prev.answers, [round.id]: optionId },
        correctCount: prev.correctCount + (isCorrect ? 1 : 0),
        totalXP: prev.totalXP + (isCorrect ? round.xpReward : 0),
        phase: 'reviewing',
      }));
    },
    [rounds, state.currentRound],
  );

  const answerMatrix = useCallback(
    (correct: boolean) => {
      const round = rounds[state.currentRound];
      if (!round) return;
      setState(prev => ({
        ...prev,
        answers: { ...prev.answers, [round.id]: correct ? 'correct' : 'wrong' },
        correctCount: prev.correctCount + (correct ? 1 : 0),
        totalXP: prev.totalXP + (correct ? round.xpReward : 0),
        phase: 'reviewing',
      }));
    },
    [rounds, state.currentRound],
  );

  const nextRound = useCallback(() => {
    setState(prev => {
      const next = prev.currentRound + 1;
      if (next >= rounds.length) {
        return {
          ...prev,
          phase: 'complete',
          stars: calculateStars(prev.correctCount, rounds.length),
        };
      }
      return { ...prev, currentRound: next, phase: 'playing' };
    });
  }, [rounds.length]);

  const finishGame = useCallback(() => {
    setState(prev => ({
      ...prev,
      phase: 'complete',
      stars: calculateStars(prev.correctCount, rounds.length),
    }));
  }, [rounds.length]);

  const submitResults = useCallback(async () => {
    if (!game) return;
    const maxScore = rounds.reduce((sum, r) => sum + r.xpReward, 0);
    await submitSession.mutateAsync({
      assignmentId,
      gameId: game.id,
      score: state.totalXP,
      maxScore,
      correctAnswers: state.correctCount,
      totalQuestions: rounds.length,
      timeSpentSeconds: state.timeElapsed,
      stars: state.stars,
      xpEarned: state.totalXP,
      subject: game.subject,
    });
  }, [assignmentId, game, state, submitSession, rounds]);

  const isAnswerCorrect = useCallback(
    (roundId: string): boolean | null => {
      const answerId = state.answers[roundId];
      if (!answerId) return null;
      if (answerId === 'correct') return true;
      if (answerId === 'wrong') return false;
      const round = rounds.find(r => r.id === roundId);
      return round?.options?.find(o => o.id === answerId)?.isCorrect ?? false;
    },
    [state.answers, rounds],
  );

  return {
    state,
    currentGameRound,
    startGame,
    answerRound,
    answerMatrix,
    nextRound,
    finishGame,
    submitResults,
    isAnswerCorrect,
    isSubmitting: submitSession.isPending,
  };
}
