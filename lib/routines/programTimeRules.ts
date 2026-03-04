import type { DailyProgramBlock } from '@/types/ecd-planning';
import type { ProgramTimeRules } from '@/lib/services/weeklyProgramService';
import { stabilizeDailyRoutineBlocks } from '@/lib/routines/dailyRoutineNormalization';

const DAY_ORDER = [1, 2, 3, 4, 5] as const;
const MIN_DAY_END_MINUTES = 13 * 60 + 30; // 13:30
const DEFAULT_DAY_CLOSE_MINUTES = 14 * 60; // 14:00
const MAX_ALLOWED_GAP_MINUTES = 10;

const ANCHOR_LOCK_NOTE_REGEX = /anchor locked from preflight/i;
const ANCHOR_LOCK_TIME_REGEX = /anchor locked from preflight:[\s\S]*?\bat\s*(\d{1,2}:\d{2})/i;
const TOILET_BLOCK_REGEX = /\b(toilet|bathroom|potty|washroom|restroom)\b/i;

type TimedRange = { start: number; end: number };

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

function isAnchorLockedBlock(block: DailyProgramBlock): boolean {
  const haystack = [
    block.notes,
    block.transition_cue,
    block.title,
    ...(block.objectives || []),
    ...(block.materials || []),
  ]
    .map((value) => String(value || '').trim())
    .join('\n');
  return ANCHOR_LOCK_NOTE_REGEX.test(haystack);
}

function getAnchorLockedStartMinutes(block: DailyProgramBlock): number | null {
  const haystack = [
    block.notes,
    block.transition_cue,
    block.title,
    ...(block.objectives || []),
    ...(block.materials || []),
  ]
    .map((value) => String(value || '').trim())
    .join('\n');
  const match = haystack.match(ANCHOR_LOCK_TIME_REGEX);
  if (!match?.[1]) return null;
  return toMinutes(match[1]);
}

function isToiletTimingBlock(block: DailyProgramBlock): boolean {
  const haystack = [
    block.block_type,
    block.title,
    block.notes,
    ...(block.objectives || []),
    ...(block.materials || []),
  ]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');
  return TOILET_BLOCK_REGEX.test(haystack);
}

function computeAvailableMinutes(ranges: TimedRange[], index: number, cursor: number): number {
  if (index >= ranges.length) return 0;
  let total = 0;
  total += Math.max(0, ranges[index].end - Math.max(cursor, ranges[index].start));
  for (let i = index + 1; i < ranges.length; i += 1) {
    total += Math.max(0, ranges[i].end - ranges[i].start);
  }
  return total;
}

function normalizeOccupiedRanges(
  ranges: TimedRange[],
  windowStart: number,
  windowEnd: number,
): TimedRange[] {
  const clipped = ranges
    .map((range) => ({
      start: Math.max(windowStart, Math.min(windowEnd, range.start)),
      end: Math.max(windowStart, Math.min(windowEnd, range.end)),
    }))
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start);

  const merged: TimedRange[] = [];
  for (const range of clipped) {
    if (merged.length === 0) {
      merged.push(range);
      continue;
    }
    const last = merged[merged.length - 1];
    if (range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push(range);
    }
  }
  return merged;
}

function invertOccupiedRanges(
  occupied: TimedRange[],
  windowStart: number,
  windowEnd: number,
): TimedRange[] {
  if (windowEnd <= windowStart) return [];
  const free: TimedRange[] = [];
  let cursor = windowStart;
  for (const range of occupied) {
    if (range.start > cursor) {
      free.push({ start: cursor, end: range.start });
    }
    cursor = Math.max(cursor, range.end);
  }
  if (cursor < windowEnd) {
    free.push({ start: cursor, end: windowEnd });
  }
  return free.filter((range) => range.end > range.start);
}

function enforceMinimumDayEndCoverage(
  day: (typeof DAY_ORDER)[number],
  dayBlocks: DailyProgramBlock[],
  pickupCutoffMinutes: number,
): DailyProgramBlock[] {
  if (dayBlocks.length === 0) return dayBlocks;

  let latestEndMinutes: number | null = null;
  for (const block of dayBlocks) {
    const end = block.end_time ? toMinutes(String(block.end_time)) : null;
    if (end !== null && (latestEndMinutes === null || end > latestEndMinutes)) {
      latestEndMinutes = end;
    }
  }

  if (latestEndMinutes !== null && latestEndMinutes >= MIN_DAY_END_MINUTES) {
    return dayBlocks;
  }

  const startMinutes = latestEndMinutes ?? Math.max(0, MIN_DAY_END_MINUTES - 45);
  const endMinutes = Math.max(
    MIN_DAY_END_MINUTES,
    Math.min(pickupCutoffMinutes, Math.max(startMinutes + 30, DEFAULT_DAY_CLOSE_MINUTES)),
  );

  const extended = [
    ...dayBlocks,
    {
      day_of_week: day as 1 | 2 | 3 | 4 | 5 | 6 | 7,
      block_order: dayBlocks.length + 1,
      block_type: 'transition',
      title: 'Afternoon Close & Dismissal Preparation',
      start_time: toHHMM(startMinutes),
      end_time: toHHMM(endMinutes),
      objectives: ['Orderly end-of-day reflection', 'Prepare learners for pickup'],
      materials: ['Routine chart', 'School bags'],
      transition_cue: 'Pack away and prepare for pickup calmly.',
      notes: 'Auto-added so the daily routine always runs to at least 13:30.',
      parent_tip: null,
    } as DailyProgramBlock,
  ];

  return extended.map((block, index) => ({
    ...block,
    day_of_week: day as 1 | 2 | 3 | 4 | 5 | 6 | 7,
    block_order: index + 1,
  }));
}

export function applyTimeRulesToBlocks(
  blocks: DailyProgramBlock[],
  rules: ProgramTimeRules,
  requestedDailyMinutes: number,
  ageGroup?: string | null,
): DailyProgramBlock[] {
  const arrivalStart = toMinutes(rules.arrivalStartTime);
  const rawPickupCutoff = toMinutes(rules.pickupCutoffTime);
  if (arrivalStart === null || rawPickupCutoff === null || rawPickupCutoff <= arrivalStart) {
    return stabilizeDailyRoutineBlocks(blocks, {
      ageGroup: ageGroup || null,
    }).blocks;
  }
  const pickupCutoff = Math.max(rawPickupCutoff, MIN_DAY_END_MINUTES);

  const weekdayBlocks = blocks.filter((block) =>
    DAY_ORDER.includes(Number(block.day_of_week) as (typeof DAY_ORDER)[number]),
  );
  const nonWeekdayBlocks = blocks.filter((block) =>
    !DAY_ORDER.includes(Number(block.day_of_week) as (typeof DAY_ORDER)[number]),
  );
  const timedBlocks: DailyProgramBlock[] = [];

  for (const day of DAY_ORDER) {
    const dayBlocks = weekdayBlocks
      .filter((block) => Number(block.day_of_week) === day)
      .slice()
      .sort((a, b) => Number(a.block_order || 0) - Number(b.block_order || 0));

    if (dayBlocks.length === 0) continue;

    const hasStrictValidTimes = dayBlocks.every((block) => {
      const start = toMinutes(String(block.start_time || ''));
      const end = toMinutes(String(block.end_time || ''));
      return start !== null && end !== null && start >= arrivalStart && end <= pickupCutoff && end > start;
    });
    const timed = dayBlocks
      .map((block) => ({
        start: toMinutes(String(block.start_time || '')),
        end: toMinutes(String(block.end_time || '')),
      }))
      .filter((value): value is { start: number; end: number } => value.start !== null && value.end !== null && value.end > value.start)
      .sort((a, b) => a.start - b.start);
    const hasOverlap = (() => {
      let prevEnd = -1;
      for (const slot of timed) {
        if (slot.start < prevEnd) return true;
        prevEnd = Math.max(prevEnd, slot.end);
      }
      return false;
    })();
    const hasLargeGap = (() => {
      let prevEnd: number | null = null;
      for (const slot of timed) {
        if (prevEnd !== null && (slot.start - prevEnd) > MAX_ALLOWED_GAP_MINUTES) {
          return true;
        }
        prevEnd = slot.end;
      }
      return false;
    })();
    const hasAnchorDrift = dayBlocks.some((block) => {
      const lockedStart = getAnchorLockedStartMinutes(block);
      if (lockedStart == null) return false;
      const start = toMinutes(String(block.start_time || ''));
      return start == null || start !== lockedStart;
    });

    if (hasStrictValidTimes && !hasOverlap && !hasLargeGap && !hasAnchorDrift) {
      const normalizedDay = dayBlocks.map((block, index) => ({
        ...block,
        day_of_week: day as 1 | 2 | 3 | 4 | 5 | 6 | 7,
        block_order: index + 1,
        start_time: normalizeTime(String(block.start_time || '')),
        end_time: normalizeTime(String(block.end_time || '')),
      }));
      timedBlocks.push(
        ...enforceMinimumDayEndCoverage(day, normalizedDay, pickupCutoff),
      );
      continue;
    }

    const totalWindow = pickupCutoff - arrivalStart;
    const targetMinutes = Math.max(120, Number.isFinite(requestedDailyMinutes) ? requestedDailyMinutes : totalWindow);
    const usableMinutes = Math.max(60, Math.min(totalWindow, targetMinutes));
    const slotMinutes = Math.max(20, Math.floor(usableMinutes / dayBlocks.length));

    const withMeta = dayBlocks.map((block, index) => {
      const start = toMinutes(String(block.start_time || ''));
      const end = toMinutes(String(block.end_time || ''));
      const lockedStart = getAnchorLockedStartMinutes(block);
      const validWindow = start !== null && end !== null && start >= arrivalStart && end <= pickupCutoff && end > start;
      // Only hard-locked anchors should stay fixed during reflow.
      const keepFixed = validWindow && isAnchorLockedBlock(block);
      const duration = start !== null && end !== null && end > start
        ? (end - start)
        : Math.max(10, slotMinutes);
      const fixedStart = keepFixed ? (lockedStart ?? start) : start;
      const fixedEnd = keepFixed && fixedStart !== null
        ? Math.min(pickupCutoff, fixedStart + Math.max(10, duration))
        : end;
      return {
        block,
        originalIndex: index,
        start: fixedStart,
        end: fixedEnd,
        keepFixed,
      };
    });

    const latestFixedEnd = withMeta
      .filter((entry) => entry.keepFixed && entry.end !== null)
      .reduce((max, entry) => Math.max(max, entry.end as number), 0);
    const dayEnd = Math.min(
      pickupCutoff,
      Math.max(MIN_DAY_END_MINUTES, arrivalStart + usableMinutes, latestFixedEnd || 0),
    );

    const fixed = withMeta
      .filter((entry) => entry.keepFixed && entry.start !== null && entry.end !== null)
      .map((entry) => ({
        ...entry,
        start: entry.start as number,
        end: entry.end as number,
      }));
    const floating = withMeta.filter((entry) => !entry.keepFixed);

    const occupied = normalizeOccupiedRanges(
      fixed.map((entry) => ({ start: entry.start, end: entry.end })),
      arrivalStart,
      dayEnd,
    );
    const freeRanges = invertOccupiedRanges(occupied, arrivalStart, dayEnd);

    let freeRangeIndex = 0;
    let freeCursor = freeRanges.length > 0 ? freeRanges[0].start : dayEnd;
    let fallbackCursor = arrivalStart;

    const timedFloating = floating.map((entry, index) => {
      while (freeRangeIndex < freeRanges.length && freeCursor >= freeRanges[freeRangeIndex].end) {
        freeRangeIndex += 1;
        if (freeRangeIndex < freeRanges.length) freeCursor = freeRanges[freeRangeIndex].start;
      }

      const remainingBlocks = Math.max(1, floating.length - index);
      const remainingMinutes = computeAvailableMinutes(freeRanges, freeRangeIndex, freeCursor);
      let duration = Math.max(20, Math.floor((remainingMinutes || slotMinutes * remainingBlocks) / remainingBlocks));
      if (isToiletTimingBlock(entry.block)) {
        duration = Math.min(duration, 20);
      }
      duration = Math.max(10, duration);

      let start = freeCursor;
      let end = start + duration;

      if (freeRangeIndex < freeRanges.length) {
        const active = freeRanges[freeRangeIndex];
        start = Math.max(active.start, freeCursor);
        end = Math.min(active.end, start + duration);
        if (end <= start) {
          freeRangeIndex += 1;
          if (freeRangeIndex < freeRanges.length) {
            const next = freeRanges[freeRangeIndex];
            start = next.start;
            end = Math.min(next.end, start + duration);
          }
        }
      }

      if (end <= start) {
        start = Math.max(arrivalStart, Math.min(dayEnd - 10, fallbackCursor));
        end = Math.min(dayEnd, start + duration);
      }
      if (end <= start) {
        end = Math.min(dayEnd, start + 10);
      }

      fallbackCursor = Math.max(fallbackCursor, end);
      freeCursor = Math.max(freeCursor, end);

      return {
        block: entry.block,
        originalIndex: entry.originalIndex,
        start,
        end,
      };
    });

    const combined = [
      ...fixed.map((entry) => ({
        block: entry.block,
        originalIndex: entry.originalIndex,
        start: entry.start,
        end: entry.end,
      })),
      ...timedFloating,
    ]
      .sort((a, b) => (a.start === b.start ? a.originalIndex - b.originalIndex : a.start - b.start))
      .map((entry, index) => ({
        ...entry.block,
        day_of_week: day as 1 | 2 | 3 | 4 | 5 | 6 | 7,
        block_order: index + 1,
        start_time: toHHMM(entry.start),
        end_time: toHHMM(entry.end),
      }));

    timedBlocks.push(...enforceMinimumDayEndCoverage(day, combined, pickupCutoff));
  }

  return stabilizeDailyRoutineBlocks([...timedBlocks, ...nonWeekdayBlocks], {
    ageGroup: ageGroup || null,
    arrivalStartTime: rules.arrivalStartTime,
    pickupCutoffTime: rules.pickupCutoffTime,
  }).blocks;
}
