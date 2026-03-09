export type FeeCategoryCode =
  | 'tuition'
  | 'registration'
  | 'deposit'
  | 'uniform'
  | 'aftercare'
  | 'transport'
  | 'meal'
  | 'meals'
  | 'activities'
  | 'excursion'
  | 'fundraiser'
  | 'donation_drive'
  | 'books'
  | 'other'
  | 'ad_hoc';

export type FeeStatus =
  | 'pending'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'waived'
  | 'pending_verification';

export interface PaymentAllocationInput {
  student_fee_id: string;
  amount: number;
  notes?: string;
}

export interface ApprovePopPaymentPayload {
  uploadId: string;
  billingMonth: string;
  categoryCode: FeeCategoryCode;
  allocations?: PaymentAllocationInput[];
  notes?: string;
}

export interface ApprovePopPaymentResult {
  paymentId?: string;
  allocatedAmount: number;
  overpaymentAmount: number;
  feeIds: string[];
}

export interface FinanceMonthCategoryRow {
  category_code: FeeCategoryCode;
  due: number;
  collected: number;
  outstanding: number;
}

export interface FinanceMonthSnapshot {
  success: boolean;
  organization_id: string;
  month: string;
  month_locked: boolean;
  due_this_month: number;
  collected_this_month: number;
  collected_allocated_amount?: number;
  collected_source?: 'allocations' | 'fee_ledger';
  kpi_delta?: number;
  still_outstanding: number;
  pending_amount: number;
  overdue_amount: number;
  pending_count: number;
  overdue_count: number;
  pending_students: number;
  overdue_students: number;
  prepaid_for_future_months: number;
  expenses_this_month: number;
  petty_cash_expenses_this_month: number;
  financial_expenses_this_month: number;
  payroll_expenses_this_month?: number;
  operational_expenses_this_month?: number;
  registration_revenue?: number;
  excluded_inactive_due?: number;
  excluded_inactive_outstanding?: number;
  excluded_inactive_students?: number;
  family_credits_available?: number;
  net_after_expenses: number;
  payroll_due: number;
  payroll_paid: number;
  pending_pop_reviews: number;
  categories: FinanceMonthCategoryRow[];
  as_of_date: string;
  generated_at: string;
}

export interface FinanceExpenseEntry {
  id: string;
  source: 'petty_cash' | 'financial_txn';
  date: string;
  amount: number;
  status: string;
  category: string;
  description: string;
  reference?: string | null;
}

export interface FinanceMonthExpenseBreakdown {
  month: string;
  total_expenses: number;
  petty_cash_expenses: number;
  financial_expenses: number;
  entries: FinanceExpenseEntry[];
}

export interface PayrollRosterItem {
  payroll_recipient_id: string;
  role_type: 'teacher' | 'principal';
  display_name: string;
  teacher_id?: string | null;
  profile_id?: string | null;
  active: boolean;
  base_salary: number;
  allowances: number;
  deductions: number;
  net_salary: number;
  salary_effective_from?: string | null;
  paid_this_month: boolean;
  paid_amount_this_month: number;
  last_paid_at?: string | null;
}

export interface PayrollPaymentRecord {
  id: string;
  payroll_recipient_id: string;
  organization_id: string;
  amount: number;
  payment_month: string;
  payment_method: string;
  payment_reference?: string | null;
  notes?: string | null;
  status: 'completed' | 'voided' | 'edited';
  original_amount?: number | null;
  edit_reason?: string | null;
  edited_at?: string | null;
  voided_at?: string | null;
  void_reason?: string | null;
  recorded_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayrollAdvanceRecord {
  id: string;
  payroll_recipient_id: string;
  organization_id: string;
  amount: number;
  advance_date: string;
  reason?: string | null;
  repayment_month?: string | null;
  repaid: boolean;
  repaid_at?: string | null;
  repaid_amount?: number | null;
  recorded_by?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayrollRosterBundle {
  success: boolean;
  organization_id: string;
  month: string;
  items: PayrollRosterItem[];
  generated_at: string;
  fallback_used?: boolean;
}

export interface FinanceReceivablesSummary {
  month: string;
  pending_amount: number;
  overdue_amount: number;
  pending_count: number;
  overdue_count: number;
  pending_students: number;
  overdue_students: number;
  outstanding_students: number;
  outstanding_amount: number;
  excluded_inactive_students?: number;
  excluded_future_enrollment_students?: number;
  excluded_unverified_students?: number;
  /** Total number of students with unpaid fees (before the display cap is applied) */
  students_total_unpaid?: number;
  /** Maximum number of student rows returned in the students array */
  students_display_cap?: number;
}

export interface FinanceReceivableStudentRow {
  student_id: string;
  first_name: string;
  last_name: string;
  class_name?: string | null;
  outstanding_amount: number;
  pending_count: number;
  overdue_count: number;
}

export interface FinancePaymentPurposeRow {
  purpose: string;
  amount: number;
  count: number;
}

export interface FinancePendingPOPRow {
  id: string;
  student_id: string;
  preschool_id: string;
  payment_amount?: number;
  payment_date?: string;
  payment_for_month?: string;
  category_code?: string;
  payment_reference?: string;
  status: string;
  description?: string;
  title: string;
  created_at: string;
  student?: {
    first_name?: string;
    last_name?: string;
  } | null;
}

export type FinanceQueueStage = 'needs_month' | 'ready_to_approve' | 'approved' | 'rejected';

export interface FinanceQueueStageSummary {
  stage: FinanceQueueStage;
  count: number;
  amount: number;
}

export type FinanceStudentFeesRouteSource = 'receivables' | 'direct';

export interface FinanceControlCenterBundle {
  month: string;
  snapshot: FinanceMonthSnapshot | null;
  receivables: {
    summary: FinanceReceivablesSummary;
    students: FinanceReceivableStudentRow[];
  } | null;
  expenses: FinanceMonthExpenseBreakdown | null;
  payment_breakdown: {
    month: string;
    total_collected: number;
    categories: Array<{
      category_code: string;
      amount: number;
      count: number;
    }>;
    methods: Array<{
      payment_method: string;
      amount: number;
      count: number;
    }>;
    purposes: FinancePaymentPurposeRow[];
  } | null;
  pending_pops: FinancePendingPOPRow[];
  queue_rows?: FinancePendingPOPRow[];
  queue_stage_counts?: FinanceQueueStageSummary[];
  payroll: PayrollRosterBundle | null;
  payroll_fallback_used: boolean;
  errors?: Partial<Record<'snapshot' | 'receivables' | 'expenses' | 'breakdown' | 'queue' | 'payroll', string>>;
}
