/**
 * Approval logic for in-app registrations.
 *
 * Creates / links student, assigns fees, links parent, sends notification.
 */

import { assertSupabase } from '@/lib/supabase';
import { getDateOnlyISO, getMonthStartISO } from '@/lib/utils/dateUtils';
import { selectFeeStructureForChild } from '@/lib/utils/feeStructureSelector';
import { isTuitionFee } from '@/lib/utils/feeUtils';
import { logger } from '@/lib/logger';

import type { Registration, FeeStructureRow } from './types';
import {
  getStudentIdPrefix,
  getLastStudentSequence,
  isDuplicateStudentIdError,
  STUDENT_ID_SEQUENCE_LENGTH,
  STUDENT_ID_MAX_ATTEMPTS,
} from './helpers';
import type { PostgrestErrorLike } from './types';

interface ApproveInAppResult {
  studentId: string | null;
  studentIdCode: string;
  studentCreated: boolean;
  parentId: string | null;
}

export async function approveInAppRegistration(
  registration: Registration,
  enrollmentDate: string,
  userId: string | undefined,
): Promise<ApproveInAppResult> {
  const supabase = assertSupabase();

  // Fetch the full registration data with parent info
  const { data: regData, error: regError } = await supabase
    .from('child_registration_requests')
    .select('*, parent:profiles!parent_id(id, first_name, last_name)')
    .eq('id', registration.id)
    .single();

  if (regError) throw regError;

  let studentId: string | null = null;
  let studentIdCode = '';
  let studentCreated = false;

  // Check if student already exists by ID reference
  if (regData.student_id) {
    const { data: existingById } = await supabase
      .from('students')
      .select('id, student_id')
      .eq('id', regData.student_id)
      .maybeSingle();
    if (existingById?.id) {
      studentId = existingById.id;
      studentIdCode = existingById.student_id || '';
    }
  }

  // Check by name match
  if (!studentId) {
    const { data: existingStudent } = await supabase
      .from('students')
      .select('id, student_id')
      .eq('preschool_id', regData.preschool_id)
      .eq('parent_id', regData.parent_id)
      .eq('first_name', regData.child_first_name?.trim() || regData.child_first_name)
      .eq('last_name', regData.child_last_name?.trim() || regData.child_last_name)
      .maybeSingle();

    if (existingStudent?.id) {
      studentId = existingStudent.id;
      studentIdCode = existingStudent.student_id || '';
    }
  }

  // Create student if not found
  if (!studentId) {
    const { data: org, error: orgError } = await supabase
      .from('preschools')
      .select('name')
      .eq('id', regData.preschool_id)
      .maybeSingle();

    if (orgError) {
      logger.warn('Registrations', 'Failed to load school for student ID', orgError);
    }

    const prefix = getStudentIdPrefix(org?.name);
    const lastSequence = await getLastStudentSequence(supabase, prefix);
    let studentError: PostgrestErrorLike | null = null;

    for (let attempt = 1; attempt <= STUDENT_ID_MAX_ATTEMPTS; attempt += 1) {
      const candidateId = `${prefix}${String(lastSequence + attempt).padStart(STUDENT_ID_SEQUENCE_LENGTH, '0')}`;

      const { data: createdStudent, error } = await supabase
        .from('students')
        .insert({
          student_id: candidateId,
          first_name: regData.child_first_name?.trim() || regData.child_first_name,
          last_name: regData.child_last_name?.trim() || regData.child_last_name,
          date_of_birth: regData.child_birth_date,
          gender: regData.child_gender,
          enrollment_date: enrollmentDate,
          medical_conditions: regData.medical_info,
          allergies: regData.dietary_requirements,
          notes: regData.special_needs ? `Special needs: ${regData.special_needs}` : regData.notes,
          emergency_contact_name: regData.emergency_contact_name,
          emergency_contact_phone: regData.emergency_contact_phone,
          parent_id: regData.parent_id,
          guardian_id: regData.parent_id,
          preschool_id: regData.preschool_id,
          is_active: true,
          status: 'active',
        })
        .select('id')
        .single();

      if (!error) {
        studentId = createdStudent?.id ?? null;
        studentIdCode = candidateId;
        studentCreated = true;
        studentError = null;
        break;
      }

      const typedError = error as PostgrestErrorLike | null;
      if (!isDuplicateStudentIdError(typedError)) {
        studentError = typedError;
        break;
      }
    }

    if (studentError || !studentId) {
      throw studentError || new Error('Failed to create student');
    }
  }

  // Link parent
  if (!studentCreated && studentId && regData.parent_id) {
    await supabase
      .from('students')
      .update({ parent_id: regData.parent_id, guardian_id: regData.parent_id })
      .eq('id', studentId);
  }

  // Auto-assign tuition fees
  await autoAssignTuitionFees(supabase, regData.preschool_id, studentId, studentCreated, {
    dateOfBirth: regData.child_birth_date,
    enrollmentDate,
  });

  // Link parent to school via RPC
  if (regData.parent_id) {
    try {
      await supabase.rpc('link_profile_to_school', {
        p_target_profile_id: regData.parent_id,
        p_school_id: regData.preschool_id,
        p_role: 'parent',
      });
    } catch (linkErr) {
      logger.warn('Registrations', 'Parent linkage RPC warning', linkErr);
    }
  }

  // Update registration status
  const childRequestUpdate: Record<string, unknown> = {
    status: 'approved',
    reviewed_by: userId,
    reviewed_at: new Date().toISOString(),
  };
  if (typeof regData === 'object' && regData && 'student_id' in regData) {
    childRequestUpdate.student_id = studentId;
  }

  const { error: updateError } = await supabase
    .from('child_registration_requests')
    .update(childRequestUpdate)
    .eq('id', registration.id);
  if (updateError) throw updateError;

  // Notify parent
  if (regData.parent_id) {
    try {
      await supabase.functions.invoke('notifications-dispatcher', {
        body: {
          event_type: 'child_registration_approved',
          user_ids: [regData.parent_id],
          parent_id: regData.parent_id,
          registration_id: registration.id,
          preschool_id: regData.preschool_id,
          student_id: studentId,
          child_name: `${registration.student_first_name} ${registration.student_last_name}`,
        },
      });
    } catch (notifErr) {
      logger.warn('Registrations', 'Failed to send approval notification', notifErr);
    }
  }

  return {
    studentId,
    studentIdCode,
    studentCreated,
    parentId: regData.parent_id || null,
  };
}

// ---------------------------------------------------------------------------
// Internal helper — auto-assign tuition fees
// ---------------------------------------------------------------------------

async function autoAssignTuitionFees(
  supabase: ReturnType<typeof assertSupabase>,
  preschoolId: string,
  studentId: string | null,
  studentCreated: boolean,
  child: { dateOfBirth?: string; enrollmentDate: string },
): Promise<void> {
  try {
    const { data: feeStructures, error: feeError } = await supabase
      .from('fee_structures')
      .select('id, amount, fee_type, name, description, grade_levels, effective_from, created_at')
      .eq('preschool_id', preschoolId)
      .eq('is_active', true)
      .order('effective_from', { ascending: false })
      .order('created_at', { ascending: false });

    if (feeError) {
      logger.warn('Registrations', 'Failed to load tuition fee structure', feeError);
      return;
    }

    const tuitionFees = (feeStructures || []).filter((fee: FeeStructureRow) =>
      isTuitionFee(fee.fee_type, fee.name, fee.description),
    );

    const selectedFee = selectFeeStructureForChild(tuitionFees as FeeStructureRow[], {
      dateOfBirth: child.dateOfBirth,
      enrollmentDate: child.enrollmentDate,
    });

    if (selectedFee && studentCreated && studentId) {
      const startDate = new Date(child.enrollmentDate);
      const startMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      const nextMonth = new Date(startMonth.getFullYear(), startMonth.getMonth() + 1, 1);

      const feesToInsert = [startMonth, nextMonth].map((date) => ({
        student_id: studentId,
        fee_structure_id: selectedFee.id,
        amount: selectedFee.amount,
        final_amount: selectedFee.amount,
        due_date: getDateOnlyISO(date),
        billing_month: getMonthStartISO(date),
        category_code: 'tuition',
        status: 'pending',
        amount_outstanding: selectedFee.amount,
      }));

      await supabase.from('student_fees').insert(feesToInsert);
      logger.info('Registrations', 'Auto-assigned monthly fees for new student');
    }
  } catch (feeErr) {
    logger.warn('Registrations', 'Failed to auto-assign fees (non-critical)', feeErr);
  }
}
