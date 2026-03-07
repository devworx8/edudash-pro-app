/**
 * usePrincipalFinancials Hook
 * 
 * Comprehensive financial data for principal dashboard
 * Aggregates registration fees, school fees, payments, and expenses
 */

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

// Type definitions for database records
interface RegistrationRecord {
  id: string;
  registration_fee_amount: string | number | null;
  registration_fee_paid: boolean | null;
  payment_verified: boolean | null;
  status: string | null;
  created_at: string | null;
}

interface StudentFeeRecord {
  id: string;
  student_id: string | null;
  amount: number | null;
  status: string | null;
  fee_type: string | null;
  due_date: string | null;
  paid_date: string | null;
  students: {
    id: string;
    preschool_id: string | null;
    organization_id: string | null;
    is_active: boolean | null;
    status: string | null;
    enrollment_date: string | null;
    registration_fee_paid: boolean | null;
    payment_verified: boolean | null;
  } | null;
}

interface PaymentRecord {
  id?: string;
  amount: number | null;
  status?: string | null;
  created_at?: string | null;
}

interface POPPaymentRecord {
  payment_amount: number | null;
  status: string | null;
  description: string | null;
}

interface ExpenseRecord {
  id?: string;
  amount: number | null;
  type?: string | null;
  status?: string | null;
  created_at?: string | null;
}

export interface PrincipalFinancials {
  // Registration fees
  registrationFeesCollected: number;
  pendingRegistrationFees: number;
  registrationFeeCount: number;
  
  // Monthly school fees
  monthlyFeesCollected: number;
  outstandingSchoolFees: number;
  overdueFeesCount: number;
  excludedInactiveStudents: number;
  excludedFutureEnrollmentStudents: number;
  excludedUnverifiedStudents: number;
  
  // General payments
  paymentsThisMonth: number;
  pendingPOPReviews: number;
  
  // Expenses
  expensesThisMonth: number;
  
  // Calculated
  totalRevenueThisMonth: number;
  netIncomeThisMonth: number;
  collectionRate: number;
  
  // Breakdowns
  feeTypeBreakdown: {
    type: string;
    collected: number;
    outstanding: number;
  }[];
  
  // Trends
  monthlyTrend: {
    month: string;
    revenue: number;
    expenses: number;
  }[];
}

export interface UsePrincipalFinancialsReturn {
  data: PrincipalFinancials | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

type ReceivableEligibility = 'eligible' | 'inactive' | 'future_enrollment' | 'unverified_registration';

function parseDateValue(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function isStudentActiveForReceivables(student: StudentFeeRecord['students']): boolean {
  if (!student) return false;
  if (student.is_active !== true) return false;
  const status = String(student.status || '').toLowerCase().trim();
  return status === 'active';
}

function getReceivableEligibility(
  student: StudentFeeRecord['students'],
  monthStart: Date,
  nextMonthStart: Date,
): ReceivableEligibility {
  if (!isStudentActiveForReceivables(student)) return 'inactive';

  const enrollmentDate = parseDateValue(student?.enrollment_date || null);
  if (enrollmentDate && enrollmentDate >= nextMonthStart) {
    return 'future_enrollment';
  }

  const hasRegistrationFlags =
    (student?.payment_verified !== null && student?.payment_verified !== undefined) ||
    (student?.registration_fee_paid !== null && student?.registration_fee_paid !== undefined);
  const registrationVerified =
    Boolean(student?.payment_verified) || Boolean(student?.registration_fee_paid);
  const isNewEnrollmentWindow = Boolean(enrollmentDate && enrollmentDate >= monthStart);

  if (hasRegistrationFlags && !registrationVerified && isNewEnrollmentWindow) {
    return 'unverified_registration';
  }

  return 'eligible';
}

export function usePrincipalFinancials(schoolId: string | undefined): UsePrincipalFinancialsReturn {
  const [data, setData] = useState<PrincipalFinancials | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const fetchFinancials = useCallback(async () => {
    if (!schoolId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const currentDate = new Date();
      const monthStartDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const nextMonthStartDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
      const monthEndDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      const monthStart = monthStartDate.toISOString();
      const monthEnd = monthEndDate.toISOString();

      // 1. Registration fees from registration_requests
      const { data: registrations } = await supabase
        .from('registration_requests')
        .select('id, registration_fee_amount, registration_fee_paid, payment_verified, status, created_at')
        .eq('organization_id', schoolId);

      const registrationRecords = (registrations || []) as RegistrationRecord[];
      
      const paidRegistrations = registrationRecords.filter((r: RegistrationRecord) => 
        r.payment_verified && r.status === 'approved'
      );
      const pendingRegistrations = registrationRecords.filter((r: RegistrationRecord) => 
        !r.payment_verified && r.registration_fee_amount && r.status !== 'rejected'
      );

      const registrationFeesCollected = paidRegistrations.reduce(
        (sum: number, r: RegistrationRecord) => sum + (parseFloat(String(r.registration_fee_amount)) || 0), 0
      );
      const pendingRegistrationFees = pendingRegistrations.reduce(
        (sum: number, r: RegistrationRecord) => sum + (parseFloat(String(r.registration_fee_amount)) || 0), 0
      );

      // 2. Student fees from student_fees table
      const studentFeeSelect = `
        id, student_id, amount, status, fee_type, due_date, paid_date,
        students!inner(id, preschool_id, organization_id, is_active, status, enrollment_date, registration_fee_paid, payment_verified)
      `;

      let feeRecords: StudentFeeRecord[] = [];
      const scopedFeesQuery = await supabase
        .from('student_fees')
        .select(studentFeeSelect)
        .or(`preschool_id.eq.${schoolId},organization_id.eq.${schoolId}`, { foreignTable: 'students' });

      if (scopedFeesQuery.error) {
        const legacyFeesQuery = await supabase
          .from('student_fees')
          .select(studentFeeSelect)
          .eq('students.preschool_id', schoolId);
        if (legacyFeesQuery.error) {
          throw legacyFeesQuery.error;
        }
        feeRecords = (legacyFeesQuery.data || []) as StudentFeeRecord[];
      } else {
        feeRecords = (scopedFeesQuery.data || []) as StudentFeeRecord[];
      }

      const paidFees = feeRecords.filter((f: StudentFeeRecord) => f.status === 'paid');
      const excludedInactiveStudents = new Set<string>();
      const excludedFutureEnrollmentStudents = new Set<string>();
      const excludedUnverifiedStudents = new Set<string>();
      const eligibleOutstandingFees = feeRecords.filter((f: StudentFeeRecord) => {
        const status = String(f.status || '').toLowerCase();
        if (status !== 'pending' && status !== 'overdue') return false;
        const studentData = Array.isArray(f.students) ? (f.students as any)[0] : f.students;
        const studentId = String(f.student_id || studentData?.id || '').trim();
        const eligibility = getReceivableEligibility(studentData, monthStartDate, nextMonthStartDate);
        if (eligibility !== 'eligible') {
          if (studentId) {
            if (eligibility === 'inactive') excludedInactiveStudents.add(studentId);
            if (eligibility === 'future_enrollment') excludedFutureEnrollmentStudents.add(studentId);
            if (eligibility === 'unverified_registration') excludedUnverifiedStudents.add(studentId);
          }
          return false;
        }
        return true;
      });
      const overdueFees = eligibleOutstandingFees.filter((f: StudentFeeRecord) => String(f.status || '').toLowerCase() === 'overdue');

      // Calculate monthly fees (paid this month)
      const monthlyFeesCollected = paidFees
        .filter((f: StudentFeeRecord) => {
          if (!f.paid_date) return false;
          const paidDate = new Date(f.paid_date);
          return paidDate >= new Date(monthStart) && paidDate <= new Date(monthEnd);
        })
        .reduce((sum: number, f: StudentFeeRecord) => sum + (f.amount || 0), 0);

      const outstandingSchoolFees = eligibleOutstandingFees.reduce((sum: number, f: StudentFeeRecord) => sum + (f.amount || 0), 0);

      // 3. General payments this month
      const { data: payments } = await supabase
        .from('payments')
        .select('id, amount, status, created_at')
        .eq('preschool_id', schoolId)
        .in('status', ['completed', 'approved'])
        .gte('created_at', monthStart)
        .lte('created_at', monthEnd);

      const paymentRecords = (payments || []) as PaymentRecord[];
      const paymentsThisMonth = paymentRecords.reduce((sum: number, p: PaymentRecord) => sum + (p.amount || 0), 0);

      // 4. POP uploads pending review
      const { count: pendingPOPReviews } = await supabase
        .from('pop_uploads')
        .select('*', { count: 'exact', head: true })
        .eq('preschool_id', schoolId)
        .eq('status', 'pending');

      const { data: uniformPOPs } = await supabase
        .from('pop_uploads')
        .select('payment_amount, status, description')
        .eq('preschool_id', schoolId)
        .eq('upload_type', 'proof_of_payment')
        .ilike('description', '%uniform%');

      const uniformRecords = (uniformPOPs || []) as POPPaymentRecord[];
      const uniformCollected = uniformRecords
        .filter((pop) => pop.status === 'approved')
        .reduce((sum, pop) => sum + (Number(pop.payment_amount) || 0), 0);
      const uniformOutstanding = uniformRecords
        .filter((pop) => pop.status === 'pending' || pop.status === 'needs_revision')
        .reduce((sum, pop) => sum + (Number(pop.payment_amount) || 0), 0);

      // 5. Expenses from petty cash
      const { data: expenses } = await supabase
        .from('petty_cash_transactions')
        .select('id, amount, type, status, created_at')
        .eq('school_id', schoolId)
        .eq('type', 'expense')
        .in('status', ['approved', 'completed'])
        .gte('created_at', monthStart)
        .lte('created_at', monthEnd);

      const expenseRecords = (expenses || []) as ExpenseRecord[];
      const expensesThisMonth = expenseRecords.reduce((sum: number, e: ExpenseRecord) => sum + Math.abs(e.amount || 0), 0);

      // 6. Fee type breakdown
      const scopedFeeRecords = feeRecords.filter((f: StudentFeeRecord) => {
        const status = String(f.status || '').toLowerCase();
        if (status === 'paid') return true;
        if (status !== 'pending' && status !== 'overdue') return false;
        const studentData = Array.isArray(f.students) ? (f.students as any)[0] : f.students;
        return getReceivableEligibility(studentData, monthStartDate, nextMonthStartDate) === 'eligible';
      });
      const feeTypeBreakdown = calculateFeeTypeBreakdown(scopedFeeRecords);
      if (uniformCollected > 0 || uniformOutstanding > 0) {
        const existingUniform = feeTypeBreakdown.find((entry) => entry.type.toLowerCase() === 'uniform');
        if (existingUniform) {
          existingUniform.collected = Math.max(existingUniform.collected, uniformCollected);
          existingUniform.outstanding = Math.max(existingUniform.outstanding, uniformOutstanding);
        } else {
          feeTypeBreakdown.push({
            type: 'Uniform',
            collected: uniformCollected,
            outstanding: uniformOutstanding,
          });
        }
      }

      // 7. Monthly trend (last 6 months)
      const monthlyTrend = await fetchMonthlyTrend(supabase, schoolId);

      // Calculate totals
      const totalRevenueThisMonth = registrationFeesCollected + monthlyFeesCollected + paymentsThisMonth;
      const netIncomeThisMonth = totalRevenueThisMonth - expensesThisMonth;
      const totalExpected = totalRevenueThisMonth + pendingRegistrationFees + outstandingSchoolFees;
      const collectionRate = totalExpected > 0 ? (totalRevenueThisMonth / totalExpected) * 100 : 0;

      setData({
        registrationFeesCollected,
        pendingRegistrationFees,
        registrationFeeCount: paidRegistrations.length,
        monthlyFeesCollected,
        outstandingSchoolFees,
        overdueFeesCount: overdueFees.length,
        excludedInactiveStudents: excludedInactiveStudents.size,
        excludedFutureEnrollmentStudents: excludedFutureEnrollmentStudents.size,
        excludedUnverifiedStudents: excludedUnverifiedStudents.size,
        paymentsThisMonth,
        pendingPOPReviews: pendingPOPReviews || 0,
        expensesThisMonth,
        totalRevenueThisMonth,
        netIncomeThisMonth,
        collectionRate,
        feeTypeBreakdown,
        monthlyTrend,
      });
    } catch (err: unknown) {
      console.error('Error fetching principal financials:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [schoolId, supabase]);

  useEffect(() => {
    fetchFinancials();
  }, [fetchFinancials]);

  return {
    data,
    loading,
    error,
    refresh: fetchFinancials,
  };
}

function calculateFeeTypeBreakdown(fees: StudentFeeRecord[]): PrincipalFinancials['feeTypeBreakdown'] {
  const breakdown: Record<string, { collected: number; outstanding: number }> = {};

  fees.forEach((fee: StudentFeeRecord) => {
    const type = fee.fee_type || 'other';
    if (!breakdown[type]) {
      breakdown[type] = { collected: 0, outstanding: 0 };
    }

    if (fee.status === 'paid') {
      breakdown[type].collected += fee.amount || 0;
    } else if (fee.status === 'pending' || fee.status === 'overdue') {
      breakdown[type].outstanding += fee.amount || 0;
    }
  });

  return Object.entries(breakdown).map(([type, data]) => ({
    type: formatFeeType(type),
    collected: data.collected,
    outstanding: data.outstanding,
  }));
}

function formatFeeType(type: string): string {
  const labels: Record<string, string> = {
    registration: 'Registration',
    tuition: 'Tuition',
    monthly_tuition: 'Monthly Tuition',
    materials: 'Materials',
    transport: 'Transport',
    meals: 'Meals',
    activities: 'Activities',
    uniform: 'Uniform',
    other: 'Other',
  };
  return labels[type] || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

async function fetchMonthlyTrend(
  supabase: ReturnType<typeof createClient>,
  schoolId: string
): Promise<PrincipalFinancials['monthlyTrend']> {
  const trend: PrincipalFinancials['monthlyTrend'] = [];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  for (let i = 5; i >= 0; i--) {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const month = date.getMonth();
    const year = date.getFullYear();
    const monthStart = new Date(year, month, 1).toISOString();
    const monthEnd = new Date(year, month + 1, 0).toISOString();

    // Get revenue
    const { data: payments } = await supabase
      .from('payments')
      .select('amount')
      .eq('preschool_id', schoolId)
      .in('status', ['completed', 'approved'])
      .gte('created_at', monthStart)
      .lte('created_at', monthEnd);

    const paymentRecords = (payments || []) as PaymentRecord[];
    const revenue = paymentRecords.reduce((sum: number, p: PaymentRecord) => sum + (p.amount || 0), 0);

    // Get expenses
    const { data: expenses } = await supabase
      .from('petty_cash_transactions')
      .select('amount')
      .eq('school_id', schoolId)
      .eq('type', 'expense')
      .in('status', ['approved', 'completed'])
      .gte('created_at', monthStart)
      .lte('created_at', monthEnd);

    const expenseRecords = (expenses || []) as ExpenseRecord[];
    const expenseTotal = expenseRecords.reduce((sum: number, e: ExpenseRecord) => sum + Math.abs(e.amount || 0), 0);

    trend.push({
      month: `${monthNames[month]} ${year}`,
      revenue,
      expenses: expenseTotal,
    });
  }

  return trend;
}
