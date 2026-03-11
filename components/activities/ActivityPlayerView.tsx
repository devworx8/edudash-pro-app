import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { PreschoolActivity, ActivityRound } from '@/lib/activities/preschoolActivities.types';
import { createActivityPlayerStyles } from './ActivityPlayer.styles';
import { AnimatedEmojiGrid } from './animated/AnimatedEmojiGrid';
import { AnimatedOptions } from './animated/AnimatedOptions';
import { CountdownTimer } from './animated/CountdownTimer';
import { MemoryFlipGrid } from './animated/MemoryFlipGrid';
import { clampPercent, percentWidth } from '@/lib/progress/clampPercent';

interface ActivityPlayerViewProps {
  activity: PreschoolActivity;
  currentRound: ActivityRound;
  roundIndex: number;
  adaptiveLabel: string;
  progressPercent: number;
  dashMessage: string | null;
  isMemoryRound: boolean;
  isTimedMovement: boolean;
  movementDuration: number;
  showCelebration: boolean;
  autoRevealed: boolean;
  selectedOptionId: string | null;
  wrongAttempts: number;
  showHint: boolean;
  isLastRound: boolean;
  fadeAnim: Animated.Value;
  bounceAnim: Animated.Value;
  styles: ReturnType<typeof createActivityPlayerStyles>;
  onClose: () => void;
  onCountTap: (count: number) => void;
  onCountComplete: (total: number) => void;
  onMemoryFlip: () => void;
  onMemoryMatch: () => void;
  onMemoryMismatch: () => void;
  onMemoryComplete: (moves: number) => void;
  onTimerComplete: () => void;
  onFinalCountdown: () => void;
  onOptionPress: (optionId: string) => void;
  onConfirm: () => void;
  onNext: () => void;
}

export function ActivityPlayerView({
  activity,
  currentRound,
  roundIndex,
  adaptiveLabel,
  progressPercent,
  dashMessage,
  isMemoryRound,
  isTimedMovement,
  movementDuration,
  showCelebration,
  autoRevealed,
  selectedOptionId,
  wrongAttempts,
  showHint,
  isLastRound,
  fadeAnim,
  bounceAnim,
  styles,
  onClose,
  onCountTap,
  onCountComplete,
  onMemoryFlip,
  onMemoryMatch,
  onMemoryMismatch,
  onMemoryComplete,
  onTimerComplete,
  onFinalCountdown,
  onOptionPress,
  onConfirm,
  onNext,
}: ActivityPlayerViewProps) {
  const safeProgressPercent = clampPercent(progressPercent, {
    source: 'components/activities/ActivityPlayerView.progress',
  });

  return (
    <View style={styles.container}>
      <LinearGradient colors={activity.gradient} style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.activityEmoji}>{activity.emoji}</Text>
            <View>
              <Text style={styles.headerTitle}>{activity.title}</Text>
              <Text style={styles.roundLabel}>
                Round {roundIndex + 1} of {activity.rounds.length}
                {adaptiveLabel ? `  •  ${adaptiveLabel}` : ''}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: percentWidth(safeProgressPercent) }]} />
        </View>
      </LinearGradient>

      {dashMessage && (
        <View style={styles.dashBubble}>
          <Text style={styles.dashBubbleEmoji}>🤖</Text>
          <View style={styles.dashBubbleContent}>
            <Text style={styles.dashBubbleText}>{dashMessage}</Text>
          </View>
        </View>
      )}

      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.prompt}>{currentRound.prompt}</Text>

          {isMemoryRound && currentRound.memoryPairs && (
            <MemoryFlipGrid
              pairs={currentRound.memoryPairs}
              roundId={currentRound.id}
              onFlip={onMemoryFlip}
              onMatch={onMemoryMatch}
              onMismatch={onMemoryMismatch}
              onComplete={onMemoryComplete}
              disabled={showCelebration}
            />
          )}

          {!isMemoryRound && currentRound.emojiGrid && currentRound.emojiGrid.length > 0 && (
            <AnimatedEmojiGrid
              emojis={currentRound.emojiGrid}
              gameType={activity.gameType}
              roundId={currentRound.id}
              onCountTap={onCountTap}
              onCountComplete={onCountComplete}
              disabled={showCelebration || autoRevealed}
            />
          )}

          {currentRound.movements && currentRound.movements.length > 0 && (
            <View style={styles.movementCard}>
              {currentRound.movements.map((movement, index) => (
                <View key={index} style={styles.movementRow}>
                  <Text style={styles.movementEmoji}>{movement.emoji}</Text>
                  <View style={styles.movementInfo}>
                    <Text style={styles.movementText}>{movement.instruction}</Text>
                    <Text style={styles.movementTime}>{movement.durationSeconds}s</Text>
                  </View>
                </View>
              ))}
              {isTimedMovement && !showCelebration && (
                <CountdownTimer
                  durationSeconds={movementDuration}
                  onComplete={onTimerComplete}
                  onFinalCountdown={onFinalCountdown}
                  color={activity.gradient[0]}
                />
              )}
            </View>
          )}

          {currentRound.options && !currentRound.confirmOnly && !isMemoryRound && (
            <AnimatedOptions
              options={currentRound.options}
              roundId={currentRound.id}
              selectedOptionId={selectedOptionId}
              autoRevealed={autoRevealed}
              showCelebration={showCelebration}
              wrongAttempts={wrongAttempts}
              onSelect={onOptionPress}
            />
          )}

          {currentRound.confirmOnly && !showCelebration && !isTimedMovement && !isMemoryRound && (
            <TouchableOpacity style={styles.confirmBtn} onPress={onConfirm} activeOpacity={0.8}>
              <Ionicons name="checkmark-done" size={24} color="#fff" />
              <Text style={styles.confirmText}>Done!</Text>
            </TouchableOpacity>
          )}

          {showHint && currentRound.hint && !showCelebration && !autoRevealed && (
            <View style={styles.hintCard}>
              <Ionicons name="bulb" size={20} color="#F59E0B" />
              <Text style={styles.hintText}>{currentRound.hint}</Text>
            </View>
          )}
        </ScrollView>
      </Animated.View>

      {showCelebration && (
        <View style={styles.celebrationOverlay}>
          <Animated.View style={[styles.celebrationCard, { transform: [{ scale: bounceAnim }] }]}>
            <Text style={styles.celebrationEmoji}>{autoRevealed ? '💪' : '🌟'}</Text>
            <Text style={styles.celebrationText}>
              {autoRevealed ? "That's a tricky one! Now you know!" : (currentRound.celebration || 'Great job!')}
            </Text>
            <TouchableOpacity style={styles.nextBtn} onPress={onNext} activeOpacity={0.85}>
              <Text style={styles.nextBtnText}>{isLastRound ? 'Finish! 🎉' : 'Next Round →'}</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}
    </View>
  );
}
