import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { StatusBadge } from './StatusBadge';
import { CategoryIcon } from './CategoryIcon';
import { CATEGORY_CONFIG, PRIORITY_CONFIG, type TeacherSubmission } from './types';

interface SubmissionCardProps {
  submission: TeacherSubmission;
  onPress: (submission: TeacherSubmission) => void;
  showTeacherName?: boolean;
  onApprove?: (submission: TeacherSubmission) => void;
  onDecline?: (submission: TeacherSubmission) => void;
}

export function SubmissionCard({ submission, onPress, showTeacherName, onApprove, onDecline }: SubmissionCardProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const catConfig = CATEGORY_CONFIG[submission.category];

  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(submission)} activeOpacity={0.7}>
      <View style={styles.topRow}>
        <CategoryIcon category={submission.category} size={16} />
        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={1}>{submission.title}</Text>
          <Text style={styles.categoryLabel}>{catConfig?.label || submission.category}</Text>
        </View>
        <StatusBadge status={submission.status} size="small" />
      </View>

      {submission.description ? (
        <Text style={styles.description} numberOfLines={2}>{submission.description}</Text>
      ) : null}

      <View style={styles.meta}>
        {submission.target_term_number && (
          <View style={styles.metaItem}>
            <Ionicons name="layers-outline" size={12} color={theme.textSecondary} />
            <Text style={styles.metaText}>Term {submission.target_term_number}</Text>
          </View>
        )}
        {submission.priority !== 'normal' && (
          <View style={styles.metaItem}>
            <Ionicons name="flag-outline" size={12} color={PRIORITY_CONFIG[submission.priority].color} />
            <Text style={[styles.metaText, { color: PRIORITY_CONFIG[submission.priority].color }]}>
              {PRIORITY_CONFIG[submission.priority].label}
            </Text>
          </View>
        )}
        {showTeacherName && submission.submitter_name && (
          <View style={styles.metaItem}>
            <Ionicons name="person-outline" size={12} color={theme.textSecondary} />
            <Text style={styles.metaText}>{submission.submitter_name}</Text>
          </View>
        )}
      </View>

      {submission.principal_notes && submission.status !== 'pending' ? (
        <View style={styles.feedback}>
          <Ionicons name="chatbubble-outline" size={12} color={theme.textSecondary} />
          <Text style={styles.feedbackText} numberOfLines={2}>{submission.principal_notes}</Text>
        </View>
      ) : null}

      {(onApprove || onDecline) && submission.status === 'pending' ? (
        <View style={styles.actions}>
          {onApprove && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.approveBtn]}
              onPress={() => onApprove(submission)}
            >
              <Ionicons name="checkmark" size={16} color="#fff" />
              <Text style={styles.actionText}>Approve</Text>
            </TouchableOpacity>
          )}
          {onDecline && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.declineBtn]}
              onPress={() => onDecline(submission)}
            >
              <Ionicons name="close" size={16} color="#EF4444" />
              <Text style={[styles.actionText, { color: '#EF4444' }]}>Decline</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  card: {
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.border,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  titleBlock: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.text,
  },
  categoryLabel: {
    fontSize: 11,
    color: theme.textSecondary,
  },
  description: {
    fontSize: 13,
    color: theme.textSecondary,
    lineHeight: 18,
    marginBottom: 8,
  },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 4,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 11,
    color: theme.textSecondary,
  },
  feedback: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 8,
    padding: 8,
    backgroundColor: theme.background,
    borderRadius: 8,
  },
  feedbackText: {
    fontSize: 12,
    color: theme.textSecondary,
    flex: 1,
    lineHeight: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    justifyContent: 'flex-end',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  approveBtn: {
    backgroundColor: '#10B981',
  },
  declineBtn: {
    backgroundColor: '#FEE2E2',
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
});
