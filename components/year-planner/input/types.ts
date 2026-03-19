// Types for Year Planner Teacher Input system

import type {
  InputWindow,
  TeacherSubmission,
  SubmissionCategory,
  SubmissionStatus,
  SubmissionPriority,
  InputWindowType,
  SubmissionCounts,
} from '@/lib/services/yearPlanInputService';

export type {
  InputWindow,
  TeacherSubmission,
  SubmissionCategory,
  SubmissionStatus,
  SubmissionPriority,
  InputWindowType,
  SubmissionCounts,
};

// ── Form Data ────────────────────────────────────────────────

export interface SubmissionFormData {
  category: SubmissionCategory;
  title: string;
  description: string;
  targetTermNumber: number | null;
  targetMonth: number | null;
  targetWeekNumber: number | null;
  suggestedDate: string | null;
  suggestedBucket: string | null;
  learningObjectives: string[];
  materialsNeeded: string[];
  estimatedCost: string;
  ageGroups: string[];
  priority: SubmissionPriority;
}

export const getDefaultSubmissionFormData = (): SubmissionFormData => ({
  category: 'theme_suggestion',
  title: '',
  description: '',
  targetTermNumber: null,
  targetMonth: null,
  targetWeekNumber: null,
  suggestedDate: null,
  suggestedBucket: null,
  learningObjectives: [],
  materialsNeeded: [],
  estimatedCost: '',
  ageGroups: [],
  priority: 'normal',
});

// ── Input Window Form Data ───────────────────────────────────

export interface InputWindowFormData {
  title: string;
  description: string;
  windowType: InputWindowType;
  academicYear: number;
  targetTermId: string | null;
  opensAt: Date;
  closesAt: Date;
  allowedCategories: SubmissionCategory[];
}

export const getDefaultWindowFormData = (): InputWindowFormData => ({
  title: '',
  description: '',
  windowType: 'open_call',
  academicYear: new Date().getFullYear(),
  targetTermId: null,
  opensAt: new Date(),
  closesAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 2 weeks from now
  allowedCategories: ['theme_suggestion', 'event_request', 'resource_need', 'reflection', 'assessment_preference'],
});

// ── Display Constants ────────────────────────────────────────

export const CATEGORY_CONFIG: Record<SubmissionCategory, { label: string; icon: string; color: string }> = {
  theme_suggestion: { label: 'Theme Suggestion', icon: 'book-outline', color: '#8B5CF6' },
  event_request: { label: 'Event Request', icon: 'calendar-outline', color: '#3B82F6' },
  resource_need: { label: 'Resource Need', icon: 'cube-outline', color: '#F59E0B' },
  reflection: { label: 'Reflection', icon: 'chatbox-ellipses-outline', color: '#10B981' },
  assessment_preference: { label: 'Assessment', icon: 'clipboard-outline', color: '#EF4444' },
};

export const STATUS_CONFIG: Record<SubmissionStatus, { label: string; color: string; bgColor: string }> = {
  pending: { label: 'Pending', color: '#F59E0B', bgColor: '#FEF3C7' },
  under_review: { label: 'In Review', color: '#3B82F6', bgColor: '#DBEAFE' },
  approved: { label: 'Approved', color: '#10B981', bgColor: '#D1FAE5' },
  modified: { label: 'Modified', color: '#6366F1', bgColor: '#E0E7FF' },
  declined: { label: 'Declined', color: '#EF4444', bgColor: '#FEE2E2' },
};

export const WINDOW_TYPE_CONFIG: Record<InputWindowType, { label: string; description: string }> = {
  year_end_reflection: { label: 'Year-End Reflection', description: 'Teachers share what worked, what didn\'t, and resource needs for next year' },
  annual_planning: { label: 'Annual Planning', description: 'Teachers contribute theme ideas and event suggestions for the new year' },
  term_planning: { label: 'Term Planning', description: 'Teachers submit weekly theme ideas and activities for the upcoming term' },
  open_call: { label: 'Open Call', description: 'General input window for any planning suggestions' },
};

export const PRIORITY_CONFIG: Record<SubmissionPriority, { label: string; color: string }> = {
  low: { label: 'Low', color: '#6B7280' },
  normal: { label: 'Normal', color: '#3B82F6' },
  high: { label: 'High', color: '#EF4444' },
};
