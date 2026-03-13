/**
 * Progress Chart Component
 * 
 * Visual representation of progress metrics with bars.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { percentWidth } from '@/lib/progress/clampPercent';

interface ProgressChartProps {
  metrics: {
    socialSkills: number;
    academicProgress: number;
    participation: number;
    behavior: number;
  };
  theme: any;
}

const METRIC_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  socialSkills: { label: 'Social Skills', color: '#10B981', icon: '👥' },
  academicProgress: { label: 'Academic Progress', color: '#3B82F6', icon: '📚' },
  participation: { label: 'Participation', color: '#F59E0B', icon: '✋' },
  behavior: { label: 'Behavior', color: '#8B5CF6', icon: '⭐' },
};

export function ProgressChart({ metrics, theme }: ProgressChartProps) {
  const maxScore = 5;

  return (
    <View style={styles.container}>
      {Object.entries(metrics).map(([key, value]) => {
        const config = METRIC_LABELS[key];
        if (!config) return null;

        const percentage = (value / maxScore) * 100;

        return (
          <View key={key} style={styles.metricRow}>
            <View style={styles.metricLabel}>
              <Text style={styles.metricIcon}>{config.icon}</Text>
              <Text style={[styles.metricText, { color: theme.text }]}>
                {config.label}
              </Text>
            </View>
            <View style={styles.barContainer}>
              <View
                style={[
                  styles.barBackground,
                  { backgroundColor: theme.cardSecondary },
                ]}
              >
                <View
                  style={[
                    styles.barFill,
                    { width: percentWidth(percentage), backgroundColor: config.color },
                  ]}
                />
              </View>
              <Text style={[styles.scoreText, { color: theme.textSecondary }]}>
                {value.toFixed(1)}/5
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  metricRow: {
    gap: 8,
  },
  metricLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  metricIcon: {
    fontSize: 18,
  },
  metricText: {
    fontSize: 15,
    fontWeight: '500',
  },
  barContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  barBackground: {
    flex: 1,
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 6,
  },
  scoreText: {
    fontSize: 13,
    fontWeight: '600',
    minWidth: 40,
    textAlign: 'right',
  },
});
