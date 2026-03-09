/**
 * Fee status actions: mark paid, mark unpaid, receipt handling.
 */

import { assertSupabase } from '@/lib/supabase';
import {
  buildManualFeePaymentReference,
  clearCanonicalPaymentReceiptState,
} from '@/services/finance/paidFlowService';
import type { Student, StudentFee } from './types';
import {
  upsertFinancialTransaction,
  generateReceiptForFee,
  fetchReceiptUrlForFee,
  openReceiptUrl,
} from './feeHelpers';
import { resolvePendingLikeStatus, type ShowAlert } from './feeActionUtils';
import { writeFeeCorrectionAudit } from './feeCorrectionAudit';

export async function markFeePaid(
  fee: StudentFee,
  student: Student,
  organizationId: string | undefined,
  profileId: string,
  profileRole: string | null | undefined,
  showAlert: ShowAlert,
  loadFees: () => Promise<void>,
): Promise<void> {
  const supabase = assertSupabase();
  const nowIso = new Date().toISOString();
  const paidDate = nowIso.split('T')[0];
  const amount = fee.final_amount || fee.amount;
  const beforeSnapshot = {
    status: fee.status,
    paid_date: fee.paid_date || null,
    amount: fee.amount,
    final_amount: fee.final_amount,
    amount_paid: Number(fee.amount_paid || 0),
    amount_outstanding: Number(fee.amount_outstanding || 0),
  };

  await supabase
    .from('student_fees')
    .update({
      status: 'paid',
      paid_date: paidDate,
      amount_paid: amount,
      amount_outstanding: 0,
      updated_at: nowIso,
    })
    .eq('id', fee.id)
    .throwOnError();

  await upsertFinancialTransaction(fee, 'completed', student, organizationId, profileId);
  await generateReceiptForFee(fee, amount, paidDate, student, { id: profileId } as any, organizationId);

  showAlert('Payment Updated', 'Fee marked as paid.', 'success');
  const auditResult = await writeFeeCorrectionAudit({
    organizationId: organizationId || student.preschool_id || null,
    studentId: fee.student_id,
    studentFeeId: fee.id,
    action: 'mark_paid',
    reason: 'Manually marked paid by school staff.',
    beforeSnapshot,
    afterSnapshot: {
      status: 'paid',
      paid_date: paidDate,
      amount: fee.amount,
      final_amount: amount,
      amount_paid: amount,
      amount_outstanding: 0,
    },
    metadata: {
      payment_action: 'manual_mark_paid',
    },
    actorId: profileId,
    actorRole: profileRole || null,
    sourceScreen: 'principal-student-fees',
  });
  if (!auditResult.ok) {
    showAlert(
      'Audit Warning',
      'Fee was marked paid, but correction audit logging failed. You can retry if needed.',
      'warning',
    );
  }
  loadFees();
}

export async function markFeeUnpaid(
  fee: StudentFee,
  student: Student,
  organizationId: string | undefined,
  profileId: string,
  profileRole: string | null | undefined,
  showAlert: ShowAlert,
  loadFees: () => Promise<void>,
): Promise<void> {
  const supabase = assertSupabase();
  const nowIso = new Date().toISOString();
  const amount = fee.final_amount || fee.amount;
  const nextStatus = resolvePendingLikeStatus(fee, amount, 0);
  const beforeSnapshot = {
    status: fee.status,
    paid_date: fee.paid_date || null,
    amount: fee.amount,
    final_amount: fee.final_amount,
    amount_paid: Number(fee.amount_paid || 0),
    amount_outstanding: Number(fee.amount_outstanding || 0),
  };

  await supabase
    .from('student_fees')
    .update({
      status: nextStatus,
      paid_date: null,
      amount_paid: 0,
      amount_outstanding: amount,
      updated_at: nowIso,
    })
    .eq('id', fee.id)
    .throwOnError();

  await clearCanonicalPaymentReceiptState(
    buildManualFeePaymentReference(fee.id),
    profileId,
    'Manual fee marked unpaid by school staff.',
  );
  await upsertFinancialTransaction(fee, 'voided', student, organizationId, profileId);

  showAlert('Payment Updated', 'Fee marked as unpaid.', 'success');
  const auditResult = await writeFeeCorrectionAudit({
    organizationId: organizationId || student.preschool_id || null,
    studentId: fee.student_id,
    studentFeeId: fee.id,
    action: 'mark_unpaid',
    reason: 'Manually reverted paid fee back to unpaid.',
    beforeSnapshot,
    afterSnapshot: {
      status: nextStatus,
      paid_date: null,
      amount: fee.amount,
      final_amount: amount,
      amount_paid: 0,
      amount_outstanding: amount,
    },
    metadata: {
      payment_action: 'manual_mark_unpaid',
    },
    actorId: profileId,
    actorRole: profileRole || null,
    sourceScreen: 'principal-student-fees',
  });
  if (!auditResult.ok) {
    showAlert(
      'Audit Warning',
      'Fee was marked unpaid, but correction audit logging failed. You can retry if needed.',
      'warning',
    );
  }
  loadFees();
}

export async function handleReceiptAction(
  fee: StudentFee,
  student: Student | null,
  profile: { id: string } | null,
  organizationId: string | undefined,
  showAlert: ShowAlert,
  router: any,
): Promise<void> {
  if (fee.status !== 'paid') {
    showAlert('Receipt Unavailable', 'Only paid fees can generate receipts.', 'warning');
    return;
  }

  const existingUrl = await fetchReceiptUrlForFee(fee);
  if (existingUrl) {
    await openReceiptUrl(existingUrl, router);
    return;
  }

  showAlert('Generate Receipt?', 'No receipt exists yet for this fee. Generate one now?', 'info', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Generate',
      onPress: async () => {
        if (!student || !profile) return;
        const paidDate = fee.paid_date || new Date().toISOString().split('T')[0];
        const amount = fee.final_amount || fee.amount;
        const result = await generateReceiptForFee(fee, amount, paidDate, student, profile as any, organizationId);
        if (result?.receiptUrl) {
          await openReceiptUrl(result.receiptUrl, router);
        } else {
          showAlert('Receipt Error', 'Receipt generated but link is unavailable.', 'warning');
        }
      },
    },
  ]);
}
