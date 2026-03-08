/**
 * Transaction listing: recent transactions and full date-range queries.
 */

import { assertSupabase } from '@/lib/supabase';
import { withPettyCashTenant } from '@/lib/utils/pettyCashTenant';
import { inferPaymentCategory } from '@/lib/utils/feeUtils';

import type { UnifiedTransaction, DateRange, TransactionRecord } from '../financial/types';
import { withFinanceTenant } from './tenantUtils';
import {
  getFeeLabel,
  getFeeCategoryLabel,
  isAdvancePayment,
} from '@/services/finance/feeHelpers';
import { mapPaymentStatus, mapPettyCashStatus, normalizeCategoryLabel } from './statusHelpers';

export async function getRecentTransactions(
  preschoolId: string,
  limit: number = 10,
): Promise<UnifiedTransaction[]> {
  try {
    const transactions: UnifiedTransaction[] = [];

    const { data: payments, error: paymentsError } = await withFinanceTenant<Array<any>>(
      (column) =>
        assertSupabase()
          .from('payments')
          .select(
            `id, amount, description, status, created_at, payment_reference, metadata, students!inner(first_name, last_name)`,
          )
          .eq(column, preschoolId)
          .order('created_at', { ascending: false })
          .limit(Math.ceil(limit / 2)),
    );

    if (!paymentsError && payments) {
      (payments || []).forEach((payment: any) => {
        const metadata = payment?.metadata && typeof payment.metadata === 'object' ? payment.metadata : {};
        if (metadata?.exclude_from_finance_metrics === true) return;
        const studentData = Array.isArray(payment.students)
          ? payment.students[0]
          : payment.students;
        const studentName = studentData
          ? `${studentData.first_name} ${studentData.last_name}`
          : 'Student';

        transactions.push({
          id: payment.id,
          type:
            payment.status === 'completed' || payment.status === 'approved'
              ? 'revenue'
              : 'outstanding',
          amount: payment.amount || 0,
          description: payment.description || `Payment from ${studentName}`,
          status: payment.status,
          date: payment.created_at,
          reference: payment.payment_reference,
          source: 'payment',
          metadata: payment.metadata,
        });
      });
    }

    const { data: pettyCash, error: pettyCashError } = await withPettyCashTenant(
      (column, client) =>
        client
          .from('petty_cash_transactions')
          .select(
            'id, amount, description, status, created_at, receipt_number, receipt_url, category, type',
          )
          .eq(column, preschoolId)
          .order('created_at', { ascending: false })
          .limit(Math.ceil(limit / 2)),
    );

    if (!pettyCashError && pettyCash) {
      (pettyCash || []).forEach((transaction: any) => {
        transactions.push({
          id: transaction.id,
          type: 'expense',
          amount: Math.abs(transaction.amount),
          description: transaction.description,
          status: transaction.status,
          date: transaction.created_at,
          reference: transaction.receipt_number,
          source: 'petty_cash',
          metadata: { category: transaction.category, type: transaction.type },
        });
      });
    }

    transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return transactions.slice(0, limit);
  } catch (error) {
    console.error('Error fetching recent transactions:', error);

    return [
      {
        id: 'sample-1',
        type: 'revenue',
        amount: 1500,
        description: 'Monthly tuition payment - Sample Student',
        status: 'completed',
        date: new Date().toISOString(),
        source: 'payment',
      },
    ];
  }
}

export async function getTransactions(
  dateRange: DateRange,
  preschoolId?: string,
  options?: { useAccountingDate?: boolean },
): Promise<TransactionRecord[]> {
  try {
    const transactions: TransactionRecord[] = [];

    console.log('[FinancialDataService] getTransactions called with:', {
      dateRange,
      preschoolId,
    });

    const useAccountingDate = options?.useAccountingDate ?? true;
    const rangeStart = new Date(dateRange.from);
    const rangeEnd = new Date(dateRange.to);
    const extendedStart = new Date(rangeStart);
    if (!Number.isNaN(extendedStart.getTime())) {
      extendedStart.setMonth(extendedStart.getMonth() - 2);
    }
    const paymentStartIso =
      useAccountingDate && !Number.isNaN(extendedStart.getTime())
        ? extendedStart.toISOString()
        : dateRange.from;

    const { data: payments, error: paymentsError } = preschoolId
      ? await withFinanceTenant<Array<any>>((column) =>
          assertSupabase()
            .from('payments')
            .select(
              `id, amount, description, status, created_at, payment_reference, attachment_url, metadata, payment_method, student_id, parent_id, fee_ids, students(first_name, last_name)`,
            )
            .eq(column, preschoolId)
            .gte('created_at', paymentStartIso)
            .lte('created_at', dateRange.to)
            .order('created_at', { ascending: false }),
        )
      : await assertSupabase()
          .from('payments')
          .select(
            `id, amount, description, status, created_at, payment_reference, attachment_url, metadata, payment_method, student_id, parent_id, fee_ids, students(first_name, last_name)`,
          )
          .gte('created_at', paymentStartIso)
          .lte('created_at', dateRange.to)
          .order('created_at', { ascending: false });

    console.log('[FinancialDataService] Payments query result:', {
      count: payments?.length ?? 0,
      error: paymentsError?.message,
      preschoolId,
    });

    if (paymentsError) {
      console.error('Error fetching payments for transactions:', paymentsError);
    } else if (payments) {
      const feeIds = new Set<string>();
      const isUuid = (value: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

      payments.forEach((payment: any) => {
        const ids = Array.isArray(payment.fee_ids) ? payment.fee_ids : [];
        ids.filter((id: string) => typeof id === 'string' && isUuid(id)).forEach((id: string) => feeIds.add(id));
        const metadata = payment.metadata || {};
        const feeStructureId = metadata?.fee_structure_id || metadata?.fee_id;
        if (typeof feeStructureId === 'string' && isUuid(feeStructureId)) {
          feeIds.add(feeStructureId);
        }
      });

      const feeMap = new Map<string, any>();
      const feeIdList = Array.from(feeIds).filter((id) => typeof id === 'string' && isUuid(id));
      if (feeIdList.length > 0) {
        const { data: feeRows, error: feeError } = await assertSupabase()
          .from('student_fees')
          .select(
            'id, due_date, paid_date, amount, final_amount, amount_paid, status, fee_structures(name, fee_type, description)',
          )
          .in('id', feeIdList);
        if (feeError) {
          console.warn(
            '[FinancialDataService] Failed to load fee metadata for payments:',
            feeError.message,
          );
        } else {
          (feeRows || []).forEach((fee: any) => feeMap.set(fee.id, fee));
        }
      }

      const buildFeeSummary = (labels: string[]): string | null => {
        const unique = Array.from(new Set(labels.filter(Boolean)));
        if (unique.length === 0) return null;
        if (unique.length <= 2) return unique.join(' + ');
        return `${unique[0]} + ${unique.length - 1} more`;
      };

      payments.forEach((payment: any) => {
        const metadata = payment.metadata || {};
        if (metadata?.exclude_from_finance_metrics === true) return;
        const studentData = Array.isArray(payment.students)
          ? payment.students[0]
          : payment.students;
        const studentName = studentData
          ? `${studentData.first_name} ${studentData.last_name}`
          : 'Student';
        const paymentFeeIds = Array.isArray(payment.fee_ids) ? payment.fee_ids : [];
        const validFeeIds = paymentFeeIds.filter(
          (id: string) => typeof id === 'string' && isUuid(id),
        );
        const fallbackLabels = paymentFeeIds.filter(
          (id: string) => typeof id === 'string' && !isUuid(id),
        );
        const feeStructureId = metadata?.fee_structure_id || metadata?.fee_id;
        if (
          typeof feeStructureId === 'string' &&
          isUuid(feeStructureId) &&
          !validFeeIds.includes(feeStructureId)
        ) {
          validFeeIds.push(feeStructureId);
        }

        const feeRows = validFeeIds.map((id: string) => feeMap.get(id)).filter(Boolean);

        const feeLabels = [
          ...feeRows.map((fee: any) => getFeeLabel(fee)),
          ...fallbackLabels,
        ];
        const feeCategories: string[] = feeRows.map((fee: any) => getFeeCategoryLabel(fee));
        const uniqueCategories = Array.from(
          new Set(
            feeCategories
              .filter((category): category is string => Boolean(category))
              .map((category) => normalizeCategoryLabel(category)),
          ),
        );

        const metadataHint =
          metadata?.payment_context || metadata?.fee_type || metadata?.fee_category;
        const fallbackCategory = inferPaymentCategory(
          payment.description || metadata?.payment_purpose || metadataHint,
        );
        if (metadataHint && typeof metadataHint === 'string') {
          const label = normalizeCategoryLabel(metadataHint);
          if (!feeLabels.length) feeLabels.push(label);
        }
        const category =
          uniqueCategories.length === 1
            ? uniqueCategories[0]
            : uniqueCategories.length > 1
              ? 'Multiple Fees'
              : fallbackCategory;

        const feeSummary = buildFeeSummary(feeLabels);

        const dueDates = feeRows
          .map((fee: any) => fee?.due_date)
          .filter(Boolean)
          .map((dateStr: string) => new Date(dateStr));

        let dueDate: string | null = null;
        let accountingDate = payment.created_at || new Date().toISOString();
        if (dueDates.length) {
          dueDates.sort((a, b) => a.getTime() - b.getTime());
          const earliest = dueDates[0];
          const sameMonth = dueDates.every(
            (date) =>
              date.getFullYear() === earliest.getFullYear() &&
              date.getMonth() === earliest.getMonth(),
          );
          const earliestFee = feeRows.find(
            (fee: any) =>
              fee?.due_date && new Date(fee.due_date).getTime() === earliest.getTime(),
          );
          dueDate = earliestFee?.due_date || earliest.toISOString();
          if (sameMonth && dueDate) {
            accountingDate = dueDate;
          }
        }

        const receiptUrl =
          typeof metadata?.receipt_url === 'string' ? metadata.receipt_url : null;
        const receiptStoragePath =
          typeof metadata?.receipt_storage_path === 'string'
            ? metadata.receipt_storage_path
            : null;
        const hasReceipt = Boolean(receiptUrl || receiptStoragePath);

        const resolvedDate = useAccountingDate
          ? accountingDate
          : payment.created_at || accountingDate;

        transactions.push({
          id: payment.id,
          type: 'income',
          category,
          amount: payment.amount || 0,
          description: payment.description || `Payment from ${studentName}`,
          date: resolvedDate,
          status: mapPaymentStatus(payment.status),
          reference: payment.payment_reference ?? null,
          attachmentUrl: payment.attachment_url ?? null,
          receiptUrl,
          receiptStoragePath,
          hasReceipt,
          source: 'payment',
          paidDate: payment.created_at ?? null,
          dueDate,
          isAdvancePayment: isAdvancePayment(dueDate, payment.created_at),
          feeIds: validFeeIds.length ? validFeeIds : null,
          feeLabels,
          feeSummary,
          paymentMethod: payment.payment_method ?? null,
          studentId: payment.student_id ?? null,
          parentId: payment.parent_id ?? null,
        });
      });
    }

    const { data: pettyCash, error: pettyCashError } = await withPettyCashTenant(
      (column, client) => {
        let query = client
          .from('petty_cash_transactions')
          .select(
            'id, amount, description, status, created_at, category, type, receipt_url, receipt_number, reference_number',
          )
          .gte('created_at', dateRange.from)
          .lte('created_at', dateRange.to)
          .order('created_at', { ascending: false });
        if (preschoolId) {
          query = query.eq(column, preschoolId);
        }
        return query;
      },
    );

    console.log('[FinancialDataService] Petty cash query result:', {
      count: pettyCash?.length ?? 0,
      error: pettyCashError?.message,
      preschoolId,
    });

    if (pettyCashError) {
      console.error('Error fetching petty cash for transactions:', pettyCashError);
    } else if (pettyCash) {
      let receiptsMap = new Map<string, number>();
      try {
        const pettyCashIds = pettyCash.map((t: any) => t.id);
        if (pettyCashIds.length) {
          const { data: receipts } = await withPettyCashTenant((column, client) => {
            let query = client.from('petty_cash_receipts').select('transaction_id');
            if (preschoolId) {
              query = query.eq(column, preschoolId);
            }
            return query.in('transaction_id', pettyCashIds);
          });
          (receipts || []).forEach((r: any) => {
            receiptsMap.set(r.transaction_id, (receiptsMap.get(r.transaction_id) || 0) + 1);
          });
        }
      } catch (err) {
        console.warn('Failed to fetch petty cash receipts:', err);
      }

      pettyCash.forEach((transaction: any) => {
        const count = receiptsMap.get(transaction.id) || 0;
        const receiptUrl = transaction.receipt_url ?? null;
        transactions.push({
          id: transaction.id,
          type: 'expense',
          category: transaction.category || 'Other',
          amount: Math.abs(transaction.amount),
          description: transaction.description,
          date: transaction.created_at,
          status: mapPettyCashStatus(transaction.status),
          reference: transaction.receipt_number ?? transaction.reference_number ?? null,
          receiptUrl,
          receiptCount: count,
          hasReceipt: Boolean(receiptUrl) || count > 0,
          source: 'petty_cash',
        });
      });
    }

    try {
      const { data: finTx, error: finError } = preschoolId
        ? await withFinanceTenant((column) =>
            assertSupabase()
              .from('financial_transactions')
              .select(
                `id, amount, description, status, created_at, type, expense_category_id, expense_categories(name)`,
              )
              .eq(column, preschoolId)
              .gte('created_at', dateRange.from)
              .lte('created_at', dateRange.to)
              .order('created_at', { ascending: false }),
          )
        : await assertSupabase()
            .from('financial_transactions')
            .select(
              `id, amount, description, status, created_at, type, expense_category_id, expense_categories(name)`,
            )
            .gte('created_at', dateRange.from)
            .lte('created_at', dateRange.to)
            .order('created_at', { ascending: false });

      console.log('[FinancialDataService] Financial transactions query result:', {
        count: finTx?.length ?? 0,
        error: finError?.message,
        preschoolId,
      });

      (finTx || []).forEach((txn: any) => {
        const lowerType = String(txn.type || '').toLowerCase();
        const isExpense = lowerType.includes('expense') || Number(txn.amount) < 0;
        const categoryData = Array.isArray(txn.expense_categories)
          ? txn.expense_categories[0]
          : txn.expense_categories;
        const categoryName = categoryData?.name || txn.type || 'Expense';

        if (isExpense) {
          transactions.push({
            id: txn.id,
            type: 'expense',
            category: categoryName,
            amount: Math.abs(Number(txn.amount) || 0),
            description: txn.description || 'Expense',
            date: txn.created_at,
            status: mapPettyCashStatus(txn.status),
            source: 'financial_txn',
          });
        }
      });
    } catch (err) {
      console.error('[FinancialDataService] Error fetching financial_transactions:', err);
    }

    const rangeStartTime = rangeStart.getTime();
    const rangeEndTime = rangeEnd.getTime();
    const filteredTransactions =
      Number.isNaN(rangeStartTime) || Number.isNaN(rangeEndTime)
        ? transactions
        : transactions.filter((transaction) => {
            const time = new Date(transaction.date).getTime();
            if (Number.isNaN(time)) return false;
            return time >= rangeStartTime && time <= rangeEndTime;
          });

    filteredTransactions.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    console.log(
      '[FinancialDataService] Total transactions returned:',
      filteredTransactions.length,
    );

    return filteredTransactions;
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return [];
  }
}
