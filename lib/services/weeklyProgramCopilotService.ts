import { assertSupabase } from '@/lib/supabase';
import { getSACalendarForYear } from '@/lib/data/saSchoolCalendar';
import { stabilizeDailyRoutineBlocks } from '@/lib/routines/dailyRoutineNormalization';
import type {
  DailyProgramBlock,
  DailyProgramBlockType,
  WeeklyProgramDraft,
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

type WeeklyProgramAIResponse = {
  title?: string;
  summary?: string;
  blocks?: unknown[];
  days?: Array<{
    day_of_week?: number | string;
    blocks?: unknown[];
  }>;
};

type AIFunctionInvokeResult = {
  data: unknown;
  error: unknown;
};

type SupabaseFunctionsClient = {
  functions: {
    invoke: (name: string, args: { body: Record<string, unknown> }) => Promise<AIFunctionInvokeResult>;
  };
};

type CompletionInsightSummary = {
  totalCompletions: number;
  avgScore: number | null;
  topDomains: Array<{ domain: string; count: number; avgScore: number | null }>;
};

const VALID_BLOCK_TYPES: DailyProgramBlockType[] = [
  'circle_time',
  'learning',
  'movement',
  'outdoor',
  'meal',
  'nap',
  'assessment',
  'transition',
  'other',
];

const toDateOnly = (value: Date) => value.toISOString().slice(0, 10);

const startOfWeekMonday = (dateLike: string): string => {
  const date = new Date(`${dateLike}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid week start date');
  }
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return toDateOnly(date);
};

const addDays = (dateLike: string, days: number): string => {
  const date = new Date(`${dateLike}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateOnly(date);
};

const clampDayOfWeek = (value: number): 1 | 2 | 3 | 4 | 5 | 6 | 7 => {
  const rounded = Math.min(7, Math.max(1, Math.trunc(value)));
  return rounded as 1 | 2 | 3 | 4 | 5 | 6 | 7;
};

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/[\n,;|]/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const toBlockType = (value: unknown): DailyProgramBlockType => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  if (VALID_BLOCK_TYPES.includes(normalized as DailyProgramBlockType)) {
    return normalized as DailyProgramBlockType;
  }
  return 'learning';
};

const WEEKLY_PROGRAM_CONTAINER_KEYS = [
  'weekly_program',
  'weeklyProgram',
  'program',
  'data',
  'result',
  'response',
  'content',
  'payload',
  'output',
  'json',
] as const;
const WEEKLY_PROGRAM_BLOCK_KEYS = [
  'blocks',
  'activities',
  'routine',
  'schedule',
  'sessions',
  'items',
  'timeline',
  'daily_blocks',
  'dailyBlocks',
  'program_blocks',
  'programBlocks',
  'routine_blocks',
  'routineBlocks',
] as const;
const WEEKLY_PROGRAM_DAY_CONTAINER_KEYS = [
  'days',
  'week',
  'weekdays',
  'weekly_schedule',
  'weeklySchedule',
  'schedule_by_day',
  'scheduleByDay',
] as const;
const DAY_LOOKUP: Record<string, 1 | 2 | 3 | 4 | 5 | 6 | 7> = {
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
  sunday: 7,
  sun: 7,
};

const pickField = (record: Record<string, unknown>, keys: readonly string[]): unknown => {
  for (const key of keys) {
    if (key in record) return record[key];
  }
  return undefined;
};

const parseDayOfWeek = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return clampDayOfWeek(value);
  }

  const raw = String(value || '').trim();
  if (!raw) return null;

  const asNumber = Number(raw);
  if (Number.isFinite(asNumber)) {
    return clampDayOfWeek(asNumber);
  }

  const normalized = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normalized in DAY_LOOKUP) {
    return DAY_LOOKUP[normalized];
  }

  const dayWithNumber = normalized.match(/(?:day|weekday)([1-7])/);
  if (dayWithNumber) {
    return clampDayOfWeek(Number(dayWithNumber[1]));
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const date = new Date(`${raw}T00:00:00.000Z`);
    if (!Number.isNaN(date.getTime())) {
      return clampDayOfWeek(date.getUTCDay() === 0 ? 7 : date.getUTCDay());
    }
  }

  return null;
};

const extractBlocksArrayFromRecord = (record: Record<string, unknown>): unknown[] | null => {
  for (const key of WEEKLY_PROGRAM_BLOCK_KEYS) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  return null;
};

const normalizeDayEntriesFromWeekMap = (
  value: unknown,
): WeeklyProgramAIResponse['days'] | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;

  const days: NonNullable<WeeklyProgramAIResponse['days']> = [];

  for (const [key, entry] of Object.entries(record)) {
    const parsedDay = parseDayOfWeek(key);
    if (parsedDay == null) continue;

    let blocks: unknown[] | null = null;
    if (Array.isArray(entry)) {
      blocks = entry;
    } else if (entry && typeof entry === 'object') {
      blocks = extractBlocksArrayFromRecord(entry as Record<string, unknown>);
    }

    if (!blocks || blocks.length === 0) continue;
    days.push({
      day_of_week: parsedDay,
      blocks,
    });
  }

  if (days.length === 0) return null;
  return days.sort((a, b) => Number(a.day_of_week || 0) - Number(b.day_of_week || 0));
};

const normalizeWeeklyProgramRecord = (
  record: Record<string, unknown>,
): WeeklyProgramAIResponse | null => {
  const topLevelBlocks = extractBlocksArrayFromRecord(record);
  if (topLevelBlocks && topLevelBlocks.length > 0) {
    return {
      title: typeof record.title === 'string' ? record.title : undefined,
      summary: typeof record.summary === 'string' ? record.summary : undefined,
      blocks: topLevelBlocks,
    };
  }

  if (Array.isArray(record.days)) {
    return {
      title: typeof record.title === 'string' ? record.title : undefined,
      summary: typeof record.summary === 'string' ? record.summary : undefined,
      days: record.days as WeeklyProgramAIResponse['days'],
    };
  }

  const dayContainers: unknown[] = [record, ...WEEKLY_PROGRAM_DAY_CONTAINER_KEYS.map((key) => record[key])];
  for (const container of dayContainers) {
    const normalizedDays = normalizeDayEntriesFromWeekMap(container);
    if (!normalizedDays || normalizedDays.length === 0) continue;
    return {
      title: typeof record.title === 'string' ? record.title : undefined,
      summary: typeof record.summary === 'string' ? record.summary : undefined,
      days: normalizedDays,
    };
  }

  return null;
};

const looksLikeWeeklyProgramResponse = (value: unknown): value is WeeklyProgramAIResponse => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return normalizeWeeklyProgramRecord(value as Record<string, unknown>) !== null;
};

const sanitizeJsonCandidate = (value: string): string =>
  value
    .replace(/^\uFEFF/, '')
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\/\/[^\n]*/g, '') // strip single-line comments
    .trim();

const tryParseJsonCandidate = (value: string): unknown | null => {
  const normalized = sanitizeJsonCandidate(value);
  if (!normalized) return null;

  const attempts = [
    normalized,
    // Common AI formatting mistake: trailing commas in objects/arrays.
    normalized.replace(/,\s*([}\]])/g, '$1'),
    // Strip markdown-style bold/italic that might wrap keys
    normalized.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1'),
  ];

  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try next strategy
    }
  }
  return null;
};

const findBalancedJsonObjects = (value: string, limit = 8): string[] => {
  const matches: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }

    if (ch === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        matches.push(value.slice(start, i + 1));
        start = -1;
        if (matches.length >= limit) break;
      }
    }
  }

  return matches;
};

const parseWeeklyProgramFromUnknown = (
  value: unknown,
  depth = 0,
  seen = new Set<unknown>(),
): WeeklyProgramAIResponse | null => {
  if (depth > 5 || value == null) return null;

  if (typeof value === 'string') {
    return parseWeeklyProgramFromText(value, depth + 1);
  }

  if (Array.isArray(value)) {
    const looksLikeDays = value.every((item) => item && typeof item === 'object' && !Array.isArray(item));
    if (looksLikeDays) {
      return { days: value as WeeklyProgramAIResponse['days'] };
    }
    for (const item of value) {
      const parsed = parseWeeklyProgramFromUnknown(item, depth + 1, seen);
      if (parsed) return parsed;
    }
    return null;
  }

  if (!value || typeof value !== 'object') return null;
  if (seen.has(value)) return null;
  seen.add(value);

  const record = value as Record<string, unknown>;
  const normalized = normalizeWeeklyProgramRecord(record);
  if (normalized) return normalized;

  for (const key of WEEKLY_PROGRAM_CONTAINER_KEYS) {
    if (!(key in record)) continue;
    const parsed = parseWeeklyProgramFromUnknown(record[key], depth + 1, seen);
    if (parsed) return parsed;
  }

  for (const nested of Object.values(record)) {
    const parsed = parseWeeklyProgramFromUnknown(nested, depth + 1, seen);
    if (parsed) return parsed;
  }

  return null;
};

/** Extract substring from first `{` to last `}` to handle leading/trailing prose */
const extractJsonBraceSpan = (value: string): string | null => {
  const first = value.indexOf('{');
  const last = value.lastIndexOf('}');
  if (first < 0 || last < 0 || first >= last) return null;
  return value.slice(first, last + 1);
};

/**
 * Try to repair truncated JSON by appending closing brackets/strings.
 * Used when AI hits max_tokens and returns incomplete JSON (e.g. ends with "objectives": ["Hom).
 */
const tryRepairTruncatedJson = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed || trimmed.indexOf('{') < 0) return null;

  let inString = false;
  let escaped = false;
  const stack: string[] = [];

  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') {
      stack.push('}');
      continue;
    }

    if (ch === '[') {
      stack.push(']');
      continue;
    }

    if (ch === '}' && stack.length > 0 && stack[stack.length - 1] === '}') {
      stack.pop();
      continue;
    }

    if (ch === ']' && stack.length > 0 && stack[stack.length - 1] === ']') {
      stack.pop();
      continue;
    }
  }

  if (stack.length === 0 && !inString) return null;

  const suffix: string[] = [];
  if (inString) suffix.push('"');
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    suffix.push(stack[i]);
  }
  return trimmed + suffix.join('');
};

const parseWeeklyProgramFromText = (value: string, depth = 0): WeeklyProgramAIResponse | null => {
  if (depth > 4) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const braceSpan = extractJsonBraceSpan(trimmed);
  const candidates = [fenced?.[1], braceSpan, trimmed]
    .filter(
      (candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0,
    )
    .filter((c, i, arr) => arr.indexOf(c) === i); // dedupe

  for (const candidate of candidates) {
    const direct = tryParseJsonCandidate(candidate);
    if (direct != null) {
      const parsed = parseWeeklyProgramFromUnknown(direct, depth + 1);
      if (parsed) return parsed;
    }

    const jsonObjects = findBalancedJsonObjects(candidate);
    for (const jsonObject of jsonObjects) {
      const parsedObject = tryParseJsonCandidate(jsonObject);
      if (parsedObject == null) continue;
      const parsed = parseWeeklyProgramFromUnknown(parsedObject, depth + 1);
      if (parsed) return parsed;
    }

    const repaired = tryRepairTruncatedJson(candidate);
    if (repaired) {
      const repairedParsed = tryParseJsonCandidate(repaired);
      if (repairedParsed != null) {
        const parsed = parseWeeklyProgramFromUnknown(repairedParsed, depth + 1);
        if (parsed) return parsed;
      }
    }
  }

  return null;
};

const extractJson = (value: string): WeeklyProgramAIResponse | null => parseWeeklyProgramFromText(value);

const extractFunctionErrorMessage = async (error: unknown): Promise<string | null> => {
  const maybeError = error as { context?: unknown; message?: string };
  const context = maybeError?.context as
    | {
        status?: number;
        clone?: () => {
          json?: () => Promise<unknown>;
          text?: () => Promise<string>;
        };
        json?: () => Promise<unknown>;
        text?: () => Promise<string>;
      }
    | undefined;

  if (!context) {
    return maybeError?.message || null;
  }

  const status = typeof context.status === 'number' ? context.status : null;
  const response = typeof context.clone === 'function' ? context.clone() : context;

  try {
    if (typeof response.json === 'function') {
      const payload = await response.json();
      if (payload && typeof payload === 'object') {
        const record = payload as Record<string, unknown>;
        const message =
          typeof record.message === 'string'
            ? record.message
            : typeof record.error === 'string'
              ? record.error
              : null;
        if (message) {
          return status ? `${message} (HTTP ${status})` : message;
        }
      }
    }
  } catch {
    // ignore JSON parsing issues and try plain text fallback
  }

  try {
    if (typeof response.text === 'function') {
      const text = (await response.text()).trim();
      if (text) {
        return status ? `${text} (HTTP ${status})` : text;
      }
    }
  } catch {
    // ignore fallback parsing errors
  }

  return maybeError?.message || null;
};

const normalizeWeeklyProgramErrorMessage = (message: string | null | undefined): string | null => {
  const raw = String(message || '').trim();
  if (!raw) return null;

  const normalized = raw.toLowerCase();
  if (
    normalized.includes('workspace api usage limits') ||
    normalized.includes('api usage limits') ||
    normalized.includes('will regain access on')
  ) {
    const regain = raw.match(/regain access on ([0-9-]{10}(?: at)? [0-9:]{4,8} UTC)/i)?.[1];
    return regain
      ? `AI provider usage limit reached. Retry after ${regain}, or switch to another configured provider.`
      : 'AI provider usage limit reached. Please retry later or switch to another configured provider.';
  }

  if (normalized.includes('insufficient_quota') || normalized.includes('rate limit') || normalized.includes('http 429')) {
    return 'AI provider rate/quota limit reached. Please retry shortly.';
  }

  return raw;
};

const extractAIContent = (data: unknown): string => {
  if (typeof data === 'string') return data;
  if (!data || typeof data !== 'object') return JSON.stringify(data || {});

  const record = data as Record<string, unknown>;
  const primaryKeys = ['content', 'response', 'result', 'text', 'message'] as const;

  for (const key of primaryKeys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (!Array.isArray(value)) continue;
    const combined = value
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string') {
          return String((part as Record<string, unknown>).text);
        }
        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
    if (combined) return combined;
  }

  return JSON.stringify(data || {});
};

const buildRepairSourceExcerpt = (sourceText: string): string => {
  const source = String(sourceText || '').trim();
  if (!source) return '';
  if (source.length <= 12000) return source;

  const head = source.slice(0, 8500);
  const tail = source.slice(-3000);
  const omitted = Math.max(0, source.length - head.length - tail.length);
  return `${head}\n\n[TRUNCATED ${omitted} CHARS]\n\n${tail}`;
};

const repairWeeklyProgramJson = async (
  supabase: SupabaseFunctionsClient,
  sourceText: string,
): Promise<WeeklyProgramAIResponse | null> => {
  const source = buildRepairSourceExcerpt(sourceText);
  if (!source) return null;

  const repairPrompt = [
    'You are a JSON normalizer.',
    'Convert the SOURCE into STRICT JSON only (no markdown fences, no extra text).',
    'SOURCE may be partially truncated. If so, infer missing structure conservatively.',
    'Return COMPACT JSON (single-line/minified) to avoid token truncation.',
    'Schema:',
    '{',
    '  "title": "string",',
    '  "summary": "string",',
    '  "days": [',
    '    {',
    '      "day_of_week": 1,',
    '      "blocks": [',
    '        {',
    '          "block_order": 1,',
    '          "block_type": "circle_time|learning|movement|outdoor|meal|nap|assessment|transition|other",',
    '          "title": "string",',
    '          "start_time": "HH:MM|null",',
    '          "end_time": "HH:MM|null",',
    '          "objectives": ["string"],',
    '          "materials": ["string"],',
    '          "transition_cue": "string|null",',
    '          "notes": "string|null"',
    '        }',
    '      ]',
    '    }',
    '  ]',
    '}',
    'Rules: map weekday names to day_of_week 1..7; preserve details; use null when unknown.',
    'Rules: keep Monday-Friday (1..5) and max 6 blocks/day.',
    'Rules: do not include parent tips or home activity advice.',
    '',
    'SOURCE:',
    source,
  ].join('\n');

  try {
    const { data, error } = await supabase.functions.invoke('ai-proxy', {
      body: {
        service_type: 'lesson_generation',
        payload: { prompt: repairPrompt },
        // Prefer OpenAI first for recovery flows to avoid hard-stop when
        // Anthropic workspace caps are temporarily exhausted.
        prefer_openai: true,
        stream: false,
        enable_tools: false,
        metadata: { source: 'weekly_program_copilot_repair' },
      },
    });
    if (error) return null;
    return extractJson(extractAIContent(data));
  } catch {
    return null;
  }
};

const toBlockRecord = (
  raw: Record<string, unknown>,
  index: number,
  fallbackDayOfWeek: number,
): DailyProgramBlock => {
  const day = clampDayOfWeek(
    parseDayOfWeek(
      pickField(raw, [
        'day_of_week',
        'day',
        'weekday',
        'day_name',
        'dayName',
        'day_index',
        'dayIndex',
        'day_number',
        'dayNumber',
        'date',
      ]),
    ) ?? fallbackDayOfWeek,
  );

  return {
    day_of_week: day,
    block_order: Math.max(
      1,
      Number(pickField(raw, ['block_order', 'order', 'sequence', 'position', 'index'])) || index + 1,
    ),
    block_type: toBlockType(pickField(raw, ['block_type', 'type', 'activity_type', 'category'])),
    title:
      String(pickField(raw, ['title', 'name', 'activity', 'label']) || '').trim() ||
      `Learning Block ${index + 1}`,
    start_time:
      typeof pickField(raw, ['start_time', 'start', 'startTime', 'time_start']) === 'string'
        ? String(pickField(raw, ['start_time', 'start', 'startTime', 'time_start']))
        : null,
    end_time:
      typeof pickField(raw, ['end_time', 'end', 'endTime', 'time_end']) === 'string'
        ? String(pickField(raw, ['end_time', 'end', 'endTime', 'time_end']))
        : null,
    objectives: toStringArray(pickField(raw, ['objectives', 'goals', 'outcomes', 'learning_objectives'])),
    materials: toStringArray(pickField(raw, ['materials', 'resources', 'supplies'])),
    transition_cue:
      typeof pickField(raw, ['transition_cue', 'transitionCue', 'transition']) === 'string'
        ? String(pickField(raw, ['transition_cue', 'transitionCue', 'transition']))
        : null,
    notes:
      typeof pickField(raw, ['notes', 'note', 'description']) === 'string'
        ? String(pickField(raw, ['notes', 'note', 'description']))
        : null,
    parent_tip:
      typeof pickField(raw, ['parent_tip', 'parentTip', 'home_tip', 'parent_note']) === 'string'
        ? String(pickField(raw, ['parent_tip', 'parentTip', 'home_tip', 'parent_note']))
        : null,
  } as DailyProgramBlock;
};

const toBlocksFromFlat = (blocks: unknown[]): DailyProgramBlock[] =>
  blocks
    .map((item, index) => {
      const raw = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      return toBlockRecord(raw, index, 1);
    })
    .sort((a, b) => (a.day_of_week === b.day_of_week ? a.block_order - b.block_order : a.day_of_week - b.day_of_week));

const toBlocksFromDays = (days: WeeklyProgramAIResponse['days']): DailyProgramBlock[] => {
  if (!Array.isArray(days)) return [];

  const blocks: DailyProgramBlock[] = [];
  for (const dayEntry of days) {
    const dayRecord = (dayEntry && typeof dayEntry === 'object' ? dayEntry : {}) as Record<string, unknown>;
    const day = clampDayOfWeek(
      parseDayOfWeek(
        pickField(dayRecord, [
          'day_of_week',
          'day',
          'weekday',
          'day_name',
          'dayName',
          'day_index',
          'dayIndex',
          'day_number',
          'dayNumber',
          'date',
        ]),
      ) ?? 1,
    );
    const dayBlocks =
      extractBlocksArrayFromRecord(dayRecord) ||
      (Array.isArray(dayRecord.blocks) ? dayRecord.blocks : []);
    dayBlocks.forEach((item, index) => {
      const raw = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      blocks.push(toBlockRecord(raw, index, day));
    });
  }

  return blocks.sort((a, b) => (a.day_of_week === b.day_of_week ? a.block_order - b.block_order : a.day_of_week - b.day_of_week));
};

const WEATHER_KEYWORDS = [
  'weather',
  'forecast',
  'season',
  'temperature',
  'climate',
  'sunny',
  'rain',
  'cloud',
];
const WEEKDAY_SEQUENCE = [1, 2, 3, 4, 5] as const;
const WEEKDAY_LABELS: Record<number, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
};
const MIN_BLOCKS_PER_WEEKDAY = 6;
const MAX_BLOCKS_PER_WEEKDAY = 10;

const CAPS_HOME_LANGUAGE_KEYWORDS = [
  'home language',
  'language',
  'phonics',
  'story',
  'vocabulary',
  'read',
  'speaking',
  'listening',
  'rhyme',
];

const CAPS_MATHEMATICS_KEYWORDS = [
  'mathematics',
  'math',
  'number',
  'count',
  'shape',
  'pattern',
  'measurement',
  'sorting',
];

const CAPS_LIFE_SKILLS_KEYWORDS = [
  'life skills',
  'social',
  'emotional',
  'self-help',
  'hygiene',
  'movement',
  'outdoor',
  'wellness',
  'creative arts',
];

const hasWeatherSignal = (block: DailyProgramBlock): boolean => {
  const haystack = [
    block.block_type,
    block.title,
    block.notes,
    block.transition_cue,
  ]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');
  return WEATHER_KEYWORDS.some((keyword) => haystack.includes(keyword));
};

const appendNote = (existing: string | null | undefined, suffix: string): string => {
  const base = String(existing || '').trim();
  return base ? `${base} ${suffix}` : suffix;
};

const normalizeDayBlock = (
  block: DailyProgramBlock,
  day: number,
  order: number,
  noteSuffix?: string,
): DailyProgramBlock => ({
  ...block,
  day_of_week: clampDayOfWeek(day),
  block_order: Math.max(1, order),
  block_type: toBlockType(block.block_type),
  title: String(block.title || '').trim() || `Learning Block ${Math.max(1, order)}`,
  start_time: typeof block.start_time === 'string' ? block.start_time : null,
  end_time: typeof block.end_time === 'string' ? block.end_time : null,
  objectives: toStringArray(block.objectives).slice(0, 3),
  materials: toStringArray(block.materials).slice(0, 3),
  transition_cue: String(block.transition_cue || '').trim() || null,
  notes: noteSuffix ? appendNote(block.notes, noteSuffix) : String(block.notes || '').trim() || null,
  parent_tip: String(block.parent_tip || '').trim() || null,
});

const createFallbackWeekdayBlocks = (day: number): DailyProgramBlock[] => {
  const safeDay = clampDayOfWeek(day);
  return [
    {
      day_of_week: safeDay,
      block_order: 1,
      block_type: 'circle_time',
      title: 'Morning Circle: Weather & Greetings',
      start_time: '06:00',
      end_time: '08:00',
      objectives: ['Daily weather observation', 'Calm start to the day'],
      materials: ['Weather chart', 'Greeting song cards'],
      transition_cue: 'Welcome learners and transition to guided learning.',
      notes: 'Auto-filled to preserve a complete daily structure.',
      parent_tip: null,
    },
    {
      day_of_week: safeDay,
      block_order: 2,
      block_type: 'learning',
      title: 'Focused Learning Stations',
      start_time: '08:00',
      end_time: '09:30',
      objectives: ['Home Language and Mathematics integration', 'Guided small-group practice'],
      materials: ['Manipulatives', 'Picture cards'],
      transition_cue: 'Rotate groups smoothly with clear instructions.',
      notes: 'Auto-filled learning anchor block.',
      parent_tip: null,
    },
    {
      day_of_week: safeDay,
      block_order: 3,
      block_type: 'meal',
      title: 'Morning Snack, Hygiene & Reset',
      start_time: '09:30',
      end_time: '10:00',
      objectives: ['Healthy routine habits', 'Self-help and hygiene reinforcement'],
      materials: ['Snack station', 'Handwashing supplies'],
      transition_cue: 'Handwashing first, then settle for the next activity.',
      notes: 'Auto-filled meal/hygiene block.',
      parent_tip: null,
    },
    {
      day_of_week: safeDay,
      block_order: 4,
      block_type: 'outdoor',
      title: 'Outdoor Play & Gross Motor',
      start_time: '10:00',
      end_time: '11:00',
      objectives: ['Gross motor development', 'Social-emotional confidence'],
      materials: ['Outdoor play equipment'],
      transition_cue: 'Cool down and reflect before transitioning indoors.',
      notes: 'Auto-filled movement/outdoor anchor block.',
      parent_tip: null,
    },
    {
      day_of_week: safeDay,
      block_order: 5,
      block_type: 'meal',
      title: 'Lunch Break',
      start_time: '11:30',
      end_time: '12:00',
      objectives: ['Nutritional routine', 'Self-help skills during mealtimes'],
      materials: ['Lunch boxes', 'Handwashing supplies'],
      transition_cue: 'Pack away and wash hands before transitioning to afternoon activities.',
      notes: 'Auto-filled lunch block. Adjust times to match school schedule.',
      parent_tip: null,
    },
    {
      day_of_week: safeDay,
      block_order: 6,
      block_type: 'circle_time',
      title: 'Afternoon Story & Creative Time',
      start_time: '12:00',
      end_time: '13:00',
      objectives: ['Literacy development through storytelling', 'Creative expression and fine motor skills'],
      materials: ['Story books', 'Art supplies'],
      transition_cue: 'Settle down for story time, then move into creative activity.',
      notes: 'Auto-filled post-lunch afternoon block.',
      parent_tip: null,
    },
    {
      day_of_week: safeDay,
      block_order: 7,
      block_type: 'transition',
      title: 'Afternoon Reflection & Dismissal Prep',
      start_time: '13:00',
      end_time: '14:00',
      objectives: ['Reflective closure of the school day', 'Pack-up and dismissal readiness'],
      materials: ['School bags', 'Daily reflection chart'],
      transition_cue: 'Pack bags, share one thing learned today, line up calmly for pickup.',
      notes: 'Auto-filled dismissal block. Day must not end before 13:30.',
      parent_tip: null,
    },
  ];
};

const findNearestSourceDay = (
  grouped: Map<number, DailyProgramBlock[]>,
  targetDay: number,
  minimumBlocks = 1,
  excludeDay?: number,
): number | null => {
  for (let distance = 1; distance <= 4; distance += 1) {
    const previous = targetDay - distance;
    if (
      previous >= 1
      && previous <= 5
      && previous !== excludeDay
      && (grouped.get(previous) || []).length >= minimumBlocks
    ) {
      return previous;
    }

    const next = targetDay + distance;
    if (
      next >= 1
      && next <= 5
      && next !== excludeDay
      && (grouped.get(next) || []).length >= minimumBlocks
    ) {
      return next;
    }
  }
  return null;
};

const appendUniqueBlocks = (params: {
  base: DailyProgramBlock[];
  additions: DailyProgramBlock[];
  day: number;
  note: string;
  maxBlocks: number;
}): DailyProgramBlock[] => {
  const { base, additions, day, note, maxBlocks } = params;
  const next = [...base];
  const seenTitles = new Set(
    next
      .map((block) => String(block.title || '').trim().toLowerCase())
      .filter(Boolean),
  );

  for (const candidate of additions) {
    if (next.length >= maxBlocks) break;

    const titleKey = String(candidate.title || '').trim().toLowerCase();
    if (titleKey && seenTitles.has(titleKey)) continue;

    next.push(normalizeDayBlock(candidate, day, next.length + 1, note));
    if (titleKey) seenTitles.add(titleKey);
  }

  return next;
};

const ensureWeekdayCoverage = (blocks: DailyProgramBlock[]): DailyProgramBlock[] => {
  const sourceByDay = new Map<number, DailyProgramBlock[]>();
  for (const day of WEEKDAY_SEQUENCE) sourceByDay.set(day, []);

  blocks.forEach((block) => {
    const day = clampDayOfWeek(block.day_of_week);
    if (day < 1 || day > 5) return;
    sourceByDay.get(day)?.push(normalizeDayBlock(block, day, Number(block.block_order) || 1));
  });

  for (const day of WEEKDAY_SEQUENCE) {
    const dayBlocks = (sourceByDay.get(day) || [])
      .slice()
      .sort((a, b) => a.block_order - b.block_order)
      .slice(0, MAX_BLOCKS_PER_WEEKDAY)
      .map((block, index) => normalizeDayBlock(block, day, index + 1));
    sourceByDay.set(day, dayBlocks);
  }

  const normalized: DailyProgramBlock[] = [];
  for (const day of WEEKDAY_SEQUENCE) {
    let dayBlocks = (sourceByDay.get(day) || [])
      .slice()
      .sort((a, b) => a.block_order - b.block_order)
      .map((block, index) => normalizeDayBlock(block, day, index + 1))
      .slice(0, MAX_BLOCKS_PER_WEEKDAY);

    if (dayBlocks.length === 0) {
      const sourceDay =
        findNearestSourceDay(sourceByDay, day, MIN_BLOCKS_PER_WEEKDAY, day) ||
        findNearestSourceDay(sourceByDay, day, 1, day);

      if (sourceDay) {
        const sourceLabel = WEEKDAY_LABELS[sourceDay] || `Day ${sourceDay}`;
        const targetLabel = WEEKDAY_LABELS[day] || `Day ${day}`;
        dayBlocks = (sourceByDay.get(sourceDay) || [])
          .slice(0, MAX_BLOCKS_PER_WEEKDAY)
          .map((block, index) =>
            normalizeDayBlock(
              block,
              day,
              index + 1,
              `Auto-filled from ${sourceLabel} because ${targetLabel} was incomplete.`,
            ),
          );
      } else {
        dayBlocks = createFallbackWeekdayBlocks(day);
      }
    }

    if (dayBlocks.length < MIN_BLOCKS_PER_WEEKDAY) {
      dayBlocks = appendUniqueBlocks({
        base: dayBlocks,
        additions: createFallbackWeekdayBlocks(day),
        day,
        note: 'Auto-added to preserve a full daily routine.',
        maxBlocks: MIN_BLOCKS_PER_WEEKDAY,
      });

      while (dayBlocks.length < MIN_BLOCKS_PER_WEEKDAY) {
        const order = dayBlocks.length + 1;
        dayBlocks.push({
          day_of_week: day as 1 | 2 | 3 | 4 | 5 | 6 | 7,
          block_order: order,
          block_type: 'learning',
          title: `Learning Support Block ${order}`,
          start_time: null,
          end_time: null,
          objectives: ['Maintain consistent classroom flow'],
          materials: ['Classroom routine resources'],
          transition_cue: 'Transition calmly into the next block.',
          notes: 'Auto-added to preserve the minimum daily block count.',
          parent_tip: null,
        });
      }
    }

    dayBlocks = dayBlocks
      .slice(0, MAX_BLOCKS_PER_WEEKDAY)
      .map((block, index) => normalizeDayBlock(block, day, index + 1));

    normalized.push(...dayBlocks);
  }

  return normalized.sort((a, b) =>
    a.day_of_week === b.day_of_week ? a.block_order - b.block_order : a.day_of_week - b.day_of_week,
  );
};

const ensureDailyWeatherRepetition = (blocks: DailyProgramBlock[]): DailyProgramBlock[] => {
  const grouped = new Map<number, DailyProgramBlock[]>();
  for (const day of WEEKDAY_SEQUENCE) grouped.set(day, []);

  blocks.forEach((block) => {
    const day = clampDayOfWeek(block.day_of_week);
    if (day < 1 || day > 5) return;
    grouped.get(day)?.push({ ...block, day_of_week: day });
  });

  for (const day of WEEKDAY_SEQUENCE) {
    const dayBlocks = (grouped.get(day) || [])
      .slice()
      .sort((a, b) => a.block_order - b.block_order);
    if (dayBlocks.length === 0) continue;
    if (dayBlocks.some(hasWeatherSignal)) {
      grouped.set(day, dayBlocks);
      continue;
    }

    if (dayBlocks.length >= 6) {
      const anchorIndex = dayBlocks.findIndex((block) => String(block.block_type || '').toLowerCase() === 'circle_time');
      const idx = anchorIndex >= 0 ? anchorIndex : 0;
      const anchor = dayBlocks[idx];
      dayBlocks[idx] = {
        ...anchor,
        title: `Weather Check-In: ${anchor.title || 'Morning Circle'}`.trim(),
        transition_cue:
          anchor.transition_cue || 'Observe and discuss weather, then transition into the next activity.',
        objectives: Array.from(new Set(['Daily weather observation', ...(anchor.objectives || [])])).slice(0, 3),
      };
      grouped.set(day, dayBlocks);
      continue;
    }

    const nextOrder =
      dayBlocks.length > 0 ? Math.max(...dayBlocks.map((block) => Number(block.block_order) || 0)) + 1 : 1;

    dayBlocks.push({
      day_of_week: day as 1 | 2 | 3 | 4 | 5 | 6 | 7,
      block_order: nextOrder,
      block_type: 'circle_time',
      title: 'Weather Circle & Calendar Talk',
      start_time: null,
      end_time: null,
      objectives: ['Daily weather observation', 'Season vocabulary'],
      materials: ['Weather chart', 'Date cards'],
      transition_cue: 'Review weather and date, then transition to the next activity.',
      notes: 'Use repetition daily for routine confidence.',
      parent_tip: null,
    });
    grouped.set(day, dayBlocks);
  }

  const normalized: DailyProgramBlock[] = [];
  for (const day of WEEKDAY_SEQUENCE) {
    const dayBlocks = (grouped.get(day) || [])
      .slice()
      .sort((a, b) => a.block_order - b.block_order)
      .map((block, index) => ({
        ...block,
        day_of_week: day as 1 | 2 | 3 | 4 | 5 | 6 | 7,
        block_order: index + 1,
      }));
    normalized.push(...dayBlocks);
  }

  return normalized.sort((a, b) =>
    a.day_of_week === b.day_of_week ? a.block_order - b.block_order : a.day_of_week - b.day_of_week,
  );
};

type CapsCoverageSummary = {
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

const blockText = (block: DailyProgramBlock): string =>
  [
    block.block_type,
    block.title,
    block.notes,
    block.transition_cue,
    ...(block.objectives || []),
    ...(block.materials || []),
  ]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');

const blockTitleOnly = (block: DailyProgramBlock): string =>
  String(block.title || '').trim().toLowerCase();

const hasKeyword = (source: string, keywords: string[]): boolean =>
  keywords.some((keyword) => source.includes(keyword));

/** True if block title contains any of the given keywords (used to avoid assigning wrong anchor to a block). */
const blockTitleMatchesKeywords = (block: DailyProgramBlock, keywords: string[]): boolean =>
  hasKeyword(blockTitleOnly(block), keywords);

type ToiletRoutinePolicy = {
  requiredPerDay: number;
  beforeBreakfast: boolean;
  beforeLunch: boolean;
  beforeNap: boolean;
  maxDurationMinutes: number | null;
};

type AnchorRuleKey = 'morning_prayer' | 'circle_time' | 'breakfast' | 'lunch' | 'nap';

type AnchorRuleDefinition = {
  key: AnchorRuleKey;
  label: string;
  keywords: string[];
  blockType: DailyProgramBlockType;
  defaultDurationMinutes: number;
};

type AnchorRule = AnchorRuleDefinition & {
  startTime: string;
};

type PreflightAnchorPolicy = {
  anchors: AnchorRule[];
  toiletMaxDurationMinutes: number | null;
};

type AnchorDiagnostics = {
  requested: string[];
  applied: string[];
  skippedConflicts: string[];
};

type AnchorPolicyEnforcementOutcome = {
  blocks: DailyProgramBlock[];
  policy: PreflightAnchorPolicy;
  appliedCount: number;
  insertedCount: number;
  toiletCappedCount: number;
  anchorDiagnostics: AnchorDiagnostics;
};

const TOILET_KEYWORDS = ['toilet', 'bathroom', 'washroom', 'restroom', 'potty'];
const BREAKFAST_KEYWORDS = ['breakfast'];
const LUNCH_KEYWORDS = ['lunch'];
const NAP_KEYWORDS = ['nap', 'quiet time', 'rest time', 'rest block'];
const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
};

const PREFLIGHT_ANCHOR_DEFINITIONS: AnchorRuleDefinition[] = [
  {
    key: 'morning_prayer',
    label: 'Morning Prayer',
    keywords: ['morning prayer', 'prayer'],
    blockType: 'circle_time',
    defaultDurationMinutes: 10,
  },
  {
    key: 'circle_time',
    label: 'Circle Time',
    keywords: ['circle time', 'morning circle', 'circle'],
    blockType: 'circle_time',
    defaultDurationMinutes: 20,
  },
  {
    key: 'breakfast',
    label: 'Breakfast',
    keywords: ['breakfast'],
    blockType: 'meal',
    defaultDurationMinutes: 30,
  },
  {
    key: 'lunch',
    label: 'Lunch',
    keywords: ['lunch'],
    blockType: 'meal',
    defaultDurationMinutes: 30,
  },
  {
    key: 'nap',
    label: 'Nap / Quiet Time',
    keywords: ['nap', 'quiet time', 'rest time', 'rest block'],
    blockType: 'nap',
    defaultDurationMinutes: 60,
  },
];

const TIME_TOKEN_PATTERN = '(?:[01]?\\d|2[0-3]):[0-5]\\d(?:\\s?(?:am|pm))?|(?:0?[1-9]|1[0-2])\\s?(?:am|pm)';

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const minutesToTime = (value: number): string => {
  const safe = Math.max(0, Math.min(23 * 60 + 59, Math.round(value)));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const parseFlexibleTimeToMinutes = (value: string): number | null => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;

  const hm = raw.match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/i);
  if (hm) {
    let hours = Number(hm[1]);
    const minutes = Number(hm[2]);
    const meridian = hm[3]?.toLowerCase();
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes < 0 || minutes > 59) return null;
    if (meridian) {
      if (hours < 1 || hours > 12) return null;
      if (meridian === 'pm' && hours !== 12) hours += 12;
      if (meridian === 'am' && hours === 12) hours = 0;
    } else if (hours < 0 || hours > 23) {
      return null;
    }
    return hours * 60 + minutes;
  }

  const hOnly = raw.match(/^(\d{1,2})\s*(am|pm)$/i);
  if (hOnly) {
    let hours = Number(hOnly[1]);
    if (!Number.isFinite(hours) || hours < 1 || hours > 12) return null;
    const meridian = hOnly[2].toLowerCase();
    if (meridian === 'pm' && hours !== 12) hours += 12;
    if (meridian === 'am' && hours === 12) hours = 0;
    return hours * 60;
  }

  return null;
};

const findAnchorTimeInSource = (source: string, phrases: string[]): string | null => {
  let best: { index: number; minutes: number } | null = null;
  const timePrefix = '(?:at|@|from|start\\s+at)\\s*';
  for (const phrase of phrases) {
    const escaped = escapeRegExp(phrase);
    const beforeTime = new RegExp(
      `${escaped}[^\\n\\r\\.;]{0,48}?${timePrefix}(${TIME_TOKEN_PATTERN})`,
      'ig',
    );
    const afterTime = new RegExp(
      `${timePrefix}(${TIME_TOKEN_PATTERN})[^\\n\\r\\.;]{0,32}${escaped}`,
      'ig',
    );
    const adjacentTime = new RegExp(`${escaped}[^\\n\\r\\.;]{0,24}?(${TIME_TOKEN_PATTERN})`, 'ig');

    for (const pattern of [beforeTime, afterTime, adjacentTime]) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(source)) !== null) {
        const minutes = parseFlexibleTimeToMinutes(match[1]);
        if (minutes == null) continue;
        const index = match.index;
        if (!best || index < best.index) {
          best = { index, minutes };
        }
      }
    }
  }

  return best ? minutesToTime(best.minutes) : null;
};

const parseToiletMaxDurationMinutes = (source: string): number | null => {
  const patterns = [
    /(?:toilet|bathroom|potty|washroom)[^\n\r\.]{0,60}?(?:not\s*be\s*(?:more|longer)\s*than|no\s*more\s*than|maximum\s*(?:of)?|max\s*(?:of)?|under|less\s*than|must\s*not\s*exceed|not\s*exceed)\s*(\d{1,2})\s*(?:minutes?|mins?)/i,
    /(?:not\s*be\s*(?:more|longer)\s*than|no\s*more\s*than|maximum\s*(?:of)?|max\s*(?:of)?|under|less\s*than|must\s*not\s*exceed)\s*(\d{1,2})\s*(?:minutes?|mins?)[^\n\r\.]{0,40}?(?:toilet|bathroom|potty|washroom)/i,
    /(?:toilet|bathroom|potty|washroom)[^\n\r\.]{0,40}?(\d{1,2})\s*(?:minutes?|mins?)\s*or\s*less/i,
    /(\d{1,2})\s*(?:minutes?|mins?)\s*or\s*less[^\n\r\.]{0,30}?(?:toilet|bathroom|potty|washroom)/i,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (!match) continue;
    const parsed = Number(match[1]);
    if (!Number.isFinite(parsed)) continue;
    return Math.max(5, Math.min(30, Math.trunc(parsed)));
  }
  return null;
};

const collectPreflightSections = (
  input: GenerateWeeklyProgramFromTermInput,
): string[] => [
  input.preflightAnswers?.nonNegotiableAnchors,
  input.preflightAnswers?.fixedWeeklyEvents,
  input.preflightAnswers?.afterLunchPattern,
  input.preflightAnswers?.resourceConstraints,
  input.preflightAnswers?.safetyCompliance,
]
  .map((value) => String(value || '').trim())
  .filter(Boolean);

const parsePreflightAnchorPolicy = (
  input: GenerateWeeklyProgramFromTermInput,
): PreflightAnchorPolicy => {
  const source = collectPreflightSections(input).join(' ');

  if (!source) {
    return {
      anchors: [],
      toiletMaxDurationMinutes: null,
    };
  }

  const DEFAULT_ANCHOR_TIMES: Partial<Record<AnchorRuleKey, string>> = {
    morning_prayer: '08:00',
    circle_time: '08:10',
    breakfast: '08:30',
    nap: '11:30',
    lunch: '12:30',
  };
  const anchors: AnchorRule[] = [];
  for (const anchor of PREFLIGHT_ANCHOR_DEFINITIONS) {
    const parsed = findAnchorTimeInSource(source, anchor.keywords);
    const startTime = parsed ?? DEFAULT_ANCHOR_TIMES[anchor.key] ?? null;
    if (!startTime) continue;
    anchors.push({
      ...anchor,
      startTime,
    });
  }
  const toiletMax = parseToiletMaxDurationMinutes(source);
  return {
    anchors,
    toiletMaxDurationMinutes: toiletMax ?? (source.toLowerCase().includes('toilet') && source.toLowerCase().includes('20') ? 20 : null),
  };
};

const buildAnchorBlock = (
  day: number,
  order: number,
  anchor: AnchorRule,
): DailyProgramBlock => {
  const startMinutes = parseTimeToMinutes(anchor.startTime) ?? 0;
  const endMinutes = Math.min(23 * 60 + 59, startMinutes + anchor.defaultDurationMinutes);
  const noteSuffix = `Auto-added from preflight non-negotiable anchor (${anchor.label} ${anchor.startTime}).`;

  return {
    day_of_week: clampDayOfWeek(day),
    block_order: Math.max(1, order),
    block_type: anchor.blockType,
    title: anchor.label,
    start_time: anchor.startTime,
    end_time: minutesToTime(endMinutes),
    objectives: [`Respect daily anchor: ${anchor.label}`],
    materials: [],
    transition_cue: 'Keep this anchor fixed, then continue with the next planned activity.',
    notes: noteSuffix,
    parent_tip: null,
  };
};

const applyAnchorTimingToBlock = (
  block: DailyProgramBlock,
  anchor: AnchorRule,
): DailyProgramBlock => {
  const existingStart = parseTimeToMinutes(block.start_time);
  const existingEnd = parseTimeToMinutes(block.end_time);
  const baseDuration =
    existingStart != null && existingEnd != null && existingEnd > existingStart
      ? existingEnd - existingStart
      : anchor.defaultDurationMinutes;

  let duration = Math.max(10, baseDuration);
  if (anchor.key === 'morning_prayer') duration = Math.min(duration, 20);
  if (anchor.key === 'breakfast' || anchor.key === 'lunch') duration = Math.max(20, Math.min(duration, 45));
  if (anchor.key === 'nap') duration = Math.max(30, duration);

  const startMinutes = parseTimeToMinutes(anchor.startTime) ?? 0;
  const endMinutes = Math.min(23 * 60 + 59, startMinutes + duration);
  const shouldForceAnchorTitle = anchor.key === 'breakfast' || anchor.key === 'lunch' || anchor.key === 'nap';

  return {
    ...block,
    block_type: anchor.blockType,
    title: shouldForceAnchorTitle
      ? anchor.label
      : (String(block.title || '').trim() || anchor.label),
    start_time: anchor.startTime,
    end_time: minutesToTime(endMinutes),
    notes: appendNote(block.notes, `Anchor locked from preflight: ${anchor.label} at ${anchor.startTime}.`),
  };
};

const capToiletBlockDuration = (
  block: DailyProgramBlock,
  maxMinutes: number,
): DailyProgramBlock => {
  if (!isToiletRoutineBlock(block)) return block;
  const start = parseTimeToMinutes(block.start_time);
  const end = parseTimeToMinutes(block.end_time);
  if (start == null || end == null || end <= start) return block;
  if (end - start <= maxMinutes) return block;
  return {
    ...block,
    end_time: minutesToTime(start + maxMinutes),
    notes: appendNote(block.notes, `Toilet routine capped to ${maxMinutes} minutes from preflight rule.`),
  };
};

const enforcePreflightAnchorPolicy = (
  blocks: DailyProgramBlock[],
  input: GenerateWeeklyProgramFromTermInput,
): AnchorPolicyEnforcementOutcome => {
  const policy = parsePreflightAnchorPolicy(input);
  const requested = policy.anchors.map((anchor) => `${anchor.label} ${anchor.startTime}`);
  const anchorDiagnostics: AnchorDiagnostics = {
    requested,
    applied: [],
    skippedConflicts: [],
  };
  if (policy.anchors.length === 0 && policy.toiletMaxDurationMinutes == null) {
    return {
      blocks,
      policy,
      appliedCount: 0,
      insertedCount: 0,
      toiletCappedCount: 0,
      anchorDiagnostics,
    };
  }

  const grouped = new Map<number, DailyProgramBlock[]>();
  for (const day of WEEKDAY_SEQUENCE) grouped.set(day, []);

  for (const block of blocks) {
    const day = clampDayOfWeek(block.day_of_week);
    if (day >= 1 && day <= 5) {
      grouped.get(day)?.push(block);
    }
  }

  let appliedCount = 0;
  let insertedCount = 0;
  let toiletCappedCount = 0;

  for (const day of WEEKDAY_SEQUENCE) {
    const dayBlocks = (grouped.get(day) || [])
      .slice()
      .sort((a, b) => a.block_order - b.block_order);
    const claimedBlockIndexes = new Set<number>();

    for (const anchor of policy.anchors) {
      const otherAnchors = policy.anchors.filter((a) => a.key !== anchor.key);
      const titleMatchIdx = dayBlocks.findIndex(
        (block, index) =>
          !claimedBlockIndexes.has(index) &&
          !isToiletRoutineBlock(block) &&
          blockTitleMatchesKeywords(block, anchor.keywords),
      );
      const keywordMatchIdx =
        titleMatchIdx >= 0
          ? -1
          : dayBlocks.findIndex((block, index) => {
              if (claimedBlockIndexes.has(index) || isToiletRoutineBlock(block)) return false;
              if (!hasKeyword(blockText(block), anchor.keywords)) return false;
              const titleMatchesOther = otherAnchors.some((a) => blockTitleMatchesKeywords(block, a.keywords));
              return !titleMatchesOther;
            });
      if (titleMatchIdx < 0 && keywordMatchIdx < 0) {
        const skippedToilet = dayBlocks.some(
          (block, index) =>
            !claimedBlockIndexes.has(index) &&
            isToiletRoutineBlock(block) &&
            hasKeyword(blockText(block), anchor.keywords),
        );
        if (skippedToilet) {
          anchorDiagnostics.skippedConflicts.push(
            `Day ${day}: ${anchor.label} avoided toilet/hygiene block keyword collision.`,
          );
        }
      }
      const idx = titleMatchIdx >= 0 ? titleMatchIdx : keywordMatchIdx;
      if (idx >= 0) {
        dayBlocks[idx] = applyAnchorTimingToBlock(dayBlocks[idx], anchor);
        claimedBlockIndexes.add(idx);
        anchorDiagnostics.applied.push(`Day ${day}: ${anchor.label} -> ${anchor.startTime} (matched existing)`);
      } else {
        dayBlocks.push(buildAnchorBlock(day, dayBlocks.length + 1, anchor));
        claimedBlockIndexes.add(dayBlocks.length - 1);
        insertedCount += 1;
        anchorDiagnostics.applied.push(`Day ${day}: ${anchor.label} -> ${anchor.startTime} (inserted)`);
      }
      appliedCount += 1;
    }

    if (policy.toiletMaxDurationMinutes != null) {
      for (let i = 0; i < dayBlocks.length; i += 1) {
        const previousEnd = dayBlocks[i].end_time;
        dayBlocks[i] = capToiletBlockDuration(dayBlocks[i], policy.toiletMaxDurationMinutes);
        if (dayBlocks[i].end_time !== previousEnd) {
          toiletCappedCount += 1;
        }
      }
    }

    dayBlocks.sort((a, b) => {
      const aStart = parseTimeToMinutes(a.start_time);
      const bStart = parseTimeToMinutes(b.start_time);
      if (aStart != null && bStart != null && aStart !== bStart) return aStart - bStart;
      if (aStart != null && bStart == null) return -1;
      if (aStart == null && bStart != null) return 1;
      return a.block_order - b.block_order;
    });

    grouped.set(
      day,
      dayBlocks.map((block, index) => ({
        ...block,
        day_of_week: day as 1 | 2 | 3 | 4 | 5 | 6 | 7,
        block_order: index + 1,
      })),
    );
  }

  const normalized: DailyProgramBlock[] = [];
  for (const day of WEEKDAY_SEQUENCE) {
    normalized.push(...(grouped.get(day) || []));
  }

  return {
    blocks: normalized.sort((a, b) =>
      a.day_of_week === b.day_of_week ? a.block_order - b.block_order : a.day_of_week - b.day_of_week,
    ),
    policy,
    appliedCount,
    insertedCount,
    toiletCappedCount,
    anchorDiagnostics,
  };
};

const parseToiletRoutinePolicy = (input: GenerateWeeklyProgramFromTermInput): ToiletRoutinePolicy => {
  const preflightSections = collectPreflightSections(input);
  const preflightText = preflightSections.map((value) => value.toLowerCase()).join(' ');

  const hasToiletLanguage = TOILET_KEYWORDS.some((keyword) => preflightText.includes(keyword));
  let requiredPerDay = input.constraints?.includeToiletRoutine ? 1 : 0;

  if (hasToiletLanguage) {
    const numericSignals = [
      ...Array.from(preflightText.matchAll(/(\d+)\s*(?:x|times?)\s*(?:a\s*day|daily|per\s*day)?\s*(?:toilet|bathroom|potty)?/g)),
      ...Array.from(preflightText.matchAll(/(\d+)\s*(?:toilet|bathroom|potty)\s*routines?/g)),
      ...Array.from(preflightText.matchAll(/(?:toilet|bathroom|potty)\s*routines?\s*(\d+)/g)),
    ];
    const wordSignals = Array.from(
      preflightText.matchAll(
        /\b(one|two|three|four|five|six)\b\s*(?:toilet|bathroom|potty)?\s*routines?\b/g,
      ),
    )
      .map((match) => NUMBER_WORDS[match[1]] ?? 0)
      .filter((value) => Number.isFinite(value) && value > 0);
    const parsed = numericSignals
      .map((match) => Number(match[1]))
      .filter((value) => Number.isFinite(value) && value > 0)
      .concat(wordSignals)
      .map((value) => Math.min(6, Math.max(1, Math.trunc(value))));
    if (parsed.length > 0) {
      requiredPerDay = Math.max(requiredPerDay, ...parsed);
    }
  }

  const beforeBreakfast = hasToiletLanguage && /(?:before|pre-)\s*breakfast/.test(preflightText);
  const beforeLunch = hasToiletLanguage && /(?:before|pre-)\s*lunch/.test(preflightText);
  const beforeNap = hasToiletLanguage && /(?:before|pre-)\s*(?:nap|quiet\s*time|rest)/.test(preflightText);
  const anchorCount =
    Number(beforeBreakfast) + Number(beforeLunch) + Number(beforeNap);
  if (hasToiletLanguage && anchorCount > 0) {
    requiredPerDay = Math.max(requiredPerDay, anchorCount);
  }

  const maxDuration = parseToiletMaxDurationMinutes(preflightText)
    ?? (hasToiletLanguage && preflightText.includes('20') ? 20 : null);

  return {
    requiredPerDay,
    beforeBreakfast: beforeBreakfast || requiredPerDay >= 3,
    beforeLunch: beforeLunch || requiredPerDay >= 3,
    beforeNap: beforeNap || requiredPerDay >= 3,
    maxDurationMinutes: maxDuration,
  };
};

const isToiletRoutineBlock = (block: DailyProgramBlock): boolean =>
  hasKeyword(blockText(block), TOILET_KEYWORDS);

const isAnchorBlock = (block: DailyProgramBlock, keywords: string[]): boolean =>
  hasKeyword(blockText(block), keywords);

const createToiletRoutineBlock = (
  day: number,
  order: number,
  label?: string,
): DailyProgramBlock => ({
  day_of_week: clampDayOfWeek(day),
  block_order: Math.max(1, order),
  block_type: 'transition',
  title: label ? `Toilet Routine (${label})` : 'Toilet Routine & Hygiene',
  start_time: null,
  end_time: null,
  objectives: ['Toilet support and handwashing', 'Healthy hygiene habits'],
  materials: ['Soap', 'Water', 'Towels'],
  transition_cue: 'Move calmly to toilet routine, then transition back to class.',
  notes: 'Auto-enforced from preflight non-negotiable routine constraints.',
  parent_tip: null,
});

const normalizeDayOrdering = (day: number, blocks: DailyProgramBlock[]): DailyProgramBlock[] =>
  blocks
    .slice()
    .sort((a, b) => (a.block_order === b.block_order ? String(a.title || '').localeCompare(String(b.title || '')) : a.block_order - b.block_order))
    .map((block, index) => normalizeDayBlock(block, day, index + 1));

const enforceToiletRoutinePolicy = (
  blocks: DailyProgramBlock[],
  input: GenerateWeeklyProgramFromTermInput,
): {
  blocks: DailyProgramBlock[];
  policy: ToiletRoutinePolicy;
  insertedCount: number;
  adjustedDays: number[];
  toiletCappedCount: number;
} => {
  const policy = parseToiletRoutinePolicy(input);
  if (policy.requiredPerDay <= 0) {
    return {
      blocks,
      policy,
      insertedCount: 0,
      adjustedDays: [],
      toiletCappedCount: 0,
    };
  }

  const grouped = new Map<number, DailyProgramBlock[]>();
  for (const day of WEEKDAY_SEQUENCE) grouped.set(day, []);
  for (const block of blocks) {
    const day = clampDayOfWeek(block.day_of_week);
    if (day >= 1 && day <= 5) {
      grouped.get(day)?.push(block);
    }
  }

  let insertedCount = 0;
  let toiletCappedCount = 0;
  const adjustedDays: number[] = [];

  for (const day of WEEKDAY_SEQUENCE) {
    let dayBlocks = normalizeDayOrdering(day, grouped.get(day) || []);
    const initialLength = dayBlocks.length;
    const initialToiletCount = dayBlocks.filter(isToiletRoutineBlock).length;

    const ensureAnchorBefore = (anchorKeywords: string[], label: string) => {
      const anchorIndex = dayBlocks.findIndex((block) => isAnchorBlock(block, anchorKeywords));
      if (anchorIndex < 0) return;
      const hasToiletBefore = dayBlocks.slice(0, anchorIndex).some(isToiletRoutineBlock);
      if (hasToiletBefore) return;
      dayBlocks.splice(anchorIndex, 0, createToiletRoutineBlock(day, anchorIndex + 1, label));
      insertedCount += 1;
    };

    if (policy.beforeBreakfast) ensureAnchorBefore(BREAKFAST_KEYWORDS, 'Before Breakfast');
    if (policy.beforeLunch) ensureAnchorBefore(LUNCH_KEYWORDS, 'Before Lunch');
    if (policy.beforeNap) ensureAnchorBefore(NAP_KEYWORDS, 'Before Nap');

    let toiletCount = dayBlocks.filter(isToiletRoutineBlock).length;
    while (toiletCount < policy.requiredPerDay) {
      const lunchIndex = dayBlocks.findIndex((block) => isAnchorBlock(block, LUNCH_KEYWORDS));
      const insertIndex = lunchIndex > 0 ? lunchIndex : dayBlocks.length;
      dayBlocks.splice(insertIndex, 0, createToiletRoutineBlock(day, insertIndex + 1, 'Scheduled'));
      insertedCount += 1;
      toiletCount += 1;
    }

    if (policy.maxDurationMinutes != null) {
      for (let i = 0; i < dayBlocks.length; i += 1) {
        const previousEnd = dayBlocks[i].end_time;
        dayBlocks[i] = capToiletBlockDuration(dayBlocks[i], policy.maxDurationMinutes);
        if (dayBlocks[i].end_time !== previousEnd) {
          toiletCappedCount += 1;
        }
      }
    }

    dayBlocks = normalizeDayOrdering(day, dayBlocks);
    grouped.set(day, dayBlocks);

    const finalToiletCount = dayBlocks.filter(isToiletRoutineBlock).length;
    if (dayBlocks.length !== initialLength || finalToiletCount !== initialToiletCount) {
      adjustedDays.push(day);
    }
  }

  const normalized: DailyProgramBlock[] = [];
  for (const day of WEEKDAY_SEQUENCE) {
    normalized.push(...(grouped.get(day) || []));
  }

  return {
    blocks: normalized.sort((a, b) =>
      a.day_of_week === b.day_of_week ? a.block_order - b.block_order : a.day_of_week - b.day_of_week,
    ),
    policy,
    insertedCount,
    adjustedDays: Array.from(new Set(adjustedDays)),
    toiletCappedCount,
  };
};

const computeCapsCoverage = (blocks: DailyProgramBlock[]): CapsCoverageSummary => {
  const grouped = new Map<number, DailyProgramBlock[]>();
  for (const day of WEEKDAY_SEQUENCE) grouped.set(day, []);
  for (const block of blocks) {
    const day = clampDayOfWeek(block.day_of_week);
    if (day >= 1 && day <= 5) grouped.get(day)?.push(block);
  }

  const homeLanguageDays: number[] = [];
  const mathematicsDays: number[] = [];
  const lifeSkillsDays: number[] = [];
  const weatherRoutineDays: number[] = [];
  const missingByDay: CapsCoverageSummary['missingByDay'] = [];

  let passChecks = 0;
  const totalChecks = 20;

  for (const day of WEEKDAY_SEQUENCE) {
    const dayBlocks = grouped.get(day) || [];
    const dayText = dayBlocks.map(blockText).join(' ');
    const missingStrands: string[] = [];

    const hasHomeLanguage = hasKeyword(dayText, CAPS_HOME_LANGUAGE_KEYWORDS);
    const hasMathematics = hasKeyword(dayText, CAPS_MATHEMATICS_KEYWORDS);
    const hasLifeSkills =
      hasKeyword(dayText, CAPS_LIFE_SKILLS_KEYWORDS)
      || dayBlocks.some((block) => ['movement', 'outdoor', 'meal', 'nap'].includes(String(block.block_type || '').toLowerCase()));
    const hasWeather = dayBlocks.some(hasWeatherSignal);

    if (hasHomeLanguage) {
      homeLanguageDays.push(day);
      passChecks += 1;
    } else {
      missingStrands.push('Home Language');
    }

    if (hasMathematics) {
      mathematicsDays.push(day);
      passChecks += 1;
    } else {
      missingStrands.push('Mathematics');
    }

    if (hasLifeSkills) {
      lifeSkillsDays.push(day);
      passChecks += 1;
    } else {
      missingStrands.push('Life Skills');
    }

    if (hasWeather) {
      weatherRoutineDays.push(day);
      passChecks += 1;
    } else {
      missingStrands.push('Daily Weather');
    }

    if (missingStrands.length > 0) {
      missingByDay.push({ day, missingStrands });
    }
  }

  return {
    homeLanguageDays,
    mathematicsDays,
    lifeSkillsDays,
    weatherRoutineDays,
    missingByDay,
    coverageScore: Math.round((passChecks / totalChecks) * 100),
  };
};

const applyCapsCoverageMetadata = (
  blocks: DailyProgramBlock[],
  coverage: CapsCoverageSummary,
): DailyProgramBlock[] => {
  if (coverage.missingByDay.length === 0) return blocks;

  const mutable = blocks.map((block) => ({
    ...block,
    objectives: [...(block.objectives || [])],
    materials: [...(block.materials || [])],
  }));

  for (const gap of coverage.missingByDay) {
    const dayBlocks = mutable
      .filter((block) => block.day_of_week === gap.day)
      .sort((a, b) => a.block_order - b.block_order);

    if (dayBlocks.length === 0) continue;
    const target = dayBlocks[0];
    const strandSummary = gap.missingStrands.join(', ');
    const reinforcementObjective = `CAPS reinforcement: ${strandSummary}`;

    target.objectives = Array.from(new Set([...(target.objectives || []), reinforcementObjective])).slice(0, 4);

    const existingNotes = String(target.notes || '').trim();
    target.notes = existingNotes
      ? `${existingNotes} CAPS focus reminder: ${strandSummary}.`
      : `CAPS focus reminder: ${strandSummary}.`;

    if (gap.missingStrands.includes('Daily Weather')) {
      const existingTransition = String(target.transition_cue || '').trim();
      target.transition_cue = existingTransition
        ? `${existingTransition} Include a weather check-in before transition.`
        : 'Include a weather check-in before transition.';
    }
  }

  return mutable.sort((a, b) =>
    a.day_of_week === b.day_of_week ? a.block_order - b.block_order : a.day_of_week - b.day_of_week,
  );
};

/** Parse "HH:MM" to minutes since midnight, or null if invalid */
const parseTimeToMinutes = (time: string | null | undefined): number | null => {
  if (!time) return null;
  const m = String(time).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
};

/** 13:30 = 810 minutes — the minimum end-time for any day */
const MIN_DAY_END_MINUTES = 810; // 13:30

/**
 * Ensure every weekday's last block ends at or after 13:30.
 * When a day ends early, append an afternoon block so the full day is covered.
 */
const ensureFullDayCoverage = (blocks: DailyProgramBlock[]): DailyProgramBlock[] => {
  const grouped = new Map<number, DailyProgramBlock[]>();
  for (const d of WEEKDAY_SEQUENCE) grouped.set(d, []);
  for (const b of blocks) {
    const d = clampDayOfWeek(b.day_of_week);
    if (d >= 1 && d <= 5) grouped.get(d)?.push(b);
  }

  const result: DailyProgramBlock[] = [];
  for (const day of WEEKDAY_SEQUENCE) {
    const dayBlocks = (grouped.get(day) || [])
      .slice()
      .sort((a, b) => a.block_order - b.block_order);

    if (dayBlocks.length === 0) {
      result.push(...createFallbackWeekdayBlocks(day));
      continue;
    }

    // Find the latest end_time across all blocks for this day
    let latestEndMinutes: number | null = null;
    for (const b of dayBlocks) {
      const t = parseTimeToMinutes(b.end_time);
      if (t !== null && (latestEndMinutes === null || t > latestEndMinutes)) {
        latestEndMinutes = t;
      }
    }

    const nextOrder = Math.max(...dayBlocks.map((b) => b.block_order)) + 1;

    if (latestEndMinutes !== null && latestEndMinutes < MIN_DAY_END_MINUTES) {
      // Day ends before 13:30 — determine what's missing
      const startMinutes = latestEndMinutes;
      const startH = String(Math.floor(startMinutes / 60)).padStart(2, '0');
      const startM = String(startMinutes % 60).padStart(2, '0');

      // Add afternoon session starting from where the day ended
      dayBlocks.push({
        day_of_week: day as 1 | 2 | 3 | 4 | 5 | 6 | 7,
        block_order: nextOrder,
        block_type: 'circle_time',
        title: 'Afternoon Story & Creative Activity',
        start_time: `${startH}:${startM}`,
        end_time: '13:30',
        objectives: [
          'Literacy through storytelling',
          'Creative expression and fine motor development',
          'Calm afternoon routine before dismissal',
        ],
        materials: ['Story books', 'Art/craft supplies', 'Colouring sheets'],
        transition_cue: 'Pack away and prepare for dismissal.',
        notes: 'Auto-added: day must not end before 13:30.',
        parent_tip: null,
      });

      // Add dismissal block if latest end is still before 13:30
      dayBlocks.push({
        day_of_week: day as 1 | 2 | 3 | 4 | 5 | 6 | 7,
        block_order: nextOrder + 1,
        block_type: 'transition',
        title: 'Dismissal Preparation & Pack-Up',
        start_time: '13:30',
        end_time: '14:00',
        objectives: ['Organised end-of-day routine', 'Reflection and pack-up'],
        materials: ['School bags', 'Daily chart'],
        transition_cue: 'Line up calmly and wait for parents or transport.',
        notes: 'Auto-added dismissal block. Adjust if school closes later.',
        parent_tip: null,
      });
    } else if (latestEndMinutes === null) {
      // No times on any block — append an untimed afternoon close block
      dayBlocks.push({
        day_of_week: day as 1 | 2 | 3 | 4 | 5 | 6 | 7,
        block_order: nextOrder,
        block_type: 'transition',
        title: 'Afternoon Close & Dismissal',
        start_time: '13:30',
        end_time: '14:00',
        objectives: ['End-of-day pack-up and reflection'],
        materials: ['School bags'],
        transition_cue: 'Pack bags and prepare for pickup.',
        notes: 'Auto-added to ensure full-day coverage through 13:30.',
        parent_tip: null,
      });
    }

    result.push(...dayBlocks.map((b, i) => ({ ...b, day_of_week: day as 1|2|3|4|5|6|7, block_order: i + 1 })));
  }

  return result.sort((a, b) =>
    a.day_of_week === b.day_of_week ? a.block_order - b.block_order : a.day_of_week - b.day_of_week,
  );
};

/** Fix common AI slips in generated block text (rainy→many, prefflight, truncation). */
const sanitizeGeneratedBlockText = (str: string | null | undefined): string => {
  if (str == null || typeof str !== 'string') return '';
  let out = str.trim();
  // "if many" is a common truncation of "if rainy" in outdoor fallback phrases
  out = out.replace(/\bif\s+many\b/gi, 'if rainy');
  // Double-f preflight typo
  out = out.replace(/prefflight/gi, 'preflight');
  out = out.replace(/pre-?flight/gi, 'preflight');
  return out;
};

/** Apply text sanitization to a single block's notes, objectives, materials, transition_cue. */
const sanitizeGeneratedBlockContent = (block: DailyProgramBlock): DailyProgramBlock => {
  const notes = sanitizeGeneratedBlockText(block.notes);
  const objectives = (block.objectives || []).map((o) => sanitizeGeneratedBlockText(o)).filter(Boolean);
  const materials = (block.materials || []).map((m) => sanitizeGeneratedBlockText(m)).filter(Boolean);
  const transition_cue = block.transition_cue != null ? sanitizeGeneratedBlockText(block.transition_cue) : block.transition_cue;
  return {
    ...block,
    notes: notes || (block.notes ?? undefined),
    objectives: objectives.length > 0 ? objectives : (block.objectives || []),
    materials: materials.length > 0 ? materials : (block.materials || []),
    transition_cue: transition_cue || (block.transition_cue ?? undefined),
  };
};

const extractAnchorMinutes = (
  policy: PreflightAnchorPolicy,
  key: AnchorRuleKey,
): number | null => {
  const anchor = policy.anchors.find((item) => item.key === key);
  return anchor ? parseFlexibleTimeToMinutes(anchor.startTime) : null;
};

const detectPolicyConflicts = (
  input: GenerateWeeklyProgramFromTermInput,
  policy: PreflightAnchorPolicy,
): string[] => {
  const conflicts: string[] = [];
  const afterLunchPattern = String(input.preflightAnswers?.afterLunchPattern || '').toLowerCase();
  if (!afterLunchPattern) return conflicts;

  const lunchMinutes = extractAnchorMinutes(policy, 'lunch');
  const napMinutes = extractAnchorMinutes(policy, 'nap');
  const requestsNapAfterLunch =
    afterLunchPattern.includes('after lunch')
    && (afterLunchPattern.includes('nap') || afterLunchPattern.includes('quiet'));

  if (
    requestsNapAfterLunch
    && lunchMinutes != null
    && napMinutes != null
    && napMinutes <= lunchMinutes
  ) {
    conflicts.push(
      `Soft after-lunch narrative conflicts with hard anchors (nap ${minutesToTime(
        napMinutes,
      )} is not after lunch ${minutesToTime(lunchMinutes)}). Hard anchors kept.`,
    );
  }

  return conflicts;
};

const extractGapsFilledCount = (warnings: string[]): number =>
  warnings.reduce((total, warning) => {
    const match = warning.match(/filled\s+(\d+)\s+internal timeline gap/i);
    if (!match?.[1]) return total;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? total + parsed : total;
  }, 0);

const summarizeDayTimeline = (blocks: DailyProgramBlock[]): Record<number, string[]> => {
  const summary: Record<number, string[]> = {};
  for (const day of WEEKDAY_SEQUENCE) {
    summary[day] = blocks
      .filter((block) => block.day_of_week === day)
      .sort((a, b) => a.block_order - b.block_order)
      .map((block) => `${block.title} [${block.start_time || '--'}-${block.end_time || '--'}]`);
  }
  return summary;
};

const normalizeAIResponse = (
  response: WeeklyProgramAIResponse,
  input: GenerateWeeklyProgramFromTermInput,
  modelUsed?: string | null,
): WeeklyProgramDraft => {
  const weekStart = startOfWeekMonday(input.weekStartDate);
  const weekEnd = addDays(weekStart, 4);
  const flatBlocks = Array.isArray(response.blocks) ? toBlocksFromFlat(response.blocks) : [];
  const dayBlocks = toBlocksFromDays(response.days);
  const rawBlocks = flatBlocks.length > 0 ? flatBlocks : dayBlocks;

  // Enforce full 5-day cycle: only keep Monday–Friday (1–5), no exceptions
  const blocks = rawBlocks.filter((b) => {
    const d = clampDayOfWeek(b.day_of_week);
    return d >= 1 && d <= 5;
  });

  const safeBlocks = blocks.length > 0
    ? blocks
    : WEEKDAY_SEQUENCE.flatMap((day) => createFallbackWeekdayBlocks(day));

  const sanitizedBlocks = safeBlocks.map(sanitizeGeneratedBlockContent);
  const weekdayCoveredBlocks = ensureWeekdayCoverage(sanitizedBlocks);
  const toiletPolicyOutcome = enforceToiletRoutinePolicy(weekdayCoveredBlocks, input);
  const anchorPolicyOutcome = enforcePreflightAnchorPolicy(toiletPolicyOutcome.blocks, input);
  const policyConflicts = detectPolicyConflicts(input, anchorPolicyOutcome.policy);
  const fullDayBlocks = ensureFullDayCoverage(anchorPolicyOutcome.blocks);
  const normalizedBlocks = ensureDailyWeatherRepetition(fullDayBlocks);
  if (__DEV__) {
    console.log('[WeeklyProgramCopilot] before stabilization', {
      modelUsed: modelUsed || null,
      weekdayInputBlocks: weekdayCoveredBlocks.length,
      afterToiletPolicyBlocks: toiletPolicyOutcome.blocks.length,
      afterAnchorPolicyBlocks: anchorPolicyOutcome.blocks.length,
      requestedAnchors: anchorPolicyOutcome.anchorDiagnostics.requested,
      appliedAnchors: anchorPolicyOutcome.anchorDiagnostics.applied.length,
      skippedAnchorConflicts: anchorPolicyOutcome.anchorDiagnostics.skippedConflicts,
      toiletPolicy: toiletPolicyOutcome.policy,
      policyConflicts,
    });
  }
  const stabilization = stabilizeDailyRoutineBlocks(normalizedBlocks, {
    ageGroup: input.ageGroup,
    arrivalStartTime: input.constraints?.arrivalStartTime || null,
    pickupCutoffTime: input.constraints?.pickupCutoffTime || null,
  });
  const combinedNormalizationWarnings = [
    ...stabilization.warnings,
    ...policyConflicts,
  ];
  const timingDiagnostics = {
    gapsFilled: extractGapsFilledCount(stabilization.warnings),
    overlongToiletCapped:
      (toiletPolicyOutcome.toiletCappedCount || 0) + (anchorPolicyOutcome.toiletCappedCount || 0),
  };
  const initialCoverage = computeCapsCoverage(stabilization.blocks);
  const correctedBlocks = applyCapsCoverageMetadata(stabilization.blocks, initialCoverage);
  const finalCoverage = computeCapsCoverage(correctedBlocks);
  if (__DEV__) {
    console.log('[WeeklyProgramCopilot] after stabilization', {
      warnings: combinedNormalizationWarnings,
      metrics: stabilization.metrics,
      timingDiagnostics,
      anchorDiagnostics: anchorPolicyOutcome.anchorDiagnostics,
      timelineByDay: summarizeDayTimeline(correctedBlocks),
    });
  }
  const assumptionSummary: string[] = input.preflightAnswers
    ? [
        `Anchors: ${input.preflightAnswers.nonNegotiableAnchors}`,
        `Fixed events: ${input.preflightAnswers.fixedWeeklyEvents}`,
        `After lunch pattern: ${input.preflightAnswers.afterLunchPattern}`,
        `Resource constraints: ${input.preflightAnswers.resourceConstraints}`,
        `Safety/compliance: ${input.preflightAnswers.safetyCompliance}`,
      ]
    : [];

  assumptionSummary.push(
    `CAPS strand coverage score: ${finalCoverage.coverageScore}% (HL ${finalCoverage.homeLanguageDays.length}/5, Math ${finalCoverage.mathematicsDays.length}/5, Life Skills ${finalCoverage.lifeSkillsDays.length}/5, Weather ${finalCoverage.weatherRoutineDays.length}/5)`,
  );
  if (finalCoverage.missingByDay.length > 0) {
    assumptionSummary.push(
      `Coverage gaps flagged for follow-up: ${finalCoverage.missingByDay
        .map((gap) => `Day ${gap.day} (${gap.missingStrands.join(', ')})`)
        .join('; ')}`,
    );
  }
  if (toiletPolicyOutcome.policy.requiredPerDay > 0) {
    const anchorHints = [
      toiletPolicyOutcome.policy.beforeBreakfast ? 'before breakfast' : null,
      toiletPolicyOutcome.policy.beforeLunch ? 'before lunch' : null,
      toiletPolicyOutcome.policy.beforeNap ? 'before nap/quiet time' : null,
    ].filter(Boolean);
    assumptionSummary.push(
      `Toilet routine requirement: at least ${toiletPolicyOutcome.policy.requiredPerDay} per weekday${anchorHints.length > 0 ? ` (${anchorHints.join(', ')})` : ''}.`,
    );
  }
  if (toiletPolicyOutcome.policy.maxDurationMinutes != null) {
    assumptionSummary.push(
      `Toilet max duration parsed from preflight: ${toiletPolicyOutcome.policy.maxDurationMinutes} minutes.`,
    );
  }
  if (toiletPolicyOutcome.insertedCount > 0) {
    assumptionSummary.push(
      `Auto-enforced toilet routines: inserted ${toiletPolicyOutcome.insertedCount} block(s) across day(s) ${toiletPolicyOutcome.adjustedDays.join(', ')} to satisfy preflight constraints.`,
    );
  }
  if (anchorPolicyOutcome.policy.anchors.length > 0) {
    assumptionSummary.push(
      `Anchor locks detected: ${anchorPolicyOutcome.policy.anchors
        .map((anchor) => `${anchor.label} ${anchor.startTime}`)
        .join('; ')}`,
    );
  }
  if (anchorPolicyOutcome.appliedCount > 0) {
    assumptionSummary.push(
      `Anchor enforcement applied ${anchorPolicyOutcome.appliedCount} time(s) across weekdays (${anchorPolicyOutcome.insertedCount} anchor block(s) added).`,
    );
  }
  if (anchorPolicyOutcome.policy.toiletMaxDurationMinutes != null) {
    assumptionSummary.push(
      `Toilet duration cap enforced at ${anchorPolicyOutcome.policy.toiletMaxDurationMinutes} minutes per timed block.`,
    );
  }
  if (timingDiagnostics.overlongToiletCapped > 0) {
    assumptionSummary.push(
      `Toilet duration caps applied to ${timingDiagnostics.overlongToiletCapped} block(s).`,
    );
  }
  if (modelUsed) {
    assumptionSummary.push(`AI model used: ${modelUsed}`);
  }
  if (combinedNormalizationWarnings.length > 0) {
    assumptionSummary.push(
      `Normalization warnings: ${combinedNormalizationWarnings.join(' | ')}`,
    );
  }
  assumptionSummary.push(
    `Normalization metrics: overlaps resolved=${stabilization.metrics.overlapsResolved}, deduped blocks=${stabilization.metrics.dedupedBlocks}, anchor locks=${stabilization.metrics.anchorLocksApplied}.`,
  );

  return {
    preschool_id: input.preschoolId,
    created_by: input.createdBy,
    week_start_date: weekStart,
    week_end_date: weekEnd,
    age_group: input.ageGroup,
    title: (response.title || `${input.theme} Weekly Program`).trim(),
    summary: (response.summary || `Weekly program for ${input.theme}`).trim(),
    generated_by_ai: true,
    source: 'ai',
    status: 'draft',
    generation_context: {
      preflight: input.preflightAnswers,
      assumptionSummary,
      modelUsed: modelUsed || null,
      capsCoverage: finalCoverage,
      normalizationWarnings: combinedNormalizationWarnings,
      normalizationMetrics: stabilization.metrics,
      anchorDiagnostics: anchorPolicyOutcome.anchorDiagnostics,
      policyConflicts,
      timingDiagnostics,
    },
    blocks: correctedBlocks,
  };
};

/** Get SA public holidays falling within the given week (Mon–Fri) for prompt context */
function getHolidaysInWeek(weekStart: string): Array<{ date: string; name: string; dayOfWeek: number }> {
  const start = new Date(`${weekStart}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return [];
  const year = start.getUTCFullYear();
  const { holidays } = getSACalendarForYear(year);
  const result: Array<{ date: string; name: string; dayOfWeek: number }> = [];
  for (let d = 0; d < 5; d++) {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + d);
    const dateStr = date.toISOString().slice(0, 10);
    const dayOfWeek = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
    const match = holidays.find((h) => h.date === dateStr);
    if (match) result.push({ date: dateStr, name: match.name, dayOfWeek });
  }
  return result;
}

const buildPrompt = (input: GenerateWeeklyProgramFromTermInput): string => {
  const constraints = input.constraints || {};
  const objectivesText = (input.weeklyObjectives || []).join('; ') || 'Age-appropriate learning outcomes';
  const routineRequirements: string[] = [];
  const preflight = input.preflightAnswers;
  const toiletPolicy = parseToiletRoutinePolicy(input);
  const weekStart = startOfWeekMonday(input.weekStartDate);
  const holidaysInWeek = getHolidaysInWeek(weekStart);

  if (toiletPolicy.requiredPerDay > 0) {
    routineRequirements.push(`Include at least ${toiletPolicy.requiredPerDay} toilet/bathroom routine blocks each weekday.`);
    if (toiletPolicy.beforeBreakfast) {
      routineRequirements.push('Place a toilet routine before breakfast each weekday.');
    }
    if (toiletPolicy.beforeLunch) {
      routineRequirements.push('Place a toilet routine before lunch each weekday.');
    }
    if (toiletPolicy.beforeNap) {
      routineRequirements.push('Place a toilet routine before nap/quiet-time each weekday.');
    }
  }
  if (constraints.includeNapTime) {
    const ageGroup = String(input.ageGroup || '').trim();
    const maxAgeMatch = ageGroup.match(/(\d+)[-–](\d+)/);
    const maxAge = maxAgeMatch ? Math.max(Number(maxAgeMatch[1]), Number(maxAgeMatch[2])) : 4;
    if (maxAge <= 3) {
      routineRequirements.push(
        'Include a dedicated nap block (45–90 min) after lunch; 1–3 year olds need regular sleep.',
      );
    } else {
      routineRequirements.push(
        'Include a rest or quiet-time block after lunch; 4–6 year olds may nap or do quiet activities (20–45 min).',
      );
    }
  }
  if (constraints.includeMealBlocks) {
    routineRequirements.push('Include practical meal/snack windows every day.');
  }
  if (constraints.includeOutdoorPlay) {
    routineRequirements.push('Include an outdoor gross-motor play block each day.');
  }
  if (constraints.includeStoryCircle) {
    routineRequirements.push('Include at least one story, read-aloud, or circle-time literacy block per day.');
  }
  if (constraints.includeTransitionCues) {
    routineRequirements.push('Provide explicit transition cues between blocks.');
  }
  if (constraints.includeHygieneChecks) {
    routineRequirements.push('Include hygiene routines (e.g., handwashing or cleanup) as part of the daily flow.');
  }

  const arrivalStart = constraints.arrivalStartTime || '06:00';
  const arrivalCutoff = constraints.arrivalCutoffTime || '08:00';
  const pickupStart = constraints.pickupStartTime || '14:00';
  const pickupCutoff = constraints.pickupCutoffTime || '16:00';

  const strictArrivalPickupLines = [
    `STRICT ARRIVAL AND PICKUP WINDOWS (do not schedule outside these):`,
    `- Arrival window: from ${arrivalStart} until ${arrivalCutoff}. The first block of the day (e.g. Arrival/greeting) must start at ${arrivalStart} or later. Formal program (e.g. Morning Prayer, Circle Time) should align so that by ${arrivalCutoff} children are in the main routine.`,
    `- Pickup window: from ${pickupStart} to ${pickupCutoff}. The last block of every day MUST end by ${pickupCutoff}. Dismissal/pack-up must finish within this window.`,
    `- No block may start before ${arrivalStart} or end after ${pickupCutoff}.`,
  ];

  return [
    'Generate a CAPS-aligned preschool weekly school routine from term context.',
    ...(input.schoolName ? [`School name: ${input.schoolName}`] : []),
    `Theme: ${input.theme}`,
    `Age group: ${input.ageGroup}`,
    `Week start: ${weekStart}`,
    ...(holidaysInWeek.length > 0
      ? [
          `South African public holidays in this week (day_of_week 1=Mon..5=Fri): ${holidaysInWeek
            .map((h) => `Day ${h.dayOfWeek} (${h.date}): ${h.name}`)
            .join('; ')}. For each holiday weekday, plan a themed activity, learning block, or special event (e.g., Human Rights Day discussion, Heritage Day celebration, fundraiser, community project). Do not skip holidays—include purposeful blocks that honour the occasion or use the day for enrichment.`,
        ]
      : []),
    `Weekly objectives: ${objectivesText}`,
    `Constraints: ${JSON.stringify(constraints)}`,
    ...strictArrivalPickupLines,
    ...(preflight
      ? [
          'MANDATORY PREFLIGHT ANSWERS (do not ignore):',
          `- Non-negotiable anchors: ${preflight.nonNegotiableAnchors}`,
          `- Fixed weekly events/constraints: ${preflight.fixedWeeklyEvents}`,
          `- After-lunch pattern + transitions: ${preflight.afterLunchPattern}`,
          `- Resource/staff constraints: ${preflight.resourceConstraints}`,
          `- Safety/compliance + fallback rules: ${preflight.safetyCompliance}`,
          'If preflight includes explicit clock times, treat them as hard locks and apply them exactly in block start_time.',
          'Do not shift non-negotiable anchors unless a fixed weekly event explicitly conflicts with that exact time.',
        ]
      : []),
    ...(routineRequirements.length > 0
      ? [`Routine essentials to enforce: ${routineRequirements.join(' ')}`]
      : []),
    'This routine is for in-school use only.',
    'Do not include parent tips, home activities, or parent communication advice.',
    'Ensure activities align to CAPS/ECD outcomes for South African preschool classrooms.',
    'Each weekday must include visible CAPS/ECD strand coverage for Home Language, Mathematics, and Life Skills.',
    'Mention strand signals in block titles/objectives/notes so compliance can be machine-checked.',
    ...(input.schoolName
      ? ['If naming the school anywhere, use the exact provided school name only and do not invent alternatives.']
      : []),
    'Include a daily weather check-in or weather-circle block for every weekday (Monday-Friday) to reinforce repetition routines.',
    `MANDATORY FULL-DAY COVERAGE: The program MUST span from ${arrivalStart} (first block start) to no later than ${pickupCutoff} (last block end). The LAST block of every day MUST end by ${pickupCutoff}. NEVER schedule any block to end after ${pickupCutoff}.`,
    'Required daily structure (approximate — use actual school times):',
    `- Morning: Arrival/greeting block starting at ${arrivalStart} (arrival window until ${arrivalCutoff}) → Morning circle/weather → Focused learning`,
    '- Mid-morning: Snack + hygiene break → Outdoor/gross-motor play',
    '- Late morning: Second learning block (mathematics or home language focus)',
    '- Midday: Lunch break',
    '- After lunch: Story time / creative arts / quiet activity (this section is MANDATORY and must not be omitted)',
    '- Afternoon close (≥13:30): Reflection, pack-up, and dismissal preparation',
    'CRITICAL - CONSISTENCY: Use the SAME time slots and block sequence for Monday through Friday. The ONLY variation across days should be learning block titles and activity focus (e.g., Literacy Monday, Mathematics Tuesday). Do NOT change block types, start/end times, or block order between days. Thursday and Friday must mirror Monday–Wednesday structure.',
    'LESSON ALIGNMENT: Learning blocks must use consistent time windows (e.g., 08:30–09:30, 11:00–12:00) across all weekdays so teachers can schedule lessons into them. Keep learning blocks 30–60 minutes. Use block_type "learning" for lesson-schedulable blocks.',
    'MANDATORY: Include ALL five weekdays (Monday=1, Tuesday=2, Wednesday=3, Thursday=4, Friday=5). No exceptions. Every day must have 6-10 blocks. Never omit a weekday.',
    'TEXT QUALITY - write complete, robust copy:',
    '- For outdoor blocks with a rainy-day fallback, always write the full phrase "replace with indoor [activity type] if rainy" (e.g. "replace with indoor gross-motor if rainy"). Never truncate to "if many" or similar.',
    '- Spell "preflight" with one "f" in all notes and anchor references.',
    '- Use professional, complete sentences in notes and objectives. Avoid conversational asides; if you mention timing (e.g. dismissal), state it as a clear rule (e.g. "Dismissal block ends at 13:30; extend only if school closing time is later.").',
    '- Do not leave partial phrases or placeholders in any block.',
    'Keep output token-safe:',
    '- Monday-Friday only (day_of_week 1..5).',
    '- 6-10 blocks per day.',
    '- Keep objectives/materials concise (max 3 short items each).',
    '- Keep notes brief and classroom-focused.',
    'Return ONLY valid JSON. No markdown fences, no comments, no text before/after. No trailing commas in arrays or objects.',
    'Return STRICT JSON with this exact shape:',
    '{',
    '  "title": "string",',
    '  "summary": "string",',
    '  "days": [',
    '    {',
    '      "day_of_week": 1,',
    '      "blocks": [',
    '        {',
    '          "block_order": 1,',
    '          "block_type": "circle_time|learning|movement|outdoor|meal|nap|assessment|transition|other",',
    '          "title": "string",',
    '          "start_time": "HH:MM",',
    '          "end_time": "HH:MM",',
    '          "objectives": ["string"],',
    '          "materials": ["string"],',
    '          "transition_cue": "string",',
    '          "notes": "string"',
    '        }',
    '      ]',
    '    }',
    '  ]',
    '}',
    `Cover Monday-Friday with practical preschool activities, smooth transitions, and a healthy full school-day rhythm. Strict windows: first block starts at or after ${arrivalStart}; last block ends by ${pickupCutoff}. The days array MUST contain exactly 5 entries (one per weekday).`,
  ].join('\n');
};

const getCompletionInsightSummary = async (preschoolId: string): Promise<CompletionInsightSummary> => {
  const supabase = assertSupabase();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('lesson_completions')
    .select('score, feedback')
    .eq('preschool_id', preschoolId)
    .gte('completed_at', thirtyDaysAgo)
    .order('completed_at', { ascending: false })
    .limit(300);

  if (error) {
    return { totalCompletions: 0, avgScore: null, topDomains: [] };
  }

  const rows = data || [];
  const scores = rows
    .map((row: any) => row.score)
    .filter((value: unknown): value is number => Number.isFinite(value as number));
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const domainMap = new Map<string, { count: number; scores: number[] }>();

  rows.forEach((row: any) => {
    const feedback = row.feedback && typeof row.feedback === 'object' ? row.feedback : {};
    const activityMeta = (feedback as Record<string, unknown>).activity_meta;
    const domain = activityMeta && typeof activityMeta === 'object'
      ? String((activityMeta as Record<string, unknown>).domain || '').trim().toLowerCase()
      : '';
    if (!domain) return;
    const current = domainMap.get(domain) || { count: 0, scores: [] };
    current.count += 1;
    if (Number.isFinite(row.score)) current.scores.push(Number(row.score));
    domainMap.set(domain, current);
  });

  const topDomains = Array.from(domainMap.entries())
    .map(([domain, value]) => ({
      domain,
      count: value.count,
      avgScore: value.scores.length ? Math.round(value.scores.reduce((a, b) => a + b, 0) / value.scores.length) : null,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return { totalCompletions: rows.length, avgScore, topDomains };
};

export class WeeklyProgramCopilotService {
  static async generateWeeklyProgramFromTerm(
    input: GenerateWeeklyProgramFromTermInput,
  ): Promise<WeeklyProgramDraft> {
    const supabase = assertSupabase();
    const completionInsights = await getCompletionInsightSummary(input.preschoolId);
    const completionInsightText =
      completionInsights.topDomains.length > 0
        ? `Recent completion insights (last 30 days): total=${completionInsights.totalCompletions}, avgScore=${completionInsights.avgScore ?? 'n/a'}, topDomains=${completionInsights.topDomains
            .map((domain) => `${domain.domain}:${domain.count} (${domain.avgScore ?? 'n/a'}%)`)
            .join('; ')}. Use this to reinforce weaker domains while maintaining balanced coverage.`
        : 'Recent completion insights unavailable; maintain balanced reinforcement across Home Language, Mathematics, and Life Skills.';
    const prompt = `${buildPrompt(input)}\n${completionInsightText}`;

    const { data, error } = await supabase.functions.invoke('ai-proxy', {
      body: {
        service_type: 'lesson_generation',
        payload: {
          prompt,
        },
        // Prefer Anthropic first for stricter instruction-following on
        // non-negotiable routine anchors. ai-proxy still cross-falls back.
        prefer_openai: false,
        stream: false,
        enable_tools: false,
        metadata: {
          source: 'weekly_program_copilot',
        },
      },
    });

    if (error) {
      const detailedMessage = await extractFunctionErrorMessage(error);
      const friendlyDetailed = normalizeWeeklyProgramErrorMessage(detailedMessage);
      const friendlyFallback = normalizeWeeklyProgramErrorMessage(
        error instanceof Error ? error.message : null,
      );
      const combinedMessage = friendlyDetailed || friendlyFallback || 'Failed to generate weekly program';
      if (__DEV__) {
        console.warn('[WeeklyProgramCopilot] AI generation failed:', { raw: detailedMessage || error });
      }
      throw new Error(combinedMessage);
    }

    const content = extractAIContent(data);
    const modelUsed =
      data && typeof data === 'object' && typeof (data as Record<string, unknown>).model === 'string'
        ? String((data as Record<string, unknown>).model)
        : null;

    const parsed = extractJson(content);
    if (parsed) {
      return normalizeAIResponse(parsed, input, modelUsed);
    }

    const repaired = await repairWeeklyProgramJson(
      supabase as unknown as SupabaseFunctionsClient,
      content,
    );
    if (repaired) {
      if (__DEV__) {
        console.log('[WeeklyProgramCopilot] Successfully repaired non-JSON AI output');
      }
      return normalizeAIResponse(repaired, input, modelUsed);
    }

    if (__DEV__) {
      console.warn('[WeeklyProgramCopilot] Non-JSON AI output after repair attempt', {
        chars: content.length,
        preview: content.slice(0, 500),
      });
    }

    throw new Error(
      'Unable to generate program. The AI returned an unexpected format. Please try again.',
    );
  }

  // Compatibility alias for previous snake_case naming used in docs/plans.
  static async generate_weekly_program_from_term(
    input: GenerateWeeklyProgramFromTermInput,
  ): Promise<WeeklyProgramDraft> {
    return this.generateWeeklyProgramFromTerm(input);
  }
}
