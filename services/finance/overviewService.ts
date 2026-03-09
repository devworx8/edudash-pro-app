/**
 * Financial overview data for the dashboard (12-month revenue/expense windows).
 *
 * @deprecated Principal finance now uses getFinanceControlCenterBundle().
 * Kept for legacy screens/routes that soft-redirect during migration.
 */

import { assertSupabase } from '@/lib/supabase';
import { withPettyCashTenant } from '@/lib/utils/pettyCashTenant';
import { isPettyCashResetEntry } from '@/lib/utils/pettyCashReset';

import type { FinanceOverviewData } from '../financial/types';
import { withFinanceTenant } from './tenantUtils';
import { fetchStudentFees, getPaidAmountForFee } from '@/services/finance/feeHelpers';

export async function getOverview(preschoolId?: string): Promise<FinanceOverviewData> {
  try {
    const now = new Date();
    const expenseTypes = ['expense', 'operational_expense', 'salary', 'purchase'] as const;
    const expenseStatuses = ['approved', 'completed'] as const;

    const formatMonthKey = (date: Date): string =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    const monthWindows: { key: string; start: Date; end: Date }[] = [];
    for (let i = 11; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      monthWindows.push({ key: formatMonthKey(start), start, end });
    }

    const monthIndexByKey = new Map<string, number>(
      monthWindows.map((window, index) => [window.key, index]),
    );

    const revenueMonthly = monthWindows.map(() => 0);
    const expensesMonthly = monthWindows.map(() => 0);
    const categoriesMap = new Map<string, number>();

    const rangeStartIso = monthWindows[0]?.start.toISOString();
    const rangeEndIso = monthWindows[monthWindows.length - 1]?.end.toISOString();

    if (!rangeStartIso || !rangeEndIso) {
      throw new Error('Failed to compute financial overview date range');
    }

    const rangeStartDateStr = `${monthWindows[0]?.start.getFullYear()}-${String(monthWindows[0]?.start.getMonth() + 1).padStart(2, '0')}-01`;
    const rangeEndDateStr = `${monthWindows[monthWindows.length - 1]?.end.getFullYear()}-${String(monthWindows[monthWindows.length - 1]?.end.getMonth() + 1).padStart(2, '0')}-01`;

    const feesDuePromise = preschoolId
      ? fetchStudentFees(preschoolId, {
          from: rangeStartDateStr,
          to: rangeEndDateStr,
          useDueDate: true,
        })
      : assertSupabase()
          .from('student_fees')
          .select('amount, final_amount, amount_paid, status, due_date, created_at')
          .gte('due_date', rangeStartDateStr)
          .lt('due_date', rangeEndDateStr);

    const feesFallbackPromise = preschoolId
      ? fetchStudentFees(preschoolId, {
          from: rangeStartIso,
          to: rangeEndIso,
          useDueDate: false,
        })
      : assertSupabase()
          .from('student_fees')
          .select('amount, final_amount, amount_paid, status, due_date, created_at')
          .is('due_date', null)
          .gte('created_at', rangeStartIso)
          .lt('created_at', rangeEndIso);

    const pettyCashResult = await withPettyCashTenant((column, client) => {
      let query = client
        .from('petty_cash_transactions')
        .select('amount, created_at, category, description, reference_number')
        .eq('type', 'expense')
        .in('status', expenseStatuses as unknown as string[])
        .gte('created_at', rangeStartIso)
        .lt('created_at', rangeEndIso);
      if (preschoolId) {
        query = query.eq(column, preschoolId);
      }
      return query;
    });

    const financialExpensePromise = preschoolId
      ? withFinanceTenant((column) =>
          assertSupabase()
            .from('financial_transactions')
            .select(`amount, created_at, type, expense_categories(name)`)
            .eq(column, preschoolId)
            .in('type', expenseTypes as unknown as string[])
            .in('status', expenseStatuses as unknown as string[])
            .gte('created_at', rangeStartIso)
            .lt('created_at', rangeEndIso),
        )
      : assertSupabase()
          .from('financial_transactions')
          .select(`amount, created_at, type, expense_categories(name)`)
          .in('type', expenseTypes as unknown as string[])
          .in('status', expenseStatuses as unknown as string[])
          .gte('created_at', rangeStartIso)
          .lt('created_at', rangeEndIso);

    type SettledResult<T> =
      | { status: 'fulfilled'; value: T }
      | { status: 'rejected'; reason: unknown };
    const settle = async <T>(promise: PromiseLike<T>): Promise<SettledResult<T>> => {
      try {
        const value = await promise;
        return { status: 'fulfilled', value };
      } catch (reason) {
        return { status: 'rejected', reason };
      }
    };

    const [feesDueResult, feesFallbackResult, financialExpenseResult] = await Promise.all([
      settle(feesDuePromise),
      settle(feesFallbackPromise),
      settle(financialExpensePromise as PromiseLike<any>),
    ]);

    type FeeRow = {
      amount: number | null;
      final_amount: number | null;
      amount_paid: number | null;
      status: string | null;
      due_date: string | null;
      created_at: string | null;
    };
    type PettyCashRow = { amount: number | null; created_at: string | null; category: string | null };
    type ExpenseCategoryRow = { name?: string | null } | null;
    type FinancialExpenseRow = {
      amount: number | null;
      created_at: string | null;
      type: string | null;
      expense_categories?: ExpenseCategoryRow[] | ExpenseCategoryRow;
    };

    const toMonthIndex = (createdAt: string | null): number | null => {
      if (!createdAt) return null;
      const date = new Date(createdAt);
      if (Number.isNaN(date.getTime())) return null;
      const key = formatMonthKey(date);
      const index = monthIndexByKey.get(key);
      return index === undefined ? null : index;
    };

    const feesDueValue: any = feesDueResult.status === 'fulfilled' ? feesDueResult.value : null;
    const feesFallbackValue: any =
      feesFallbackResult.status === 'fulfilled' ? feesFallbackResult.value : null;
    const financialExpenseValue: any =
      financialExpenseResult.status === 'fulfilled' ? financialExpenseResult.value : null;

    const feesDueData: FeeRow[] = (feesDueValue?.data as FeeRow[] | null) || [];
    const feesFallbackData: FeeRow[] = (feesFallbackValue?.data as FeeRow[] | null) || [];
    const pettyCashData: PettyCashRow[] = (pettyCashResult.data as PettyCashRow[] | null) || [];
    const financialExpenseData: FinancialExpenseRow[] =
      (financialExpenseValue?.data as FinancialExpenseRow[] | null) || [];

    const feesData = [...feesDueData, ...feesFallbackData];

    feesData.forEach((fee) => {
      const monthIndex = toMonthIndex(fee.due_date || fee.created_at);
      if (monthIndex === null) return;
      revenueMonthly[monthIndex] += getPaidAmountForFee(fee);
    });

    if (feesData.length === 0 && preschoolId) {
      const extendedStart = new Date(monthWindows[0].start);
      extendedStart.setMonth(extendedStart.getMonth() - 6);
      const extendedEnd = new Date(monthWindows[monthWindows.length - 1].end);
      extendedEnd.setMonth(extendedEnd.getMonth() + 6);

      const { data: fallbackPayments } = await withFinanceTenant<Array<any>>((column) =>
        assertSupabase()
          .from('payments')
          .select('amount, status, created_at, metadata')
          .eq(column, preschoolId)
          .gte('created_at', extendedStart.toISOString())
          .lt('created_at', extendedEnd.toISOString()),
      );

      const getAccountingDate = (payment: any) => {
        const metadata = payment?.metadata || {};
        const value =
          metadata?.payment_for_month || metadata?.payment_date || payment?.created_at;
        const date = value ? new Date(value) : null;
        return date && !Number.isNaN(date.getTime()) ? date : null;
      };

      (fallbackPayments || [])
        .filter((payment) => {
          if (!['completed', 'approved'].includes(String(payment?.status))) return false;
          const metadata = payment?.metadata && typeof payment.metadata === 'object' ? payment.metadata : {};
          return metadata?.exclude_from_finance_metrics !== true;
        })
        .forEach((payment) => {
          const date = getAccountingDate(payment);
          if (!date) return;
          const index = toMonthIndex(date.toISOString());
          if (index === null) return;
          revenueMonthly[index] += Number(payment?.amount) || 0;
        });
    }

    pettyCashData.forEach((expense) => {
      if (isPettyCashResetEntry(expense)) return;

      const monthIndex = toMonthIndex(expense.created_at);
      if (monthIndex === null) return;
      const amount = Math.abs(Number(expense.amount) || 0);
      expensesMonthly[monthIndex] += amount;

      const categoryName = expense.category || 'Other';
      categoriesMap.set(categoryName, (categoriesMap.get(categoryName) || 0) + amount);
    });

    financialExpenseData.forEach((expense) => {
      const monthIndex = toMonthIndex(expense.created_at);
      if (monthIndex === null) return;
      const amount = Math.abs(Number(expense.amount) || 0);
      expensesMonthly[monthIndex] += amount;

      const categoryData = Array.isArray(expense.expense_categories)
        ? expense.expense_categories[0]
        : expense.expense_categories;
      const categoryName = categoryData?.name || expense.type || 'Expense';
      categoriesMap.set(categoryName, (categoriesMap.get(categoryName) || 0) + amount);
    });

    const categoriesBreakdown = Array.from(categoriesMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    const currentRevenue = revenueMonthly[revenueMonthly.length - 1] || 0;
    const currentExpenses = expensesMonthly[expensesMonthly.length - 1] || 0;

    return {
      revenueMonthly,
      expensesMonthly,
      categoriesBreakdown,
      keyMetrics: {
        monthlyRevenue: currentRevenue,
        monthlyExpenses: currentExpenses,
        cashFlow: currentRevenue - currentExpenses,
      },
      isSample: false,
    };
  } catch (error) {
    console.error('Error fetching financial overview:', error);

    return {
      revenueMonthly: Array(12)
        .fill(0)
        .map(() => Math.floor(Math.random() * 50000) + 20000),
      expensesMonthly: Array(12)
        .fill(0)
        .map(() => Math.floor(Math.random() * 30000) + 10000),
      categoriesBreakdown: [
        { name: 'Supplies', value: 8500 },
        { name: 'Maintenance', value: 6200 },
        { name: 'Utilities', value: 4800 },
        { name: 'Other', value: 3200 },
      ],
      keyMetrics: {
        monthlyRevenue: 45000,
        monthlyExpenses: 22500,
        cashFlow: 22500,
      },
      isSample: true,
    };
  }
}
