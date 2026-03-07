/**
 * XPProgressBar — Displays the student's daily XP progress toward their goal.
 * Shows total XP earned and today's progress.
 *
 * ≤400 lines (WARP.md compliant)
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { getLearningStats, type LearningStats } from '@/lib/dash-ai/learningStreakStore';
import { ratioToPercent } from '@/lib/progress/clampPercent';

const XP_PER_SESSION_GOAL = 100; // Default 100 XP daily target

export function XPProgressBar() {
  const { theme, isDark } = useTheme();
  const [stats, setStats] = useState<LearningStats | null>(null);

  useEffect(() => {
    getLearningStats().then(setStats);
  }, []);

  if (!stats) return null;

  const { xpToday, xpTotal, todaySessions, dailyGoal } = stats;
  const dailyXPTarget = dailyGoal * XP_PER_SESSION_GOAL;
  const progressPercent = ratioToPercent(xpToday, dailyXPTarget, {
    source: 'components/dashboard/cards/XPProgressBar.progress',
  });
  const goalReached = todaySessions >= dailyGoal;

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#1a1a2e' : '#F0F9FF', borderColor: isDark ? '#2a2a3e' : '#93C5FD' }]}>
      <View style={styles.headerRow}>
        <View style={styles.xpGroup}>
          <Text style={styles.starIcon}>⭐</Text>
          <Text style={[styles.xpToday, { color: '#3B82F6' }]}>
            {xpToday} XP
          </Text>
          <Text style={[styles.xpTarget, { color: theme.textSecondary }]}>
            / {dailyXPTarget} today
          </Text>
        </View>
        <Text style={[styles.totalXP, { color: theme.textSecondary }]}>
          {xpTotal.toLocaleString()} total
        </Text>
      </View>

      {/* Progress bar */}
      <View style={[styles.barBackground, { backgroundColor: isDark ? '#333' : '#E5E7EB' }]}>
        <View
          style={[
            styles.barFill,
            {
              width: `${progressPercent}%`,
              backgroundColor: goalReached ? '#10B981' : '#3B82F6',
            },
          ]}
        />
      </View>

      <View style={styles.footerRow}>
        <Text style={[styles.sessionCount, { color: theme.textSecondary }]}>
          {todaySessions}/{dailyGoal} sessions
        </Text>
        {goalReached && (
          <Text style={styles.goalTag}>🎯 Goal reached!</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  xpGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  starIcon: {
    fontSize: 20,
  },
  xpToday: {
    fontSize: 20,
    fontWeight: '800',
  },
  xpTarget: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  totalXP: {
    fontSize: 13,
    fontWeight: '500',
  },
  barBackground: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 5,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  sessionCount: {
    fontSize: 12,
    fontWeight: '500',
  },
  goalTag: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10B981',
  },
});
