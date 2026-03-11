/**
 * Assignment Progress Tracker Component
 * 
 * Tracks progress of assignments across students
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { percentWidth } from '@/lib/progress/clampPercent';

interface AssignmentProgressTrackerProps {
  total: number;
  completed: number;
  inProgress: number;
  notStarted: number;
}

export function AssignmentProgressTracker({
  total,
  completed,
  inProgress,
  notStarted,
}: AssignmentProgressTrackerProps) {
  const { theme } = useTheme();

  const completedPercent = total > 0 ? (completed / total) * 100 : 0;
  const inProgressPercent = total > 0 ? (inProgress / total) * 100 : 0;
  const notStartedPercent = total > 0 ? (notStarted / total) * 100 : 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Progress Overview</Text>
        <Text style={[styles.percentage, { color: theme.primary }]}>
          {Math.round(completedPercent)}%
        </Text>
      </View>

      <View style={styles.progressBar}>
        <View
          style={[
            styles.progressSegment,
            { width: percentWidth(completedPercent), backgroundColor: '#10b981' },
          ]}
        />
        <View
          style={[
            styles.progressSegment,
            { width: percentWidth(inProgressPercent), backgroundColor: '#3b82f6' },
          ]}
        />
        <View
          style={[
            styles.progressSegment,
            { width: percentWidth(notStartedPercent), backgroundColor: '#e5e7eb' },
          ]}
        />
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#10b981' }]} />
          <Text style={[styles.legendText, { color: theme.textSecondary }]}>
            Completed ({completed})
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#3b82f6' }]} />
          <Text style={[styles.legendText, { color: theme.textSecondary }]}>
            In Progress ({inProgress})
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#e5e7eb' }]} />
          <Text style={[styles.legendText, { color: theme.textSecondary }]}>
            Not Started ({notStarted})
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  percentage: {
    fontSize: 20,
    fontWeight: '700',
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    flexDirection: 'row',
    marginBottom: 12,
  },
  progressSegment: {
    height: '100%',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
  },
});
