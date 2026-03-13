/**
 * Approval logic for EduSite (website) registrations.
 *
 * Creates / links student, finds or links parent, assigns fees,
 * syncs with EduDash, and sends notification.
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

interface ApproveEdusiteResult {
  studentId: string | null;
  studentIdCode: string;
  studentCreated: boolean;
  parentId: string | null;
  parentCreated: boolean;
  parentLinked: boolean | null;
}

export async function approveEdusiteRegistration(
  registration: Registration,
  enrollmentDate: string,
  userId: string | undefined,
): Promise<ApproveEdusiteResult> {
  const supabase = assertSupabase();

  const { data: regData, error: regFetchError } = await supabase
    .from('registration_requests')
    .select('*')
    .eq('id', registration.id)
    .single();
  if (regFetchError) throw regFetchError;

  // --- Find or link parent ---
  let parentId: string | null = null;
  let parentLinked: boolean | null = null;
  let parentCreated = false;

  const candidateEmails = [regData.guardian_email, regData.parent_email]
    .map((email: string | undefined) => email?.trim().toLowerCase())
    .filter((email: string | undefined): email is string => !!email);
  const uniqueEmails = Array.from(new Set(candidateEmails));

  let existingParent: { id: string; organization_id?: string | null; preschool_id?: string | null } | null = null;

  for (const email of uniqueEmails) {
    const { data } = await supabase
      .from('profiles')
      .select('id, organization_id, preschool_id')
      .ilike('email', email)
      .maybeSingle();
    if (data?.id) {
      existingParent = data as typeof existingParent;
      break;
    }
  }

  if (existingParent) {
    parentId = existingParent.id;
    const needsOrgUpdate =
      !existingParent.organization_id ||
      existingParent.organization_id !== regData.organization_id ||
      existingParent.preschool_id !== regData.organization_id;

    if (needsOrgUpdate) {
      logger.info('Registrations', `Linking parent ${parentId} to school ${regData.organization_id}`);
      try {
        const { data: linkedProfile, error: linkErr } = await supabase.rpc('link_profile_to_school', {
          p_target_profile_id: parentId,
          p_school_id: regData.organization_id,
          p_role: 'parent',
        });
        if (!linkErr && linkedProfile) {
          const profileRow = linkedProfile as { organization_id?: string | null; preschool_id?: string | null };
          parentLinked =
            profileRow.organization_id === regData.organization_id &&
            profileRow.preschool_id === regData.organization_id;
        } else {
          parentLinked = false;
        }
      } catch (linkErr) {
        logger.warn('Registrations', 'Parent linkage RPC warning', linkErr);
        parentLinked = false;
      }
    } else {
      parentLinked = true;
    }
  }

  // --- Find or create student ---
  let studentId: string | null = null;
  let studentIdCode = '';
  let studentCreated = false;

  if (regData.edudash_student_id) {
    const { data: existingById } = await supabase
      .from('students')
      .select('id, student_id')
      .eq('id', regData.edudash_student_id)
      .maybeSingle();
    if (existingById?.id) {
      studentId = existingById.id;
      studentIdCode = existingById.student_id || '';
    }
  }

  if (!studentId) {
    const { data: existingStudent } = await supabase
      .from('students')
      .select('id, student_id')
      .eq('preschool_id', regData.organization_id)
      .eq('first_name', regData.student_first_name?.trim() || regData.student_first_name)
      .eq('last_name', regData.student_last_name?.trim() || regData.student_last_name)
      .maybeSingle();
    if (existingStudent?.id) {
      studentId = existingStudent.id;
      studentIdCode = existingStudent.student_id || '';
    }
  }

  if (!studentId) {
    const { data: org, error: orgError } = await supabase
      .from('preschools')
      .select('name')
      .eq('id', regData.organization_id)
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
          first_name: regData.student_first_name?.trim() || regData.student_first_name,
          last_name: regData.student_last_name?.trim() || regData.student_last_name,
          date_of_birth: regData.student_dob,
          gender: regData.student_gender,
          enrollment_date: enrollmentDate,
          parent_id: parentId,
          guardian_id: parentId,
          preschool_id: regData.organization_id,
          is_active: true,
          status: 'active',
          emergency_contact_name: regData.guardian_name,
          emergency_contact_phone: regData.guardian_phone,
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

  // Link parent to student if existing
  if (!studentCreated && studentId && parentId) {
    await supabase
      .from('students')
      .update({ parent_id: parentId, guardian_id: parentId })
      .eq('id', studentId);
  }

  // Auto-assign tuition fees
  try {
    const { data: feeStructures } = await supabase
      .from('fee_structures')
      .select('id, amount, fee_type, name, description, grade_levels, effective_from, created_at')
      .eq('preschool_id', regData.organization_id)
      .eq('is_active', true)
      .order('effective_from', { ascending: false })
      .order('created_at', { ascending: false });

    const tuitionFees = (feeStructures || []).filter((fee: FeeStructureRow) =>
      isTuitionFee(fee.fee_type, fee.name, fee.description),
    );

    const selectedFee = selectFeeStructureForChild(tuitionFees as FeeStructureRow[], {
      dateOfBirth: regData.student_dob || regData.student_date_of_birth,
      enrollmentDate,
    });

    if (selectedFee && studentCreated && studentId) {
      const startDate = new Date(enrollmentDate);
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
    }
  } catch (feeErr) {
    logger.warn('Registrations', 'Failed to auto-assign fees', feeErr);
  }

  // Update registration record
  const { error: updateError } = await supabase
    .from('registration_requests')
    .update({
      status: 'approved',
      reviewed_by: userId,
      reviewed_date: new Date().toISOString(),
      edudash_student_id: studentId,
      edudash_parent_id: parentId,
    })
    .eq('id', registration.id);
  if (updateError) throw updateError;

  // Sync registration to EduDash (best effort)
  try {
    const { error: syncError, data: syncData } = await supabase.functions.invoke(
      'sync-registration-to-edudash',
      { body: { registration_id: registration.id } },
    );
    const syncResponse = syncData as {
      error?: string;
      data?: { parent_profile_linked?: boolean };
    } | null;
    if (syncError || syncResponse?.error) {
      logger.warn('Registrations', 'sync-registration-to-edudash warning', {
        err: syncError?.message || syncResponse?.error,
      });
    } else if (typeof syncResponse?.data?.parent_profile_linked === 'boolean') {
      parentLinked = syncResponse.data.parent_profile_linked;
    }
  } catch (syncErr) {
    logger.warn('Registrations', 'sync-registration-to-edudash failed', syncErr);
  }

  // Re-check parent after sync
  if (!parentId) {
    const { data: syncReg } = await supabase
      .from('registration_requests')
      .select('edudash_parent_id')
      .eq('id', registration.id)
      .maybeSingle();
    if (syncReg?.edudash_parent_id) {
      parentId = syncReg.edudash_parent_id;
      parentCreated = true;
    }
  }

  if (parentId && studentId) {
    await supabase
      .from('students')
      .update({ parent_id: parentId, guardian_id: parentId })
      .eq('id', studentId);
  }

  // Send notification
  if (parentId) {
    try {
      await supabase.functions.invoke('notifications-dispatcher', {
        body: {
          event_type: 'child_registration_approved',
          user_ids: [parentId],
          registration_id: registration.id,
          student_id: studentId,
          child_name: `${registration.student_first_name} ${registration.student_last_name}`,
        },
      });
    } catch (notifErr) {
      logger.warn('Registrations', 'Failed to send approval notification', notifErr);
    }
  }

  return { studentId, studentIdCode, studentCreated, parentId, parentCreated, parentLinked };
}
