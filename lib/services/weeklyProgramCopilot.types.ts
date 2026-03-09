import type {
  DailyProgramBlock,
  DailyProgramBlockType,
  WeeklyProgramGenerationConstraints,
} from '@/types/ecd-planning';

export interface GenerateWeeklyProgramFromTermInput {
  preschoolId: string;
  createdBy: string;
  weekStartDate: string;
  theme: string;
  schoolName?: string;
  ageGroup: string;
  weeklyObjectives?: string[];
  preflightAnswers?: {
    nonNegotiableAnchors: string;
    fixedWeeklyEvents: string;
    afterLunchPattern: string;
    resourceConstraints: string;
    safetyCompliance: string;
  };
  constraints?: WeeklyProgramGenerationConstraints;
}

export type CompletionInsightSummary = {
  totalCompletions: number;
  avgScore: number | null;
  topDomains: Array<{ domain: string; count: number; avgScore: number | null }>;
};

export type ToiletRoutinePolicy = {
  requiredPerDay: number;
  beforeBreakfast: boolean;
  beforeLunch: boolean;
  beforeNap: boolean;
  maxDurationMinutes: number | null;
};

export type CapsCoverageSummary = {
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

export type AnchorRuleKey = 'morning_prayer' | 'circle_time' | 'breakfast' | 'lunch' | 'nap';

export type AnchorRuleDefinition = {
  key: AnchorRuleKey;
  label: string;
  keywords: string[];
  blockType: DailyProgramBlockType;
  defaultDurationMinutes: number;
};

export type AnchorRule = AnchorRuleDefinition & {
  startTime: string;
};

export type PreflightAnchorPolicy = {
  anchors: AnchorRule[];
  toiletMaxDurationMinutes: number | null;
};

export type AnchorDiagnostics = {
  requested: string[];
  applied: string[];
  skippedConflicts: string[];
};

export type AnchorPolicyEnforcementOutcome = {
  blocks: DailyProgramBlock[];
  policy: PreflightAnchorPolicy;
  appliedCount: number;
  insertedCount: number;
  toiletCappedCount: number;
  anchorDiagnostics: AnchorDiagnostics;
};
