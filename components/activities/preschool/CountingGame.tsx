/**
 * Counting Game Component for Preschoolers
 * 
 * Fun counting activity where children count items and select
 * the correct number. Progressive difficulty.
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  ScrollView,
} from 'react-native';
import { useTheme } from '../../../contexts/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { assertSupabase } from '../../../lib/supabase';
import { percentWidth } from '@/lib/progress/clampPercent';

// ====================================================================
// TYPES
// ====================================================================

interface CountingItem {
  image: string;
  count: number;
}

interface CountingGameProps {
  /** Activity ID for tracking */
  activityId?: string;
  /** Student ID for recording attempts */
  studentId?: string;
  /** Title shown at top */
  title?: string;
  /** Instructions for the child */
  instructions?: string;
  /** The items to count */
  items: CountingItem[];
  /** Stars awarded on completion */
  starsReward?: number;
  /** Called when game completes */
  onComplete?: (result: GameResult) => void;
  /** Called when user exits */
  onExit?: () => void;
}

interface GameResult {
  completed: boolean;
  score: number;
  timeSpentSeconds: number;
  correctCount: number;
  totalItems: number;
}

// ====================================================================
// COMPONENT
// ====================================================================

export function CountingGame({
  activityId,
  studentId,
  title = 'Count with Me!',
  instructions = 'How many do you see?',
  items,
  starsReward = 2,
  onComplete,
  onExit,
}: CountingGameProps) {
  const { colors, isDark } = useTheme();
  const [startTime] = useState(Date.now());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const [bounceAnim] = useState(new Animated.Value(1));
  const [shakeAnim] = useState(new Animated.Value(0));

  const currentItem = items[currentIndex];

  // Generate answer options (correct + distractors)
  const answerOptions = useMemo(() => {
    if (!currentItem) return [];
    const correct = currentItem.count;
    const options = [correct];
    
    // Add distractors
    for (let delta of [-2, -1, 1, 2]) {
      const opt = correct + delta;
      if (opt > 0 && opt <= 10 && !options.includes(opt)) {
        options.push(opt);
      }
    }
    
    // Shuffle
    return options.sort(() => Math.random() - 0.5).slice(0, 4);
  }, [currentItem, currentIndex]);

  const playCorrectAnimation = useCallback(() => {
    Animated.sequence([
      Animated.spring(bounceAnim, { toValue: 1.3, useNativeDriver: true, friction: 3 }),
      Animated.spring(bounceAnim, { toValue: 1, useNativeDriver: true, friction: 3 }),
    ]).start();
  }, [bounceAnim]);

  const playWrongAnimation = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  const handleAnswer = useCallback((answer: number) => {
    if (showFeedback) return;
    
    setSelectedAnswer(answer);
    const correct = answer === currentItem.count;
    setIsCorrect(correct);
    setShowFeedback(true);

    if (correct) {
      setCorrectCount(prev => prev + 1);
      playCorrectAnimation();
    } else {
      playWrongAnimation();
    }

    // Advance after delay
    setTimeout(() => {
      setShowFeedback(false);
      setSelectedAnswer(null);
      
      if (currentIndex < items.length - 1) {
        setCurrentIndex(prev => prev + 1);
      } else {
        // Game complete
        const timeSpent = Math.round((Date.now() - startTime) / 1000);
        const finalCorrect = correct ? correctCount + 1 : correctCount;
        const score = Math.round((finalCorrect / items.length) * 100);
        
        setShowComplete(true);

        if (activityId && studentId) {
          recordAttempt(score, timeSpent, finalCorrect);
        }

        setTimeout(() => {
          onComplete?.({
            completed: true,
            score,
            timeSpentSeconds: timeSpent,
            correctCount: finalCorrect,
            totalItems: items.length,
          });
        }, 2500);
      }
    }, 1500);
  }, [currentItem, currentIndex, items.length, correctCount, showFeedback]);

  const recordAttempt = async (score: number, timeSpent: number, correct: number) => {
    try {
      const supabase = assertSupabase();
      await supabase.from('activity_attempts').insert({
        activity_id: activityId,
        student_id: studentId,
        status: 'completed',
        score,
        time_spent_seconds: timeSpent,
        stars_earned: score >= 70 ? starsReward : Math.floor(starsReward / 2),
        completed_at: new Date().toISOString(),
        answers: { correctCount: correct, totalItems: items.length },
      });
    } catch (error) {
      console.error('Error recording attempt:', error);
    }
  };

  // Completion screen
  if (showComplete) {
    const finalScore = Math.round((correctCount / items.length) * 100);
    const earnedStars = finalScore >= 70 ? starsReward : Math.floor(starsReward / 2);

    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.completeContainer}>
          <Text style={styles.completeEmoji}>
            {finalScore >= 90 ? '🏆' : finalScore >= 70 ? '🎉' : '👍'}
          </Text>
          <Text style={[styles.completeTitle, { color: colors.text }]}>
            {finalScore >= 90 ? 'Amazing!' : finalScore >= 70 ? 'Great Job!' : 'Good Try!'}
          </Text>
          <Text style={[styles.scoreText, { color: colors.text }]}>
            {correctCount} / {items.length} correct
          </Text>
          <View style={styles.starsEarned}>
            {[...Array(earnedStars)].map((_, i) => (
              <Text key={i} style={styles.starIcon}>⭐</Text>
            ))}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onExit} style={styles.exitButton}>
          <Ionicons name="close" size={28} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.progressContainer}>
          <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
            <View 
              style={[
                styles.progressFill, 
                { 
                  backgroundColor: colors.primary,
                  width: percentWidth(((currentIndex) / items.length) * 100) 
                }
              ]} 
            />
          </View>
          <Text style={[styles.progressText, { color: colors.textSecondary }]}>
            {currentIndex + 1} / {items.length}
          </Text>
        </View>
        <View style={styles.scoreContainer}>
          <Text style={styles.scoreEmoji}>⭐</Text>
          <Text style={[styles.scoreNum, { color: colors.text }]}>{correctCount}</Text>
        </View>
      </View>

      {/* Question */}
      <View style={styles.questionArea}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.instructions, { color: colors.textSecondary }]}>
          {instructions}
        </Text>

        {/* Items to count */}
        <Animated.View 
          style={[
            styles.itemsCard,
            { 
              backgroundColor: colors.cardBackground,
              transform: [{ translateX: shakeAnim }]
            }
          ]}
        >
          <Text style={styles.itemsEmoji}>{currentItem?.image}</Text>
          {showFeedback && (
            <View style={[
              styles.feedbackBadge,
              { backgroundColor: isCorrect ? '#4CAF50' : '#FF5252' }
            ]}>
              <Ionicons 
                name={isCorrect ? 'checkmark' : 'close'} 
                size={24} 
                color="#fff" 
              />
            </View>
          )}
        </Animated.View>
      </View>

      {/* Answer Options */}
      <View style={styles.answersGrid}>
        {answerOptions.map(num => {
          const isSelected = selectedAnswer === num;
          const showCorrect = showFeedback && num === currentItem.count;
          const showWrong = showFeedback && isSelected && !isCorrect;

          return (
            <Animated.View
              key={num}
              style={[
                showCorrect && { transform: [{ scale: bounceAnim }] }
              ]}
            >
              <TouchableOpacity
                onPress={() => handleAnswer(num)}
                disabled={showFeedback}
                style={[
                  styles.answerButton,
                  { backgroundColor: colors.cardBackground, borderColor: colors.border },
                  showCorrect && { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
                  showWrong && { backgroundColor: '#FF5252', borderColor: '#FF5252' },
                ]}
              >
                <Text 
                  style={[
                    styles.answerText,
                    { color: showCorrect || showWrong ? '#fff' : colors.text }
                  ]}
                >
                  {num}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

// ====================================================================
// STYLES
// ====================================================================

const { width } = Dimensions.get('window');
const BUTTON_SIZE = (width - 64) / 2;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  exitButton: {
    padding: 4,
  },
  progressContainer: {
    flex: 1,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  scoreEmoji: {
    fontSize: 20,
  },
  scoreNum: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  questionArea: {
    flex: 1,
    alignItems: 'center',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  instructions: {
    fontSize: 16,
    marginBottom: 24,
  },
  itemsCard: {
    width: width - 48,
    minHeight: 180,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    position: 'relative',
  },
  itemsEmoji: {
    fontSize: 48,
    letterSpacing: 8,
    textAlign: 'center',
  },
  feedbackBadge: {
    position: 'absolute',
    top: -12,
    right: -12,
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  answersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 16,
    justifyContent: 'center',
  },
  answerButton: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: 20,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  answerText: {
    fontSize: 48,
    fontWeight: 'bold',
  },
  completeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  completeEmoji: {
    fontSize: 80,
    marginBottom: 16,
  },
  completeTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  scoreText: {
    fontSize: 20,
    marginBottom: 16,
  },
  starsEarned: {
    flexDirection: 'row',
  },
  starIcon: {
    fontSize: 40,
    marginHorizontal: 4,
  },
});

export default CountingGame;
