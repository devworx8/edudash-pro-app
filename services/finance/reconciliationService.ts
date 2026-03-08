/**
 * Bank reconciliation export: fetches payments for a billing month
 * and returns rows suitable for CSV / spreadsheet export.
 */

import { assertSupabase } from '@/lib/supabase';
import { inferFeeCategoryCode } from '@/lib/utils/feeUtils';

import { withFinanceTenant } from './tenantUtils';
import { monthStartIsoFromValue } from './dateHelpers';
import {
  CATEGORY_LABELS,
  normalizeReference,
  resolvePaymentAccountingMonth,
} from './resolvers';

export async function getPaymentsForBankReconciliation(
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
  const month =
    monthStartIsoFromValue(monthIso, { recoverUtcMonthBoundary: true }) || monthIso;
  const monthStart = new Date(month);
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
  const extendedStart = new Date(monthStart);
  extendedStart.setMonth(extendedStart.getMonth() - 1);
  const extendedEnd = new Date(monthEnd);
  extendedEnd.setMonth(extendedEnd.getMonth() + 2);

  const { data: payments, error } = await withFinanceTenant<Array<any>>((column) =>
    assertSupabase()
      .from('payments')
      .select(
        `id, amount, status, created_at, payment_reference, description, metadata, student_id, parent_id, category_code, billing_month, transaction_date, students(first_name, last_name)`,
      )
      .eq(column, orgId)
      .in('status', ['completed', 'approved', 'paid', 'successful'])
      .gte('created_at', extendedStart.toISOString())
      .lte('created_at', extendedEnd.toISOString())
      .order('created_at', { ascending: true }),
  );

  if (error || !payments) return [];

  const rows: Array<{
    date: string;
    amount: number;
    reference: string;
    student: string;
    parent: string;
    category: string;
    status: string;
  }> = [];

  for (const p of payments) {
    const metadata = p?.metadata && typeof p.metadata === 'object' ? p.metadata : {};
    if (metadata?.exclude_from_finance_metrics === true) continue;
    const accountingMonth = resolvePaymentAccountingMonth(p);
    if (accountingMonth !== month) continue;

    const amount = Number(p?.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const categoryCode = inferFeeCategoryCode(
      p?.category_code ||
        metadata?.category_code ||
        metadata?.fee_category ||
        p?.description ||
        'tuition',
    );
    const categoryLabel = CATEGORY_LABELS[categoryCode] || categoryCode;

    const studentData = Array.isArray(p.students) ? p.students[0] : p.students;
    const student = studentData
      ? `${studentData.first_name || ''} ${studentData.last_name || ''}`.trim()
      : 'Unknown';

    const ref = normalizeReference(
      p?.payment_reference || metadata?.payment_reference || metadata?.reference || '',
    );

    const dateVal = p?.transaction_date || metadata?.transaction_date || p?.created_at;
    const dateStr = typeof dateVal === 'string' ? dateVal : new Date().toISOString();

    rows.push({
      date: dateStr,
      amount,
      reference: ref || p?.id?.slice(0, 8) || '',
      student,
      parent: '',
      category: categoryLabel,
      status: p?.status || 'completed',
    });
  }

  return rows;
}
