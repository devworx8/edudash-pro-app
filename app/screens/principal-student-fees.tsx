/**
 * Principal Student Fee Management Screen
 *
 * Allows principals to:
 * - View all student fees at a glance
 * - Waive fees (full or partial)
 * - Correct/adjust student fees
 * - Change student classes
 * - View registration vs school fees summary
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Platform } from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import DateTimePicker from '@react-native-community/datetimepicker';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { WaiveFeeModal } from '@/components/principal/WaiveFeeModal';
import { AdjustFeeModal } from '@/components/principal/AdjustFeeModal';
import { ChangeClassModal } from '@/components/principal/ChangeClassModal';
import { useStudentFeeData, useStudentFeeActions, formatCurrency, formatDate, type StudentFee } from '@/hooks/student-fees';
import { createStyles } from '@/lib/screen-styles/principal-student-fees.styles';
import { useFinanceAccessGuard } from '@/hooks/useFinanceAccessGuard';
import FinancePasswordPrompt from '@/components/security/FinancePasswordPrompt';
import { assertSupabase } from '@/lib/supabase';

interface FeeCorrectionTimelineRow {
  id: string;
  action: string;
  reason: string;
  before_snapshot?: Record<string, any> | null;
  after_snapshot?: Record<string, any> | null;
  created_by_role?: string | null;
  source_screen?: string | null;
  created_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  waive: 'Waive Fee',
  adjust: 'Adjust Fee',
  mark_paid: 'Mark Paid',
  mark_unpaid: 'Mark Unpaid',
  recompute_balances: 'Recompute Balances',
  delete: 'Delete Fee',
  change_class: 'Change Class',
  tuition_sync: 'Sync Tuition',
  registration_paid: 'Registration Paid',
  registration_unpaid: 'Registration Unpaid',
};

export default function StudentFeeManagementScreen() {
  const router = useRouter();
  const { studentId, monthIso, source } = useLocalSearchParams<{
    studentId?: string;
    monthIso?: string;
    source?: string;
  }>();
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const financeAccess = useFinanceAccessGuard();
  const { showAlert: showAlertConfig, alertProps } = useAlertModal();
  const showAlert = useCallback(
    (
      title: string,
      message: string,
      type: 'info' | 'warning' | 'success' | 'error' = 'info',
      buttons?: any[]
    ) => {
      showAlertConfig({ title, message, type, buttons });
    },
    [showAlertConfig]
  );

  const data = useStudentFeeData(studentId, { monthIso, source });
  const [correctionTimeline, setCorrectionTimeline] = useState<FeeCorrectionTimelineRow[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [selectedDueDateFee, setSelectedDueDateFee] = useState<StudentFee | null>(null);
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);
  const [batchMarkingPaid, setBatchMarkingPaid] = useState(false);
  const loadCorrectionTimeline = useCallback(async () => {
    if (!studentId) {
      setCorrectionTimeline([]);
      return;
    }
    setTimelineLoading(true);
    try {
      const supabase = assertSupabase();
      const { data: rows, error } = await supabase
        .from('fee_corrections_audit')
        .select('id, action, reason, before_snapshot, after_snapshot, created_by_role, source_screen, created_at')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .limit(25);
      if (error) throw error;
      setCorrectionTimeline((rows || []) as FeeCorrectionTimelineRow[]);
    } catch (error) {
      console.warn('[StudentFeeManagement] Failed to load correction timeline', error);
      setCorrectionTimeline([]);
    } finally {
      setTimelineLoading(false);
    }
  }, [studentId]);

  const actions = useStudentFeeActions({
    student: data.student,
    setStudent: data.setStudent,
    studentRef: data.studentRef,
    classes: data.classes,
    organizationId: data.organizationId,
    loadFees: data.loadFees,
    loadStudent: data.loadStudent,
    loadCorrectionTimeline,
    showAlert,
    router,
  });

  const styles = useMemo(() => createStyles(theme, isDark, insets), [theme, isDark, insets]);
  const receivablesMonthLabel = useMemo(() => {
    if (!data.activeMonthIso) return null;
    return new Date(data.activeMonthIso).toLocaleDateString('en-ZA', {
      month: 'long',
      year: 'numeric',
    });
  }, [data.activeMonthIso]);
  const visibleFees = data.source === 'receivables' && !showFullHistory ? data.displayFeesForMonth : data.displayFees;
  const overdueFees = useMemo(() => visibleFees.filter(f => f.status === 'overdue'), [visibleFees]);
  const pendingFees = useMemo(() => visibleFees.filter(f => f.status === 'pending' || f.status === 'partially_paid'), [visibleFees]);
  const paidFees = useMemo(() => visibleFees.filter(f => f.status === 'paid' || f.status === 'waived'), [visibleFees]);
  const isReceivablesView = data.source === 'receivables' && !showFullHistory;

  useEffect(() => {
    if (financeAccess.needsPassword) return;
    void loadCorrectionTimeline();
  }, [financeAccess.needsPassword, loadCorrectionTimeline]);

  const handleRefresh = useCallback(async () => {
    await data.onRefresh();
    await loadCorrectionTimeline();
  }, [data.onRefresh, loadCorrectionTimeline]);

  const openDueDatePicker = useCallback((fee: StudentFee) => {
    if (!actions.canManageFees || actions.saving) return;
    setSelectedDueDateFee(fee);
    setShowDueDatePicker(true);
  }, [actions.canManageFees, actions.saving]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return theme.success;
      case 'pending': return theme.warning;
      case 'overdue': return theme.error;
      case 'waived': return theme.info || '#6B7280';
      default: return theme.textSecondary;
    }
  };

  const getFeeCardStyle = (status: string) => {
    switch (status) {
      case 'overdue': return styles.feeCardOverdue;
      case 'pending':
      case 'partially_paid': return styles.feeCardPending;
      case 'paid': return styles.feeCardPaid;
      default: return undefined;
    }
  };

  const handleBatchMarkOverduePaid = useCallback(async () => {
    if (!actions.canManageFees || batchMarkingPaid || overdueFees.length === 0) return;
    setBatchMarkingPaid(true);
    try {
      for (const fee of overdueFees) {
        await actions.handleMarkPaid(fee);
      }
    } finally {
      setBatchMarkingPaid(false);
    }
  }, [actions, batchMarkingPaid, overdueFees]);

  const handleBack = useCallback(() => {
    if (data.source === 'receivables') {
      try {
        router.replace('/screens/finance-control-center?tab=receivables' as any);
        return;
      } catch {
        // fall through to router.back
      }
    }
    try {
      router.back();
    } catch {
      router.replace('/screens/finance-control-center?tab=receivables' as any);
    }
  }, [data.source, router]);

  const renderFeeCard = (fee: StudentFee) => {
    const isMarkPaidBusy =
      actions.processingFeeId === fee.id && actions.processingFeeAction === 'mark_paid';
    const isMarkUnpaidBusy =
      actions.processingFeeId === fee.id && actions.processingFeeAction === 'mark_unpaid';
    const isDueDateUpdateBusy =
      actions.processingFeeId === fee.id && actions.processingFeeAction === 'update_due_date';
    return (
      <View key={fee.id} style={[styles.feeCard, getFeeCardStyle(fee.status)]}>
        <View style={styles.feeHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.feeDescription}>{fee.description || fee.fee_type}</Text>
            <Text style={styles.feeDueDate}>Due: {formatDate(fee.due_date)}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(fee.status) + '20' }]}>
            <Text style={[styles.statusText, { color: getStatusColor(fee.status) }]}>
              {fee.status.toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.feeAmounts}>
          <View style={styles.amountRow}>
            <Text style={styles.amountLabel}>Original:</Text>
            <Text style={styles.amountValue}>{formatCurrency(fee.amount)}</Text>
          </View>
          {fee.waived_amount != null && fee.waived_amount > 0 && (
            <View style={styles.amountRow}>
              <Text style={styles.amountLabel}>Waived:</Text>
              <Text style={[styles.amountValue, { color: '#6B7280' }]}>-{formatCurrency(fee.waived_amount)}</Text>
            </View>
          )}
          <View style={styles.amountRow}>
            <Text style={styles.amountLabel}>Final:</Text>
            <Text style={[styles.amountValue, styles.finalAmount]}>{formatCurrency(fee.final_amount)}</Text>
          </View>
        </View>

        {fee.waived_reason && (
          <View style={styles.waiverNote}>
            <Ionicons name="information-circle" size={14} color={theme.textSecondary} />
            <Text style={styles.waiverNoteText}>Waiver: {fee.waived_reason}</Text>
          </View>
        )}

        {(fee.status === 'pending' || fee.status === 'overdue' || fee.status === 'partially_paid') && (
          <>
            <View style={styles.feeActions}>
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  styles.paidButton,
                  (!actions.canManageFees || actions.saving || isMarkPaidBusy) && { opacity: 0.7 },
                ]}
                onPress={() => actions.handleMarkPaid(fee)}
                disabled={!actions.canManageFees || actions.saving || isMarkPaidBusy}
              >
                {isMarkPaidBusy ? (
                  <EduDashSpinner size="small" color={theme.success} />
                ) : (
                  <Ionicons name="checkmark-circle" size={16} color={theme.success} />
                )}
                <Text style={styles.paidButtonText}>{isMarkPaidBusy ? 'Marking Paid...' : 'Mark Paid'}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.feeActions}>
              <TouchableOpacity
                style={[styles.actionButton, styles.waiveButton, (!actions.canManageFees || actions.saving) && { opacity: 0.7 }]}
                disabled={!actions.canManageFees || actions.saving}
                onPress={() => {
                  actions.setSelectedFee(fee);
                  actions.setWaiveType('full');
                  actions.setWaiveAmount('');
                  actions.setWaiveReason('');
                  actions.setModalType('waive');
                }}
              >
                <Ionicons name="checkmark-done" size={16} color="#6B7280" />
                <Text style={styles.waiveButtonText}>Waive</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.adjustButton, (!actions.canManageFees || actions.saving) && { opacity: 0.7 }]}
                disabled={!actions.canManageFees || actions.saving}
                onPress={() => {
                  actions.setSelectedFee(fee);
                  actions.setAdjustAmount(fee.final_amount.toString());
                  actions.setAdjustReason('');
                  actions.setModalType('adjust');
                }}
              >
                <Ionicons name="create" size={16} color={theme.primary} />
                <Text style={styles.adjustButtonText}>Adjust</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  styles.rescheduleButton,
                  (!actions.canManageFees || actions.saving || isDueDateUpdateBusy) && { opacity: 0.7 },
                ]}
                disabled={!actions.canManageFees || actions.saving || isDueDateUpdateBusy}
                onPress={() => openDueDatePicker(fee)}
              >
                {isDueDateUpdateBusy ? (
                  <EduDashSpinner size="small" color={theme.info || theme.primary} />
                ) : (
                  <Ionicons name="calendar-outline" size={16} color={theme.info || theme.primary} />
                )}
                <Text style={styles.rescheduleButtonText}>
                  {isDueDateUpdateBusy ? 'Updating...' : 'Reschedule'}
                </Text>
              </TouchableOpacity>
            </View>
            {actions.canDeleteFees && (
              <View style={styles.feeActions}>
                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    styles.deleteButton,
                    (actions.saving || actions.processingFeeId === fee.id) && { opacity: 0.7 },
                  ]}
                  onPress={() => showAlert(
                    'Delete Fee Row',
                    'This will permanently remove the fee row and any linked allocations. Continue?',
                    'warning',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => void actions.handleDeleteFee(fee) },
                    ],
                  )}
                  disabled={actions.saving || actions.processingFeeId === fee.id}
                >
                  {actions.processingFeeId === fee.id && actions.processingFeeAction === 'delete' ? (
                    <EduDashSpinner size="small" color={theme.error} />
                  ) : (
                    <Ionicons name="trash-outline" size={16} color={theme.error} />
                  )}
                  <Text style={styles.deleteButtonText}>
                    {actions.processingFeeId === fee.id && actions.processingFeeAction === 'delete'
                      ? 'Deleting...'
                      : 'Delete Fee'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {fee.status === 'paid' && (
          <View style={styles.feeActions}>
            <TouchableOpacity
              style={[styles.actionButton, styles.receiptButton, actions.saving && { opacity: 0.7 }]}
              disabled={actions.saving}
              onPress={() => actions.handleReceiptAction(fee)}
            >
              <Ionicons name="receipt-outline" size={16} color={theme.primary} />
              <Text style={styles.receiptButtonText}>Receipt</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.actionButton,
                styles.unpaidButton,
                !actions.canManageFees && styles.controlDisabled,
                (actions.saving || isMarkUnpaidBusy) && { opacity: 0.7 },
              ]}
              onPress={() => actions.handleMarkUnpaid(fee)}
              disabled={!actions.canManageFees || actions.saving || isMarkUnpaidBusy}
            >
              {isMarkUnpaidBusy ? (
                <EduDashSpinner size="small" color={theme.warning} />
              ) : (
                <Ionicons name="refresh" size={16} color={theme.warning} />
              )}
              <Text style={styles.unpaidButtonText}>
                {isMarkUnpaidBusy ? 'Marking Unpaid...' : 'Mark Unpaid'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
        {fee.status === 'paid' && actions.canDeleteFees && (
          <View style={styles.feeActions}>
            <TouchableOpacity
              style={[
                styles.actionButton,
                styles.deleteButton,
                (actions.saving || actions.processingFeeId === fee.id) && { opacity: 0.7 },
              ]}
              onPress={() => showAlert(
                'Delete Paid Fee',
                'This is destructive and should only be used for incorrect duplicates. Continue?',
                'warning',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => void actions.handleDeleteFee(fee) },
                ],
              )}
              disabled={actions.saving || actions.processingFeeId === fee.id}
            >
              {actions.processingFeeId === fee.id && actions.processingFeeAction === 'delete' ? (
                <EduDashSpinner size="small" color={theme.error} />
              ) : (
                <Ionicons name="trash-outline" size={16} color={theme.error} />
              )}
              <Text style={styles.deleteButtonText}>
                {actions.processingFeeId === fee.id && actions.processingFeeAction === 'delete'
                  ? 'Deleting...'
                  : 'Delete Fee'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  if (financeAccess.needsPassword) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <Stack.Screen options={{ title: 'Fee Management' }} />
        <FinancePasswordPrompt
          visible={financeAccess.promptVisible}
          onSuccess={financeAccess.markUnlocked}
          onCancel={() => {
            financeAccess.dismissPrompt();
            try {
              router.back();
            } catch {
              router.replace('/screens/finance-control-center?tab=receivables' as any);
            }
          }}
        />
      </SafeAreaView>
    );
  }

  if (data.loading) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <Stack.Screen options={{ title: 'Fee Management' }} />
        <EduDashSpinner size="large" color={theme.primary} />
        <Text style={styles.loadingText}>Loading...</Text>
      </SafeAreaView>
    );
  }

  if (!data.student) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <Stack.Screen options={{ title: 'Fee Management' }} />
        <Ionicons name="person-outline" size={64} color={theme.textSecondary} />
        <Text style={styles.emptyTitle}>Student Not Found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const { student } = data;
  const isStudentInactive =
    student.is_active === false || String(student.status || '').toLowerCase() === 'inactive';
  const registrationMarkedPaid =
    Boolean(student.registration_fee_paid) || Boolean(student.payment_verified);

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: `${student.first_name}'s Fees` }} />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={data.refreshing}
            onRefresh={handleRefresh}
            colors={[theme.primary]}
            tintColor={theme.primary}
          />
        }
      >
        <View style={styles.pageHeader}>
          <TouchableOpacity style={styles.pageHeaderBack} onPress={handleBack}>
            <Ionicons name="arrow-back" size={18} color={theme.text} />
            <Text style={styles.pageHeaderBackText}>
              {data.source === 'receivables' ? 'Back to Receivables' : 'Back'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.pageHeaderTitle}>Student Fees</Text>
          <View style={styles.pageHeaderSpacer} />
        </View>

        {/* Student Info Card */}
        <View style={styles.studentCard}>
          <View style={styles.studentInfo}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {student.first_name.charAt(0)}{student.last_name.charAt(0)}
              </Text>
            </View>
            <View style={styles.studentDetails}>
              <Text style={styles.studentName}>
                {student.first_name} {student.last_name}
              </Text>
              <Text style={styles.studentMeta}>
                {student.class_name || 'No Class'} {'\u2022'} {student.parent_name || 'No Parent'}
              </Text>
              <View
                style={[
                  styles.statusPill,
                  isStudentInactive ? styles.statusPillInactive : styles.statusPillActive,
                ]}
              >
                <Ionicons
                  name={isStudentInactive ? 'pause-circle' : 'checkmark-circle'}
                  size={12}
                  color={isStudentInactive ? theme.warning : theme.success}
                />
                <Text
                  style={[
                    styles.statusPillText,
                    isStudentInactive ? styles.statusPillTextInactive : styles.statusPillTextActive,
                  ]}
                >
                  {isStudentInactive ? 'Inactive' : 'Active'}
                </Text>
              </View>
              {!data.hasParent && (
                <View style={styles.parentNotice}>
                  <Ionicons name="alert-circle-outline" size={14} color={theme.warning || '#f59e0b'} />
                  <Text style={styles.parentNoticeText}>Parent not linked</Text>
                  <TouchableOpacity style={styles.parentInviteButton} onPress={() => router.push('/screens/principal-parent-invite-code')}>
                    <Text style={styles.parentInviteText}>Invite Parent</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.parentInviteButton} onPress={() => router.push('/screens/principal-parent-requests')}>
                    <Text style={styles.parentInviteText}>Parent Requests</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          <View style={styles.enrollmentRow}>
            <Text style={styles.enrollmentLabel}>Start Date</Text>
            <TouchableOpacity
              style={[
                styles.enrollmentButton,
                !actions.canManageStudentProfile && styles.controlDisabled,
              ]}
              onPress={() => {
                if (!actions.canManageStudentProfile) return;
                actions.setShowEnrollmentPicker(true);
              }}
              disabled={!actions.canManageStudentProfile}
            >
              <Ionicons name="calendar" size={16} color={theme.primary} />
              <Text style={styles.enrollmentButtonText}>
                {student.enrollment_date ? formatDate(student.enrollment_date) : 'Set Date'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.registrationCard}>
            <View style={styles.registrationHeaderRow}>
              <View>
                <Text style={styles.registrationTitle}>Registration Fee</Text>
                <Text style={styles.registrationAmount}>
                  {formatCurrency(Number(student.registration_fee_amount || 0))}
                </Text>
              </View>
              <View
                style={[
                  styles.registrationStatusBadge,
                  registrationMarkedPaid
                    ? styles.registrationStatusBadgePaid
                    : styles.registrationStatusBadgeUnpaid,
                ]}
              >
                <Ionicons
                  name={registrationMarkedPaid ? 'checkmark-circle' : 'alert-circle'}
                  size={12}
                  color={registrationMarkedPaid ? theme.success : theme.warning}
                />
                <Text
                  style={[
                    styles.registrationStatusText,
                    registrationMarkedPaid
                      ? styles.registrationStatusTextPaid
                      : styles.registrationStatusTextUnpaid,
                  ]}
                >
                  {registrationMarkedPaid ? 'Paid' : 'Not Paid'}
                </Text>
              </View>
            </View>
            <View style={styles.registrationActionsRow}>
              <TouchableOpacity
                style={[
                  styles.registrationActionButton,
                  styles.registrationMarkPaidButton,
                  !actions.canManageFees && styles.controlDisabled,
                  (actions.saving || actions.updatingRegistrationStatus || registrationMarkedPaid) && { opacity: 0.6 },
                ]}
                disabled={!actions.canManageFees || actions.saving || actions.updatingRegistrationStatus || registrationMarkedPaid}
                onPress={() => void actions.handleSetRegistrationPaidStatus(true)}
              >
                {actions.updatingRegistrationStatus && !registrationMarkedPaid ? (
                  <EduDashSpinner size="small" color={theme.success} />
                ) : (
                  <Ionicons name="checkmark-circle-outline" size={15} color={theme.success} />
                )}
                <Text style={styles.registrationMarkPaidText}>Mark Paid</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.registrationActionButton,
                  styles.registrationMarkUnpaidButton,
                  !actions.canManageFees && styles.controlDisabled,
                  (actions.saving || actions.updatingRegistrationStatus || !registrationMarkedPaid) && { opacity: 0.6 },
                ]}
                disabled={!actions.canManageFees || actions.saving || actions.updatingRegistrationStatus || !registrationMarkedPaid}
                onPress={() => void actions.handleSetRegistrationPaidStatus(false)}
              >
                {actions.updatingRegistrationStatus && registrationMarkedPaid ? (
                  <EduDashSpinner size="small" color={theme.warning} />
                ) : (
                  <Ionicons name="refresh-circle-outline" size={15} color={theme.warning} />
                )}
                <Text style={styles.registrationMarkUnpaidText}>Mark Unpaid</Text>
              </TouchableOpacity>
              {registrationMarkedPaid && (
                <TouchableOpacity
                  style={[
                    styles.registrationActionButton,
                    styles.registrationReceiptButton,
                    (!actions.canManageFees || actions.saving || actions.processingRegistrationReceipt) && { opacity: 0.6 },
                  ]}
                  disabled={!actions.canManageFees || actions.saving || actions.processingRegistrationReceipt}
                  onPress={() => void actions.handleRegistrationReceiptAction()}
                >
                  {actions.processingRegistrationReceipt ? (
                    <EduDashSpinner size="small" color={theme.primary} />
                  ) : (
                    <Ionicons name="receipt-outline" size={15} color={theme.primary} />
                  )}
                  <Text style={styles.registrationReceiptText}>Receipt</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.changeClassButton,
              (isStudentInactive || !actions.canManageStudentProfile) && styles.changeClassButtonDisabled,
            ]}
            disabled={isStudentInactive || !actions.canManageStudentProfile}
            onPress={() => {
              if (isStudentInactive || !actions.canManageStudentProfile) return;
              actions.setNewClassId(student.class_id || '');
              actions.setClassRegistrationFee(Number(student.registration_fee_amount || 0).toFixed(2));
              actions.setClassFeeHint('Update class and registration fee together to fix parent-facing amount mismatches.');
              actions.setModalType('change_class');
            }}
          >
            <Ionicons name="swap-horizontal" size={18} color={theme.primary} />
            <Text style={styles.changeClassText}>Change Class</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.syncTuitionButton,
              (
                isStudentInactive ||
                !actions.canManageStudentProfile ||
                actions.syncingTuitionFees ||
                actions.saving
              ) && styles.changeClassButtonDisabled,
            ]}
            disabled={isStudentInactive || !actions.canManageStudentProfile || actions.syncingTuitionFees || actions.saving}
            onPress={() => void actions.handleSyncTuitionFeesToClass()}
          >
            {actions.syncingTuitionFees ? (
              <EduDashSpinner size="small" color={theme.info || theme.primary} />
            ) : (
              <Ionicons name="refresh-circle" size={18} color={theme.info || theme.primary} />
            )}
            <Text style={styles.syncTuitionText}>
              {actions.syncingTuitionFees ? 'Syncing Tuition...' : 'Sync Tuition To Class'}
            </Text>
          </TouchableOpacity>

          {!isStudentInactive ? (
            <TouchableOpacity
              style={[
                styles.markInactiveButton,
                !actions.canManageStudentProfile && styles.controlDisabled,
                (actions.saving || actions.deactivatingStudent) && { opacity: 0.7 },
              ]}
              onPress={actions.handleDeactivateStudent}
              disabled={!actions.canManageStudentProfile || actions.saving || actions.deactivatingStudent}
            >
              {actions.deactivatingStudent ? (
                <EduDashSpinner size="small" color={theme.warning} />
              ) : (
                <Ionicons name="pause-circle-outline" size={18} color={theme.warning} />
              )}
              <Text style={styles.markInactiveText}>
                {actions.deactivatingStudent ? 'Marking Inactive...' : 'Mark Inactive (30-day retention)'}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.inactiveInfoBanner}>
              <Ionicons name="information-circle-outline" size={14} color={theme.warning} />
              <Text style={styles.inactiveInfoText}>
                This learner is inactive and excluded from unpaid follow-up.
              </Text>
            </View>
          )}
        </View>

        {!actions.canManageStudentProfile && actions.canManageFees && (
          <View style={styles.roleScopeNotice}>
            <Ionicons name="information-circle-outline" size={14} color={theme.warning} />
            <Text style={styles.roleScopeNoticeText}>
              Admin mode: fee updates are enabled, but class/lifecycle changes require principal access.
            </Text>
          </View>
        )}

        <View style={styles.correctionGuideCard}>
          <View style={styles.correctionGuideHeader}>
            <Ionicons name="construct-outline" size={16} color={theme.primary} />
            <Text style={styles.correctionGuideTitle}>Correction Guide</Text>
          </View>
          <Text style={styles.correctionGuideStep}>1. Confirm class and fee category before editing.</Text>
          <Text style={styles.correctionGuideStep}>2. Use Mark Paid / Waive / Adjust / Reschedule to correct rows.</Text>
          <Text style={styles.correctionGuideStep}>3. Recompute learner balances to normalize status and outstanding totals.</Text>
          <Text style={styles.correctionGuideStep}>4. Validate the final state in Correction Timeline.</Text>
          {!actions.canDeleteFees && (
            <Text style={styles.correctionGuideMeta}>Delete fee rows requires principal access.</Text>
          )}
          <TouchableOpacity
            style={[
              styles.recomputeButton,
              (!actions.canManageFees || actions.recomputingBalances || actions.saving) && styles.controlDisabled,
            ]}
            onPress={() => void actions.handleRecomputeLearnerBalances()}
            disabled={!actions.canManageFees || actions.recomputingBalances || actions.saving}
          >
            {actions.recomputingBalances ? (
              <EduDashSpinner size="small" color={theme.info || theme.primary} />
            ) : (
              <Ionicons name="sync-outline" size={16} color={theme.info || theme.primary} />
            )}
            <Text style={styles.recomputeButtonText}>
              {actions.recomputingBalances ? 'Recomputing...' : 'Recompute Learner Balances'}
            </Text>
          </TouchableOpacity>
        </View>

        {actions.showEnrollmentPicker && (
          <DateTimePicker
            value={student.enrollment_date ? new Date(student.enrollment_date) : new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(_, selectedDate) => {
              if (Platform.OS !== 'ios') actions.setShowEnrollmentPicker(false);
              if (selectedDate) actions.handleUpdateEnrollmentDate(selectedDate);
            }}
          />
        )}
        {showDueDatePicker && (
          <DateTimePicker
            value={selectedDueDateFee?.due_date ? new Date(selectedDueDateFee.due_date) : new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(_, selectedDate) => {
              if (Platform.OS !== 'ios') setShowDueDatePicker(false);
              if (selectedDate && selectedDueDateFee) {
                void actions.handleUpdateFeeDueDate(selectedDueDateFee, selectedDate);
              }
              if (Platform.OS === 'ios') setShowDueDatePicker(false);
              setSelectedDueDateFee(null);
            }}
          />
        )}

        {/* Summary Cards */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { borderLeftColor: theme.error }]}>
            <Text style={styles.summaryLabel}>Outstanding</Text>
            <Text style={[styles.summaryValue, { color: theme.error }]}>{formatCurrency(data.totals.outstanding)}</Text>
          </View>
          <View style={[styles.summaryCard, { borderLeftColor: theme.success }]}>
            <Text style={styles.summaryLabel}>Paid</Text>
            <Text style={[styles.summaryValue, { color: theme.success }]}>{formatCurrency(data.totals.paid)}</Text>
          </View>
          <View style={[styles.summaryCard, { borderLeftColor: '#6B7280' }]}>
            <Text style={styles.summaryLabel}>Waived</Text>
            <Text style={[styles.summaryValue, { color: '#6B7280' }]}>{formatCurrency(data.totals.waived)}</Text>
          </View>
        </View>

        {/* Fees List */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {data.source === 'receivables'
              ? showFullHistory
                ? 'Full Fee History'
                : 'Outstanding Receivables'
              : 'Fee History'}
          </Text>

          {data.source === 'receivables' && (
            <View style={styles.contextBanner}>
              <Ionicons name="calendar-outline" size={14} color={theme.primary} />
              <Text style={styles.contextBannerText}>
                {showFullHistory
                  ? 'Showing full fee history. Switch back to month-scoped receivables.'
                  : `Viewing receivables for ${receivablesMonthLabel || 'the selected month'}.`}
              </Text>
              <TouchableOpacity
                onPress={() => setShowFullHistory((prev) => !prev)}
                style={styles.contextBannerAction}
              >
                <Text style={styles.contextBannerActionText}>
                  {showFullHistory ? 'Show receivables only' : 'Show full history'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {visibleFees.length === 0 ? (
            <View style={styles.emptyFees}>
              <Ionicons name="receipt-outline" size={48} color={theme.textSecondary} />
              <Text style={styles.emptyFeesText}>
                {data.source === 'receivables' && !showFullHistory
                  ? `No receivables for ${receivablesMonthLabel || 'the selected month'}`
                  : 'No fees recorded'}
              </Text>
              {data.feeSetupStatus === 'missing' && (
                <Text style={styles.emptyFeesHint}>No tuition fee setup found for this school yet.</Text>
              )}
              {data.feeSetupStatus === 'school_only' && (
                <Text style={styles.emptyFeesHint}>Fees are configured but haven't been generated for this student.</Text>
              )}
              {data.feeSetupStatus === 'skipped_inactive' && (
                <Text style={styles.emptyFeesHint}>Fee generation was skipped because this learner is not active.</Text>
              )}
              {data.feeSetupStatus !== 'missing' && data.feeSetupStatus !== 'skipped_inactive' && (
                <TouchableOpacity style={styles.generateFeesButton} onPress={data.handleGenerateFees} disabled={data.generatingFees}>
                  <Text style={styles.generateFeesText}>{data.generatingFees ? 'Generating...' : 'Generate Fees'}</Text>
                </TouchableOpacity>
              )}
              {(data.feeSetupStatus === 'missing' || data.feeSetupStatus === 'school_only') && (
                <TouchableOpacity style={styles.openFeeSetupButton} onPress={() => router.push('/screens/admin/fee-management')}>
                  <Text style={styles.openFeeSetupText}>Open Fee Setup</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <>
              {isReceivablesView && overdueFees.length > 0 && (
                <>
                  <View style={styles.overdueSectionHeader}>
                    <Ionicons name="alert-circle" size={18} color={theme.error} />
                    <Text style={styles.overdueSectionHeaderText}>Overdue Fees</Text>
                    <View style={styles.overdueSectionBadge}>
                      <Text style={styles.overdueSectionBadgeText}>{overdueFees.length}</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.batchActionButton,
                      (!actions.canManageFees || batchMarkingPaid || actions.saving) && { opacity: 0.6 },
                    ]}
                    onPress={() => showAlert(
                      'Mark All Overdue as Paid',
                      `This will mark ${overdueFees.length} overdue fee(s) totalling ${formatCurrency(overdueFees.reduce((s, f) => s + f.final_amount, 0))} as paid. Continue?`,
                      'warning',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Mark All Paid', onPress: () => void handleBatchMarkOverduePaid() },
                      ],
                    )}
                    disabled={!actions.canManageFees || batchMarkingPaid || actions.saving}
                  >
                    {batchMarkingPaid ? (
                      <EduDashSpinner size="small" color={theme.error} />
                    ) : (
                      <Ionicons name="checkmark-done-circle" size={18} color={theme.error} />
                    )}
                    <Text style={styles.batchActionButtonText}>
                      {batchMarkingPaid ? 'Processing...' : `Mark All Overdue as Paid (${overdueFees.length})`}
                    </Text>
                  </TouchableOpacity>
                </>
              )}

              {isReceivablesView && overdueFees.length > 0 && pendingFees.length > 0 ? (
                <>
                  {overdueFees.map(fee => renderFeeCard(fee))}
                  <View style={styles.pendingSectionHeader}>
                    <Ionicons name="time-outline" size={18} color={theme.warning} />
                    <Text style={styles.pendingSectionHeaderText}>Pending Fees</Text>
                  </View>
                  {pendingFees.map(fee => renderFeeCard(fee))}
                  {paidFees.map(fee => renderFeeCard(fee))}
                </>
              ) : (
                visibleFees.map(fee => renderFeeCard(fee))
              )}
            </>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Correction Timeline</Text>
          {timelineLoading ? (
            <View style={styles.timelineLoadingCard}>
              <EduDashSpinner size="small" color={theme.primary} />
              <Text style={styles.timelineLoadingText}>Loading correction timeline...</Text>
            </View>
          ) : correctionTimeline.length === 0 ? (
            <View style={styles.timelineEmptyCard}>
              <Ionicons name="time-outline" size={20} color={theme.textSecondary} />
              <Text style={styles.timelineEmptyText}>No correction actions recorded yet.</Text>
            </View>
          ) : (
            correctionTimeline.map((entry) => {
              const actionLabel = ACTION_LABELS[String(entry.action || '').toLowerCase()] || entry.action;
              const beforeAmount = Number(entry.before_snapshot?.final_amount ?? entry.before_snapshot?.amount ?? Number.NaN);
              const afterAmount = Number(entry.after_snapshot?.final_amount ?? entry.after_snapshot?.amount ?? Number.NaN);
              return (
                <View key={entry.id} style={styles.timelineCard}>
                  <View style={styles.timelineHeader}>
                    <Text style={styles.timelineAction}>{actionLabel}</Text>
                    <Text style={styles.timelineDate}>
                      {new Date(entry.created_at).toLocaleDateString('en-ZA', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </Text>
                  </View>
                  <Text style={styles.timelineReason}>{entry.reason}</Text>
                  {(Number.isFinite(beforeAmount) || Number.isFinite(afterAmount)) && (
                    <Text style={styles.timelineMeta}>
                      {Number.isFinite(beforeAmount) ? formatCurrency(beforeAmount) : '—'}
                      {'  →  '}
                      {Number.isFinite(afterAmount) ? formatCurrency(afterAmount) : '—'}
                    </Text>
                  )}
                  <Text style={styles.timelineMeta}>
                    {entry.created_by_role ? `Role: ${entry.created_by_role}` : 'Role: Unknown'}
                    {entry.source_screen ? ` • Source: ${entry.source_screen}` : ''}
                  </Text>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      <WaiveFeeModal
        visible={actions.modalType === 'waive'}
        fee={actions.selectedFee}
        saving={actions.saving}
        waiveType={actions.waiveType}
        waiveAmount={actions.waiveAmount}
        waiveReason={actions.waiveReason}
        onChangeType={actions.setWaiveType}
        onChangeAmount={actions.setWaiveAmount}
        onChangeReason={actions.setWaiveReason}
        onSubmit={actions.handleWaiveFee}
        onClose={() => actions.setModalType(null)}
        styles={styles}
      />

      <AdjustFeeModal
        visible={actions.modalType === 'adjust'}
        fee={actions.selectedFee}
        saving={actions.saving}
        adjustAmount={actions.adjustAmount}
        adjustReason={actions.adjustReason}
        onChangeAmount={actions.setAdjustAmount}
        onChangeReason={actions.setAdjustReason}
        onSubmit={actions.handleAdjustFee}
        onClose={() => actions.setModalType(null)}
        styles={styles}
      />

      <ChangeClassModal
        visible={actions.modalType === 'change_class'}
        student={data.student}
        classes={data.classes}
        saving={actions.saving}
        newClassId={actions.newClassId}
        classRegistrationFee={actions.classRegistrationFee}
        classFeeHint={actions.classFeeHint}
        loadingSuggestedFee={actions.loadingSuggestedFee}
        canSubmit={actions.canSubmitClassCorrection}
        onSelectClass={(id) => {
          actions.setNewClassId(id);
          actions.setClassFeeHint('');
          void actions.prefillRegistrationFeeForClass(id);
        }}
        onChangeFee={actions.setClassRegistrationFee}
        onClearHint={() => actions.setClassFeeHint('')}
        onSubmit={actions.handleChangeClass}
        onClose={() => actions.setModalType(null)}
        styles={styles}
      />

      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}
