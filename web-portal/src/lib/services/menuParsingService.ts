import { createClient } from '@/lib/supabase/client';
import type { WeeklyMenuDay, WeeklyMenuDraft, WeeklyMenuParseResult } from '@/lib/services/schoolMenu.types';

interface ParseWeeklyMenuInput {
  weekStartDate: string;
  mimeType: string;
  fileName: string;
  imageDataUrl?: string;
  fileBase64?: string;
}

type ParsedPayload = {
  week_start_date?: string;
  confidence?: number;
  days?: Array<Record<string, unknown>>;
};

const DAY_INDEX: Record<string, number> = {
  monday: 0,
  mon: 0,
  tuesday: 1,
  tue: 1,
  tues: 1,
  wednesday: 2,
  wed: 2,
  thursday: 3,
  thu: 3,
  thur: 3,
  thurs: 3,
  friday: 4,
  fri: 4,
  saturday: 5,
  sat: 5,
  sunday: 6,
  sun: 6,
};

const WEEKDAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;
const DAY_TOKEN_PATTERN = /\b(mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?)\b/i;

type MealSlot = 'breakfast' | 'lunch' | 'snack';

const MEAL_ALIASES: Record<MealSlot, string[]> = {
  breakfast: ['breakfast', 'morning meal', 'brekkie'],
  lunch: ['lunch', 'main meal', 'dinner', 'supper', 'midday meal'],
  snack: ['snack', 'snacks', 'tea', 'tea time', 'morning snack', 'afternoon snack'],
};

function appendUniqueItems(target: string[], incoming: string[]): string[] {
  const seen = new Set(target.map((item) => item.toLowerCase()));
  for (const item of incoming) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    target.push(item);
  }
  return target;
}

function combineNotes(current: string | null | undefined, incoming: string | null | undefined): string | null {
  const currentValue = String(current || '').trim();
  const incomingValue = String(incoming || '').trim();
  if (!incomingValue) return currentValue || null;
  if (!currentValue) return incomingValue;
  if (currentValue.toLowerCase().includes(incomingValue.toLowerCase())) {
    return currentValue;
  }
  if (incomingValue.toLowerCase().includes(currentValue.toLowerCase())) {
    return incomingValue;
  }
  return `${currentValue} ${incomingValue}`.trim();
}

function toCanonicalDayLabel(dayIndex: number): string {
  return WEEKDAY_LABELS[Math.max(0, Math.min(4, dayIndex))];
}

function toCanonicalDayToken(value: string): string | null {
  const cleaned = String(value || '').trim().toLowerCase();
  if (!cleaned) return null;
  const match = cleaned.match(DAY_TOKEN_PATTERN);
  if (!match) return null;
  const token = match[1].toLowerCase();
  if (token.startsWith('mon')) return 'monday';
  if (token.startsWith('tue')) return 'tuesday';
  if (token.startsWith('wed')) return 'wednesday';
  if (token.startsWith('thu')) return 'thursday';
  if (token.startsWith('fri')) return 'friday';
  return null;
}

function inferMealSlot(value: unknown): MealSlot | null {
  const normalized = String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  for (const [slot, aliases] of Object.entries(MEAL_ALIASES) as Array<[MealSlot, string[]]>) {
    if (aliases.some((alias) => normalized.includes(alias))) {
      return slot;
    }
  }
  return null;
}

function isMostlySeparator(line: string): boolean {
  const cleaned = String(line || '').replace(/[|:\-\s]/g, '');
  return cleaned.length === 0;
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toMonday(dateValue: string): string {
  const d = new Date(`${dateValue}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    const day = now.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    now.setUTCDate(now.getUTCDate() + diff);
    return toDateOnly(now);
  }
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return toDateOnly(d);
}

function buildEmptyWeekDraft(weekStartDate: string): WeeklyMenuDraft {
  const monday = new Date(`${toMonday(weekStartDate)}T00:00:00.000Z`);
  const days: WeeklyMenuDay[] = [];
  for (let i = 0; i < 5; i += 1) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    days.push({
      date: toDateOnly(d),
      breakfast: [],
      lunch: [],
      snack: [],
      notes: null,
    });
  }

  return {
    week_start_date: toDateOnly(monday),
    days,
  };
}

function normalizeItemText(value: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[-*•●▪◦]+\s*/, '')
    .replace(/^\d+[.)]\s*/, '')
    .trim();
}

function splitMenuItems(value: string): string[] {
  const normalized = String(value || '')
    .replace(/\r/g, '\n')
    .replace(/[•●▪◦]/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/\s+\d+[.)]\s+/g, '\n')
    .trim();

  if (!normalized) return [];

  const parts = normalized
    .split(/[\n;|]+/g)
    .flatMap((chunk) => chunk.split(/\s*,\s*/g))
    .map((item) => normalizeItemText(item))
    .filter((item) => item.length > 0)
    .filter((item) => !/^(n\/a|na|none|-|not available)$/i.test(item));

  return Array.from(new Set(parts.map((item) => item.trim()))).filter(Boolean);
}

function normalizeList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .flatMap((item) => normalizeList(item))
          .filter((item) => item.length > 0)
      )
    );
  }

  if (typeof value === 'string') {
    return splitMenuItems(value);
  }

  if (value && typeof value === 'object') {
    const raw = value as Record<string, unknown>;
    const nested = raw.items ?? raw.item ?? raw.value ?? raw.text ?? raw.menu ?? raw.food;
    return normalizeList(nested);
  }

  return [];
}

function toConfidence(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function normalizeLineForTextParsing(line: string): string {
  return String(line || '')
    .replace(/\\n/g, '\n')
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseInlineMealSegments(text: string): Partial<Record<MealSlot | 'notes', unknown>> {
  const source = String(text || '').trim();
  if (!source) return {};

  const matches = Array.from(
    source.matchAll(/(breakfast|morning meal|brekkie|lunch|main meal|dinner|supper|snack(?:s)?|tea(?:\s*time)?|morning snack|afternoon snack)\s*[:\-–—]\s*/gi)
  );
  if (matches.length === 0) return {};

  const parsed: Partial<Record<MealSlot | 'notes', unknown>> = {};
  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    const slot = inferMealSlot(match[1]);
    if (!slot) continue;
    const start = (match.index ?? 0) + match[0].length;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? source.length) : source.length;
    const segment = source.slice(start, end).trim();
    if (!segment) continue;
    parsed[slot] = appendUniqueItems(normalizeList(parsed[slot]), normalizeList(segment));
  }

  return parsed;
}

function parseMarkdownTablePayload(text: string, fallbackWeekStartDate: string): ParsedPayload | null {
  const rows = String(text || '')
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.includes('|'));
  if (rows.length < 2) return null;

  const splitCells = (line: string): string[] => {
    const cells = line.split('|').map((cell) => cell.trim());
    if (cells[0] === '') cells.shift();
    if (cells[cells.length - 1] === '') cells.pop();
    return cells;
  };

  const headerIndex = rows.findIndex((line) => /day|weekday/i.test(line) && /breakfast|lunch|snack|tea/i.test(line));
  if (headerIndex < 0) return null;
  const headerCells = splitCells(rows[headerIndex]).map((cell) => cell.toLowerCase());
  if (headerCells.length === 0) return null;

  const headerMap: Partial<Record<'day' | 'date' | MealSlot | 'notes', number>> = {};
  headerCells.forEach((cell, index) => {
    if (headerMap.day === undefined && /day|weekday/.test(cell)) headerMap.day = index;
    if (headerMap.date === undefined && /date/.test(cell)) headerMap.date = index;
    if (headerMap.breakfast === undefined && /breakfast/.test(cell)) headerMap.breakfast = index;
    if (headerMap.lunch === undefined && /lunch|main meal|dinner|supper/.test(cell)) headerMap.lunch = index;
    if (headerMap.snack === undefined && /snack|tea/.test(cell)) headerMap.snack = index;
    if (headerMap.notes === undefined && /note|allergen|comment/.test(cell)) headerMap.notes = index;
  });

  if (headerMap.day === undefined && headerMap.date === undefined) return null;

  const days: Array<Record<string, unknown>> = [];
  for (const row of rows.slice(headerIndex + 1)) {
    if (!row.includes('|') || isMostlySeparator(row)) continue;
    const cells = splitCells(row);
    if (cells.length === 0) continue;

    const dayValue = headerMap.day !== undefined ? cells[headerMap.day] : '';
    const dateValue = headerMap.date !== undefined ? cells[headerMap.date] : '';
    const dayToken = toCanonicalDayToken(dayValue || '');
    const hasDayInfo = Boolean(dayToken || dateValue);
    if (!hasDayInfo) continue;

    const parsedRow: Record<string, unknown> = {
      day: dayToken ? toCanonicalDayLabel(DAY_INDEX[dayToken]) : dayValue,
      date: dateValue,
      breakfast: headerMap.breakfast !== undefined ? cells[headerMap.breakfast] : '',
      lunch: headerMap.lunch !== undefined ? cells[headerMap.lunch] : '',
      snack: headerMap.snack !== undefined ? cells[headerMap.snack] : '',
      notes: headerMap.notes !== undefined ? cells[headerMap.notes] : '',
    };

    const hasMeals = normalizeList(parsedRow.breakfast).length > 0
      || normalizeList(parsedRow.lunch).length > 0
      || normalizeList(parsedRow.snack).length > 0;
    const hasNotes = String(parsedRow.notes || '').trim().length > 0;
    if (hasMeals || hasNotes) {
      days.push(parsedRow);
    }
  }

  if (days.length === 0) return null;

  const mealCoverage = days.reduce((count, day) => {
    const breakfastCount = normalizeList(day.breakfast).length > 0 ? 1 : 0;
    const lunchCount = normalizeList(day.lunch).length > 0 ? 1 : 0;
    const snackCount = normalizeList(day.snack).length > 0 ? 1 : 0;
    return count + breakfastCount + lunchCount + snackCount;
  }, 0);
  const confidence = Math.min(0.9, 0.45 + (days.length / 5) * 0.3 + (mealCoverage / 15) * 0.2);

  return {
    week_start_date: toMonday(fallbackWeekStartDate),
    confidence: Number(confidence.toFixed(2)),
    days,
  };
}

function parseLooseTextPayload(text: string, fallbackWeekStartDate: string): ParsedPayload | null {
  const source = String(text || '').trim();
  if (!source) return null;

  const lines = source
    .split(/\r?\n/g)
    .map((line) => normalizeLineForTextParsing(line))
    .filter((line) => line.length > 0)
    .filter((line) => !line.startsWith('```'))
    .filter((line) => !/^\{.*\}$/.test(line));

  if (lines.length === 0) return null;

  const dayMap: Record<number, WeeklyMenuDay> = {};
  let currentDayIndex: number | null = null;
  let currentSlot: MealSlot | null = null;

  const ensureDay = (index: number): WeeklyMenuDay => {
    if (!dayMap[index]) {
      dayMap[index] = {
        date: '',
        breakfast: [],
        lunch: [],
        snack: [],
        notes: null,
      };
    }
    return dayMap[index];
  };

  for (const line of lines) {
    if (line.length > 240 && line.includes('"documents"')) {
      continue;
    }
    if (isMostlySeparator(line)) {
      continue;
    }

    const dayMatch = line.match(/^(?:\*+\s*)?(mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?)\b[\s:.\-–—]*(.*)$/i);
    if (dayMatch) {
      const dayToken = toCanonicalDayToken(dayMatch[1]);
      if (!dayToken) continue;
      const idx = DAY_INDEX[dayToken];
      if (idx < 0 || idx > 4) continue;
      currentDayIndex = idx;
      currentSlot = null;

      const day = ensureDay(idx);
      const remainder = normalizeLineForTextParsing(dayMatch[2] || '');
      if (remainder) {
        const inline = parseInlineMealSegments(remainder);
        if (inline.breakfast) day.breakfast = appendUniqueItems(day.breakfast, normalizeList(inline.breakfast));
        if (inline.lunch) day.lunch = appendUniqueItems(day.lunch, normalizeList(inline.lunch));
        if (inline.snack) day.snack = appendUniqueItems(day.snack, normalizeList(inline.snack));
        const hasMeals = day.breakfast.length > 0 || day.lunch.length > 0 || day.snack.length > 0;
        if (!hasMeals && remainder.length > 0) {
          day.notes = combineNotes(day.notes, remainder);
        }
      }
      continue;
    }

    if (currentDayIndex === null) continue;
    const day = ensureDay(currentDayIndex);

    const mealMatch = line.match(/^(breakfast|morning meal|brekkie|lunch|main meal|dinner|supper|snack(?:s)?|tea(?:\s*time)?|morning snack|afternoon snack)\s*[:\-–—]\s*(.*)$/i);
    if (mealMatch) {
      const slot = inferMealSlot(mealMatch[1]);
      if (!slot) continue;
      currentSlot = slot;
      day[slot] = appendUniqueItems(day[slot], normalizeList(mealMatch[2]));
      continue;
    }

    const inline = parseInlineMealSegments(line);
    if (inline.breakfast || inline.lunch || inline.snack) {
      if (inline.breakfast) day.breakfast = appendUniqueItems(day.breakfast, normalizeList(inline.breakfast));
      if (inline.lunch) day.lunch = appendUniqueItems(day.lunch, normalizeList(inline.lunch));
      if (inline.snack) day.snack = appendUniqueItems(day.snack, normalizeList(inline.snack));
      continue;
    }

    if (currentSlot && /^[-*•●▪◦]|\d+[.)]/.test(line)) {
      day[currentSlot] = appendUniqueItems(day[currentSlot], normalizeList(line));
      continue;
    }

    day.notes = combineNotes(day.notes, line);
  }

  const days = Object.entries(dayMap)
    .map(([index, day]) => {
      const idx = Number(index);
      return {
        day: toCanonicalDayLabel(idx),
        day_index: idx,
        breakfast: day.breakfast,
        lunch: day.lunch,
        snack: day.snack,
        notes: day.notes,
      };
    })
    .filter((day) => day.breakfast.length > 0 || day.lunch.length > 0 || day.snack.length > 0 || String(day.notes || '').trim().length > 0)
    .sort((a, b) => Number(a.day_index) - Number(b.day_index));

  if (days.length === 0) return null;

  const mealCoverage = days.reduce((count, day) => {
    const breakfastCount = day.breakfast.length > 0 ? 1 : 0;
    const lunchCount = day.lunch.length > 0 ? 1 : 0;
    const snackCount = day.snack.length > 0 ? 1 : 0;
    return count + breakfastCount + lunchCount + snackCount;
  }, 0);
  const confidence = Math.min(0.84, 0.4 + (days.length / 5) * 0.28 + (mealCoverage / 15) * 0.16);

  return {
    week_start_date: toMonday(fallbackWeekStartDate),
    confidence: Number(confidence.toFixed(2)),
    days,
  };
}

function extractStructuredPayloadFromText(text: string, fallbackWeekStartDate: string): ParsedPayload | null {
  const parsedFromTable = parseMarkdownTablePayload(text, fallbackWeekStartDate);
  if (parsedFromTable) {
    return parsedFromTable;
  }
  return parseLooseTextPayload(text, fallbackWeekStartDate);
}

function extractDaysFromDayKeyObject(raw: Record<string, unknown>): Array<Record<string, unknown>> {
  const days: Array<Record<string, unknown>> = [];
  for (const [key, value] of Object.entries(raw)) {
    const dayToken = toCanonicalDayToken(key);
    if (!dayToken) continue;
    const idx = DAY_INDEX[dayToken];
    if (idx < 0 || idx > 4) continue;
    const base = {
      day: toCanonicalDayLabel(idx),
      day_index: idx,
    };

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      days.push({
        ...base,
        ...(value as Record<string, unknown>),
      });
      continue;
    }

    if (typeof value === 'string') {
      days.push({
        ...base,
        ...parseInlineMealSegments(value),
        notes: value,
      });
    }
  }
  return days;
}

function coerceParsedPayload(value: unknown, depth = 0): ParsedPayload | null {
  if (depth > 4 || value === null || value === undefined) return null;

  if (Array.isArray(value)) {
    return {
      days: value.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>>,
    };
  }

  if (typeof value !== 'object') return null;

  const raw = value as Record<string, unknown>;
  if (Array.isArray(raw.days)) {
    return {
      week_start_date: typeof raw.week_start_date === 'string' ? raw.week_start_date : undefined,
      confidence: toConfidence(raw.confidence),
      days: raw.days as Array<Record<string, unknown>>,
    };
  }

  const keyedDays = extractDaysFromDayKeyObject(raw);
  if (keyedDays.length > 0) {
    return {
      week_start_date: typeof raw.week_start_date === 'string' ? raw.week_start_date : undefined,
      confidence: toConfidence(raw.confidence),
      days: keyedDays,
    };
  }

  // Handle common wrappers returned by AI/OCR services.
  const nestedObjects = [
    raw.menu,
    raw.result,
    raw.payload,
    raw.data,
    raw.response,
    raw.ocr,
    raw.week_menu,
    raw.weekly_menu,
    raw.menu_data,
    raw.menu_by_day,
  ];
  for (const candidate of nestedObjects) {
    const nested = coerceParsedPayload(candidate, depth + 1);
    if (nested) return nested;
  }

  // Handle text wrappers where JSON is embedded in `analysis` or `extracted_text`.
  const nestedText = [raw.analysis, raw.extracted_text, raw.text, raw.content];
  for (const candidate of nestedText) {
    if (typeof candidate !== 'string' || candidate.trim().length === 0) continue;
    const nested = extractJson(candidate, depth + 1);
    if (nested) return nested;
  }

  return null;
}

function extractJson(text: string, depth = 0): ParsedPayload | null {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;

  const candidates: string[] = [];
  const pushCandidate = (value: string | undefined) => {
    const normalized = String(value || '').trim();
    if (!normalized || candidates.includes(normalized)) return;
    candidates.push(normalized);
  };

  pushCandidate(trimmed);

  const fenceRegex = /```(?:json)?\s*([\s\S]*?)\s*```/gi;
  let fenceMatch: RegExpExecArray | null = fenceRegex.exec(trimmed);
  while (fenceMatch) {
    pushCandidate(fenceMatch[1]);
    fenceMatch = fenceRegex.exec(trimmed);
  }

  const objectStart = trimmed.indexOf('{');
  const objectEnd = trimmed.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    pushCandidate(trimmed.slice(objectStart, objectEnd + 1));
  }

  const arrayStart = trimmed.indexOf('[');
  const arrayEnd = trimmed.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    pushCandidate(trimmed.slice(arrayStart, arrayEnd + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      const normalized = coerceParsedPayload(parsed, depth + 1);
      if (normalized) return normalized;
    } catch {
      // Try next candidate.
    }
  }

  return null;
}

function resolveDateForDay(raw: Record<string, unknown>, weekStartDate: string): string | null {
  const pickFirstDefined = (keys: string[]): unknown => {
    for (const key of keys) {
      if (raw[key] !== undefined && raw[key] !== null) return raw[key];
    }
    return undefined;
  };

  const explicitDateValue = pickFirstDefined(['date', 'menu_date', 'day_date', 'served_on']);
  const explicitDate = typeof explicitDateValue === 'string' ? explicitDateValue.trim() : '';
  if (explicitDate) {
    const d = new Date(`${explicitDate}T00:00:00.000Z`);
    if (!Number.isNaN(d.getTime())) {
      return toDateOnly(d);
    }
  }

  const dayIndexRaw = pickFirstDefined(['day_index', 'weekday_index', 'index']);
  const dayIndex = typeof dayIndexRaw === 'number' && dayIndexRaw >= 0 && dayIndexRaw <= 6
    ? dayIndexRaw
    : typeof dayIndexRaw === 'string'
      ? parseInt(String(dayIndexRaw), 10)
      : NaN;
  if (Number.isFinite(dayIndex) && dayIndex >= 0 && dayIndex <= 4) {
    const monday = new Date(`${toMonday(weekStartDate)}T00:00:00.000Z`);
    monday.setUTCDate(monday.getUTCDate() + dayIndex);
    return toDateOnly(monday);
  }

  const dayRaw = pickFirstDefined(['day', 'weekday', 'day_name', 'label', 'name']);
  const dayToken = typeof dayRaw === 'string' ? toCanonicalDayToken(dayRaw) : null;
  const idx = dayToken ? DAY_INDEX[dayToken] : undefined;
  if (idx === undefined) {
    return null;
  }

  const monday = new Date(`${toMonday(weekStartDate)}T00:00:00.000Z`);
  monday.setUTCDate(monday.getUTCDate() + idx);
  return toDateOnly(monday);
}

function extractMealsFromRow(item: Record<string, unknown>): {
  breakfast: string[];
  lunch: string[];
  snack: string[];
} {
  const pickFirstDefined = (keys: string[]): unknown => {
    for (const key of keys) {
      if (item[key] !== undefined && item[key] !== null) return item[key];
    }
    return undefined;
  };

  const breakfast = normalizeList(
    pickFirstDefined(['breakfast', 'breakfast_items', 'morning_meal', 'breakfast_menu'])
  );
  const lunch = normalizeList(
    pickFirstDefined(['lunch', 'lunch_items', 'main_meal', 'dinner', 'supper'])
  );
  const snack = normalizeList(
    pickFirstDefined([
      'snack',
      'snack_items',
      'snacks',
      'snack_menu',
      'tea',
      'tea_time',
      'morning_snack',
      'afternoon_snack',
    ])
  );

  const rowMealType = inferMealSlot(
    pickFirstDefined(['meal', 'meal_type', 'meal_name', 'slot', 'type'])
  );
  const rowMealItems = normalizeList(
    pickFirstDefined(['items', 'food_items', 'foods', 'menu', 'value', 'description', 'text', 'content'])
  );

  if (rowMealType && rowMealItems.length > 0) {
    if (rowMealType === 'breakfast') {
      appendUniqueItems(breakfast, rowMealItems);
    } else if (rowMealType === 'lunch') {
      appendUniqueItems(lunch, rowMealItems);
    } else {
      appendUniqueItems(snack, rowMealItems);
    }
  }

  return { breakfast, lunch, snack };
}

function normalizeParsedPayload(parsed: ParsedPayload | null, fallbackWeekStartDate: string): WeeklyMenuParseResult {
  const fallback = buildEmptyWeekDraft(fallbackWeekStartDate);
  const issues: string[] = [];

  if (!parsed || !Array.isArray(parsed.days) || parsed.days.length === 0) {
    issues.push('OCR response could not be parsed into a weekly menu structure.');
    return {
      success: false,
      confidence: 0,
      lowConfidence: true,
      malformed: true,
      issues,
      draft: fallback,
    };
  }

  const weekStartDate = toMonday(parsed.week_start_date || fallback.week_start_date);
  const daysMap: Record<string, WeeklyMenuDay> = {};
  for (const day of fallback.days) {
    daysMap[day.date] = { ...day };
  }

  for (const rawDay of parsed.days) {
    if (!rawDay || typeof rawDay !== 'object') {
      continue;
    }
    const item = rawDay as Record<string, unknown>;
    const date = resolveDateForDay(item, weekStartDate);
    if (!date) {
      issues.push('One OCR row had no readable date/day mapping.');
      continue;
    }

    if (!daysMap[date]) {
      daysMap[date] = {
        date,
        breakfast: [],
        lunch: [],
        snack: [],
        notes: null,
      };
    }

    const existing = daysMap[date];
    const extractedMeals = extractMealsFromRow(item);
    const nextBreakfast = appendUniqueItems([...existing.breakfast], extractedMeals.breakfast);
    const nextLunch = appendUniqueItems([...existing.lunch], extractedMeals.lunch);
    const nextSnack = appendUniqueItems([...existing.snack], extractedMeals.snack);

    const parsedNote = String(item.notes ?? item.note ?? item.comments ?? '').trim();
    const fallbackNoteSource = String(item.summary ?? item.description ?? '').trim();
    const resolvedNote = parsedNote || fallbackNoteSource || null;

    daysMap[date] = {
      date,
      breakfast: nextBreakfast,
      lunch: nextLunch,
      snack: nextSnack,
      notes: combineNotes(existing.notes, resolvedNote),
    };
  }

  const days = Object.values(daysMap)
    .filter((d) => {
      const dayDate = new Date(`${d.date}T00:00:00.000Z`);
      const monday = new Date(`${weekStartDate}T00:00:00.000Z`);
      const max = new Date(`${weekStartDate}T00:00:00.000Z`);
      max.setUTCDate(max.getUTCDate() + 4);
      return dayDate >= monday && dayDate <= max;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const confidenceBase = typeof parsed.confidence === 'number'
    ? Math.max(0, Math.min(1, parsed.confidence))
    : 0.55;

  const populatedDays = days.filter((day) =>
    day.breakfast.length > 0
    || day.lunch.length > 0
    || day.snack.length > 0
    || String(day.notes || '').trim().length > 0
  );
  const populatedMealSlots = populatedDays.reduce((count, day) => {
    const breakfastCount = day.breakfast.length > 0 ? 1 : 0;
    const lunchCount = day.lunch.length > 0 ? 1 : 0;
    const snackCount = day.snack.length > 0 ? 1 : 0;
    return count + breakfastCount + lunchCount + snackCount;
  }, 0);

  if (populatedDays.length === 0) {
    issues.push('OCR completed but no usable menu rows were extracted.');
    return {
      success: false,
      confidence: Math.min(confidenceBase, 0.2),
      lowConfidence: true,
      malformed: true,
      issues,
      draft: fallback,
    };
  }

  const missingDays = 5 - populatedDays.length;
  if (missingDays > 0) {
    issues.push(`OCR returned ${populatedDays.length}/5 weekday rows. Please review and complete missing days.`);
  }

  const coverageConfidenceBoost = (populatedDays.length / 5) * 0.18 + (populatedMealSlots / 15) * 0.12;
  const confidence = Math.max(0, Math.min(1, confidenceBase * 0.8 + coverageConfidenceBoost));
  const lowConfidence = confidence < 0.6 || issues.length > 0;

  return {
    success: true,
    confidence,
    lowConfidence,
    malformed: false,
    issues,
    draft: {
      week_start_date: weekStartDate,
      days,
    },
  };
}

export class MenuParsingService {
  static buildEmptyWeekDraft(weekStartDate: string): WeeklyMenuDraft {
    return buildEmptyWeekDraft(weekStartDate);
  }

  static async parseWeeklyMenuFromUpload(input: ParseWeeklyMenuInput): Promise<WeeklyMenuParseResult> {
    const fallback = buildEmptyWeekDraft(input.weekStartDate);
    const normalizedMime = String(input.mimeType || '').toLowerCase();
    const supportedUpload = normalizedMime.startsWith('image/') || normalizedMime === 'application/pdf';
    if (!supportedUpload) {
      return {
        success: false,
        confidence: 0,
        lowConfidence: true,
        malformed: true,
        issues: [
          'Automatic parsing supports image (JPG/PNG/WebP) or PDF uploads. Please complete the menu manually for this file type.',
        ],
        draft: fallback,
      };
    }

    const base64 = input.fileBase64 || (input.imageDataUrl?.split(',')[1] || '');
    if (!base64) {
      return {
        success: false,
        confidence: 0,
        lowConfidence: true,
        malformed: true,
        issues: ['Could not read image bytes for OCR parsing.'],
        draft: fallback,
      };
    }

    const prompt = [
      'CONTEXT: You are extracting a school or preschool weekly meal menu from an image or PDF. The document shows meals for Monday through Friday (weekdays only).',
      '',
      'OUTPUT: Return ONLY valid JSON. No markdown, no code fences, no explanation before or after. Use this exact schema:',
      '{"week_start_date":"YYYY-MM-DD","confidence":0.0-1.0,"days":[{"date":"YYYY-MM-DD","day":"Monday","breakfast":["item1","item2"],"lunch":["item1"],"snack":["item1"],"notes":null}]}',
      '',
      'RULES:',
      '- week_start_date: the Monday of the week (YYYY-MM-DD). Infer from the document or use the week containing the first day shown.',
      '- days: array of exactly 5 objects, one per weekday Monday–Friday. Use keys: date (YYYY-MM-DD), day ("Monday"|"Tuesday"|"Wednesday"|"Thursday"|"Friday"), breakfast, lunch, snack (each an array of strings), notes (string or null).',
      '- Alternate keys accepted: breakfast_items, lunch_items, snack_items instead of breakfast, lunch, snack.',
      '- Each meal array: one food item per element. Split comma- or newline-separated items into separate array elements. Preserve exact wording (e.g. "Oats porridge", "Chicken stew").',
      '- If a day or meal is missing or unreadable, use an empty array [] and put a brief reason in notes.',
      '- confidence: number 0–1 indicating how confident the extraction is overall.',
      '- If the file is a PDF, treat each page or table as the same weekly menu and extract the same JSON structure.',
    ].join('\n');

    try {
      const supabase = createClient();
      const { data, error } = await supabase.functions.invoke('ai-proxy', {
        body: {
          scope: 'principal',
          service_type: 'image_analysis',
          payload: {
            prompt,
            images: [{ data: base64, media_type: input.mimeType || 'image/jpeg' }],
            ocr_mode: true,
            ocr_task: 'document',
            ocr_response_format: 'json',
          },
          stream: false,
          enable_tools: false,
          metadata: {
            source: 'weekly_menu_parser',
            file_name: input.fileName,
          },
        },
      });

      if (error) {
        return {
          success: false,
          confidence: 0,
          lowConfidence: true,
          malformed: true,
          issues: [error.message || 'OCR parsing failed. Please complete menu manually.'],
          draft: fallback,
        };
      }

      const payload = data as {
        content?: string;
        analysis?: string;
        extracted_text?: string;
        ocr?: { analysis?: string; extracted_text?: string };
      } | null;

      const textCandidates = [
        typeof payload?.content === 'string' ? payload.content : null,
        typeof payload?.ocr?.analysis === 'string' ? payload.ocr.analysis : null,
        typeof payload?.ocr?.extracted_text === 'string' ? payload.ocr.extracted_text : null,
        typeof payload?.analysis === 'string' ? payload.analysis : null,
        typeof payload?.extracted_text === 'string' ? payload.extracted_text : null,
        payload?.ocr ? JSON.stringify(payload.ocr) : null,
        JSON.stringify(data || {}),
      ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

      let parsed: ParsedPayload | null = null;
      let rawResponse = textCandidates[0] || '';
      for (const candidate of textCandidates) {
        const fromJson = extractJson(candidate);
        if (fromJson) {
          parsed = fromJson;
          rawResponse = candidate;
          break;
        }

        const fromText = extractStructuredPayloadFromText(candidate, input.weekStartDate);
        if (fromText) {
          parsed = fromText;
          rawResponse = candidate;
          break;
        }
      }

      const normalized = normalizeParsedPayload(parsed, input.weekStartDate);
      return {
        ...normalized,
        rawResponse,
      };
    } catch (error: unknown) {
      return {
        success: false,
        confidence: 0,
        lowConfidence: true,
        malformed: true,
        issues: [error instanceof Error ? error.message : 'OCR parsing failed unexpectedly.'],
        draft: fallback,
      };
    }
  }
}
