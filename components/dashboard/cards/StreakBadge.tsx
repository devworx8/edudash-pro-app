/**
 * StreakBadge — Displays the student's current learning streak with a flame icon.
 * Shows weekly activity dots and a motivational message.
 *
 * ≤400 lines (WARP.md compliant)
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { getLearningStats, getStreakMessage, type LearningStats } from '@/lib/dash-ai/learningStreakStore';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function StreakBadge() {
  const { theme, isDark } = useTheme();
  const [stats, setStats] = useState<LearningStats | null>(null);

  useEffect(() => {
    getLearningStats().then(setStats);
  }, []);

  if (!stats) return null;

  const { currentStreak, weekActivity } = stats;
  const message = getStreakMessage(stats);
  const hasStreak = currentStreak > 0;

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#1a1a2e' : '#FFF7ED', borderColor: isDark ? '#2a2a3e' : '#FDBA74' }]}>
      <View style={styles.topRow}>
        <View style={styles.streakGroup}>
          <Text style={styles.flameIcon}>{hasStreak ? '🔥' : '💤'}</Text>
          <Text style={[styles.streakCount, { color: hasStreak ? '#F97316' : theme.textSecondary }]}>
            {currentStreak}
          </Text>
          <Text style={[styles.streakLabel, { color: theme.textSecondary }]}>
            day{currentStreak !== 1 ? 's' : ''}
          </Text>
        </View>

        {/* Weekly activity dots */}
        <View style={styles.weekDots}>
          {weekActivity.map((active, i) => (
            <View key={i} style={styles.dayCol}>
              <View
                style={[
                  styles.dot,
                  active
                    ? { backgroundColor: '#F97316' }
                    : { backgroundColor: isDark ? '#333' : '#E5E7EB' },
                ]}
              />
              <Text style={[styles.dayLabel, { color: theme.textSecondary }]}>{DAY_LABELS[i]}</Text>
            </View>
          ))}
        </View>
      </View>

      <Text style={[styles.message, { color: theme.textSecondary }]} numberOfLines={2}>
        {message}
      </Text>
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
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  streakGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  flameIcon: {
    fontSize: 24,
  },
  streakCount: {
    fontSize: 28,
    fontWeight: '800',
  },
  streakLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 4,
  },
  weekDots: {
    flexDirection: 'row',
    gap: 6,
  },
  dayCol: {
    alignItems: 'center',
    gap: 2,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dayLabel: {
    fontSize: 9,
    fontWeight: '600',
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
  },
});
