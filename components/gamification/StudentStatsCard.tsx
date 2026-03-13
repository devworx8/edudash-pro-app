/**
 * Student Stats Card Component
 * 
 * A compact card showing a student's gamification stats:
 * stars earned, badges, current streak, and level.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { assertSupabase } from '../../lib/supabase';
import { ProgressStars } from './ProgressStars';
import { BadgeDisplay, Badge } from './BadgeDisplay';
import { percentWidth } from '@/lib/progress/clampPercent';

// ====================================================================
// TYPES
// ====================================================================

interface StudentStatsCardProps {
  /** Student ID */
  studentId: string;
  /** Student name for display */
  studentName?: string;
  /** Show compact or expanded view */
  compact?: boolean;
  /** Called when card is pressed */
  onPress?: () => void;
}

interface StudentStats {
  totalStars: number;
  badges: Badge[];
  currentStreak: number;
  longestStreak: number;
  level: number;
  activitiesCompleted: number;
}

// ====================================================================
// LEVEL CALCULATION
// ====================================================================

const calculateLevel = (totalStars: number): number => {
  // Simple level system: 10 stars per level
  return Math.floor(totalStars / 10) + 1;
};

const starsToNextLevel = (totalStars: number): number => {
  const currentLevel = calculateLevel(totalStars);
  const starsForNextLevel = currentLevel * 10;
  return starsForNextLevel - totalStars;
};

// ====================================================================
// COMPONENT
// ====================================================================

export function StudentStatsCard({
  studentId,
  studentName,
  compact = false,
  onPress,
}: StudentStatsCardProps) {
  const { colors } = useTheme();
  const [stats, setStats] = useState<StudentStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStudentStats();
  }, [studentId]);

  const fetchStudentStats = async () => {
    try {
      const supabase = assertSupabase();

      // Fetch total stars
      const { data: starData } = await supabase
        .rpc('get_student_stars', { p_student_id: studentId });

      // Fetch badges
      const { data: badgeData } = await supabase
        .rpc('get_student_badges', { p_student_id: studentId });

      // Fetch streak
      const { data: streakData } = await supabase
        .from('student_streaks')
        .select('*')
        .eq('student_id', studentId)
        .eq('streak_type', 'activity')
        .single();

      // Fetch activity count
      const { count: activityCount } = await supabase
        .from('activity_attempts')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', studentId)
        .eq('status', 'completed');

      const totalStars = starData || 0;
      const badges: Badge[] = (badgeData || []).map((b: any) => ({
        id: b.badge_name,
        name: b.badge_name,
        icon: b.badge_icon || '🏅',
        color: b.badge_color || '#FFD700',
        earnedAt: b.earned_at,
        category: b.category,
      }));

      setStats({
        totalStars,
        badges,
        currentStreak: streakData?.current_streak || 0,
        longestStreak: streakData?.longest_streak || 0,
        level: calculateLevel(totalStars),
        activitiesCompleted: activityCount || 0,
      });
    } catch (error) {
      console.error('Error fetching student stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.compact, { backgroundColor: colors.cardBackground }]}>
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          Loading stats...
        </Text>
      </View>
    );
  }

  if (!stats) {
    return null;
  }

  const progress = (stats.totalStars % 10) / 10;

  if (compact) {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={!onPress}
        style={[styles.container, styles.compact, { backgroundColor: colors.cardBackground }]}
      >
        <View style={styles.compactRow}>
          <View style={styles.levelBadge}>
            <Text style={styles.levelText}>Lv{stats.level}</Text>
          </View>
          <Text style={[styles.starCount, { color: colors.text }]}>
            ⭐ {stats.totalStars}
          </Text>
          <Text style={[styles.streakCount, { color: colors.text }]}>
            🔥 {stats.currentStreak}
          </Text>
          <BadgeDisplay badges={stats.badges} size="small" maxVisible={3} />
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
      style={[styles.container, { backgroundColor: colors.cardBackground }]}
    >
      {/* Header */}
      {studentName && (
        <Text style={[styles.studentName, { color: colors.text }]}>
          {studentName}'s Progress
        </Text>
      )}

      {/* Level & Stars */}
      <View style={styles.levelSection}>
        <View style={[styles.levelCircle, { borderColor: colors.primary }]}>
          <Text style={[styles.levelNumber, { color: colors.primary }]}>
            {stats.level}
          </Text>
          <Text style={[styles.levelLabel, { color: colors.textSecondary }]}>
            Level
          </Text>
        </View>
        
        <View style={styles.starsSection}>
          <View style={styles.starRow}>
            <Text style={styles.starEmoji}>⭐</Text>
            <Text style={[styles.totalStars, { color: colors.text }]}>
              {stats.totalStars} Stars
            </Text>
          </View>
          <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
            <View 
              style={[
                styles.progressFill, 
                { 
                  backgroundColor: colors.primary,
                  width: percentWidth(progress * 100),
                }
              ]} 
            />
          </View>
          <Text style={[styles.nextLevel, { color: colors.textSecondary }]}>
            {starsToNextLevel(stats.totalStars)} more to Level {stats.level + 1}
          </Text>
        </View>
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <View style={[styles.statBox, { backgroundColor: colors.background }]}>
          <Text style={styles.statEmoji}>🔥</Text>
          <Text style={[styles.statValue, { color: colors.text }]}>
            {stats.currentStreak}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
            Day Streak
          </Text>
        </View>
        
        <View style={[styles.statBox, { backgroundColor: colors.background }]}>
          <Text style={styles.statEmoji}>🏆</Text>
          <Text style={[styles.statValue, { color: colors.text }]}>
            {stats.longestStreak}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
            Best Streak
          </Text>
        </View>
        
        <View style={[styles.statBox, { backgroundColor: colors.background }]}>
          <Text style={styles.statEmoji}>✅</Text>
          <Text style={[styles.statValue, { color: colors.text }]}>
            {stats.activitiesCompleted}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
            Activities
          </Text>
        </View>
      </View>

      {/* Badges */}
      {stats.badges.length > 0 && (
        <View style={styles.badgesSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Badges Earned
          </Text>
          <BadgeDisplay badges={stats.badges} layout="row" size="medium" showNames />
        </View>
      )}
    </TouchableOpacity>
  );
}

// ====================================================================
// STYLES
// ====================================================================

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
  },
  compact: {
    padding: 12,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    textAlign: 'center',
  },
  studentName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  levelSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  levelCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  levelNumber: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  levelLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
  },
  levelBadge: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  levelText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  starsSection: {
    flex: 1,
  },
  starRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  starEmoji: {
    fontSize: 20,
    marginRight: 6,
  },
  totalStars: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  starCount: {
    fontSize: 14,
    fontWeight: '600',
  },
  streakCount: {
    fontSize: 14,
    fontWeight: '600',
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  nextLevel: {
    fontSize: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  statBox: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  statEmoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 10,
    textAlign: 'center',
  },
  badgesSection: {
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingTop: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
});

export default StudentStatsCard;
