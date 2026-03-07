import { createClient } from '@/lib/supabase/client';
import { getSACalendarForYear } from '@/lib/data/saSchoolCalendar';
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

type WeeklyProgramAIDay = NonNullable<WeeklyProgramAIResponse['days']>[number];
type WeeklyProgramAIDayBlocks = NonNullable<WeeklyProgramAIDay['blocks']>;

type AIFunctionInvokeResult = {
  data: unknown;
  error: unknown;
};

type SupabaseFunctionsClient = {
  functions: {
    invoke: (name: string, args: { body: Record<string, unknown> }) => Promise<AIFunctionInvokeResult>;
  };
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
    .trim();

const tryParseJsonCandidate = (value: string): unknown | null => {
  const normalized = sanitizeJsonCandidate(value);
  if (!normalized) return null;

  const attempts = [
    normalized,
    // Common AI formatting mistake: trailing commas in objects/arrays.
    normalized.replace(/,\s*([}\]])/g, '$1'),
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

const parseWeeklyProgramFromText = (value: string, depth = 0): WeeklyProgramAIResponse | null => {
  if (depth > 4) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidates = [fenced?.[1], trimmed].filter(
    (candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0,
  );

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

const createFallbackWeekdayBlock = (day: number): DailyProgramBlock => ({
  day_of_week: clampDayOfWeek(day),
  block_order: 1,
  block_type: 'transition',
  title: `${WEEKDAY_LABELS[day] || 'Weekday'} Routine Starter`,
  start_time: null,
  end_time: null,
  objectives: ['Predictable classroom routine', 'Calm transition into learning'],
  materials: ['Routine chart'],
  transition_cue: 'Welcome learners, review the routine, and begin the first guided activity.',
  notes: 'Auto-filled when AI omits a weekday so the weekly plan remains complete.',
  parent_tip: null,
});

const ensureWeekdayCoverage = (blocks: DailyProgramBlock[]): DailyProgramBlock[] => {
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
    if (dayBlocks.length > 0) {
      grouped.set(day, dayBlocks);
      continue;
    }
    grouped.set(day, [createFallbackWeekdayBlock(day)]);
  }

  const normalized: DailyProgramBlock[] = [];
  for (const day of WEEKDAY_SEQUENCE) {
    const dayBlocks = (grouped.get(day) || []).map((block, index) => ({
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

const hasKeyword = (source: string, keywords: string[]): boolean =>
  keywords.some((keyword) => source.includes(keyword));

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

const normalizeAIResponse = (
  response: WeeklyProgramAIResponse,
  input: GenerateWeeklyProgramFromTermInput,
): WeeklyProgramDraft => {
  const weekStart = startOfWeekMonday(input.weekStartDate);
  const weekEnd = addDays(weekStart, 4);
  const flatBlocks = Array.isArray(response.blocks) ? toBlocksFromFlat(response.blocks) : [];
  const dayBlocks = toBlocksFromDays(response.days);
  const blocks = flatBlocks.length > 0 ? flatBlocks : dayBlocks;

  if (blocks.length === 0) {
    throw new Error('AI response did not include any daily program blocks');
  }

  const weekdayCoveredBlocks = ensureWeekdayCoverage(blocks);
  const normalizedBlocks = ensureDailyWeatherRepetition(weekdayCoveredBlocks);
  const initialCoverage = computeCapsCoverage(normalizedBlocks);
  const correctedBlocks = applyCapsCoverageMetadata(normalizedBlocks, initialCoverage);
  const finalCoverage = computeCapsCoverage(correctedBlocks);
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
      capsCoverage: finalCoverage,
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
  const preflight = input.preflightAnswers;
  const routineRequirements: string[] = [];
  const weekStart = startOfWeekMonday(input.weekStartDate);
  const holidaysInWeek = getHolidaysInWeek(weekStart);

  if (constraints.includeToiletRoutine) {
    routineRequirements.push('Include a toilet or bathroom routine support moment each day.');
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
    ...(preflight
      ? [
          'MANDATORY PREFLIGHT ANSWERS (do not ignore):',
          `- Non-negotiable anchors: ${preflight.nonNegotiableAnchors}`,
          `- Fixed weekly events/constraints: ${preflight.fixedWeeklyEvents}`,
          `- After-lunch pattern + transitions: ${preflight.afterLunchPattern}`,
          `- Resource/staff constraints: ${preflight.resourceConstraints}`,
          `- Safety/compliance + fallback rules: ${preflight.safetyCompliance}`,
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
    'CRITICAL - CONSISTENCY: Use the SAME time slots and block sequence for Monday through Friday. The ONLY variation across days should be learning block titles and activity focus (e.g., Literacy Monday, Mathematics Tuesday). Do NOT change block types, start/end times, or block order between days. Thursday and Friday must mirror Monday–Wednesday structure.',
    'LESSON ALIGNMENT: Learning blocks must use consistent time windows (e.g., 08:30–09:30, 11:00–12:00) across all weekdays so teachers can schedule lessons into them. Keep learning blocks 30–60 minutes. Use block_type "learning" for lesson-schedulable blocks.',
    'Keep output compact and token-safe:',
    '- Monday-Friday only (day_of_week 1..5).',
    '- 4-6 blocks per day.',
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
    'Cover Monday-Friday with practical preschool activities, smooth transitions, and a healthy school-day rhythm.',
  ].join('\n');
};

export class WeeklyProgramCopilotService {
  static async generateWeeklyProgramFromTerm(
    input: GenerateWeeklyProgramFromTermInput,
  ): Promise<WeeklyProgramDraft> {
    const supabase = createClient();
    const prompt = buildPrompt(input);

    const { data, error } = await supabase.functions.invoke('ai-proxy', {
      body: {
        service_type: 'lesson_generation',
        payload: {
          prompt,
        },
        // Prefer OpenAI first for routine generation. ai-proxy still falls back
        // to Anthropic automatically when OpenAI is not configured or fails.
        prefer_openai: true,
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
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[WeeklyProgramCopilot:web] AI generation failed:', { raw: detailedMessage || error });
      }
      throw new Error(combinedMessage);
    }

    const content = extractAIContent(data);

    const parsed = extractJson(content);
    if (parsed) {
      return normalizeAIResponse(parsed, input);
    }

    const repaired = await repairWeeklyProgramJson(
      supabase as unknown as SupabaseFunctionsClient,
      content,
    );
    if (repaired) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[WeeklyProgramCopilot:web] Successfully repaired non-JSON AI output');
      }
      return normalizeAIResponse(repaired, input);
    }

    if (process.env.NODE_ENV !== 'production') {
      console.warn('[WeeklyProgramCopilot:web] Non-JSON AI output after repair attempt', {
        chars: content.length,
        preview: content.slice(0, 500),
      });
    }

    throw new Error('Failed to parse weekly program response (AI returned non-JSON output).');
  }

  static async generate_weekly_program_from_term(
    input: GenerateWeeklyProgramFromTermInput,
  ): Promise<WeeklyProgramDraft> {
    return this.generateWeeklyProgramFromTerm(input);
  }
}
