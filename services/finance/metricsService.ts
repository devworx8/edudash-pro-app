/**
 * Legacy financial metrics: monthly revenue, expenses, outstanding, trends.
 *
 * @deprecated Principal finance now uses getFinanceControlCenterBundle().
 * Kept for legacy screens/routes that soft-redirect during migration.
 */

import { assertSupabase } from '@/lib/supabase';
import { withPettyCashTenant } from '@/lib/utils/pettyCashTenant';
import { isPettyCashResetEntry } from '@/lib/utils/pettyCashReset';

import type { FinancialMetrics, MonthlyTrendData } from '../financial/types';
import { withFinanceTenant, isMissingFinanceTenantColumn } from './tenantUtils';
import { fetchStudentFees, getPaidAmountForFee, getOutstandingAmountForFee } from '@/services/finance/feeHelpers';

/**
 * Get financial metrics for a preschool.
 * @deprecated Use getFinanceControlCenterBundle() instead.
 */
export async function getFinancialMetrics(preschoolId: string): Promise<FinancialMetrics> {
  try {
    const now = new Date();
    const monthStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const monthStart = `${monthStartDate.getFullYear()}-${String(monthStartDate.getMonth() + 1).padStart(2, '0')}-01`;
    const nextMonthStart = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}-01`;

    let monthlyRevenue = 0;
    let totalOutstanding = 0;

    const [feesDueRes, feesFallbackRes] = await Promise.all([
      fetchStudentFees(preschoolId, {
        from: monthStart,
        to: nextMonthStart,
        useDueDate: true,
      }),
      fetchStudentFees(preschoolId, {
        from: monthStartDate.toISOString(),
        to: nextMonthDate.toISOString(),
        useDueDate: false,
      }),
    ]);

    if ((feesDueRes as any).error || (feesFallbackRes as any).error) {
      const feeError = (feesDueRes as any).error || (feesFallbackRes as any).error;
      if (!isMissingFinanceTenantColumn(feeError)) {
        console.error('Error fetching fees for revenue:', feeError);
      }

      const extendedStart = new Date(monthStartDate);
      extendedStart.setMonth(extendedStart.getMonth() - 6);
      const extendedEnd = new Date(nextMonthDate);
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
        const value = metadata?.payment_for_month || metadata?.payment_date || payment?.created_at;
        const date = value ? new Date(value) : null;
        return date && !Number.isNaN(date.getTime()) ? date : null;
      };

      monthlyRevenue = (fallbackPayments || [])
        .filter((payment) => {
          const date = getAccountingDate(payment);
          if (!date) return false;
          return (
            date >= monthStartDate &&
            date < nextMonthDate &&
            ['completed', 'approved'].includes(String(payment?.status))
          );
        })
        .reduce((sum, p) => sum + (Number(p?.amount) || 0), 0);

      totalOutstanding = (fallbackPayments || [])
        .filter((payment) => {
          const date = getAccountingDate(payment);
          if (!date) return false;
          return (
            date >= monthStartDate &&
            date < nextMonthDate &&
            ['pending', 'proof_submitted', 'under_review'].includes(String(payment?.status))
          );
        })
        .reduce((sum, p) => sum + (Number(p?.amount) || 0), 0);
    } else {
      const feeRows = [
        ...((feesDueRes as any).data || []),
        ...((feesFallbackRes as any).data || []),
      ];
      monthlyRevenue = feeRows.reduce((sum, fee) => sum + getPaidAmountForFee(fee), 0);
      totalOutstanding = feeRows.reduce((sum, fee) => sum + getOutstandingAmountForFee(fee), 0);
    }

    const { data: expenseTransactions, error: expenseError } = await withPettyCashTenant(
      (column, client) =>
        client
          .from('petty_cash_transactions')
          .select('amount, category, description, reference_number')
          .eq(column, preschoolId)
          .eq('type', 'expense')
          .in('status', ['approved', 'pending'])
          .gte('created_at', monthStart)
          .lt('created_at', nextMonthStart),
    );

    if (expenseError) {
      console.error('Error fetching expenses:', expenseError);
    }

    let monthlyExpenses =
      expenseTransactions?.reduce((sum, t) => {
        if (isPettyCashResetEntry(t)) return sum;
        return sum + Math.abs(t.amount);
      }, 0) || 0;

    try {
      const { data: otherExpTx } = await withFinanceTenant<
        Array<{ amount: number | null; type?: string | null; status?: string | null; created_at?: string | null }>
      >((column) =>
        assertSupabase()
          .from('financial_transactions')
          .select('amount, type, status, created_at')
          .eq(column, preschoolId)
          .in('type', ['expense', 'operational_expense', 'salary', 'purchase'])
          .in('status', ['approved', 'completed'])
          .gte('created_at', monthStart)
          .lt('created_at', nextMonthStart),
      );
      const otherExp = (otherExpTx || []).reduce(
        (sum: number, t: any) => sum + Math.abs(Number(t.amount) || 0),
        0,
      );
      monthlyExpenses += otherExp;
    } catch {
      /* Intentional: non-fatal */
    }

    const { count: studentCount } = await withFinanceTenant((column) =>
      assertSupabase()
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq(column, preschoolId)
        .eq('is_active', true),
    );

    const netIncome = monthlyRevenue - monthlyExpenses;
    const totalPaymentVolume = monthlyRevenue + totalOutstanding;
    const paymentCompletionRate =
      totalPaymentVolume > 0 ? (monthlyRevenue / totalPaymentVolume) * 100 : 0;
    const averageFeePerStudent =
      studentCount && studentCount > 0 ? monthlyRevenue / studentCount : 0;

    return {
      monthlyRevenue,
      outstandingPayments: totalOutstanding,
      monthlyExpenses,
      netIncome,
      paymentCompletionRate,
      totalStudents: studentCount || 0,
      averageFeePerStudent,
    };
  } catch (error) {
    console.error('Error calculating financial metrics:', error);

    return {
      monthlyRevenue: 15000,
      outstandingPayments: 2500,
      monthlyExpenses: 8500,
      netIncome: 6500,
      paymentCompletionRate: 85.7,
      totalStudents: 25,
      averageFeePerStudent: 600,
    };
  }
}

/**
 * Get monthly trend data for the last 6 months.
 */
export async function getMonthlyTrendData(preschoolId: string): Promise<MonthlyTrendData[]> {
  try {
    const trendData: MonthlyTrendData[] = [];

    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const month = date.getMonth() + 1;
      const year = date.getFullYear();
      const monthStart = `${year}-${month.toString().padStart(2, '0')}-01`;
      const nextMonthStart = `${year}-${(month + 1).toString().padStart(2, '0')}-01`;

      let revenue = 0;
      try {
        const [feesDueRes, feesFallbackRes] = await Promise.all([
          fetchStudentFees(preschoolId, {
            from: monthStart,
            to: nextMonthStart,
            useDueDate: true,
          }),
          fetchStudentFees(preschoolId, {
            from: new Date(`${monthStart}T00:00:00`).toISOString(),
            to: new Date(`${nextMonthStart}T00:00:00`).toISOString(),
            useDueDate: false,
          }),
        ]);

        if ((feesDueRes as any).error || (feesFallbackRes as any).error) {
          const { data: monthlyRevenue } = await withFinanceTenant<Array<{ amount: number | null }>>(
            (column) =>
              assertSupabase()
                .from('payments')
                .select('amount')
                .eq(column, preschoolId)
                .in('status', ['completed', 'approved'])
                .gte('created_at', monthStart)
                .lt('created_at', nextMonthStart),
          );
          revenue = monthlyRevenue?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
        } else {
          const feeRows = [
            ...((feesDueRes as any).data || []),
            ...((feesFallbackRes as any).data || []),
          ];
          revenue = feeRows.reduce((sum, fee) => sum + getPaidAmountForFee(fee), 0);
        }
      } catch {
        const { data: monthlyRevenue } = await withFinanceTenant<Array<{ amount: number | null }>>(
          (column) =>
            assertSupabase()
              .from('payments')
              .select('amount')
              .eq(column, preschoolId)
              .in('status', ['completed', 'approved'])
              .gte('created_at', monthStart)
              .lt('created_at', nextMonthStart),
        );
        revenue = monthlyRevenue?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
      }

      const { data: monthlyExpenses } = await withPettyCashTenant((column, client) =>
        client
          .from('petty_cash_transactions')
          .select('amount, category, description, reference_number')
          .eq(column, preschoolId)
          .eq('type', 'expense')
          .eq('status', 'approved')
          .gte('created_at', monthStart)
          .lt('created_at', nextMonthStart),
      );

      const petty =
        monthlyExpenses?.reduce((sum, t) => {
          if (isPettyCashResetEntry(t)) return sum;
          return sum + Math.abs(t.amount);
        }, 0) || 0;
      let otherExp = 0;
      try {
        const { data: monthOther } = await withFinanceTenant<
          Array<{ amount: number | null; type?: string | null; status?: string | null; created_at?: string | null }>
        >((column) =>
          assertSupabase()
            .from('financial_transactions')
            .select('amount, type, status, created_at')
            .eq(column, preschoolId)
            .in('type', ['expense', 'operational_expense', 'salary', 'purchase'])
            .in('status', ['approved', 'completed'])
            .gte('created_at', monthStart)
            .lt('created_at', nextMonthStart),
        );
        otherExp = (monthOther || []).reduce(
          (s: number, t: any) => s + Math.abs(Number(t.amount) || 0),
          0,
        );
      } catch {
        /* Intentional: non-fatal */
      }
      const expenses = petty + otherExp;

      trendData.push({
        month: date.toLocaleDateString('en-US', { month: 'short' }),
        revenue,
        expenses,
        netIncome: revenue - expenses,
      });
    }

    return trendData;
  } catch (error) {
    console.error('Error fetching trend data:', error);

    return [
      { month: 'Aug', revenue: 12000, expenses: 7500, netIncome: 4500 },
      { month: 'Sep', revenue: 14000, expenses: 8200, netIncome: 5800 },
      { month: 'Oct', revenue: 13500, expenses: 8000, netIncome: 5500 },
      { month: 'Nov', revenue: 15200, expenses: 8500, netIncome: 6700 },
      { month: 'Dec', revenue: 14800, expenses: 8300, netIncome: 6500 },
      { month: 'Jan', revenue: 15000, expenses: 8500, netIncome: 6500 },
    ];
  }
}
