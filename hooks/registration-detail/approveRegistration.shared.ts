import { assertSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { selectFeeStructureForChild, type FeeStructureCandidate } from '@/lib/utils/feeStructureSelector';
import { isTuitionFee } from '@/lib/utils/feeUtils';

export const TAG = 'RegistrationApprove';
export type RegistrationSupabase = ReturnType<typeof assertSupabase>;

const buildMonthIso = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
};

export async function generateStudentId(
  supabase: RegistrationSupabase,
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

export async function autoAssignFees(
  supabase: RegistrationSupabase,
  orgId: string,
  studentId: string,
  dateOfBirth: string,
  enrollmentDate: string,
) {
  const { data: existingFees } = await supabase
    .from('student_fees')
    .select('id')
    .eq('student_id', studentId)
    .limit(1);
  if (existingFees && existingFees.length > 0) {
    logger.info(TAG, 'Skipping fee assignment - fees already exist for student');
    return;
  }

  const { data: feeStructures, error: feeError } = await supabase
    .from('fee_structures')
    .select('id, amount, fee_type, name, description, grade_levels, effective_from, created_at, age_min_months, age_max_months')
    .eq('preschool_id', orgId)
    .eq('is_active', true)
    .order('effective_from', { ascending: false })
    .order('created_at', { ascending: false });
  if (feeError) logger.warn(TAG, 'Failed to load tuition fee structures', feeError);

  const tuitionFees = (feeStructures || []).filter((fee: any) =>
    isTuitionFee(fee.fee_type, fee.name, fee.description),
  );

  const selectedFee = selectFeeStructureForChild(
    tuitionFees as FeeStructureCandidate[],
    { dateOfBirth, enrollmentDate },
  );
  if (!selectedFee) return;

  const [enrollYear, enrollMonth] = enrollmentDate.split('-').map(Number);
  const firstMonth = new Date(enrollYear, enrollMonth - 1, 1);
  const secondMonth = new Date(enrollYear, enrollMonth, 1);

  const feesToInsert = [firstMonth, secondMonth].map((date) => ({
    student_id: studentId,
    fee_structure_id: selectedFee.id,
    amount: selectedFee.amount,
    final_amount: selectedFee.amount,
    due_date: buildMonthIso(date),
    billing_month: buildMonthIso(date),
    status: 'pending',
    amount_outstanding: selectedFee.amount,
    category_code: 'tuition',
  }));

  await supabase.from('student_fees').insert(feesToInsert);
}

export async function linkParentToStudent(
  supabase: RegistrationSupabase,
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

export async function linkParentToSchool(
  supabase: RegistrationSupabase,
  parentId: string,
  schoolId: string,
) {
  await supabase.rpc('link_profile_to_school', {
    p_target_profile_id: parentId,
    p_school_id: schoolId,
    p_role: 'parent',
  });
}

export async function fetchSchoolName(
  supabase: RegistrationSupabase,
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
