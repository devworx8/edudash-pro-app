/**
 * POP (Proof of Payment & Picture of Progress) Types
 * Shared interfaces for POP upload system
 */
import type { POPUploadType } from '@/lib/popUpload';
import type { FeeCategoryCode, PaymentAllocationInput } from '@/types/finance';

// POP Upload interface
export interface POPUpload {
  id: string;
  student_id: string;
  uploaded_by: string;
  preschool_id: string;
  upload_type: POPUploadType;
  title: string;
  description?: string;
  file_path: string;
  file_name: string;
  file_size: number;
  file_type: string;
  
  // Proof of Payment specific
  payment_amount?: number;
  payment_method?: string;
  payment_date?: string;
  payment_for_month?: string;
  category_code?: FeeCategoryCode;
  payment_reference?: string;
  advance_months?: number;
  covers_months?: string[];
  
  // Picture of Progress specific
  subject?: string;
  achievement_level?: string;
  learning_area?: string;
  
  // Status and review
  status: 'pending' | 'approved' | 'rejected' | 'needs_revision';
  reviewed_by?: string;
  reviewed_at?: string;
  review_notes?: string;
  
  created_at: string;
  updated_at: string;
  
  // Joined data
  reviewer_name?: string;
  student?: {
    first_name: string;
    last_name: string;
  };
}

// POP Upload statistics
export interface POPStats {
  proof_of_payment: {
    pending: number;
    approved: number;
    rejected: number;
    recent: number;
  };
  picture_of_progress: {
    pending: number;
    approved: number;
    rejected: number;
    recent: number;
  };
  total_pending: number;
  total_recent: number;
}

// Upload creation data
export interface CreatePOPUploadData {
  student_id: string;
  upload_type: POPUploadType;
  title: string;
  description?: string;
  tags?: string[];
  file_uri: string;
  file_name: string;
  web_file?: Blob | null;
  
  // Payment specific
  payment_amount?: number;
  payment_method?: string;
  payment_date?: string;
  payment_for_month?: string;
  category_code?: FeeCategoryCode;
  payment_reference?: string;
  advance_months?: number;
  covers_months?: string[];
  
  // Progress specific
  subject?: string;
  achievement_level?: string;
  learning_area?: string;
  is_milestone?: boolean;
  milestone_type?: string;
}

// Status update params
export interface UpdatePOPStatusParams {
  uploadId: string;
  status: 'approved' | 'rejected' | 'needs_revision';
  reviewNotes?: string;
  billingMonth?: string;
  categoryCode?: FeeCategoryCode;
  allocations?: PaymentAllocationInput[];
}

// Filter options for queries
export interface POPUploadFilters {
  upload_type?: POPUploadType;
  status?: string;
  student_id?: string;
}
