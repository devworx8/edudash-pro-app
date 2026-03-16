/* eslint-disable i18next/no-literal-string */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DesktopLayout } from '@/components/layout/DesktopLayout';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { assertSupabase } from '@/lib/supabase';
import { extractOrganizationId } from '@/lib/tenant/compat';
import type { DailyProgramBlock, WeeklyProgramDraft } from '@/types/ecd-planning';
import { WeeklyProgramCopilotService } from '@/lib/services/weeklyProgramCopilotService';
import {
  WeeklyProgramService,
  type ProgramTimeRules,
} from '@/lib/services/weeklyProgramService';
import { canUseFeature, getQuotaStatus, type QuotaStatus } from '@/lib/ai/limits';
import { incrementUsage } from '@/lib/ai/usage';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { useAlertModal } from '@/components/ui/AlertModal';
import { ShareTargetPickerModal } from '@/components/planner/ShareTargetPickerModal';
import { fetchThemeForWeek } from '@/lib/services/curriculumThemeService';
import { getRoutineBlockTypePresentation } from '@/lib/routines/blockTypePresentation';
import {
  classifyRoutineBlockIntent,
  countRoutineDayOverlaps,
  isAgeGroupFourToSix,
} from '@/lib/routines/dailyRoutineNormalization';

const DAY_ORDER = [1, 2, 3, 4, 5] as const;
const DAY_LABELS: Record<number, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
};
const MIN_DAY_END_MINUTES = 13 * 60 + 30; // 13:30

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfWeekMonday(value: Date | string): string {
  const date = typeof value === 'string'
    ? new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`)
    : new Date(value);

  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const day = safeDate.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  safeDate.setUTCDate(safeDate.getUTCDate() + offset);
  return toDateOnly(safeDate);
}

function addDays(dateLike: string, days: number): string {
  const date = new Date(`${dateLike}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateOnly(date);
}

function normalizeTime(value: string): string {
  const trimmed = String(value || '').trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return trimmed;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return trimmed;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return trimmed;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function parseObjectivesParam(value?: string | string[]): string[] {
  if (!value) return [];
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {
    // Fall through to plain text parsing.
  }

  return String(raw)
    .split(/[\n,;|]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function timeToDate(hhmm: string): Date {
  const [h, m] = (hhmm || '07:30').split(':').map(Number);
  const d = new Date();
  d.setHours(Number.isFinite(h) ? h : 7, Number.isFinite(m) ? m : 30, 0, 0);
  return d;
}

function dateToTime(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function extractDraftModelUsed(draft: WeeklyProgramDraft | null | undefined): string | null {
  if (!draft?.generation_context) return null;
  const context = draft.generation_context as Record<string, unknown>;
  const direct = typeof context.modelUsed === 'string' ? context.modelUsed.trim() : '';
  if (direct) return direct;
  const assumptions = Array.isArray(context.assumptionSummary) ? context.assumptionSummary : [];
  for (const line of assumptions) {
    const text = String(line || '').trim();
    const match = text.match(/^AI model used:\s*(.+)$/i);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

const buildDefaultRules = (): ProgramTimeRules => ({
  arrivalStartTime: '06:00',
  arrivalCutoffTime: '08:30',
  pickupStartTime: '13:00',
  pickupCutoffTime: '14:00',
});

const THEME_SUGGESTIONS = [
  'Healthy Habits',
  'All About Me',
  'Community Helpers',
  'Seasons & Weather',
  'Numbers & Shapes',
] as const;

const OBJECTIVE_SUGGESTIONS = [
  'Routine consistency',
  'Self-help skills',
  'Social confidence',
  'Early numeracy',
  'Oral language',
] as const;

type PlannerPreset = {
  id: 'half_day' | 'full_day' | 'aftercare';
  label: string;
  caption: string;
  themeTitle: string;
  ageGroup: string;
  dailyMinutes: string;
  weeklyObjectives: string;
  budgetLevel: 'low' | 'medium' | 'high';
  includeAssessment: boolean;
  rules: ProgramTimeRules;
};

type SchoolClassOption = {
  id: string;
  name: string;
  gradeLevel: string | null;
  teacherId: string | null;
};

type RoutineOptionId =
  | 'toiletRoutine'
  | 'napTime'
  | 'mealBreaks'
  | 'outdoorPlay'
  | 'storyCircle'
  | 'transitionCues'
  | 'hygieneChecks';

type RoutineOptionState = Record<RoutineOptionId, boolean>;

type PreflightAnswers = {
  nonNegotiableAnchors: string;
  fixedWeeklyEvents: string;
  afterLunchPattern: string;
  resourceConstraints: string;
  safetyCompliance: string;
};

type PlannerPreferences = {
  themeTitle: string;
  ageGroup: string;
  weeklyObjectives: string;
  dailyMinutes: string;
  budgetLevel: 'low' | 'medium' | 'high';
  includeAssessment: boolean;
  routineOptions: RoutineOptionState;
  preflight: PreflightAnswers;
  rules: ProgramTimeRules;
  selectedPresetId: PlannerPreset['id'] | null;
};

const SMART_PRESETS: PlannerPreset[] = [
  {
    id: 'half_day',
    label: 'Half-Day Core',
    caption: 'Fastest setup for 3-6 classes.',
    themeTitle: 'Playful Foundations',
    ageGroup: '3-6',
    dailyMinutes: '300',
    weeklyObjectives: 'Routine consistency, self-help skills, social confidence',
    budgetLevel: 'medium',
    includeAssessment: true,
    rules: {
      arrivalStartTime: '06:00',
      arrivalCutoffTime: '08:30',
      pickupStartTime: '12:30',
      pickupCutoffTime: '13:30',
    },
  },
  {
    id: 'full_day',
    label: 'Full-Day Focus',
    caption: 'Long day with learning + rest.',
    themeTitle: 'Curious Learners',
    ageGroup: '4-6',
    dailyMinutes: '480',
    weeklyObjectives: 'Literacy readiness, numeracy confidence, social-emotional growth',
    budgetLevel: 'high',
    includeAssessment: true,
    rules: {
      arrivalStartTime: '06:00',
      arrivalCutoffTime: '08:30',
      pickupStartTime: '16:00',
      pickupCutoffTime: '17:00',
    },
  },
  {
    id: 'aftercare',
    label: 'Aftercare Blend',
    caption: 'Academic support + calmer transitions.',
    themeTitle: 'Homework & Enrichment',
    ageGroup: '6-9',
    dailyMinutes: '360',
    weeklyObjectives: 'Homework support, emotional regulation, independent routines',
    budgetLevel: 'low',
    includeAssessment: false,
    rules: {
      arrivalStartTime: '12:30',
      arrivalCutoffTime: '13:30',
      pickupStartTime: '17:00',
      pickupCutoffTime: '18:00',
    },
  },
];

const ROUTINE_ESSENTIALS: Array<{ id: RoutineOptionId; label: string; hint: string }> = [
  { id: 'toiletRoutine', label: 'Toilet Routine', hint: 'Bathroom prompts and support moments' },
  { id: 'napTime', label: 'Nap / Quiet Time', hint: 'Rest reset in the daily flow' },
  { id: 'mealBreaks', label: 'Meals & Snacks', hint: 'Nutrition windows every day' },
  { id: 'outdoorPlay', label: 'Outdoor Play', hint: 'Gross-motor movement outside' },
  { id: 'storyCircle', label: 'Story / Circle Time', hint: 'Daily literacy touchpoint' },
  { id: 'transitionCues', label: 'Transition Cues', hint: 'Clear move-to-next activity cues' },
  { id: 'hygieneChecks', label: 'Hygiene Routines', hint: 'Handwashing, cleanup, self-care' },
];

const DEFAULT_ROUTINE_OPTIONS: RoutineOptionState = {
  toiletRoutine: true,
  napTime: true,
  mealBreaks: true,
  outdoorPlay: true,
  storyCircle: true,
  transitionCues: true,
  hygieneChecks: true,
};

const PREFLIGHT_QUESTIONS: Array<{ key: keyof PreflightAnswers; label: string; placeholder: string }> = [
  {
    key: 'nonNegotiableAnchors',
    label: '1. Daily Non-Negotiable Anchors',
    placeholder: 'e.g., Circle at 08:00, snack at 10:00, story at 11:30',
  },
  {
    key: 'fixedWeeklyEvents',
    label: '2. Fixed Weekly Events / Constraints',
    placeholder: 'e.g., Library Wednesday, sports Friday, speech therapist Thursday',
  },
  {
    key: 'afterLunchPattern',
    label: '3. After-Lunch Pattern & Transition Style',
    placeholder: 'e.g., calm transition, quiet reading, then outdoor movement',
  },
  {
    key: 'resourceConstraints',
    label: '4. Resource / Staffing Constraints',
    placeholder: 'e.g., one assistant, limited outdoor equipment, shared classroom',
  },
  {
    key: 'safetyCompliance',
    label: '5. Safety / Compliance + Fallback Rules',
    placeholder: 'e.g., allergy protocol, heat policy, rainy-day fallback',
  },
];

const DEFAULT_PREFLIGHT: PreflightAnswers = {
  nonNegotiableAnchors: '',
  fixedWeeklyEvents: '',
  afterLunchPattern: '',
  resourceConstraints: '',
  safetyCompliance: '',
};

const DEFAULT_PLANNER_PREFS: PlannerPreferences = {
  themeTitle: 'Healthy Habits',
  ageGroup: '3-6',
  weeklyObjectives: 'Routine consistency, self-help skills, social confidence',
  dailyMinutes: '300',
  budgetLevel: 'medium',
  includeAssessment: true,
  routineOptions: { ...DEFAULT_ROUTINE_OPTIONS },
  preflight: { ...DEFAULT_PREFLIGHT },
  rules: buildDefaultRules(),
  selectedPresetId: null,
};

const PLANNER_PREFERENCE_KEY_PREFIX = '@edudash:daily_program_preferences';

function normalizeRoutineOptions(value: any): RoutineOptionState {
  return {
    toiletRoutine: Boolean(value?.toiletRoutine ?? DEFAULT_ROUTINE_OPTIONS.toiletRoutine),
    napTime: Boolean(value?.napTime ?? DEFAULT_ROUTINE_OPTIONS.napTime),
    mealBreaks: Boolean(value?.mealBreaks ?? DEFAULT_ROUTINE_OPTIONS.mealBreaks),
    outdoorPlay: Boolean(value?.outdoorPlay ?? DEFAULT_ROUTINE_OPTIONS.outdoorPlay),
    storyCircle: Boolean(value?.storyCircle ?? DEFAULT_ROUTINE_OPTIONS.storyCircle),
    transitionCues: Boolean(value?.transitionCues ?? DEFAULT_ROUTINE_OPTIONS.transitionCues),
    hygieneChecks: Boolean(value?.hygieneChecks ?? DEFAULT_ROUTINE_OPTIONS.hygieneChecks),
  };
}

function normalizePreflight(value: any): PreflightAnswers {
  return {
    nonNegotiableAnchors: String(value?.nonNegotiableAnchors || ''),
    fixedWeeklyEvents: String(value?.fixedWeeklyEvents || ''),
    afterLunchPattern: String(value?.afterLunchPattern || ''),
    resourceConstraints: String(value?.resourceConstraints || ''),
    safetyCompliance: String(value?.safetyCompliance || ''),
  };
}

function normalizeRules(value: any): ProgramTimeRules {
  const fallback = buildDefaultRules();
  return {
    arrivalStartTime: normalizeTime(String(value?.arrivalStartTime || fallback.arrivalStartTime)),
    arrivalCutoffTime: normalizeTime(String(value?.arrivalCutoffTime || fallback.arrivalCutoffTime)),
    pickupStartTime: normalizeTime(String(value?.pickupStartTime || fallback.pickupStartTime)),
    pickupCutoffTime: normalizeTime(String(value?.pickupCutoffTime || fallback.pickupCutoffTime)),
  };
}

const routineOptionsForPreset = (presetId: PlannerPreset['id']): RoutineOptionState => {
  if (presetId === 'aftercare') {
    return {
      ...DEFAULT_ROUTINE_OPTIONS,
      napTime: false,
      storyCircle: false,
    };
  }

  if (presetId === 'half_day') {
    return {
      ...DEFAULT_ROUTINE_OPTIONS,
      napTime: false,
    };
  }

  return {
    ...DEFAULT_ROUTINE_OPTIONS,
    napTime: true,
  };
};

function toMinutes(value: string): number | null {
  const normalized = normalizeTime(value);
  if (!normalized || !normalized.includes(':')) return null;
  const [hours, minutes] = normalized.split(':').map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function toHHMM(totalMinutes: number): string {
  const safe = Math.max(0, Math.min(23 * 60 + 59, Math.round(totalMinutes)));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

const SHARED_RESOURCE_STAGGER_KEYWORDS = [
  'toilet',
  'bathroom',
  'potty',
  'washroom',
  'restroom',
  'hygiene',
  'hand wash',
  'handwash',
  'meal',
  'snack',
  'breakfast',
  'lunch',
];

function isSharedResourceBlock(block: DailyProgramBlock): boolean {
  const haystack = [
    block.block_type,
    block.title,
    block.notes,
    ...(block.objectives || []),
    ...(block.materials || []),
  ]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');
  return SHARED_RESOURCE_STAGGER_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

function buildStaggeredClassVariant(
  blocks: DailyProgramBlock[],
  rules: ProgramTimeRules,
  staggerMinutes: number,
): DailyProgramBlock[] {
  const offset = Math.max(5, Math.min(60, Math.trunc(staggerMinutes)));
  const arrivalStart = toMinutes(rules.arrivalStartTime) ?? 0;
  const pickupCutoff = toMinutes(rules.pickupCutoffTime) ?? 23 * 60 + 59;

  const weekdayBlocks = blocks
    .filter((block) => DAY_ORDER.includes(Number(block.day_of_week) as (typeof DAY_ORDER)[number]))
    .slice()
    .sort((a, b) =>
      a.day_of_week === b.day_of_week
        ? Number(a.block_order || 0) - Number(b.block_order || 0)
        : Number(a.day_of_week || 0) - Number(b.day_of_week || 0),
    );
  const nonWeekdayBlocks = blocks.filter(
    (block) => !DAY_ORDER.includes(Number(block.day_of_week) as (typeof DAY_ORDER)[number]),
  );

  const result: DailyProgramBlock[] = [];
  for (const day of DAY_ORDER) {
    const dayBlocks = weekdayBlocks
      .filter((block) => Number(block.day_of_week) === day)
      .slice()
      .sort((a, b) => Number(a.block_order || 0) - Number(b.block_order || 0));
    if (dayBlocks.length === 0) continue;

    const starts = dayBlocks
      .map((block) => toMinutes(String(block.start_time || '')))
      .filter((value): value is number => value !== null);
    const ends = dayBlocks
      .map((block) => toMinutes(String(block.end_time || '')))
      .filter((value): value is number => value !== null);

    const dayStart = starts.length > 0 ? Math.max(arrivalStart, Math.min(...starts)) : arrivalStart;
    const dayEnd = ends.length > 0 ? Math.min(pickupCutoff, Math.max(...ends)) : pickupCutoff;
    let cursor = dayStart;

    dayBlocks.forEach((block, index) => {
      const start = toMinutes(String(block.start_time || ''));
      const end = toMinutes(String(block.end_time || ''));
      if (start === null || end === null || end <= start) {
        result.push({
          ...block,
          day_of_week: day as 1 | 2 | 3 | 4 | 5 | 6 | 7,
          block_order: index + 1,
        });
        return;
      }

      const duration = Math.max(5, end - start);
      const preferredStart = start + (isSharedResourceBlock(block) ? offset : 0);
      let nextStart = Math.max(preferredStart, cursor);
      const maxStart = Math.max(dayStart, dayEnd - duration);
      if (nextStart > maxStart) nextStart = maxStart;
      if (nextStart < cursor) nextStart = cursor;
      let nextEnd = Math.min(dayEnd, nextStart + duration);
      if (nextEnd <= nextStart) nextEnd = Math.min(dayEnd, nextStart + 5);

      result.push({
        ...block,
        day_of_week: day as 1 | 2 | 3 | 4 | 5 | 6 | 7,
        block_order: index + 1,
        start_time: toHHMM(nextStart),
        end_time: toHHMM(nextEnd),
        notes: isSharedResourceBlock(block)
          ? `${String(block.notes || '').trim()} Auto-staggered by ${offset} minutes for shared-resource coordination.`
              .trim()
          : block.notes,
      });
      cursor = Math.max(cursor, nextEnd);
    });
  }

  return [...result, ...nonWeekdayBlocks].sort((a, b) =>
    a.day_of_week === b.day_of_week
      ? Number(a.block_order || 0) - Number(b.block_order || 0)
      : Number(a.day_of_week || 0) - Number(b.day_of_week || 0),
  );
}

function resolveSchoolName(profile: any): string {
  const fromMembership = String(profile?.organization_membership?.organization_name || '').trim();
  if (fromMembership) return fromMembership;
  const fromOrg = String(profile?.organization_name || '').trim();
  if (fromOrg) return fromOrg;
  const fromPreschool = String(profile?.preschool_name || '').trim();
  if (fromPreschool) return fromPreschool;
  return '';
}

function withSchoolNamedTitle(rawTitle: string | null | undefined, schoolName: string, themeTitle: string): string {
  const cleanSchool = String(schoolName || '').trim();
  const cleanTheme = String(themeTitle || '').trim() || 'Daily Routine';
  const raw = String(rawTitle || '').trim();
  const fallbackCore = `${cleanTheme} Weekly Routine`;

  if (!cleanSchool) {
    return raw || fallbackCore;
  }
  if (!raw) {
    return `${cleanSchool}: ${fallbackCore}`;
  }

  const schoolLower = cleanSchool.toLowerCase();
  const rawLower = raw.toLowerCase();
  if (rawLower.includes(schoolLower)) {
    return raw;
  }

  const genericPrefixes = ['curious learners', 'playful foundations', 'homework & enrichment', 'school', 'preschool'];
  const split = raw.split(':').map((part) => part.trim()).filter(Boolean);
  if (split.length > 1) {
    const first = split[0].toLowerCase();
    const rest = split.slice(1).join(':').trim();
    if (genericPrefixes.some((prefix) => first.includes(prefix))) {
      return `${cleanSchool}: ${rest || fallbackCore}`;
    }
  }

  return `${cleanSchool}: ${raw}`;
}

function formatClassLabel(option: SchoolClassOption): string {
  const grade = String(option.gradeLevel || '').trim();
  const name = String(option.name || '').trim();
  if (grade && name) return `${grade} · ${name}`;
  return grade || name || 'Unnamed class';
}

export default function PrincipalDailyProgramPlannerScreen() {
  const { theme } = useTheme();
  const { profile, user } = useAuth();
  const { width } = useWindowDimensions();
  const { showAlert, AlertModalComponent } = useAlertModal();
  const params = useLocalSearchParams<{
    requestId?: string;
    requestType?: string;
    weekStartDate?: string;
    classId?: string;
    ageGroup?: string;
    themeTitle?: string;
    objectives?: string;
    fromRoutineRequest?: string;
  }>();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const isCompactLayout = width < 920;
  const isUltraCompact = width < 640;

  const organizationId = extractOrganizationId(profile);
  const userId = user?.id || profile?.id;
  const schoolName = useMemo(() => resolveSchoolName(profile), [profile]);
  const prefillAppliedRef = useRef(false);

  const [weekStartDate, setWeekStartDate] = useState(() => startOfWeekMonday(new Date()));
  const [themeTitle, setThemeTitle] = useState('Healthy Habits');
  const [ageGroup, setAgeGroup] = useState('3-6');
  const [weeklyObjectives, setWeeklyObjectives] = useState('Routine consistency, self-help skills, social confidence');
  const [dailyMinutes, setDailyMinutes] = useState('300');
  const [budgetLevel, setBudgetLevel] = useState<'low' | 'medium' | 'high'>('medium');
  const [includeAssessment, setIncludeAssessment] = useState(true);
  const [routineOptions, setRoutineOptions] = useState<RoutineOptionState>(() => ({
    ...DEFAULT_ROUTINE_OPTIONS,
  }));
  const [preflight, setPreflight] = useState<PreflightAnswers>(DEFAULT_PREFLIGHT);
  const preflightComplete = useMemo(
    () =>
      PREFLIGHT_QUESTIONS.every(
        (question) => String(preflight[question.key] || '').trim().length >= 6,
      ),
    [preflight],
  );
  const confirmedAssumptions = useMemo(
    () =>
      PREFLIGHT_QUESTIONS.map(
        (question) =>
          `${question.label.replace(/^\d+\.\s*/, '')}: ${String(preflight[question.key] || '').trim()}`,
      ),
    [preflight],
  );
  const [selectedPresetId, setSelectedPresetId] = useState<PlannerPreset['id'] | null>(null);

  const [rules, setRules] = useState<ProgramTimeRules>(buildDefaultRules());
  const [classOptions, setClassOptions] = useState<SchoolClassOption[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [pairedGenerationEnabled, setPairedGenerationEnabled] = useState(false);
  const [pairedSecondaryClassId, setPairedSecondaryClassId] = useState<string | null>(null);
  const [pairedStaggerMinutes, setPairedStaggerMinutes] = useState('20');
  const [timePickerField, setTimePickerField] = useState<'arrivalStart' | 'arrivalCutoff' | 'pickupStart' | 'pickupCutoff' | null>(null);
  const [plannerPreferencesReady, setPlannerPreferencesReady] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [generationMode, setGenerationMode] = useState<'generate' | 'regenerate'>('generate');
  const [saving, setSaving] = useState(false);
  const [sharingParents, setSharingParents] = useState(false);
  const [sharingTeachers, setSharingTeachers] = useState(false);
  const [deletingProgramId, setDeletingProgramId] = useState<string | null>(null);
  const [saveAdvisory, setSaveAdvisory] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lessonQuota, setLessonQuota] = useState<QuotaStatus | null>(null);

  const [draft, setDraft] = useState<WeeklyProgramDraft | null>(null);
  const [programs, setPrograms] = useState<WeeklyProgramDraft[]>([]);
  const [draftViewMode, setDraftViewMode] = useState<'edit' | 'cards'>('edit');
  const [programToRegenerateAfterLoad, setProgramToRegenerateAfterLoad] = useState<WeeklyProgramDraft | null>(null);
  const [showSharePicker, setShowSharePicker] = useState(false);
  const [sharePickerTarget, setSharePickerTarget] = useState<WeeklyProgramDraft | null>(null);

  const plannerPreferenceKey = useMemo(() => {
    if (!organizationId || !userId) return null;
    return `${PLANNER_PREFERENCE_KEY_PREFIX}:${organizationId}:${userId}`;
  }, [organizationId, userId]);

  useEffect(() => {
    let isActive = true;

    if (!plannerPreferenceKey) {
      setPlannerPreferencesReady(false);
      return () => {
        isActive = false;
      };
    }

    setPlannerPreferencesReady(false);
    const hydratePreferences = async () => {
      try {
        const stored = await AsyncStorage.getItem(plannerPreferenceKey);
        if (!isActive || !stored) return;
        const parsed = JSON.parse(stored) as Partial<PlannerPreferences>;

        setThemeTitle(String(parsed.themeTitle || DEFAULT_PLANNER_PREFS.themeTitle));
        setAgeGroup(String(parsed.ageGroup || DEFAULT_PLANNER_PREFS.ageGroup));
        setWeeklyObjectives(String(parsed.weeklyObjectives || DEFAULT_PLANNER_PREFS.weeklyObjectives));
        setDailyMinutes(String(parsed.dailyMinutes || DEFAULT_PLANNER_PREFS.dailyMinutes));
        setBudgetLevel(
          parsed.budgetLevel === 'low' || parsed.budgetLevel === 'high'
            ? parsed.budgetLevel
            : 'medium',
        );
        setIncludeAssessment(
          typeof parsed.includeAssessment === 'boolean'
            ? parsed.includeAssessment
            : DEFAULT_PLANNER_PREFS.includeAssessment,
        );
        setRoutineOptions(normalizeRoutineOptions(parsed.routineOptions));
        setPreflight(normalizePreflight(parsed.preflight));
        setRules(normalizeRules(parsed.rules));
        setSelectedPresetId(
          parsed.selectedPresetId === 'half_day' || parsed.selectedPresetId === 'full_day' || parsed.selectedPresetId === 'aftercare'
            ? parsed.selectedPresetId
            : null,
        );
      } catch (error) {
        console.warn('[PrincipalDailyProgramPlanner] Failed to hydrate planner preferences:', error);
      } finally {
        if (isActive) {
          setPlannerPreferencesReady(true);
        }
      }
    };

    void hydratePreferences();
    return () => {
      isActive = false;
    };
  }, [plannerPreferenceKey]);

  useEffect(() => {
    if (!plannerPreferenceKey || !plannerPreferencesReady) return;

    const payload: PlannerPreferences = {
      themeTitle,
      ageGroup,
      weeklyObjectives,
      dailyMinutes,
      budgetLevel,
      includeAssessment,
      routineOptions,
      preflight,
      rules,
      selectedPresetId,
    };

    void AsyncStorage.setItem(plannerPreferenceKey, JSON.stringify(payload)).catch((error) => {
      console.warn('[PrincipalDailyProgramPlanner] Failed to persist planner preferences:', error);
    });
  }, [
    ageGroup,
    budgetLevel,
    dailyMinutes,
    includeAssessment,
    plannerPreferenceKey,
    plannerPreferencesReady,
    preflight,
    routineOptions,
    rules,
    selectedPresetId,
    themeTitle,
    weeklyObjectives,
  ]);

  const loadPrograms = useCallback(async () => {
    if (!organizationId) {
      setPrograms([]);
      return;
    }

    try {
      const data = await WeeklyProgramService.listWeeklyPrograms({
        preschoolId: organizationId,
        limit: 16,
      });
      setPrograms(data);
    } catch (error: unknown) {
      console.error('Failed to load weekly programs:', error);
    }
  }, [organizationId]);

  useEffect(() => {
    void loadPrograms();
  }, [loadPrograms]);

  useEffect(() => {
    let active = true;

    if (!organizationId) {
      setClassOptions([]);
      return () => {
        active = false;
      };
    }

    const loadClasses = async () => {
      setLoadingClasses(true);
      try {
        const supabase = assertSupabase();
        const { data, error } = await supabase
          .from('classes')
          .select('id, name, grade_level, teacher_id')
          .or(`preschool_id.eq.${organizationId},organization_id.eq.${organizationId}`)
          .order('grade_level', { ascending: true })
          .order('name', { ascending: true });

        if (error) {
          throw error;
        }

        if (!active) return;
        const normalized = (data || []).map((row: any) => ({
          id: String(row.id || ''),
          name: String(row.name || ''),
          gradeLevel: row.grade_level ? String(row.grade_level) : null,
          teacherId: row.teacher_id ? String(row.teacher_id) : null,
        })).filter((row) => row.id);
        setClassOptions(normalized);
      } catch (error) {
        console.warn('[PrincipalDailyProgramPlanner] Failed to load classes:', error);
      } finally {
        if (active) {
          setLoadingClasses(false);
        }
      }
    };

    void loadClasses();
    return () => {
      active = false;
    };
  }, [organizationId]);

  useEffect(() => {
    if (prefillAppliedRef.current) return;
    const hasPrefill =
      Boolean(params.requestId) ||
      Boolean(params.themeTitle) ||
      Boolean(params.ageGroup) ||
      Boolean(params.weekStartDate) ||
      Boolean(params.objectives);
    if (!hasPrefill) return;

    if (params.weekStartDate) {
      setWeekStartDate(startOfWeekMonday(params.weekStartDate));
    }
    if (params.themeTitle) {
      setThemeTitle(String(params.themeTitle));
    }
    if (params.ageGroup) {
      setAgeGroup(String(params.ageGroup));
    }
    if (params.classId) {
      setSelectedClassId(String(params.classId));
    }

    const objectives = parseObjectivesParam(params.objectives);
    if (objectives.length > 0) {
      setWeeklyObjectives(objectives.join(', '));
    }

    prefillAppliedRef.current = true;

    if (params.fromRoutineRequest === '1') {
      showAlert({
        title: 'Request prefilled',
        message: params.requestId
          ? `Routine request ${params.requestId} loaded into planner setup.`
          : 'Routine request details loaded into planner setup.',
        type: 'info',
      });
    }
  }, [
    params.ageGroup,
    params.classId,
    params.fromRoutineRequest,
    params.objectives,
    params.requestId,
    params.themeTitle,
    params.weekStartDate,
    showAlert,
  ]);

  const refreshLessonQuota = useCallback(async () => {
    try {
      const status = await getQuotaStatus('lesson_generation');
      setLessonQuota(status);
    } catch (error) {
      console.warn('[PrincipalDailyProgramPlanner] Failed to load lesson_generation quota:', error);
    }
  }, []);

  useEffect(() => {
    void refreshLessonQuota();
  }, [refreshLessonQuota]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadPrograms(), refreshLessonQuota()]);
    setRefreshing(false);
  }, [loadPrograms, refreshLessonQuota]);

  const loadFromYearPlan = useCallback(async () => {
    if (!organizationId || !weekStartDate.trim()) {
      showAlert({
        title: 'Missing info',
        message: 'Set your week start date first, then load from the year plan.',
        type: 'warning',
      });
      return;
    }
    try {
      const theme = await fetchThemeForWeek(organizationId, weekStartDate.trim());
      if (!theme) {
        showAlert({
          title: 'No theme found',
          message: 'No curriculum theme overlaps this week. Create a theme in the AI Year Planner first.',
          type: 'info',
        });
        return;
      }
      setThemeTitle(theme.title);
      const objectives = Array.isArray(theme.learning_objectives)
        ? theme.learning_objectives.join(', ')
        : typeof theme.learning_objectives === 'string'
          ? theme.learning_objectives
          : '';
      setWeeklyObjectives(objectives);
      showAlert({
        title: 'Loaded from Year Plan',
        message: `Theme "${theme.title}" and objectives have been pre-filled.`,
        type: 'success',
      });
    } catch (error) {
      console.error('[PrincipalDailyProgramPlanner] loadFromYearPlan failed:', error);
      showAlert({
        title: 'Load failed',
        message: 'Could not fetch theme from the year plan. Please try again.',
        type: 'error',
      });
    }
  }, [organizationId, weekStartDate, showAlert]);

  const runGeneration = useCallback(async (mode: 'generate' | 'regenerate') => {
    if (!organizationId || !userId) {
      showAlert({ title: 'Missing profile', message: 'Please sign in again to continue.', type: 'warning' });
      return;
    }

    if (!themeTitle.trim()) {
      showAlert({ title: 'Theme required', message: 'Please add a weekly theme.', type: 'warning' });
      return;
    }

    if (!ageGroup.trim()) {
      showAlert({ title: 'Age group required', message: 'Please specify the learner age group.', type: 'warning' });
      return;
    }

    const safeDailyMinutes = Number(dailyMinutes);
    if (!Number.isFinite(safeDailyMinutes) || safeDailyMinutes < 120) {
      showAlert({
        title: 'Daily minutes too low',
        message: 'Use at least 120 minutes so Dash can build a realistic routine.',
        type: 'warning',
      });
      return;
    }

    if (!preflightComplete) {
      const missing = PREFLIGHT_QUESTIONS
        .filter((question) => String(preflight[question.key] || '').trim().length < 6)
        .map((question) => question.label)
        .join('\n');
      showAlert({
        title: 'Complete Preflight First',
        message: `Answer all five preflight questions before generation:\n\n${missing}`,
        type: 'warning',
      });
      return;
    }

    const pairedModeActive = pairedGenerationEnabled;
    const staggerMinutes = Math.max(5, Math.min(60, Number(pairedStaggerMinutes) || 20));
    if (pairedModeActive) {
      if (!selectedClassId) {
        showAlert({
          title: 'Primary class required',
          message: 'Select the first class group before paired generation.',
          type: 'warning',
        });
        return;
      }
      if (!pairedSecondaryClassId) {
        showAlert({
          title: 'Second class required',
          message: 'Select the second class group for paired generation.',
          type: 'warning',
        });
        return;
      }
      if (pairedSecondaryClassId === selectedClassId) {
        showAlert({
          title: 'Classes must differ',
          message: 'Choose two different class groups for paired generation.',
          type: 'warning',
        });
        return;
      }
      if (classOptions.length < 2) {
        showAlert({
          title: 'Insufficient classes',
          message: 'Create at least two class groups before using paired generation.',
          type: 'warning',
        });
        return;
      }
      if (!Number.isFinite(staggerMinutes) || staggerMinutes < 5) {
        showAlert({
          title: 'Invalid stagger',
          message: 'Use a stagger between 5 and 60 minutes.',
          type: 'warning',
        });
        return;
      }
    }

    setGenerationMode(mode);
    setGenerating(true);

    try {
      const gate = await canUseFeature('lesson_generation', 1);
      setLessonQuota(gate.status);
      if (!gate.allowed) {
        setGenerating(false);
        const message = gate.status.limit > 0
          ? `You have used ${gate.status.used} of ${gate.status.limit} AI routine generations this month.`
          : 'Your monthly AI routine generation limit is reached.';
        showAlert({ title: 'Monthly AI limit reached', message, type: 'warning' });
        return;
      }
    } catch (error) {
      setGenerating(false);
      console.warn('[PrincipalDailyProgramPlanner] Quota check failed:', error);
      showAlert({
        title: 'Quota check unavailable',
        message: 'Could not verify your routine generation quota. Please try again.',
        type: 'warning',
      });
      return;
    }
    try {
      const generated = await WeeklyProgramCopilotService.generateWeeklyProgramFromTerm({
        preschoolId: organizationId,
        createdBy: userId,
        weekStartDate,
        schoolName: schoolName || undefined,
        theme: themeTitle.trim(),
        ageGroup: ageGroup.trim() || '3-6',
        weeklyObjectives: weeklyObjectives
          .split(/[\n,;|]/g)
          .map((item) => item.trim())
          .filter(Boolean),
        preflightAnswers: {
          ...preflight,
        },
        constraints: {
          dailyMinutes: Math.max(120, safeDailyMinutes || 300),
          budgetLevel,
          includeAssessmentBlock: includeAssessment,
          includeToiletRoutine: routineOptions.toiletRoutine,
          includeNapTime: routineOptions.napTime,
          includeMealBlocks: routineOptions.mealBreaks,
          includeOutdoorPlay: routineOptions.outdoorPlay,
          includeStoryCircle: routineOptions.storyCircle,
          includeTransitionCues: routineOptions.transitionCues,
          includeHygieneChecks: routineOptions.hygieneChecks,
          arrivalStartTime: rules.arrivalStartTime,
          arrivalCutoffTime: rules.arrivalCutoffTime,
          pickupStartTime: rules.pickupStartTime,
          pickupCutoffTime: rules.pickupCutoffTime,
        },
      });

      // Keep generation-time normalization single-sourced from the service layer.
      const generatedBlocks = (generated.blocks || []).map((block) => ({ ...block, parent_tip: null }));
      const generatedAssumptions = Array.isArray(generated.generation_context?.assumptionSummary)
        ? generated.generation_context.assumptionSummary
            .map((line) => String(line || '').trim())
            .filter(Boolean)
        : [];
      const mergedAssumptions = Array.from(
        new Set(
          [...generatedAssumptions, ...confirmedAssumptions.map((line) => String(line || '').trim()).filter(Boolean)]
            .map((line) => line.toLowerCase())
        )
      ).map((lower) =>
        [...generatedAssumptions, ...confirmedAssumptions]
          .map((line) => String(line || '').trim())
          .find((line) => line.toLowerCase() === lower) || lower
      );

      const baseDraft: WeeklyProgramDraft = {
        ...generated,
        class_id: selectedClassId,
        title: withSchoolNamedTitle(generated.title, schoolName, themeTitle),
        blocks: generatedBlocks,
        generation_context: {
          ...(generated.generation_context || {}),
          preflight: {
            ...preflight,
          },
          assumptionSummary: mergedAssumptions,
        },
        preschool_id: organizationId,
        created_by: userId,
        week_start_date: startOfWeekMonday(weekStartDate),
        week_end_date: addDays(startOfWeekMonday(weekStartDate), 4),
      };
      const generatedModelUsed = extractDraftModelUsed(baseDraft);

      if (pairedModeActive && selectedClassId && pairedSecondaryClassId) {
        const primaryClass = classOptions.find((option) => option.id === selectedClassId) || null;
        const secondaryClass = classOptions.find((option) => option.id === pairedSecondaryClassId) || null;
        const secondaryBlocks = buildStaggeredClassVariant(generatedBlocks, rules, staggerMinutes);

        const primaryTitleCore = withSchoolNamedTitle(generated.title, schoolName, themeTitle);
        const primaryTitle = primaryClass
          ? `${primaryTitleCore} • ${formatClassLabel(primaryClass)}`
          : primaryTitleCore;
        const secondaryTitle = secondaryClass
          ? `${primaryTitleCore} • ${formatClassLabel(secondaryClass)}`
          : `${primaryTitleCore} • Group 2`;

        const secondaryDraft: WeeklyProgramDraft = {
          ...baseDraft,
          id: undefined,
          class_id: pairedSecondaryClassId,
          title: secondaryTitle,
          generation_context: {
            ...(baseDraft.generation_context || {}),
            assumptionSummary: [
              ...(baseDraft.generation_context?.assumptionSummary || confirmedAssumptions),
              `Secondary class auto-stagger: ${staggerMinutes} minutes for shared-resource blocks (toilet/hygiene/meals).`,
            ],
          },
          blocks: secondaryBlocks,
        };

        const primarySaved = await WeeklyProgramService.saveWeeklyProgram({
          weeklyProgram: {
            ...baseDraft,
            id: undefined,
            class_id: selectedClassId,
            title: primaryTitle,
          },
          rules,
        });
        const secondarySaved = await WeeklyProgramService.saveWeeklyProgram({
          weeklyProgram: secondaryDraft,
          rules,
        });

        setDraft(primarySaved);
        setSaveAdvisory(primarySaved.save_warnings?.[0] || secondarySaved.save_warnings?.[0] || null);
        setDraftViewMode('cards');
        await loadPrograms();

        void incrementUsage('lesson_generation', 1).catch(() => {
          /* best-effort; quota refresh will reflect server state */
        });

        showAlert({
          title: 'Paired plans ready',
          message: `Generated and saved two class-specific routines with a ${staggerMinutes}-minute stagger for shared-resource blocks.\n\nPrimary: ${primaryClass ? formatClassLabel(primaryClass) : 'Class 1'}\nSecondary: ${secondaryClass ? formatClassLabel(secondaryClass) : 'Class 2'}${generatedModelUsed ? `\nModel: ${generatedModelUsed}` : ''}`,
          type: 'success',
        });
        return;
      }

      setDraft(baseDraft);
      setSaveAdvisory(null);
      setDraftViewMode('cards');

      // Count successful generation against quota (school-wide)
      void incrementUsage('lesson_generation', 1).catch(() => {
        /* best-effort; quota refresh will reflect server state */
      });

      if (mode === 'regenerate') {
        showAlert({
          title: 'Draft refreshed',
          message:
            `Dash regenerated this routine using your current setup and preflight answers. Saved plans remain unchanged until you save again.${generatedModelUsed ? `\n\nModel: ${generatedModelUsed}` : ''}`,
          type: 'success',
        });
      } else {
        showAlert({
          title: 'Draft ready',
          message: `AI generated your daily routine. Review and share when ready.${generatedModelUsed ? `\n\nModel: ${generatedModelUsed}` : ''}`,
          type: 'success',
        });
      }
    } catch (error: unknown) {
      showAlert({
        title: 'Generation failed',
        message: error instanceof Error ? error.message : 'Could not generate program.',
        type: 'error',
      });
    } finally {
      setGenerating(false);
      setGenerationMode('generate');
      void refreshLessonQuota();
    }
  }, [
    ageGroup,
    budgetLevel,
    dailyMinutes,
    includeAssessment,
    organizationId,
    routineOptions.hygieneChecks,
    routineOptions.mealBreaks,
    routineOptions.napTime,
    routineOptions.outdoorPlay,
    routineOptions.storyCircle,
    routineOptions.toiletRoutine,
    routineOptions.transitionCues,
    selectedClassId,
    schoolName,
    themeTitle,
    userId,
    weekStartDate,
    weeklyObjectives,
    rules,
    preflight,
    preflightComplete,
    pairedGenerationEnabled,
    pairedSecondaryClassId,
    pairedStaggerMinutes,
    classOptions,
    confirmedAssumptions,
    loadPrograms,
    refreshLessonQuota,
    showAlert,
  ]);

  const generateProgram = useCallback(() => {
    void runGeneration('generate');
  }, [runGeneration]);

  const regenerateProgram = useCallback(() => {
    if (!draft) {
      showAlert({
        title: 'No draft',
        message: 'Generate a routine first, then you can re-generate variations.',
        type: 'warning',
      });
      return;
    }

    showAlert({
      title: 'Re-generate this draft?',
      message:
        'Dash will replace the current draft blocks using your current setup and preflight answers. Saved plans stay unchanged.',
      type: 'info',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Re-generate',
          style: 'destructive',
          onPress: () => void runGeneration('regenerate'),
        },
      ],
    });
  }, [draft, runGeneration, showAlert]);

  const saveDraft = useCallback(async (): Promise<WeeklyProgramDraft | null> => {
    if (!draft) {
      showAlert({ title: 'No draft', message: 'Generate or load a draft first.', type: 'warning' });
      return null;
    }

    if (!organizationId || !userId) {
      showAlert({ title: 'Missing profile', message: 'Please sign in again to continue.', type: 'warning' });
      return null;
    }

    setSaving(true);
    try {
      const saved = await WeeklyProgramService.saveWeeklyProgram({
        weeklyProgram: {
          ...draft,
          class_id: selectedClassId,
          preschool_id: organizationId,
          created_by: userId,
          week_start_date: startOfWeekMonday(draft.week_start_date || weekStartDate),
          week_end_date: addDays(startOfWeekMonday(draft.week_start_date || weekStartDate), 4),
          age_group: draft.age_group || ageGroup,
          title: withSchoolNamedTitle(draft.title || `${themeTitle} Daily Program`, schoolName, themeTitle),
          summary: draft.summary || `${themeTitle} routine plan for the week`,
          status: draft.status || 'draft',
          generation_context: draft.generation_context || {
            preflight: {
              ...preflight,
            },
            assumptionSummary: confirmedAssumptions,
          },
          blocks: (draft.blocks || []).map((block) => ({ ...block, parent_tip: null })),
        },
        rules,
      });

      setDraft(saved);
      setSaveAdvisory(saved.save_warnings?.[0] || null);
      await loadPrograms();
      showAlert({
        title: 'Saved',
        message: saved.save_warnings?.[0]
          ? `Daily routine draft saved.\n\n${saved.save_warnings[0]}`
          : 'Daily routine draft saved successfully.',
        type: 'success',
      });
      return saved;
    } catch (error: unknown) {
      showAlert({
        title: 'Save failed',
        message: error instanceof Error ? error.message : 'Failed to save draft.',
        type: 'error',
      });
      return null;
    } finally {
      setSaving(false);
    }
  }, [ageGroup, draft, loadPrograms, organizationId, schoolName, selectedClassId, themeTitle, userId, weekStartDate, preflight, confirmedAssumptions, rules, showAlert]);

  const shareWithParents = useCallback(async (programOverride?: WeeklyProgramDraft) => {
    const activeProgram = programOverride || draft;
    if (!activeProgram) {
      showAlert({ title: 'No program', message: 'Generate or load a program before sharing.', type: 'warning' });
      return;
    }

    if (!organizationId || !userId) {
      showAlert({ title: 'Missing profile', message: 'Please sign in again to continue.', type: 'warning' });
      return;
    }

    const { normalized, issues } = WeeklyProgramService.validateProgramTimeRules(rules);
    if (issues.length > 0) {
      showAlert({ title: 'Fix time rules', message: issues.join('\n'), type: 'warning' });
      return;
    }

    setSharingParents(true);
    try {
      let programToShare = activeProgram;
      if (!programToShare.id) {
        const saved = await saveDraft();
        if (!saved?.id) {
          setSharingParents(false);
          return;
        }
        programToShare = saved;
      }

      await WeeklyProgramService.shareWeeklyProgramWithParents({
        weeklyProgramId: programToShare.id,
        preschoolId: organizationId,
        sharedBy: userId,
        rules: normalized,
      });

      await loadPrograms();
      showAlert({
        title: 'Shared with Parents',
        message: 'Routine shared with strict arrival and pickup rules. Parents received a published announcement.',
        type: 'success',
      });
    } catch (error: unknown) {
      showAlert({
        title: 'Share failed',
        message: error instanceof Error ? error.message : 'Could not share routine.',
        type: 'error',
      });
    } finally {
      setSharingParents(false);
    }
  }, [draft, loadPrograms, organizationId, rules, saveDraft, userId, showAlert]);

  const openSharePicker = useCallback((programOverride?: WeeklyProgramDraft) => {
    const target = programOverride || draft;
    if (!target) {
      showAlert({ title: 'No program', message: 'Generate or load a program before sharing with teachers.', type: 'warning' });
      return;
    }
    if (!organizationId || !userId) {
      showAlert({ title: 'Missing profile', message: 'Please sign in again to continue.', type: 'warning' });
      return;
    }
    setSharePickerTarget(target);
    setShowSharePicker(true);
  }, [draft, organizationId, userId, showAlert]);

  const shareWithTeachers = useCallback(async (teacherUserIds?: string[], programOverride?: WeeklyProgramDraft) => {
    const activeProgram = programOverride || sharePickerTarget || draft;
    if (!activeProgram) {
      showAlert({
        title: 'No program',
        message: 'Generate or load a program before sharing with teachers.',
        type: 'warning',
      });
      return;
    }

    if (!organizationId || !userId) {
      showAlert({ title: 'Missing profile', message: 'Please sign in again to continue.', type: 'warning' });
      return;
    }

    const { normalized, issues } = WeeklyProgramService.validateProgramTimeRules(rules);
    if (issues.length > 0) {
      showAlert({ title: 'Fix time rules', message: issues.join('\n'), type: 'warning' });
      return;
    }

    setSharingTeachers(true);
    setShowSharePicker(false);
    try {
      let programToShare = activeProgram;
      if (!programToShare.id) {
        const saved = await saveDraft();
        if (!saved?.id) {
          setSharingTeachers(false);
          return;
        }
        programToShare = saved;
      }

      await WeeklyProgramService.shareWeeklyProgramWithTeachers({
        weeklyProgramId: programToShare.id,
        preschoolId: organizationId,
        sharedBy: userId,
        rules: normalized,
        teacherUserIds,
      });

      await loadPrograms();
      const count = teacherUserIds?.length;
      showAlert({
        title: 'Shared with Teachers',
        message: count
          ? `Routine shared with ${count} teacher${count !== 1 ? 's' : ''}. Dashboards and in-app notifications are now updated.`
          : 'Routine shared with all teachers. Dashboards and in-app notifications are now updated.',
        type: 'success',
      });
    } catch (error: unknown) {
      showAlert({
        title: 'Share failed',
        message: error instanceof Error ? error.message : 'Could not share routine with teachers.',
        type: 'error',
      });
    } finally {
      setSharingTeachers(false);
      setSharePickerTarget(null);
    }
  }, [draft, sharePickerTarget, loadPrograms, organizationId, rules, saveDraft, userId, showAlert]);

  const deleteSavedProgram = useCallback(
    (program: WeeklyProgramDraft) => {
      const programId = String(program.id || '').trim();
      if (!programId || !organizationId) {
        showAlert({
          title: 'Delete unavailable',
          message: 'This saved routine could not be identified. Refresh and try again.',
          type: 'warning',
        });
        return;
      }

      showAlert({
        title: 'Delete saved plan?',
        message:
          'This will permanently remove the saved daily routine and its block schedule from the planner.',
        type: 'warning',
        buttons: [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              setDeletingProgramId(programId);
              try {
                await WeeklyProgramService.deleteWeeklyProgram({
                  weeklyProgramId: programId,
                  preschoolId: organizationId,
                });

                setDraft((prev) => (prev?.id === programId ? null : prev));
                setPrograms((prev) => prev.filter((entry) => entry.id !== programId));
                setSaveAdvisory(null);
                await loadPrograms();
                showAlert({ title: 'Deleted', message: 'Saved daily routine deleted.', type: 'success' });
              } catch (error: unknown) {
                showAlert({
                  title: 'Delete failed',
                  message: error instanceof Error ? error.message : 'Could not delete this saved routine.',
                  type: 'error',
                });
              } finally {
                setDeletingProgramId((prev) => (prev === programId ? null : prev));
              }
            },
          },
        ],
      });
    },
    [loadPrograms, organizationId, showAlert],
  );

  const applyPreset = useCallback((preset: 'half_day' | 'full_day' | 'aftercare') => {
    if (preset === 'half_day') {
      setRules({
        arrivalStartTime: '07:30',
        arrivalCutoffTime: '08:30',
        pickupStartTime: '12:30',
        pickupCutoffTime: '13:30',
      });
      return;
    }

    if (preset === 'aftercare') {
      setRules({
        arrivalStartTime: '12:30',
        arrivalCutoffTime: '13:30',
        pickupStartTime: '17:00',
        pickupCutoffTime: '18:00',
      });
      return;
    }

    setRules({
      arrivalStartTime: '07:00',
      arrivalCutoffTime: '08:30',
      pickupStartTime: '16:00',
      pickupCutoffTime: '17:00',
    });
  }, []);

  const applySmartPreset = useCallback((preset: PlannerPreset) => {
    setSelectedPresetId(preset.id);
    setThemeTitle(preset.themeTitle);
    setAgeGroup(preset.ageGroup);
    setDailyMinutes(preset.dailyMinutes);
    setWeeklyObjectives(preset.weeklyObjectives);
    setBudgetLevel(preset.budgetLevel);
    setIncludeAssessment(preset.includeAssessment);
    setRoutineOptions(routineOptionsForPreset(preset.id));
    setRules(preset.rules);
  }, []);

  const toggleRoutineOption = useCallback((id: RoutineOptionId) => {
    setRoutineOptions((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const addObjectiveChip = useCallback((value: string) => {
    setWeeklyObjectives((prev) => {
      const existing = prev
        .split(/[\n,;|]/g)
        .map((item) => item.trim())
        .filter(Boolean);
      if (existing.some((item) => item.toLowerCase() === value.toLowerCase())) {
        return prev;
      }
      return [...existing, value].join(', ');
    });
  }, []);

  const updateDraftBlock = useCallback((day: number, order: number, patch: Partial<DailyProgramBlock>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        blocks: prev.blocks.map((block) => {
          if (block.day_of_week !== day || block.block_order !== order) return block;
          return { ...block, ...patch };
        }),
      };
    });
  }, []);

  const addBlockForDay = useCallback((day: number) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const dayBlocks = prev.blocks.filter((block) => block.day_of_week === day);
      const nextOrder = dayBlocks.length > 0 ? Math.max(...dayBlocks.map((block) => block.block_order)) + 1 : 1;

      return {
        ...prev,
        blocks: [
          ...prev.blocks,
          {
            day_of_week: day as 1 | 2 | 3 | 4 | 5 | 6 | 7,
            block_order: nextOrder,
            block_type: 'learning',
            title: `Block ${nextOrder}`,
            start_time: null,
            end_time: null,
            objectives: [],
            materials: [],
            transition_cue: null,
            notes: null,
            parent_tip: null,
          },
        ],
      };
    });
  }, []);

  const removeBlock = useCallback((day: number, order: number) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const remaining = prev.blocks
        .filter((block) => !(block.day_of_week === day && block.block_order === order))
        .map((block) => ({ ...block }));
      return { ...prev, blocks: remaining };
    });
  }, []);

  const moveBlock = useCallback((day: number, order: number, direction: 'up' | 'down') => {
    setDraft((prev) => {
      if (!prev) return prev;
      const dayBlocks = prev.blocks
        .filter((b) => b.day_of_week === day)
        .slice()
        .sort((a, b) => a.block_order - b.block_order);

      const idx = dayBlocks.findIndex((b) => b.block_order === order);
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= dayBlocks.length) return prev;

      const newDayBlocks = [...dayBlocks];
      [newDayBlocks[idx], newDayBlocks[swapIdx]] = [newDayBlocks[swapIdx], newDayBlocks[idx]];
      const reordered = newDayBlocks.map((b, i) => ({ ...b, block_order: i + 1 }));

      const otherBlocks = prev.blocks.filter((b) => b.day_of_week !== day);
      return { ...prev, blocks: [...otherBlocks, ...reordered] };
    });
  }, []);

  const copyBlockToAllDays = useCallback((day: number, order: number) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const source = prev.blocks.find((b) => b.day_of_week === day && b.block_order === order);
      if (!source) return prev;

      const allDays = [1, 2, 3, 4, 5] as const;
      let blocks = [...prev.blocks];
      for (const d of allDays) {
        if (d === day) continue;
        const existing = blocks.filter((b) => b.day_of_week === d);
        const nextOrder = existing.length > 0 ? Math.max(...existing.map((b) => b.block_order)) + 1 : 1;
        blocks.push({ ...source, day_of_week: d, block_order: nextOrder });
      }
      return { ...prev, blocks };
    });
    showAlert({ title: 'Copied', message: 'Block copied to all other weekdays.', type: 'success' });
  }, [showAlert]);

  const loadProgramIntoEditor = useCallback(
    (program: WeeklyProgramDraft, options?: { skipAlert?: boolean }) => {
      const rawTitle = String(program.title || '').trim();
      const normalizedTheme = (() => {
        if (!rawTitle) return '';
        if (!schoolName) return rawTitle;
        const schoolPrefix = `${schoolName.toLowerCase()}:`;
        const lower = rawTitle.toLowerCase();
        if (lower.startsWith(schoolPrefix)) {
          return rawTitle.slice(schoolPrefix.length).trim();
        }
        return rawTitle;
      })();
      setSelectedPresetId(null);
      setWeekStartDate(startOfWeekMonday(program.week_start_date));
      setSelectedClassId(program.class_id ? String(program.class_id) : null);
      setThemeTitle(normalizedTheme || themeTitle);
      setAgeGroup(program.age_group || '3-6');
      setDailyMinutes('300');
      setWeeklyObjectives(program.summary || weeklyObjectives);
      const maybePreflight = (program as any)?.generation_context?.preflight;
      if (maybePreflight && typeof maybePreflight === 'object') {
        setPreflight({
          nonNegotiableAnchors: String((maybePreflight as any).nonNegotiableAnchors || ''),
          fixedWeeklyEvents: String((maybePreflight as any).fixedWeeklyEvents || ''),
          afterLunchPattern: String((maybePreflight as any).afterLunchPattern || ''),
          resourceConstraints: String((maybePreflight as any).resourceConstraints || ''),
          safetyCompliance: String((maybePreflight as any).safetyCompliance || ''),
        });
      }
      setDraft(program);
      setDraftViewMode('edit');
      if (!options?.skipAlert) {
        showAlert({ title: 'Loaded', message: 'Program loaded into editor.', type: 'success' });
      }
    },
    [schoolName, themeTitle, weeklyObjectives, showAlert],
  );

  const regenerateFromSavedProgram = useCallback(
    (program: WeeklyProgramDraft) => {
      setProgramToRegenerateAfterLoad(program);
      loadProgramIntoEditor(program, { skipAlert: true });
    },
    [loadProgramIntoEditor],
  );

  useEffect(() => {
    if (!programToRegenerateAfterLoad || !draft?.id || draft.id !== programToRegenerateAfterLoad.id) return;
    setProgramToRegenerateAfterLoad(null);
    void runGeneration('regenerate');
  }, [programToRegenerateAfterLoad, draft?.id, runGeneration]);

  const programStats = useMemo(() => {
    const draftBlocks = draft?.blocks || [];
    const totalBlocks = draftBlocks.length;
    const withTimesCount = draftBlocks.filter((block) => !!block.start_time && !!block.end_time).length;
    return { totalBlocks, withTimesCount };
  }, [draft?.blocks]);

  const selectedClassOption = useMemo(
    () => classOptions.find((option) => option.id === selectedClassId) || null,
    [classOptions, selectedClassId],
  );
  const pairedSecondaryClassOptions = useMemo(
    () => classOptions.filter((option) => option.id !== selectedClassId),
    [classOptions, selectedClassId],
  );
  const pairedSecondaryClassOption = useMemo(
    () => classOptions.find((option) => option.id === pairedSecondaryClassId) || null,
    [classOptions, pairedSecondaryClassId],
  );

  useEffect(() => {
    if (!pairedGenerationEnabled) return;
    if (!selectedClassId) {
      setPairedSecondaryClassId(null);
      return;
    }
    if (pairedSecondaryClassId && pairedSecondaryClassId !== selectedClassId) return;
    const fallback = classOptions.find((option) => option.id !== selectedClassId)?.id || null;
    setPairedSecondaryClassId(fallback);
  }, [classOptions, pairedGenerationEnabled, pairedSecondaryClassId, selectedClassId]);

  const capsCoverage = useMemo(() => {
    const rawCoverage = (draft?.generation_context as any)?.capsCoverage;
    if (!rawCoverage || typeof rawCoverage !== 'object') return null;

    return {
      homeLanguageDays: Array.isArray(rawCoverage.homeLanguageDays) ? rawCoverage.homeLanguageDays : [],
      mathematicsDays: Array.isArray(rawCoverage.mathematicsDays) ? rawCoverage.mathematicsDays : [],
      lifeSkillsDays: Array.isArray(rawCoverage.lifeSkillsDays) ? rawCoverage.lifeSkillsDays : [],
      weatherRoutineDays: Array.isArray(rawCoverage.weatherRoutineDays) ? rawCoverage.weatherRoutineDays : [],
      missingByDay: Array.isArray(rawCoverage.missingByDay) ? rawCoverage.missingByDay : [],
      coverageScore: Number(rawCoverage.coverageScore) || 0,
    };
  }, [draft?.generation_context]);

  const activeGenerationModel = useMemo(() => extractDraftModelUsed(draft), [draft]);

  const recentThemeSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const suggestions: string[] = [];
    for (const program of programs) {
      const title = String(program.title || '').trim();
      if (!title || seen.has(title.toLowerCase())) continue;
      seen.add(title.toLowerCase());
      suggestions.push(title);
      if (suggestions.length >= 3) break;
    }
    return suggestions;
  }, [programs]);

  const ruleValidation = useMemo(
    () => WeeklyProgramService.validateProgramTimeRules(rules),
    [rules]
  );

  const draftInsights = useMemo(() => {
    const blocks = draft?.blocks || [];
    const missingTimes = blocks.filter((block) => !block.start_time || !block.end_time).length;
    const missingTitles = blocks.filter((block) => !String(block.title || '').trim()).length;

    const blockHasKeywords = (keywords: string[]) =>
      blocks.some((block) => {
        const haystack = [
          block.block_type,
          block.title,
          block.notes,
          block.transition_cue,
        ]
          .map((value) => String(value || '').toLowerCase())
          .join(' ');
        return keywords.some((keyword) => haystack.includes(keyword));
      });

    const missingEssentials: string[] = [];
    const preflightToiletText = [
      preflight.nonNegotiableAnchors,
      preflight.fixedWeeklyEvents,
      preflight.afterLunchPattern,
    ]
      .map((value) => String(value || '').toLowerCase())
      .join(' ');
    const hasToiletLanguage = ['toilet', 'bathroom', 'potty', 'washroom'].some((keyword) =>
      preflightToiletText.includes(keyword),
    );
    const wordCountMap: Record<string, number> = {
      one: 1,
      two: 2,
      three: 3,
      four: 4,
      five: 5,
      six: 6,
    };
    const numericToiletCounts = [
      ...Array.from(preflightToiletText.matchAll(/(\d+)\s*(?:x|times?)\s*(?:a\s*day|daily|per\s*day)?\s*(?:toilet|bathroom|potty)?/g)).map(
        (match) => Number(match[1]),
      ),
      ...Array.from(preflightToiletText.matchAll(/(\d+)\s*(?:toilet|bathroom|potty)\s*routines?/g)).map(
        (match) => Number(match[1]),
      ),
      ...Array.from(preflightToiletText.matchAll(/(?:toilet|bathroom|potty)\s*routines?\s*(\d+)/g)).map(
        (match) => Number(match[1]),
      ),
    ];
    const wordToiletCounts = Array.from(
      preflightToiletText.matchAll(/\b(one|two|three|four|five|six)\b\s*(?:toilet|bathroom|potty)?\s*routines?\b/g),
    ).map((match) => wordCountMap[match[1]] || 0);
    const parsedToiletCounts = [...numericToiletCounts, ...wordToiletCounts]
      .filter((value) => Number.isFinite(value) && value > 0)
      .map((value) => Math.min(6, Math.max(1, Math.trunc(value))));
    const toiletAnchorBeforeBreakfast =
      hasToiletLanguage && /(?:before|pre-)\s*breakfast/.test(preflightToiletText);
    const toiletAnchorBeforeLunch =
      hasToiletLanguage && /(?:before|pre-)\s*lunch/.test(preflightToiletText);
    const toiletAnchorBeforeNap =
      hasToiletLanguage && /(?:before|pre-)\s*(?:nap|quiet\s*time|rest)/.test(preflightToiletText);
    const inferredAnchorCount =
      Number(toiletAnchorBeforeBreakfast) + Number(toiletAnchorBeforeLunch) + Number(toiletAnchorBeforeNap);
    const requiredToiletPerDay = routineOptions.toiletRoutine
      ? Math.max(1, parsedToiletCounts.length > 0 ? Math.max(...parsedToiletCounts) : 1, inferredAnchorCount)
      : 0;

    const dayBlocksByDay = new Map<number, DailyProgramBlock[]>();
    DAY_ORDER.forEach((day) => dayBlocksByDay.set(day, []));
    blocks.forEach((block) => {
      const day = Number(block.day_of_week);
      if (!DAY_ORDER.includes(day as (typeof DAY_ORDER)[number])) return;
      dayBlocksByDay.get(day)?.push(block);
    });

    if (requiredToiletPerDay > 0) {
      const missingToiletDays = DAY_ORDER.filter((day) => {
        const dayBlocks = dayBlocksByDay.get(day) || [];
        const toiletCount = dayBlocks.filter((block) => {
          const haystack = [
            block.block_type,
            block.title,
            block.notes,
            block.transition_cue,
          ]
            .map((value) => String(value || '').toLowerCase())
            .join(' ');
          return ['toilet', 'bathroom', 'potty', 'washroom'].some((keyword) => haystack.includes(keyword));
        }).length;
        return toiletCount < requiredToiletPerDay;
      });
      if (missingToiletDays.length > 0) {
        missingEssentials.push(
          `Toilet Routine (${requiredToiletPerDay}x daily missing: ${missingToiletDays
            .map((day) => DAY_LABELS[day])
            .join(', ')})`,
        );
      }

      const dayHasToiletBeforeAnchor = (dayBlocks: DailyProgramBlock[], anchorKeywords: string[]) => {
        const normalized = dayBlocks
          .slice()
          .sort((a, b) => Number(a.block_order || 0) - Number(b.block_order || 0));
        const anchorIndex = normalized.findIndex((block) => {
          const haystack = [
            block.block_type,
            block.title,
            block.notes,
            block.transition_cue,
          ]
            .map((value) => String(value || '').toLowerCase())
            .join(' ');
          return anchorKeywords.some((keyword) => haystack.includes(keyword));
        });
        if (anchorIndex < 0) return true;
        return normalized.slice(0, anchorIndex).some((block) => {
          const haystack = [
            block.block_type,
            block.title,
            block.notes,
            block.transition_cue,
          ]
            .map((value) => String(value || '').toLowerCase())
            .join(' ');
          return ['toilet', 'bathroom', 'potty', 'washroom'].some((keyword) => haystack.includes(keyword));
        });
      };

      if (toiletAnchorBeforeBreakfast) {
        const invalidDays = DAY_ORDER.filter((day) =>
          !dayHasToiletBeforeAnchor(dayBlocksByDay.get(day) || [], ['breakfast']),
        );
        if (invalidDays.length > 0) {
          missingEssentials.push(`Toilet before breakfast (${invalidDays.map((day) => DAY_LABELS[day]).join(', ')})`);
        }
      }

      if (toiletAnchorBeforeLunch) {
        const invalidDays = DAY_ORDER.filter((day) =>
          !dayHasToiletBeforeAnchor(dayBlocksByDay.get(day) || [], ['lunch']),
        );
        if (invalidDays.length > 0) {
          missingEssentials.push(`Toilet before lunch (${invalidDays.map((day) => DAY_LABELS[day]).join(', ')})`);
        }
      }

      if (toiletAnchorBeforeNap) {
        const invalidDays = DAY_ORDER.filter((day) =>
          !dayHasToiletBeforeAnchor(dayBlocksByDay.get(day) || [], ['nap', 'quiet time', 'rest']),
        );
        if (invalidDays.length > 0) {
          missingEssentials.push(`Toilet before nap (${invalidDays.map((day) => DAY_LABELS[day]).join(', ')})`);
        }
      }
    }
    if (routineOptions.napTime && !blockHasKeywords([' nap', 'quiet time', 'rest'])) {
      missingEssentials.push('Nap / Quiet Time');
    }
    if (routineOptions.mealBreaks && !blockHasKeywords(['meal', 'snack', 'breakfast', 'lunch'])) {
      missingEssentials.push('Meals & Snacks');
    }
    if (routineOptions.outdoorPlay && !blockHasKeywords(['outdoor', 'outside', 'gross motor'])) {
      missingEssentials.push('Outdoor Play');
    }
    if (routineOptions.storyCircle && !blockHasKeywords(['story', 'circle time', 'read aloud', 'reading'])) {
      missingEssentials.push('Story / Circle Time');
    }
    if (routineOptions.transitionCues && !blocks.some((block) => String(block.transition_cue || '').trim().length > 0)) {
      missingEssentials.push('Transition Cues');
    }
    if (routineOptions.hygieneChecks && !blockHasKeywords(['hygiene', 'handwash', 'hand wash', 'cleanup', 'clean-up'])) {
      missingEssentials.push('Hygiene Routines');
    }

    const arrivalStart = toMinutes(ruleValidation.normalized.arrivalStartTime);
    const pickupCutoff = toMinutes(ruleValidation.normalized.pickupCutoffTime);
    const outOfWindow = blocks.filter((block) => {
      const start = block.start_time ? toMinutes(String(block.start_time)) : null;
      const end = block.end_time ? toMinutes(String(block.end_time)) : null;
      if (start === null || end === null || arrivalStart === null || pickupCutoff === null) return false;
      return start < arrivalStart || end > pickupCutoff;
    }).length;

    const shortDays = DAY_ORDER.filter((day) => {
      const dayBlocks = blocks.filter((block) => Number(block.day_of_week) === day);
      if (dayBlocks.length === 0) return true;

      let latestEnd: number | null = null;
      for (const block of dayBlocks) {
        const end = block.end_time ? toMinutes(String(block.end_time)) : null;
        if (end !== null && (latestEnd === null || end > latestEnd)) {
          latestEnd = end;
        }
      }

      return latestEnd === null || latestEnd < MIN_DAY_END_MINUTES;
    });

    const overlapDays = DAY_ORDER.filter((day) =>
      countRoutineDayOverlaps(dayBlocksByDay.get(day) || []) > 0,
    );
    if (overlapDays.length > 0) {
      missingEssentials.push(`Overlapping time ranges (${overlapDays.map((day) => DAY_LABELS[day]).join(', ')})`);
    }

    const duplicateLunchDays = DAY_ORDER.filter((day) => {
      const dayBlocks = dayBlocksByDay.get(day) || [];
      const lunchCount = dayBlocks.filter((block) => classifyRoutineBlockIntent(block) === 'lunch').length;
      return lunchCount > 1;
    });
    if (duplicateLunchDays.length > 0) {
      missingEssentials.push(`Duplicate Lunch blocks (${duplicateLunchDays.map((day) => DAY_LABELS[day]).join(', ')})`);
    }

    if (isAgeGroupFourToSix(ageGroup)) {
      const duplicateNapDays = DAY_ORDER.filter((day) => {
        const dayBlocks = dayBlocksByDay.get(day) || [];
        const napCount = dayBlocks.filter((block) => classifyRoutineBlockIntent(block) === 'nap').length;
        return napCount > 1;
      });
      if (duplicateNapDays.length > 0) {
        missingEssentials.push(`More than one Nap / Quiet Time block (${duplicateNapDays.map((day) => DAY_LABELS[day]).join(', ')})`);
      }
    }

    const outOfPolicyCountDays = DAY_ORDER.filter((day) => {
      const count = (dayBlocksByDay.get(day) || []).length;
      return count < 6 || count > 10;
    });
    if (outOfPolicyCountDays.length > 0) {
      missingEssentials.push(`Block count must be 6-10 per day (${outOfPolicyCountDays.map((day) => DAY_LABELS[day]).join(', ')})`);
    }

    return {
      total: blocks.length,
      missingTimes,
      missingTitles,
      outOfWindow,
      shortDaysCount: shortDays.length,
      shortDays,
      missingEssentialsCount: missingEssentials.length,
      missingEssentials,
    };
  }, [
    draft?.blocks,
    preflight.afterLunchPattern,
    preflight.fixedWeeklyEvents,
    preflight.nonNegotiableAnchors,
    routineOptions.hygieneChecks,
    routineOptions.mealBreaks,
    routineOptions.napTime,
    routineOptions.outdoorPlay,
    routineOptions.storyCircle,
    routineOptions.toiletRoutine,
    routineOptions.transitionCues,
    ageGroup,
    ruleValidation.normalized.arrivalStartTime,
    ruleValidation.normalized.pickupCutoffTime,
  ]);

  const setupReady = Boolean(themeTitle.trim()) && Boolean(ageGroup.trim()) && (Number(dailyMinutes) || 0) >= 120;
  const draftReady = draftInsights.total > 0;
  const shareReady =
    draftReady &&
    draftInsights.missingTimes === 0 &&
    draftInsights.missingTitles === 0 &&
    draftInsights.outOfWindow === 0 &&
    draftInsights.shortDaysCount === 0 &&
    draftInsights.missingEssentialsCount === 0;

  const readinessScore = useMemo(() => {
    let score = 0;
    if (setupReady) score += 20;
    if (preflightComplete) score += 20;
    if (ruleValidation.issues.length === 0) score += 20;
    if (draftReady) score += 20;
    if (shareReady) score += 20;
    return Math.min(100, score);
  }, [draftReady, preflightComplete, ruleValidation.issues.length, setupReady, shareReady]);

  const readinessTone = readinessScore >= 80
    ? '#10b981'
    : readinessScore >= 50
      ? '#f59e0b'
      : '#ef4444';

  const canGenerate = setupReady && preflightComplete;

  const showPreflightIncompleteBanner = useMemo(() => {
    if (!draft) return false;
    const maybePreflight = (draft as any)?.generation_context?.preflight;
    if (!maybePreflight || typeof maybePreflight !== 'object') return true;
    return PREFLIGHT_QUESTIONS.some(
      (q) => String((maybePreflight as any)[q.key] || '').trim().length < 6
    );
  }, [draft]);

  return (
    <DesktopLayout role="principal" title="AI Daily Routine Planner" showBackButton>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <LinearGradient
          colors={[theme.primary + '30', theme.primary + '12', theme.background]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroTopRow}>
            <View style={styles.heroIconWrap}>
              <Ionicons name="sparkles" size={22} color={theme.primary} />
            </View>
            <Text style={styles.heroTag}>AI Copilot</Text>
          </View>
          <Text style={styles.heroTitle}>Daily Routine & Program Helper</Text>
          <Text style={styles.heroSubtitle}>
            Generate a robust CAPS-aligned school routine, lock strict arrival/pickup windows, and share it with parents in one publish flow.
          </Text>

          <View style={[styles.statsRow, isCompactLayout && styles.statsRowCompact]}>
            <View style={[styles.statPill, isCompactLayout && styles.statPillCompact, isUltraCompact && styles.statPillFull]}>
              <Text style={styles.statLabel}>Blocks</Text>
              <Text style={styles.statValue}>{programStats.totalBlocks}</Text>
            </View>
            <View style={[styles.statPill, isCompactLayout && styles.statPillCompact, isUltraCompact && styles.statPillFull]}>
              <Text style={styles.statLabel}>AI Remaining</Text>
              <Text style={styles.statValue}>
                {lessonQuota
                  ? lessonQuota.limit < 0
                    ? 'Unlimited'
                    : `${Math.max(0, lessonQuota.remaining)}/${lessonQuota.limit}`
                  : '--'}
              </Text>
            </View>
            <View style={[styles.statPill, isCompactLayout && styles.statPillCompact, isUltraCompact && styles.statPillFull]}>
              <Text style={styles.statLabel}>Saved Plans</Text>
              <Text style={styles.statValue}>{programs.length}</Text>
            </View>
          </View>

          {(lessonQuota?.source === 'fallback' || lessonQuota?.serverReachable === false) && (
            <View style={styles.usageFallbackBanner}>
              <Ionicons name="cloud-offline-outline" size={14} color="#f59e0b" />
              <Text style={styles.usageFallbackText}>
                Server usage unavailable. Showing local estimate until sync recovers.
              </Text>
            </View>
          )}

          <View style={styles.heroLinkRow}>
            <TouchableOpacity
              style={styles.heroLinkChip}
              onPress={() => router.push('/screens/principal-routine-requests')}
            >
              <Ionicons name="clipboard-outline" size={13} color={theme.primary} />
              <Text style={styles.heroLinkText}>Requests Inbox</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.heroLinkChip}
              onPress={() => router.push('/screens/principal-weekly-plans')}
            >
              <Ionicons name="albums-outline" size={13} color={theme.primary} />
              <Text style={styles.heroLinkText}>Saved routines</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.readinessWrap}>
            <View style={styles.readinessHeader}>
              <Text style={styles.readinessLabel}>Publish Readiness</Text>
              <Text style={[styles.readinessValue, { color: readinessTone }]}>{readinessScore}%</Text>
            </View>
            <View style={styles.readinessTrack}>
              <View style={[styles.readinessFill, { width: `${readinessScore}%`, backgroundColor: readinessTone }]} />
            </View>
            <Text style={styles.readinessHint}>
              {shareReady
                ? 'Ready to share with parents.'
                : 'Complete setup, validate rules, and review blocks to publish confidently.'}
            </Text>
            {lessonQuota && lessonQuota.limit > 0 && (
              <Text style={styles.readinessHint}>
                AI usage this month: {lessonQuota.used}/{lessonQuota.limit}
              </Text>
            )}
          </View>
        </LinearGradient>

        {showPreflightIncompleteBanner && (
          <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: '#f59e0b' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="warning" size={20} color="#f59e0b" />
              <Text style={[styles.sectionTitle, { color: '#b45309' }]}>Preflight data missing</Text>
            </View>
            <Text style={styles.sectionHint}>
              This program was loaded without preflight assumptions. Re-enter your answers in the Mandatory Preflight section below before regenerating.
            </Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Smart Quick Start</Text>
          <Text style={styles.sectionHint}>One tap applies a full setup profile with matching strict time rules.</Text>
          <View style={styles.presetGrid}>
            {SMART_PRESETS.map((preset) => (
              <TouchableOpacity
                key={preset.id}
                style={[
                  styles.presetCard,
                  isCompactLayout && styles.presetCardCompact,
                  isUltraCompact && styles.presetCardSingleColumn,
                  selectedPresetId === preset.id && styles.presetCardActive,
                ]}
                onPress={() => applySmartPreset(preset)}
              >
                <Text style={[styles.presetCardTitle, selectedPresetId === preset.id && styles.presetCardTitleActive]}>
                  {preset.label}
                </Text>
                <Text style={styles.presetCardCaption}>{preset.caption}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {programs.length > 0 && (
            <TouchableOpacity
              style={styles.inlineBtn}
              onPress={() => loadProgramIntoEditor(programs[0])}
            >
              <Ionicons name="time-outline" size={14} color={theme.primary} />
              <Text style={styles.inlineBtnText}>Load most recent saved plan</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Program Setup</Text>
          <Text style={styles.sectionHint}>Set core details first. Dash uses this context to generate better daily blocks.</Text>
          {!!schoolName && (
            <View style={styles.schoolNamePill}>
              <Ionicons name="business-outline" size={14} color={theme.primary} />
              <Text style={styles.schoolNamePillText}>School: {schoolName}</Text>
            </View>
          )}
          <Text style={styles.fieldLabel}>Routine Scope</Text>
          <Text style={styles.fieldSubHint}>
            Use School-wide for shared activities, or select a class group to generate and share a class-specific routine.
          </Text>
          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.togglePill, !selectedClassId && styles.togglePillActive]}
              onPress={() => setSelectedClassId(null)}
            >
              <Text style={[styles.toggleText, !selectedClassId && styles.toggleTextActive]}>School-wide</Text>
            </TouchableOpacity>
          </View>
          {loadingClasses ? (
            <Text style={styles.sectionHint}>Loading class groups...</Text>
          ) : classOptions.length > 0 ? (
            <View style={styles.chipRow}>
              {classOptions.map((option) => {
                const isActive = selectedClassId === option.id;
                return (
                  <TouchableOpacity
                    key={option.id}
                    style={[styles.quickChipGhost, isActive && styles.togglePillActive]}
                    onPress={() => setSelectedClassId(option.id)}
                  >
                    <Text style={[styles.quickChipGhostText, isActive && styles.toggleTextActive]}>
                      {formatClassLabel(option)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <Text style={styles.sectionHint}>No class groups found yet. Create classes to use class-specific routines.</Text>
          )}
          {selectedClassOption ? (
            <View style={styles.schoolNamePill}>
              <Ionicons name="people-outline" size={14} color={theme.primary} />
              <Text style={styles.schoolNamePillText}>
                Selected Class: {formatClassLabel(selectedClassOption)}
                {selectedClassOption.teacherId ? '' : ' (No teacher assigned yet)'}
              </Text>
            </View>
          ) : null}
          {classOptions.length > 1 && (
            <>
              <View style={styles.toggleRow}>
                <TouchableOpacity
                  style={[styles.togglePill, pairedGenerationEnabled && styles.togglePillActive]}
                  onPress={() => setPairedGenerationEnabled((prev) => !prev)}
                >
                  <Text style={[styles.toggleText, pairedGenerationEnabled && styles.toggleTextActive]}>
                    Paired Class Generation
                  </Text>
                </TouchableOpacity>
              </View>
              {pairedGenerationEnabled && (
                <>
                  <Text style={styles.fieldSubHint}>
                    Generate two class plans from one copilot run. Shared-resource blocks (toilet/hygiene/meals) are staggered automatically.
                  </Text>
                  <Text style={styles.fieldLabel}>Second Class Group</Text>
                  <View style={styles.chipRow}>
                    {pairedSecondaryClassOptions.map((option) => {
                      const isActive = pairedSecondaryClassId === option.id;
                      return (
                        <TouchableOpacity
                          key={option.id}
                          style={[styles.quickChipGhost, isActive && styles.togglePillActive]}
                          onPress={() => setPairedSecondaryClassId(option.id)}
                        >
                          <Text style={[styles.quickChipGhostText, isActive && styles.toggleTextActive]}>
                            {formatClassLabel(option)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {pairedSecondaryClassOption ? (
                    <View style={styles.schoolNamePill}>
                      <Ionicons name="git-network-outline" size={14} color={theme.primary} />
                      <Text style={styles.schoolNamePillText}>
                        Secondary Class: {formatClassLabel(pairedSecondaryClassOption)}
                      </Text>
                    </View>
                  ) : null}
                  <Text style={styles.fieldLabel}>Stagger Minutes (5-60)</Text>
                  <TextInput
                    style={styles.input}
                    value={pairedStaggerMinutes}
                    onChangeText={(value) => setPairedStaggerMinutes(value.replace(/[^\d]/g, '').slice(0, 2))}
                    placeholder="20"
                    keyboardType="number-pad"
                    placeholderTextColor={theme.textSecondary}
                  />
                </>
              )}
            </>
          )}
          <Text style={styles.fieldLabel}>Week Start (Monday)</Text>
          <TextInput
            style={styles.input}
            value={weekStartDate}
            onChangeText={(value) => setWeekStartDate(value)}
            placeholder="Week start (YYYY-MM-DD)"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
          />
          <Text style={styles.fieldLabel}>Theme</Text>
          <TextInput
            style={styles.input}
            value={themeTitle}
            onChangeText={setThemeTitle}
            placeholder="Weekly theme"
            placeholderTextColor={theme.textSecondary}
          />
          <View style={styles.chipRow}>
            {THEME_SUGGESTIONS.map((themeChip) => (
              <TouchableOpacity key={themeChip} style={styles.quickChip} onPress={() => setThemeTitle(themeChip)}>
                <Text style={styles.quickChipText}>{themeChip}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {recentThemeSuggestions.length > 0 && (
            <View style={styles.chipRow}>
              {recentThemeSuggestions.map((themeChip) => (
                <TouchableOpacity key={themeChip} style={styles.quickChipGhost} onPress={() => setThemeTitle(themeChip)}>
                  <Text style={styles.quickChipGhostText}>Recent: {themeChip}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <TouchableOpacity style={styles.inlineBtn} onPress={loadFromYearPlan}>
            <Ionicons name="calendar-outline" size={14} color={theme.primary} />
            <Text style={styles.inlineBtnText}>Load from Year Plan</Text>
          </TouchableOpacity>

          <View style={[styles.row, isCompactLayout && styles.rowStack]}>
            <View style={styles.halfInput}>
              <Text style={styles.fieldLabel}>Age Group</Text>
              <TextInput
                style={styles.input}
                value={ageGroup}
                onChangeText={setAgeGroup}
                placeholder="Age group"
                placeholderTextColor={theme.textSecondary}
              />
            </View>
            <View style={styles.halfInput}>
              <Text style={styles.fieldLabel}>Daily Minutes</Text>
              <TextInput
                style={styles.input}
                value={dailyMinutes}
                onChangeText={setDailyMinutes}
                placeholder="Daily minutes"
                keyboardType="number-pad"
                placeholderTextColor={theme.textSecondary}
              />
            </View>
          </View>

          <Text style={styles.fieldLabel}>Weekly Objectives</Text>
          <TextInput
            style={styles.input}
            value={weeklyObjectives}
            onChangeText={setWeeklyObjectives}
            placeholder="Objectives (comma-separated)"
            placeholderTextColor={theme.textSecondary}
            multiline
          />
          <View style={styles.chipRow}>
            {OBJECTIVE_SUGGESTIONS.map((objectiveChip) => (
              <TouchableOpacity
                key={objectiveChip}
                style={styles.quickChip}
                onPress={() => addObjectiveChip(objectiveChip)}
              >
                <Text style={styles.quickChipText}>+ {objectiveChip}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Routine Essentials</Text>
          <Text style={styles.fieldSubHint}>
            Select routines that must appear in the generated plan. Dash will enforce these as daily anchors.
          </Text>
          <View style={styles.essentialsGrid}>
            {ROUTINE_ESSENTIALS.map((option) => {
              const active = routineOptions[option.id];
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[
                    styles.essentialChip,
                    isCompactLayout && styles.essentialChipCompact,
                    isUltraCompact && styles.essentialChipSingleColumn,
                    active && styles.essentialChipActive,
                  ]}
                  onPress={() => toggleRoutineOption(option.id)}
                >
                  <Text style={[styles.essentialLabel, active && styles.essentialLabelActive]}>{option.label}</Text>
                  <Text style={styles.essentialHint}>{option.hint}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.togglePill, includeAssessment && styles.togglePillActive]}
              onPress={() => setIncludeAssessment((prev) => !prev)}
            >
              <Text style={[styles.toggleText, includeAssessment && styles.toggleTextActive]}>CAPS Assessment Block</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.toggleRow}>
            {(['low', 'medium', 'high'] as const).map((level) => (
              <TouchableOpacity
                key={level}
                style={[styles.togglePill, budgetLevel === level && styles.togglePillActive]}
                onPress={() => setBudgetLevel(level)}
              >
                <Text style={[styles.toggleText, budgetLevel === level && styles.toggleTextActive]}>
                  {level.charAt(0).toUpperCase() + level.slice(1)} Budget
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Mandatory Preflight</Text>
          <Text style={styles.sectionHint}>
            Dash must confirm these 5 context questions before generating the routine.
          </Text>

          {PREFLIGHT_QUESTIONS.map((question) => (
            <View key={question.key} style={{ marginTop: 8 }}>
              <Text style={styles.fieldLabel}>{question.label}</Text>
              <TextInput
                style={[styles.input, { minHeight: 64 }]}
                value={preflight[question.key]}
                onChangeText={(value) =>
                  setPreflight((prev) => ({
                    ...prev,
                    [question.key]: value,
                  }))
                }
                placeholder={question.placeholder}
                placeholderTextColor={theme.textSecondary}
                multiline
              />
            </View>
          ))}

          <View style={preflightComplete ? styles.successBox : styles.warningBox}>
            {preflightComplete ? (
              <>
                <Ionicons name="checkmark-circle" size={16} color="#10b981" />
                <Text style={styles.successBoxText}>Preflight complete. Confirmed assumptions are ready.</Text>
              </>
            ) : (
              <>
                <Text style={styles.warningTitle}>Preflight incomplete</Text>
                <Text style={styles.warningItem}>
                  Provide at least one clear sentence for each preflight question.
                </Text>
              </>
            )}
          </View>

          {preflightComplete && (
            <View style={{ marginTop: 8, gap: 6 }}>
              <Text style={styles.fieldLabel}>Confirmed Assumptions</Text>
              {confirmedAssumptions.map((line) => (
                <Text key={line} style={styles.essentialHint}>
                  • {line}
                </Text>
              ))}
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Strict Arrival & Pickup Rules</Text>
          <Text style={styles.sectionHint}>
            These limits are enforced before parents can receive the routine. Program blocks outside this window are blocked from publishing.
          </Text>

          <View style={[styles.row, isCompactLayout && styles.rowStack]}>
            <View style={styles.halfInput}>
              <Text style={styles.fieldLabel}>Arrival Starts</Text>
              <View style={styles.timeInputRow}>
                <TextInput
                  style={[styles.input, styles.timeInput]}
                  value={rules.arrivalStartTime}
                  onChangeText={(value) => setRules((prev) => ({ ...prev, arrivalStartTime: normalizeTime(value) }))}
                  placeholder="HH:MM"
                  placeholderTextColor={theme.textSecondary}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={styles.timePickerBtn}
                  onPress={() => setTimePickerField('arrivalStart')}
                  accessibilityLabel="Set arrival start time"
                >
                  <Ionicons name="time-outline" size={22} color={theme.primary} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.halfInput}>
              <Text style={styles.fieldLabel}>Arrival Cutoff</Text>
              <View style={styles.timeInputRow}>
                <TextInput
                  style={[styles.input, styles.timeInput]}
                  value={rules.arrivalCutoffTime}
                  onChangeText={(value) => setRules((prev) => ({ ...prev, arrivalCutoffTime: normalizeTime(value) }))}
                  placeholder="HH:MM"
                  placeholderTextColor={theme.textSecondary}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={styles.timePickerBtn}
                  onPress={() => setTimePickerField('arrivalCutoff')}
                  accessibilityLabel="Set arrival cutoff time"
                >
                  <Ionicons name="time-outline" size={22} color={theme.primary} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={[styles.row, isCompactLayout && styles.rowStack]}>
            <View style={styles.halfInput}>
              <Text style={styles.fieldLabel}>Pickup Starts</Text>
              <View style={styles.timeInputRow}>
                <TextInput
                  style={[styles.input, styles.timeInput]}
                  value={rules.pickupStartTime}
                  onChangeText={(value) => setRules((prev) => ({ ...prev, pickupStartTime: normalizeTime(value) }))}
                  placeholder="HH:MM"
                  placeholderTextColor={theme.textSecondary}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={styles.timePickerBtn}
                  onPress={() => setTimePickerField('pickupStart')}
                  accessibilityLabel="Set pickup start time"
                >
                  <Ionicons name="time-outline" size={22} color={theme.primary} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.halfInput}>
              <Text style={styles.fieldLabel}>Pickup Cutoff</Text>
              <View style={styles.timeInputRow}>
                <TextInput
                  style={[styles.input, styles.timeInput]}
                  value={rules.pickupCutoffTime}
                  onChangeText={(value) => setRules((prev) => ({ ...prev, pickupCutoffTime: normalizeTime(value) }))}
                  placeholder="HH:MM"
                  placeholderTextColor={theme.textSecondary}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={styles.timePickerBtn}
                  onPress={() => setTimePickerField('pickupCutoff')}
                  accessibilityLabel="Set pickup cutoff time"
                >
                  <Ionicons name="time-outline" size={22} color={theme.primary} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {timePickerField && (
            <DateTimePicker
              value={timePickerField === 'arrivalStart'
                ? timeToDate(rules.arrivalStartTime)
                : timePickerField === 'arrivalCutoff'
                  ? timeToDate(rules.arrivalCutoffTime)
                  : timePickerField === 'pickupStart'
                    ? timeToDate(rules.pickupStartTime)
                    : timeToDate(rules.pickupCutoffTime)}
              mode="time"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(event, date) => {
                if (Platform.OS === 'android' && event.type === 'dismissed') {
                  setTimePickerField(null);
                  return;
                }
                if (date) {
                  const t = dateToTime(date);
                  if (timePickerField === 'arrivalStart') setRules((prev) => ({ ...prev, arrivalStartTime: t }));
                  else if (timePickerField === 'arrivalCutoff') setRules((prev) => ({ ...prev, arrivalCutoffTime: t }));
                  else if (timePickerField === 'pickupStart') setRules((prev) => ({ ...prev, pickupStartTime: t }));
                  else if (timePickerField === 'pickupCutoff') setRules((prev) => ({ ...prev, pickupCutoffTime: t }));
                }
                setTimePickerField(null);
              }}
            />
          )}

          <View style={styles.presetRow}>
            <TouchableOpacity style={[styles.presetBtn, isCompactLayout && styles.presetBtnCompact, isUltraCompact && styles.presetBtnSingleColumn]} onPress={() => applyPreset('half_day')}>
              <Text style={styles.presetBtnText}>Half-Day Preset</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.presetBtn, isCompactLayout && styles.presetBtnCompact, isUltraCompact && styles.presetBtnSingleColumn]} onPress={() => applyPreset('full_day')}>
              <Text style={styles.presetBtnText}>Full-Day Preset</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.presetBtn, isCompactLayout && styles.presetBtnCompact, isUltraCompact && styles.presetBtnSingleColumn]} onPress={() => applyPreset('aftercare')}>
              <Text style={styles.presetBtnText}>Aftercare Preset</Text>
            </TouchableOpacity>
          </View>

          {ruleValidation.issues.length > 0 ? (
            <View style={styles.warningBox}>
              <Text style={styles.warningTitle}>Fix before publishing</Text>
              {ruleValidation.issues.slice(0, 3).map((issue) => (
                <Text key={issue} style={styles.warningItem}>• {issue}</Text>
              ))}
              <TouchableOpacity
                style={styles.inlineBtn}
                onPress={() => applyPreset((Number(dailyMinutes) || 0) >= 360 ? 'full_day' : 'half_day')}
              >
                <Ionicons name="construct-outline" size={14} color={theme.primary} />
                <Text style={styles.inlineBtnText}>Auto-fix using recommended preset</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.successBox}>
              <Ionicons name="checkmark-circle" size={16} color="#10b981" />
              <Text style={styles.successBoxText}>Time rules are valid and publish-safe.</Text>
            </View>
          )}
        </View>

        <View style={styles.actionsCard}>
          <View style={styles.readinessPillsRow}>
            <View style={[styles.readinessPill, setupReady && styles.readinessPillActive]}>
              <Text style={[styles.readinessPillText, setupReady && styles.readinessPillTextActive]}>1. Setup</Text>
            </View>
            <View style={[styles.readinessPill, preflightComplete && styles.readinessPillActive]}>
              <Text style={[styles.readinessPillText, preflightComplete && styles.readinessPillTextActive]}>2. Preflight</Text>
            </View>
            <View style={[styles.readinessPill, ruleValidation.issues.length === 0 && styles.readinessPillActive]}>
              <Text style={[styles.readinessPillText, ruleValidation.issues.length === 0 && styles.readinessPillTextActive]}>3. Rules</Text>
            </View>
            <View style={[styles.readinessPill, draftReady && styles.readinessPillActive]}>
              <Text style={[styles.readinessPillText, draftReady && styles.readinessPillTextActive]}>4. Draft</Text>
            </View>
            <View style={[styles.readinessPill, shareReady && styles.readinessPillActive]}>
              <Text style={[styles.readinessPillText, shareReady && styles.readinessPillTextActive]}>5. Share</Text>
            </View>
          </View>

          {activeGenerationModel ? (
            <View style={styles.modelUsageRow}>
              <Ionicons name="hardware-chip-outline" size={14} color={theme.primary} />
              <Text style={styles.modelUsageLabel}>Model</Text>
              <Text style={styles.modelUsageValue}>{activeGenerationModel}</Text>
            </View>
          ) : null}

          {capsCoverage && (
            <View style={styles.capsCoverageBox}>
              <View style={styles.capsCoverageHeader}>
                <Text style={styles.capsCoverageTitle}>CAPS / DBE Coverage</Text>
                <Text style={styles.capsCoverageScore}>{Math.max(0, Math.min(100, Math.round(capsCoverage.coverageScore)))}%</Text>
              </View>
              <View style={styles.capsCoveragePills}>
                <View style={[styles.capsCoveragePill, capsCoverage.homeLanguageDays.length >= 5 && styles.capsCoveragePillActive]}>
                  <Text style={[styles.capsCoveragePillText, capsCoverage.homeLanguageDays.length >= 5 && styles.capsCoveragePillTextActive]}>Home Language</Text>
                </View>
                <View style={[styles.capsCoveragePill, capsCoverage.mathematicsDays.length >= 5 && styles.capsCoveragePillActive]}>
                  <Text style={[styles.capsCoveragePillText, capsCoverage.mathematicsDays.length >= 5 && styles.capsCoveragePillTextActive]}>Mathematics</Text>
                </View>
                <View style={[styles.capsCoveragePill, capsCoverage.lifeSkillsDays.length >= 5 && styles.capsCoveragePillActive]}>
                  <Text style={[styles.capsCoveragePillText, capsCoverage.lifeSkillsDays.length >= 5 && styles.capsCoveragePillTextActive]}>Life Skills</Text>
                </View>
                <View style={[styles.capsCoveragePill, capsCoverage.weatherRoutineDays.length >= 5 && styles.capsCoveragePillActive]}>
                  <Text style={[styles.capsCoveragePillText, capsCoverage.weatherRoutineDays.length >= 5 && styles.capsCoveragePillTextActive]}>Daily Weather</Text>
                </View>
              </View>
              {capsCoverage.missingByDay.length > 0 && (
                <Text style={styles.capsCoverageHint}>
                  Pending focus:{' '}
                  {capsCoverage.missingByDay
                    .slice(0, 3)
                    .map((entry: any) => `${DAY_LABELS[Number(entry?.day) || 1]} (${(entry?.missingStrands || []).join(', ')})`)
                    .join(' • ')}
                </Text>
              )}
            </View>
          )}

          <View style={[styles.row, isCompactLayout && styles.rowStack]}>
            <TouchableOpacity
              style={[styles.primaryBtn, styles.halfButton, (generating || !canGenerate) && styles.buttonDisabled]}
              onPress={generateProgram}
              disabled={generating || !canGenerate}
            >
              {generating && generationMode === 'generate'
                ? <EduDashSpinner size="small" color="#fff" />
                : <Ionicons name="sparkles" size={16} color="#fff" />}
              <Text style={styles.primaryBtnText}>
                {generating && generationMode === 'generate' ? 'Generating...' : 'Generate Smart Routine'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.regenerateBtn, styles.halfButton, (generating || !canGenerate || !draft) && styles.buttonDisabled]}
              onPress={regenerateProgram}
              disabled={generating || !canGenerate || !draft}
            >
              {generating && generationMode === 'regenerate'
                ? <EduDashSpinner size="small" color={theme.primary} />
                : <Ionicons name="refresh" size={16} color={theme.primary} />}
              <Text style={styles.regenerateBtnText}>
                {generating && generationMode === 'regenerate' ? 'Regenerating...' : 'Re-generate'}
              </Text>
            </TouchableOpacity>
          </View>
          {!canGenerate && (
            <Text style={styles.actionHint}>
              Complete setup + all five preflight questions before generation.
            </Text>
          )}
          {!draft && (
            <Text style={styles.actionHint}>
              Re-generate unlocks after you generate a draft or load a saved plan.
            </Text>
          )}
          {draft && canGenerate && (
            <Text style={styles.actionHint}>
              Use Re-generate any time to create a fresh variation from the same setup.
            </Text>
          )}

          <View style={[styles.row, isCompactLayout && styles.rowStack]}>
            <TouchableOpacity
              style={[styles.secondaryBtn, styles.halfButton, (saving || !draft) && styles.buttonDisabled]}
              onPress={() => void saveDraft()}
              disabled={saving || !draft}
            >
              {saving ? <EduDashSpinner size="small" color={theme.primary} /> : <Ionicons name="save-outline" size={16} color={theme.primary} />}
              <Text style={styles.secondaryBtnText}>{saving ? 'Saving...' : 'Save Draft'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.teacherShareBtn, styles.halfButton, (sharingTeachers || !draft) && styles.buttonDisabled]}
              onPress={() => openSharePicker()}
              disabled={sharingTeachers || !draft}
            >
              {sharingTeachers ? <EduDashSpinner size="small" color="#fff" /> : <Ionicons name="people-outline" size={16} color="#fff" />}
              <Text style={styles.successBtnText}>
                {sharingTeachers ? 'Sharing...' : 'Share with Teachers'}
              </Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.successBtn, (sharingParents || !draft || !shareReady) && styles.buttonDisabled]}
            onPress={() => void shareWithParents()}
            disabled={sharingParents || !draft || !shareReady}
          >
            {sharingParents ? <EduDashSpinner size="small" color="#fff" /> : <Ionicons name="megaphone-outline" size={16} color="#fff" />}
            <Text style={styles.successBtnText}>{sharingParents ? 'Sharing...' : 'Share with Parents'}</Text>
          </TouchableOpacity>
          <Text style={styles.actionHint}>
            {shareReady
              ? 'Everything looks ready. You can share this routine with parents now.'
              : 'Tip: Save to persist immediately. Share with teachers for classroom rollout, and share with parents when ready for family communication.'}
          </Text>
          {saveAdvisory ? (
            <View style={styles.saveAdvisoryRow}>
              <Ionicons name="information-circle-outline" size={14} color={theme.warning} />
              <Text style={styles.saveAdvisoryText}>{saveAdvisory}</Text>
            </View>
          ) : null}
        </View>

        {draft && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Draft Blocks</Text>
          <Text style={styles.sectionHint}>
            {draftViewMode === 'cards'
              ? 'Card preview mode for quick scan. Switch to Edit to change details.'
              : 'Tune times and titles before sharing.'}
          </Text>
          <View style={styles.draftHeaderActions}>
            <TouchableOpacity
              style={[styles.inlineBtn, saving && styles.buttonDisabled]}
              onPress={() => void saveDraft()}
              disabled={saving}
            >
              {saving
                ? <EduDashSpinner size="small" color={theme.primary} />
                : <Ionicons name="save-outline" size={14} color={theme.primary} />}
              <Text style={styles.inlineBtnText}>{saving ? 'Saving...' : 'Save / Update Draft'}</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.previewModeRow, isCompactLayout && styles.previewModeRowWrap]}>
              <TouchableOpacity
                style={[styles.previewModePill, draftViewMode === 'cards' && styles.previewModePillActive]}
                onPress={() => setDraftViewMode('cards')}
              >
                <Text style={[styles.previewModeText, draftViewMode === 'cards' && styles.previewModeTextActive]}>
                  Card Preview
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.previewModePill, draftViewMode === 'edit' && styles.previewModePillActive]}
                onPress={() => setDraftViewMode('edit')}
              >
                <Text style={[styles.previewModeText, draftViewMode === 'edit' && styles.previewModeTextActive]}>
                  Edit Mode
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.draftInsightRow}>
              <View style={[styles.draftInsightPill, isUltraCompact && styles.draftInsightPillFull]}>
                <Text style={styles.draftInsightLabel}>Missing Times</Text>
                <Text style={styles.draftInsightValue}>{draftInsights.missingTimes}</Text>
              </View>
              <View style={[styles.draftInsightPill, isUltraCompact && styles.draftInsightPillFull]}>
                <Text style={styles.draftInsightLabel}>Missing Titles</Text>
                <Text style={styles.draftInsightValue}>{draftInsights.missingTitles}</Text>
              </View>
              <View style={[styles.draftInsightPill, isUltraCompact && styles.draftInsightPillFull]}>
                <Text style={styles.draftInsightLabel}>Out of Window</Text>
                <Text style={styles.draftInsightValue}>{draftInsights.outOfWindow}</Text>
              </View>
              <View style={[styles.draftInsightPill, isUltraCompact && styles.draftInsightPillFull]}>
                <Text style={styles.draftInsightLabel}>Short Days (&lt;13:30)</Text>
                <Text style={styles.draftInsightValue}>{draftInsights.shortDaysCount}</Text>
              </View>
              <View style={[styles.draftInsightPill, isUltraCompact && styles.draftInsightPillFull]}>
                <Text style={styles.draftInsightLabel}>Missing Essentials</Text>
                <Text style={styles.draftInsightValue}>{draftInsights.missingEssentialsCount}</Text>
              </View>
            </View>
            {draftInsights.shortDaysCount > 0 && (
              <Text style={styles.sectionHint}>
                Extend these days to 13:30 or later: {draftInsights.shortDays.map((day) => DAY_LABELS[day]).join(', ')}
              </Text>
            )}
            {draftInsights.missingEssentialsCount > 0 && (
              <Text style={styles.sectionHint}>
                Still missing: {draftInsights.missingEssentials.join(', ')}
              </Text>
            )}

            {draftViewMode === 'cards' ? (
              DAY_ORDER.map((day) => {
                const dayBlocks = draft.blocks
                  .filter((block) => block.day_of_week === day)
                  .sort((a, b) => a.block_order - b.block_order);

                return (
                  <View key={day} style={styles.daySection}>
                    <View style={styles.dayHeader}>
                      <Text style={styles.dayTitle}>{DAY_LABELS[day]}</Text>
                      <Text style={styles.previewCountLabel}>{dayBlocks.length} blocks</Text>
                    </View>

                    {dayBlocks.length === 0 ? (
                      <Text style={styles.dayEmpty}>No blocks yet.</Text>
                    ) : (
                      <View style={styles.previewBlockWrap}>
                        {dayBlocks.map((block) => {
                          const blockType = getRoutineBlockTypePresentation(block.block_type);
                          return (
                            <View key={`${day}-${block.block_order}`} style={[styles.previewBlockCard, { borderLeftColor: blockType.textColor }]}>
                              <View style={styles.previewBlockMetaRow}>
                                <Text style={styles.previewBlockOrder}>#{block.block_order}</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  {!!block.block_type && (
                                    <View
                                      style={[
                                        styles.routineTypePill,
                                        {
                                          backgroundColor: blockType.backgroundColor,
                                          borderColor: blockType.borderColor,
                                        },
                                      ]}
                                    >
                                      <Text style={[styles.routineTypePillText, { color: blockType.textColor }]}>
                                        {blockType.label}
                                      </Text>
                                    </View>
                                  )}
                                  <Text style={styles.previewBlockTime}>
                                    {(block.start_time && String(block.start_time)) || '--:--'} - {(block.end_time && String(block.end_time)) || '--:--'}
                                  </Text>
                                </View>
                              </View>
                              <Text style={styles.previewBlockTitle}>
                                {String(block.title || '').trim() || 'Untitled block'}
                              </Text>
                              {Array.isArray(block.objectives) && block.objectives.length > 0 && (
                                <Text style={[styles.previewBlockNote, { color: theme.primary + 'cc' }]}>
                                  {block.objectives.slice(0, 2).join(' • ')}
                                </Text>
                              )}
                              {!!String(block.notes || '').trim() && (
                                <Text style={styles.previewBlockNote}>{String(block.notes)}</Text>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })
            ) : (
              DAY_ORDER.map((day) => {
                const dayBlocks = draft.blocks
                  .filter((block) => block.day_of_week === day)
                  .sort((a, b) => a.block_order - b.block_order);

                return (
                  <View key={day} style={styles.daySection}>
                    <View style={styles.dayHeader}>
                      <Text style={styles.dayTitle}>{DAY_LABELS[day]}</Text>
                      <TouchableOpacity style={styles.inlineBtn} onPress={() => addBlockForDay(day)}>
                        <Ionicons name="add" size={14} color={theme.primary} />
                        <Text style={styles.inlineBtnText}>Add Block</Text>
                      </TouchableOpacity>
                    </View>

                    {dayBlocks.length === 0 ? (
                      <Text style={styles.dayEmpty}>No blocks yet.</Text>
                    ) : (
                      dayBlocks.map((block, blockIdx) => (
                        <View key={`${day}-${block.block_order}`} style={styles.blockCard}>
                          {/* Header row: order badge, move buttons, delete */}
                          <View style={styles.blockTitleRow}>
                            <Text style={styles.blockBadge}>#{block.block_order}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <TouchableOpacity
                                onPress={() => moveBlock(day, block.block_order, 'up')}
                                disabled={blockIdx === 0}
                                style={{ opacity: blockIdx === 0 ? 0.3 : 1 }}
                                accessibilityLabel="Move block up"
                              >
                                <Ionicons name="chevron-up" size={18} color={theme.primary} />
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => moveBlock(day, block.block_order, 'down')}
                                disabled={blockIdx === dayBlocks.length - 1}
                                style={{ opacity: blockIdx === dayBlocks.length - 1 ? 0.3 : 1 }}
                                accessibilityLabel="Move block down"
                              >
                                <Ionicons name="chevron-down" size={18} color={theme.primary} />
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => copyBlockToAllDays(day, block.block_order)}
                                accessibilityLabel="Copy to all days"
                              >
                                <Ionicons name="copy-outline" size={16} color={theme.textSecondary} />
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => removeBlock(day, block.block_order)}>
                                <Ionicons name="trash-outline" size={16} color={theme.error} />
                              </TouchableOpacity>
                            </View>
                          </View>

                          {/* Block type chips */}
                          <Text style={[styles.fieldLabel, { marginTop: 6 }]}>Type</Text>
                          <View style={styles.chipRow}>
                            {(['circle_time', 'learning', 'movement', 'outdoor', 'meal', 'nap', 'assessment', 'transition', 'other'] as const).map((bt) => {
                              const active = block.block_type === bt;
                              const blockType = getRoutineBlockTypePresentation(bt, {
                                backgroundAlpha: active ? 0.24 : 0.12,
                                borderAlpha: active ? 0.5 : 0.3,
                              });
                              return (
                                <TouchableOpacity
                                  key={bt}
                                  style={[
                                    styles.quickChip,
                                    {
                                      borderColor: blockType.borderColor,
                                      backgroundColor: blockType.backgroundColor,
                                    },
                                    active && styles.quickChipTypeActive,
                                  ]}
                                  onPress={() => updateDraftBlock(day, block.block_order, { block_type: bt })}
                                >
                                  <Text
                                    style={[
                                      styles.quickChipText,
                                      { color: blockType.textColor },
                                      active && styles.quickChipTypeTextActive,
                                    ]}
                                  >
                                    {blockType.label}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>

                          {/* Title */}
                          <Text style={[styles.fieldLabel, { marginTop: 6 }]}>Title</Text>
                          <TextInput
                            style={styles.input}
                            value={block.title}
                            onChangeText={(value) => updateDraftBlock(day, block.block_order, { title: value })}
                            placeholder="Block title"
                            placeholderTextColor={theme.textSecondary}
                          />

                          {/* Times */}
                          <View style={[styles.row, isCompactLayout && styles.rowStack]}>
                            <View style={styles.halfInput}>
                              <Text style={styles.fieldLabel}>Start</Text>
                              <TextInput
                                style={styles.input}
                                value={String(block.start_time || '')}
                                onChangeText={(value) => updateDraftBlock(day, block.block_order, { start_time: normalizeTime(value) })}
                                placeholder="HH:MM"
                                placeholderTextColor={theme.textSecondary}
                                autoCapitalize="none"
                              />
                            </View>
                            <View style={styles.halfInput}>
                              <Text style={styles.fieldLabel}>End</Text>
                              <TextInput
                                style={styles.input}
                                value={String(block.end_time || '')}
                                onChangeText={(value) => updateDraftBlock(day, block.block_order, { end_time: normalizeTime(value) })}
                                placeholder="HH:MM"
                                placeholderTextColor={theme.textSecondary}
                                autoCapitalize="none"
                              />
                            </View>
                          </View>

                          {/* Objectives */}
                          <Text style={[styles.fieldLabel, { marginTop: 6 }]}>Objectives</Text>
                          <TextInput
                            style={[styles.input, { minHeight: 52 }]}
                            value={(block.objectives || []).join(', ')}
                            onChangeText={(value) => updateDraftBlock(day, block.block_order, {
                              objectives: value.split(/[,\n]/).map((s) => s.trim()).filter(Boolean),
                            })}
                            placeholder="Objectives (comma-separated)"
                            placeholderTextColor={theme.textSecondary}
                            multiline
                          />

                          {/* Transition cue */}
                          <Text style={[styles.fieldLabel, { marginTop: 6 }]}>Transition cue</Text>
                          <TextInput
                            style={styles.input}
                            value={block.transition_cue || ''}
                            onChangeText={(value) => updateDraftBlock(day, block.block_order, { transition_cue: value || null })}
                            placeholder="e.g. Ring bell, tidy up, line up"
                            placeholderTextColor={theme.textSecondary}
                          />

                          {/* Staff note */}
                          <Text style={[styles.fieldLabel, { marginTop: 6 }]}>Staff note</Text>
                          <TextInput
                            style={styles.input}
                            value={block.notes || ''}
                            onChangeText={(value) => updateDraftBlock(day, block.block_order, { notes: value || null })}
                            placeholder="Staff note (optional)"
                            placeholderTextColor={theme.textSecondary}
                          />
                        </View>
                      ))
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Saved Programs</Text>
          {programs.length === 0 ? (
            <Text style={styles.sectionHint}>No saved daily programs yet.</Text>
          ) : (
            programs.map((program) => (
              <View key={program.id} style={styles.savedCard}>
                <View style={styles.savedHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.savedTitle}>{program.title || 'Weekly Program'}</Text>
                    <Text style={styles.savedMeta}>
                      {program.week_start_date} to {program.week_end_date}
                    </Text>
                  </View>
                  <View style={styles.statusPill}>
                    <Text style={styles.statusPillText}>{program.status || 'draft'}</Text>
                  </View>
                </View>

                <View style={styles.savedActions}>
                  <TouchableOpacity style={styles.inlineBtn} onPress={() => loadProgramIntoEditor(program)}>
                    <Ionicons name="create-outline" size={14} color={theme.primary} />
                    <Text style={styles.inlineBtnText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.inlineBtn, generating && styles.buttonDisabled]}
                    onPress={() => regenerateFromSavedProgram(program)}
                    disabled={generating}
                  >
                    <Ionicons name="refresh-outline" size={14} color={theme.primary} />
                    <Text style={styles.inlineBtnText}>Regenerate</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.inlineBtn} onPress={() => openSharePicker(program)}>
                    <Ionicons name="people-outline" size={14} color={theme.primary} />
                    <Text style={styles.inlineBtnText}>Share Teachers</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.inlineBtn} onPress={() => void shareWithParents(program)}>
                    <Ionicons name="megaphone-outline" size={14} color={theme.primary} />
                    <Text style={styles.inlineBtnText}>Share Parents</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.inlineBtn, styles.inlineBtnDanger, deletingProgramId === program.id && styles.buttonDisabled]}
                    onPress={() => deleteSavedProgram(program)}
                    disabled={deletingProgramId === program.id}
                  >
                    {deletingProgramId === program.id ? (
                      <EduDashSpinner size="small" color={theme.error} />
                    ) : (
                      <Ionicons name="trash-outline" size={14} color={theme.error} />
                    )}
                    <Text style={styles.inlineBtnDangerText}>
                      {deletingProgramId === program.id ? 'Deleting...' : 'Delete'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
      <AlertModalComponent />
      {organizationId ? (
        <ShareTargetPickerModal
          visible={showSharePicker}
          organizationId={organizationId}
          classOptions={classOptions}
          ageGroup={ageGroup}
          theme={theme}
          onClose={() => { setShowSharePicker(false); setSharePickerTarget(null); }}
          onShare={(ids) => void shareWithTeachers(ids)}
        />
      ) : null}
    </DesktopLayout>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    content: {
      padding: 16,
      gap: 12,
      paddingBottom: Platform.OS === 'web' ? 88 : 36,
      width: '100%',
      maxWidth: 1280,
      alignSelf: 'center',
    },
    hero: {
      borderRadius: 18,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.primary + '55',
      backgroundColor: theme.card + 'd1',
      shadowColor: theme.primary,
      shadowOpacity: 0.24,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 8,
    },
    heroTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 8,
    },
    heroIconWrap: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: theme.background + 'aa',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.primary + '30',
    },
    heroTag: {
      color: theme.primary,
      fontWeight: '700',
      fontSize: 12,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    heroTitle: {
      color: theme.text,
      fontSize: 22,
      fontWeight: '800',
    },
    heroSubtitle: {
      color: theme.textSecondary,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 4,
    },
    statsRow: {
      marginTop: 14,
      flexDirection: 'row',
      gap: 8,
    },
    statsRowCompact: {
      flexWrap: 'wrap',
    },
    usageFallbackBanner: {
      marginTop: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#f59e0b66',
      backgroundColor: '#f59e0b1a',
      paddingHorizontal: 10,
      paddingVertical: 7,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    usageFallbackText: {
      flex: 1,
      color: '#f59e0b',
      fontSize: 11,
      lineHeight: 15,
      fontWeight: '700',
    },
    heroLinkRow: {
      marginTop: 10,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    heroLinkChip: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.primary + '66',
      backgroundColor: theme.background + 'c9',
      paddingHorizontal: 10,
      paddingVertical: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    heroLinkText: {
      color: theme.primary,
      fontSize: 11,
      fontWeight: '700',
    },
    statPill: {
      flex: 1,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.background + 'b3',
      paddingVertical: 8,
      paddingHorizontal: 10,
    },
    statPillCompact: {
      flexBasis: '48%',
      minWidth: 160,
    },
    statPillFull: {
      flexBasis: '100%',
    },
    statLabel: {
      color: theme.textSecondary,
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    statValue: {
      color: theme.text,
      fontWeight: '800',
      fontSize: 16,
      marginTop: 2,
    },
    readinessWrap: {
      marginTop: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.primary + '45',
      backgroundColor: theme.background + 'c9',
      padding: 10,
      gap: 6,
    },
    readinessHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    readinessLabel: {
      color: theme.textSecondary,
      fontSize: 12,
      fontWeight: '700',
    },
    readinessValue: {
      fontSize: 13,
      fontWeight: '800',
    },
    readinessTrack: {
      height: 7,
      borderRadius: 999,
      backgroundColor: theme.border + '80',
      overflow: 'hidden',
    },
    readinessFill: {
      height: '100%',
      borderRadius: 999,
    },
    readinessHint: {
      color: theme.textSecondary,
      fontSize: 11,
    },
    card: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.primary + '30',
      backgroundColor: theme.card + 'cf',
      padding: 14,
      gap: 8,
      shadowColor: theme.primary,
      shadowOpacity: 0.12,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 3,
    },
    actionsCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.primary + '55',
      backgroundColor: theme.primary + '16',
      padding: 14,
      gap: 10,
      shadowColor: theme.primary,
      shadowOpacity: 0.16,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 9 },
      elevation: 4,
    },
    sectionTitle: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '800',
    },
    sectionHint: {
      color: theme.textSecondary,
      fontSize: 12,
      lineHeight: 17,
    },
    schoolNamePill: {
      marginTop: 4,
      marginBottom: 2,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.primary + '55',
      backgroundColor: theme.primary + '18',
      paddingHorizontal: 10,
      paddingVertical: 6,
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    schoolNamePillText: {
      color: theme.primary,
      fontSize: 12,
      fontWeight: '700',
    },
    fieldLabel: {
      color: theme.textSecondary,
      fontSize: 12,
      fontWeight: '700',
      marginBottom: 2,
      marginTop: 4,
    },
    fieldSubHint: {
      color: theme.textSecondary,
      fontSize: 11,
      lineHeight: 16,
      marginBottom: 2,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.primary + '30',
      borderRadius: 10,
      backgroundColor: theme.background + 'cc',
      color: theme.text,
      paddingHorizontal: 11,
      paddingVertical: 10,
      fontSize: 14,
    },
    timeInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    timeInput: {
      flex: 1,
    },
    timePickerBtn: {
      padding: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.primary + '40',
      backgroundColor: theme.primary + '12',
      justifyContent: 'center',
      alignItems: 'center',
    },
    row: {
      flexDirection: 'row',
      gap: 8,
    },
    rowStack: {
      flexDirection: 'column',
    },
    halfInput: {
      flex: 1,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 2,
    },
    quickChip: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.primary + '45',
      backgroundColor: theme.primary + '12',
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    quickChipTypeActive: {
      borderWidth: 1.5,
    },
    quickChipText: {
      color: theme.primary,
      fontSize: 11,
      fontWeight: '700',
    },
    quickChipTypeTextActive: {
      fontWeight: '800',
    },
    quickChipGhost: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.background + 'b8',
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    quickChipGhostText: {
      color: theme.textSecondary,
      fontSize: 11,
      fontWeight: '700',
    },
    presetGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 2,
      marginBottom: 4,
    },
    presetCard: {
      flexBasis: '31%',
      flexGrow: 1,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.background + 'cc',
      paddingVertical: 10,
      paddingHorizontal: 10,
      gap: 4,
    },
    presetCardCompact: {
      flexBasis: '48%',
    },
    presetCardSingleColumn: {
      flexBasis: '100%',
    },
    presetCardActive: {
      borderColor: theme.primary,
      backgroundColor: theme.primary + '16',
    },
    presetCardTitle: {
      color: theme.text,
      fontSize: 12,
      fontWeight: '800',
    },
    presetCardTitleActive: {
      color: theme.primary,
    },
    presetCardCaption: {
      color: theme.textSecondary,
      fontSize: 11,
      lineHeight: 15,
    },
    essentialsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 2,
      marginBottom: 4,
    },
    essentialChip: {
      flexBasis: '48%',
      flexGrow: 1,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.background + 'c4',
      paddingHorizontal: 10,
      paddingVertical: 8,
      gap: 2,
    },
    essentialChipCompact: {
      flexBasis: '48%',
    },
    essentialChipSingleColumn: {
      flexBasis: '100%',
    },
    essentialChipActive: {
      borderColor: theme.primary,
      backgroundColor: theme.primary + '1f',
    },
    essentialLabel: {
      color: theme.text,
      fontSize: 12,
      fontWeight: '800',
    },
    essentialLabelActive: {
      color: theme.primary,
    },
    essentialHint: {
      color: theme.textSecondary,
      fontSize: 10,
      lineHeight: 13,
    },
    toggleRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 2,
    },
    togglePill: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 11,
      paddingVertical: 7,
      backgroundColor: theme.background,
    },
    togglePillActive: {
      borderColor: theme.primary,
      backgroundColor: theme.primary + '18',
    },
    toggleText: {
      color: theme.textSecondary,
      fontSize: 12,
      fontWeight: '700',
    },
    toggleTextActive: {
      color: theme.primary,
    },
    presetRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 4,
    },
    presetBtn: {
      flexBasis: '31%',
      flexGrow: 1,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      paddingVertical: 10,
      alignItems: 'center',
      backgroundColor: theme.background + 'cc',
    },
    presetBtnCompact: {
      flexBasis: '48%',
    },
    presetBtnSingleColumn: {
      flexBasis: '100%',
    },
    presetBtnText: {
      color: theme.text,
      fontWeight: '700',
      fontSize: 12,
    },
    primaryBtn: {
      borderRadius: 12,
      backgroundColor: theme.primary,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    primaryBtnText: {
      color: '#fff',
      fontWeight: '800',
      fontSize: 14,
    },
    actionHint: {
      color: theme.textSecondary,
      fontSize: 12,
      lineHeight: 17,
    },
    warningBox: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#f59e0b66',
      backgroundColor: '#f59e0b1a',
      padding: 10,
      gap: 4,
    },
    warningTitle: {
      color: '#f59e0b',
      fontSize: 12,
      fontWeight: '800',
    },
    warningItem: {
      color: theme.text,
      fontSize: 12,
      lineHeight: 16,
    },
    successBox: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#10b98155',
      backgroundColor: '#10b9811a',
      paddingHorizontal: 10,
      paddingVertical: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    successBoxText: {
      color: '#10b981',
      fontSize: 12,
      fontWeight: '700',
      flex: 1,
    },
    readinessPillsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    readinessPill: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 10,
      paddingVertical: 5,
      backgroundColor: theme.background + 'cc',
    },
    readinessPillActive: {
      borderColor: '#10b981',
      backgroundColor: '#10b9811f',
    },
    readinessPillText: {
      fontSize: 11,
      color: theme.textSecondary,
      fontWeight: '700',
    },
    readinessPillTextActive: {
      color: '#10b981',
    },
    modelUsageRow: {
      marginTop: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.primary + '45',
      backgroundColor: theme.primary + '12',
      paddingHorizontal: 10,
      paddingVertical: 7,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    modelUsageLabel: {
      color: theme.textSecondary,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    modelUsageValue: {
      flex: 1,
      color: theme.text,
      fontSize: 12,
      fontWeight: '800',
    },
    capsCoverageBox: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.primary + '45',
      backgroundColor: theme.background + 'd9',
      padding: 10,
      gap: 6,
    },
    capsCoverageHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    capsCoverageTitle: {
      color: theme.text,
      fontSize: 12,
      fontWeight: '800',
    },
    capsCoverageScore: {
      color: theme.primary,
      fontSize: 12,
      fontWeight: '900',
    },
    capsCoveragePills: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    capsCoveragePill: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.background + 'c2',
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    capsCoveragePillActive: {
      borderColor: theme.primary,
      backgroundColor: theme.primary + '20',
    },
    capsCoveragePillText: {
      color: theme.textSecondary,
      fontSize: 10,
      fontWeight: '700',
    },
    capsCoveragePillTextActive: {
      color: theme.primary,
    },
    capsCoverageHint: {
      color: theme.textSecondary,
      fontSize: 11,
      lineHeight: 16,
    },
    secondaryBtn: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.primary,
      backgroundColor: theme.background,
      paddingVertical: 11,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    secondaryBtnText: {
      color: theme.primary,
      fontWeight: '800',
      fontSize: 13,
    },
    regenerateBtn: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.primary + '66',
      backgroundColor: theme.primary + '12',
      paddingVertical: 11,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    regenerateBtnText: {
      color: theme.primary,
      fontWeight: '800',
      fontSize: 13,
    },
    successBtn: {
      borderRadius: 12,
      backgroundColor: '#059669',
      paddingVertical: 11,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    teacherShareBtn: {
      borderRadius: 12,
      backgroundColor: '#0284c7',
      paddingVertical: 11,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    successBtnText: {
      color: '#fff',
      fontWeight: '800',
      fontSize: 13,
    },
    halfButton: {
      flex: 1,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    saveAdvisoryRow: {
      marginTop: 2,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.warning + '55',
      backgroundColor: theme.warning + '15',
      paddingHorizontal: 10,
      paddingVertical: 7,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    saveAdvisoryText: {
      flex: 1,
      color: theme.warning,
      fontSize: 11,
      lineHeight: 16,
      fontWeight: '600',
    },
    daySection: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.primary + '2e',
      padding: 10,
      gap: 8,
      backgroundColor: theme.background + 'b8',
    },
    draftInsightRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 2,
    },
    draftInsightPill: {
      flexBasis: '48%',
      flexGrow: 1,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.primary + '2e',
      backgroundColor: theme.background + 'c2',
      paddingVertical: 7,
      paddingHorizontal: 9,
      alignItems: 'center',
    },
    draftInsightPillFull: {
      flexBasis: '100%',
    },
    draftInsightLabel: {
      color: theme.textSecondary,
      fontSize: 10,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      textAlign: 'center',
    },
    draftInsightValue: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '800',
      marginTop: 2,
    },
    dayHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    dayTitle: {
      color: theme.text,
      fontWeight: '800',
      fontSize: 13,
    },
    previewCountLabel: {
      color: theme.textSecondary,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    dayEmpty: {
      color: theme.textSecondary,
      fontSize: 12,
    },
    draftHeaderActions: {
      marginTop: 8,
      marginBottom: 2,
      alignItems: 'flex-start',
    },
    previewModeRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 2,
      marginBottom: 2,
    },
    previewModeRowWrap: {
      flexWrap: 'wrap',
    },
    previewModePill: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.background + 'c2',
      paddingHorizontal: 11,
      paddingVertical: 6,
    },
    previewModePillActive: {
      borderColor: theme.primary,
      backgroundColor: theme.primary + '1f',
    },
    previewModeText: {
      color: theme.textSecondary,
      fontWeight: '700',
      fontSize: 12,
    },
    previewModeTextActive: {
      color: theme.primary,
    },
    previewBlockWrap: {
      gap: 8,
    },
    previewBlockCard: {
      borderWidth: 1,
      borderLeftWidth: 3,
      borderColor: theme.primary + '35',
      borderLeftColor: theme.primary + '65',
      borderRadius: 12,
      backgroundColor: theme.primary + '12',
      paddingVertical: 9,
      paddingHorizontal: 10,
      gap: 5,
    },
    previewBlockMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    previewBlockOrder: {
      color: theme.primary,
      fontWeight: '700',
      fontSize: 11,
    },
    previewBlockTime: {
      color: theme.textSecondary,
      fontSize: 11,
      fontWeight: '700',
    },
    routineTypePill: {
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    routineTypePillText: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.3,
    },
    previewBlockTitle: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '800',
      lineHeight: 18,
    },
    previewBlockNote: {
      color: theme.textSecondary,
      fontSize: 12,
      lineHeight: 16,
    },
    blockCard: {
      borderWidth: 1,
      borderColor: theme.primary + '22',
      borderRadius: 10,
      padding: 10,
      gap: 8,
      backgroundColor: theme.card + 'd6',
    },
    blockTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    blockBadge: {
      color: theme.primary,
      fontWeight: '700',
      fontSize: 12,
    },
    inlineBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderWidth: 1,
      borderColor: theme.primary + '55',
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: theme.primary + '12',
    },
    inlineBtnText: {
      color: theme.primary,
      fontWeight: '700',
      fontSize: 12,
    },
    inlineBtnDanger: {
      borderColor: theme.error + '55',
      backgroundColor: theme.error + '12',
    },
    inlineBtnDangerText: {
      color: theme.error,
      fontWeight: '700',
      fontSize: 12,
    },
    savedCard: {
      borderWidth: 1,
      borderColor: theme.primary + '22',
      borderRadius: 12,
      padding: 11,
      backgroundColor: theme.background + 'cb',
      gap: 10,
    },
    savedHeader: {
      flexDirection: 'row',
      gap: 8,
    },
    savedTitle: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '800',
    },
    savedMeta: {
      color: theme.textSecondary,
      fontSize: 12,
      marginTop: 2,
    },
    statusPill: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 9,
      paddingVertical: 5,
      alignSelf: 'flex-start',
      backgroundColor: theme.card,
    },
    statusPillText: {
      color: theme.textSecondary,
      fontSize: 11,
      textTransform: 'capitalize',
      fontWeight: '700',
    },
    savedActions: {
      flexDirection: 'row',
      gap: 8,
      flexWrap: 'wrap',
    },
  });
