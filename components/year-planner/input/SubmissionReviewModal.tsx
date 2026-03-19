import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Modal, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { StatusBadge } from './StatusBadge';
import { CategoryIcon } from './CategoryIcon';
import {
  CATEGORY_CONFIG, PRIORITY_CONFIG, type TeacherSubmission, type SubmissionStatus,
} from './types';

type IncorporateTarget = {
  targetType: 'monthly_entry' | 'curriculum_theme';
  academicYear?: number;
  monthIndex?: number;
  bucket?: string;
  termId?: string;
  weekNumber?: number;
};

interface SubmissionReviewModalProps {
  visible: boolean;
  submission: TeacherSubmission | null;
  onClose: () => void;
  onReview: (id: string, status: SubmissionStatus, notes: string) => Promise<void>;
  onIncorporate?: (submissionId: string, target: IncorporateTarget) => Promise<void>;
}

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BUCKETS = [
  { key: 'holidays_closures', label: 'Holidays & Closures' },
  { key: 'meetings_admin', label: 'Meetings & Admin' },
  { key: 'excursions_extras', label: 'Excursions & Extras' },
  { key: 'donations_fundraisers', label: 'Donations & Fundraisers' },
];

export function SubmissionReviewModal({ visible, submission, onClose, onReview, onIncorporate }: SubmissionReviewModalProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [showIncorporate, setShowIncorporate] = useState(false);
  const [incorporateType, setIncorporateType] = useState<'monthly_entry' | 'curriculum_theme'>('monthly_entry');
  const [selectedMonth, setSelectedMonth] = useState(1);
  const [selectedBucket, setSelectedBucket] = useState('excursions_extras');
  const [incorporating, setIncorporating] = useState(false);

  // Reset local state when submission changes
  React.useEffect(() => {
    setNotes('');
    setShowIncorporate(false);
    setIncorporateType('monthly_entry');
    setSelectedMonth(1);
    setSelectedBucket('excursions_extras');
  }, [submission?.id]);

  const handleAction = useCallback(async (status: SubmissionStatus) => {
    if (!submission) return;
    setSaving(true);
    try {
      await onReview(submission.id, status, notes);
      setNotes('');
      onClose();
    } finally {
      setSaving(false);
    }
  }, [submission, notes, onReview, onClose]);

  if (!submission) return null;

  const catConfig = CATEGORY_CONFIG[submission.category] ?? { label: submission.category, icon: 'help-outline', color: '#6B7280' };
  const priConfig = PRIORITY_CONFIG[submission.priority] ?? { label: submission.priority, color: '#6B7280' };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: theme.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Review Submission</Text>
          <StatusBadge status={submission.status} />
        </View>

        <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
          {/* Category + Title */}
          <View style={styles.titleRow}>
            <CategoryIcon category={submission.category} size={20} />
            <View style={styles.titleBlock}>
              <Text style={styles.title}>{submission.title}</Text>
              <Text style={styles.categoryLabel}>{catConfig.label}</Text>
            </View>
          </View>

          {/* Description */}
          {submission.description ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Description</Text>
              <Text style={styles.sectionText}>{submission.description}</Text>
            </View>
          ) : null}

          {/* Meta Info */}
          <View style={styles.metaGrid}>
            {submission.target_term_number && (
              <View style={styles.metaCard}>
                <Ionicons name="layers-outline" size={16} color={theme.textSecondary} />
                <Text style={styles.metaValue}>Term {submission.target_term_number}</Text>
              </View>
            )}
            {submission.target_month && (
              <View style={styles.metaCard}>
                <Ionicons name="calendar-outline" size={16} color={theme.textSecondary} />
                <Text style={styles.metaValue}>{MONTH_NAMES[submission.target_month]}</Text>
              </View>
            )}
            {submission.priority !== 'normal' && (
              <View style={styles.metaCard}>
                <Ionicons name="flag-outline" size={16} color={priConfig.color} />
                <Text style={[styles.metaValue, { color: priConfig.color }]}>{priConfig.label} priority</Text>
              </View>
            )}
            {submission.estimated_cost && (
              <View style={styles.metaCard}>
                <Ionicons name="cash-outline" size={16} color={theme.textSecondary} />
                <Text style={styles.metaValue}>{submission.estimated_cost}</Text>
              </View>
            )}
          </View>

          {/* Learning Objectives */}
          {submission.learning_objectives?.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Learning Objectives</Text>
              {submission.learning_objectives.map((obj, i) => (
                <View key={i} style={styles.listItem}>
                  <View style={styles.bullet} />
                  <Text style={styles.listText}>{obj}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Materials */}
          {submission.materials_needed?.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Materials Needed</Text>
              {submission.materials_needed.map((mat, i) => (
                <View key={i} style={styles.listItem}>
                  <View style={styles.bullet} />
                  <Text style={styles.listText}>{mat}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Age Groups */}
          {submission.age_groups?.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Age Groups</Text>
              <View style={styles.chipRow}>
                {submission.age_groups.map((ag) => (
                  <View key={ag} style={styles.ageChip}>
                    <Text style={styles.ageText}>{ag} yrs</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Principal Notes (if already reviewed) */}
          {submission.principal_notes && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Previous Feedback</Text>
              <Text style={styles.sectionText}>{submission.principal_notes}</Text>
            </View>
          )}

          {/* Review Actions */}
          {(submission.status === 'pending' || submission.status === 'under_review') && (
            <View style={styles.reviewSection}>
              <Text style={styles.sectionLabel}>Your Feedback</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Add notes for the teacher (optional)..."
                placeholderTextColor={theme.textSecondary}
                multiline
                numberOfLines={3}
              />

              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#10B981' }]}
                  onPress={() => handleAction('approved')}
                  disabled={saving}
                >
                  <Ionicons name="checkmark-circle" size={18} color="#fff" />
                  <Text style={styles.actionBtnText}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#6366F1' }]}
                  onPress={() => handleAction('modified')}
                  disabled={saving}
                >
                  <Ionicons name="create" size={18} color="#fff" />
                  <Text style={styles.actionBtnText}>Modify & Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#EF4444' }]}
                  onPress={() => handleAction('declined')}
                  disabled={saving}
                >
                  <Ionicons name="close-circle" size={18} color="#fff" />
                  <Text style={styles.actionBtnText}>Decline</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Place in Plan — for approved/modified submissions */}
          {onIncorporate && (submission.status === 'approved' || submission.status === 'modified')
            && !submission.incorporated_into_entry_id && !submission.incorporated_into_theme_id && (
            <View style={styles.incorporateSection}>
              {!showIncorporate ? (
                <TouchableOpacity style={styles.incorporateBtn} onPress={() => setShowIncorporate(true)}>
                  <Ionicons name="add-circle-outline" size={18} color="#3B82F6" />
                  <Text style={styles.incorporateBtnText}>Place in Year Plan</Text>
                </TouchableOpacity>
              ) : (
                <View>
                  <Text style={styles.sectionLabel}>Place in Plan</Text>
                  {/* Type toggle */}
                  <View style={styles.incTypeRow}>
                    <TouchableOpacity
                      style={[styles.incTypeChip, incorporateType === 'monthly_entry' && styles.incTypeChipActive]}
                      onPress={() => setIncorporateType('monthly_entry')}
                    >
                      <Ionicons name="calendar-outline" size={14} color={incorporateType === 'monthly_entry' ? '#3B82F6' : theme.textSecondary} />
                      <Text style={[styles.incTypeText, incorporateType === 'monthly_entry' && styles.incTypeTextActive]}>Monthly Entry</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.incTypeChip, incorporateType === 'curriculum_theme' && styles.incTypeChipActive]}
                      onPress={() => setIncorporateType('curriculum_theme')}
                    >
                      <Ionicons name="book-outline" size={14} color={incorporateType === 'curriculum_theme' ? '#3B82F6' : theme.textSecondary} />
                      <Text style={[styles.incTypeText, incorporateType === 'curriculum_theme' && styles.incTypeTextActive]}>Theme</Text>
                    </TouchableOpacity>
                  </View>

                  {incorporateType === 'monthly_entry' ? (
                    <>
                      <Text style={styles.incFieldLabel}>Month</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.incScrollRow}>
                        {MONTH_NAMES.slice(1).map((m, idx) => (
                          <TouchableOpacity
                            key={idx}
                            style={[styles.incMonthChip, selectedMonth === idx + 1 && styles.incMonthChipActive]}
                            onPress={() => setSelectedMonth(idx + 1)}
                          >
                            <Text style={[styles.incMonthText, selectedMonth === idx + 1 && styles.incMonthTextActive]}>{m}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                      <Text style={styles.incFieldLabel}>Bucket</Text>
                      {BUCKETS.map((b) => (
                        <TouchableOpacity
                          key={b.key}
                          style={[styles.incBucketChip, selectedBucket === b.key && styles.incBucketChipActive]}
                          onPress={() => setSelectedBucket(b.key)}
                        >
                          <Text style={[styles.incBucketText, selectedBucket === b.key && styles.incBucketTextActive]}>{b.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </>
                  ) : (
                    <Text style={styles.incHint}>
                      This will create a new curriculum theme from this submission's title, description, and learning objectives.
                    </Text>
                  )}

                  <View style={styles.incActionRow}>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#3B82F6' }]}
                      disabled={incorporating}
                      onPress={async () => {
                        setIncorporating(true);
                        try {
                          await onIncorporate(submission.id, {
                            targetType: incorporateType,
                            academicYear: new Date().getFullYear(),
                            monthIndex: incorporateType === 'monthly_entry' ? selectedMonth : undefined,
                            bucket: incorporateType === 'monthly_entry' ? selectedBucket : undefined,
                          });
                          setShowIncorporate(false);
                          onClose();
                        } finally {
                          setIncorporating(false);
                        }
                      }}
                    >
                      <Ionicons name="checkmark" size={18} color="#fff" />
                      <Text style={styles.actionBtnText}>{incorporating ? 'Placing...' : 'Confirm'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border }]}
                      onPress={() => setShowIncorporate(false)}
                    >
                      <Text style={[styles.actionBtnText, { color: theme.text }]}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Already incorporated indicator */}
          {(submission.incorporated_into_entry_id || submission.incorporated_into_theme_id) && (
            <View style={styles.incorporatedBanner}>
              <Ionicons name="checkmark-circle" size={18} color="#10B981" />
              <Text style={styles.incorporatedText}>
                Incorporated into {submission.incorporated_into_entry_id ? 'monthly plan' : 'curriculum theme'}
              </Text>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: theme.text },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  titleBlock: { flex: 1 },
  title: { fontSize: 20, fontWeight: '700', color: theme.text },
  categoryLabel: { fontSize: 13, color: theme.textSecondary, marginTop: 2 },
  section: { marginBottom: 16 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: theme.textSecondary, marginBottom: 6 },
  sectionText: { fontSize: 15, color: theme.text, lineHeight: 22 },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  metaCard: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: theme.card, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
  },
  metaValue: { fontSize: 13, fontWeight: '500', color: theme.text },
  listItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  bullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.textSecondary, marginTop: 6 },
  listText: { fontSize: 14, color: theme.text, flex: 1, lineHeight: 20 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  ageChip: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
    backgroundColor: '#10B98120',
  },
  ageText: { fontSize: 12, fontWeight: '600', color: '#10B981' },
  reviewSection: { marginTop: 8, paddingTop: 16, borderTopWidth: 1, borderTopColor: theme.border },
  input: {
    backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 10,
    padding: 12, fontSize: 15, color: theme.text,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 16, flexWrap: 'wrap' },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
  },
  actionBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  incorporateSection: { marginTop: 12, paddingTop: 16, borderTopWidth: 1, borderTopColor: theme.border },
  incorporateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10,
    backgroundColor: '#3B82F610', borderWidth: 1, borderColor: '#3B82F640',
    alignSelf: 'flex-start',
  },
  incorporateBtnText: { fontSize: 14, fontWeight: '600', color: '#3B82F6' },
  incTypeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  incTypeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1.5, borderColor: theme.border, backgroundColor: theme.card,
  },
  incTypeChipActive: { backgroundColor: '#3B82F615', borderColor: '#3B82F6' },
  incTypeText: { fontSize: 13, fontWeight: '500', color: theme.textSecondary },
  incTypeTextActive: { color: '#3B82F6', fontWeight: '600' },
  incFieldLabel: { fontSize: 12, fontWeight: '600', color: theme.textSecondary, marginBottom: 6, marginTop: 8 },
  incScrollRow: { marginBottom: 8 },
  incMonthChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginRight: 6,
    borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card,
  },
  incMonthChipActive: { backgroundColor: '#3B82F620', borderColor: '#3B82F6' },
  incMonthText: { fontSize: 12, fontWeight: '500', color: theme.text },
  incMonthTextActive: { color: '#3B82F6', fontWeight: '600' },
  incBucketChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginBottom: 6,
    borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card,
  },
  incBucketChipActive: { backgroundColor: '#10B98115', borderColor: '#10B981' },
  incBucketText: { fontSize: 13, fontWeight: '500', color: theme.text },
  incBucketTextActive: { color: '#10B981', fontWeight: '600' },
  incHint: { fontSize: 13, color: theme.textSecondary, lineHeight: 20, marginVertical: 8 },
  incActionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  incorporatedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 12, padding: 12, borderRadius: 10,
    backgroundColor: '#D1FAE5',
  },
  incorporatedText: { fontSize: 13, fontWeight: '600', color: '#065F46' },
});
