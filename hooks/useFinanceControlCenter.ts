/**
 * useFinanceControlCenter Hook
 *
 * Extracts all business logic, state management and data-fetching from the
 * FinanceControlCenterScreen so the screen file stays slim (~300 lines).
 */

import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useAlertModal } from '@/components/ui/AlertModal';
import { derivePreschoolId } from '@/lib/roleUtils';
import { assertSupabase } from '@/lib/supabase';
import { inferFeeCategoryCode } from '@/lib/utils/feeUtils';
import { getMonthStartISO } from '@/lib/utils/dateUtils';
import { normalizePaymentMethodCode } from '@/lib/utils/paymentMethod';
import { finalizePaidFlow } from '@/services/finance/paidFlowService';
import { FinancialDataService } from '@/services/FinancialDataService';
import { PayrollService } from '@/services/PayrollService';
import { ExportService } from '@/lib/services/finance/ExportService';
import { useFinanceAccessGuard } from '@/hooks/useFinanceAccessGuard';
import { useFinanceCutoff } from '@/hooks/useFinanceCutoff';
import { useFinanceRealtimeRefresh } from '@/hooks/useFinanceRealtimeRefresh';
import type {
  FeeCategoryCode,
  FinanceControlCenterBundle,
  FinanceQueueStage,
  FinancePendingPOPRow,
  PayrollRosterItem,
} from '@/types/finance';
import { CenterTab, TAB_ITEMS, formatCurrency } from '@/lib/screen-data/finance-control-center.types';

export { formatCurrency };
export type { CenterTab, FeeCategoryCode, FinanceQueueStage, FinancePendingPOPRow, PayrollRosterItem };

export const CATEGORY_LABELS: Record<string, string> = {
  tuition: 'Tuition',
  registration: 'Registration',
  deposit: 'Deposit',
  uniform: 'Uniform',
  aftercare: 'Aftercare',
  transport: 'Transport',
  meal: 'Meals',
  meals: 'Meals',
  activities: 'Activities',
  excursion: 'Excursion',
  fundraiser: 'Fundraiser',
  donation_drive: 'Donation Drive',
  books: 'Books & Stationery',
  other: 'Other',
  ad_hoc: 'Other',
};

export const CATEGORY_COLORS: Record<FeeCategoryCode, string> = {
  tuition: '#3B82F6',
  registration: '#8B5CF6',
  uniform: '#F59E0B',
  aftercare: '#22C55E',
  transport: '#06B6D4',
  meal: '#EF4444',
  meals: '#EF4444',
  deposit: '#A855F7',
  activities: '#0EA5E9',
  excursion: '#0891B2',
  fundraiser: '#14B8A6',
  donation_drive: '#10B981',
  books: '#F97316',
  other: '#64748B',
  ad_hoc: '#64748B',
};

export const CATEGORY_OPTIONS: FeeCategoryCode[] = [
  'tuition',
  'registration',
  'deposit',
  'uniform',
  'aftercare',
  'transport',
  'meals',
  'meal',
  'activities',
  'excursion',
  'fundraiser',
  'donation_drive',
  'books',
  'other',
  'ad_hoc',
];

export const QUEUE_STAGE_ORDER: FinanceQueueStage[] = [
  'needs_month',
  'ready_to_approve',
  'approved',
  'rejected',
];

export const QUEUE_STAGE_LABELS: Record<FinanceQueueStage, string> = {
  needs_month: 'Needs month',
  ready_to_approve: 'Ready',
  approved: 'Approved',
  rejected: 'Rejected',
};

export const FINANCE_QUEUE_FUNNEL_V1 =
  process.env.EXPO_PUBLIC_FINANCE_QUEUE_FUNNEL_V1 !== 'false';

const TAB_SET = new Set<CenterTab>(TAB_ITEMS.map((tab) => tab.id));

const isCenterTab = (value: unknown): value is CenterTab =>
  typeof value === 'string' && TAB_SET.has(value as CenterTab);

const getTabFromParam = (value?: string | string[]): CenterTab => {
  const tab = Array.isArray(value) ? value[0] : value;
  return isCenterTab(tab) ? tab : 'overview';
};

export const formatAmountInput = (value: number): string => {
  if (!Number.isFinite(value)) return '';
  const rounded = Number(value.toFixed(2));
  return String(rounded).replace(/\.00$/, '');
};

export const parseAmountInput = (value: string): number => {
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

export const deriveNetSalary = (recipient?: PayrollRosterItem | null): number => {
  if (!recipient) return 0;
  const base = Number(recipient.base_salary || 0);
  const allowances = Number(recipient.allowances || 0);
  const deductions = Number(recipient.deductions || 0);
  const explicitNet = Number(recipient.net_salary);
  if (Number.isFinite(explicitNet) && explicitNet > 0) return explicitNet;
  const computed = base + allowances - deductions;
  return Number.isFinite(computed) ? computed : 0;
};

export const pickSectionError = (
  errors: FinanceControlCenterBundle['errors'] | undefined,
  key: 'snapshot' | 'receivables' | 'expenses' | 'breakdown' | 'queue' | 'payroll',
): string | null => {
  const value = errors?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
};

export function useFinanceControlCenter() {
  const { profile } = useAuth();
  const { theme } = useTheme();
  const { showAlert, alertProps } = useAlertModal();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();

  const orgId = derivePreschoolId(profile);
  const financeCutoffDay = useFinanceCutoff(orgId);
  const financeAccess = useFinanceAccessGuard();
  const issuerName =
    (profile as any)?.full_name ||
    `${(profile as any)?.first_name || ''} ${(profile as any)?.last_name || ''}`.trim() ||
    'School Administrator';
  const [activeTab, setActiveTab] = React.useState<CenterTab>(() => getTabFromParam(params.tab));
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [showMonthPicker, setShowMonthPicker] = React.useState(false);
  const [monthCursor, setMonthCursor] = React.useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [bundle, setBundle] = React.useState<FinanceControlCenterBundle | null>(null);
  const [processingPopId, setProcessingPopId] = React.useState<string | null>(null);
  const [queueCategoryOverrides, setQueueCategoryOverrides] = React.useState<Record<string, FeeCategoryCode>>({});
  const [queueMonthSelections, setQueueMonthSelections] = React.useState<Record<string, string>>({});
  const [queueStageFilter, setQueueStageFilter] = React.useState<'all' | FinanceQueueStage>('all');
  const [queueMismatchOnly, setQueueMismatchOnly] = React.useState(false);

  const [showPayModal, setShowPayModal] = React.useState(false);
  const [selectedRecipient, setSelectedRecipient] = React.useState<PayrollRosterItem | null>(null);
  const [payAmount, setPayAmount] = React.useState('');
  const [payMethod, setPayMethod] = React.useState('bank_transfer');
  const [payReference, setPayReference] = React.useState('');
  const [payNotes, setPayNotes] = React.useState('');
  const [recordingPayment, setRecordingPayment] = React.useState(false);
  const [showSalaryModal, setShowSalaryModal] = React.useState(false);
  const [selectedSalaryRecipient, setSelectedSalaryRecipient] = React.useState<PayrollRosterItem | null>(null);
  const [salaryBase, setSalaryBase] = React.useState('');
  const [salaryAllowances, setSalaryAllowances] = React.useState('');
  const [salaryDeductions, setSalaryDeductions] = React.useState('');
  const [salaryNotes, setSalaryNotes] = React.useState('');
  const [savingSalary, setSavingSalary] = React.useState(false);
  const [showHistoryModal, setShowHistoryModal] = React.useState(false);
  const [historyRecipient, setHistoryRecipient] = React.useState<PayrollRosterItem | null>(null);
  const [showAdvanceModal, setShowAdvanceModal] = React.useState(false);
  const [advanceRecipient, setAdvanceRecipient] = React.useState<PayrollRosterItem | null>(null);
  const [exportingReconciliation, setExportingReconciliation] = React.useState(false);

  const monthIso = React.useMemo(
    () => `${monthCursor.getFullYear()}-${String(monthCursor.getMonth() + 1).padStart(2, '0')}-01`,
    [monthCursor],
  );
  const monthLabel = React.useMemo(
    () => monthCursor.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' }),
    [monthCursor],
  );

  React.useEffect(() => {
    const nextTab = getTabFromParam(params.tab);
    setActiveTab((prev) => (prev === nextTab ? prev : nextTab));
  }, [params.tab]);

  const setTab = React.useCallback((nextTab: CenterTab) => {
    setActiveTab(nextTab);
    try {
      router.setParams({ tab: nextTab } as any);
    } catch {
      // Intentional: non-fatal.
    }
  }, [router]);

  const snapshot = bundle?.snapshot || null;
  const receivables = bundle?.receivables || null;
  const expenses = bundle?.expenses || null;
  const paymentBreakdown = bundle?.payment_breakdown || null;
  const pendingPOPs = bundle?.pending_pops || [];
  const queueRows = React.useMemo(
    () => (bundle?.queue_rows && bundle.queue_rows.length > 0 ? bundle.queue_rows : pendingPOPs),
    [bundle?.queue_rows, pendingPOPs],
  );
  const payrollItems = bundle?.payroll?.items || [];
  const receivableOutstandingByStudent = React.useMemo(() => {
    const map = new Map<string, number>();
    (receivables?.students || []).forEach((row) => {
      map.set(row.student_id, Number(row.outstanding_amount || 0));
    });
    return map;
  }, [receivables?.students]);

  const derivedOverview = React.useMemo(() => {
    const due = Number(snapshot?.due_this_month || 0);
    const collected = Number(snapshot?.collected_this_month || 0);
    const collectedAllocated = Number(snapshot?.collected_allocated_amount || 0);
    const outstanding = Number(snapshot?.still_outstanding || 0);
    const snapshotExpensesTotal = Number(snapshot?.expenses_this_month || 0);
    const breakdownExpensesTotal = Number(expenses?.total_expenses || 0);
    const snapshotPettyCashExpenses = Number(snapshot?.petty_cash_expenses_this_month || 0);
    const breakdownPettyCashExpenses = Number(expenses?.petty_cash_expenses || 0);
    const snapshotFinancialExpenses = Number(snapshot?.financial_expenses_this_month || 0);
    const breakdownFinancialExpenses = Number(expenses?.financial_expenses || 0);
    const hasBreakdown = Number.isFinite(breakdownExpensesTotal);
    const totalExpenses = hasBreakdown ? breakdownExpensesTotal : snapshotExpensesTotal;
    const pettyCashExpenses = hasBreakdown
      ? breakdownPettyCashExpenses
      : snapshotPettyCashExpenses;
    const financialExpenses = hasBreakdown
      ? breakdownFinancialExpenses
      : snapshotFinancialExpenses;
    const pendingAmount = Number(snapshot?.pending_amount || 0);
    const overdueAmount = Number(snapshot?.overdue_amount || 0);
    const equationDelta = Math.abs((due - collected) - outstanding);
    const allocationGap = Number.isFinite(Number(snapshot?.kpi_delta))
      ? Number(snapshot?.kpi_delta || 0)
      : Math.abs((due - outstanding) - collectedAllocated);

    return {
      due,
      collected,
      collectedAllocated,
      collectedSource: snapshot?.collected_source || 'allocations',
      outstanding,
      expenses: totalExpenses,
      pettyCashExpenses,
      financialExpenses,
      expenseEntries: Number(expenses?.entries?.length || 0),
      netAfterExpenses: Number(snapshot?.net_after_expenses || (collected - totalExpenses)),
      pendingAmount,
      overdueAmount,
      pendingStudents: Number(snapshot?.pending_students || receivables?.summary?.pending_students || 0),
      overdueStudents: Number(snapshot?.overdue_students || receivables?.summary?.overdue_students || 0),
      pendingCount: Number(snapshot?.pending_count || receivables?.summary?.pending_count || 0),
      overdueCount: Number(snapshot?.overdue_count || receivables?.summary?.overdue_count || 0),
      pendingPOPs: Math.max(Number(snapshot?.pending_pop_reviews || 0), pendingPOPs.length),
      prepaid: Number(snapshot?.prepaid_for_future_months || 0),
      payrollDue: Number(snapshot?.payroll_due || 0),
      payrollPaid: Number(snapshot?.payroll_paid || 0),
      kpiCorrelated: equationDelta < 0.01,
      kpiDelta: equationDelta,
      allocationGap,
      snapshotAsOf: snapshot?.as_of_date || snapshot?.generated_at || null,
    };
  }, [snapshot, receivables, expenses, pendingPOPs.length]);

  const loadData = React.useCallback(async (force = false) => {
    if (financeAccess.needsPassword) return;
    if (!orgId) return;
    if (force) setRefreshing(true);
    else setLoading(true);

    try {
      const data = await FinancialDataService.getFinanceControlCenterBundle(orgId, monthIso);
      setBundle(data);
      if (!data.snapshot && !data.receivables && !data.expenses && !data.payment_breakdown && !data.pending_pops.length) {
        showAlert({
          title: 'Finance Warning',
          message: 'Some finance sections are unavailable. You can still use the available tabs.',
          type: 'warning',
        });
      }
    } catch (error: any) {
      showAlert({
        title: 'Finance Error',
        message: error?.message || 'Failed to load finance control center',
        type: 'error',
      });
    } finally {
      setLoading(financeAccess.needsPassword ? true : false);
      setRefreshing(false);
    }
  }, [financeAccess.needsPassword, orgId, monthIso, showAlert]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  useFinanceRealtimeRefresh({
    organizationId: orgId,
    enabled: Boolean(orgId) && !financeAccess.needsPassword,
    onRefresh: () => loadData(true),
  });

  const onRefresh = React.useCallback(() => {
    loadData(true);
  }, [loadData]);

  const resolveQueueCategory = React.useCallback((upload: FinancePendingPOPRow): FeeCategoryCode => {
    const override = queueCategoryOverrides[upload.id];
    if (override) return override;
    return inferFeeCategoryCode(upload.category_code || upload.description || upload.title || 'tuition');
  }, [queueCategoryOverrides]);

  const openQueueCategoryPicker = React.useCallback((upload: FinancePendingPOPRow) => {
    const currentCode = resolveQueueCategory(upload);
    showAlert({
      title: 'Payment Category',
      message: 'Choose the category to use when approving this payment proof.',
      type: 'warning',
      buttons: [
        ...CATEGORY_OPTIONS.map((code) => ({
          text: `${CATEGORY_LABELS[code]}${currentCode === code ? ' ✓' : ''}`,
          onPress: () => {
            setQueueCategoryOverrides((prev) => ({ ...prev, [upload.id]: code }));
          },
        })),
        { text: 'Cancel', style: 'cancel' },
      ],
    });
  }, [resolveQueueCategory, showAlert]);

  const resolveQueueDisplayMonth = React.useCallback((upload: FinancePendingPOPRow) => (
    getMonthStartISO(upload.payment_for_month || upload.payment_date || upload.created_at || monthIso, {
      recoverUtcMonthBoundary: Boolean(upload.payment_for_month),
    })
  ), [monthIso]);

  const openQueueMonthPicker = React.useCallback((upload: FinancePendingPOPRow) => {
    const selectedMonth = queueMonthSelections[upload.id];
    const normalizedSelected = selectedMonth
      ? getMonthStartISO(selectedMonth, { recoverUtcMonthBoundary: true })
      : null;
    const currentMonthDate = new Date(monthIso);
    const previousMonthDate = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() - 1, 1);
    const nextMonthDate = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1, 1);
    const suggestedMonth = resolveQueueDisplayMonth(upload);
    const candidateMonths = [
      suggestedMonth,
      monthIso,
      `${previousMonthDate.getFullYear()}-${String(previousMonthDate.getMonth() + 1).padStart(2, '0')}-01`,
      `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}-01`,
    ].filter((candidate, index, list) => Boolean(candidate) && list.indexOf(candidate) === index);

    showAlert({
      title: 'Select Accounting Month',
      message: 'Choose the month this payment should settle against.',
      type: 'warning',
      buttons: [
        ...candidateMonths.map((candidate) => ({
          text: `${new Date(candidate).toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })}${
            normalizedSelected === candidate ? ' ✓' : ''
          }`,
          onPress: () => {
            setQueueMonthSelections((prev) => ({ ...prev, [upload.id]: candidate }));
          },
        })),
        { text: 'Cancel', style: 'cancel' },
      ],
    });
  }, [monthIso, queueMonthSelections, resolveQueueDisplayMonth, showAlert]);

  React.useEffect(() => {
    setQueueMonthSelections((prev) => {
      const next: Record<string, string> = {};
      queueRows.forEach((row) => {
        if (String(row.status || '').toLowerCase() !== 'pending') return;
        const resolvedMonth = resolveQueueDisplayMonth(row);
        const existing = prev[row.id];
        next[row.id] = existing
          ? getMonthStartISO(existing, { recoverUtcMonthBoundary: true })
          : resolvedMonth;
      });

      const prevKeys = Object.keys(prev).sort();
      const nextKeys = Object.keys(next).sort();
      if (
        prevKeys.length === nextKeys.length &&
        prevKeys.every((key, index) => key === nextKeys[index] && prev[key] === next[key])
      ) {
        return prev;
      }
      return next;
    });
  }, [queueRows, resolveQueueDisplayMonth]);

  const resolveQueueStage = React.useCallback((upload: FinancePendingPOPRow): FinanceQueueStage => {
    const status = String(upload.status || '').toLowerCase();
    if (status === 'approved') return 'approved';
    if (status === 'rejected' || status === 'needs_revision') return 'rejected';
    return queueMonthSelections[upload.id] ? 'ready_to_approve' : 'needs_month';
  }, [queueMonthSelections]);

  const isQueueMismatch = React.useCallback((upload: FinancePendingPOPRow) => {
    const expected = receivableOutstandingByStudent.get(upload.student_id);
    const submitted = Number(upload.payment_amount || 0);
    if (!Number.isFinite(expected) || !Number.isFinite(submitted)) return false;
    if (submitted <= 0 || expected <= 0) return false;
    return submitted > expected + 1;
  }, [receivableOutstandingByStudent]);

  const queueStageSummary = React.useMemo(() => {
    const stageMap = new Map<FinanceQueueStage, { count: number; amount: number }>();
    QUEUE_STAGE_ORDER.forEach((stage) => stageMap.set(stage, { count: 0, amount: 0 }));
    queueRows.forEach((row) => {
      const stage = resolveQueueStage(row);
      const amount = Number(row.payment_amount || 0);
      const current = stageMap.get(stage)!;
      current.count += 1;
      if (Number.isFinite(amount)) current.amount += amount;
      stageMap.set(stage, current);
    });
    return QUEUE_STAGE_ORDER.map((stage) => ({
      stage,
      count: stageMap.get(stage)?.count || 0,
      amount: Number((stageMap.get(stage)?.amount || 0).toFixed(2)),
    }));
  }, [queueRows, resolveQueueStage]);

  const visibleQueueRows = React.useMemo(() => {
    if (!FINANCE_QUEUE_FUNNEL_V1) return queueRows;
    return queueRows.filter((row) => {
      const stage = resolveQueueStage(row);
      if (queueStageFilter !== 'all' && stage !== queueStageFilter) return false;
      if (queueMismatchOnly && !isQueueMismatch(row)) return false;
      return true;
    });
  }, [isQueueMismatch, queueMismatchOnly, queueRows, queueStageFilter, resolveQueueStage]);

  const handleQuickApprove = React.useCallback(async (upload: FinancePendingPOPRow) => {
    if (!orgId) return;
    const selectedBillingMonth = queueMonthSelections[upload.id];
    if (!selectedBillingMonth) {
      console.info('finance.queue.month_required_block', { uploadId: upload.id, studentId: upload.student_id });
      showAlert({
        title: 'Month Required',
        message: 'Select accounting month to continue.',
        type: 'warning',
      });
      return;
    }
    setProcessingPopId(upload.id);
    try {
      const billingMonth = selectedBillingMonth;
      const originalCategory = inferFeeCategoryCode(upload.category_code || upload.description || upload.title || 'tuition');
      const categoryCode = resolveQueueCategory(upload);
      const categoryCorrectionNote = categoryCode !== originalCategory
        ? `Category corrected from ${CATEGORY_LABELS[originalCategory]} to ${CATEGORY_LABELS[categoryCode]}`
        : `Category confirmed as ${CATEGORY_LABELS[categoryCode]}`;
      console.info('finance.pop.approve.month_selected', {
        uploadId: upload.id,
        studentId: upload.student_id,
        billingMonth,
      });
      const approvalResult = await FinancialDataService.approvePOPWithAllocations({
        uploadId: upload.id,
        billingMonth,
        categoryCode,
        notes: `Approved from Finance Control Center. ${categoryCorrectionNote}.`,
      });
      try {
        if (!profile?.id) {
          throw new Error('Approver profile is missing.');
        }
        await finalizePaidFlow({
          context: 'pop',
          organizationId: orgId,
          amount: Number(upload.payment_amount || 0),
          paidDate: upload.payment_date || new Date().toISOString().split('T')[0],
          dueDate: billingMonth,
          billingMonth,
          description: upload.description || upload.title || 'School payment',
          paymentReference: upload.payment_reference || `POP-${upload.id.slice(0, 8).toUpperCase()}`,
          paymentMethod: 'bank_transfer',
          categoryCode,
          paymentId: approvalResult.paymentId || null,
          feeIds: approvalResult.feeIds,
          student: {
            id: upload.student_id,
            firstName: upload.student?.first_name || '',
            lastName: upload.student?.last_name || '',
          },
          issuer: {
            id: profile.id,
            name: issuerName,
          },
          metadata: {
            pop_upload_id: upload.id,
            approved_from: 'finance_control_center',
          },
          sendNotification: true,
        });
      } catch (receiptError: any) {
        showAlert({
          title: 'Receipt Warning',
          message: receiptError?.message || 'Payment was approved, but receipt generation failed.',
          type: 'warning',
        });
      }
      setQueueCategoryOverrides((prev) => {
        const next = { ...prev };
        delete next[upload.id];
        return next;
      });
      setQueueMonthSelections((prev) => {
        const next = { ...prev };
        delete next[upload.id];
        return next;
      });
      await loadData(true);
    } catch (error: any) {
      showAlert({
        title: 'Approval Failed',
        message: error?.message || 'Could not approve payment',
        type: 'error',
      });
    } finally {
      setProcessingPopId(null);
    }
  }, [issuerName, loadData, orgId, profile?.id, queueMonthSelections, resolveQueueCategory, showAlert]);

  const rejectPaymentProof = React.useCallback(async (upload: FinancePendingPOPRow, reason: string) => {
    setProcessingPopId(upload.id);
    try {
      const { error } = await assertSupabase()
        .from('pop_uploads')
        .update({
          status: 'rejected',
          reviewed_by: profile?.id,
          reviewed_at: new Date().toISOString(),
          review_notes: reason.trim(),
        })
        .eq('id', upload.id);
      if (error) throw error;
      await loadData(true);
    } catch (err: any) {
      showAlert({
        title: 'Rejection Failed',
        message: err?.message || 'Could not reject payment',
        type: 'error',
      });
    } finally {
      setProcessingPopId(null);
    }
  }, [loadData, profile?.id, showAlert]);

  const handleQuickReject = React.useCallback((upload: FinancePendingPOPRow) => {
    showAlert({
      title: 'Reject Payment',
      message: 'Choose a reason:',
      type: 'warning',
      buttons: [
        { text: 'Wrong amount', onPress: () => rejectPaymentProof(upload, 'Wrong amount submitted') },
        { text: 'Unreadable proof', onPress: () => rejectPaymentProof(upload, 'Proof document is unreadable') },
        { text: 'Duplicate payment', onPress: () => rejectPaymentProof(upload, 'Duplicate payment submission') },
        { text: 'Cancel', style: 'cancel' },
      ],
    });
  }, [rejectPaymentProof, showAlert]);

  const openPayModal = React.useCallback((recipient: PayrollRosterItem) => {
    setSelectedRecipient(recipient);
    setPayAmount(formatAmountInput(deriveNetSalary(recipient)));
    setPayMethod('bank_transfer');
    setPayReference('');
    setPayNotes('');
    setShowPayModal(true);
  }, []);

  const openSalaryModal = React.useCallback((recipient: PayrollRosterItem) => {
    setSelectedSalaryRecipient(recipient);
    setSalaryBase(formatAmountInput(Number(recipient.base_salary || 0)));
    setSalaryAllowances(formatAmountInput(Number(recipient.allowances || 0)));
    setSalaryDeductions(formatAmountInput(Number(recipient.deductions || 0)));
    setSalaryNotes('');
    setShowSalaryModal(true);
  }, []);

  const salaryPreviewNet = React.useMemo(() => {
    const base = parseAmountInput(salaryBase);
    const allowances = parseAmountInput(salaryAllowances);
    const deductions = parseAmountInput(salaryDeductions);
    if (![base, allowances, deductions].every(Number.isFinite)) return 0;
    return Number((base + allowances - deductions).toFixed(2));
  }, [salaryBase, salaryAllowances, salaryDeductions]);

  const submitPayrollPayment = React.useCallback(async () => {
    if (!selectedRecipient) return;
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      showAlert({ title: 'Invalid Amount', message: 'Enter a valid payment amount.', type: 'warning' });
      return;
    }

    try {
      setRecordingPayment(true);
      await PayrollService.recordPayment({
        payrollRecipientId: selectedRecipient.payroll_recipient_id,
        amount,
        paymentMonth: monthIso,
        paymentMethod: normalizePaymentMethodCode(payMethod),
        reference: payReference.trim() || undefined,
        notes: payNotes.trim() || undefined,
      });
      setShowPayModal(false);
      await loadData(true);
    } catch (error: any) {
      showAlert({ title: 'Payroll Error', message: error?.message || 'Failed to record payroll payment', type: 'error' });
    } finally {
      setRecordingPayment(false);
    }
  }, [selectedRecipient, payAmount, monthIso, payMethod, payReference, payNotes, loadData, showAlert]);

  const submitSalaryUpdate = React.useCallback(async () => {
    if (!selectedSalaryRecipient) return;

    const base = parseAmountInput(salaryBase);
    const allowances = parseAmountInput(salaryAllowances);
    const deductions = parseAmountInput(salaryDeductions);

    if (![base, allowances, deductions].every(Number.isFinite)) {
      showAlert({
        title: 'Invalid Salary',
        message: 'Enter valid numeric values for salary fields.',
        type: 'warning',
      });
      return;
    }

    if (base < 0 || allowances < 0 || deductions < 0) {
      showAlert({
        title: 'Invalid Salary',
        message: 'Salary values cannot be negative.',
        type: 'warning',
      });
      return;
    }

    try {
      setSavingSalary(true);
      await PayrollService.upsertSalaryProfile({
        payrollRecipientId: selectedSalaryRecipient.payroll_recipient_id,
        baseSalary: base,
        allowances,
        deductions,
        effectiveFrom: monthIso,
        notes: salaryNotes.trim() || undefined,
      });
      setShowSalaryModal(false);
      await loadData(true);
    } catch (error: any) {
      showAlert({
        title: 'Salary Update Failed',
        message: error?.message || 'Could not update salary profile',
        type: 'error',
      });
    } finally {
      setSavingSalary(false);
    }
  }, [selectedSalaryRecipient, salaryBase, salaryAllowances, salaryDeductions, salaryNotes, monthIso, loadData, showAlert]);

  const closeMonth = React.useCallback(() => {
    if (!orgId) return;
    showAlert({
      title: 'Close Month',
      message: `Lock ${monthLabel}? Backdated edits will be blocked until reopened.`,
      type: 'warning',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Lock Month',
          onPress: async () => {
            try {
              await PayrollService.closeMonth(orgId, monthIso);
              await loadData(true);
              showAlert({
                title: 'Month Locked',
                message: `${monthLabel} is now locked. You can export payments for bank reconciliation before starting fresh for next month.`,
                type: 'success',
              });
            } catch (error: any) {
              showAlert({ title: 'Month Lock Failed', message: error?.message || 'Could not lock month', type: 'error' });
            }
          },
        },
      ],
    });
  }, [orgId, monthIso, monthLabel, loadData, showAlert]);

  const handleExportBankReconciliation = React.useCallback(async () => {
    if (!orgId) return;
    setExportingReconciliation(true);
    try {
      const rows = await FinancialDataService.getPaymentsForBankReconciliation(orgId, monthIso);
      await ExportService.exportPaymentsForBankReconciliation(rows, monthLabel);
    } catch (error: any) {
      showAlert({
        title: 'Export Failed',
        message: error?.message || 'Could not export payments for bank reconciliation',
        type: 'error',
      });
    } finally {
      setExportingReconciliation(false);
    }
  }, [orgId, monthIso, monthLabel, showAlert]);

  return {
    theme,
    profile,
    router,
    alertProps,
    showAlert,
    orgId,
    financeAccess,
    activeTab,
    setTab,
    loading,
    refreshing,
    onRefresh,
    showMonthPicker,
    setShowMonthPicker,
    monthCursor,
    setMonthCursor,
    monthIso,
    monthLabel,
    bundle,
    snapshot,
    receivables,
    expenses,
    paymentBreakdown,
    pendingPOPs,
    queueRows,
    payrollItems,
    derivedOverview,
    processingPopId,
    queueStageFilter,
    setQueueStageFilter,
    queueMismatchOnly,
    setQueueMismatchOnly,
    queueStageSummary,
    visibleQueueRows,
    queueMonthSelections,
    resolveQueueCategory,
    resolveQueueDisplayMonth,
    resolveQueueStage,
    isQueueMismatch,
    openQueueCategoryPicker,
    openQueueMonthPicker,
    handleQuickApprove,
    handleQuickReject,
    loadData,
    showPayModal,
    setShowPayModal,
    selectedRecipient,
    payAmount,
    setPayAmount,
    payMethod,
    setPayMethod,
    payReference,
    setPayReference,
    payNotes,
    setPayNotes,
    recordingPayment,
    submitPayrollPayment,
    showSalaryModal,
    setShowSalaryModal,
    selectedSalaryRecipient,
    salaryBase,
    setSalaryBase,
    salaryAllowances,
    setSalaryAllowances,
    salaryDeductions,
    setSalaryDeductions,
    salaryNotes,
    setSalaryNotes,
    savingSalary,
    salaryPreviewNet,
    submitSalaryUpdate,
    showHistoryModal,
    setShowHistoryModal,
    historyRecipient,
    setHistoryRecipient,
    showAdvanceModal,
    setShowAdvanceModal,
    advanceRecipient,
    setAdvanceRecipient,
    exportingReconciliation,
    handleExportBankReconciliation,
    closeMonth,
    openPayModal,
    openSalaryModal,
  };
}
