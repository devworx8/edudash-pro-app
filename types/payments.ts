// Payment-related types for parent payments screen

export interface PaymentChild {
  id: string;
  first_name: string;
  last_name: string;
  preschool_id: string;
  preschool_name?: string;
  student_code: string; // Unique payment reference (e.g., YE-2026-0001)
  enrollment_date?: string | null;
  date_of_birth?: string | null;
  age_group_id?: string | null;
  age_group_ref?: string | null;
  age_group?: {
    id: string;
    name: string | null;
    age_min: number | null;
    age_max: number | null;
    min_age_months: number | null;
    max_age_months: number | null;
  } | null;
  age_group_ref_data?: {
    id: string;
    name: string | null;
    age_min: number | null;
    age_max: number | null;
    min_age_months: number | null;
    max_age_months: number | null;
  } | null;
  grade?: string | null;
  grade_level?: string | null;
  registration_fee_amount?: number;
  registration_fee_paid?: boolean;
  payment_verified?: boolean;
}

export interface StudentFee {
  id: string;
  student_id: string;
  fee_type: string;
  category_code?: string;
  description: string;
  amount: number;
  due_date: string;
  billing_month?: string;
  grace_period_days?: number;
  paid_date?: string;
  status: 'pending' | 'partially_paid' | 'paid' | 'overdue' | 'waived' | 'pending_verification';
  payment_method?: string;
  pop_status?: 'pending' | 'approved' | 'rejected' | 'needs_revision'; // Status of linked POP upload
  receipt_url?: string | null;
  receipt_storage_path?: string | null;
}

export interface FeeStructure {
  id: string;
  name?: string;
  fee_type: string;
  amount: number;
  description: string;
  payment_frequency?: string;
  age_group?: string;
  grade_level?: string | null;
  grade_levels?: string[] | null;
}

export interface PaymentMethod {
  id: string;
  method_name: string;
  display_name: string;
  processing_fee: number;
  fee_type: string;
  description?: string;
  instructions?: string;
  bank_name?: string;
  account_number?: string;
  branch_code?: string;
  preferred: boolean;
}

export interface POPUpload {
  id: string;
  student_id: string;
  upload_type: string;
  title: string;
  description?: string;
  category_code?: string;
  file_path: string;
  file_name: string;
  status: 'pending' | 'approved' | 'rejected' | 'needs_revision';
  payment_amount?: number;
  payment_date?: string;
  payment_for_month?: string;
  payment_reference?: string;
  created_at: string;
}

export interface SelectedFile {
  uri: string;
  name: string;
  size?: number;
  type?: string;
  webFile?: Blob;
}

export type PaymentTabType = 'upcoming' | 'history' | 'upload';

export interface FeeStatusInfo {
  color: string;
  bgColor: string;
  label: string;
}

export interface SchoolBankDetails {
  id: string;
  account_name: string;
  bank_name: string;
  account_number: string; // Full number for display to parents
  branch_code?: string;
  swift_code?: string;
  account_type?: string;
}
