/**
 * Shared types for the useRegistrations hook and related modules.
 */

import type { useAlertModal } from '@/components/ui/AlertModal';

export type ShowAlert = ReturnType<typeof useAlertModal>['showAlert'];

export interface Registration {
  id: string;
  organization_id: string;
  organization_name?: string;
  edusite_id?: string;
  parent_id?: string;
  parent_email?: string;
  parent_first_name?: string;
  parent_last_name?: string;
  parent_phone?: string;
  guardian_name: string;
  guardian_email: string;
  guardian_phone: string;
  guardian_address?: string;
  student_first_name: string;
  student_last_name: string;
  student_dob: string;
  student_gender?: string;
  student_birth_certificate_url?: string;
  student_clinic_card_url?: string;
  guardian_id_document_url?: string;
  documents_uploaded: boolean;
  documents_deadline?: string;
  payment_reference?: string;
  registration_fee_amount?: number;
  registration_fee_paid: boolean;
  payment_verified?: boolean;
  payment_method?: string;
  proof_of_payment_url?: string;
  campaign_applied?: string;
  discount_amount?: number;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by?: string;
  reviewed_date?: string;
  rejection_reason?: string;
  created_at: string;
  source?: 'edusite' | 'in-app' | 'aftercare';
  medical_info?: string;
  dietary_requirements?: string;
  special_needs?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
}

export type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

export interface FeeStructureRow {
  id: string;
  amount: number;
  fee_type?: string | null;
  name?: string | null;
  description?: string | null;
  age_group?: string | null;
  grade_levels?: string[] | null;
  grade_level?: string | null;
  effective_from?: string | null;
  created_at?: string | null;
}

export interface PostgrestErrorLike {
  code?: string;
  message?: string;
  details?: string;
}

export interface UseRegistrationsReturn {
  registrations: Registration[];
  filteredRegistrations: Registration[];
  alertProps: ReturnType<typeof useAlertModal>['alertProps'];
  showAlert: ReturnType<typeof useAlertModal>['showAlert'];
  loading: boolean;
  refreshing: boolean;
  syncing: boolean;
  processing: string | null;
  error: string | null;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  statusFilter: StatusFilter;
  setStatusFilter: (filter: StatusFilter) => void;
  rejectModalVisible: boolean;
  rejectionReason: string;
  setRejectionReason: (reason: string) => void;
  confirmReject: () => Promise<void>;
  cancelReject: () => void;
  rejectingRegistration: Registration | null;
  fetchRegistrations: () => Promise<void>;
  onRefresh: () => void;
  handleSyncWithEduSite: () => Promise<void>;
  handleApprove: (registration: Registration) => void;
  handleReject: (registration: Registration) => void;
  handleVerifyPayment: (registration: Registration, verify: boolean) => void;
  canApprove: (registration: Registration) => boolean;
  usesEdusiteSync: boolean;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  sendPaymentReminder: (registration: Registration) => void;
  sendingReminder: string | null;
  sendPopUploadLink: (registration: Registration) => void;
  sendingPopLink: string | null;
}
