import type { DailyProgramBlock } from '@/types/ecd-planning';
import type { ProgramTimeRules } from '@/lib/services/weeklyProgramService';
import { countRoutineDayOverlaps } from '@/lib/routines/dailyRoutineNormalization';
import { applyTimeRulesToBlocks } from '@/lib/routines/programTimeRules';

function makeBlock(input: Partial<DailyProgramBlock> & Pick<DailyProgramBlock, 'title'>): DailyProgramBlock {
  return {
    day_of_week: 1,
    block_order: 1,
    block_type: 'learning',
    start_time: null,
    end_time: null,
    objectives: [],
    materials: [],
    ...input,
  };
}

const rules: ProgramTimeRules = {
  arrivalStartTime: '06:00',
  arrivalCutoffTime: '08:00',
  pickupStartTime: '14:30',
  pickupCutoffTime: '16:00',
};

function toMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = String(value).match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  return (Number(match[1]) * 60) + Number(match[2]);
}

function maxGapMinutes(blocks: DailyProgramBlock[]): number {
  const timed = blocks
    .map((block) => ({
      start: toMinutes(block.start_time),
      end: toMinutes(block.end_time),
    }))
    .filter((slot): slot is { start: number; end: number } => slot.start !== null && slot.end !== null && slot.end > slot.start)
    .sort((a, b) => a.start - b.start);

  let maxGap = 0;
  let prevEnd: number | null = null;
  for (const slot of timed) {
    if (prevEnd !== null) {
      maxGap = Math.max(maxGap, slot.start - prevEnd);
    }
    prevEnd = slot.end;
  }
  return maxGap;
}

describe('applyTimeRulesToBlocks', () => {
  it('reflows when times are valid but overlapping', () => {
    const blocks: DailyProgramBlock[] = [
      makeBlock({ day_of_week: 1, block_order: 1, title: 'Arrival', block_type: 'transition', start_time: '06:00', end_time: '08:00' }),
      makeBlock({ day_of_week: 1, block_order: 2, title: 'Learning A', block_type: 'learning', start_time: '08:00', end_time: '08:45' }),
      makeBlock({ day_of_week: 1, block_order: 3, title: 'Learning B', block_type: 'learning', start_time: '08:30', end_time: '09:10' }),
      makeBlock({ day_of_week: 1, block_order: 4, title: 'Lunch', block_type: 'meal', start_time: '12:00', end_time: '12:30', notes: 'Anchor locked from preflight: Lunch at 12:00.' }),
      makeBlock({ day_of_week: 1, block_order: 5, title: 'Dismissal', block_type: 'transition', start_time: '13:30', end_time: '14:00' }),
      makeBlock({ day_of_week: 1, block_order: 6, title: 'Toilet Routine', block_type: 'transition', start_time: '11:10', end_time: '11:25' }),
    ];

    const normalized = applyTimeRulesToBlocks(blocks, rules, 480, '4-6');
    const monday = normalized.filter((block) => block.day_of_week === 1);

    expect(countRoutineDayOverlaps(monday)).toBe(0);
  });

  it('reflows when times are valid but have large gaps', () => {
    const blocks: DailyProgramBlock[] = [
      makeBlock({ day_of_week: 1, block_order: 1, title: 'Arrival', block_type: 'transition', start_time: '06:00', end_time: '08:00' }),
      makeBlock({ day_of_week: 1, block_order: 2, title: 'Circle Time', block_type: 'circle_time', start_time: '08:10', end_time: '08:30', notes: 'Anchor locked from preflight: Circle Time at 08:10.' }),
      makeBlock({ day_of_week: 1, block_order: 3, title: 'Literacy', block_type: 'learning', start_time: '09:00', end_time: '09:45' }),
      makeBlock({ day_of_week: 1, block_order: 4, title: 'Toilet Routine', block_type: 'transition', start_time: '10:30', end_time: '10:45' }),
      makeBlock({ day_of_week: 1, block_order: 5, title: 'Numeracy', block_type: 'learning', start_time: '10:45', end_time: '11:30' }),
      makeBlock({ day_of_week: 1, block_order: 6, title: 'Nap / Quiet Time', block_type: 'nap', start_time: '11:30', end_time: '12:00' }),
      makeBlock({ day_of_week: 1, block_order: 7, title: 'Lunch', block_type: 'meal', start_time: '12:00', end_time: '12:30', notes: 'Anchor locked from preflight: Lunch at 12:00.' }),
      makeBlock({ day_of_week: 1, block_order: 8, title: 'Dismissal', block_type: 'transition', start_time: '13:30', end_time: '14:00' }),
    ];

    const normalized = applyTimeRulesToBlocks(blocks, rules, 480, '4-6');
    const monday = normalized.filter((block) => block.day_of_week === 1);

    expect(countRoutineDayOverlaps(monday)).toBe(0);
    expect(maxGapMinutes(monday)).toBeLessThanOrEqual(10);
  });

  it('keeps hard anchor blocks exact after reflow', () => {
    const blocks: DailyProgramBlock[] = [
      makeBlock({ day_of_week: 1, block_order: 1, title: 'Arrival', block_type: 'transition', start_time: '06:00', end_time: '08:00' }),
      makeBlock({ day_of_week: 1, block_order: 2, title: 'Learning', block_type: 'learning', start_time: '08:05', end_time: '09:00' }),
      makeBlock({ day_of_week: 1, block_order: 3, title: 'Lunch', block_type: 'meal', start_time: '12:00', end_time: '12:30', notes: 'Anchor locked from preflight: Lunch at 12:00.' }),
      makeBlock({ day_of_week: 1, block_order: 4, title: 'Nap / Quiet Time', block_type: 'nap', start_time: '11:30', end_time: '12:10' }),
      makeBlock({ day_of_week: 1, block_order: 5, title: 'Dismissal', block_type: 'transition', start_time: '13:30', end_time: '14:00' }),
      makeBlock({ day_of_week: 1, block_order: 6, title: 'Toilet Routine', block_type: 'transition', start_time: '11:10', end_time: '11:25' }),
    ];

    const normalized = applyTimeRulesToBlocks(blocks, rules, 480, '4-6');
    const lunch = normalized.find((block) => /lunch/i.test(String(block.title || '')));

    expect(lunch).toBeDefined();
    expect(lunch?.start_time).toBe('12:00');
    expect(lunch?.end_time).toBe('12:30');
  });

  it('enforces anchor lock times even when anchor note is in objectives', () => {
    const blocks: DailyProgramBlock[] = [
      makeBlock({ day_of_week: 1, block_order: 1, title: 'Arrival', block_type: 'transition', start_time: '06:00', end_time: '07:00' }),
      makeBlock({
        day_of_week: 1,
        block_order: 2,
        title: 'Circle Time',
        block_type: 'circle_time',
        start_time: '06:51',
        end_time: '07:42',
        objectives: ['Anchor locked from preflight: Circle Time at 08:10.'],
      }),
      makeBlock({
        day_of_week: 1,
        block_order: 3,
        title: 'Breakfast',
        block_type: 'meal',
        start_time: '07:42',
        end_time: '08:00',
        objectives: ['Anchor locked from preflight: Breakfast at 08:30.'],
      }),
      makeBlock({
        day_of_week: 1,
        block_order: 4,
        title: 'Lunch',
        block_type: 'meal',
        start_time: '11:46',
        end_time: '12:53',
        objectives: ['Anchor locked from preflight: Lunch at 12:30.'],
      }),
      makeBlock({
        day_of_week: 1,
        block_order: 5,
        title: 'Nap / Quiet Time',
        block_type: 'nap',
        start_time: '10:39',
        end_time: '11:46',
        objectives: ['Anchor locked from preflight: Nap / Quiet Time at 11:30.'],
      }),
      makeBlock({ day_of_week: 1, block_order: 6, title: 'Dismissal', block_type: 'transition', start_time: '13:30', end_time: '14:00' }),
    ];

    const normalized = applyTimeRulesToBlocks(blocks, rules, 480, '4-6');
    const monday = normalized.filter((block) => block.day_of_week === 1);

    const circle = monday.find((block) => /circle/i.test(String(block.title || '')));
    const breakfast = monday.find((block) => /breakfast/i.test(String(block.title || '')));
    const lunch = monday.find((block) => /lunch/i.test(String(block.title || '')));
    const nap = monday.find((block) => /nap|quiet/i.test(String(block.title || '')));

    expect(circle?.start_time).toBe('08:10');
    expect(breakfast?.start_time).toBe('08:30');
    expect(nap?.start_time).toBe('11:30');
    expect(lunch?.start_time).toBe('12:30');
    expect(countRoutineDayOverlaps(monday)).toBe(0);
  });

  it('is deterministic across repeated runs', () => {
    const blocks: DailyProgramBlock[] = [
      makeBlock({ day_of_week: 1, block_order: 1, title: 'Arrival', block_type: 'transition', start_time: '06:00', end_time: '08:00' }),
      makeBlock({ day_of_week: 1, block_order: 2, title: 'Circle Time', block_type: 'circle_time', start_time: '08:10', end_time: '08:30', notes: 'Anchor locked from preflight: Circle Time at 08:10.' }),
      makeBlock({ day_of_week: 1, block_order: 3, title: 'Learning', block_type: 'learning', start_time: '08:15', end_time: '09:10' }),
      makeBlock({ day_of_week: 1, block_order: 4, title: 'Lunch', block_type: 'meal', start_time: '12:00', end_time: '12:30', notes: 'Anchor locked from preflight: Lunch at 12:00.' }),
      makeBlock({ day_of_week: 1, block_order: 5, title: 'Dismissal', block_type: 'transition', start_time: '13:30', end_time: '14:00' }),
      makeBlock({ day_of_week: 1, block_order: 6, title: 'Toilet Routine', block_type: 'transition', start_time: '11:10', end_time: '11:25' }),
    ];

    const first = applyTimeRulesToBlocks(blocks, rules, 480, '4-6');
    const second = applyTimeRulesToBlocks(blocks, rules, 480, '4-6');

    expect(second).toEqual(first);
  });
});
