/**
 * Principal Hub — Type Definitions
 *
 * Shared interfaces for the principal dashboard data layer.
 */

export interface SchoolStats {
  students: { total: number; trend: string };
  staff: { total: number; trend: string };
  classes: { total: number; trend: string };
  pendingApplications: { total: number; trend: string };
  pendingRegistrations: { total: number; trend: string };
  pendingPayments: { total: number; trend: string; amount?: number; overdueAmount?: number };
  pendingPOPUploads?: { total: number; trend: string };
  monthlyRevenue: { total: number; trend: string };
  attendanceRate: { percentage: number; trend: string };
  registrationFees?: { total: number; trend: string };
  /** Tuition fees expected for the current billing month (billed/pending + paid rows) */
  expectedTuitionIncome?: { total: number; trend: string };
  /** Tuition fees actually collected (paid rows only) for the current billing month */
  collectedTuitionAmount?: { total: number; trend: string };
  parentLinks?: { total: number };
  feeStructures?: { total: number };
  timestamp: string;
}

export interface TeacherSummary {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone?: string;
  subject_specialization?: string;
  hire_date?: string;
  classes_assigned: number;
  students_count: number;
  status: 'excellent' | 'good' | 'needs_attention';
  performance_indicator: string;
}

export interface FinancialSummary {
  monthlyRevenue: number;
  previousMonthRevenue: number;
  estimatedExpenses: number;
  netProfit: number;
  revenueGrowth: number;
  profitMargin: number;
  pettyCashBalance: number;
  pettyCashExpenses: number;
  pendingApprovals: number;
  hasDataError?: boolean;
  dataErrorMessage?: string | null;
  timestamp: string;
}

export interface UniformPaymentSummary {
  totalPaid: number;
  totalOutstanding: number;
  paidCount: number;
  pendingCount: number;
  pendingUploads: number;
  pendingUploadAmount: number;
  totalStudents: number;
  submittedOrders: number;
  noOrderCount: number;
  paidStudentCount: number;
  pendingStudentCount: number;
  unpaidStudentCount: number;
  recentPayments: Array<{
    id: string;
    studentName: string;
    amount: number;
    paidDate: string | null;
    status: string | null;
  }>;
}

export interface CapacityMetrics {
  capacity: number;
  current_enrollment: number;
  available_spots: number;
  utilization_percentage: number;
  enrollment_by_age: {
    toddlers: number;
    preschool: number;
    prekindergarten: number;
  };
  status: 'full' | 'high' | 'available';
  timestamp: string;
}

export interface EnrollmentPipeline {
  pending: number;
  approved: number;
  rejected: number;
  waitlisted: number;
  total: number;
}

export interface ActivitySummary {
  type: 'enrollment' | 'application';
  title: string;
  timestamp: string;
  status?: string;
  icon: string;
}

export interface PrincipalHubData {
  stats: SchoolStats | null;
  teachers: TeacherSummary[] | null;
  financialSummary: FinancialSummary | null;
  enrollmentPipeline: EnrollmentPipeline | null;
  capacityMetrics: CapacityMetrics | null;
  recentActivities: ActivitySummary[] | null;
  pendingReportApprovals: number;
  pendingActivityApprovals: number;
  pendingHomeworkApprovals: number;
  uniformPayments: UniformPaymentSummary | null;
  pendingTeacherApprovals: number;
  schoolId: string | null;
  schoolName: string;
}

export type RegistrationFeeRow = {
  registration_fee_amount: string | number | null;
  registration_fee_paid?: boolean | null;
  payment_verified: boolean | null;
  status: string | null;
};

/**
 * Helper to safely extract pending report count from hub data.
 */
export const getPendingReportCount = (data?: PrincipalHubData | null): number => {
  return data?.pendingReportApprovals ?? 0;
};

/** Default empty state for `PrincipalHubData`. */
export const EMPTY_HUB_DATA: PrincipalHubData = {
  stats: null,
  teachers: null,
  financialSummary: null,
  enrollmentPipeline: null,
  capacityMetrics: null,
  recentActivities: null,
  pendingReportApprovals: 0,
  pendingActivityApprovals: 0,
  pendingHomeworkApprovals: 0,
  uniformPayments: null,
  pendingTeacherApprovals: 0,
  schoolId: null,
  schoolName: '',
};
