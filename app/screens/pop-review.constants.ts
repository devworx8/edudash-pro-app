import { Ionicons } from '@expo/vector-icons';
import type { FeeCategoryCode } from '@/types/finance';

export type POPStatus = 'pending' | 'approved' | 'rejected' | 'needs_revision';

export interface POPUpload {
  id: string;
  student_id: string;
  uploaded_by: string;
  preschool_id: string;
  upload_type: string;
  title: string;
  description?: string;
  file_path: string;
  file_name: string;
  file_size: number;
  file_type: string;
  payment_amount?: number;
  payment_method?: string;
  payment_date?: string;
  payment_for_month?: string;
  category_code?: string;
  payment_reference?: string;
  status: POPStatus;
  reviewed_by?: string;
  reviewed_at?: string;
  review_notes?: string;
  created_at: string;
  updated_at: string;
  student?: {
    first_name: string;
    last_name: string;
    student_id?: string;
  };
  uploader?: {
    first_name: string;
    last_name: string;
    email?: string;
  };
}

export interface ReceiptDraft {
  upload: POPUpload;
  description: string;
  amount: string;
  paidDate: string;
  paymentMethod: string;
  paymentReference: string;
}

export type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';
export type ReviewQueue = 'payment_proofs' | 'petty_cash';

export const CATEGORY_META: Record<
  FeeCategoryCode,
  { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  tuition: { label: 'Tuition', color: '#3B82F6', icon: 'school-outline' },
  registration: { label: 'Registration', color: '#8B5CF6', icon: 'clipboard-outline' },
  deposit: { label: 'Deposit', color: '#A855F7', icon: 'card-outline' },
  uniform: { label: 'Uniform', color: '#F59E0B', icon: 'shirt-outline' },
  aftercare: { label: 'Aftercare', color: '#22C55E', icon: 'moon-outline' },
  transport: { label: 'Transport', color: '#06B6D4', icon: 'bus-outline' },
  meal: { label: 'Meals', color: '#EF4444', icon: 'restaurant-outline' },
  meals: { label: 'Meals', color: '#EF4444', icon: 'restaurant-outline' },
  activities: { label: 'Activities', color: '#0EA5E9', icon: 'game-controller-outline' },
  excursion: { label: 'Excursion', color: '#0891B2', icon: 'map-outline' },
  fundraiser: { label: 'Fundraiser', color: '#14B8A6', icon: 'cash-outline' },
  donation_drive: { label: 'Donation Drive', color: '#10B981', icon: 'heart-outline' },
  books: { label: 'Books & Stationery', color: '#F97316', icon: 'book-outline' },
  other: { label: 'Other', color: '#64748B', icon: 'apps-outline' },
  ad_hoc: { label: 'General', color: '#64748B', icon: 'apps-outline' },
};

export const CATEGORY_ORDER: FeeCategoryCode[] = [
  'tuition',
  'registration',
  'deposit',
  'uniform',
  'aftercare',
  'transport',
  'meals',
  'meal',
  'activities',
  'excursion',
  'fundraiser',
  'donation_drive',
  'books',
  'other',
  'ad_hoc',
];
