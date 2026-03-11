import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Card } from '@/components/ui/Card';
import { useTheme, type ThemeColors } from '@/contexts/ThemeContext';
import type { LearnerEnrollment } from '@/hooks/useLearnerData';
import { percentWidth } from '@/lib/progress/clampPercent';

export interface ProgramProgressCardProps {
  enrollment: LearnerEnrollment;
  onPress: () => void;
}

export function ProgramProgressCard({ enrollment, onPress }: ProgramProgressCardProps) {
  const { theme } = useTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);

  const title = enrollment.program?.title ?? 'Program';
  const code = enrollment.program?.code ?? '';
  const progress = enrollment.progress_percentage ?? 0;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75}>
      <Card padding={16} margin={0} elevation="small" style={styles.card}>
        <View style={styles.header}>
          <View style={styles.info}>
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
            {!!code && <Text style={styles.code}>{code}</Text>}
          </View>

          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(enrollment.status, theme) }]}>
            <Text style={styles.statusText}>{enrollment.status}</Text>
          </View>
        </View>

        <View style={styles.progressRow}>
          <Ionicons name="trending-up-outline" size={16} color={theme.textSecondary} />
          <Text style={styles.progressText}>{progress}% complete</Text>
        </View>

        <View style={styles.progressBar}>
          <View style={[styles.progressBarFill, { width: percentWidth(progress), backgroundColor: theme.primary }]} />
        </View>
      </Card>
    </TouchableOpacity>
  );
}

function getStatusColor(status: LearnerEnrollment['status'], theme: ThemeColors): string {
  switch (status) {
    case 'completed':
      return theme.success;
    case 'enrolled':
      return theme.primary;
    case 'withdrawn':
      return theme.textSecondary;
    default:
      return theme.border;
  }
}

const createStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    card: {
      marginBottom: 12,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 12,
      marginBottom: 12,
    },
    info: {
      flex: 1,
    },
    title: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '700',
      marginBottom: 4,
    },
    code: {
      color: theme.textSecondary,
      fontSize: 13,
      fontWeight: '500',
    },
    statusBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
    },
    statusText: {
      color: theme.onPrimary,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'capitalize',
    },
    progressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 10,
    },
    progressText: {
      color: theme.textSecondary,
      fontSize: 12,
      fontWeight: '600',
    },
    progressBar: {
      height: 8,
      backgroundColor: theme.border,
      borderRadius: 999,
      overflow: 'hidden',
    },
    progressBarFill: {
      height: '100%',
      borderRadius: 999,
    },
  });



