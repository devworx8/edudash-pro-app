/**
 * Registration payment status actions.
 */

import { assertSupabase } from '@/lib/supabase';
import {
  buildRegistrationPaymentReference,
  clearCanonicalPaymentReceiptState,
  finalizePaidFlow,
} from '@/services/finance/paidFlowService';
import type { Student } from './types';
import type { ShowAlert } from './feeActionUtils';

export interface RegistrationPaymentStatusResult {
  paymentReference: string;
  receiptUrl?: string | null;
}

export async function setRegistrationPaidStatus(
  isPaid: boolean,
  student: Student,
  studentRef: React.MutableRefObject<Student | null>,
  setStudent: React.Dispatch<React.SetStateAction<Student | null>>,
  organizationId: string | undefined,
  profileId: string | undefined,
  issuerName: string | undefined,
  showAlert: ShowAlert,
): Promise<RegistrationPaymentStatusResult> {
  const currentStudent = studentRef.current || student;
  const paymentReference = buildRegistrationPaymentReference(currentStudent.id);
  if (currentStudent.registration_fee_paid === isPaid && currentStudent.payment_verified === isPaid) {
    showAlert('No Change', `Registration is already marked as ${isPaid ? 'paid' : 'not paid'}.`, 'info');
    return { paymentReference, receiptUrl: null };
  }

  const supabase = assertSupabase();
  const nowIso = new Date().toISOString();
  const paymentDate = isPaid ? nowIso.split('T')[0] : null;

  await supabase
    .from('students')
    .update({
      registration_fee_paid: isPaid,
      payment_verified: isPaid,
      payment_date: paymentDate,
      updated_at: nowIso,
    })
    .eq('id', currentStudent.id)
    .throwOnError();

  const schoolId = currentStudent.preschool_id || organizationId;
  if (schoolId) {
    const registrationPayload = {
      registration_fee_paid: isPaid,
      payment_verified: isPaid,
      payment_date: paymentDate,
      payment_method: isPaid ? 'manual_principal' : null,
      updated_at: nowIso,
    };

    const { error: reqByStudentErr } = await supabase
      .from('registration_requests')
      .update(registrationPayload)
      .eq('organization_id', schoolId)
      .in('status', ['pending', 'approved'])
      .eq('edudash_student_id', currentStudent.id);
    if (reqByStudentErr) {
      console.warn('[StudentFees] registration_requests update by student id failed', reqByStudentErr);
    }

    if (currentStudent.date_of_birth) {
      const { error: reqByNameErr } = await supabase
        .from('registration_requests')
        .update(registrationPayload)
        .eq('organization_id', schoolId)
        .in('status', ['pending', 'approved'])
        .eq('student_first_name', currentStudent.first_name)
        .eq('student_last_name', currentStudent.last_name)
        .eq('student_dob', currentStudent.date_of_birth);
      if (reqByNameErr) {
        console.warn('[StudentFees] registration_requests update by student name failed', reqByNameErr);
      }

      const { error: childReqErr } = await supabase
        .from('child_registration_requests')
        .update({
          registration_fee_paid: isPaid,
          payment_verified: isPaid,
          payment_verified_at: isPaid ? nowIso : null,
          payment_verified_by: isPaid ? profileId || null : null,
          updated_at: nowIso,
        })
        .eq('preschool_id', schoolId)
        .in('status', ['pending', 'approved'])
        .eq('child_first_name', currentStudent.first_name)
        .eq('child_last_name', currentStudent.last_name)
        .eq('child_birth_date', currentStudent.date_of_birth);
      if (childReqErr) {
        console.warn('[StudentFees] child_registration_requests update failed', childReqErr);
      }
    }
  }

  const nextStudent: Student = {
    ...currentStudent,
    registration_fee_paid: isPaid,
    payment_verified: isPaid,
    payment_date: paymentDate,
  };
  studentRef.current = nextStudent;
  setStudent(nextStudent);

  let receiptUrl: string | null = null;
  const registrationAmount = Number(currentStudent.registration_fee_amount || 0);
  if (isPaid && schoolId && registrationAmount > 0 && profileId) {
    try {
      const result = await finalizePaidFlow({
        context: 'registration',
        organizationId: schoolId,
        amount: registrationAmount,
        paidDate: paymentDate || nowIso.split('T')[0],
        dueDate: paymentDate || nowIso.split('T')[0],
        description: 'Registration fee payment',
        paymentReference,
        paymentMethod: 'manual_principal',
        categoryCode: 'registration',
        student: {
          id: currentStudent.id,
          firstName: currentStudent.first_name,
          lastName: currentStudent.last_name,
          className: currentStudent.class_name || null,
          parentId: currentStudent.parent_id || null,
        },
        issuer: {
          id: profileId,
          name: issuerName || 'School Administrator',
        },
        metadata: {
          source: 'registration_status_update',
          registration_receipt_only: true,
          exclude_from_finance_metrics: true,
        },
        sendNotification: true,
        excludeFromFinanceMetrics: true,
      });
      receiptUrl = result.receiptUrl;
    } catch (receiptError) {
      console.warn('[StudentFees] registration receipt generation failed', receiptError);
    }
  }

  if (!isPaid && profileId) {
    try {
      await clearCanonicalPaymentReceiptState(
        paymentReference,
        profileId,
        'Registration payment marked unpaid by school staff.',
      );
    } catch (receiptError) {
      console.warn('[StudentFees] registration receipt reversal failed', receiptError);
    }
  }

  showAlert(
    'Registration Updated',
    isPaid
      ? 'Registration has been marked as paid and verified.'
      : 'Registration has been marked as not paid.',
    'success',
  );

  return { paymentReference, receiptUrl };
}
