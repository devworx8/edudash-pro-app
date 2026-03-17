import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ErrorMonitorStats } from '@/hooks/platform-monitoring';
import type { ThemeColors } from '@/contexts/ThemeContext';

interface Props {
  stats: ErrorMonitorStats;
  theme: { colors: ThemeColors };
}

export function ErrorStatsCards({ stats, theme }: Props) {
  const cards = [
    {
      label: 'Total (24h)',
      value: stats.total_errors,
      color: '#93C5FD',
      bgColor: '#1E3A5F',
    },
    {
      label: 'Critical',
      value: stats.by_severity.critical,
      color: '#FCA5A5',
      bgColor: stats.by_severity.critical > 0 ? '#991B1B' : '#374151',
    },
    {
      label: 'Open Incidents',
      value: stats.open_incidents,
      color: '#FCD34D',
      bgColor: stats.open_incidents > 0 ? '#92400E' : '#374151',
    },
    {
      label: 'Auto-Resolved',
      value: stats.auto_resolved_count,
      color: '#86EFAC',
      bgColor: '#1C3829',
    },
  ];

  return (
    <View style={styles.row}>
      {cards.map((card) => (
        <View key={card.label} style={[styles.card, { backgroundColor: card.bgColor }]}>
          <Text style={[styles.value, { color: card.color }]}>{card.value}</Text>
          <Text style={[styles.label, { color: theme.colors.textSecondary || '#9CA3AF' }]}>
            {card.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  card: {
    flex: 1,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    minHeight: 68,
    justifyContent: 'center',
  },
  value: {
    fontSize: 24,
    fontWeight: '800',
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
});
