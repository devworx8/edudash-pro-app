import type { DailyProgramBlock, DailyProgramBlockType } from '@/types/ecd-planning';

export type RoutineBlockIntent =
  | 'arrival'
  | 'morning_prayer'
  | 'circle'
  | 'breakfast'
  | 'lunch'
  | 'meal'
  | 'toilet'
  | 'nap'
  | 'story'
  | 'dismissal'
  | 'learning'
  | 'movement'
  | 'outdoor'
  | 'transition'
  | 'assessment'
  | 'other';

export interface RoutineNormalizationMetrics {
  overlapsResolved: number;
  dedupedBlocks: number;
  anchorLocksApplied: number;
}

export interface RoutineNormalizationResult {
  blocks: DailyProgramBlock[];
  warnings: string[];
  metrics: RoutineNormalizationMetrics;
}

export interface RoutineNormalizationOptions {
  ageGroup?: string | null;
  arrivalStartTime?: string | null;
  pickupCutoffTime?: string | null;
}

const WEEKDAY_SEQUENCE = [1, 2, 3, 4, 5] as const;
const MIN_BLOCKS_PER_DAY = 6;
const MAX_BLOCKS_PER_DAY = 10;
const MIN_DAY_END_MINUTES = 13 * 60 + 30;

const ANCHOR_LOCK_NOTE_REGEX = /anchor locked from preflight|auto-added from preflight non-negotiable anchor/i;
const ANCHOR_LOCK_TIME_REGEX = /anchor locked from preflight:[\s\S]*?\bat\s*(\d{1,2}:\d{2})/i;
const AUTO_ADDED_NOTE_REGEX = /auto-(added|filled|enforced|staggered)|auto added|auto filled|auto enforced/i;

const TOILET_KEYWORDS = ['toilet', 'bathroom', 'potty', 'washroom', 'restroom', 'hygiene', 'hand wash', 'handwash'];
const LUNCH_KEYWORDS = ['lunch', 'lunchtime', 'mid-day meal', 'midday meal'];
const BREAKFAST_KEYWORDS = ['breakfast', 'morning snack'];
const NAP_KEYWORDS = ['nap', 'quiet time', 'rest time', 'rest block'];
const ARRIVAL_KEYWORDS = ['arrival', 'greeting', 'welcome'];
const PRAYER_KEYWORDS = ['morning prayer', 'prayer'];
const CIRCLE_KEYWORDS = ['circle time', 'morning circle'];
const STORY_KEYWORDS = ['story', 'read aloud', 'creative activity'];
const DISMISSAL_KEYWORDS = ['dismissal', 'pack-up', 'pack up', 'afternoon close', 'reflection'];

function normalizeTime(value: string | null | undefined): string | null {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function toMinutes(value: string | null | undefined): number | null {
  const normalized = normalizeTime(value);
  if (!normalized) return null;
  const [hours, minutes] = normalized.split(':').map(Number);
  return (hours * 60) + minutes;
}

function toHHMM(totalMinutes: number): string {
  const safe = Math.max(0, Math.min((23 * 60) + 59, Math.round(totalMinutes)));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function parseAgeRange(ageGroup: string | null | undefined): { min: number | null; max: number | null } {
  const raw = String(ageGroup || '').trim();
  if (!raw) return { min: null, max: null };
  const rangeMatch = raw.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (rangeMatch) {
    return {
      min: Number(rangeMatch[1]),
      max: Number(rangeMatch[2]),
    };
  }
  const single = raw.match(/(\d+)/);
  if (!single) return { min: null, max: null };
  const value = Number(single[1]);
  return { min: value, max: value };
}

export function isAgeGroupFourToSix(ageGroup: string | null | undefined): boolean {
  const { min, max } = parseAgeRange(ageGroup);
  if (min == null || max == null) return false;
  return min >= 4 && max <= 6;
}

function blockText(block: DailyProgramBlock): string {
  return [
    block.block_type,
    block.title,
    block.notes,
    block.transition_cue,
    ...(block.objectives || []),
    ...(block.materials || []),
  ]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');
}

function blockHeaderText(block: DailyProgramBlock): string {
  return [block.block_type, block.title]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');
}

function hasTokenKeyword(source: string, keywords: string[]): boolean {
  const normalized = ` ${String(source || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  return keywords.some((keyword) => {
    const token = ` ${String(keyword || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
    return normalized.includes(token);
  });
}

function hasKeyword(source: string, keywords: string[]): boolean {
  return keywords.some((keyword) => source.includes(keyword));
}

function extractAnchorLockedStartMinutes(source: string): number | null {
  const match = source.match(ANCHOR_LOCK_TIME_REGEX);
  if (!match?.[1]) return null;
  return toMinutes(match[1]);
}

export function classifyRoutineBlockIntent(block: DailyProgramBlock): RoutineBlockIntent {
  const headerSource = blockHeaderText(block);
  const source = blockText(block);
  const type = String(block.block_type || '').toLowerCase();

  if (type === 'nap') return 'nap';
  if (type === 'meal') {
    if (hasTokenKeyword(headerSource, BREAKFAST_KEYWORDS)) return 'breakfast';
    if (hasTokenKeyword(headerSource, LUNCH_KEYWORDS)) return 'lunch';
    if (hasTokenKeyword(source, BREAKFAST_KEYWORDS)) return 'breakfast';
    if (hasTokenKeyword(source, LUNCH_KEYWORDS)) return 'lunch';
    return 'meal';
  }
  if (type === 'transition') {
    if (hasTokenKeyword(headerSource, TOILET_KEYWORDS)) return 'toilet';
    if (hasTokenKeyword(headerSource, DISMISSAL_KEYWORDS)) return 'dismissal';
    if (hasTokenKeyword(source, TOILET_KEYWORDS)) return 'toilet';
    if (hasTokenKeyword(source, DISMISSAL_KEYWORDS)) return 'dismissal';
    return 'transition';
  }
  if (type === 'circle_time') {
    if (hasTokenKeyword(headerSource, PRAYER_KEYWORDS)) return 'morning_prayer';
    if (hasTokenKeyword(headerSource, CIRCLE_KEYWORDS)) return 'circle';
    if (hasTokenKeyword(headerSource, STORY_KEYWORDS)) return 'story';
    return 'circle';
  }
  if (type === 'learning') return 'learning';
  if (type === 'movement') return 'movement';
  if (type === 'outdoor') return 'outdoor';
  if (type === 'assessment') return 'assessment';

  if (hasTokenKeyword(headerSource, TOILET_KEYWORDS)) return 'toilet';
  if (hasTokenKeyword(headerSource, BREAKFAST_KEYWORDS)) return 'breakfast';
  if (hasTokenKeyword(headerSource, LUNCH_KEYWORDS)) return 'lunch';
  if (hasTokenKeyword(headerSource, NAP_KEYWORDS)) return 'nap';
  if (hasTokenKeyword(headerSource, ARRIVAL_KEYWORDS)) return 'arrival';
  if (hasTokenKeyword(headerSource, PRAYER_KEYWORDS)) return 'morning_prayer';
  if (hasTokenKeyword(headerSource, CIRCLE_KEYWORDS)) return 'circle';
  if (hasTokenKeyword(headerSource, STORY_KEYWORDS)) return 'story';
  if (hasTokenKeyword(headerSource, DISMISSAL_KEYWORDS)) return 'dismissal';

  if (hasTokenKeyword(source, TOILET_KEYWORDS)) return 'toilet';
  if (hasTokenKeyword(source, BREAKFAST_KEYWORDS)) return 'breakfast';
  if (hasTokenKeyword(source, LUNCH_KEYWORDS)) return 'lunch';
  if (hasTokenKeyword(source, NAP_KEYWORDS)) return 'nap';
  if (hasTokenKeyword(source, ARRIVAL_KEYWORDS)) return 'arrival';
  if (hasTokenKeyword(source, PRAYER_KEYWORDS)) return 'morning_prayer';
  if (hasTokenKeyword(source, CIRCLE_KEYWORDS)) return 'circle';
  if (hasTokenKeyword(source, STORY_KEYWORDS)) return 'story';
  if (hasTokenKeyword(source, DISMISSAL_KEYWORDS)) return 'dismissal';

  if (type === 'meal') return 'meal';
  return 'other';
}

type TimedRange = { start: number; end: number };

type InternalBlock = DailyProgramBlock & {
  __intent: RoutineBlockIntent;
  __locked: boolean;
  __auto: boolean;
  __sourceIndex: number;
};

function blockTypeForIntent(intent: RoutineBlockIntent, fallback: DailyProgramBlockType): DailyProgramBlockType {
  switch (intent) {
    case 'lunch':
    case 'breakfast':
    case 'meal':
      return 'meal';
    case 'nap':
      return 'nap';
    case 'toilet':
    case 'dismissal':
      return 'transition';
    case 'story':
    case 'circle':
    case 'morning_prayer':
      return 'circle_time';
    default:
      return fallback;
  }
}

function canonicalTitleForIntent(intent: RoutineBlockIntent, block: DailyProgramBlock): string {
  const current = String(block.title || '').trim();
  switch (intent) {
    case 'lunch':
      return 'Lunch';
    case 'breakfast':
      return current || 'Breakfast';
    case 'nap':
      return 'Nap / Quiet Time';
    case 'toilet':
      return current.toLowerCase().includes('toilet') ? current : 'Toilet Routine & Hygiene';
    default:
      return current || 'Routine Block';
  }
}

function defaultDuration(intent: RoutineBlockIntent): number {
  switch (intent) {
    case 'morning_prayer':
      return 10;
    case 'circle':
    case 'story':
      return 20;
    case 'toilet':
      return 15;
    case 'lunch':
    case 'breakfast':
    case 'meal':
      return 30;
    case 'nap':
      return 45;
    case 'dismissal':
    case 'transition':
      return 20;
    case 'learning':
      return 45;
    case 'movement':
    case 'outdoor':
      return 35;
    default:
      return 30;
  }
}

function countOverlaps(blocks: DailyProgramBlock[]): number {
  const timed = blocks
    .map((block) => ({
      start: toMinutes(block.start_time),
      end: toMinutes(block.end_time),
    }))
    .filter((value): value is { start: number; end: number } => value.start != null && value.end != null && value.end > value.start)
    .sort((a, b) => a.start - b.start);

  let overlaps = 0;
  let prevEnd = -1;
  for (const value of timed) {
    if (value.start < prevEnd) overlaps += 1;
    prevEnd = Math.max(prevEnd, value.end);
  }
  return overlaps;
}

function mergeRanges(ranges: TimedRange[]): TimedRange[] {
  const sorted = ranges
    .slice()
    .sort((a, b) => a.start - b.start)
    .filter((range) => range.end > range.start);
  const merged: TimedRange[] = [];
  for (const range of sorted) {
    if (merged.length === 0) {
      merged.push({ ...range });
      continue;
    }
    const last = merged[merged.length - 1];
    if (range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

function rangesOverlap(a: TimedRange, b: TimedRange): boolean {
  return a.start < b.end && a.end > b.start;
}

function findNextOpenSlot(
  desiredStart: number,
  duration: number,
  occupied: TimedRange[],
  windowStart: number,
  windowEnd: number,
): TimedRange | null {
  const merged = mergeRanges(occupied);
  let cursor = Math.max(windowStart, desiredStart);
  const safeDuration = Math.max(10, duration);

  for (const range of merged) {
    if (cursor < range.start) {
      const gap = range.start - cursor;
      if (gap >= safeDuration) {
        return { start: cursor, end: cursor + safeDuration };
      }
      if (gap >= 10) {
        return { start: cursor, end: cursor + gap };
      }
    }
    cursor = Math.max(cursor, range.end);
    if (cursor >= windowEnd) return null;
  }

  if ((windowEnd - cursor) >= 10) {
    const end = Math.min(windowEnd, cursor + safeDuration);
    return { start: cursor, end };
  }

  return null;
}

function normalizeInternalBlock(block: DailyProgramBlock, day: number, sourceIndex: number): InternalBlock {
  const intent = classifyRoutineBlockIntent(block);
  const rawStart = normalizeTime(block.start_time);
  const rawEnd = normalizeTime(block.end_time);
  const anchorSource = [
    block.notes,
    block.transition_cue,
    block.title,
    ...(block.objectives || []),
    ...(block.materials || []),
  ]
    .map((value) => String(value || ''))
    .join('\n');
  const anchorLocked = ANCHOR_LOCK_NOTE_REGEX.test(anchorSource);
  const anchorStart = anchorLocked ? extractAnchorLockedStartMinutes(anchorSource) : null;
  const startMinutes = anchorStart ?? toMinutes(rawStart);
  const sourceDuration =
    rawStart && rawEnd
      ? Math.max(10, Math.max(0, (toMinutes(rawEnd) ?? 0) - (toMinutes(rawStart) ?? 0)))
      : null;
  const rawDuration = anchorLocked
    ? defaultDuration(intent)
    : (sourceDuration ?? defaultDuration(intent));
  const endMinutes = startMinutes == null
    ? toMinutes(rawEnd)
    : (startMinutes + Math.max(10, rawDuration));
  const normalizedStart = startMinutes == null ? rawStart : toHHMM(startMinutes);
  const normalizedEnd = endMinutes == null ? rawEnd : toHHMM(endMinutes);

  const normalized: InternalBlock = {
    ...block,
    day_of_week: day as 1 | 2 | 3 | 4 | 5 | 6 | 7,
    block_order: Math.max(1, Number(block.block_order) || sourceIndex + 1),
    block_type: blockTypeForIntent(intent, (block.block_type || 'learning') as DailyProgramBlockType),
    title: canonicalTitleForIntent(intent, block),
    start_time: normalizedStart,
    end_time: normalizedEnd,
    objectives: Array.isArray(block.objectives) ? block.objectives : [],
    materials: Array.isArray(block.materials) ? block.materials : [],
    transition_cue: block.transition_cue || null,
    notes: block.notes || null,
    parent_tip: block.parent_tip || null,
    __intent: intent,
    __locked: anchorLocked,
    __auto: AUTO_ADDED_NOTE_REGEX.test(String(block.notes || '')),
    __sourceIndex: sourceIndex,
  };
  return normalized;
}

function pickPreferredIndex(items: InternalBlock[], intent: RoutineBlockIntent): number {
  const noon = 12 * 60;
  let bestIdx = 0;
  let bestScore = -Infinity;

  items.forEach((item, index) => {
    const start = toMinutes(item.start_time);
    const proximity = start == null ? 0 : Math.max(0, 120 - Math.abs(start - noon));
    const score =
      (item.__locked ? 1000 : 0)
      + (intent === 'lunch' && start != null && start >= (11 * 60) && start <= (13 * 60 + 30) ? 200 : 0)
      + proximity
      - (item.__auto ? 20 : 0)
      - index;

    if (score > bestScore) {
      bestScore = score;
      bestIdx = index;
    }
  });

  return bestIdx;
}

function blockPriority(block: InternalBlock): number {
  let score = 0;
  if (block.__locked) score += 300;
  if (block.__intent === 'lunch') score += 240;
  if (block.__intent === 'nap') score += 220;
  if (block.__intent === 'breakfast') score += 180;
  if (block.__intent === 'arrival' || block.__intent === 'morning_prayer' || block.__intent === 'circle') score += 150;
  if (block.__intent === 'dismissal') score += 140;
  if (block.__intent === 'learning') score += 120;
  if (block.__intent === 'toilet') score += 110;
  if (block.__intent === 'movement' || block.__intent === 'outdoor' || block.__intent === 'story') score += 100;
  if (block.__auto) score -= 30;
  return score;
}

function stripInternal(block: InternalBlock): DailyProgramBlock {
  const { __intent, __locked, __auto, __sourceIndex, ...rest } = block;
  return rest;
}

function stabilizeDayBlocks(
  day: number,
  blocks: DailyProgramBlock[],
  options: RoutineNormalizationOptions,
  metrics: RoutineNormalizationMetrics,
  warnings: string[],
): DailyProgramBlock[] {
  let normalized = blocks
    .slice()
    .sort((a, b) => Number(a.block_order || 0) - Number(b.block_order || 0))
    .map((block, index) => normalizeInternalBlock(block, day, index));

  const preOverlapCount = countOverlaps(normalized);

  // Semantic de-duplication of exact repeats
  const seen = new Map<string, number>();
  const deduped: InternalBlock[] = [];
  normalized.forEach((block) => {
    const key = [
      block.__intent,
      String(block.title || '').trim().toLowerCase(),
      block.start_time || '',
      block.end_time || '',
    ].join('|');

    const existingIndex = seen.get(key);
    if (existingIndex == null) {
      seen.set(key, deduped.length);
      deduped.push(block);
      return;
    }

    const existing = deduped[existingIndex];
    if (!existing.__locked && block.__locked) {
      deduped[existingIndex] = block;
      metrics.dedupedBlocks += 1;
      return;
    }

    metrics.dedupedBlocks += 1;
  });
  normalized = deduped;

  // Lunch policy: exactly one lunch per day
  let lunchBlocks = normalized.filter((block) => block.__intent === 'lunch');
  if (lunchBlocks.length === 0) {
    const mealCandidates = normalized.filter((block) => block.__intent === 'meal' || block.__intent === 'breakfast');
    if (mealCandidates.length > 0) {
      const bestIdx = pickPreferredIndex(mealCandidates, 'lunch');
      const target = mealCandidates[bestIdx];
      const globalIdx = normalized.findIndex((block) => block.__sourceIndex === target.__sourceIndex && block.title === target.title);
      if (globalIdx >= 0) {
        normalized[globalIdx] = {
          ...normalized[globalIdx],
          __intent: 'lunch',
          block_type: 'meal',
          title: 'Lunch',
        };
      }
    } else {
      normalized.push(normalizeInternalBlock({
        day_of_week: day as 1 | 2 | 3 | 4 | 5 | 6 | 7,
        block_order: normalized.length + 1,
        block_type: 'meal',
        title: 'Lunch',
        start_time: '12:00',
        end_time: '12:30',
        objectives: ['Nutritional routine'],
        materials: ['Lunch supplies'],
        transition_cue: 'Lunch then prepare for afternoon activities.',
        notes: 'Auto-added lunch to satisfy daily policy.',
        parent_tip: null,
      }, day, normalized.length));
      warnings.push(`Day ${day}: inserted lunch block because none was present.`);
    }
    lunchBlocks = normalized.filter((block) => block.__intent === 'lunch');
  }

  if (lunchBlocks.length > 1) {
    const keep = pickPreferredIndex(lunchBlocks, 'lunch');
    const keepId = lunchBlocks[keep].__sourceIndex;
    normalized = normalized.filter((block) => {
      if (block.__intent !== 'lunch') return true;
      if (block.__sourceIndex === keepId) return true;
      metrics.dedupedBlocks += 1;
      return false;
    });
    warnings.push(`Day ${day}: merged duplicate lunch blocks into a single lunch.`);
  }

  // 4-6 policy: at most one nap/quiet-time block
  if (isAgeGroupFourToSix(options.ageGroup)) {
    const napBlocks = normalized.filter((block) => block.__intent === 'nap');
    if (napBlocks.length > 1) {
      const keep = pickPreferredIndex(napBlocks, 'nap');
      const keepId = napBlocks[keep].__sourceIndex;
      normalized = normalized.filter((block) => {
        if (block.__intent !== 'nap') return true;
        if (block.__sourceIndex === keepId) return true;
        metrics.dedupedBlocks += 1;
        return false;
      });
      warnings.push(`Day ${day}: removed duplicate nap/quiet-time blocks for age group 4-6 policy.`);
    }
  }

  // Cap to max blocks/day with policy-aware pruning
  while (normalized.length > MAX_BLOCKS_PER_DAY) {
    const ranked = normalized
      .map((block, index) => ({ block, index, score: blockPriority(block) }))
      .sort((a, b) => a.score - b.score || a.index - b.index);
    const remove = ranked[0];
    if (!remove) break;
    normalized.splice(remove.index, 1);
    metrics.dedupedBlocks += 1;
  }

  // Keep minimum structure
  while (normalized.length < MIN_BLOCKS_PER_DAY) {
    normalized.push(normalizeInternalBlock({
      day_of_week: day as 1 | 2 | 3 | 4 | 5 | 6 | 7,
      block_order: normalized.length + 1,
      block_type: 'learning',
      title: `Learning Support Block ${normalized.length + 1}`,
      start_time: null,
      end_time: null,
      objectives: ['Maintain consistent classroom flow'],
      materials: ['Classroom routine resources'],
      transition_cue: 'Transition calmly into the next block.',
      notes: 'Auto-added to preserve minimum daily block coverage.',
      parent_tip: null,
    }, day, normalized.length));
  }

  const windowStart = toMinutes(options.arrivalStartTime) ?? (6 * 60);
  const windowEnd = Math.max(toMinutes(options.pickupCutoffTime) ?? (14 * 60), MIN_DAY_END_MINUTES);

  const ordered = normalized
    .slice()
    .sort((a, b) => {
      const aStart = toMinutes(a.start_time);
      const bStart = toMinutes(b.start_time);
      if (aStart != null && bStart != null && aStart !== bStart) return aStart - bStart;
      if (aStart != null && bStart == null) return -1;
      if (aStart == null && bStart != null) return 1;
      return a.block_order - b.block_order;
    });

  const fixedPlacements = new Map<number, TimedRange>();
  const occupied: TimedRange[] = [];

  for (const block of ordered) {
    const start = toMinutes(block.start_time);
    const end = toMinutes(block.end_time);
    if (!block.__locked || start == null || end == null || end <= start) continue;

    const clipped: TimedRange = {
      start: Math.max(windowStart, start),
      end: Math.min(windowEnd, end),
    };
    if (clipped.end <= clipped.start) continue;

    const conflictingRange = occupied.find((range) => rangesOverlap(range, clipped));
    const conflicts = Boolean(conflictingRange);
    if (conflicts) {
      warnings.push(
        `Day ${day}: kept hard anchor "${String(block.title || 'Anchor')}" unresolved due overlap with another locked anchor.`,
      );
      continue;
    }

    fixedPlacements.set(block.__sourceIndex, clipped);
    occupied.push(clipped);
    metrics.anchorLocksApplied += 1;
  }

  let cursor = windowStart;
  const placed = ordered.map((block) => {
    const fixed = fixedPlacements.get(block.__sourceIndex);
    if (fixed) {
      cursor = Math.max(cursor, fixed.end);
      return {
        ...block,
        start_time: toHHMM(fixed.start),
        end_time: toHHMM(fixed.end),
      };
    }

    const existingStart = toMinutes(block.start_time);
    const existingEnd = toMinutes(block.end_time);
    const computedDuration =
      existingStart != null && existingEnd != null && existingEnd > existingStart
        ? existingEnd - existingStart
        : defaultDuration(block.__intent);
    const duration = Math.max(10, Math.min(120, computedDuration));

    // Compact non-locked blocks so we do not keep large silent timeline gaps.
    const desiredStart = Math.max(windowStart, cursor);
    const slot =
      findNextOpenSlot(desiredStart, duration, occupied, windowStart, windowEnd)
      || findNextOpenSlot(cursor, duration, occupied, windowStart, windowEnd)
      || findNextOpenSlot(windowStart, duration, occupied, windowStart, windowEnd)
      || { start: Math.max(windowStart, windowEnd - duration), end: windowEnd };

    const clippedSlot = {
      start: Math.max(windowStart, Math.min(windowEnd - 10, slot.start)),
      end: Math.max(Math.max(windowStart, Math.min(windowEnd, slot.end)), Math.max(windowStart, Math.min(windowEnd, slot.start + 10))),
    };

    occupied.push(clippedSlot);
    cursor = Math.max(cursor, clippedSlot.end);

    return {
      ...block,
      start_time: toHHMM(clippedSlot.start),
      end_time: toHHMM(clippedSlot.end),
    };
  });

  const sortedPlaced = placed
    .slice()
    .sort((a, b) => {
      const aStart = toMinutes(a.start_time) ?? Number.MAX_SAFE_INTEGER;
      const bStart = toMinutes(b.start_time) ?? Number.MAX_SAFE_INTEGER;
      if (aStart !== bStart) return aStart - bStart;
      return a.__sourceIndex - b.__sourceIndex;
    });

  let gapsFilled = 0;
  const withGapTransitions: InternalBlock[] = [];
  for (let i = 0; i < sortedPlaced.length; i += 1) {
    const current = sortedPlaced[i];
    withGapTransitions.push(current);
    if (i >= sortedPlaced.length - 1) continue;
    const next = sortedPlaced[i + 1];
    const currentEnd = toMinutes(current.end_time);
    const nextStart = toMinutes(next.start_time);
    if (currentEnd == null || nextStart == null) continue;
    if (nextStart <= currentEnd) continue;
    const gap = nextStart - currentEnd;
    if (gap < 10) continue;

    if (withGapTransitions.length >= MAX_BLOCKS_PER_DAY) {
      if (!current.__locked) {
        current.end_time = toHHMM(nextStart);
        gapsFilled += 1;
      }
      continue;
    }

    withGapTransitions.push(normalizeInternalBlock({
      day_of_week: day as 1 | 2 | 3 | 4 | 5 | 6 | 7,
      block_order: withGapTransitions.length + 1,
      block_type: 'transition',
      title: 'Transition & Settling',
      start_time: toHHMM(currentEnd),
      end_time: toHHMM(nextStart),
      objectives: ['Smooth transition between activities'],
      materials: [],
      transition_cue: 'Use calm transition cues before the next block.',
      notes: 'Auto-added to remove internal timeline gap.',
      parent_tip: null,
    }, day, withGapTransitions.length + 1000 + i));
    gapsFilled += 1;
  }

  if (gapsFilled > 0) {
    warnings.push(`Day ${day}: filled ${gapsFilled} internal timeline gap(s) with transition coverage.`);
  }

  let normalizedPlaced = withGapTransitions
    .slice()
    .sort((a, b) => {
      const aStart = toMinutes(a.start_time) ?? Number.MAX_SAFE_INTEGER;
      const bStart = toMinutes(b.start_time) ?? Number.MAX_SAFE_INTEGER;
      if (aStart !== bStart) return aStart - bStart;
      return a.__sourceIndex - b.__sourceIndex;
    });

  const latestEnd = normalizedPlaced.reduce((max, block) => {
    const end = toMinutes(block.end_time);
    return end == null ? max : Math.max(max, end);
  }, -1);
  if (latestEnd >= 0 && latestEnd < MIN_DAY_END_MINUTES) {
    const targetEnd = Math.min(windowEnd, MIN_DAY_END_MINUTES);
    if (normalizedPlaced.length < MAX_BLOCKS_PER_DAY) {
      normalizedPlaced.push(normalizeInternalBlock({
        day_of_week: day as 1 | 2 | 3 | 4 | 5 | 6 | 7,
        block_order: normalizedPlaced.length + 1,
        block_type: 'transition',
        title: 'Afternoon Transition & Dismissal Prep',
        start_time: toHHMM(latestEnd),
        end_time: toHHMM(targetEnd),
        objectives: ['Maintain full-day routine continuity'],
        materials: [],
        transition_cue: 'Guide learners calmly into day-end routines.',
        notes: 'Auto-added to ensure day covers at least 13:30.',
        parent_tip: null,
      }, day, normalizedPlaced.length + 2000));
      warnings.push(`Day ${day}: extended day coverage to at least 13:30.`);
    } else {
      const extendable = [...normalizedPlaced]
        .reverse()
        .find((block) => !block.__locked);
      if (extendable) {
        extendable.end_time = toHHMM(targetEnd);
        warnings.push(`Day ${day}: extended non-locked block to ensure day reaches 13:30.`);
      }
    }
  }

  const postOverlapCount = countOverlaps(normalizedPlaced);
  if (preOverlapCount > postOverlapCount) {
    metrics.overlapsResolved += (preOverlapCount - postOverlapCount);
  }

  return normalizedPlaced
    .slice()
    .sort((a, b) => {
      const aStart = toMinutes(a.start_time) ?? Number.MAX_SAFE_INTEGER;
      const bStart = toMinutes(b.start_time) ?? Number.MAX_SAFE_INTEGER;
      if (aStart !== bStart) return aStart - bStart;
      return a.__sourceIndex - b.__sourceIndex;
    })
    .map((block, index) => ({
      ...stripInternal(block),
      day_of_week: day as 1 | 2 | 3 | 4 | 5 | 6 | 7,
      block_order: index + 1,
    }));
}

export function stabilizeDailyRoutineBlocks(
  blocks: DailyProgramBlock[],
  options: RoutineNormalizationOptions = {},
): RoutineNormalizationResult {
  const metrics: RoutineNormalizationMetrics = {
    overlapsResolved: 0,
    dedupedBlocks: 0,
    anchorLocksApplied: 0,
  };
  const warnings: string[] = [];

  const weekday = blocks.filter((block) => {
    const day = Number(block.day_of_week);
    return day >= 1 && day <= 5;
  });
  const nonWeekday = blocks.filter((block) => {
    const day = Number(block.day_of_week);
    return !(day >= 1 && day <= 5);
  });

  const stabilized: DailyProgramBlock[] = [];
  for (const day of WEEKDAY_SEQUENCE) {
    const dayBlocks = weekday.filter((block) => Number(block.day_of_week) === day);
    if (dayBlocks.length === 0) continue;
    stabilized.push(...stabilizeDayBlocks(day, dayBlocks, options, metrics, warnings));
  }

  return {
    blocks: [...stabilized, ...nonWeekday].sort((a, b) =>
      a.day_of_week === b.day_of_week
        ? Number(a.block_order || 0) - Number(b.block_order || 0)
        : Number(a.day_of_week || 0) - Number(b.day_of_week || 0),
    ),
    warnings,
    metrics,
  };
}

export function countRoutineDayOverlaps(blocks: DailyProgramBlock[]): number {
  return countOverlaps(blocks);
}
