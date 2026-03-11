/**
 * Principal Hub — Stats & Counts Fetcher
 *
 * Executes the main batch of Supabase queries for student, class,
 * application, attendance, capacity, registration, and approval counts.
 * Returns raw numeric data for the orchestrator to assemble.
 */
import { logger } from '@/lib/logger';
import { assertSupabase } from '@/lib/supabase';
import { isTuitionFee } from '@/lib/utils/feeUtils';
import { FinancialDataService } from '@/services/FinancialDataService';
import type { RegistrationFeeRow } from './types';

export interface StatsRawResult {
  studentsCount: number;
  teachersData: any[];
  classesCount: number;
  applicationsCount: number;
  approvedCount: number;
  rejectedCount: number;
  waitlistedCount: number;
  attendanceRate: number;
  preschoolCapacity: any;
  schoolName: string;
  pendingReportsCount: number;
  pendingRegistrationsCount: number;
  pendingPaymentsCount: number;
  pendingPaymentsAmount: number;
  pendingPaymentsOverdueAmount: number;
  pendingPOPUploadsCount: number;
  pendingActivityApprovalsCount: number;
  pendingHomeworkApprovalsCount: number;
  registrationFeesCollected: number;
  pendingRegistrationPayments: number;
  combinedPendingPayments: number;
  expectedTuitionIncome: number;
  collectedTuitionAmount: number;
}

export async function fetchStatsAndCounts(
  preschoolId: string,
  fallbackSchoolName: string,
): Promise<StatsRawResult> {
  const supabase = assertSupabase();

  // Helper: wrap each query so it never rejects (Hermes lacks Promise.allSettled).
  // Supabase query builders are thenables — use .then() which they do support.
  const safe = <T>(p: PromiseLike<T> | T): Promise<T | { count: 0; data: null }> =>
    new Promise((resolve) => {
      Promise.resolve(p).then(
        (val) => resolve(val),
        () => resolve({ count: 0, data: null } as any),
      );
    });

  const [
    studentsResult,
    teachersResult,
    classesResult,
    applicationsResult,
    approvedAppsResult,
    rejectedAppsResult,
    waitlistedAppsResult,
    attendanceResult,
    capacityResult,
    preschoolResult,
    pendingReportsResult,
    pendingRegistrationsResult,
    pendingChildRegistrationsResult,
    pendingPaymentsResult,
    registrationFeesResult,
    childRegistrationFeesResult,
    pendingPOPUploadsResult,
    pendingActivityApprovalsResult,
    pendingHomeworkApprovalsResult,
  ] = await Promise.all([
    safe(
      supabase
        .from('students')
        .select('id', { count: 'exact', head: true })
        .eq('preschool_id', preschoolId)
        .eq('status', 'active')
        .eq('is_active', true)
    ),

    safe(supabase.from('teachers').select(`
      id, user_id, email, first_name, last_name, phone,
      subject_specialization, preschool_id, is_active, created_at
    `).eq('preschool_id', preschoolId).or('is_active.eq.true,is_active.is.null')),

    safe(supabase.from('classes').select('id')
      .eq('preschool_id', preschoolId).or('active.eq.true,active.is.null')),

    safe(supabase.from('enrollment_applications').select('id', { count: 'exact', head: true })
      .eq('preschool_id', preschoolId).in('status', ['pending', 'under_review', 'interview_scheduled'])),
    safe(supabase.from('enrollment_applications').select('id', { count: 'exact', head: true })
      .eq('preschool_id', preschoolId).eq('status', 'approved')),
    safe(supabase.from('enrollment_applications').select('id', { count: 'exact', head: true })
      .eq('preschool_id', preschoolId).eq('status', 'rejected')),
    safe(supabase.from('enrollment_applications').select('id', { count: 'exact', head: true })
      .eq('preschool_id', preschoolId).eq('status', 'waitlisted')),

    safe(supabase.from('attendance').select('status')
      .eq('organization_id', preschoolId)
      .gte('attendance_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .limit(1000)),

    safe(supabase.from('preschools').select('capacity:max_students, name').eq('id', preschoolId).single()),
    safe(supabase.from('preschools').select('name').eq('id', preschoolId).single()),

    safe(supabase.from('progress_reports').select('id', { count: 'exact', head: true })
      .eq('preschool_id', preschoolId).or('approval_status.eq.pending_review,status.eq.pending_review')),

    safe(supabase.from('registration_requests').select('id', { count: 'exact', head: true })
      .eq('organization_id', preschoolId).eq('status', 'pending')),
    safe(supabase.from('child_registration_requests').select('id', { count: 'exact', head: true })
      .eq('preschool_id', preschoolId).eq('status', 'pending')),

    safe(supabase.from('parent_payments').select('id', { count: 'exact', head: true })
      .eq('preschool_id', preschoolId).eq('status', 'pending')),

    safe(supabase.from('registration_requests')
      .select('registration_fee_amount, registration_fee_paid, payment_verified, status')
      .eq('organization_id', preschoolId)),
    safe(supabase.from('child_registration_requests')
      .select('registration_fee_amount, registration_fee_paid, payment_verified, status')
      .eq('preschool_id', preschoolId)),

    safe(supabase.from('pop_uploads').select('id', { count: 'exact', head: true })
      .eq('preschool_id', preschoolId).eq('status', 'pending').eq('upload_type', 'proof_of_payment')),

    safe(supabase.from('interactive_activities').select('id', { count: 'exact', head: true })
      .eq('preschool_id', preschoolId).eq('approval_status', 'pending')),

    safe(supabase.from('homework_assignments').select('id', { count: 'exact', head: true })
      .eq('preschool_id', preschoolId).eq('is_published', false).eq('status', 'draft')),
  ]);

  // Extract counts with safe fallbacks
  const v = (r: any) => r ?? { count: 0, data: null };

  const studentsCount = v(studentsResult).count || 0;
  const teachersData = v(teachersResult).data || [];
  const classesCount = Array.isArray(v(classesResult).data)
    ? v(classesResult).data.length
    : (v(classesResult).count || 0);
  const applicationsCount = v(applicationsResult).count || 0;
  const approvedCount = v(approvedAppsResult).count || 0;
  const rejectedCount = v(rejectedAppsResult).count || 0;
  const waitlistedCount = v(waitlistedAppsResult).count || 0;
  const attendanceData = v(attendanceResult).data || [];
  const preschoolCapacity = v(capacityResult).data || {};
  const preschoolInfo = v(preschoolResult).data || {};
  const pendingReportsCount = v(pendingReportsResult).count || 0;
  const pendingRegistrationsCount =
    (v(pendingRegistrationsResult).count || 0) +
    (v(pendingChildRegistrationsResult).count || 0);
  const legacyPendingPaymentsCount = v(pendingPaymentsResult).count || 0;
  const pendingPOPUploadsCount = v(pendingPOPUploadsResult).count || 0;
  const pendingActivityApprovalsCount = v(pendingActivityApprovalsResult).count || 0;
  const pendingHomeworkApprovalsCount = v(pendingHomeworkApprovalsResult).count || 0;

  // Calculate attendance rate
  let attendanceRate = 0;
  if (attendanceData.length > 0) {
    const presentCount = attendanceData.filter((r: any) => r.status === 'present').length;
    attendanceRate = Math.round((presentCount / attendanceData.length) * 100);
  }

  // Compute registration fees from both request tables
  const regFees: RegistrationFeeRow[] = [
    ...((v(registrationFeesResult).data as RegistrationFeeRow[] | null) || []),
    ...((v(childRegistrationFeesResult).data as RegistrationFeeRow[] | null) || []),
  ];
  let registrationFeesCollected = 0;
  let pendingRegistrationPayments = 0;
  if (regFees.length > 0) {
    const paid = regFees.filter((r) => Boolean(r.payment_verified) && r.status === 'approved');
    const pending = regFees.filter(
      (r) => !r.payment_verified && r.registration_fee_amount && r.status !== 'rejected',
    );
    registrationFeesCollected = paid.reduce((sum, r) => {
      const n = typeof r.registration_fee_amount === 'number'
        ? r.registration_fee_amount
        : parseFloat(r.registration_fee_amount ?? '0');
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);
    pendingRegistrationPayments = pending.length;
  }

  let pendingPaymentsCount = legacyPendingPaymentsCount;
  let pendingPaymentsAmount = 0;
  let pendingPaymentsOverdueAmount = 0;
  let expectedTuitionIncome = 0;
  let collectedTuitionAmount = 0;
  try {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const receivables = await FinancialDataService.getReceivablesSnapshot(preschoolId, currentMonth);
    pendingPaymentsCount = Number(receivables?.summary?.outstanding_students || 0);
    pendingPaymentsAmount = Number(receivables?.summary?.outstanding_amount || 0);
    pendingPaymentsOverdueAmount = Number(receivables?.summary?.overdue_amount || 0);
  } catch (receivablesError: any) {
    logger.info('Using legacy pending payments count fallback', {
      reason: receivablesError?.message || 'Unknown receivables error',
      legacyPendingPaymentsCount,
    });
  }

  try {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    const activeStudentsResult = await safe(
      supabase
        .from('students')
        .select('id')
        .eq('preschool_id', preschoolId)
        .eq('status', 'active')
        .eq('is_active', true)
        .limit(5000)
    );
    const activeStudents = (v(activeStudentsResult).data || []) as Array<{ id: string }>;
    const activeStudentIds = activeStudents.map((student) => student.id).filter(Boolean);

    const [feesResult, structResult] = await Promise.all([
      activeStudentIds.length > 0
        ? safe(
            supabase
              .from('student_fees')
              .select('student_id, final_amount, amount, amount_paid, status')
              .in('student_id', activeStudentIds)
              .eq('billing_month', currentMonth)
              .neq('status', 'waived')
          )
        : Promise.resolve({ data: [] as any[] }),
      safe(supabase
        .from('school_fee_structures')
        .select('amount_cents, fee_category, name, description')
        .eq('preschool_id', preschoolId)
        .eq('is_active', true)
        .limit(50)),
    ]);

    const monthFees = (v(feesResult).data || []) as any[];
    const feeStructures = (v(structResult).data || []) as Array<{
      amount_cents?: number | null;
      fee_category?: string | null;
      name?: string | null;
      description?: string | null;
    }>;
    const tuitionStructure = feeStructures.find((fee) =>
      isTuitionFee(fee.fee_category, fee.name, fee.description),
    );
    const defaultTuition = tuitionStructure
      ? Number(tuitionStructure.amount_cents ? tuitionStructure.amount_cents / 100 : 0)
      : 0;

    const studentsWithFees = new Set(monthFees.map((f: any) => f.student_id));
    const studentsWithoutFees = studentsCount - studentsWithFees.size;

    const feeBasedExpected = monthFees.reduce((sum: number, f: any) => {
      const amt = Number(f.final_amount || f.amount || 0);
      return sum + (Number.isFinite(amt) ? amt : 0);
    }, 0);
    const projectedExpected = studentsWithoutFees > 0 ? studentsWithoutFees * defaultTuition : 0;
    expectedTuitionIncome = feeBasedExpected + projectedExpected;

    collectedTuitionAmount = monthFees
      .filter((f: any) => f.status === 'paid')
      .reduce((sum: number, f: any) => {
        const paid =
          f.amount_paid != null
            ? Number(f.amount_paid)
            : Number(f.final_amount ?? f.amount ?? 0);
        return sum + (Number.isFinite(paid) ? paid : 0);
      }, 0);
  } catch (tuitionError: any) {
    logger.info('Tuition income calculation failed', { reason: tuitionError?.message });
  }

  // "Unpaid fees" widgets must stay fee-ledger scoped (not mixed with registrations/POP queue).
  const combinedPendingPayments = pendingPaymentsCount;

  const schoolName =
    preschoolInfo.name || preschoolCapacity.name || fallbackSchoolName;

  logger.info('📊 Stats batch complete', {
    studentsCount, classesCount, applicationsCount,
    pendingReportsCount, pendingRegistrationsCount, combinedPendingPayments,
  });

  return {
    studentsCount,
    teachersData,
    classesCount,
    applicationsCount,
    approvedCount,
    rejectedCount,
    waitlistedCount,
    attendanceRate,
    preschoolCapacity,
    schoolName,
    pendingReportsCount,
    pendingRegistrationsCount,
    pendingPaymentsCount,
    pendingPaymentsAmount,
    pendingPaymentsOverdueAmount,
    pendingPOPUploadsCount,
    pendingActivityApprovalsCount,
    pendingHomeworkApprovalsCount,
    registrationFeesCollected,
    pendingRegistrationPayments,
    combinedPendingPayments,
    expectedTuitionIncome,
    collectedTuitionAmount,
  };
}
