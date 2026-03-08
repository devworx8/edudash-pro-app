import { notifyRegistrationApproved } from '@/lib/notify';
import { logger } from '@/lib/logger';
import type { Registration } from './types';
import { TAG, autoAssignFees, fetchSchoolName, generateStudentId, linkParentToSchool, linkParentToStudent, type RegistrationSupabase } from './approveRegistration.shared';

type EduSiteRegistrationRow = {
  id: string;
  organization_id: string;
  guardian_email: string;
  guardian_name: string;
  guardian_phone?: string;
  student_first_name: string;
  student_last_name: string;
  student_dob: string;
  student_gender?: string;
  registration_fee_amount?: number;
  registration_fee_paid?: boolean;
  payment_verified?: boolean;
  edudash_student_id?: string;
};

type ExistingParentRow = { id: string; organization_id: string | null; preschool_id: string | null };
type ExistingStudentRow = { id: string; student_id?: string };

export async function approveEduSite(
  supabase: RegistrationSupabase,
  registration: Registration,
  reviewerId: string | undefined,
  enrollmentDate: string,
) {
  const { data, error } = await supabase
    .from('registration_requests')
    .select('*')
    .eq('id', registration.id)
    .single();
  if (error) throw error;

  const regData = data as EduSiteRegistrationRow;
  let parentId: string | null = null;
  const { data: existingParent } = await supabase
    .from('profiles')
    .select('id, organization_id, preschool_id')
    .eq('email', regData.guardian_email)
    .maybeSingle();
  const parent = existingParent as ExistingParentRow | null;
  if (parent) {
    parentId = parent.id;
    const needsOrgUpdate = !parent.organization_id ||
      parent.organization_id !== regData.organization_id ||
      parent.preschool_id !== regData.organization_id;
    if (needsOrgUpdate) {
      try {
        await linkParentToSchool(supabase, parentId, regData.organization_id);
      } catch (linkError) {
        logger.warn(TAG, 'Parent linkage RPC warning', linkError);
      }
    }
  }

  let resolvedStudentId: string | null = null;
  let studentIdCode = '';
  let studentJustCreated = false;
  if (regData.edudash_student_id) {
    const { data: existingById } = await supabase
      .from('students')
      .select('id, student_id')
      .eq('id', regData.edudash_student_id)
      .maybeSingle();
    const student = existingById as ExistingStudentRow | null;
    if (student?.id) {
      resolvedStudentId = student.id;
      studentIdCode = student.student_id || '';
    }
  }

  if (!resolvedStudentId) {
    const firstName = regData.student_first_name?.trim() || regData.student_first_name;
    const lastName = regData.student_last_name?.trim() || regData.student_last_name;
    if (firstName && lastName) {
      const { data: existingByName } = await supabase
        .from('students')
        .select('id, student_id')
        .eq('preschool_id', regData.organization_id)
        .eq('first_name', firstName)
        .eq('last_name', lastName)
        .maybeSingle();
      const student = existingByName as ExistingStudentRow | null;
      if (student?.id) {
        resolvedStudentId = student.id;
        studentIdCode = student.student_id || '';
      }
    }
  }

  if (!resolvedStudentId) {
    studentJustCreated = true;
    studentIdCode = await generateStudentId(supabase, regData.organization_id);
    const { data: newStudent, error: studentError } = await supabase
      .from('students')
      .insert({
        student_id: studentIdCode,
        first_name: regData.student_first_name?.trim() || regData.student_first_name,
        last_name: regData.student_last_name?.trim() || regData.student_last_name,
        date_of_birth: regData.student_dob,
        gender: regData.student_gender,
        enrollment_date: enrollmentDate,
        parent_id: parentId,
        guardian_id: parentId,
        registration_fee_amount: regData.registration_fee_amount || 0,
        registration_fee_paid: regData.registration_fee_paid || false,
        payment_verified: regData.payment_verified || false,
        preschool_id: regData.organization_id,
        is_active: true,
        status: 'active',
        emergency_contact_name: regData.guardian_name,
        emergency_contact_phone: regData.guardian_phone,
      })
      .select('id')
      .single();
    if (studentError) throw studentError;
    resolvedStudentId = newStudent.id;
  }

  if (parentId) {
    try {
      await linkParentToStudent(supabase, parentId, resolvedStudentId);
    } catch (linkError) {
      logger.warn(TAG, 'Failed to link parent to student', linkError);
    }
  }
  if (studentJustCreated) {
    try {
      await autoAssignFees(supabase, regData.organization_id, resolvedStudentId, regData.student_dob, enrollmentDate);
    } catch (feeError) {
      logger.warn(TAG, 'Failed to auto-assign fees', feeError);
    }
  }

  const { error: updateError } = await supabase
    .from('registration_requests')
    .update({
      status: 'approved',
      reviewed_by: reviewerId,
      reviewed_date: new Date().toISOString(),
      edudash_student_id: resolvedStudentId,
      edudash_parent_id: parentId,
    })
    .eq('id', registration.id);
  if (updateError) throw updateError;

  try {
    const { error: syncError, data: syncData } = await supabase.functions.invoke(
      'sync-registration-to-edudash',
      { body: { registration_id: registration.id } },
    );
    const syncResponse = syncData as { error?: string } | null;
    if (syncError || syncResponse?.error) {
      logger.warn(TAG, 'sync-registration-to-edudash warning', syncError?.message || syncResponse?.error);
    }
  } catch (syncInvokeError) {
    logger.warn(TAG, 'sync-registration-to-edudash failed', syncInvokeError);
  }

  try {
    const childName = `${registration.student_first_name} ${registration.student_last_name}`.trim();
    const schoolName = await fetchSchoolName(
      supabase,
      registration.organization_id,
      registration.organization_name || 'your school',
    );
    if (registration.guardian_email) {
      await notifyRegistrationApproved({
        parentId,
        guardianEmail: registration.guardian_email,
        guardianName: registration.guardian_name,
        childName,
        schoolName,
        registrationId: registration.id,
        studentId: resolvedStudentId,
        preschoolId: registration.organization_id,
      });
    }
  } catch (notifyError) {
    logger.warn(TAG, 'Failed to send approval notification', notifyError);
  }

  return { studentIdCode, parentId };
}
