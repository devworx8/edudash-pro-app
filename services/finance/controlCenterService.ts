/**
 * Finance control-center: month snapshot, payment breakdown, POP approval,
 * and the aggregated control-center bundle.
 */

import { assertSupabase } from '@/lib/supabase';
import { inferFeeCategoryCode } from '@/lib/utils/feeUtils';
import { normalizePaymentMethodCode } from '@/lib/utils/paymentMethod';
import { PayrollService } from '@/services/PayrollService';

import type {
  ApprovePopPaymentPayload,
  ApprovePopPaymentResult,
  FinanceControlCenterBundle,
  FinanceMonthSnapshot,
} from '@/types/finance';
import type { FinanceMonthPaymentBreakdown } from '../financial/types';
import { withFinanceTenant } from './tenantUtils';
import { normalizeMonthIso } from './dateHelpers';
import {
  CATEGORY_LABELS,
  normalizeReference,
  resolvePaymentAccountingMonth,
  resolvePopAccountingMonth,
  resolvePaymentAmount,
  resolvePaymentPurposeLabel,
  resolvePopPurposeLabel,
} from './resolvers';
import { getMonthExpenseBreakdown, getReceivablesSnapshot } from './expenseAndReceivables';

export async function getMonthSnapshot(
  orgId: string,
  monthIso?: string,
): Promise<FinanceMonthSnapshot> {
  const supabase = assertSupabase();
  const month = normalizeMonthIso(monthIso);

  const { data, error } = await supabase.rpc('get_finance_month_snapshot', {
    p_org_id: orgId,
    p_month: month,
  });

  if (error) {
    console.error('[FinancialDataService] get_finance_month_snapshot RPC failed:', error);
    throw new Error(error.message || 'Failed to load finance month snapshot');
  }

  if (!data?.success) {
    throw new Error(data?.error || 'Failed to load finance month snapshot');
  }

  return {
    success: true,
    organization_id: data.organization_id,
    month: data.month,
    month_locked: Boolean(data.month_locked),
    due_this_month: Number(data.due_this_month || 0),
    collected_this_month: Number(data.collected_this_month || 0),
    collected_allocated_amount: Number(data.collected_allocated_amount || 0),
    collected_source: data.collected_source === 'fee_ledger' ? 'fee_ledger' : 'allocations',
    kpi_delta: Number(data.kpi_delta || 0),
    still_outstanding: Number(data.still_outstanding || 0),
    pending_amount: Number(data.pending_amount || 0),
    overdue_amount: Number(data.overdue_amount || 0),
    pending_count: Number(data.pending_count || 0),
    overdue_count: Number(data.overdue_count || 0),
    pending_students: Number(data.pending_students || 0),
    overdue_students: Number(data.overdue_students || 0),
    prepaid_for_future_months: Number(data.prepaid_for_future_months || 0),
    expenses_this_month: Number(data.expenses_this_month || 0),
    petty_cash_expenses_this_month: Number(data.petty_cash_expenses_this_month || 0),
    financial_expenses_this_month: Number(data.financial_expenses_this_month || 0),
    payroll_expenses_this_month: Number(data.payroll_expenses_this_month || 0),
    operational_expenses_this_month: Number(data.operational_expenses_this_month || 0),
    registration_revenue: Number(data.registration_revenue || 0),
    excluded_inactive_due: Number(data.excluded_inactive_due || 0),
    excluded_inactive_outstanding: Number(data.excluded_inactive_outstanding || 0),
    excluded_inactive_students: Number(data.excluded_inactive_students || 0),
    family_credits_available: Number(data.family_credits_available || 0),
    net_after_expenses: Number(data.net_after_expenses || 0),
    payroll_due: Number(data.payroll_due || 0),
    payroll_paid: Number(data.payroll_paid || 0),
    pending_pop_reviews: Number(data.pending_pop_reviews || 0),
    categories: Array.isArray(data.categories) ? data.categories : [],
    as_of_date: String(data.as_of_date || data.generated_at || new Date().toISOString()),
    generated_at: data.generated_at || new Date().toISOString(),
  };
}

export async function getMonthPaymentBreakdown(
  orgId: string,
  monthIso?: string,
): Promise<FinanceMonthPaymentBreakdown> {
  const month = normalizeMonthIso(monthIso);
  const monthDate = new Date(month);
  const extendedStartDate = new Date(monthDate.getFullYear(), monthDate.getMonth() - 2, 1);
  const extendedEndDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + 3, 1);
  const extendedStart = `${extendedStartDate.getFullYear()}-${String(extendedStartDate.getMonth() + 1).padStart(2, '0')}-01`;
  const extendedEnd = `${extendedEndDate.getFullYear()}-${String(extendedEndDate.getMonth() + 1).padStart(2, '0')}-01`;
  const supabase = assertSupabase();

  const [paymentsResult, popResult] = await Promise.all([
    withFinanceTenant<Array<any>>((column) =>
      supabase
        .from('payments')
        .select(
          'id, student_id, amount, amount_cents, status, billing_month, transaction_date, category_code, payment_method, payment_reference, metadata, description, created_at',
        )
        .eq(column, orgId)
        .in('status', ['completed', 'approved', 'paid', 'successful'])
        .gte('created_at', extendedStart)
        .lt('created_at', extendedEnd)
        .order('created_at', { ascending: false })
        .limit(3000),
    ),
    withFinanceTenant<Array<any>>((column) =>
      supabase
        .from('pop_uploads')
        .select(
          'id, student_id, payment_amount, payment_for_month, payment_date, payment_method, payment_reference, category_code, description, title, created_at, status',
        )
        .eq(column, orgId)
        .eq('upload_type', 'proof_of_payment')
        .in('status', ['approved', 'completed', 'verified'])
        .gte('created_at', extendedStart)
        .lt('created_at', extendedEnd)
        .order('created_at', { ascending: false })
        .limit(3000),
    ),
  ]);

  let paymentsData = paymentsResult.data || [];
  if (paymentsResult.error) {
    console.error(
      '[FinancialDataService] payment breakdown query failed:',
      paymentsResult.error,
    );
    throw new Error(paymentsResult.error.message || 'Failed to load month payment breakdown');
  }

  if (paymentsData.length === 0) {
    const fallbackResult = await withFinanceTenant<Array<any>>((column) =>
      supabase
        .from('payments')
        .select(
          'id, student_id, amount, amount_cents, status, billing_month, transaction_date, category_code, payment_method, payment_reference, metadata, description, created_at',
        )
        .eq(column, orgId)
        .in('status', ['completed', 'approved', 'paid', 'successful'])
        .gte('transaction_date', extendedStart)
        .lt('transaction_date', extendedEnd)
        .order('transaction_date', { ascending: false })
        .limit(3000),
    );
    if (!fallbackResult.error && Array.isArray(fallbackResult.data)) {
      paymentsData = fallbackResult.data;
    }
  }

  const categoryMap = new Map<string, { amount: number; count: number }>();
  const methodMap = new Map<string, { amount: number; count: number }>();
  const purposeMap = new Map<string, { amount: number; count: number }>();
  const seenSignatures = new Set<string>();
  let totalCollected = 0;

  for (const payment of paymentsData) {
    const accountingMonth = resolvePaymentAccountingMonth(payment);
    if (accountingMonth !== month) continue;

    const amount = resolvePaymentAmount(payment);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const signatureMonth = accountingMonth || month;

    const metadata =
      payment?.metadata && typeof payment.metadata === 'object' ? payment.metadata : {};
    if (metadata?.exclude_from_finance_metrics === true) continue;
    const categoryCode = inferFeeCategoryCode(
      payment?.category_code ||
        metadata?.category_code ||
        metadata?.fee_category ||
        metadata?.category ||
        payment?.description ||
        'tuition',
    );
    const methodCode = normalizePaymentMethodCode(
      payment?.payment_method ||
        metadata?.payment_method ||
        metadata?.method ||
        'other',
    );
    const purposeLabel = resolvePaymentPurposeLabel(payment);
    const paymentStudentSig = String(payment?.student_id || '').trim();
    const paymentRefSig = normalizeReference(
      payment?.payment_reference ||
        metadata?.payment_reference ||
        metadata?.reference ||
        '',
    );
    if (paymentStudentSig || paymentRefSig) {
      const signature = [
        paymentStudentSig,
        paymentRefSig,
        String(Math.round(amount * 100)),
        signatureMonth,
      ].join('|');
      seenSignatures.add(signature);
    }

    const existingCategory = categoryMap.get(categoryCode) || { amount: 0, count: 0 };
    existingCategory.amount += amount;
    existingCategory.count += 1;
    categoryMap.set(categoryCode, existingCategory);

    const existingMethod = methodMap.get(methodCode) || { amount: 0, count: 0 };
    existingMethod.amount += amount;
    existingMethod.count += 1;
    methodMap.set(methodCode, existingMethod);

    const existingPurpose = purposeMap.get(purposeLabel) || { amount: 0, count: 0 };
    existingPurpose.amount += amount;
    existingPurpose.count += 1;
    purposeMap.set(purposeLabel, existingPurpose);

    totalCollected += amount;
  }

  if (popResult.error) {
    console.warn('[FinancialDataService] pop fallback query failed:', popResult.error);
  } else {
    for (const upload of popResult.data || []) {
      const accountingMonth = resolvePopAccountingMonth(upload);
      if (accountingMonth !== month) continue;

      const amount = Number(upload?.payment_amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const signatureMonth = accountingMonth || month;

      const popStudentSig = String(upload?.student_id || '').trim();
      const popRefSig = normalizeReference(upload?.payment_reference || '');
      if (popStudentSig || popRefSig) {
        const signature = [
          popStudentSig,
          popRefSig,
          String(Math.round(amount * 100)),
          signatureMonth,
        ].join('|');
        if (seenSignatures.has(signature)) continue;
      }

      const categoryCode = inferFeeCategoryCode(
        upload?.category_code || upload?.description || upload?.title || 'tuition',
      );
      const methodCode = normalizePaymentMethodCode(upload?.payment_method || 'other');
      const purposeLabel = resolvePopPurposeLabel(upload);

      const existingCategory = categoryMap.get(categoryCode) || { amount: 0, count: 0 };
      existingCategory.amount += amount;
      existingCategory.count += 1;
      categoryMap.set(categoryCode, existingCategory);

      const existingMethod = methodMap.get(methodCode) || { amount: 0, count: 0 };
      existingMethod.amount += amount;
      existingMethod.count += 1;
      methodMap.set(methodCode, existingMethod);

      const existingPurpose = purposeMap.get(purposeLabel) || { amount: 0, count: 0 };
      existingPurpose.amount += amount;
      existingPurpose.count += 1;
      purposeMap.set(purposeLabel, existingPurpose);

      totalCollected += amount;
    }
  }

  const categories = Array.from(categoryMap.entries())
    .map(([category_code, values]) => ({
      category_code,
      amount: Number(values.amount.toFixed(2)),
      count: values.count,
    }))
    .sort((a, b) => b.amount - a.amount);

  const methods = Array.from(methodMap.entries())
    .map(([payment_method, values]) => ({
      payment_method,
      amount: Number(values.amount.toFixed(2)),
      count: values.count,
    }))
    .sort((a, b) => b.amount - a.amount);

  const purposes = Array.from(purposeMap.entries())
    .map(([purpose, values]) => ({
      purpose,
      amount: Number(values.amount.toFixed(2)),
      count: values.count,
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    month,
    total_collected: Number(totalCollected.toFixed(2)),
    categories,
    methods,
    purposes,
  };
}

export async function approvePOPWithAllocations(
  payload: ApprovePopPaymentPayload,
): Promise<ApprovePopPaymentResult> {
  const supabase = assertSupabase();
  const { data, error } = await supabase.rpc('approve_pop_payment', {
    p_upload_id: payload.uploadId,
    p_billing_month: payload.billingMonth,
    p_category_code: payload.categoryCode,
    p_allocations: payload.allocations || [],
    p_notes: payload.notes || null,
  });

  if (error) {
    console.error('[FinancialDataService] approve_pop_payment RPC failed:', error);
    throw new Error(error.message || 'Failed to approve payment proof');
  }

  if (!data?.success) {
    throw new Error(data?.error || 'Failed to approve payment proof');
  }

  return {
    paymentId: data.payment_id,
    allocatedAmount: Number(data.allocated_amount || 0),
    overpaymentAmount: Number(data.overpayment_amount || 0),
    feeIds: Array.isArray(data.fee_ids)
      ? data.fee_ids.filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
      : [],
  };
}

export async function getFinanceControlCenterBundle(
  orgId: string,
  monthIso?: string,
): Promise<FinanceControlCenterBundle> {
  const month = normalizeMonthIso(monthIso);
  const supabase = assertSupabase();

  const settle = async <T>(promise: Promise<T>) => {
    try {
      const value = await promise;
      return { value, error: null as string | null };
    } catch (err: any) {
      return { value: null as T | null, error: err?.message || 'Failed to load section data' };
    }
  };

  const queuePromise = (async () => {
    const { data, error } = await supabase
      .from('pop_uploads')
      .select(
        `id, student_id, preschool_id, payment_amount, payment_date, payment_for_month, category_code, payment_reference, status, description, title, created_at, student:students(first_name,last_name)`,
      )
      .eq('preschool_id', orgId)
      .eq('upload_type', 'proof_of_payment')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(60);
    if (error) throw new Error(error.message || 'Failed to load payment queue');
    return data || [];
  })();

  const [snapshotRes, receivablesRes, expensesRes, breakdownRes, queueRes, payrollRes] =
    await Promise.all([
      settle(getMonthSnapshot(orgId, month)),
      settle(getReceivablesSnapshot(orgId, month)),
      settle(getMonthExpenseBreakdown(orgId, month)),
      settle(getMonthPaymentBreakdown(orgId, month)),
      settle(queuePromise),
      settle(PayrollService.getRoster(orgId, month)),
    ]);

  const errors: FinanceControlCenterBundle['errors'] = {};
  if (snapshotRes.error) errors.snapshot = snapshotRes.error;
  if (receivablesRes.error) errors.receivables = receivablesRes.error;
  if (expensesRes.error) errors.expenses = expensesRes.error;
  if (breakdownRes.error) errors.breakdown = breakdownRes.error;
  if (queueRes.error) errors.queue = queueRes.error;
  if (payrollRes.error) errors.payroll = payrollRes.error;
  const payrollValue: any = payrollRes.value;
  const normalizedSnapshot = snapshotRes.value
    ? {
        ...snapshotRes.value,
        expenses_this_month: Number(
          expensesRes.value?.total_expenses ?? snapshotRes.value.expenses_this_month,
        ),
        petty_cash_expenses_this_month: Number(
          expensesRes.value?.petty_cash_expenses ??
            snapshotRes.value.petty_cash_expenses_this_month,
        ),
        financial_expenses_this_month: Number(
          expensesRes.value?.financial_expenses ??
            snapshotRes.value.financial_expenses_this_month,
        ),
      }
    : null;

  return {
    month,
    snapshot: normalizedSnapshot,
    receivables: receivablesRes.value,
    expenses: expensesRes.value,
    payment_breakdown: breakdownRes.value,
    pending_pops: (queueRes.value || []) as any[],
    payroll: payrollValue,
    payroll_fallback_used: Boolean(payrollValue?.fallback_used),
    errors: Object.keys(errors).length ? errors : undefined,
  };
}
