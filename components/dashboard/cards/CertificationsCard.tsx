import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { DashboardCard } from './DashboardCard';
import { useTheme } from '@/contexts/ThemeContext';
import { percentWidth } from '@/lib/progress/clampPercent';

export function CertificationsCard() {
  const { theme } = useTheme();

  // TODO: Replace with real certifications data
  const certifications = [
    {
      name: 'Project Management Professional',
      progress: 75,
      status: 'in_progress',
      dueDate: '2 weeks left',
    },
    {
      name: 'AWS Cloud Practitioner',
      progress: 100,
      status: 'completed',
      completedDate: 'Completed May 1',
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return theme.colors?.success || theme.success || '#10b981';
      case 'in_progress':
        return theme.colors?.info || theme.info || '#3b82f6';
      case 'not_started':
        return theme.text;
      default:
        return theme.text;
    }
  };

  return (
    <DashboardCard title="Certifications" icon="ribbon-outline">
      <View style={styles.list}>
        {certifications.map((item, idx) => (
          <View key={idx} style={styles.item}>
            <View style={styles.header}>
              <Text style={[styles.name, { color: theme.text }]}>{item.name}</Text>
              <Text style={[styles.progress, { color: getStatusColor(item.status) }]}>
                {item.progress}%
              </Text>
            </View>
            <View
              style={[
                styles.progressBar,
                { backgroundColor: theme.colors?.border || theme.border || '#e5e7eb' },
              ]}
            >
              <View
                style={[
                  styles.progressFill,
                  {
                    width: percentWidth(item.progress),
                    backgroundColor: getStatusColor(item.status),
                  },
                ]}
              />
            </View>
            <Text style={[styles.statusText, { color: theme.textSecondary }]}>
              {item.status === 'completed' ? item.completedDate : item.dueDate}
            </Text>
          </View>
        ))}
      </View>
    </DashboardCard>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 16,
  },
  item: {
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  progress: {
    fontSize: 14,
    fontWeight: '700',
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
  statusText: {
    fontSize: 12,
    opacity: 0.6,
  },
});
