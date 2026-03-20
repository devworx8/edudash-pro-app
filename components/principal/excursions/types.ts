// Types for Principal Excursions

export type ExcursionPreflightCheckId =
  | 'transport_verified'
  | 'first_aid_kit'
  | 'consent_forms'
  | 'emergency_contacts'
  | 'staff_ratio'
  | 'weather_venue'
  | 'allergy_medical';

export interface ExcursionPreflightChecks extends Record<ExcursionPreflightCheckId, boolean> {}

export const PREFLIGHT_CHECK_ITEMS: Array<{ id: ExcursionPreflightCheckId; label: string }> = [
  { id: 'transport_verified', label: 'Transport verified (vehicle/operator confirmed)' },
  { id: 'first_aid_kit', label: 'First aid kit packed and accessible' },
  { id: 'consent_forms', label: 'All consent forms signed' },
  { id: 'emergency_contacts', label: 'Emergency contacts up to date' },
  { id: 'staff_ratio', label: 'Staff ratio meets minimum (e.g. 1:8)' },
  { id: 'weather_venue', label: 'Weather/venue confirmed suitable' },
  { id: 'allergy_medical', label: 'Allergy/medical notes reviewed' },
];

export const DEFAULT_PREFLIGHT_CHECKS: ExcursionPreflightChecks = {
  transport_verified: false,
  first_aid_kit: false,
  consent_forms: false,
  emergency_contacts: false,
  staff_ratio: false,
  weather_venue: false,
  allergy_medical: false,
};

export function isPreflightComplete(checks: ExcursionPreflightChecks | null | undefined): boolean {
  if (!checks || typeof checks !== 'object') return false;
  return PREFLIGHT_CHECK_ITEMS.every((item) => Boolean(checks[item.id]));
}

export interface Excursion {
  id: string;
  title: string;
  description: string;
  destination: string;
  excursion_date: string;
  departure_time?: string;
  return_time?: string;
  estimated_cost_per_child: number;
  learning_objectives: string[];
  items_to_bring: string[];
  consent_required: boolean;
  consent_deadline?: string;
  age_groups?: AgeGroup[];
  status: ExcursionStatus;
  created_at: string;
  preflight_checks?: ExcursionPreflightChecks | null;
}

export type ExcursionStatus = 'draft' | 'pending_approval' | 'approved' | 'cancelled' | 'completed';

export const AGE_GROUP_OPTIONS = ['0-1', '1-2', '2-3', '3-4', '4-5', 'Grade R'] as const;
export type AgeGroup = typeof AGE_GROUP_OPTIONS[number];

export interface ExcursionFormData {
  title: string;
  description: string;
  destination: string;
  excursion_date: Date;
  departure_time: Date | null;
  return_time: Date | null;
  estimated_cost_per_child: string;
  learning_objectives: string;
  items_to_bring: string;
  consent_required: boolean;
  consent_deadline: Date | null;
  age_groups: AgeGroup[];
  preflight_checks?: ExcursionPreflightChecks;
}

export const STATUS_COLORS: Record<ExcursionStatus, string> = {
  draft: '#6b7280',
  pending_approval: '#f59e0b',
  approved: '#10b981',
  cancelled: '#ef4444',
  completed: '#3b82f6',
};

export const STATUS_LABELS: Record<ExcursionStatus, string> = {
  draft: 'Draft',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  cancelled: 'Cancelled',
  completed: 'Completed',
};

export const getInitialExcursionFormData = (): ExcursionFormData => ({
  title: '',
  description: '',
  destination: '',
  excursion_date: new Date(),
  departure_time: null,
  return_time: null,
  estimated_cost_per_child: '0',
  learning_objectives: '',
  items_to_bring: '',
  consent_required: true,
  consent_deadline: null,
  age_groups: [],
  preflight_checks: { ...DEFAULT_PREFLIGHT_CHECKS },
});

export const excursionToFormData = (excursion: Excursion): ExcursionFormData => {
  const checks = excursion.preflight_checks as ExcursionPreflightChecks | undefined;
  const preflight: ExcursionPreflightChecks = { ...DEFAULT_PREFLIGHT_CHECKS };
  if (checks && typeof checks === 'object') {
    PREFLIGHT_CHECK_ITEMS.forEach((item) => {
      preflight[item.id] = Boolean(checks[item.id]);
    });
  }
  const parseTime = (t?: string) => {
    if (!t) return null;
    const [h, m] = t.split(':').map(Number);
    const d = new Date(); d.setHours(h || 0, m || 0, 0, 0);
    return d;
  };
  return {
    title: excursion.title,
    description: excursion.description || '',
    destination: excursion.destination,
    excursion_date: new Date(excursion.excursion_date),
    departure_time: parseTime(excursion.departure_time),
    return_time: parseTime(excursion.return_time),
    estimated_cost_per_child: String(excursion.estimated_cost_per_child || 0),
    learning_objectives: excursion.learning_objectives?.join(', ') || '',
    items_to_bring: excursion.items_to_bring?.join(', ') || '',
    consent_required: excursion.consent_required,
    consent_deadline: excursion.consent_deadline ? new Date(excursion.consent_deadline) : null,
    age_groups: excursion.age_groups || [],
    preflight_checks: preflight,
  };
};
