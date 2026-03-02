/** Core approval logic for registration-detail (in-app + EduSite flows) */
import { assertSupabase } from '@/lib/supabase';
import { selectFeeStructureForChild, type FeeStructureCandidate } from '@/lib/utils/feeStructureSelector';
import { isTuitionFee } from '@/lib/utils/feeUtils';
import { notifyRegistrationApproved } from '@/lib/notify';
import { logger } from '@/lib/logger';
import type { Registration, ShowAlert } from './types';
import type { PostgrestError } from '@supabase/supabase-js';

const TAG = 'RegistrationApprove';

// ---------- helpers ---------- //

async function generateStudentId(
  supabase: ReturnType<typeof assertSupabase>,
  orgId: string,
): Promise<string> {
  const year = new Date().getFullYear().toString().slice(-2);
  try {
    const { data: org } = await supabase
      .from('preschools')
      .select('name')
      .eq('id', orgId)
      .single();

    const orgCode = org?.name?.substring(0, 3).toUpperCase() || 'STU';
    const { count } = await supabase
      .from('students')
      .select('id', { count: 'exact', head: true })
      .eq('preschool_id', orgId);

    const nextNum = ((count || 0) + 1).toString().padStart(4, '0');
    return `${orgCode}-${year}-${nextNum}`;
  } catch {
    return `STU-${year}-${Date.now().toString().slice(-4)}`;
  }
}

async function autoAssignFees(
  supabase: ReturnType<typeof assertSupabase>,
  orgId: string,
  studentId: string,
  dob: string,
  enrollmentDate: string,
) {
  const { data: feeStructures, error: feeError } = await supabase
    .from('fee_structures')
    .select('id, amount, fee_type, name, description, grade_levels, effective_from, created_at, age_min_months, age_max_months')
    .eq('preschool_id', orgId)
    .eq('is_active', true)
    .order('effective_from', { ascending: false })
    .order('created_at', { ascending: false });

  if (feeError) {
    logger.warn(TAG, 'Failed to load tuition fee structures', feeError);
  }

  const tuitionFees = (feeStructures || []).filter((fee: any) =>
    isTuitionFee(fee.fee_type, fee.name, fee.description),
  );

  const selectedFee = selectFeeStructureForChild(
    tuitionFees as FeeStructureCandidate[],
    { dateOfBirth: dob, enrollmentDate },
  );

  if (selectedFee) {
    const startDate = new Date(enrollmentDate);
    const startMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const nextMonth = new Date(startMonth.getFullYear(), startMonth.getMonth() + 1, 1);

    const feesToInsert = [startMonth, nextMonth].map(date => ({
      student_id: studentId,
      fee_structure_id: selectedFee.id,
      amount: selectedFee.amount,
      final_amount: selectedFee.amount,
      due_date: date.toISOString().split('T')[0],
      billing_month: date.toISOString().split('T')[0],
      status: 'pending',
      amount_outstanding: selectedFee.amount,
      category_code: 'tuition',
    }));

    await supabase.from('student_fees').insert(feesToInsert);
  }
}

async function linkParentToStudent(
  supabase: ReturnType<typeof assertSupabase>,
  parentId: string,
  studentId: string,
) {
  const { data: existingLink } = await supabase
    .from('student_parent_relationships')
    .select('id')
    .eq('parent_id', parentId)
    .eq('student_id', studentId)
    .maybeSingle();

  if (!existingLink) {
    await supabase.from('student_parent_relationships').insert({
      parent_id: parentId,
      student_id: studentId,
      relationship_type: 'parent',
      is_primary: true,
    });
  }
}

async function linkParentToSchool(
  supabase: ReturnType<typeof assertSupabase>,
  parentId: string,
  schoolId: string,
) {
  await supabase.rpc('link_profile_to_school', {
    p_target_profile_id: parentId,
    p_school_id: schoolId,
    p_role: 'parent',
  });
}

async function fetchSchoolName(
  supabase: ReturnType<typeof assertSupabase>,
  orgId: string,
  fallback: string,
): Promise<string> {
  try {
    const { data: school } = await supabase
      .from('preschools')
      .select('name')
      .eq('id', orgId)
      .single();
    return school?.name || fallback;
  } catch {
    return fallback;
  }
}

// ---------- In-app approve ---------- //

async function approveInApp(
  supabase: ReturnType<typeof assertSupabase>,
  registration: Registration,
  reviewerId: string | undefined,
  enrollmentDate: string,
) {
  const { data: regData, error: regError } = await supabase
    .from('child_registration_requests')
    .select('*, parent:profiles!parent_id(id, first_name, last_name, email)')
    .eq('id', registration.id)
    .single();

  if (regError) throw regError;

  let studentIdCode = await generateStudentId(supabase, regData.preschool_id);
  const orgCode = studentIdCode.split('-')[0];
  const year = studentIdCode.split('-')[1];

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

  // Retry loop for duplicate student_id
  let newStudent: { id: string } | null = null;
  let studentError: PostgrestError | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await supabase
      .from('students')
      .insert({ student_id: studentIdCode, ...studentPayload })
      .select('id')
      .single();

    if (!error && data) { newStudent = { id: data.id }; break; }
    studentError = error;

    const isConflict = error?.code === '23505' || error?.message?.toLowerCase()?.includes('duplicate');
    if (!isConflict) break;

    const canLookup = Boolean(studentPayload.first_name && studentPayload.last_name && studentPayload.date_of_birth);
    if (canLookup) {
      const { data: existing } = await supabase
        .from('students')
        .select('id')
        .eq('preschool_id', regData.preschool_id)
        .eq('first_name', studentPayload.first_name)
        .eq('last_name', studentPayload.last_name)
        .eq('date_of_birth', studentPayload.date_of_birth)
        .maybeSingle();
      if (existing?.id) { newStudent = { id: existing.id }; break; }
    }

    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    studentIdCode = `${orgCode}-${year}-${suffix}`;
  }

  if (!newStudent) throw studentError ?? new Error('Failed to create student record');

  // Link parent
  if (regData.parent_id) {
    try { await linkParentToStudent(supabase, regData.parent_id, newStudent.id); }
    catch (e) { logger.warn(TAG, 'Failed to link parent to student', e); }
  }

  // Auto-assign fees
  try {
    await autoAssignFees(supabase, regData.preschool_id, newStudent.id, regData.child_birth_date, enrollmentDate);
  } catch (e) { logger.warn(TAG, 'Failed to auto-assign fees (non-critical)', e); }

  // Link parent to school
  if (regData.parent_id) {
    try { await linkParentToSchool(supabase, regData.parent_id, regData.preschool_id); }
    catch (e) { logger.warn(TAG, 'Parent linkage RPC warning', e); }
  }

  // Update registration status
  const { error: updateError } = await supabase
    .from('child_registration_requests')
    .update({ status: 'approved', reviewed_by: reviewerId, reviewed_at: new Date().toISOString() })
    .eq('id', registration.id);
  if (updateError) throw updateError;

  // Notify parent
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
  } catch (e) { logger.warn(TAG, 'Failed to send approval notification', e); }

  return { studentIdCode };
}

// ---------- EduSite approve ---------- //

async function approveEduSite(
  supabase: ReturnType<typeof assertSupabase>,
  registration: Registration,
  reviewerId: string | undefined,
  enrollmentDate: string,
) {
  const { data: regData, error: regFetchError } = await supabase
    .from('registration_requests')
    .select('*')
    .eq('id', registration.id)
    .single();
  if (regFetchError) throw regFetchError;

  // Find or link parent
  let parentId: string | null = null;
  const { data: existingParent } = await supabase
    .from('profiles')
    .select('id, organization_id, preschool_id')
    .eq('email', regData.guardian_email)
    .maybeSingle();

  if (existingParent) {
    parentId = existingParent.id;
    const needsOrgUpdate = !existingParent.organization_id ||
      existingParent.organization_id !== regData.organization_id ||
      existingParent.preschool_id !== regData.organization_id;

    if (needsOrgUpdate) {
      try { await linkParentToSchool(supabase, parentId!, regData.organization_id); }
      catch (e) { logger.warn(TAG, 'Parent linkage RPC warning', e); }
    }
  }

  const studentIdCode = await generateStudentId(supabase, regData.organization_id);

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

  // Link parent to student
  if (parentId) {
    try { await linkParentToStudent(supabase, parentId, newStudent.id); }
    catch (e) { logger.warn(TAG, 'Failed to link parent to student', e); }
  }

  // Auto-assign fees
  try {
    await autoAssignFees(supabase, regData.organization_id, newStudent.id, regData.student_dob, enrollmentDate);
  } catch (e) { logger.warn(TAG, 'Failed to auto-assign fees', e); }

  // Update registration status
  const { error: updateError } = await supabase
    .from('registration_requests')
    .update({
      status: 'approved',
      reviewed_by: reviewerId,
      reviewed_date: new Date().toISOString(),
      edudash_student_id: newStudent.id,
      edudash_parent_id: parentId,
    })
    .eq('id', registration.id);
  if (updateError) throw updateError;

  // Sync registration (best effort)
  try {
    const { error: syncError, data: syncData } = await supabase.functions.invoke(
      'sync-registration-to-edudash',
      { body: { registration_id: registration.id } },
    );
    const syncResponse = syncData as { error?: string } | null;
    if (syncError || syncResponse?.error) {
      logger.warn(TAG, 'sync-registration-to-edudash warning', syncError?.message || syncResponse?.error);
    }
  } catch (e) { logger.warn(TAG, 'sync-registration-to-edudash failed', e); }

  // Notify guardian
  try {
    const childName = `${registration.student_first_name} ${registration.student_last_name}`.trim();
    const schoolName = await fetchSchoolName(supabase, registration.organization_id, registration.organization_name || 'your school');

    if (registration.guardian_email) {
      await notifyRegistrationApproved({
        parentId,
        guardianEmail: registration.guardian_email,
        guardianName: registration.guardian_name,
        childName,
        schoolName,
        registrationId: registration.id,
        studentId: newStudent.id,
        preschoolId: registration.organization_id,
      });
    }
  } catch (e) { logger.warn(TAG, 'Failed to send approval notification', e); }

  return { studentIdCode, parentId };
}

// ---------- Public API ---------- //

export async function approveRegistrationCore(
  registration: Registration,
  userId: string | undefined,
  startDateIso: string,
): Promise<{ studentIdCode: string }> {
  const supabase = assertSupabase();
  const enrollmentDate = startDateIso || new Date().toISOString().split('T')[0];

  if (registration.source === 'in-app') {
    return approveInApp(supabase, registration, userId, enrollmentDate);
  }
  return approveEduSite(supabase, registration, userId, enrollmentDate);
}
