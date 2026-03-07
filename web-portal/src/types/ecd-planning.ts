// Types for ECD Planning Features

export interface AcademicTerm {
  id: string;
  preschool_id: string;
  created_by: string;
  name: string;
  academic_year: number;
  term_number: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
  is_published: boolean;
  description?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface CurriculumTheme {
  id: string;
  preschool_id: string;
  created_by: string;
  title: string;
  description?: string;
  term_id?: string;
  week_number?: number;
  start_date?: string;
  end_date?: string;
  learning_objectives: string[];
  key_concepts: string[];
  vocabulary_words: string[];
  suggested_activities: string[];
  materials_needed: string[];
  developmental_domains: string[];
  age_groups: string[];
  is_published: boolean;
  is_template: boolean;
  created_at: string;
  updated_at: string;
}

export interface LessonTemplate {
  id: string;
  preschool_id: string;
  created_by: string;
  name: string;
  description?: string;
  template_structure: {
    sections: Array<{
      name: string;
      required: boolean;
    }>;
  };
  default_duration_minutes: number;
  default_age_group: string;
  default_subject?: string;
  usage_count: number;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WeeklyPlan {
  id: string;
  preschool_id: string;
  class_id?: string;
  created_by: string;
  term_id?: string;
  theme_id?: string;
  week_number: number;
  week_start_date: string;
  week_end_date: string;
  daily_plans: {
    monday: { activities: string[]; learning_objectives: string[] };
    tuesday: { activities: string[]; learning_objectives: string[] };
    wednesday: { activities: string[]; learning_objectives: string[] };
    thursday: { activities: string[]; learning_objectives: string[] };
    friday: { activities: string[]; learning_objectives: string[] };
  };
  weekly_focus?: string;
  weekly_objectives: string[];
  materials_list: string[];
  status: 'draft' | 'submitted' | 'approved' | 'published';
  submitted_at?: string;
  approved_by?: string;
  approved_at?: string;
  rejection_reason?: string | null;
  rejected_at?: string | null;
  rejected_by?: string | null;
  created_at: string;
  updated_at: string;
}

export type DailyProgramBlockType =
  | 'circle_time'
  | 'learning'
  | 'movement'
  | 'outdoor'
  | 'meal'
  | 'nap'
  | 'assessment'
  | 'transition'
  | 'other';

export type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface DailyProgramBlock {
  id?: string;
  weekly_program_id?: string;
  preschool_id?: string;
  class_id?: string | null;
  created_by?: string;
  day_of_week: DayOfWeek;
  block_order: number;
  block_type: DailyProgramBlockType;
  title: string;
  start_time?: string | null;
  end_time?: string | null;
  objectives: string[];
  materials: string[];
  transition_cue?: string | null;
  notes?: string | null;
  parent_tip?: string | null;
}

export interface WeeklyProgramDraft {
  id?: string;
  preschool_id: string;
  class_id?: string | null;
  term_id?: string | null;
  theme_id?: string | null;
  created_by?: string;
  week_start_date: string;
  week_end_date: string;
  age_group?: string;
  title?: string | null;
  summary?: string | null;
  generated_by_ai?: boolean;
  source?: 'manual' | 'ai';
  status?: 'draft' | 'submitted' | 'approved' | 'published' | 'archived';
  published_by?: string | null;
  published_at?: string | null;
  save_warnings?: string[];
  generation_context?: {
    preflight?: {
      nonNegotiableAnchors: string;
      fixedWeeklyEvents: string;
      afterLunchPattern: string;
      resourceConstraints: string;
      safetyCompliance: string;
    };
    assumptionSummary?: string[];
    capsCoverage?: {
      homeLanguageDays: number[];
      mathematicsDays: number[];
      lifeSkillsDays: number[];
      weatherRoutineDays: number[];
      missingByDay: Array<{
        day: number;
        missingStrands: string[];
      }>;
      coverageScore: number;
    };
  } | null;
  blocks: DailyProgramBlock[];
}

export interface WeeklyProgramPublishInput {
  weeklyProgram: WeeklyProgramDraft;
  publishNow?: boolean;
  publishSummaryToAnnouncements?: boolean;
}

export interface WeeklyProgramGenerationConstraints {
  dailyMinutes?: number;
  budgetLevel?: 'low' | 'medium' | 'high';
  arrivalStartTime?: string;
  arrivalCutoffTime?: string;
  pickupStartTime?: string;
  pickupCutoffTime?: string;
  indoorOnly?: boolean;
  includeAssessmentBlock?: boolean;
  includeParentTipPerDay?: boolean;
  maxMaterialsPerDay?: number;
  includeToiletRoutine?: boolean;
  includeNapTime?: boolean;
  includeMealBlocks?: boolean;
  includeOutdoorPlay?: boolean;
  includeStoryCircle?: boolean;
  includeTransitionCues?: boolean;
  includeHygieneChecks?: boolean;
}

export const DEVELOPMENTAL_DOMAINS = [
  'cognitive',
  'physical',
  'social',
  'emotional',
  'language',
] as const;

export const AGE_GROUPS = ['1-2', '3-4', '4-5', '5-6', '3-6'] as const;

export type DevelopmentalDomain = typeof DEVELOPMENTAL_DOMAINS[number];
export type AgeGroup = typeof AGE_GROUPS[number];
