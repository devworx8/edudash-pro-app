import type { PostgrestError } from '@supabase/supabase-js';
import { notifyRegistrationApproved } from '@/lib/notify';
import { logger } from '@/lib/logger';
import type { Registration } from './types';
import {
  TAG,
  autoAssignFees,
  fetchSchoolName,
  generateStudentId,
  linkParentToSchool,
  linkParentToStudent,
  type RegistrationSupabase,
} from './approveRegistration.shared';

type InAppRegistrationRow = {
  parent: { email?: string } | Array<{ email?: string }> | null;
  preschool_id: string;
  child_first_name?: string;
  child_last_name?: string;
  child_birth_date: string;
  child_gender?: string;
  medical_info?: string;
  dietary_requirements?: string;
  special_needs?: string;
  notes?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  parent_id?: string;
  registration_fee_amount?: number;
  registration_fee_paid?: boolean;
  payment_verified?: boolean;
  student_id?: string;
};

export async function approveInApp(
  supabase: RegistrationSupabase,
  registration: Registration,
  reviewerId: string | undefined,
  enrollmentDate: string,
) {
  const { data, error } = await supabase
    .from('child_registration_requests')
    .select('*, parent:profiles!parent_id(id, first_name, last_name, email)')
    .eq('id', registration.id)
    .single();
  if (error) throw error;

  const regData = data as InAppRegistrationRow;
  let studentIdCode = await generateStudentId(supabase, regData.preschool_id);
  const [orgCode = 'STU', year = new Date().getFullYear().toString().slice(-2)] = studentIdCode.split('-');

  const studentPayload = {
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
    registration_fee_amount: regData.registration_fee_amount || 0,
    registration_fee_paid: regData.registration_fee_paid || false,
    payment_verified: regData.payment_verified || false,
    preschool_id: regData.preschool_id,
    is_active: true,
    status: 'active',
  };

  let newStudent: { id: string } | null = null;
  let studentError: PostgrestError | null = null;
  let studentJustCreated = false;

  if (regData.student_id) {
    const { data: existingById } = await supabase
      .from('students')
      .select('id')
      .eq('id', regData.student_id)
      .maybeSingle();
    if (existingById?.id) newStudent = { id: existingById.id };
  }

  if (!newStudent && studentPayload.first_name && studentPayload.last_name && studentPayload.date_of_birth) {
    const { data: existingByName } = await supabase
      .from('students')
      .select('id')
      .eq('preschool_id', regData.preschool_id)
      .eq('first_name', studentPayload.first_name)
      .eq('last_name', studentPayload.last_name)
      .eq('date_of_birth', studentPayload.date_of_birth)
      .maybeSingle();
    if (existingByName?.id) newStudent = { id: existingByName.id };
  }

  if (!newStudent) studentJustCreated = true;
  for (let attempt = 0; attempt < 3 && !newStudent; attempt += 1) {
    const { data: createdStudent, error: createError } = await supabase
      .from('students')
      .insert({ student_id: studentIdCode, ...studentPayload })
      .select('id')
      .single();

    if (!createError && createdStudent) {
      newStudent = { id: createdStudent.id };
      break;
    }
    studentError = createError;
    const isConflict = createError?.code === '23505' || createError?.message?.toLowerCase()?.includes('duplicate');
    if (!isConflict) break;

    if (studentPayload.first_name && studentPayload.last_name && studentPayload.date_of_birth) {
      const { data: existingByName } = await supabase
        .from('students')
        .select('id')
        .eq('preschool_id', regData.preschool_id)
        .eq('first_name', studentPayload.first_name)
        .eq('last_name', studentPayload.last_name)
        .eq('date_of_birth', studentPayload.date_of_birth)
        .maybeSingle();
      if (existingByName?.id) {
        newStudent = { id: existingByName.id };
        break;
      }
    }

    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    studentIdCode = `${orgCode}-${year}-${suffix}`;
  }
  if (!newStudent) throw studentError ?? new Error('Failed to create student record');

  if (regData.parent_id) {
    try {
      await linkParentToStudent(supabase, regData.parent_id, newStudent.id);
    } catch (linkError) {
      logger.warn(TAG, 'Failed to link parent to student', linkError);
    }
  }
  if (studentJustCreated) {
    try {
      await autoAssignFees(supabase, regData.preschool_id, newStudent.id, regData.child_birth_date, enrollmentDate);
    } catch (feeError) {
      logger.warn(TAG, 'Failed to auto-assign fees (non-critical)', feeError);
    }
  }
  if (regData.parent_id) {
    try {
      await linkParentToSchool(supabase, regData.parent_id, regData.preschool_id);
    } catch (linkError) {
      logger.warn(TAG, 'Parent linkage RPC warning', linkError);
    }
  }

  const { error: updateError } = await supabase
    .from('child_registration_requests')
    .update({
      status: 'approved',
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      student_id: newStudent.id,
    })
    .eq('id', registration.id);
  if (updateError) throw updateError;

  try {
    const childName = `${registration.student_first_name} ${registration.student_last_name}`.trim();
    const parentData = Array.isArray(regData.parent) ? regData.parent[0] : regData.parent;
    const guardianEmail = parentData?.email || registration.guardian_email;
    const schoolName = await fetchSchoolName(supabase, regData.preschool_id, 'your school');
    if (guardianEmail) {
      await notifyRegistrationApproved({
        parentId: regData.parent_id,
        guardianEmail,
        guardianName: registration.guardian_name,
        childName,
        schoolName,
        registrationId: registration.id,
        studentId: newStudent.id,
        preschoolId: regData.preschool_id,
      });
    }
  } catch (notifyError) {
    logger.warn(TAG, 'Failed to send approval notification', notifyError);
  }

  return { studentIdCode };
}
