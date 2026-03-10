/**
 * Hook for student fee mutation actions.
 * Thin orchestrator — delegates to focused action modules.
 *
 * @see feeActionUtils.ts       — Pure utility functions
 * @see feeStatusActions.ts     — Mark paid / unpaid / receipts
 * @see feeModificationActions.ts — Waive / adjust
 * @see classFeeSync.ts         — Audit logging, tuition sync, fee prefill
 * @see classChangeActions.ts   — Change class, sync tuition to class
 * @see registrationActions.ts  — Registration paid status
 * @see studentLifecycleActions.ts — Enrollment date, deactivate
 */

import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getDateOnlyISO, getMonthStartISO } from '@/lib/utils/dateUtils';
import { assertSupabase } from '@/lib/supabase';
import {
  buildRegistrationPaymentReference,
  fetchReceiptUrlByPaymentReference,
  finalizePaidFlow,
} from '@/services/finance/paidFlowService';
import type { Student, StudentFee, ClassOption, ModalType } from './types';
import { getSupabaseErrorMessage, resolvePendingLikeStatus, type ShowAlert } from './feeActionUtils';
import { markFeePaid, markFeeUnpaid, handleReceiptAction as receiptAction } from './feeStatusActions';
import { waiveFee, adjustFee } from './feeModificationActions';
import { changeStudentClass, syncTuitionFeesToClass } from './classChangeActions';
import { setRegistrationPaidStatus } from './registrationActions';
import { updateEnrollmentDate, deactivateStudent } from './studentLifecycleActions';
import { prefillRegistrationFeeForClass as prefillFee } from './classFeeSync';
import { writeFeeCorrectionAudit } from './feeCorrectionAudit';
import { openReceiptUrl } from './feeHelpers';

export interface StudentFeeActionsParams {
  student: Student | null;
  setStudent: React.Dispatch<React.SetStateAction<Student | null>>;
  studentRef: React.MutableRefObject<Student | null>;
  classes: ClassOption[];
  organizationId: string | undefined;
  loadFees: (s?: Student | null) => Promise<void>;
  loadStudent: () => Promise<Student | null>;
  loadCorrectionTimeline?: () => Promise<void>;
  showAlert: ShowAlert;
  router: any;
}

export interface StudentFeeActionsReturn {
  canManageFees: boolean;
  canManageStudentProfile: boolean;
  canDeleteFees: boolean;
  saving: boolean;
  recomputingBalances: boolean;
  deactivatingStudent: boolean;
  syncingTuitionFees: boolean;
  updatingRegistrationStatus: boolean;
  processingRegistrationReceipt: boolean;
  processingFeeId: string | null;
  processingFeeAction: 'mark_paid' | 'mark_unpaid' | 'delete' | 'update_due_date' | null;
  modalType: ModalType;
  setModalType: (t: ModalType) => void;
  selectedFee: StudentFee | null;
  setSelectedFee: (f: StudentFee | null) => void;
  showEnrollmentPicker: boolean;
  setShowEnrollmentPicker: (v: boolean) => void;
  waiveAmount: string;
  setWaiveAmount: (v: string) => void;
  waiveReason: string;
  setWaiveReason: (v: string) => void;
  waiveType: 'full' | 'partial';
  setWaiveType: (v: 'full' | 'partial') => void;
  adjustAmount: string;
  setAdjustAmount: (v: string) => void;
  adjustReason: string;
  setAdjustReason: (v: string) => void;
  newClassId: string;
  setNewClassId: (v: string) => void;
  classRegistrationFee: string;
  setClassRegistrationFee: (v: string) => void;
  classFeeHint: string;
  setClassFeeHint: (v: string) => void;
  loadingSuggestedFee: boolean;
  canSubmitClassCorrection: boolean;
  handleWaiveFee: () => Promise<void>;
  handleAdjustFee: () => Promise<void>;
  handleChangeClass: () => Promise<void>;
  handleUpdateEnrollmentDate: (date: Date) => Promise<void>;
  handleDeactivateStudent: () => Promise<void>;
  handleMarkPaid: (fee: StudentFee) => Promise<void>;
  handleMarkUnpaid: (fee: StudentFee) => Promise<void>;
  handleDeleteFee: (fee: StudentFee) => Promise<void>;
  handleUpdateFeeDueDate: (fee: StudentFee, dueDate: Date) => Promise<void>;
  handleReceiptAction: (fee: StudentFee) => Promise<void>;
  handleRegistrationReceiptAction: () => Promise<void>;
  handleRecomputeLearnerBalances: () => Promise<void>;
  handleSyncTuitionFeesToClass: () => Promise<void>;
  handleSetRegistrationPaidStatus: (isPaid: boolean) => Promise<void>;
  prefillRegistrationFeeForClass: (classId: string) => Promise<void>;
}

export function useStudentFeeActions(params: StudentFeeActionsParams): StudentFeeActionsReturn {
  const { student, setStudent, studentRef, classes, organizationId, loadFees, loadStudent, loadCorrectionTimeline, showAlert, router } = params;
  const { profile } = useAuth();

  // ── State ─────────────────────────────────────────────────
  const role = String(profile?.role || '').toLowerCase();
  const isPrincipalTier = ['principal', 'principal_admin', 'super_admin', 'superadmin'].includes(role);
  const isAdmin = role === 'admin';
  const canManageFees = isPrincipalTier || isAdmin;
  const canManageStudentProfile = isPrincipalTier || isAdmin;
  const canDeleteFees = isPrincipalTier || isAdmin;

  const deny = useCallback((message: string) => {
    showAlert('Access Limited', message, 'warning');
  }, [showAlert]);

  const [saving, setSaving] = useState(false);
  const [recomputingBalances, setRecomputingBalances] = useState(false);
  const [deactivatingStudent, setDeactivatingStudent] = useState(false);
  const [syncingTuitionFees, setSyncingTuitionFees] = useState(false);
  const [updatingRegistrationStatus, setUpdatingRegistrationStatus] = useState(false);
  const [processingRegistrationReceipt, setProcessingRegistrationReceipt] = useState(false);
  const [processingFeeId, setProcessingFeeId] = useState<string | null>(null);
  const [processingFeeAction, setProcessingFeeAction] = useState<'mark_paid' | 'mark_unpaid' | 'delete' | 'update_due_date' | null>(null);
  const [modalType, setModalType] = useState<ModalType>(null);
  const [selectedFee, setSelectedFee] = useState<StudentFee | null>(null);
  const [showEnrollmentPicker, setShowEnrollmentPicker] = useState(false);

  const [waiveAmount, setWaiveAmount] = useState('');
  const [waiveReason, setWaiveReason] = useState('');
  const [waiveType, setWaiveType] = useState<'full' | 'partial'>('full');

  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');

  const [newClassId, setNewClassId] = useState('');
  const [classRegistrationFee, setClassRegistrationFee] = useState('');
  const [classFeeHint, setClassFeeHint] = useState('');
  const [loadingSuggestedFee, setLoadingSuggestedFee] = useState(false);

  const issuerName =
    (profile as any)?.full_name ||
    `${(profile as any)?.first_name || ''} ${(profile as any)?.last_name || ''}`.trim() ||
    'School Administrator';

  const refreshMutationState = useCallback(async (targetStudent?: Student | null) => {
    let resolved: Student | null = targetStudent || studentRef.current || student;
    try {
      resolved = await loadStudent();
    } catch {
      resolved = targetStudent || studentRef.current || student;
    }
    try {
      await loadFees(resolved || targetStudent || studentRef.current || student);
    } catch {
      // Best effort; local mutation already completed.
    }
    if (loadCorrectionTimeline) {
      try {
        await loadCorrectionTimeline();
      } catch {
        // Best effort; timeline can be reloaded manually.
      }
    }
  }, [loadCorrectionTimeline, loadFees, loadStudent, student, studentRef]);

  // ── Handlers ──────────────────────────────────────────────

  const handleWaiveFee = async () => {
    if (!canManageFees) {
      deny('Fee changes are limited to finance administrators and principals.');
      return;
    }
    if (!selectedFee || !profile?.id) return;
    setSaving(true);
    try {
      await waiveFee(
        selectedFee,
        student,
        waiveType,
        waiveAmount,
        waiveReason,
        showAlert,
        loadFees,
        {
          organizationId,
          actorId: profile.id,
          actorRole: profile.role || null,
          sourceScreen: 'principal-student-fees',
        },
      );
      await refreshMutationState(student);
      setModalType(null); setSelectedFee(null); setWaiveAmount(''); setWaiveReason(''); setWaiveType('full');
    } catch (error: any) {
      console.error('[StudentFees] handleWaiveFee failed', { feeId: selectedFee.id, error });
      showAlert('Error', getSupabaseErrorMessage(error, 'Failed to waive fee.'), 'error');
    } finally { setSaving(false); }
  };

  const handleAdjustFee = async () => {
    if (!canManageFees) {
      deny('Fee changes are limited to finance administrators and principals.');
      return;
    }
    if (!selectedFee || !profile?.id) return;
    setSaving(true);
    try {
      await adjustFee(
        selectedFee,
        adjustAmount,
        adjustReason,
        student,
        setStudent,
        showAlert,
        loadFees,
        {
          organizationId,
          actorId: profile.id,
          actorRole: profile.role || null,
          sourceScreen: 'principal-student-fees',
        },
      );
      await refreshMutationState(student);
      setModalType(null); setSelectedFee(null); setAdjustAmount(''); setAdjustReason('');
    } catch (error: any) {
      console.error('[StudentFees] handleAdjustFee failed', { feeId: selectedFee.id, error });
      showAlert('Error', getSupabaseErrorMessage(error, 'Failed to adjust fee.'), 'error');
    } finally { setSaving(false); }
  };

  const handleChangeClass = async () => {
    if (!canManageStudentProfile) {
      deny('Class placement and learner profile controls are principal-scoped for your school.');
      return;
    }
    if (!student || !newClassId || !profile?.id) return;
    setSaving(true);
    try {
      await changeStudentClass(
        student, studentRef, newClassId, classRegistrationFee, classes,
        organizationId, profile.id, profile.role || null, showAlert, loadStudent, loadFees,
      );
      await refreshMutationState(studentRef.current || student);
      setModalType(null); setNewClassId(''); setClassRegistrationFee(''); setClassFeeHint('');
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to change class.', 'error');
    } finally { setSaving(false); }
  };

  const handleSyncTuitionFeesToClass = useCallback(async () => {
    if (!canManageStudentProfile) {
      deny('Tuition sync to class settings is principal-scoped for your school.');
      return;
    }
    const currentStudent = studentRef.current || student;
    if (!currentStudent || syncingTuitionFees || saving || !profile?.id) return;
    setSyncingTuitionFees(true);
    setSaving(true);
    try {
      await syncTuitionFeesToClass(
        currentStudent, studentRef, classes, organizationId,
        profile.id, profile.role || null, showAlert, loadStudent, loadFees,
      );
      await refreshMutationState(currentStudent);
    } catch (error: any) {
      showAlert('Error', getSupabaseErrorMessage(error, 'Failed to sync tuition fees.'), 'error');
    } finally { setSyncingTuitionFees(false); setSaving(false); }
  }, [canManageStudentProfile, classes, deny, loadFees, loadStudent, organizationId, profile?.id, profile?.role, refreshMutationState, saving, showAlert, student, studentRef, syncingTuitionFees]);

  const handleRecomputeLearnerBalances = useCallback(async () => {
    if (!canManageFees) {
      deny('Learner balance recompute is limited to finance administrators and principals.');
      return;
    }
    const currentStudent = studentRef.current || student;
    if (!currentStudent || !profile?.id || recomputingBalances || saving) return;

    setRecomputingBalances(true);
    setSaving(true);
    try {
      const { data, error } = await assertSupabase().rpc('recalculate_student_fee_balances', {
        p_student_id: currentStudent.id,
        p_actor_id: profile.id,
        p_reason: 'manual_recompute',
      });

      if (error) {
        throw error;
      }

      const updatedCount = Number((data as { updated_count?: number } | null)?.updated_count || 0);
      showAlert(
        'Balances Recomputed',
        updatedCount > 0
          ? `Recomputed ${updatedCount} fee row(s) for this learner.`
          : 'No fee rows needed recompute for this learner.',
        'success',
      );
      await refreshMutationState(currentStudent);
    } catch (error: any) {
      showAlert('Recompute Failed', getSupabaseErrorMessage(error, 'Could not recompute learner balances.'), 'error');
    } finally {
      setRecomputingBalances(false);
      setSaving(false);
    }
  }, [canManageFees, deny, profile?.id, recomputingBalances, refreshMutationState, saving, showAlert, student, studentRef]);

  const handleSetRegistrationPaidStatus = useCallback(async (isPaid: boolean) => {
    if (!canManageFees) {
      deny('Registration verification is limited to finance administrators and principals.');
      return;
    }
    const currentStudent = studentRef.current || student;
    if (!currentStudent || updatingRegistrationStatus || saving) return;
    setUpdatingRegistrationStatus(true);
    setSaving(true);
    try {
      const result = await setRegistrationPaidStatus(
        isPaid, currentStudent, studentRef, setStudent, organizationId, profile?.id, issuerName, showAlert,
      );
      const nextStudent = studentRef.current || currentStudent;
      const action = isPaid ? 'registration_paid' : 'registration_unpaid';
      const auditResult = await writeFeeCorrectionAudit({
        organizationId: organizationId || currentStudent.preschool_id || null,
        studentId: currentStudent.id,
        action,
        reason: isPaid
          ? 'Registration marked paid by school staff.'
          : 'Registration marked unpaid by school staff.',
        beforeSnapshot: {
          registration_fee_amount: Number(currentStudent.registration_fee_amount || 0),
          registration_fee_paid: Boolean(currentStudent.registration_fee_paid),
          payment_verified: Boolean(currentStudent.payment_verified),
          payment_date: currentStudent.payment_date || null,
        },
        afterSnapshot: {
          registration_fee_amount: Number(nextStudent.registration_fee_amount || 0),
          registration_fee_paid: Boolean(nextStudent.registration_fee_paid),
          payment_verified: Boolean(nextStudent.payment_verified),
          payment_date: nextStudent.payment_date || null,
        },
        metadata: {
          payment_reference: result.paymentReference,
          receipt_url: result.receiptUrl || null,
        },
        actorId: profile?.id || null,
        actorRole: profile?.role || null,
        sourceScreen: 'principal-student-fees',
      });
      if (!auditResult.ok) {
        showAlert(
          'Audit Warning',
          'Registration status changed, but correction audit logging failed. Refresh and retry if needed.',
          'warning',
        );
      }
      await refreshMutationState(nextStudent);
    } catch (error: any) {
      showAlert('Error', getSupabaseErrorMessage(error, 'Failed to update registration payment status.'), 'error');
    } finally { setUpdatingRegistrationStatus(false); setSaving(false); }
  }, [canManageFees, deny, issuerName, organizationId, profile?.id, profile?.role, refreshMutationState, saving, setStudent, showAlert, student, studentRef, updatingRegistrationStatus]);

  const handleUpdateEnrollmentDate = async (date: Date) => {
    if (!canManageStudentProfile) {
      deny('Learner start-date updates are principal-scoped for your school.');
      return;
    }
    if (!student) return;
    setSaving(true);
    try {
      await updateEnrollmentDate(date, student, studentRef, setStudent, showAlert, loadFees);
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to update enrollment date.', 'error');
    } finally { setSaving(false); }
  };

  const handleDeactivateStudent = useCallback(async () => {
    if (!canManageStudentProfile) {
      deny('Learner lifecycle changes are principal-scoped for your school.');
      return;
    }
    if (!student || deactivatingStudent) return;
    deactivateStudent(student, studentRef, setStudent, showAlert, loadStudent, loadFees);
  }, [canManageStudentProfile, deactivatingStudent, deny, loadFees, loadStudent, showAlert, student, studentRef, setStudent]);

  const handleMarkPaid = async (fee: StudentFee) => {
    if (!canManageFees) {
      deny('Mark Paid is limited to finance administrators and principals.');
      return;
    }
    if (!profile?.id || !student || processingFeeId) return;
    setProcessingFeeId(fee.id); setProcessingFeeAction('mark_paid'); setSaving(true);
    try {
      await markFeePaid(fee, student, organizationId, profile.id, profile.role || null, showAlert, loadFees);
      await refreshMutationState(student);
    } catch (error: any) {
      console.error('[StudentFees] handleMarkPaid failed', { feeId: fee.id, error });
      showAlert('Error', getSupabaseErrorMessage(error, 'Failed to update fee status.'), 'error');
    } finally { setSaving(false); setProcessingFeeId(null); setProcessingFeeAction(null); }
  };

  const handleMarkUnpaid = async (fee: StudentFee) => {
    if (!canManageFees) {
      deny('Mark Unpaid is limited to finance administrators and principals.');
      return;
    }
    if (!profile?.id || !student || processingFeeId) return;
    setProcessingFeeId(fee.id); setProcessingFeeAction('mark_unpaid'); setSaving(true);
    try {
      await markFeeUnpaid(fee, student, organizationId, profile.id, profile.role || null, showAlert, loadFees);
      await refreshMutationState(student);
    } catch (error: any) {
      console.error('[StudentFees] handleMarkUnpaid failed', { feeId: fee.id, error });
      showAlert('Error', getSupabaseErrorMessage(error, 'Failed to update fee status.'), 'error');
    } finally { setSaving(false); setProcessingFeeId(null); setProcessingFeeAction(null); }
  };

  const handleReceiptAction = async (fee: StudentFee) => {
    try {
      await receiptAction(fee, student, profile, organizationId, showAlert, router);
    } catch (error: any) {
      showAlert('Receipt Error', error?.message || 'Failed to open receipt.', 'error');
    }
  };

  const handleRegistrationReceiptAction = useCallback(async () => {
    const currentStudent = studentRef.current || student;
    if (!currentStudent) return;
    if (!Boolean(currentStudent.registration_fee_paid) && !Boolean(currentStudent.payment_verified)) {
      showAlert('Receipt Unavailable', 'Only paid registration fees can generate receipts.', 'warning');
      return;
    }
    if (!organizationId || !profile?.id) return;

    const paymentReference = buildRegistrationPaymentReference(currentStudent.id);
    setProcessingRegistrationReceipt(true);
    try {
      const existingUrl = await fetchReceiptUrlByPaymentReference(paymentReference);
      if (existingUrl) {
        await openReceiptUrl(existingUrl, router);
        return;
      }

      const amount = Number(currentStudent.registration_fee_amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        showAlert('Receipt Unavailable', 'Registration amount is missing or invalid.', 'warning');
        return;
      }

      const result = await finalizePaidFlow({
        context: 'registration',
        organizationId,
        amount,
        paidDate: currentStudent.payment_date || new Date().toISOString().split('T')[0],
        dueDate: currentStudent.payment_date || new Date().toISOString().split('T')[0],
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
        issuer: { id: profile.id, name: issuerName },
        metadata: {
          source: 'registration_receipt_action',
          registration_receipt_only: true,
          exclude_from_finance_metrics: true,
        },
        sendNotification: false,
        excludeFromFinanceMetrics: true,
      });

      if (result.receiptUrl) {
        await openReceiptUrl(result.receiptUrl, router);
      } else {
        showAlert('Receipt Error', 'Receipt generated but link is unavailable.', 'warning');
      }
    } catch (error: any) {
      showAlert('Receipt Error', error?.message || 'Failed to open registration receipt.', 'error');
    } finally {
      setProcessingRegistrationReceipt(false);
    }
  }, [issuerName, organizationId, profile?.id, router, showAlert, student, studentRef]);

  const handleUpdateFeeDueDate = useCallback(async (fee: StudentFee, dueDate: Date) => {
    if (!canManageFees) {
      deny('Fee due-date updates are limited to finance administrators and principals.');
      return;
    }
    if (!profile?.id || !student || processingFeeId) return;

    const normalizedDueDate = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
    const dueDateIso = getDateOnlyISO(normalizedDueDate);
    const billingMonthIso = getMonthStartISO(normalizedDueDate);
    const nowIso = new Date().toISOString();

    const amountPaid = Number(fee.amount_paid || 0);
    const computedOutstanding = Number.isFinite(Number(fee.amount_outstanding))
      ? Number(fee.amount_outstanding)
      : Math.max(Number(fee.final_amount || fee.amount || 0) - amountPaid, 0);
    const nextStatus =
      fee.status === 'paid' || fee.status === 'waived'
        ? fee.status
        : resolvePendingLikeStatus(
            { ...fee, due_date: dueDateIso },
            Math.max(computedOutstanding, 0),
            amountPaid,
          );

    setProcessingFeeId(fee.id);
    setProcessingFeeAction('update_due_date');
    setSaving(true);
    try {
      const auditResult = await writeFeeCorrectionAudit({
        organizationId: organizationId || student.preschool_id || null,
        studentId: fee.student_id,
        studentFeeId: fee.id,
        action: 'adjust',
        reason: `Fee due date changed from ${fee.due_date} to ${dueDateIso}.`,
        beforeSnapshot: {
          due_date: fee.due_date,
          billing_month: fee.billing_month || null,
          status: fee.status,
        },
        afterSnapshot: {
          due_date: dueDateIso,
          billing_month: billingMonthIso,
          status: nextStatus,
        },
        metadata: {
          adjustment_type: 'due_date',
        },
        actorId: profile.id,
        actorRole: profile.role || null,
        sourceScreen: 'principal-student-fees',
      });

      if (!auditResult.ok) {
        throw new Error(auditResult.error || 'audit_log_failed');
      }

      await assertSupabase()
        .from('student_fees')
        .update({
          due_date: dueDateIso,
          billing_month: billingMonthIso,
          status: nextStatus,
          updated_at: nowIso,
        })
        .eq('id', fee.id)
        .throwOnError();

      showAlert('Due Date Updated', 'Fee due date updated successfully.', 'success');
      await refreshMutationState(student);
    } catch (error: any) {
      console.error('[StudentFees] handleUpdateFeeDueDate failed', { feeId: fee.id, error });
      showAlert('Update Failed', getSupabaseErrorMessage(error, 'Failed to update due date.'), 'error');
    } finally {
      setSaving(false);
      setProcessingFeeId(null);
      setProcessingFeeAction(null);
    }
  }, [canManageFees, deny, organizationId, processingFeeId, profile?.id, profile?.role, refreshMutationState, showAlert, student]);

  const handleDeleteFee = useCallback(async (fee: StudentFee) => {
    if (!canDeleteFees) {
      deny('Fee-row deletion is principal-scoped for your school.');
      return;
    }
    if (!profile?.id || !student || processingFeeId) return;

    setProcessingFeeId(fee.id);
    setProcessingFeeAction('delete');
    setSaving(true);
    try {
      const beforeSnapshot = {
        status: fee.status,
        amount: Number(fee.amount || 0),
        final_amount: Number(fee.final_amount || fee.amount || 0),
        amount_paid: Number(fee.amount_paid || 0),
        amount_outstanding: Number(fee.amount_outstanding || 0),
        due_date: fee.due_date,
        billing_month: fee.billing_month || null,
      };

      const auditResult = await writeFeeCorrectionAudit({
        organizationId: organizationId || student.preschool_id || null,
        studentId: fee.student_id,
        studentFeeId: fee.id,
        action: 'delete',
        reason: 'Fee row deleted from principal-student-fees.',
        beforeSnapshot,
        afterSnapshot: { deleted: true },
        metadata: {
          delete_action: 'manual_fee_delete',
        },
        actorId: profile.id,
        actorRole: profile.role || null,
        sourceScreen: 'principal-student-fees',
      });

      if (!auditResult.ok) {
        throw new Error(auditResult.error || 'audit_log_failed');
      }

      await assertSupabase()
        .from('student_fees')
        .delete()
        .eq('id', fee.id)
        .throwOnError();

      showAlert('Fee Deleted', 'Fee row removed successfully.', 'success');
      await refreshMutationState(student);
    } catch (error: any) {
      console.error('[StudentFees] handleDeleteFee failed', { feeId: fee.id, error });
      showAlert('Delete Failed', getSupabaseErrorMessage(error, 'Failed to delete fee row.'), 'error');
    } finally {
      setSaving(false);
      setProcessingFeeId(null);
      setProcessingFeeAction(null);
    }
  }, [canDeleteFees, deny, organizationId, processingFeeId, profile?.id, profile?.role, refreshMutationState, showAlert, student]);

  const prefillRegistrationFeeForClass = useCallback(async (classId: string) => {
    setLoadingSuggestedFee(true);
    try {
      await prefillFee(classId, classes, organizationId, studentRef, setClassRegistrationFee, setClassFeeHint);
    } finally { setLoadingSuggestedFee(false); }
  }, [classes, organizationId, studentRef]);

  // ── Computed ──────────────────────────────────────────────
  const parsedFee = Number.parseFloat(classRegistrationFee);
  const hasValidFee = !Number.isNaN(parsedFee) && parsedFee >= 0;
  const currentFee = Number(student?.registration_fee_amount || 0);
  const hasClassChange = Boolean(newClassId) && newClassId !== student?.class_id;
  const hasFeeChange = hasValidFee && Math.abs(parsedFee - currentFee) >= 0.01;
  const canSubmitClassCorrection = Boolean(newClassId) && hasValidFee && (hasClassChange || hasFeeChange) && !saving && !loadingSuggestedFee;

  return {
    canManageFees, canManageStudentProfile, canDeleteFees,
    saving, recomputingBalances, deactivatingStudent, syncingTuitionFees, updatingRegistrationStatus, processingRegistrationReceipt, processingFeeId, processingFeeAction, modalType, setModalType, selectedFee, setSelectedFee,
    showEnrollmentPicker, setShowEnrollmentPicker,
    waiveAmount, setWaiveAmount, waiveReason, setWaiveReason, waiveType, setWaiveType,
    adjustAmount, setAdjustAmount, adjustReason, setAdjustReason,
    newClassId, setNewClassId, classRegistrationFee, setClassRegistrationFee,
    classFeeHint, setClassFeeHint, loadingSuggestedFee, canSubmitClassCorrection,
    handleWaiveFee, handleAdjustFee, handleChangeClass, handleUpdateEnrollmentDate, handleDeactivateStudent,
    handleMarkPaid, handleMarkUnpaid, handleDeleteFee, handleUpdateFeeDueDate, handleReceiptAction, handleRegistrationReceiptAction, handleSyncTuitionFeesToClass, handleSetRegistrationPaidStatus, prefillRegistrationFeeForClass,
    handleRecomputeLearnerBalances,
  };
}
