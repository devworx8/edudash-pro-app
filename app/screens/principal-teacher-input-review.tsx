// Principal Teacher Input Review Dashboard
// Review, approve/modify/decline teacher submissions
// WARP.md compliant (≤500 lines)

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { DesktopLayout } from '@/components/layout/DesktopLayout';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { useTeacherInputReview } from '@/hooks/principal/useTeacherInputReview';
import {
  SubmissionCard,
  SubmissionFilters,
  SubmissionReviewModal,
  type TeacherSubmission,
  type SubmissionStatus,
  type SubmissionCategory,
} from '@/components/year-planner/input';

export default function PrincipalTeacherInputReviewScreen() {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { showAlert, alertProps } = useAlertModal();
  const params = useLocalSearchParams<{ windowId?: string }>();

  const {
    submissions,
    counts,
    filters,
    loading,
    refreshing,
    setFilters,
    handleRefresh,
    handleReview,
    handleBulkApprove,
    handleIncorporate,
  } = useTeacherInputReview(showAlert, params.windowId);

  const [selectedSubmission, setSelectedSubmission] = useState<TeacherSubmission | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);

  const handleSubmissionPress = useCallback((s: TeacherSubmission) => {
    setSelectedSubmission(s);
    setShowReviewModal(true);
  }, []);

  const handleQuickApprove = useCallback((s: TeacherSubmission) => {
    handleReview(s.id, 'approved', '');
  }, [handleReview]);

  const handleQuickDecline = useCallback((s: TeacherSubmission) => {
    setSelectedSubmission(s);
    setShowReviewModal(true);
  }, []);

  const handleReviewSubmit = useCallback(async (id: string, status: SubmissionStatus, notes: string) => {
    await handleReview(id, status, notes);
  }, [handleReview]);

  const handleBulkApproveAll = useCallback(() => {
    const pendingIds = submissions.filter((s) => s.status === 'pending').map((s) => s.id);
    if (pendingIds.length === 0) {
      showAlert({ title: 'No Pending', message: 'No pending submissions to approve', type: 'info' });
      return;
    }
    showAlert({
      title: 'Bulk Approve',
      message: `Approve all ${pendingIds.length} pending submissions?`,
      type: 'warning',
      buttons: [
        { text: 'Approve All', onPress: () => handleBulkApprove(pendingIds) },
        { text: 'Cancel', style: 'cancel' },
      ],
    });
  }, [submissions, handleBulkApprove, showAlert]);

  const pendingCount = counts?.pending ?? 0;

  const content = (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Teacher Input</Text>
          <Text style={styles.headerSubtitle}>
            Review and incorporate teacher suggestions into your year plan
          </Text>
        </View>
        {pendingCount > 0 && (
          <TouchableOpacity style={styles.bulkBtn} onPress={handleBulkApproveAll}>
            <Ionicons name="checkmark-done" size={16} color="#fff" />
            <Text style={styles.bulkBtnText}>Approve All ({pendingCount})</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Stats Banner */}
      {counts && (
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: '#FEF3C7' }]}>
            <Text style={[styles.statCount, { color: '#F59E0B' }]}>{counts.pending}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#D1FAE5' }]}>
            <Text style={[styles.statCount, { color: '#10B981' }]}>{counts.approved + counts.modified}</Text>
            <Text style={styles.statLabel}>Approved</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#FEE2E2' }]}>
            <Text style={[styles.statCount, { color: '#EF4444' }]}>{counts.declined}</Text>
            <Text style={styles.statLabel}>Declined</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#E0E7FF' }]}>
            <Text style={[styles.statCount, { color: '#6366F1' }]}>{counts.total}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
        </View>
      )}

      {/* Filters */}
      <SubmissionFilters
        selectedStatus={filters.status}
        selectedCategory={filters.category}
        onStatusChange={(s) => setFilters({ status: s })}
        onCategoryChange={(c) => setFilters({ category: c })}
      />

      {loading ? (
        <View style={styles.center}>
          <EduDashSpinner />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          {submissions.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={48} color={theme.textSecondary} />
              <Text style={styles.emptyTitle}>No Submissions</Text>
              <Text style={styles.emptyText}>
                {filters.status !== 'all' || filters.category !== 'all'
                  ? 'No submissions match your filters. Try clearing filters.'
                  : 'No teacher submissions yet. Create an input window to start collecting ideas.'}
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.resultCount}>
                {submissions.length} submission{submissions.length !== 1 ? 's' : ''}
              </Text>
              {submissions.map((s) => (
                <SubmissionCard
                  key={s.id}
                  submission={s}
                  onPress={handleSubmissionPress}
                  showTeacherName
                  onApprove={s.status === 'pending' ? handleQuickApprove : undefined}
                  onDecline={s.status === 'pending' ? handleQuickDecline : undefined}
                />
              ))}
            </>
          )}
        </ScrollView>
      )}

      {/* Review Modal */}
      <SubmissionReviewModal
        visible={showReviewModal}
        submission={selectedSubmission}
        onClose={() => { setShowReviewModal(false); setSelectedSubmission(null); }}
        onReview={handleReviewSubmit}
        onIncorporate={handleIncorporate}
      />

      <AlertModal {...alertProps} />
    </View>
  );

  return (
    <DesktopLayout role="principal" title="Teacher Input Review" showBackButton mobileHeaderTopInsetOffset={4}>
      {content}
    </DesktopLayout>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, flexWrap: 'wrap', gap: 8,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: theme.text },
  headerSubtitle: { fontSize: 14, color: theme.textSecondary, marginTop: 4 },
  bulkBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#10B981', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
  },
  bulkBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  statsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  statCard: {
    flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12,
  },
  statCount: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 10, color: '#6B7280', marginTop: 2 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  resultCount: { fontSize: 13, color: theme.textSecondary, marginBottom: 10 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: theme.text },
  emptyText: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 20, maxWidth: 280 },
});
