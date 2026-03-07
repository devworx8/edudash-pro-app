/**
 * Types for Subscription Setup
 * Extracted from app/screens/subscription-setup.tsx
 */

export interface SubscriptionPlan {
  id: string;
  name: string;
  tier: string;
  price_monthly: number;
  price_annual: number;
  max_teachers: number;
  max_students: number;
  features: string[];
  is_active: boolean;
  school_types: string[];
}

export interface RouteParams {
  planId?: string;
  billing?: 'monthly' | 'annual';
  schoolType?: 'preschool' | 'k12_school' | 'hybrid';
  auto?: '1';
  source?: string;
  reason?: string;
}

export interface SchoolInfo {
  school_type: string;
  name: string;
}

export interface ExistingSubscription {
  id: string;
  plan_id: string;
  status: string;
  seats_total: number;
  seats_used: number;
}

export interface ParentOverageConfig {
  quotaType: string;
  monthlyLimit: number;
  overageEnabled: boolean;
  overageUnitPrice: number;
}

export interface SubscriptionSetupState {
  plans: SubscriptionPlan[];
  allPlans: SubscriptionPlan[];
  schoolInfo: SchoolInfo | null;
  loading: boolean;
  selectedPlan: string | null;
  annual: boolean;
  creating: boolean;
  existingSubscription: ExistingSubscription | null;
}

export interface SubscriptionSetupActions {
  loadPlans: () => Promise<void>;
  loadSchoolInfo: () => Promise<void>;
  checkExistingSubscription: () => Promise<void>;
  createSubscription: (planId: string) => Promise<void>;
  setSelectedPlan: (planId: string | null) => void;
  setAnnual: (annual: boolean) => void;
}

export interface UseSubscriptionSetupResult extends SubscriptionSetupState, SubscriptionSetupActions {
  isParent: boolean;
  isParentPlan: (tier: string) => boolean;
  getSchoolId: () => Promise<string | null>;
}
