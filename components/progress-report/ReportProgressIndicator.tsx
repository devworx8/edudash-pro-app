import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { percentWidth } from '@/lib/progress/clampPercent';
interface ReportProgressIndicatorProps {
  percentage: number;
  autoSaveStatus: 'saved' | 'saving' | 'unsaved';
  lastAutoSave: Date | null;
}

export const ReportProgressIndicator: React.FC<ReportProgressIndicatorProps> = ({
  percentage,
  autoSaveStatus,
  lastAutoSave,
}) => {
  const { theme } = useTheme();

  return (
    <View style={[styles.progressContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.progressHeader}>
        <Text style={[styles.progressTitle, { color: theme.text }]}>Report Progress</Text>
        <View style={styles.autoSaveContainer}>
          {autoSaveStatus === 'saving' && (
            <EduDashSpinner size="small" color={theme.primary} style={{ marginRight: 8 }} />
          )}
          {autoSaveStatus === 'saved' && lastAutoSave && (
            <Text style={[styles.autoSaveText, { color: theme.textSecondary }]}>
              ✓ Auto-saved
            </Text>
          )}
        </View>
      </View>
      <View style={styles.progressBarOuter}>
        <View
          style={[
            styles.progressBarInner,
            {
              width: percentWidth(percentage),
              backgroundColor: percentage === 100 ? '#059669' : theme.primary,
            },
          ]}
        />
      </View>
      <Text style={[styles.progressPercentage, { color: theme.textSecondary }]}>
        {percentage}% Complete
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  progressContainer: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  autoSaveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  autoSaveText: {
    fontSize: 12,
  },
  progressBarOuter: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarInner: {
    height: '100%',
    borderRadius: 4,
  },
  progressPercentage: {
    fontSize: 12,
    textAlign: 'right',
  },
});
