// filepath: /media/king/5e026cdc-594e-4493-bf92-c35c231beea3/home/king/Desktop/dashpro/app/screens/principal-report-review.tsx
// Principal Report Review Screen - Refactored for WARP.md compliance (≤500 lines)

import React from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { ReportApprovalCard } from '@/components/progress-report/ReportApprovalCard';
import { SignaturePad } from '@/components/signature/SignaturePad';
import { useReportReview } from '@/hooks/principal/useReportReview';
import {
  ReviewDetailModal,
  ApproveModal,
  RejectModal,
  PRINCIPAL_ROLES,
} from '@/components/principal/report-review';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
export default function PrincipalReportReviewScreen() {
  const { theme } = useTheme();
  const { user, profile } = useAuth();

  // Derive school ID
  const schoolId =
    (profile as any)?.preschool_id ||
    profile?.organization_id ||
    (user as any)?.user_metadata?.preschool_id ||
    null;

  const review = useReportReview({ schoolId, userId: user?.id });

  // Security: Check principal role
  const isPrincipal = PRINCIPAL_ROLES.includes(profile?.role || '');
  const principalName = profile
    ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
    : 'Principal';

  if (!isPrincipal) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: theme.error }]}>
            Access denied. This screen is only available to principals.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Empty state
  if (!review.isLoading && review.reports.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
        <ScrollView
          contentContainerStyle={styles.emptyState}
          refreshControl={
            <RefreshControl refreshing={review.isLoading} onRefresh={review.refetch} tintColor={theme.primary} />
          }
        >
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No Pending Reports</Text>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            There are no reports awaiting your review at this time.
          </Text>
          <Text style={[styles.emptyHint, { color: theme.textSecondary }]}>Pull down to refresh</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Review Reports</Text>
        <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
          {review.reports.length} pending {review.reports.length === 1 ? 'report' : 'reports'}
        </Text>
      </View>

      {/* List */}
      {review.isLoading ? (
        <View style={styles.loadingContainer}>
          <EduDashSpinner size="large" color={theme.primary} />
        </View>
      ) : (
        <FlashList
          data={review.reports}
          renderItem={({ item }) => (
            <ReportApprovalCard report={item} onPress={() => review.handleReportPress(item)} />
          )}
          keyExtractor={(item) => item.id}
          estimatedItemSize={120}
          contentContainerStyle={styles.listContent}
          onRefresh={review.refetch}
          refreshing={review.isLoading}
        />
      )}

      {/* Detail Modal */}
      <ReviewDetailModal
        report={review.selectedReport}
        onClose={review.handleCloseDetail}
        onApprove={review.handleApprovePress}
        onReject={review.handleRejectPress}
        theme={theme}
      />

      {/* Approve Modal */}
      <ApproveModal
        visible={review.showApproveModal}
        principalSignature={review.principalSignature}
        principalName={principalName}
        approvalNotes={review.approvalNotes}
        isApproving={review.isApproving}
        onOpenSignaturePad={() => review.setShowSignaturePad(true)}
        onChangeNotes={review.setApprovalNotes}
        onConfirm={review.handleConfirmApprove}
        onClose={() => review.setShowApproveModal(false)}
        theme={theme}
      />

      {/* Reject Modal */}
      <RejectModal
        visible={review.showRejectModal}
        rejectionReason={review.rejectionReason}
        approvalNotes={review.approvalNotes}
        isRejecting={review.isRejecting}
        onChangeReason={review.setRejectionReason}
        onChangeNotes={review.setApprovalNotes}
        onConfirm={review.handleConfirmReject}
        onClose={() => review.setShowRejectModal(false)}
        theme={theme}
      />

      {/* Signature Pad */}
      <SignaturePad
        visible={review.showSignaturePad}
        signerName={principalName}
        signerRole="principal"
        onSave={review.handleSignatureSaved}
        onCancel={() => review.setShowSignaturePad(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingVertical: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    padding: 20,
  },
});
