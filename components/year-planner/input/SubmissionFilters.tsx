import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import {
  CATEGORY_CONFIG, STATUS_CONFIG,
  type SubmissionCategory, type SubmissionStatus,
} from './types';

interface SubmissionFiltersProps {
  selectedStatus: SubmissionStatus | 'all';
  selectedCategory: SubmissionCategory | 'all';
  onStatusChange: (status: SubmissionStatus | 'all') => void;
  onCategoryChange: (category: SubmissionCategory | 'all') => void;
}

const STATUS_OPTIONS: (SubmissionStatus | 'all')[] = ['all', 'pending', 'under_review', 'approved', 'modified', 'declined'];
const CATEGORY_OPTIONS: (SubmissionCategory | 'all')[] = ['all', 'theme_suggestion', 'event_request', 'resource_need', 'reflection', 'assessment_preference'];

export function SubmissionFilters({
  selectedStatus, selectedCategory, onStatusChange, onCategoryChange,
}: SubmissionFiltersProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme);

  return (
    <View style={styles.container}>
      {/* Status Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row}>
        <View style={styles.filterGroup}>
          <Ionicons name="funnel-outline" size={14} color={theme.textSecondary} />
          {STATUS_OPTIONS.map((s) => {
            const isActive = selectedStatus === s;
            const config = s === 'all' ? null : STATUS_CONFIG[s];
            return (
              <TouchableOpacity
                key={s}
                style={[styles.chip, isActive && (config ? { backgroundColor: config.bgColor, borderColor: config.color } : styles.chipActiveDefault)]}
                onPress={() => onStatusChange(s)}
              >
                {config && <View style={[styles.dot, { backgroundColor: config.color }]} />}
                <Text style={[styles.chipText, isActive && (config ? { color: config.color } : styles.chipTextActiveDefault)]}>
                  {s === 'all' ? 'All Status' : config?.label || s}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Category Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row}>
        <View style={styles.filterGroup}>
          {CATEGORY_OPTIONS.map((c) => {
            const isActive = selectedCategory === c;
            const config = c === 'all' ? null : CATEGORY_CONFIG[c];
            return (
              <TouchableOpacity
                key={c}
                style={[styles.chip, isActive && (config ? { backgroundColor: config.color + '15', borderColor: config.color } : styles.chipActiveDefault)]}
                onPress={() => onCategoryChange(c)}
              >
                {config && <Ionicons name={config.icon as any} size={12} color={isActive ? config.color : theme.textSecondary} />}
                <Text style={[styles.chipText, isActive && (config ? { color: config.color } : styles.chipTextActiveDefault)]}>
                  {c === 'all' ? 'All Types' : config?.label || c}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { gap: 6, marginBottom: 12 },
  row: { paddingHorizontal: 16 },
  filterGroup: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 16 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card,
  },
  chipActiveDefault: { backgroundColor: '#3B82F615', borderColor: '#3B82F6' },
  chipText: { fontSize: 12, color: theme.textSecondary, fontWeight: '500' },
  chipTextActiveDefault: { color: '#3B82F6' },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
