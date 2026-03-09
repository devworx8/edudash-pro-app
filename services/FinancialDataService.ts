/**
 * Financial Data Service
 *
 * Adapts existing database schema (payments + petty_cash_transactions)
 * for financial dashboard display.
 *
 * Implementation is split across sub-modules in `./finance/`.
 * This file is a thin facade that preserves the original public API
 * so that all existing imports continue to work unchanged.
 *
 * Types are in services/financial/types.ts for reuse.
 */

import type {
  ApprovePopPaymentPayload,
  ApprovePopPaymentResult,
  FinanceControlCenterBundle,
  FinanceMonthExpenseBreakdown,
  FinanceQueueStage,
  FinanceQueueStageSummary,
  FinanceMonthSnapshot,
  FinanceReceivableStudentRow,
  FinanceReceivablesSummary,
} from '@/types/finance';

// Re-export types for backward compatibility
export type {
  UnifiedTransaction,
  FinancialMetrics,
  MonthlyTrendData,
  DateRange,
  TransactionRecord,
  FinanceOverviewData,
  FinanceMonthPaymentBreakdown,
  FinanceTenantColumn,
} from './financial/types';

import type {
  UnifiedTransaction,
  FinancialMetrics,
  MonthlyTrendData,
  DateRange,
  TransactionRecord,
  FinanceOverviewData,
  FinanceMonthPaymentBreakdown,
} from './financial/types';

// ── Sub-module imports ────────────────────────────────────────────
import { getFinancialMetrics, getMonthlyTrendData } from './finance/metricsService';
import { getOverview } from './finance/overviewService';
import { getRecentTransactions, getTransactions } from './finance/transactionService';
import { formatCurrency, getStatusColor, getDisplayStatus } from './finance/statusHelpers';
import {
  getMonthSnapshot,
  getMonthPaymentBreakdown,
  approvePOPWithAllocations,
  getFinanceControlCenterBundle,
} from './finance/controlCenterService';
import {
  getMonthExpenseBreakdown,
  getReceivablesSnapshot,
  EXPENSE_TYPES,
  logExpense,
  getExpenseCategories,
  getStaffForSalary,
} from './finance/expenseAndReceivables';
import { getPaymentsForBankReconciliation } from './finance/reconciliationService';

export class FinancialDataService {
  /** @deprecated Use getFinanceControlCenterBundle(). */
  static getFinancialMetrics(preschoolId: string): Promise<FinancialMetrics> {
    return getFinancialMetrics(preschoolId);
  }

  static getMonthlyTrendData(preschoolId: string): Promise<MonthlyTrendData[]> {
    return getMonthlyTrendData(preschoolId);
  }

  static getRecentTransactions(
    preschoolId: string,
    limit: number = 10,
  ): Promise<UnifiedTransaction[]> {
    return getRecentTransactions(preschoolId, limit);
  }

  /** @deprecated Use getFinanceControlCenterBundle(). */
  static getOverview(preschoolId?: string): Promise<FinanceOverviewData> {
    return getOverview(preschoolId);
  }

  static getTransactions(
    dateRange: DateRange,
    preschoolId?: string,
    options?: { useAccountingDate?: boolean },
  ): Promise<TransactionRecord[]> {
    return getTransactions(dateRange, preschoolId, options);
  }

  static formatCurrency(amount: number): string {
    return formatCurrency(amount);
  }

  static getStatusColor(status: string): string {
    return getStatusColor(status);
  }

  static getDisplayStatus(status: string): string {
    return getDisplayStatus(status);
  }

  static approvePOPWithAllocations(
    payload: ApprovePopPaymentPayload,
  ): Promise<ApprovePopPaymentResult> {
    return approvePOPWithAllocations(payload);
  }

  static getMonthSnapshot(orgId: string, monthIso?: string): Promise<FinanceMonthSnapshot> {
    return getMonthSnapshot(orgId, monthIso);
  }

  static getMonthPaymentBreakdown(
    orgId: string,
    monthIso?: string,
  ): Promise<FinanceMonthPaymentBreakdown> {
    return getMonthPaymentBreakdown(orgId, monthIso);
  }

  static getMonthExpenseBreakdown(
    orgId: string,
    monthIso?: string,
  ): Promise<FinanceMonthExpenseBreakdown> {
    return getMonthExpenseBreakdown(orgId, monthIso);
  }

  static getReceivablesSnapshot(
    orgId: string,
    monthIso?: string,
  ): Promise<{ summary: FinanceReceivablesSummary; students: FinanceReceivableStudentRow[] }> {
    return getReceivablesSnapshot(orgId, monthIso);
  }

  static getFinanceControlCenterBundle(
    orgId: string,
    monthIso?: string,
  ): Promise<FinanceControlCenterBundle> {
    return getFinanceControlCenterBundle(orgId, monthIso);
  }

  static readonly EXPENSE_TYPES = EXPENSE_TYPES;

  static logExpense(params: {
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
    return logExpense(params);
  }

  static getExpenseCategories(
    preschoolId: string,
  ): Promise<Array<{ id: string; name: string; color: string; icon: string; monthlyBudget: number }>> {
    return getExpenseCategories(preschoolId);
  }

  static getStaffForSalary(
    preschoolId: string,
  ): Promise<Array<{ id: string; name: string; role: string }>> {
    return getStaffForSalary(preschoolId);
  }

  static getPaymentsForBankReconciliation(
    orgId: string,
    monthIso: string,
  ): Promise<
    Array<{
      date: string;
      amount: number;
      reference: string;
      student: string;
      parent: string;
      category: string;
      status: string;
    }>
  > {
    return getPaymentsForBankReconciliation(orgId, monthIso);
  }
}
