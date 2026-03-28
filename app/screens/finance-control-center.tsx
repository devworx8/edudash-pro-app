import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertModal } from '@/components/ui/AlertModal';
import { SimpleHeader } from '@/components/ui/SimpleHeader';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { PAYMENT_METHOD_LABELS } from '@/lib/utils/paymentMethod';
import { PayrollPaymentHistory } from '@/components/principal/PayrollPaymentHistory';
import { PayrollAdvanceModal } from '@/components/principal/PayrollAdvanceModal';
import FinancePasswordPrompt from '@/components/security/FinancePasswordPrompt';
import { TAB_ITEMS } from '@/lib/screen-data/finance-control-center.types';

import { FinanceOverviewTab } from '@/components/finance/FinanceOverviewTab';
import { FinanceReceivablesTab } from '@/components/finance/FinanceReceivablesTab';
import { FinanceCollectionsTab } from '@/components/finance/FinanceCollectionsTab';
import { assertSupabase } from '@/lib/supabase';
import {
  FinanceDocumentService,
  type FinanceDocumentType,
} from '@/lib/services/finance/FinanceDocumentService';
import { removeTeacherFromSchool } from '@/lib/services/teacherRemovalService';
import { PayrollService } from '@/services/PayrollService';
import { sendReceivablePaymentReminders } from '@/services/finance/paymentReminderService';
import type { FinancePendingPOPRow, PayrollRosterItem } from '@/types/finance';
import {
  useFinanceControlCenter,
  formatCurrency,
  deriveNetSalary,
  pickSectionError,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  QUEUE_STAGE_LABELS,
  FINANCE_QUEUE_FUNNEL_V1,
} from '@/hooks/useFinanceControlCenter';
import { createFinanceControlCenterStyles } from './finance-control-center.styles';

type IssueDocumentSource = 'custom' | 'queue' | 'payroll';

interface FinanceDocumentDraft {
  source: IssueDocumentSource;
  documentType: FinanceDocumentType;
  title: string;
  description: string;
  amount: string;
  paidDate: string;
  dueDate: string;
  paymentMethod: string;
  paymentReference: string;
  categoryLabel: string;
  recipientName: string;
  sourceTag: string;
  studentId?: string | null;
  studentName?: string;
  parentId?: string | null;
  parentName?: string | null;
  parentEmail?: string | null;
}

const todayIso = () => new Date().toISOString().split('T')[0];

export default function FinanceControlCenterScreen() {
  const ctrl = useFinanceControlCenter();
  const {
    theme, profile, orgId, router, alertProps, showAlert, financeAccess, activeTab, setTab,
    loading, refreshing, onRefresh, showMonthPicker, setShowMonthPicker,
    monthCursor, setMonthCursor, monthIso, monthLabel, bundle,
    snapshot, receivables, expenses, paymentBreakdown, payrollItems,
    derivedOverview, processingPopId, queueStageFilter, setQueueStageFilter,
    queueMismatchOnly, setQueueMismatchOnly, queueStageSummary, visibleQueueRows,
    queueMonthSelections, resolveQueueCategory, resolveQueueDisplayMonth,
    resolveQueueStage, isQueueMismatch, openQueueCategoryPicker, openQueueMonthPicker,
    handleQuickApprove, handleQuickReject, loadData,
    showPayModal, setShowPayModal, selectedRecipient, payAmount, setPayAmount,
    payMethod, setPayMethod, payReference, setPayReference, payNotes, setPayNotes,
    recordingPayment, submitPayrollPayment,
    showSalaryModal, setShowSalaryModal, selectedSalaryRecipient,
    salaryBase, setSalaryBase, salaryAllowances, setSalaryAllowances,
    salaryDeductions, setSalaryDeductions, salaryNotes, setSalaryNotes,
    savingSalary, salaryPreviewNet, submitSalaryUpdate,
    showHistoryModal, setShowHistoryModal, historyRecipient, setHistoryRecipient,
    showAdvanceModal, setShowAdvanceModal, advanceRecipient, setAdvanceRecipient,
    exportingReconciliation, handleExportBankReconciliation, closeMonth,
    openPayModal, openSalaryModal,
  } = ctrl;

  const styles = React.useMemo(() => createFinanceControlCenterStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const [showIssueDocumentModal, setShowIssueDocumentModal] = React.useState(false);
  const [issueDocumentDraft, setIssueDocumentDraft] = React.useState<FinanceDocumentDraft | null>(null);
  const [issuingDocument, setIssuingDocument] = React.useState(false);
  const [sendingReceivableReminders, setSendingReceivableReminders] = React.useState(false);
  const [archivingPayrollRecipientId, setArchivingPayrollRecipientId] = React.useState<string | null>(null);
  const [issueDocumentResult, setIssueDocumentResult] = React.useState<{
    documentUrl?: string | null;
    notificationError?: string | null;
  } | null>(null);

  const openIssueDocumentModal = React.useCallback((draft: FinanceDocumentDraft) => {
    setIssueDocumentDraft(draft);
    setIssueDocumentResult(null);
    setShowIssueDocumentModal(true);
  }, []);

  const openCustomIssueDocumentModal = React.useCallback(() => {
    const paidDate = todayIso();
    openIssueDocumentModal({
      source: 'custom',
      documentType: 'invoice',
      title: `${monthLabel} Finance Document`,
      description: 'General finance charge',
      amount: '',
      paidDate,
      dueDate: paidDate,
      paymentMethod: 'bank_transfer',
      paymentReference: '',
      categoryLabel: 'General',
      recipientName: '',
      sourceTag: 'finance_control_center_manual',
    });
  }, [monthLabel, openIssueDocumentModal]);

  const openIssueDocumentForQueue = React.useCallback((item: FinancePendingPOPRow) => {
    const paidDate = (item.payment_date || item.created_at || new Date().toISOString()).toString().split('T')[0];
    const dueDate = resolveQueueDisplayMonth(item).split('T')[0];
    const studentName = `${item.student?.first_name || ''} ${item.student?.last_name || ''}`.trim() || 'Student';
    const categoryCode = resolveQueueCategory(item);

    openIssueDocumentModal({
      source: 'queue',
      documentType: 'receipt',
      title: `Payment ${item.payment_reference || item.id.slice(0, 8)}`,
      description: item.description || item.title || 'School fee payment',
      amount: String(item.payment_amount || ''),
      paidDate,
      dueDate,
      paymentMethod: 'bank_transfer',
      paymentReference: item.payment_reference || `POP-${item.id.slice(0, 8).toUpperCase()}`,
      categoryLabel: CATEGORY_LABELS[categoryCode] || 'School Fees',
      recipientName: studentName,
      sourceTag: 'finance_control_center_queue',
      studentId: item.student_id,
      studentName,
    });
  }, [openIssueDocumentModal, resolveQueueCategory, resolveQueueDisplayMonth]);

  const openIssueDocumentForPayroll = React.useCallback((recipient: PayrollRosterItem) => {
    const paidDate = todayIso();
    const amount = deriveNetSalary(recipient);
    const roleLabel = recipient.role_type === 'principal' ? 'Principal' : 'Teacher';

    openIssueDocumentModal({
      source: 'payroll',
      documentType: 'receipt',
      title: `${monthLabel} Payroll ${roleLabel}`,
      description: `${monthLabel} payroll payout`,
      amount: amount > 0 ? String(amount) : '',
      paidDate,
      dueDate: paidDate,
      paymentMethod: 'bank_transfer',
      paymentReference: `${roleLabel.toUpperCase()}-${monthIso.slice(0, 7)}-${recipient.payroll_recipient_id.slice(0, 6).toUpperCase()}`,
      categoryLabel: 'Payroll',
      recipientName: recipient.display_name,
      sourceTag: 'finance_control_center_payroll',
    });
  }, [monthIso, monthLabel, openIssueDocumentModal]);

  const resolveParentContext = React.useCallback(async (draft: FinanceDocumentDraft) => {
    if (draft.parentId || draft.parentEmail) {
      return {
        id: draft.parentId || null,
        name: draft.parentName || null,
        email: draft.parentEmail || null,
      };
    }
    if (!draft.studentId) return null;

    const supabase = assertSupabase();
    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('parent_id')
      .eq('id', draft.studentId)
      .maybeSingle();
    if (studentError) throw studentError;
    const parentId = (student as any)?.parent_id;
    if (!parentId) return null;

    const { data: parent, error: parentError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .eq('id', parentId)
      .maybeSingle();
    if (parentError) throw parentError;

    const name = `${(parent as any)?.first_name || ''} ${(parent as any)?.last_name || ''}`.trim();
    return {
      id: (parent as any)?.id || parentId,
      name: name || null,
      email: (parent as any)?.email || null,
    };
  }, []);

  const handleOpenGeneratedDocument = React.useCallback(async () => {
    if (!issueDocumentResult?.documentUrl) {
      showAlert({
        title: 'Document Missing',
        message: 'The document link is unavailable.',
        type: 'warning',
      });
      return;
    }
    try {
      await Linking.openURL(issueDocumentResult.documentUrl);
    } catch (error: any) {
      showAlert({
        title: 'Open Failed',
        message: error?.message || 'Could not open document.',
        type: 'error',
      });
    }
  }, [issueDocumentResult?.documentUrl, showAlert]);

  const handleGenerateIssueDocument = React.useCallback(async (sendToParent: boolean) => {
    if (!issueDocumentDraft || !profile?.id || !orgId) return;
    const amount = Number(issueDocumentDraft.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      showAlert({
        title: 'Invalid Amount',
        message: 'Enter a valid amount greater than zero.',
        type: 'warning',
      });
      return;
    }

    setIssuingDocument(true);
    try {
      const resolvedParent = await resolveParentContext(issueDocumentDraft);
      const parentReachable = Boolean(resolvedParent?.id || resolvedParent?.email);
      const issuerName =
        (profile as any)?.full_name ||
        `${(profile as any)?.first_name || ''} ${(profile as any)?.last_name || ''}`.trim() ||
        'School Administrator';

      const result = await FinanceDocumentService.generateAndOptionallySend({
        organizationId: orgId,
        documentType: issueDocumentDraft.documentType,
        title: issueDocumentDraft.title || 'Finance Document',
        description: issueDocumentDraft.description || 'Payment',
        amount,
        paidDate: issueDocumentDraft.paidDate || todayIso(),
        dueDate: issueDocumentDraft.documentType === 'invoice' ? issueDocumentDraft.dueDate || issueDocumentDraft.paidDate : null,
        paymentMethod: issueDocumentDraft.paymentMethod || 'manual',
        paymentReference: issueDocumentDraft.paymentReference || null,
        categoryLabel: issueDocumentDraft.categoryLabel || 'General',
        recipientName: issueDocumentDraft.recipientName || issueDocumentDraft.studentName || resolvedParent?.name || 'Recipient',
        sourceTag: issueDocumentDraft.sourceTag,
        student: issueDocumentDraft.studentId
          ? {
              id: issueDocumentDraft.studentId,
              firstName: issueDocumentDraft.studentName?.split(' ')[0] || null,
              lastName: issueDocumentDraft.studentName?.split(' ').slice(1).join(' ') || null,
            }
          : null,
        parent: resolvedParent,
        issuer: {
          id: profile.id,
          name: issuerName,
        },
        sendToParent: sendToParent && parentReachable,
      });

      if (resolvedParent?.id || resolvedParent?.email) {
        setIssueDocumentDraft((prev) =>
          prev
            ? {
                ...prev,
                parentId: resolvedParent.id,
                parentName: resolvedParent.name,
                parentEmail: resolvedParent.email,
              }
            : prev,
        );
      }
      setIssueDocumentResult({
        documentUrl: result.documentUrl || null,
        notificationError: result.notificationError || null,
      });

      if (sendToParent) {
        if (!parentReachable) {
          showAlert({
            title: 'Document Ready',
            message: 'Generated document, but no linked parent contact was found to send it.',
            type: 'warning',
          });
          return;
        }
        showAlert({
          title: result.notificationError ? 'Document Generated' : 'Document Sent',
          message: result.notificationError
            ? result.notificationError
            : 'Document generated and sent to parent.',
          type: result.notificationError ? 'warning' : 'success',
        });
      } else {
        showAlert({
          title: 'Document Ready',
          message: 'Document generated successfully.',
          type: 'success',
        });
      }
    } catch (error: any) {
      showAlert({
        title: 'Document Error',
        message: error?.message || 'Failed to generate document.',
        type: 'error',
      });
    } finally {
      setIssuingDocument(false);
    }
  }, [issueDocumentDraft, orgId, profile, resolveParentContext, showAlert]);

  const canSendIssueDocumentToParent = React.useMemo(() => {
    if (!issueDocumentDraft) return false;
    if (issueDocumentDraft.source === 'payroll') return false;
    return Boolean(issueDocumentDraft.parentId || issueDocumentDraft.parentEmail || issueDocumentDraft.studentId);
  }, [issueDocumentDraft]);

  const handleSendReceivableReminders = React.useCallback(() => {
    if (!orgId || !profile?.id) {
      showAlert({
        title: 'Missing School Details',
        message: 'We could not resolve your school profile for sending reminders.',
        type: 'error',
      });
      return;
    }

    const unpaidLearnerCount =
      Number(receivables?.summary?.students_total_unpaid || 0) ||
      Number(receivables?.students?.length || 0);

    if (!unpaidLearnerCount) {
      showAlert({
        title: 'Nothing To Send',
        message: 'There are no unpaid or overdue learners for the selected month.',
        type: 'info',
      });
      return;
    }

    showAlert({
      title: 'Send Payment Reminders',
      message: `Send payment reminders for all ${unpaidLearnerCount} unpaid learner account${unpaidLearnerCount === 1 ? '' : 's'} in ${monthLabel}? Linked parents and guardians will be notified.`,
      type: 'warning',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Reminders',
          onPress: async () => {
            setSendingReceivableReminders(true);
            try {
              const result = await sendReceivablePaymentReminders({
                orgId,
                monthIso,
                monthLabel,
                createdBy: profile.id,
              });

              await loadData(true);

              if (result.parentAccounts === 0) {
                showAlert({
                  title: 'No Parent Contacts Found',
                  message: `We found ${result.targetedStudents} learner account${result.targetedStudents === 1 ? '' : 's'} with outstanding fees, but none had linked parent or guardian contacts.`,
                  type: 'warning',
                });
                return;
              }

              showAlert({
                title: result.failedRecipients > 0 ? 'Reminders Partially Sent' : 'Reminders Sent',
                message: [
                  `Notified ${result.remindersSent} parent account${result.remindersSent === 1 ? '' : 's'} for ${result.targetedStudents} learner account${result.targetedStudents === 1 ? '' : 's'}.`,
                  result.emailsSent > 0
                    ? `${result.emailsSent} email reminder${result.emailsSent === 1 ? '' : 's'} were also sent.`
                    : '',
                  result.studentsWithoutContacts > 0
                    ? `${result.studentsWithoutContacts} learner account${result.studentsWithoutContacts === 1 ? '' : 's'} had no linked parent or guardian contact.`
                    : '',
                  result.failedRecipients > 0
                    ? `${result.failedRecipients} parent account${result.failedRecipients === 1 ? '' : 's'} could not be reached automatically.`
                    : '',
                ]
                  .filter(Boolean)
                  .join('\n\n'),
                type: result.failedRecipients > 0 ? 'warning' : 'success',
              });
            } catch (error: any) {
              showAlert({
                title: 'Reminder Failed',
                message: error?.message || 'Failed to send payment reminders.',
                type: 'error',
              });
            } finally {
              setSendingReceivableReminders(false);
            }
          },
        },
      ],
    });
  }, [loadData, monthIso, monthLabel, orgId, profile?.id, receivables?.students?.length, receivables?.summary?.students_total_unpaid, showAlert]);

  const handleArchivePayrollRecipient = React.useCallback((item: PayrollRosterItem) => {
    if (!orgId) {
      showAlert({
        title: 'No School Found',
        message: 'We could not resolve your school for this payroll action.',
        type: 'error',
      });
      return;
    }

    if (item.role_type === 'principal') {
      showAlert({
        title: 'Principal Locked',
        message: 'Principal payroll entries cannot be archived from this screen.',
        type: 'warning',
      });
      return;
    }

    const actionLabel = item.teacher_id ? 'Archive Teacher' : 'Remove From Payroll';
    const actionMessage = item.teacher_id
      ? `Archive ${item.display_name} from your school? They will be hidden from payroll and active teacher lists, while payroll history stays intact.`
      : `Remove ${item.display_name} from the active payroll roster? Existing payment history will be kept.`;

    showAlert({
      title: actionLabel,
      message: actionMessage,
      type: 'warning',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: actionLabel,
          style: 'destructive',
          onPress: async () => {
            setArchivingPayrollRecipientId(item.payroll_recipient_id);
            try {
              if (item.teacher_id) {
                await removeTeacherFromSchool({
                  teacherRecordId: item.teacher_id,
                  organizationId: orgId,
                  teacherUserId: item.profile_id || null,
                  reason: 'Archived via finance payroll roster',
                });
              } else {
                await PayrollService.deactivateRecipient({
                  payrollRecipientId: item.payroll_recipient_id,
                });
              }

              await loadData(true);

              showAlert({
                title: 'Payroll Updated',
                message: item.teacher_id
                  ? 'Teacher archived and removed from the active payroll roster.'
                  : 'Payroll recipient removed from the active roster.',
                type: 'success',
              });
            } catch (error: any) {
              showAlert({
                title: 'Archive Failed',
                message: error?.message || 'Failed to update the payroll roster.',
                type: 'error',
              });
            } finally {
              setArchivingPayrollRecipientId(null);
            }
          },
        },
      ],
    });
  }, [loadData, orgId, showAlert]);

  const renderSectionError = (message: string | null) => {
    if (!message) return null;
    return (
      <View style={styles.errorCard}>
        <Ionicons name="warning-outline" size={16} color={theme.warning || '#F59E0B'} />
        <Text style={styles.errorText}>{message}</Text>
      </View>
    );
  };

  const renderQueue = () => (
    <View style={styles.section}>
      <View style={styles.rowBetween}>
        <Text style={styles.sectionTitle}>Operational Queue</Text>
        <TouchableOpacity onPress={() => router.push(`/screens/pop-review?monthIso=${monthIso}` as any)}>
          <Text style={styles.linkText}>Open Full Review</Text>
        </TouchableOpacity>
      </View>
      {renderSectionError(pickSectionError(bundle?.errors, 'queue'))}
      <View style={styles.queueSummaryCard}>
        <Text style={styles.queueSummaryTitle}>Queue Funnel ({monthLabel})</Text>
        {FINANCE_QUEUE_FUNNEL_V1 ? (
          <>
            <View style={styles.queueSummaryChips}>
              {queueStageSummary.map((summary) => {
                const active = queueStageFilter === summary.stage;
                return (
                  <TouchableOpacity
                    key={summary.stage}
                    style={[styles.queueStageChip, active && styles.queueStageChipActive]}
                    onPress={() =>
                      setQueueStageFilter((prev) => (prev === summary.stage ? 'all' : summary.stage))
                    }
                  >
                    <Text style={[styles.queueStageChipLabel, active && styles.queueStageChipLabelActive]}>
                      {QUEUE_STAGE_LABELS[summary.stage]}
                    </Text>
                    <Text style={[styles.queueStageChipMeta, active && styles.queueStageChipLabelActive]}>
                      {summary.count} • {formatCurrency(summary.amount)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              style={[styles.queueMismatchChip, queueMismatchOnly && styles.queueMismatchChipActive]}
              onPress={() => setQueueMismatchOnly((prev) => !prev)}
            >
              <Ionicons name="alert-circle-outline" size={14} color={queueMismatchOnly ? '#fff' : theme.warning || '#F59E0B'} />
              <Text style={[styles.queueMismatchChipText, queueMismatchOnly && styles.queueMismatchChipTextActive]}>
                {queueMismatchOnly ? 'Mismatch filter on' : 'Show amount mismatches'}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.queueSubtext}>Queue funnel filters are disabled by feature flag.</Text>
        )}
      </View>
      {visibleQueueRows.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No payment proofs matched this queue filter.</Text>
        </View>
      ) : (
        visibleQueueRows.map((item) => {
          const processing = processingPopId === item.id;
          const studentName = `${item.student?.first_name || ''} ${item.student?.last_name || ''}`.trim() || 'Student';
          const stage = resolveQueueStage(item);
          const categoryCode = resolveQueueCategory(item);
          const categoryColor = CATEGORY_COLORS[categoryCode] || theme.primary;
          const displayMonth = resolveQueueDisplayMonth(item);
          const selectedMonth = queueMonthSelections[item.id];
          const effectivePaymentMonth = selectedMonth || displayMonth;
          const pendingApproval = String(item.status || '').toLowerCase() === 'pending';
          const mismatch = isQueueMismatch(item);
          return (
            <View key={item.id} style={styles.queueCard}>
              <View style={styles.rowBetween}>
                <Text style={styles.queueTitle}>{studentName}</Text>
                <View style={[
                  styles.statusBadge,
                  {
                    backgroundColor:
                      stage === 'approved'
                        ? theme.success + '20'
                        : stage === 'rejected'
                          ? theme.error + '20'
                          : stage === 'ready_to_approve'
                            ? theme.primary + '20'
                            : (theme.warning || '#F59E0B') + '20',
                  },
                ]}>
                  <Text
                    style={[
                      styles.statusBadgeText,
                      {
                        color:
                          stage === 'approved'
                            ? theme.success
                            : stage === 'rejected'
                              ? theme.error
                              : stage === 'ready_to_approve'
                                ? theme.primary
                                : theme.warning || '#F59E0B',
                      },
                    ]}
                  >
                    {QUEUE_STAGE_LABELS[stage]}
                  </Text>
                </View>
              </View>
              <Text style={styles.queueSubtext}>
                Amount: {formatCurrency(item.payment_amount)}
              </Text>
              <Text style={styles.queueSubtext}>
                Payment For:{' '}
                {new Date(effectivePaymentMonth).toLocaleDateString('en-ZA', {
                  month: 'short',
                  year: 'numeric',
                })}
              </Text>
              {pendingApproval && (
                <View style={styles.queueMonthRow}>
                  <TouchableOpacity
                    style={[styles.queueMonthSelector, !selectedMonth && styles.queueMonthSelectorMissing]}
                    onPress={() => openQueueMonthPicker(item)}
                    disabled={processing}
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={13}
                      color={selectedMonth ? theme.primary : theme.warning || '#F59E0B'}
                    />
                    <Text
                      style={[
                        styles.queueMonthSelectorText,
                        { color: selectedMonth ? theme.primary : theme.warning || '#F59E0B' },
                      ]}
                    >
                      {selectedMonth
                        ? `Accounting Month: ${new Date(selectedMonth).toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })}`
                        : 'Select accounting month'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
              {selectedMonth && selectedMonth !== displayMonth && (
                <Text style={styles.queueSubtext}>
                  Allocation override: this POP will be posted to{' '}
                  {new Date(selectedMonth).toLocaleDateString('en-ZA', {
                    month: 'short',
                    year: 'numeric',
                  })}
                  .
                </Text>
              )}
              <View style={styles.queueMetaRow}>
                <View style={[styles.categoryBadge, { backgroundColor: categoryColor + '20', borderColor: categoryColor + '55' }]}>
                  <Text style={[styles.categoryBadgeText, { color: categoryColor }]}>
                    {CATEGORY_LABELS[categoryCode]}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.categoryEditButton, { borderColor: theme.border }]}
                  onPress={() => openQueueCategoryPicker(item)}
                  disabled={processing}
                >
                  <Ionicons name="create-outline" size={12} color={theme.textSecondary} />
                  <Text style={[styles.categoryEditText, { color: theme.textSecondary }]}>Change</Text>
                </TouchableOpacity>
              </View>
              {mismatch && (
                <View style={styles.queueMismatchNotice}>
                  <Ionicons name="warning-outline" size={14} color={theme.warning || '#F59E0B'} />
                  <Text style={styles.queueMismatchNoticeText}>
                    Submitted amount appears higher than current outstanding for this learner.
                  </Text>
                </View>
              )}
              <Text style={styles.queueSubtext}>Ref: {item.payment_reference || 'N/A'}</Text>
              {pendingApproval ? (
                <View style={styles.queueActions}>
                  <TouchableOpacity
                    style={[styles.secondaryButton, processing && { opacity: 0.6 }]}
                    onPress={() => handleQuickReject(item)}
                    disabled={processing}
                  >
                    <Text style={styles.secondaryButtonText}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.primaryButton, (processing || !selectedMonth) && { opacity: 0.6 }]}
                    onPress={() => handleQuickApprove(item)}
                    disabled={processing || !selectedMonth}
                  >
                    {processing ? (
                      <EduDashSpinner size="small" color="#fff" />
                    ) : (
                      <Text style={styles.primaryButtonText}>
                        {!selectedMonth ? 'Select month first' : 'Approve'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.queueActions}>
                  <Text style={styles.queueSubtext}>
                    Final status captured. Use Full Review for further notes.
                  </Text>
                </View>
              )}
              <View style={[styles.queueActions, { marginTop: 4 }]}>
                <TouchableOpacity
                  style={[styles.secondaryButton, processing && { opacity: 0.6 }]}
                  onPress={() => openIssueDocumentForQueue(item)}
                  disabled={processing}
                >
                  <Ionicons name="document-text-outline" size={14} color={theme.text} />
                  <Text style={styles.secondaryButtonText}> Document</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}
    </View>
  );

  const renderPayroll = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Payroll (Teachers + Principal)</Text>
      {renderSectionError(pickSectionError(bundle?.errors, 'payroll'))}
      {bundle?.payroll_fallback_used && (
        <View style={styles.infoBanner}>
          <Text style={styles.infoBannerText}>
            Payroll roster is in compatibility mode. Apply migration 20260212102000_fix_payroll_roster_on_conflict.sql to remove this warning.
          </Text>
        </View>
      )}
      {payrollItems.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No payroll recipients found yet.</Text>
        </View>
      ) : (
        payrollItems.map((item) => {
          const netSalary = deriveNetSalary(item);
          return (
            <View key={item.payroll_recipient_id} style={styles.queueCard}>
              <View style={styles.rowBetween}>
                <Text style={styles.queueTitle}>{item.display_name}</Text>
                <View style={styles.rolePill}>
                  <Text style={styles.rolePillText}>{item.role_type === 'principal' ? 'Principal' : 'Teacher'}</Text>
                </View>
              </View>
              <Text style={styles.queueSubtext}>Net Salary: {formatCurrency(netSalary)}</Text>
              <Text style={styles.queueSubtext}>
                Base {formatCurrency(item.base_salary)} | Allowances {formatCurrency(item.allowances)} | Deductions {formatCurrency(item.deductions)}
              </Text>
              <Text style={styles.queueSubtext}>
                Paid This Month: {item.paid_this_month ? formatCurrency(item.paid_amount_this_month) : 'Not yet'}
              </Text>
              <View style={styles.queueActions}>
                <TouchableOpacity style={styles.primaryButton} onPress={() => openPayModal(item)}>
                  <Text style={styles.primaryButtonText}>Record Payment</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => openSalaryModal(item)}>
                  <Text style={styles.secondaryButtonText}>Edit Salary</Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.queueActions, { marginTop: 4 }]}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => {
                    setHistoryRecipient(item);
                    setShowHistoryModal(true);
                  }}
                >
                  <Ionicons name="receipt-outline" size={14} color={theme.text} />
                  <Text style={styles.secondaryButtonText}> History</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => {
                    setAdvanceRecipient(item);
                    setShowAdvanceModal(true);
                  }}
                >
                  <Ionicons name="cash-outline" size={14} color={theme.text} />
                  <Text style={styles.secondaryButtonText}> Advances</Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.queueActions, { marginTop: 4 }]}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => openIssueDocumentForPayroll(item)}
                >
                  <Ionicons name="document-text-outline" size={14} color={theme.text} />
                  <Text style={styles.secondaryButtonText}> Document</Text>
                </TouchableOpacity>
                {item.role_type === 'teacher' && (
                  <TouchableOpacity
                    style={[
                      styles.secondaryButton,
                      {
                        borderColor: theme.error,
                        backgroundColor: `${theme.error}12`,
                        opacity: archivingPayrollRecipientId === item.payroll_recipient_id ? 0.8 : 1,
                      },
                    ]}
                    disabled={archivingPayrollRecipientId === item.payroll_recipient_id}
                    onPress={() => handleArchivePayrollRecipient(item)}
                  >
                    {archivingPayrollRecipientId === item.payroll_recipient_id ? (
                      <EduDashSpinner size="small" color={theme.error} />
                    ) : (
                      <Ionicons name="person-remove-outline" size={14} color={theme.error} />
                    )}
                    <Text style={[styles.secondaryButtonText, { color: theme.error }]}>
                      {archivingPayrollRecipientId === item.payroll_recipient_id ? ' Archiving...' : ' Archive'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })
      )}
    </View>
  );

  const renderRules = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Categories & Rules</Text>
      <View style={styles.ruleCard}>
        <Text style={styles.ruleText}>Every payment must include billing month and category.</Text>
        <Text style={styles.ruleText}>Pending and overdue KPIs are sourced from student fee ledger records.</Text>
        <Text style={styles.ruleText}>Late-month payments (day 25 onward) roll into next month when billing month is missing.</Text>
        <Text style={styles.ruleText}>Principal payroll is tracked in the same roster as teachers.</Text>
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, snapshot?.month_locked && { opacity: 0.6 }]}
        onPress={closeMonth}
        disabled={Boolean(snapshot?.month_locked)}
      >
        <Text style={styles.primaryButtonText}>
          {snapshot?.month_locked ? 'Month Locked' : `Lock ${monthLabel}`}
        </Text>
      </TouchableOpacity>
      {snapshot?.month_locked && (
        <Text style={[styles.queueSubtext, { marginTop: 8 }]}>This month is locked. Backdated finance edits are blocked.</Text>
      )}
    </View>
  );

  const headerRight = (
    <View style={styles.headerActionsRow}>
      <TouchableOpacity
        style={[styles.headerActionBtn, { borderColor: theme.primary + '40', backgroundColor: theme.primary + '15' }]}
        onPress={() => setShowMonthPicker(true)}
      >
        <Ionicons name="calendar-outline" size={14} color={theme.primary} />
        <Text style={[styles.headerActionText, { color: theme.primary }]}>{monthLabel}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.headerActionBtn, { borderColor: theme.border }]}
        onPress={handleExportBankReconciliation}
        disabled={exportingReconciliation}
      >
        {exportingReconciliation ? (
          <EduDashSpinner size="small" color={theme.primary} />
        ) : (
          <Ionicons name="download-outline" size={14} color={theme.primary} />
        )}
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.headerActionBtn, { borderColor: theme.border }]}
        onPress={openCustomIssueDocumentModal}
      >
        <Ionicons name="document-text-outline" size={14} color={theme.primary} />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.headerActionBtn, { borderColor: theme.border }, snapshot?.month_locked && { opacity: 0.6 }]}
        onPress={closeMonth}
        disabled={Boolean(snapshot?.month_locked)}
      >
        <Ionicons
          name={snapshot?.month_locked ? 'lock-closed' : 'lock-open-outline'}
          size={14}
          color={snapshot?.month_locked ? theme.textSecondary : theme.primary}
        />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <SimpleHeader title="Finance Control Center" compact rightAction={headerRight} />
      <View style={styles.tabRow}>
        {TAB_ITEMS.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tabButton, active && styles.tabButtonActive]}
              onPress={() => setTab(tab.id)}
            >
              <Ionicons name={tab.icon} size={16} color={active ? '#fff' : theme.textSecondary} />
              <Text style={[styles.tabButtonText, active && styles.tabButtonTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <EduDashSpinner size="large" color={theme.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          {activeTab === 'overview' && (
            <FinanceOverviewTab
              bundle={bundle}
              snapshot={snapshot}
              derivedOverview={derivedOverview}
              monthLabel={monthLabel}
              theme={theme}
              styles={styles}
              renderSectionError={renderSectionError}
            />
          )}
          {activeTab === 'receivables' && (
            <FinanceReceivablesTab
              bundle={bundle}
              receivables={receivables}
              monthIso={monthIso}
              organizationId={ctrl.orgId || ''}
              theme={theme}
              styles={styles}
              sendingReminders={sendingReceivableReminders}
              onSendReminders={handleSendReceivableReminders}
              renderSectionError={renderSectionError}
            />
          )}
          {activeTab === 'collections' && (
            <FinanceCollectionsTab
              bundle={bundle}
              snapshot={snapshot}
              expenses={expenses}
              paymentBreakdown={paymentBreakdown}
              monthLabel={monthLabel}
              theme={theme}
              styles={styles}
              renderSectionError={renderSectionError}
            />
          )}
          {activeTab === 'queue' && renderQueue()}
          {activeTab === 'payroll' && renderPayroll()}
          {activeTab === 'rules' && renderRules()}
          <View style={{ height: 8 }} />
        </ScrollView>
      )}

      <FinancePasswordPrompt
        visible={financeAccess.promptVisible}
        onSuccess={financeAccess.markUnlocked}
        onCancel={() => {
          financeAccess.dismissPrompt();
          try {
            router.back();
          } catch {
            router.replace('/screens/principal-dashboard' as any);
          }
        }}
      />

      {showMonthPicker && (
        <DateTimePicker
          value={monthCursor}
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
            setShowMonthPicker(false);
            if (event.type === 'dismissed' || !selectedDate) return;
            setMonthCursor(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
          }}
        />
      )}

      <Modal
        visible={showPayModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPayModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalKeyboardAvoid}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom, 12) }]}>
              <ScrollView
                style={styles.modalFormScroll}
                contentContainerStyle={styles.modalFormContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.modalTitle}>Record Payroll Payment</Text>
                <Text style={styles.queueSubtext}>{selectedRecipient?.display_name}</Text>

                <Text style={styles.inputLabel}>Amount (R)</Text>
                <TextInput
                  style={styles.input}
                  value={payAmount}
                  onChangeText={setPayAmount}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={theme.textSecondary}
                />

                <Text style={styles.inputLabel}>Method</Text>
                <View style={styles.methodChipRow}>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([code, label]) => {
                    const selected = payMethod === code;
                    return (
                      <TouchableOpacity
                        key={code}
                        style={[styles.methodChip, selected && styles.methodChipActive]}
                        onPress={() => setPayMethod(code)}
                      >
                        <Text style={[styles.methodChipText, selected && styles.methodChipTextActive]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={styles.inputLabel}>Reference (optional)</Text>
                <TextInput
                  style={styles.input}
                  value={payReference}
                  onChangeText={setPayReference}
                  placeholder="Reference"
                  placeholderTextColor={theme.textSecondary}
                />

                <Text style={styles.inputLabel}>Notes (optional)</Text>
                <TextInput
                  style={[styles.input, { minHeight: 64 }]}
                  value={payNotes}
                  onChangeText={setPayNotes}
                  placeholder="Notes"
                  placeholderTextColor={theme.textSecondary}
                  multiline
                />
              </ScrollView>

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => setShowPayModal(false)} disabled={recordingPayment}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryButton} onPress={submitPayrollPayment} disabled={recordingPayment}>
                  {recordingPayment ? <EduDashSpinner size="small" color="#fff" /> : <Text style={styles.primaryButtonText}>Save Payment</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={showSalaryModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSalaryModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalKeyboardAvoid}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom, 12) }]}>
              <ScrollView
                style={styles.modalFormScroll}
                contentContainerStyle={styles.modalFormContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.modalTitle}>Edit Salary</Text>
                <Text style={styles.queueSubtext}>{selectedSalaryRecipient?.display_name}</Text>
                <Text style={styles.queueSubtext}>Effective month: {monthLabel}</Text>

                <Text style={styles.inputLabel}>Base Salary (R)</Text>
                <TextInput
                  style={styles.input}
                  value={salaryBase}
                  onChangeText={setSalaryBase}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={theme.textSecondary}
                />

                <Text style={styles.inputLabel}>Allowances (R)</Text>
                <TextInput
                  style={styles.input}
                  value={salaryAllowances}
                  onChangeText={setSalaryAllowances}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={theme.textSecondary}
                />

                <Text style={styles.inputLabel}>Deductions (R)</Text>
                <TextInput
                  style={styles.input}
                  value={salaryDeductions}
                  onChangeText={setSalaryDeductions}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={theme.textSecondary}
                />

                <View style={styles.salarySummaryCard}>
                  <Text style={styles.salarySummaryLabel}>Net Salary</Text>
                  <Text style={styles.salarySummaryValue}>{formatCurrency(salaryPreviewNet)}</Text>
                </View>

                <Text style={styles.inputLabel}>Notes (optional)</Text>
                <TextInput
                  style={[styles.input, { minHeight: 64 }]}
                  value={salaryNotes}
                  onChangeText={setSalaryNotes}
                  placeholder="Notes"
                  placeholderTextColor={theme.textSecondary}
                  multiline
                />
              </ScrollView>

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => setShowSalaryModal(false)} disabled={savingSalary}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryButton} onPress={submitSalaryUpdate} disabled={savingSalary}>
                  {savingSalary ? <EduDashSpinner size="small" color="#fff" /> : <Text style={styles.primaryButtonText}>Save Salary</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <Modal
        visible={showIssueDocumentModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowIssueDocumentModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalKeyboardAvoid}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom, 12) }]}>
              <ScrollView
                style={styles.modalFormScroll}
                contentContainerStyle={styles.modalFormContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.modalTitle}>Issue Finance Document</Text>
                <Text style={styles.queueSubtext}>
                  Source: {issueDocumentDraft?.source || 'custom'}
                </Text>

                <Text style={styles.inputLabel}>Document Type</Text>
                <View style={styles.methodChipRow}>
                  {(['invoice', 'receipt'] as const).map((docType) => {
                    const selected = issueDocumentDraft?.documentType === docType;
                    return (
                      <TouchableOpacity
                        key={docType}
                        style={[styles.methodChip, selected && styles.methodChipActive]}
                        onPress={() =>
                          setIssueDocumentDraft((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  documentType: docType,
                                }
                              : prev,
                          )
                        }
                      >
                        <Text style={[styles.methodChipText, selected && styles.methodChipTextActive]}>
                          {docType === 'invoice' ? 'Invoice' : 'Receipt'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={styles.inputLabel}>Title</Text>
                <TextInput
                  style={styles.input}
                  value={issueDocumentDraft?.title || ''}
                  onChangeText={(value) =>
                    setIssueDocumentDraft((prev) => (prev ? { ...prev, title: value } : prev))
                  }
                  placeholder="Document title"
                  placeholderTextColor={theme.textSecondary}
                />

                <Text style={styles.inputLabel}>Description</Text>
                <TextInput
                  style={[styles.input, { minHeight: 64 }]}
                  value={issueDocumentDraft?.description || ''}
                  onChangeText={(value) =>
                    setIssueDocumentDraft((prev) => (prev ? { ...prev, description: value } : prev))
                  }
                  placeholder="What is this payment for?"
                  placeholderTextColor={theme.textSecondary}
                  multiline
                />

                <Text style={styles.inputLabel}>Recipient Name</Text>
                <TextInput
                  style={styles.input}
                  value={issueDocumentDraft?.recipientName || ''}
                  onChangeText={(value) =>
                    setIssueDocumentDraft((prev) => (prev ? { ...prev, recipientName: value } : prev))
                  }
                  placeholder="Learner / staff / parent name"
                  placeholderTextColor={theme.textSecondary}
                />

                <Text style={styles.inputLabel}>Category Label</Text>
                <TextInput
                  style={styles.input}
                  value={issueDocumentDraft?.categoryLabel || ''}
                  onChangeText={(value) =>
                    setIssueDocumentDraft((prev) => (prev ? { ...prev, categoryLabel: value } : prev))
                  }
                  placeholder="Tuition / Payroll / Uniform / Other"
                  placeholderTextColor={theme.textSecondary}
                />

                <Text style={styles.inputLabel}>Amount (R)</Text>
                <TextInput
                  style={styles.input}
                  value={issueDocumentDraft?.amount || ''}
                  onChangeText={(value) =>
                    setIssueDocumentDraft((prev) => (prev ? { ...prev, amount: value } : prev))
                  }
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={theme.textSecondary}
                />

                <Text style={styles.inputLabel}>Paid Date (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.input}
                  value={issueDocumentDraft?.paidDate || ''}
                  onChangeText={(value) =>
                    setIssueDocumentDraft((prev) => (prev ? { ...prev, paidDate: value } : prev))
                  }
                  placeholder={todayIso()}
                  placeholderTextColor={theme.textSecondary}
                />

                {issueDocumentDraft?.documentType === 'invoice' && (
                  <>
                    <Text style={styles.inputLabel}>Due Date (YYYY-MM-DD)</Text>
                    <TextInput
                      style={styles.input}
                      value={issueDocumentDraft?.dueDate || ''}
                      onChangeText={(value) =>
                        setIssueDocumentDraft((prev) => (prev ? { ...prev, dueDate: value } : prev))
                      }
                      placeholder={todayIso()}
                      placeholderTextColor={theme.textSecondary}
                    />
                  </>
                )}

                <Text style={styles.inputLabel}>Payment Method</Text>
                <TextInput
                  style={styles.input}
                  value={issueDocumentDraft?.paymentMethod || ''}
                  onChangeText={(value) =>
                    setIssueDocumentDraft((prev) => (prev ? { ...prev, paymentMethod: value } : prev))
                  }
                  placeholder="bank_transfer"
                  placeholderTextColor={theme.textSecondary}
                />

                <Text style={styles.inputLabel}>Reference</Text>
                <TextInput
                  style={styles.input}
                  value={issueDocumentDraft?.paymentReference || ''}
                  onChangeText={(value) =>
                    setIssueDocumentDraft((prev) => (prev ? { ...prev, paymentReference: value } : prev))
                  }
                  placeholder="Reference code"
                  placeholderTextColor={theme.textSecondary}
                />

                {issueDocumentResult?.documentUrl ? (
                  <TouchableOpacity
                    style={styles.documentLinkButton}
                    onPress={handleOpenGeneratedDocument}
                    disabled={issuingDocument}
                  >
                    <Ionicons name="open-outline" size={14} color={theme.primary} />
                    <Text style={styles.documentLinkText}>View Generated Document</Text>
                  </TouchableOpacity>
                ) : null}
              </ScrollView>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => setShowIssueDocumentModal(false)}
                  disabled={issuingDocument}
                >
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => handleGenerateIssueDocument(false)}
                  disabled={issuingDocument}
                >
                  {issuingDocument ? (
                    <EduDashSpinner size="small" color="#fff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Generate</Text>
                  )}
                </TouchableOpacity>
                {canSendIssueDocumentToParent ? (
                  <TouchableOpacity
                    style={styles.successButton}
                    onPress={() => handleGenerateIssueDocument(true)}
                    disabled={issuingDocument}
                  >
                    {issuingDocument ? (
                      <EduDashSpinner size="small" color="#fff" />
                    ) : (
                      <Text style={styles.primaryButtonText}>Generate & Send</Text>
                    )}
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <PayrollPaymentHistory
        visible={showHistoryModal}
        recipient={historyRecipient}
        monthIso={monthIso}
        monthLabel={monthLabel}
        onClose={() => { setShowHistoryModal(false); setHistoryRecipient(null); }}
        onDataChanged={() => loadData(true)}
      />
      <PayrollAdvanceModal
        visible={showAdvanceModal}
        recipient={advanceRecipient}
        organizationId={ctrl.orgId || ''}
        onClose={() => { setShowAdvanceModal(false); setAdvanceRecipient(null); }}
        onDataChanged={() => loadData(true)}
      />
      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}
