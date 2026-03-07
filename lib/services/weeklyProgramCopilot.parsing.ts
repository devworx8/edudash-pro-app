import type { DailyProgramBlockType } from '@/types/ecd-planning';

export type WeeklyProgramAIResponse = {
  title?: string;
  summary?: string;
  blocks?: unknown[];
  days?: Array<{
    day_of_week?: number | string;
    blocks?: unknown[];
  }>;
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

export const toDateOnly = (value: Date) => value.toISOString().slice(0, 10);

export const startOfWeekMonday = (dateLike: string): string => {
  const date = new Date(`${dateLike}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid week start date');
  }
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return toDateOnly(date);
};

export const addDays = (dateLike: string, days: number): string => {
  const date = new Date(`${dateLike}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateOnly(date);
};

export const clampDayOfWeek = (value: number): 1 | 2 | 3 | 4 | 5 | 6 | 7 => {
  const rounded = Math.min(7, Math.max(1, Math.trunc(value)));
  return rounded as 1 | 2 | 3 | 4 | 5 | 6 | 7;
};

export const toStringArray = (value: unknown): string[] => {
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

export const toBlockType = (value: unknown): DailyProgramBlockType => {
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

export const pickField = (record: Record<string, unknown>, keys: readonly string[]): unknown => {
  for (const key of keys) {
    if (key in record) return record[key];
  }
  return undefined;
};

export const parseDayOfWeek = (value: unknown): number | null => {
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

export const extractJson = (value: string): WeeklyProgramAIResponse | null => parseWeeklyProgramFromText(value);
