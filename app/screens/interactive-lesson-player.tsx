/**
 * Interactive Lesson Player Screen
 * 
 * Plays interactive preschool activities with various types.
 * Supports: matching, coloring, counting, sorting, tracing, puzzle, memory, quiz
 * 
 * Features:
 * - Activity type rendering
 * - Progress tracking
 * - Timer display
 * - Star rewards
 * - Badge unlock animations
 * - Save progress and resume
 */

import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { assertSupabase } from '@/lib/supabase';
import { DesktopLayout } from '@/components/layout/DesktopLayout';
import { MatchingActivity } from '@/components/lessons/MatchingActivity';
import { CountingActivity } from '@/components/lessons/CountingActivity';
import { QuizActivity } from '@/components/lessons/QuizActivity';
import { ColoringActivity } from '@/components/lessons/ColoringActivity';
import { MemoryGame } from '@/components/lessons/MemoryGame';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
interface Activity {
  id: string;
  activity_type: 'matching' | 'coloring' | 'tracing' | 'counting' | 'sorting' | 'puzzle' | 'memory' | 'quiz';
  title: string;
  instructions: string;
  content: any;
  difficulty_level: number;
  time_limit_seconds: number | null;
  max_attempts: number;
  stars_reward: number;
  badge_reward: string | null;
}

export default function InteractiveLessonPlayerScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { showAlert, alertProps } = useAlertModal();
  const params = useLocalSearchParams();
  const activityId = params.activityId as string;
  const studentId = params.studentId as string;
  
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [activity, setActivity] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(true);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [attemptsCount, setAttemptsCount] = useState(0);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [score, setScore] = useState(0);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    loadActivity();
  }, [activityId]);

  useEffect(() => {
    // Timer
    if (activity && !isCompleted && !showResults) {
      const interval = setInterval(() => {
        setTimeElapsed(prev => prev + 1);
      }, 1000);
      
      return () => clearInterval(interval);
    }
  }, [activity, isCompleted, showResults]);

  const loadActivity = async () => {
    if (!activityId) {
      showAlert({ title: 'Error', message: 'No activity selected', type: 'error' });
      router.back();
      return;
    }

    setLoading(true);
    try {
      const supabase = assertSupabase();
      
      const { data, error } = await supabase
        .from('interactive_activities')
        .select('*')
        .eq('id', activityId)
        .eq('approval_status', 'approved')
        .single();

      if (error) throw error;
      if (!data) throw new Error('Activity not found');

      setActivity(data as Activity);

      // Create attempt record
      const { data: attemptData, error: attemptError } = await supabase
        .from('activity_attempts')
        .insert({
          activity_id: activityId,
          student_id: studentId || user?.id,
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (attemptError) throw attemptError;
      setAttemptId(attemptData.id);

      // Get previous attempts count
      const { data: attempts } = await supabase
        .from('activity_attempts')
        .select('id')
        .eq('activity_id', activityId)
        .eq('student_id', studentId || user?.id);

      setAttemptsCount(attempts?.length || 0);
    } catch (error: any) {
      console.error('[InteractiveLessonPlayer] Error loading activity:', error);
      showAlert({ title: 'Error', message: error.message || 'Failed to load activity', type: 'error' });
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async (finalScore: number) => {
    if (!attemptId || !activity) return;

    setScore(finalScore);
    setIsCompleted(true);
    setShowResults(true);

    try {
      const supabase = assertSupabase();
      
      // Update attempt record
      await supabase
        .from('activity_attempts')
        .update({
          completed_at: new Date().toISOString(),
          score: finalScore,
          max_score: 100,
          time_spent_seconds: timeElapsed,
          is_submitted: true,
        })
        .eq('id', attemptId);

      // Update activity stats
      await supabase
        .rpc('increment_activity_play_count', {
          activity_uuid: activity.id,
        })
        .single();
    } catch (error) {
      console.error('[InteractiveLessonPlayer] Error saving completion:', error);
    }
  };

  const handleRetry = () => {
    setShowResults(false);
    setIsCompleted(false);
    setScore(0);
    setTimeElapsed(0);
    loadActivity();
  };

  const handleExit = () => {
    router.back();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <DesktopLayout role="student">
        <View style={styles.loadingContainer}>
          <EduDashSpinner size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Loading activity...
          </Text>
        </View>
      </DesktopLayout>
    );
  }

  if (!activity) {
    return null;
  }

  // Render results screen
  if (showResults) {
    const stars = Math.ceil((score / 100) * (activity.stars_reward || 3));
    
    return (
      <DesktopLayout role="student">
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.resultsContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.resultsCard, { backgroundColor: theme.card }]}>
            <Text style={[styles.resultsTitle, { color: theme.text }]}>
              {score >= 70 ? '🎉 Great Job!' : score >= 50 ? '👍 Good Try!' : '💪 Keep Practicing!'}
            </Text>
            
            <View style={styles.scoreCircle}>
              <Text style={[styles.scoreText, { color: theme.primary }]}>
                {score}%
              </Text>
            </View>

            <View style={styles.starsRow}>
              {[...Array(activity.stars_reward || 3)].map((_, index) => (
                <Ionicons
                  key={index}
                  name={index < stars ? 'star' : 'star-outline'}
                  size={40}
                  color={index < stars ? '#F59E0B' : theme.textTertiary}
                />
              ))}
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Ionicons name="time" size={24} color={theme.primary} />
                <Text style={[styles.statText, { color: theme.textSecondary }]}>
                  {formatTime(timeElapsed)}
                </Text>
              </View>
              <View style={styles.statItem}>
                <Ionicons name="reload" size={24} color={theme.primary} />
                <Text style={[styles.statText, { color: theme.textSecondary }]}>
                  {attemptsCount} {attemptsCount === 1 ? 'try' : 'tries'}
                </Text>
              </View>
            </View>

            {activity.badge_reward && score >= 80 && (
              <View style={[styles.badgeCard, { backgroundColor: theme.primary + '20' }]}>
                <Ionicons name="ribbon" size={32} color={theme.primary} />
                <Text style={[styles.badgeText, { color: theme.primary }]}>
                  Badge Unlocked: {activity.badge_reward}
                </Text>
              </View>
            )}

            <View style={styles.resultsButtons}>
              {attemptsCount < activity.max_attempts && (
                <TouchableOpacity
                  style={[styles.resultButton, { backgroundColor: theme.info }]}
                  onPress={handleRetry}
                >
                  <Ionicons name="refresh" size={20} color="#FFF" />
                  <Text style={styles.resultButtonText}>Try Again</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.resultButton, { backgroundColor: theme.success }]}
                onPress={handleExit}
              >
                <Ionicons name="checkmark" size={20} color="#FFF" />
                <Text style={styles.resultButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </DesktopLayout>
    );
  }

  // Render activity based on type
  return (
    <DesktopLayout role="student">
      <Stack.Screen
        options={{
          title: activity.title,
          headerShown: true,
          headerStyle: { backgroundColor: theme.card },
          headerTintColor: theme.text,
          headerRight: () => (
            <View style={styles.headerRight}>
              {activity.time_limit_seconds && (
                <View style={[styles.timer, { backgroundColor: theme.cardSecondary }]}>
                  <Ionicons name="time-outline" size={16} color={theme.primary} />
                  <Text style={[styles.timerText, { color: theme.text }]}>
                    {formatTime(timeElapsed)}
                    {activity.time_limit_seconds && ` / ${formatTime(activity.time_limit_seconds)}`}
                  </Text>
                </View>
              )}
            </View>
          ),
        }}
      />
      
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {/* Instructions */}
        {activity.instructions && (
          <View style={[styles.instructionsCard, { backgroundColor: theme.card }]}>
            <Ionicons name="information-circle" size={24} color={theme.primary} />
            <Text style={[styles.instructionsText, { color: theme.textSecondary }]}>
              {activity.instructions}
            </Text>
          </View>
        )}

        {/* Activity Component */}
        {activity.activity_type === 'matching' && (
          <MatchingActivity
            content={activity.content}
            onComplete={handleComplete}
            theme={theme}
          />
        )}
        {activity.activity_type === 'counting' && (
          <CountingActivity
            content={activity.content}
            onComplete={handleComplete}
            theme={theme}
          />
        )}
        {activity.activity_type === 'quiz' && (
          <QuizActivity
            content={activity.content}
            onComplete={handleComplete}
            theme={theme}
          />
        )}
        {activity.activity_type === 'coloring' && (
          <ColoringActivity
            content={activity.content}
            onComplete={handleComplete}
            theme={theme}
          />
        )}
        {activity.activity_type === 'memory' && (
          <MemoryGame
            content={activity.content}
            onComplete={handleComplete}
            theme={theme}
          />
        )}
        {!['matching', 'counting', 'quiz', 'coloring', 'memory'].includes(activity.activity_type) && (
          <View style={styles.comingSoonContainer}>
            <Ionicons name="construct" size={80} color={theme.textTertiary} />
            <Text style={[styles.comingSoonText, { color: theme.text }]}>
              {activity.activity_type} activities coming soon!
            </Text>
          </View>
        )}
      </View>
      <AlertModal {...alertProps} />
    </DesktopLayout>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 40,
    },
    loadingText: {
      marginTop: 12,
      fontSize: 16,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingRight: 16,
    },
    timer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
    },
    timerText: {
      fontSize: 14,
      fontWeight: '600',
    },
    instructionsCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      margin: 16,
      padding: 16,
      borderRadius: 12,
    },
    instructionsText: {
      flex: 1,
      fontSize: 15,
      lineHeight: 21,
    },
    comingSoonContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 40,
    },
    comingSoonText: {
      fontSize: 18,
      marginTop: 20,
      textAlign: 'center',
    },
    resultsContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    resultsCard: {
      width: '100%',
      maxWidth: 400,
      padding: 32,
      borderRadius: 24,
      alignItems: 'center',
    },
    resultsTitle: {
      fontSize: 28,
      fontWeight: '700',
      marginBottom: 24,
      textAlign: 'center',
    },
    scoreCircle: {
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 24,
    },
    scoreText: {
      fontSize: 40,
      fontWeight: '700',
    },
    starsRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 24,
    },
    statsRow: {
      flexDirection: 'row',
      gap: 32,
      marginBottom: 24,
    },
    statItem: {
      alignItems: 'center',
      gap: 8,
    },
    statText: {
      fontSize: 14,
      fontWeight: '500',
    },
    badgeCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 16,
      borderRadius: 12,
      marginBottom: 24,
    },
    badgeText: {
      fontSize: 16,
      fontWeight: '600',
    },
    resultsButtons: {
      flexDirection: 'row',
      gap: 12,
      width: '100%',
    },
    resultButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      borderRadius: 12,
      gap: 8,
    },
    resultButtonText: {
      color: '#FFF',
      fontSize: 16,
      fontWeight: '600',
    },
  });
