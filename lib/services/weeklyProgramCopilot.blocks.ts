import type { DailyProgramBlock } from '@/types/ecd-planning';
import { clampDayOfWeek, parseDayOfWeek, pickField, toBlockType, toStringArray, type WeeklyProgramAIResponse } from './weeklyProgramCopilot.parsing';

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

const extractBlocksArrayFromRecord = (record: Record<string, unknown>): unknown[] | null => {
  for (const key of WEEKLY_PROGRAM_BLOCK_KEYS) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  return null;
};

export const toBlocksFromFlat = (blocks: unknown[]): DailyProgramBlock[] =>
  blocks
    .map((item, index) => {
      const raw = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      return toBlockRecord(raw, index, 1);
    })
    .sort((a, b) => (a.day_of_week === b.day_of_week ? a.block_order - b.block_order : a.day_of_week - b.day_of_week));

export const toBlocksFromDays = (days: WeeklyProgramAIResponse['days']): DailyProgramBlock[] => {
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
