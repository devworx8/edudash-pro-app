/**
 * Business logic helpers for student-detail screen.
 * Extracted to keep screen under 500 non-SS lines.
 */

import { assertSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import {
  StudentDetail,
  StudentFee,
  Class,
  Transaction,
  calculateAge,
} from '@/components/student-detail';
import {
  getStudentFeeMonthInfo,
  shouldExcludeStudentFeeFromMonthScopedViews,
} from '@/lib/utils/studentFeeMonth';

const TAG = 'StudentDetail';

const STUDENT_FEE_STATUS_PRIORITY: Record<string, number> = {
  paid: 0,
  partially_paid: 1,
  partial: 1,
  waived: 2,
  pending_verification: 3,
  pending: 4,
  overdue: 5,
};

function normalizeStudentFeeStatus(status: string | null | undefined): StudentFee['status'] {
  if (status === 'partially_paid') return 'partial';
  if (status === 'paid' || status === 'pending' || status === 'overdue' || status === 'waived') {
    return status;
  }
  return 'pending';
}

function shouldReplaceStudentFeeRow(nextFee: StudentFee, currentFee: StudentFee): boolean {
  const nextPriority = STUDENT_FEE_STATUS_PRIORITY[nextFee.status] ?? 99;
  const currentPriority = STUDENT_FEE_STATUS_PRIORITY[currentFee.status] ?? 99;
  if (nextPriority !== currentPriority) return nextPriority < currentPriority;
  if (nextFee.amount_paid !== currentFee.amount_paid) return nextFee.amount_paid > currentFee.amount_paid;
  if (nextFee.amount_outstanding !== currentFee.amount_outstanding) {
    return nextFee.amount_outstanding < currentFee.amount_outstanding;
  }
  return nextFee.id > currentFee.id;
}

interface FetchStudentParams {
  studentId: string;
  userId: string;
  profileId?: string;
  preschoolId?: string;
  organizationId?: string;
  isParent: boolean;
  canAssignClass: boolean;
  canViewFinancial: boolean;
  profileRole?: string;
}

interface FetchStudentResult {
  student: StudentDetail;
  classes: Class[];
  transactions: Transaction[];
}

export type StudentChangeRequestStatus = 'pending' | 'approved' | 'rejected';

export interface StudentChangeRequest {
  id: string;
  student_id: string;
  school_id: string;
  requested_by: string;
  status: StudentChangeRequestStatus;
  requested_changes: Record<string, string | null>;
  request_note?: string | null;
  review_note?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  updated_at: string;
}

function isStudentChangeRequestsUnavailableError(error: any): boolean {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  const details = String(error?.details || '').toLowerCase();
  const hint = String(error?.hint || '').toLowerCase();
  const combined = `${message} ${details} ${hint}`;

  if (code === 'PGRST205' || code === 'PGRST204' || code === '42P01' || code === '42703') {
    return true;
  }

  if (code === '42501' || code === 'PGRST301') {
    return true;
  }

  return (
    combined.includes('student_change_requests') &&
    (combined.includes('schema cache') ||
      combined.includes('does not exist') ||
      combined.includes('not found') ||
      combined.includes('permission denied'))
  );
}

const ALLOWED_STUDENT_CHANGE_FIELDS = [
  'first_name',
  'last_name',
  'gender',
  'date_of_birth',
  'home_address',
  'home_phone',
  'medical_conditions',
  'allergies',
  'medication',
  'emergency_contact_name',
  'emergency_contact_phone',
  'emergency_contact_relation',
] as const;

function sanitizeRequestedStudentChanges(
  input: Record<string, unknown>,
): Record<string, string | null> {
  return ALLOWED_STUDENT_CHANGE_FIELDS.reduce<Record<string, string | null>>((acc, key) => {
    if (!(key in input)) return acc;
    const value = input[key];
    if (value == null) {
      acc[key] = null;
      return acc;
    }
    const normalized = String(value).trim();
    acc[key] = normalized.length > 0 ? normalized : null;
    return acc;
  }, {});
}

function toStudentChangeRequestRecord(row: any): StudentChangeRequest {
  return {
    id: String(row.id),
    student_id: String(row.student_id),
    school_id: String(row.school_id),
    requested_by: String(row.requested_by),
    status: (row.status || 'pending') as StudentChangeRequestStatus,
    requested_changes: sanitizeRequestedStudentChanges((row.requested_changes || {}) as Record<string, unknown>),
    request_note: row.request_note || null,
    review_note: row.review_note || null,
    reviewed_by: row.reviewed_by || null,
    reviewed_at: row.reviewed_at || null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

/** Fetch all student data, class list, and transactions in one call. */
export async function fetchStudentData(params: FetchStudentParams): Promise<FetchStudentResult> {
  const { studentId, userId, profileId, isParent, canAssignClass, canViewFinancial, profileRole } = params;
  const supabase = assertSupabase();

  // Get user's preschool by auth_user_id (NOT profiles.id!)
  const { data: userProfile, error: profileError } = await supabase
    .from('profiles')
    .select('id, preschool_id, organization_id, role')
    .or(`auth_user_id.eq.${userId},id.eq.${userId}`)
    .maybeSingle();

  if (profileError) {
    logger.error(TAG, 'Error loading profile:', profileError);
  }

  const schoolId =
    userProfile?.preschool_id ||
    userProfile?.organization_id ||
    params.preschoolId ||
    params.organizationId;

  if (!schoolId) {
    throw new Error('No school assigned to your account');
  }

  const viewerProfileId = userProfile?.id || profileId || userId;

  // Get student details with class info
  let studentQuery = supabase
    .from('students')
    .select('*, classes!students_class_id_fkey(id, name, grade_level, teacher_id)')
    .eq('id', studentId);

  // Parent safeguard: only allow viewing linked children
  if (isParent) {
    const parentFilterIds = Array.from(new Set([viewerProfileId, userId].filter(Boolean)));
    if (parentFilterIds.length > 0) {
      const parentFilters = parentFilterIds.flatMap((id) => [`parent_id.eq.${id}`, `guardian_id.eq.${id}`]);
      studentQuery = studentQuery.or(parentFilters.join(','));
    }
  } else {
    studentQuery = studentQuery.or(`preschool_id.eq.${schoolId},organization_id.eq.${schoolId}`);
  }

  const { data: studentData, error: studentError } = await studentQuery.single();

  if (studentError || !studentData) {
    const msg = isParent
      ? 'You can only view your linked child profiles.'
      : 'Student not found';
    throw new Error(msg);
  }

  // Fetch teacher info if class has teacher
  let teacherName: string | undefined;
  if (studentData.classes?.teacher_id) {
    const { data: teacherData } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .or(`id.eq.${studentData.classes.teacher_id},auth_user_id.eq.${studentData.classes.teacher_id}`)
      .single();
    if (teacherData) {
      teacherName = `${teacherData.first_name || ''} ${teacherData.last_name || ''}`.trim();
    }
  }

  // Fetch parent/guardian contact info
  const contactIds = Array.from(new Set([studentData.parent_id, studentData.guardian_id].filter(Boolean)));
  const contactMap: Record<string, { name?: string; email?: string; phone?: string }> = {};

  if (contactIds.length > 0) {
    const { data: contactProfilesById } = await supabase
      .from('profiles')
      .select('id, auth_user_id, first_name, last_name, email, phone')
      .in('id', contactIds);

    (contactProfilesById || []).forEach((cp) => {
      const normalized = {
        name: `${cp.first_name || ''} ${cp.last_name || ''}`.trim(),
        email: cp.email || undefined,
        phone: cp.phone || undefined,
      };
      contactMap[cp.id] = normalized;
      if (cp.auth_user_id) contactMap[cp.auth_user_id] = normalized;
    });

    const unresolvedIds = contactIds.filter((id) => !contactMap[id]);
    if (unresolvedIds.length > 0) {
      const { data: contactProfilesByAuth } = await supabase
        .from('profiles')
        .select('id, auth_user_id, first_name, last_name, email, phone')
        .in('auth_user_id', unresolvedIds);

      (contactProfilesByAuth || []).forEach((cp) => {
        const normalized = {
          name: `${cp.first_name || ''} ${cp.last_name || ''}`.trim(),
          email: cp.email || undefined,
          phone: cp.phone || undefined,
        };
        contactMap[cp.id] = normalized;
        if (cp.auth_user_id) contactMap[cp.auth_user_id] = normalized;
      });
    }
  }

  const parentInfo = studentData.parent_id ? contactMap[studentData.parent_id] || {} : {};
  const guardianInfo = studentData.guardian_id ? contactMap[studentData.guardian_id] || {} : {};

  // Fetch age group info
  let ageGroupName: string | undefined;
  if (studentData.age_group_id) {
    const { data: ageGroupData } = await supabase
      .from('age_groups')
      .select('name')
      .eq('id', studentData.age_group_id)
      .single();
    ageGroupName = ageGroupData?.name;
  }

  // Calculate age
  const ageInfo = calculateAge(studentData.date_of_birth);

  // Attendance data (last 30 days)
  const { data: attendanceData } = await supabase
    .from('attendance')
    .select('status, attendance_date')
    .eq('student_id', studentId)
    .gte('attendance_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
    .order('attendance_date', { ascending: false });

  const totalRecords = attendanceData?.length || 0;
  const presentRecords = attendanceData?.filter((a) => a.status === 'present').length || 0;
  const attendanceRate = totalRecords > 0 ? (presentRecords / totalRecords) * 100 : 0;
  const lastAttendance = attendanceData?.[0]?.attendance_date;

  // Financial data
  let outstandingFees = 0;
  let transactions: Transaction[] = [];
  let studentFees: StudentFee[] = [];
  let feeTierName: string | undefined;
  let monthlyFeeAmount: number | undefined;
  let feeStructureId: string | undefined;

  if (canViewFinancial || isParent) {
    // Detailed fees with fee structure info
    const { data: feeData, error: feeError } = await supabase
      .from('student_fees')
      .select(
        'id, fee_structure_id, amount, final_amount, amount_paid, amount_outstanding, status, billing_month, due_date, category_code, created_at, updated_at, fee_structures(name)',
      )
      .eq('student_id', studentId)
      .order('billing_month', { ascending: false });

    if (feeError) {
      logger.error(TAG, 'Error loading student fees:', feeError);
    }

    const normalizedTuitionFees = new Map<string, StudentFee>();
    const otherFeesList: StudentFee[] = [];

    for (const feeRow of feeData || []) {
      const monthInfo = getStudentFeeMonthInfo(feeRow);
      const feeStructureData = Array.isArray(feeRow.fee_structures)
        ? feeRow.fee_structures[0]
        : feeRow.fee_structures;
      const normalizedFee: StudentFee = {
        id: feeRow.id,
        fee_structure_id: feeRow.fee_structure_id,
        fee_name: feeStructureData?.name || 'Monthly Fee',
        amount: feeRow.amount ?? 0,
        final_amount: feeRow.final_amount ?? feeRow.amount ?? 0,
        amount_paid: feeRow.amount_paid ?? 0,
        amount_outstanding: feeRow.amount_outstanding ?? 0,
        status: normalizeStudentFeeStatus(feeRow.status),
        billing_month: monthInfo.effectiveMonthIso || feeRow.billing_month || feeRow.due_date || '',
        due_date: feeRow.due_date || feeRow.billing_month || '',
        category_code: feeRow.category_code || 'tuition',
      };

      if (normalizedFee.category_code !== 'tuition') {
        otherFeesList.push(normalizedFee);
        continue;
      }

      if (shouldExcludeStudentFeeFromMonthScopedViews(feeRow, studentData.enrollment_date)) {
        continue;
      }

      const tuitionMonthKey = monthInfo.effectiveMonthIso || normalizedFee.billing_month || normalizedFee.id;
      const existingFee = normalizedTuitionFees.get(tuitionMonthKey);
      if (!existingFee || shouldReplaceStudentFeeRow(normalizedFee, existingFee)) {
        normalizedTuitionFees.set(tuitionMonthKey, normalizedFee);
      }
    }

    const tuitionFees = Array.from(normalizedTuitionFees.values()).sort((a, b) =>
      String(b.billing_month || '').localeCompare(String(a.billing_month || '')),
    );

    studentFees = [...tuitionFees, ...otherFeesList];

    outstandingFees = studentFees.reduce((sum, fee) => sum + (fee.amount_outstanding ?? 0), 0);

    // Get current fee tier from most recent tuition fee
    const latestTuition = studentFees.find(f => f.category_code === 'tuition');
    if (latestTuition) {
      feeTierName = latestTuition.fee_name;
      monthlyFeeAmount = latestTuition.amount;
      feeStructureId = latestTuition.fee_structure_id;
    }

    if (canViewFinancial) {
      const { data: txData } = await supabase
        .from('financial_transactions')
        .select('*')
        .eq('student_id', studentId)
        .eq('preschool_id', schoolId)
        .order('created_at', { ascending: false })
        .limit(10);

      transactions = txData || [];
    }
  }

  // Build processed student
  const student: StudentDetail = {
    ...studentData,
    age_months: ageInfo.months,
    age_years: ageInfo.years,
    status: studentData.status || (studentData.is_active ? 'active' : 'inactive') || 'active',
    class_name: studentData.classes?.name,
    teacher_name: teacherName,
    parent_name: parentInfo.name,
    parent_email: parentInfo.email,
    parent_phone: parentInfo.phone,
    guardian_name: guardianInfo.name,
    guardian_email: guardianInfo.email,
    guardian_phone: guardianInfo.phone,
    profile_photo: studentData.avatar_url || studentData.profile_photo,
    age_group_name: ageGroupName,
    fee_tier_name: feeTierName,
    monthly_fee_amount: monthlyFeeAmount,
    fee_structure_id: feeStructureId,
    student_fees: studentFees,
    attendance_rate: attendanceRate,
    last_attendance: lastAttendance,
    outstanding_fees: outstandingFees,
    payment_status: outstandingFees > 0 ? 'overdue' : 'current',
  };

  // Load available classes for assignment
  let classes: Class[] = [];
  if (canAssignClass || ['principal', 'principal_admin', 'admin'].includes(userProfile?.role || profileRole || '')) {
    const { data: classesData } = await supabase
      .from('classes')
      .select('id, name, grade_level, teacher_id, max_capacity')
      .or(`preschool_id.eq.${schoolId},organization_id.eq.${schoolId}`)
      .eq('active', true);

    const teacherIds = [...new Set((classesData || []).map((c) => c.teacher_id).filter(Boolean))];
    let teacherMap: Record<string, string> = {};

    if (teacherIds.length > 0) {
      const { data: teachersData } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', teacherIds);

      teacherMap = (teachersData || []).reduce((acc, t) => {
        acc[t.id] = `${t.first_name} ${t.last_name}`;
        return acc;
      }, {} as Record<string, string>);
    }

    const { data: enrollmentData } = await supabase
      .from('students')
      .select('class_id')
      .eq('preschool_id', schoolId)
      .eq('is_active', true);

    const enrollmentMap = (enrollmentData || []).reduce((acc, s) => {
      if (s.class_id) acc[s.class_id] = (acc[s.class_id] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    classes = (classesData || []).map((cls) => ({
      id: cls.id,
      name: cls.name,
      grade_level: cls.grade_level,
      teacher_id: cls.teacher_id || null,
      teacher_name: cls.teacher_id ? teacherMap[cls.teacher_id] : undefined,
      capacity: cls.max_capacity || 25,
      current_enrollment: enrollmentMap[cls.id] || 0,
    }));
  }

  return { student, classes, transactions };
}

/** Record a manual payment for a student (Principal only). */
export async function markPaymentReceived(
  studentId: string,
  userId: string,
  amount: number,
  paymentMethod: string,
  notes: string,
): Promise<void> {
  const supabase = assertSupabase();

  const { data: userProfile } = await supabase
    .from('profiles')
    .select('preschool_id, organization_id')
    .eq('auth_user_id', userId)
    .single();

  const schoolId = userProfile?.preschool_id || userProfile?.organization_id;
  if (!schoolId) throw new Error('No school assigned');

  const { error: txError } = await supabase
    .from('financial_transactions')
    .insert({
      student_id: studentId,
      preschool_id: schoolId,
      type: 'fee_payment',
      amount,
      status: 'completed',
      payment_method: paymentMethod,
      description: notes
        ? `Manual payment recorded by principal: ${notes}`
        : 'Manual payment recorded by principal',
      created_by: userId,
      created_at: new Date().toISOString(),
    });

  if (txError) {
    logger.error(TAG, 'Error recording payment:', txError);
    throw txError;
  }

  // Update pending parent_payments for this student
  await supabase
    .from('parent_payments')
    .update({
      status: 'verified',
      verified_by: userId,
      verified_at: new Date().toISOString(),
      notes: `Marked as paid by principal (${paymentMethod}): ${notes || 'No additional notes'}`,
    })
    .eq('student_id', studentId)
    .eq('status', 'pending');
}

export async function listStudentChangeRequests(params: {
  studentId: string;
  userId: string;
  isPrincipal: boolean;
}): Promise<StudentChangeRequest[]> {
  const { studentId, userId, isPrincipal } = params;
  const supabase = assertSupabase();

  let query = supabase
    .from('student_change_requests' as any)
    .select('id, student_id, school_id, requested_by, status, requested_changes, request_note, review_note, reviewed_by, reviewed_at, created_at, updated_at')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (!isPrincipal) {
    query = query.eq('requested_by', userId);
  }

  const { data, error } = await query;
  if (error) {
    if (isStudentChangeRequestsUnavailableError(error)) {
      logger.warn(TAG, 'student_change_requests unavailable; returning empty list:', {
        code: error.code,
        message: error.message,
      });
      return [];
    }
    logger.error(TAG, 'Error listing student change requests:', error);
    throw new Error('Failed to load change requests');
  }

  return (data || []).map(toStudentChangeRequestRecord);
}

export async function submitStudentChangeRequest(params: {
  studentId: string;
  schoolId: string;
  requestedBy: string;
  requestedChanges: Record<string, unknown>;
  requestNote?: string | null;
}): Promise<void> {
  const supabase = assertSupabase();
  const payloadChanges = sanitizeRequestedStudentChanges(params.requestedChanges);

  const hasRequestedFields = Object.keys(payloadChanges).length > 0;
  const note = (params.requestNote || '').trim();
  if (!hasRequestedFields && !note) {
    throw new Error('Please add at least one field change or a note.');
  }

  const { error } = await supabase
    .from('student_change_requests' as any)
    .insert({
      student_id: params.studentId,
      school_id: params.schoolId,
      requested_by: params.requestedBy,
      status: 'pending',
      requested_changes: payloadChanges,
      request_note: note || null,
    });

  if (error) {
    if (isStudentChangeRequestsUnavailableError(error)) {
      throw new Error('Profile change requests are not available yet on this school setup.');
    }
    if (String(error.code) === '23505') {
      throw new Error('You already have a pending change request for this student.');
    }
    logger.error(TAG, 'Error submitting student change request:', error);
    throw new Error(error.message || 'Could not submit change request');
  }
}

export async function reviewStudentChangeRequest(params: {
  requestId: string;
  reviewerId: string;
  decision: 'approved' | 'rejected';
  reviewNote?: string | null;
}): Promise<void> {
  const supabase = assertSupabase();

  const { data: requestRow, error: requestError } = await supabase
    .from('student_change_requests' as any)
    .select('id, student_id, status, requested_changes')
    .eq('id', params.requestId)
    .single();

  if (requestError || !requestRow) {
    if (isStudentChangeRequestsUnavailableError(requestError)) {
      throw new Error('Profile change requests are not available yet on this school setup.');
    }
    logger.error(TAG, 'Error loading student change request for review:', requestError);
    throw new Error('Could not load the selected request');
  }

  if (requestRow.status !== 'pending') {
    throw new Error('This request has already been reviewed.');
  }

  if (params.decision === 'approved') {
    const updates = sanitizeRequestedStudentChanges((requestRow.requested_changes || {}) as Record<string, unknown>);
    if (Object.keys(updates).length > 0) {
      const { error: updateStudentError } = await supabase
        .from('students')
        .update(updates)
        .eq('id', requestRow.student_id);

      if (updateStudentError) {
        logger.error(TAG, 'Error applying approved student changes:', updateStudentError);
        throw new Error(updateStudentError.message || 'Failed to apply changes to student profile');
      }
    }
  }

  const reviewNote = (params.reviewNote || '').trim();
  const { error: reviewError } = await supabase
    .from('student_change_requests' as any)
    .update({
      status: params.decision,
      review_note: reviewNote || null,
      reviewed_by: params.reviewerId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', params.requestId);

  if (reviewError) {
    if (isStudentChangeRequestsUnavailableError(reviewError)) {
      throw new Error('Profile change requests are not available yet on this school setup.');
    }
    logger.error(TAG, 'Error updating student change request review:', reviewError);
    throw new Error(reviewError.message || 'Failed to update request status');
  }
}
