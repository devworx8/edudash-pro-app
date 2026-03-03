import React from 'react';
import {
  View,
  Text,
  StyleSheet,
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

  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const [showIssueDocumentModal, setShowIssueDocumentModal] = React.useState(false);
  const [issueDocumentDraft, setIssueDocumentDraft] = React.useState<FinanceDocumentDraft | null>(null);
  const [issuingDocument, setIssuingDocument] = React.useState(false);
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

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    headerActionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    headerActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 6,
      paddingVertical: 4,
    },
    headerActionText: {
      fontSize: 11,
      fontWeight: '600',
    },
    tabRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      paddingHorizontal: 12,
      paddingTop: 6,
      paddingBottom: 6,
    },
    tabButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
    },
    tabButtonActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    tabButtonText: {
      fontSize: 12,
      color: theme.textSecondary,
      fontWeight: '600',
    },
    tabButtonTextActive: {
      color: '#fff',
    },
    content: {
      flex: 1,
      paddingHorizontal: 16,
    },
    loaderWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    section: {
      gap: 12,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: theme.text,
    },
    cardGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    metricCard: {
      width: '48%',
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      padding: 12,
      backgroundColor: theme.cardBackground,
    },
    metricLabel: {
      fontSize: 12,
      color: theme.textSecondary,
      marginBottom: 6,
    },
    metricValue: {
      fontSize: 18,
      fontWeight: '800',
      color: theme.text,
    },
    calloutCard: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      padding: 14,
      backgroundColor: theme.cardBackground,
    },
    calloutTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.text,
      marginBottom: 6,
    },
    calloutText: {
      fontSize: 14,
      color: theme.textSecondary,
    },
    infoBanner: {
      borderWidth: 1,
      borderColor: theme.primary + '40',
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: theme.primary + '12',
    },
    infoBannerText: {
      color: theme.text,
      fontSize: 12,
      lineHeight: 17,
    },
    errorCard: {
      borderWidth: 1,
      borderColor: (theme.warning || '#F59E0B') + '55',
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: (theme.warning || '#F59E0B') + '16',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    errorText: {
      color: theme.text,
      fontSize: 12,
      flex: 1,
      lineHeight: 17,
    },
    breakdownRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.border + '80',
    },
    breakdownLeft: {
      flex: 1,
      paddingRight: 10,
    },
    breakdownLabel: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '700',
    },
    breakdownMeta: {
      color: theme.textSecondary,
      fontSize: 12,
      marginTop: 2,
    },
    breakdownValue: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '800',
    },
    rowBetween: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
    },
    linkText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.primary,
    },
    emptyCard: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: 14,
      backgroundColor: theme.surface,
    },
    emptyText: {
      color: theme.textSecondary,
      fontSize: 13,
    },
    queueCard: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: 12,
      backgroundColor: theme.cardBackground,
      gap: 4,
    },
    queueTitle: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '700',
    },
    queueSubtext: {
      color: theme.textSecondary,
      fontSize: 12,
    },
    queueMetaRow: {
      marginTop: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    queueActions: {
      marginTop: 10,
      flexDirection: 'row',
      gap: 8,
    },
    queueSummaryCard: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: 12,
      backgroundColor: theme.cardBackground,
      gap: 10,
    },
    queueSummaryTitle: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '700',
    },
    queueSummaryChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    queueStageChip: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      backgroundColor: theme.surface,
      paddingHorizontal: 10,
      paddingVertical: 7,
      minWidth: 110,
      gap: 2,
    },
    queueStageChipActive: {
      borderColor: theme.primary,
      backgroundColor: theme.primary + '18',
    },
    queueStageChipLabel: {
      color: theme.text,
      fontSize: 11,
      fontWeight: '700',
    },
    queueStageChipLabelActive: {
      color: theme.primary,
    },
    queueStageChipMeta: {
      color: theme.textSecondary,
      fontSize: 10,
      fontWeight: '600',
    },
    queueMismatchChip: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: (theme.warning || '#F59E0B') + '55',
      borderRadius: 999,
      backgroundColor: (theme.warning || '#F59E0B') + '14',
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    queueMismatchChipActive: {
      backgroundColor: theme.warning || '#F59E0B',
      borderColor: theme.warning || '#F59E0B',
    },
    queueMismatchChipText: {
      color: theme.warning || '#F59E0B',
      fontSize: 11,
      fontWeight: '700',
    },
    queueMismatchChipTextActive: {
      color: '#fff',
    },
    queueMonthRow: {
      marginTop: 6,
    },
    queueMonthSelector: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderColor: theme.primary + '55',
      backgroundColor: theme.primary + '12',
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    queueMonthSelectorMissing: {
      borderColor: (theme.warning || '#F59E0B') + '55',
      backgroundColor: (theme.warning || '#F59E0B') + '14',
    },
    queueMonthSelectorText: {
      fontSize: 11,
      fontWeight: '700',
    },
    queueMismatchNotice: {
      marginTop: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: (theme.warning || '#F59E0B') + '55',
      borderRadius: 10,
      backgroundColor: (theme.warning || '#F59E0B') + '12',
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    queueMismatchNoticeText: {
      flex: 1,
      color: theme.text,
      fontSize: 11,
      lineHeight: 15,
    },
    badgeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 8,
    },
    statusBadge: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    statusBadgeText: {
      fontSize: 11,
      fontWeight: '700',
    },
    categoryBadge: {
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      alignSelf: 'flex-start',
    },
    categoryBadgeText: {
      fontSize: 11,
      fontWeight: '700',
    },
    categoryEditButton: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 5,
      gap: 4,
      marginLeft: 'auto',
    },
    categoryEditText: {
      fontSize: 11,
      fontWeight: '600',
    },
    primaryButton: {
      backgroundColor: theme.primary,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 110,
    },
    primaryButtonText: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '700',
    },
    successButton: {
      backgroundColor: theme.success || '#22C55E',
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 130,
    },
    secondaryButton: {
      backgroundColor: theme.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 12,
      paddingVertical: 9,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 90,
    },
    secondaryButtonText: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '700',
    },
    rolePill: {
      backgroundColor: theme.primary + '20',
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    rolePillText: {
      fontSize: 11,
      color: theme.primary,
      fontWeight: '700',
    },
    ruleCard: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: 12,
      backgroundColor: theme.cardBackground,
      gap: 8,
    },
    ruleText: {
      color: theme.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    modalKeyboardAvoid: {
      flex: 1,
    },
    modalCard: {
      backgroundColor: theme.cardBackground,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      padding: 16,
      borderTopWidth: 1,
      borderColor: theme.border,
      maxHeight: '90%',
    },
    modalFormScroll: {
      flexShrink: 1,
    },
    modalFormContent: {
      paddingBottom: 8,
      gap: 8,
    },
    modalTitle: {
      color: theme.text,
      fontSize: 18,
      fontWeight: '800',
    },
    inputLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.textSecondary,
      marginTop: 6,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: theme.text,
      backgroundColor: theme.surface,
      fontSize: 14,
    },
    methodChipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    methodChip: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 7,
      backgroundColor: theme.surface,
    },
    methodChipActive: {
      borderColor: theme.primary,
      backgroundColor: theme.primary,
    },
    methodChipText: {
      fontSize: 11,
      color: theme.text,
      fontWeight: '700',
    },
    methodChipTextActive: {
      color: '#fff',
    },
    documentLinkButton: {
      marginTop: 10,
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 6,
      borderWidth: 1,
      borderColor: theme.primary + '55',
      borderRadius: 999,
      backgroundColor: theme.primary + '14',
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    documentLinkText: {
      color: theme.primary,
      fontSize: 12,
      fontWeight: '700',
    },
    modalActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
      marginTop: 10,
    },
    salarySummaryCard: {
      borderWidth: 1,
      borderColor: theme.primary + '40',
      backgroundColor: theme.primary + '12',
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginTop: 8,
    },
    salarySummaryLabel: {
      fontSize: 12,
      color: theme.textSecondary,
      fontWeight: '700',
      marginBottom: 4,
    },
    salarySummaryValue: {
      fontSize: 18,
      color: theme.text,
      fontWeight: '800',
    },
  });
