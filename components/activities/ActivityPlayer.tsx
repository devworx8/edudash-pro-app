import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Animated } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useCelebration } from '@/hooks/useCelebration';
import type { PreschoolActivity, ActivityResult, ActivityRound } from '@/lib/activities/preschoolActivities.types';
import type { UsePlaygroundAudioReturn } from '@/hooks/usePlaygroundAudio';
import {
  createAdaptiveState,
  recordCorrect,
  recordWrong,
  applyAdaptive,
  getAdaptiveLabel,
  type AdaptiveState,
} from '@/lib/activities/adaptiveDifficulty';
import { clampPercent } from '@/lib/progress/clampPercent';
import { createActivityPlayerStyles } from './ActivityPlayer.styles';
import { DASH_CHEERS, MAX_WRONG, NUMBER_WORDS } from './ActivityPlayer.constants';
import { ActivityPlayerView } from './ActivityPlayerView';

interface ActivityPlayerProps {
  activity: PreschoolActivity;
  childId: string;
  onComplete: (result: ActivityResult) => void;
  onClose: () => void;
  onSpeak?: (text: string) => void;
  audio?: UsePlaygroundAudioReturn;
}

export function ActivityPlayer({ activity, childId, onComplete, onClose, onSpeak, audio }: ActivityPlayerProps) {
  const { theme } = useTheme();
  const styles = createActivityPlayerStyles(theme);
  const { successHaptic, errorHaptic, milestoneHaptic, selectionHaptic } = useCelebration();

  const [roundIndex, setRoundIndex] = useState(0);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [startTime] = useState(Date.now());
  const [usedHints, setUsedHints] = useState(false);
  const [dashMessage, setDashMessage] = useState<string | null>(null);
  const [autoRevealed, setAutoRevealed] = useState(false);
  const [adaptiveState, setAdaptiveState] = useState<AdaptiveState>(createAdaptiveState);

  const bounceAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const starAnim = useRef(new Animated.Value(0)).current;
  const celebrationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rawRound = activity.rounds[roundIndex] as ActivityRound | undefined;
  const currentRound = useMemo(
    () => (rawRound ? applyAdaptive(rawRound, adaptiveState, roundIndex) : undefined),
    [rawRound, adaptiveState, roundIndex],
  );
  const isLastRound = roundIndex >= activity.rounds.length - 1;
  const progress = (roundIndex + 1) / activity.rounds.length;
  const progressPercent = clampPercent(progress * 100, {
    source: 'components/activities/ActivityPlayer.progress',
  });
  const movementDuration = useMemo(() => {
    if (!currentRound?.movements?.length || !currentRound.timedConfirm) return 0;
    return currentRound.movements.reduce((sum, movement) => sum + movement.durationSeconds, 0);
  }, [currentRound]);
  const isMemoryRound = activity.gameType === 'memory_flip' && !!currentRound?.memoryPairs?.length;
  const isTimedMovement = movementDuration > 0;
  const adaptiveLabel = getAdaptiveLabel(adaptiveState);

  useEffect(() => () => {
    if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
    audio?.stopAll();
  }, []);

  useEffect(() => {
    if (currentRound && onSpeak) {
      const speakText = currentRound.prompt.replace(/[^\w\s!?.,']/g, '');
      onSpeak(speakText);
      if (activity.gameType === 'emoji_counting' && currentRound.emojiGrid?.length) {
        setTimeout(() => onSpeak('Tap each one to count them!'), 2500);
      }
    }
    setSelectedOptionId(null);
    setShowHint(false);
    setShowCelebration(false);
    setWrongAttempts(0);
    setAutoRevealed(false);
    setDashMessage(null);
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    if (roundIndex > 0) audio?.playSound('whoosh');
  }, [roundIndex]);

  useEffect(() => {
    if (!showCelebration) return;
    celebrationTimer.current = setTimeout(() => {
      handleNext();
    }, 8000);
    return () => {
      if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
    };
  }, [showCelebration]);

  const animateBounce = useCallback(() => {
    Animated.sequence([
      Animated.timing(bounceAnim, { toValue: 1.2, duration: 120, useNativeDriver: true }),
      Animated.timing(bounceAnim, { toValue: 0.95, duration: 80, useNativeDriver: true }),
      Animated.timing(bounceAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
  }, [bounceAnim]);

  const animateStars = useCallback(() => {
    starAnim.setValue(0);
    Animated.spring(starAnim, { toValue: 1, friction: 4, useNativeDriver: true }).start();
  }, [starAnim]);

  const showEncouragement = useCallback(() => {
    const cheer = DASH_CHEERS[Math.floor(Math.random() * DASH_CHEERS.length)];
    setDashMessage(cheer);
    setTimeout(() => setDashMessage(null), 2500);
  }, []);

  const autoReveal = useCallback(() => {
    const correctOption = currentRound?.options?.find((option) => option.isCorrect);
    if (!correctOption) return;
    setAutoRevealed(true);
    setSelectedOptionId(correctOption.id);
    setShowCelebration(true);
    setCorrectCount((count) => count + 1);
    animateBounce();
    successHaptic();
    audio?.playSound('correct');
    const helpText = `That's okay! The answer is ${correctOption.label}. You'll get it next time!`;
    setDashMessage(helpText);
    onSpeak?.(helpText);
  }, [audio, currentRound, onSpeak, successHaptic, animateBounce]);

  const handleOptionPress = useCallback((optionId: string) => {
    if (showCelebration || autoRevealed) return;
    selectionHaptic();

    const option = currentRound?.options?.find((currentOption) => currentOption.id === optionId);
    if (!option) return;
    setSelectedOptionId(optionId);

    if (option.isCorrect) {
      setCorrectCount((count) => count + 1);
      setShowCelebration(true);
      setAdaptiveState((state) => recordCorrect(state));
      animateBounce();
      successHaptic();
      audio?.playSound('correct');
      if (onSpeak && currentRound?.celebration) onSpeak(currentRound.celebration);
      return;
    }

    const newWrong = wrongAttempts + 1;
    const hintThreshold = currentRound?.minWrongForHint ?? 1;
    const shouldShowHint = newWrong >= hintThreshold;
    setWrongAttempts(newWrong);
    setShowHint(shouldShowHint);
    setAdaptiveState((state) => recordWrong(state));
    if (shouldShowHint) setUsedHints(true);
    errorHaptic();
    audio?.playSound('wrong');

    if (newWrong >= MAX_WRONG) {
      setTimeout(() => autoReveal(), 1200);
    } else {
      setTimeout(() => setSelectedOptionId(null), 800);
    }
  }, [
    audio,
    autoRevealed,
    autoReveal,
    currentRound,
    errorHaptic,
    onSpeak,
    selectionHaptic,
    showCelebration,
    successHaptic,
    wrongAttempts,
    animateBounce,
  ]);

  const handleConfirm = useCallback(() => {
    setCorrectCount((count) => count + 1);
    setShowCelebration(true);
    animateBounce();
    successHaptic();
    audio?.playSound('celebrate');
    if (onSpeak && currentRound?.celebration) onSpeak(currentRound.celebration);
  }, [audio, currentRound, onSpeak, successHaptic, animateBounce]);

  const handleTimerComplete = useCallback(() => {
    audio?.playSound('celebrate');
    handleConfirm();
  }, [audio, handleConfirm]);

  const handleFinalCountdown = useCallback(() => {
    audio?.playSound('countdown');
  }, [audio]);

  const handleMemoryFlip = useCallback(() => {
    audio?.playSound('flip');
  }, [audio]);

  const handleMemoryMatch = useCallback(() => {
    audio?.playSound('match');
  }, [audio]);

  const handleMemoryMismatch = useCallback(() => {
    audio?.playSound('wrong');
  }, [audio]);

  const handleMemoryComplete = useCallback((moves: number) => {
    setCorrectCount((count) => count + 1);
    setShowCelebration(true);
    animateBounce();
    successHaptic();
    audio?.playSound('celebrate');
    setDashMessage(`Amazing memory! You did it in ${moves} flips! 🧠`);
    if (onSpeak && currentRound?.celebration) onSpeak(currentRound.celebration);
  }, [audio, currentRound, onSpeak, successHaptic, animateBounce]);

  const handleCountTap = useCallback((count: number) => {
    audio?.playSound('tap');
    const numberWord = NUMBER_WORDS[count - 1];
    if (numberWord) onSpeak?.(`${numberWord}!`);
  }, [audio, onSpeak]);

  const handleCountComplete = useCallback((total: number) => {
    audio?.playSound('celebrate');
    const message = `You counted ${total}! 🌟 Now pick the right number!`;
    setDashMessage(message);
    onSpeak?.(`Great counting! You counted ${total}! Now pick the right number!`);
  }, [audio, onSpeak]);

  const handleNext = useCallback(() => {
    if (celebrationTimer.current) clearTimeout(celebrationTimer.current);

    if (isLastRound) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const totalRounds = activity.rounds.length;
      const ratio = correctCount / Math.max(1, totalRounds);
      const stars = ratio >= 0.9 ? 3 : ratio >= 0.6 ? 2 : 1;

      animateStars();
      milestoneHaptic();
      for (let index = 0; index < stars; index += 1) {
        setTimeout(() => audio?.playSound('star'), index * 300);
      }
      if (onSpeak) onSpeak(activity.dashCelebration);

      setTimeout(() => {
        onComplete({
          activityId: activity.id,
          childId,
          totalRounds,
          correctAnswers: correctCount,
          timeSpentSeconds: elapsed,
          completedAt: new Date().toISOString(),
          stars,
          usedHints,
        });
      }, 1500);
      return;
    }

    showEncouragement();
    setTimeout(() => setRoundIndex((index) => index + 1), 600);
  }, [
    activity,
    animateStars,
    audio,
    childId,
    correctCount,
    isLastRound,
    milestoneHaptic,
    onComplete,
    onSpeak,
    showEncouragement,
    startTime,
    usedHints,
  ]);

  if (!currentRound) return null;

  return (
    <ActivityPlayerView
      activity={activity}
      currentRound={currentRound}
      roundIndex={roundIndex}
      adaptiveLabel={adaptiveLabel}
      progressPercent={progressPercent}
      dashMessage={dashMessage}
      isMemoryRound={isMemoryRound}
      isTimedMovement={isTimedMovement}
      movementDuration={movementDuration}
      showCelebration={showCelebration}
      autoRevealed={autoRevealed}
      selectedOptionId={selectedOptionId}
      wrongAttempts={wrongAttempts}
      showHint={showHint}
      isLastRound={isLastRound}
      fadeAnim={fadeAnim}
      bounceAnim={bounceAnim}
      styles={styles}
      onClose={onClose}
      onCountTap={handleCountTap}
      onCountComplete={handleCountComplete}
      onMemoryFlip={handleMemoryFlip}
      onMemoryMatch={handleMemoryMatch}
      onMemoryMismatch={handleMemoryMismatch}
      onMemoryComplete={handleMemoryComplete}
      onTimerComplete={handleTimerComplete}
      onFinalCountdown={handleFinalCountdown}
      onOptionPress={handleOptionPress}
      onConfirm={handleConfirm}
      onNext={handleNext}
    />
  );
}
