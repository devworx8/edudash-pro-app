/**
 * Expense breakdown, receivables snapshot, expense logging,
 * expense categories, and staff-for-salary queries.
 */

import { assertSupabase } from '@/lib/supabase';
import { withPettyCashTenant } from '@/lib/utils/pettyCashTenant';
import { isPettyCashResetEntry } from '@/lib/utils/pettyCashReset';

import type {
  FinanceMonthExpenseBreakdown,
  FinanceReceivableStudentRow,
  FinanceReceivablesSummary,
} from '@/types/finance';
import { withFinanceTenant } from './tenantUtils';
import { normalizeMonthIso, nextMonthIso } from './dateHelpers';
import { normalizePurposeLabel } from './resolvers';
import { getOutstandingAmountForFee, isStudentActiveForReceivables } from '@/services/finance/feeHelpers';

export async function getMonthExpenseBreakdown(
  orgId: string,
  monthIso?: string,
): Promise<FinanceMonthExpenseBreakdown> {
  const month = normalizeMonthIso(monthIso);
  const next = nextMonthIso(month);
  const finalizedStatuses = new Set(['approved', 'completed']);

  const [pettyCashResult, financialResult] = await Promise.all([
    withPettyCashTenant((column, client) =>
      client
        .from('petty_cash_transactions')
        .select(
          'id, amount, description, category, type, status, created_at, transaction_date, receipt_number, reference_number',
        )
        .eq(column, orgId)
        .eq('type', 'expense')
        .gte('created_at', month)
        .lt('created_at', next)
        .order('created_at', { ascending: false })
        .limit(500),
    ),
    withFinanceTenant<Array<any>>((column) =>
      assertSupabase()
        .from('financial_transactions')
        .select(
          `id, amount, description, status, type, created_at, payment_reference, reference_number, expense_categories(name)`,
        )
        .eq(column, orgId)
        .in('type', ['expense', 'operational_expense', 'salary', 'purchase'])
        .gte('created_at', month)
        .lt('created_at', next)
        .order('created_at', { ascending: false })
        .limit(500),
    ),
  ]);

  if (pettyCashResult.error) {
    throw new Error(pettyCashResult.error.message || 'Failed to load petty cash expenses');
  }
  if (financialResult.error) {
    throw new Error(financialResult.error.message || 'Failed to load finance expense entries');
  }

  let pettyCashTotal = 0;
  let financialTotal = 0;
  const entries: FinanceMonthExpenseBreakdown['entries'] = [];

  for (const tx of ((pettyCashResult.data || []) as Array<any>)) {
    if (isPettyCashResetEntry(tx)) {
      continue;
    }

    const amount = Math.abs(Number(tx?.amount || 0));
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const status = String(tx?.status || '').toLowerCase();
    if (finalizedStatuses.has(status)) {
      pettyCashTotal += amount;
    }

    entries.push({
      id: String(tx?.id || `petty-${entries.length}`),
      source: 'petty_cash',
      date: String(tx?.transaction_date || tx?.created_at || new Date().toISOString()),
      amount: Number(amount.toFixed(2)),
      status: status || 'pending',
      category: String(tx?.category || 'Petty Cash'),
      description: String(tx?.description || 'Petty cash expense'),
      reference: tx?.reference_number || tx?.receipt_number || null,
    });
  }

  for (const tx of ((financialResult.data || []) as Array<any>)) {
    const amount = Math.abs(Number(tx?.amount || 0));
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const status = String(tx?.status || '').toLowerCase();
    if (finalizedStatuses.has(status)) {
      financialTotal += amount;
    }

    const categoryData = Array.isArray(tx?.expense_categories)
      ? tx.expense_categories[0]
      : tx?.expense_categories;
    const fallbackType = normalizePurposeLabel(tx?.type || 'Expense');

    entries.push({
      id: String(tx?.id || `fin-${entries.length}`),
      source: 'financial_txn',
      date: String(tx?.created_at || new Date().toISOString()),
      amount: Number(amount.toFixed(2)),
      status: status || 'pending',
      category: String(categoryData?.name || fallbackType),
      description: String(tx?.description || fallbackType),
      reference: tx?.payment_reference || tx?.reference_number || null,
    });
  }

  entries.sort((a, b) => {
    const timeA = new Date(a.date).getTime();
    const timeB = new Date(b.date).getTime();
    return (Number.isFinite(timeB) ? timeB : 0) - (Number.isFinite(timeA) ? timeA : 0);
  });

  return {
    month,
    total_expenses: Number((pettyCashTotal + financialTotal).toFixed(2)),
    petty_cash_expenses: Number(pettyCashTotal.toFixed(2)),
    financial_expenses: Number(financialTotal.toFixed(2)),
    entries: entries.slice(0, 120),
  };
}

export async function getReceivablesSnapshot(
  orgId: string,
  monthIso?: string,
): Promise<{ summary: FinanceReceivablesSummary; students: FinanceReceivableStudentRow[] }> {
  const month = normalizeMonthIso(monthIso);
  const next = nextMonthIso(month);
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const unpaidStatuses = ['pending', 'overdue', 'partially_paid', 'pending_verification'];

  let feesData: any[] = [];

  // Hard limit prevents unbounded JSON payloads that can OOM the JS heap on
  // large schools. The 60-row student cap in the output keeps the UI fast;
  // 2000 rows is more than enough for any realistic school roster.
  const QUERY_LIMIT = 2000;

  const monthScopedQuery = await assertSupabase()
    .from('student_fees')
    .select(
      `id, student_id, status, due_date, billing_month, amount, final_amount, amount_paid, amount_outstanding, students!inner(id, first_name, last_name, is_active, status, enrollment_date, preschool_id, organization_id)`,
    )
    .or(`preschool_id.eq.${orgId},organization_id.eq.${orgId}`, { foreignTable: 'students' })
    .eq('billing_month', month)
    .in('status', unpaidStatuses)
    .limit(QUERY_LIMIT);

  const missingBillingMonth =
    Boolean(monthScopedQuery.error) &&
    (monthScopedQuery.error?.code === '42703' ||
      String(monthScopedQuery.error?.message || '')
        .toLowerCase()
        .includes('billing_month'));

  if (missingBillingMonth) {
    const fallbackQuery = await assertSupabase()
      .from('student_fees')
      .select(
        `id, student_id, status, due_date, amount, final_amount, amount_paid, amount_outstanding, students!inner(id, first_name, last_name, is_active, status, enrollment_date, preschool_id, organization_id)`,
      )
      .or(`preschool_id.eq.${orgId},organization_id.eq.${orgId}`, { foreignTable: 'students' })
      .gte('due_date', month)
      .lt('due_date', next)
      .in('status', unpaidStatuses)
      .limit(QUERY_LIMIT);
    if (fallbackQuery.error) {
      throw new Error(fallbackQuery.error.message || 'Failed to load receivables');
    }
    feesData = fallbackQuery.data || [];
  } else if (monthScopedQuery.error) {
    throw new Error(monthScopedQuery.error.message || 'Failed to load receivables');
  } else {
    feesData = monthScopedQuery.data || [];
  }

  const studentMap = new Map<string, FinanceReceivableStudentRow>();
  const overdueStudents = new Set<string>();
  const pendingStudents = new Set<string>();
  let overdueAmount = 0;
  let pendingAmount = 0;
  let overdueCount = 0;
  let pendingCount = 0;

  for (const fee of feesData) {
    const status = String(fee?.status || '').toLowerCase();
    if (!unpaidStatuses.includes(status)) continue;

    const studentData = Array.isArray(fee?.students) ? fee.students[0] : fee?.students;
    const studentId = String(fee?.student_id || studentData?.id || '').trim();
    if (!studentId) continue;
    if (!isStudentActiveForReceivables(studentData)) continue;

    const enrollmentDateValue = String(studentData?.enrollment_date || '').trim();
    if (enrollmentDateValue) {
      const enrollmentDate = new Date(enrollmentDateValue);
      if (!Number.isNaN(enrollmentDate.getTime())) {
        const enrollmentMonthStart = new Date(
          enrollmentDate.getFullYear(),
          enrollmentDate.getMonth(),
          1,
        );
        const feeMonthValue = String(fee?.billing_month || fee?.due_date || '').trim();
        if (feeMonthValue) {
          const feeMonthDate = new Date(feeMonthValue);
          if (!Number.isNaN(feeMonthDate.getTime())) {
            const feeMonthStart = new Date(feeMonthDate.getFullYear(), feeMonthDate.getMonth(), 1);
            if (feeMonthStart < enrollmentMonthStart) {
              continue;
            }
          }
        }
      }
    }

    const amount = getOutstandingAmountForFee(fee);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const dueDate = fee?.due_date ? new Date(fee.due_date) : null;
    const isOverdueByStatus = status === 'overdue';
    const isOverdueByDate =
      dueDate instanceof Date && !Number.isNaN(dueDate.getTime()) && dueDate < todayStart;
    const isVerificationPending = status === 'pending_verification';
    const finalIsOverdue = !isVerificationPending && (isOverdueByStatus || isOverdueByDate);

    if (finalIsOverdue) {
      overdueAmount += amount;
      overdueCount += 1;
      overdueStudents.add(studentId);
    } else {
      pendingAmount += amount;
      pendingCount += 1;
      pendingStudents.add(studentId);
    }

    const existing = studentMap.get(studentId) || {
      student_id: studentId,
      first_name: String(studentData?.first_name || 'Student'),
      last_name: String(studentData?.last_name || ''),
      class_name: null,
      outstanding_amount: 0,
      pending_count: 0,
      overdue_count: 0,
    };

    existing.outstanding_amount += amount;
    if (finalIsOverdue) existing.overdue_count += 1;
    else existing.pending_count += 1;
    studentMap.set(studentId, existing);
  }

  const ROW_CAP = 60;
  const totalUnpaidStudents = studentMap.size;
  const students = Array.from(studentMap.values())
    .sort((a, b) => {
      if (b.outstanding_amount !== a.outstanding_amount) {
        return b.outstanding_amount - a.outstanding_amount;
      }
      if (b.overdue_count !== a.overdue_count) {
        return b.overdue_count - a.overdue_count;
      }
      return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
    })
    .slice(0, ROW_CAP)
    .map((row) => ({
      ...row,
      outstanding_amount: Number(row.outstanding_amount.toFixed(2)),
    }));

  return {
    summary: {
      month,
      pending_amount: Number(pendingAmount.toFixed(2)),
      overdue_amount: Number(overdueAmount.toFixed(2)),
      pending_count: pendingCount,
      overdue_count: overdueCount,
      pending_students: pendingStudents.size,
      overdue_students: overdueStudents.size,
      outstanding_students: totalUnpaidStudents,
      outstanding_amount: Number((pendingAmount + overdueAmount).toFixed(2)),
      // Expose when the displayed list has been capped so the UI can warn
      students_display_cap: ROW_CAP,
      students_total_unpaid: totalUnpaidStudents,
    },
    students,
  };
}

export const EXPENSE_TYPES = [
  { key: 'salary', label: 'Staff Salary', icon: 'people', color: '#6366F1' },
  { key: 'operational_expense', label: 'Rent / Lease', icon: 'home', color: '#F59E0B' },
  { key: 'expense', label: 'Utilities (Water, Electricity)', icon: 'flash', color: '#3B82F6' },
  { key: 'purchase', label: 'Supplies / Equipment', icon: 'cart', color: '#10B981' },
  { key: 'expense', label: 'Maintenance / Repairs', icon: 'construct', color: '#EF4444' },
  { key: 'expense', label: 'Transport', icon: 'car', color: '#8B5CF6' },
  { key: 'expense', label: 'Food / Catering', icon: 'restaurant', color: '#EC4899' },
  { key: 'expense', label: 'Insurance', icon: 'shield-checkmark', color: '#14B8A6' },
  { key: 'expense', label: 'Other', icon: 'ellipsis-horizontal-circle', color: '#6B7280' },
] as const;

export async function logExpense(params: {
  preschoolId: string;
  createdBy: string;
  type: string;
  amount: number;
  description: string;
  category?: string;
  expenseCategoryId?: string;
  vendorName?: string;
  paymentMethod?: string;
  paymentReference?: string;
  receiptImagePath?: string;
  metadata?: Record<string, any>;
}): Promise<{ id: string }> {
  const supabase = assertSupabase();

  const payload: Record<string, any> = {
    preschool_id: params.preschoolId,
    created_by: params.createdBy,
    type: params.type,
    amount: params.amount,
    description: params.description,
    status: 'completed',
    vendor_name: params.vendorName || null,
    payment_method: params.paymentMethod || null,
    payment_reference: params.paymentReference || null,
    receipt_image_path: params.receiptImagePath || null,
    expense_category_id: params.expenseCategoryId || null,
    metadata: {
      ...(params.metadata || {}),
      category_label: params.category || params.type,
      logged_from: 'mobile_app',
    },
  };

  const { data, error } = await supabase
    .from('financial_transactions')
    .insert(payload)
    .select('id')
    .single();

  if (error) {
    console.error('[FinancialDataService] Failed to log expense:', error);
    throw new Error(error.message || 'Failed to log expense');
  }

  return { id: (data as any).id };
}

export async function getExpenseCategories(
  preschoolId: string,
): Promise<
  Array<{
    id: string;
    name: string;
    color: string;
    icon: string;
    monthlyBudget: number;
  }>
> {
  const supabase = assertSupabase();

  const { data, error } = await supabase
    .from('expense_categories')
    .select('id, name, color, icon, monthly_budget')
    .eq('preschool_id', preschoolId)
    .eq('is_active', true)
    .order('name');

  if (error) {
    console.warn('[FinancialDataService] Failed to load expense categories:', error.message);
    return [];
  }

  return (data || []).map((cat: any) => ({
    id: cat.id,
    name: cat.name,
    color: cat.color || '#6366F1',
    icon: cat.icon || 'receipt',
    monthlyBudget: Number(cat.monthly_budget) || 0,
  }));
}

export async function getStaffForSalary(
  preschoolId: string,
): Promise<Array<{ id: string; name: string; role: string }>> {
  const supabase = assertSupabase();

  const { data, error } = await supabase
    .from('teachers')
    .select('id, first_name, last_name, subject_specialization')
    .eq('preschool_id', preschoolId)
    .eq('is_active', true)
    .order('first_name');

  if (error) {
    console.warn('[FinancialDataService] Failed to load staff:', error.message);
    return [];
  }

  return (data || []).map((t: any) => ({
    id: t.id,
    name: `${t.first_name} ${t.last_name}`.trim(),
    role: t.subject_specialization || 'Teacher',
  }));
}
