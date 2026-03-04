import type { DailyProgramBlock } from '@/types/ecd-planning';
import {
  classifyRoutineBlockIntent,
  countRoutineDayOverlaps,
  stabilizeDailyRoutineBlocks,
} from '@/lib/routines/dailyRoutineNormalization';

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

describe('dailyRoutineNormalization', () => {
  it('resolves overlaps even when all input times are syntactically valid', () => {
    const blocks: DailyProgramBlock[] = [
      makeBlock({ day_of_week: 1, block_order: 1, block_type: 'learning', title: 'Learning A', start_time: '08:00', end_time: '08:45' }),
      makeBlock({ day_of_week: 1, block_order: 2, block_type: 'learning', title: 'Learning B', start_time: '08:30', end_time: '09:00' }),
      makeBlock({ day_of_week: 1, block_order: 3, block_type: 'meal', title: 'Lunch', start_time: '12:00', end_time: '12:30', notes: 'Anchor locked from preflight: Lunch at 12:00.' }),
      makeBlock({ day_of_week: 1, block_order: 4, block_type: 'nap', title: 'Nap / Quiet Time', start_time: '12:20', end_time: '12:50' }),
      makeBlock({ day_of_week: 1, block_order: 5, block_type: 'transition', title: 'Dismissal', start_time: '13:20', end_time: '13:50' }),
      makeBlock({ day_of_week: 1, block_order: 6, block_type: 'learning', title: 'Support', start_time: '10:00', end_time: '10:30' }),
    ];

    const result = stabilizeDailyRoutineBlocks(blocks, {
      ageGroup: '4-6',
      arrivalStartTime: '06:00',
      pickupCutoffTime: '14:00',
    });

    const monday = result.blocks.filter((block) => block.day_of_week === 1);
    expect(monday.length).toBeGreaterThanOrEqual(6);
    expect(monday.length).toBeLessThanOrEqual(10);
    expect(countRoutineDayOverlaps(monday)).toBe(0);
    expect(result.metrics.overlapsResolved).toBeGreaterThan(0);
  });

  it('keeps hard-locked anchors at exact times and removes duplicate nap/lunch for age 4-6', () => {
    const blocks: DailyProgramBlock[] = [
      makeBlock({ day_of_week: 1, block_order: 1, block_type: 'transition', title: 'Arrival', start_time: '06:00', end_time: '08:00' }),
      makeBlock({ day_of_week: 1, block_order: 2, block_type: 'meal', title: 'Nap / Quiet Time', start_time: '12:00', end_time: '12:30', notes: 'Anchor locked from preflight: Lunch at 12:00.' }),
      makeBlock({ day_of_week: 1, block_order: 3, block_type: 'nap', title: 'Nap / Quiet Time', start_time: '11:30', end_time: '12:10' }),
      makeBlock({ day_of_week: 1, block_order: 4, block_type: 'nap', title: 'Nap / Quiet Time', start_time: '12:10', end_time: '12:40' }),
      makeBlock({ day_of_week: 1, block_order: 5, block_type: 'transition', title: 'Toilet Routine (Before Nap)', start_time: '11:10', end_time: '11:25' }),
      makeBlock({ day_of_week: 1, block_order: 6, block_type: 'learning', title: 'Math', start_time: '08:15', end_time: '09:00' }),
    ];

    const result = stabilizeDailyRoutineBlocks(blocks, {
      ageGroup: '4-6',
      arrivalStartTime: '06:00',
      pickupCutoffTime: '14:00',
    });

    const monday = result.blocks.filter((block) => block.day_of_week === 1);
    const lunch = monday.filter((block) => classifyRoutineBlockIntent(block) === 'lunch');
    const naps = monday.filter((block) => classifyRoutineBlockIntent(block) === 'nap');
    const toilets = monday.filter((block) => classifyRoutineBlockIntent(block) === 'toilet');

    expect(lunch).toHaveLength(1);
    expect(lunch[0].start_time).toBe('12:00');
    expect(lunch[0].end_time).toBe('12:30');
    expect(naps.length).toBeLessThanOrEqual(1);
    expect(toilets.length).toBeGreaterThanOrEqual(1);
  });

  it('is deterministic across repeated runs for the same payload', () => {
    const blocks: DailyProgramBlock[] = [
      makeBlock({ day_of_week: 1, block_order: 1, block_type: 'learning', title: 'Literacy', start_time: '08:00', end_time: '08:40' }),
      makeBlock({ day_of_week: 1, block_order: 2, block_type: 'learning', title: 'Numeracy', start_time: '08:20', end_time: '09:00' }),
      makeBlock({ day_of_week: 1, block_order: 3, block_type: 'meal', title: 'Lunch', start_time: '12:00', end_time: '12:30', notes: 'Anchor locked from preflight: Lunch at 12:00.' }),
      makeBlock({ day_of_week: 1, block_order: 4, block_type: 'transition', title: 'Dismissal', start_time: '13:30', end_time: '14:00' }),
      makeBlock({ day_of_week: 1, block_order: 5, block_type: 'transition', title: 'Toilet Routine (Before Lunch)' }),
      makeBlock({ day_of_week: 1, block_order: 6, block_type: 'circle_time', title: 'Circle Time', start_time: '08:40', end_time: '09:00' }),
    ];

    const first = stabilizeDailyRoutineBlocks(blocks, {
      ageGroup: '4-6',
      arrivalStartTime: '06:00',
      pickupCutoffTime: '14:00',
    });
    const second = stabilizeDailyRoutineBlocks(blocks, {
      ageGroup: '4-6',
      arrivalStartTime: '06:00',
      pickupCutoffTime: '14:00',
    });

    expect(second.blocks).toEqual(first.blocks);
    expect(second.metrics).toEqual(first.metrics);
  });

  it('preserves adjacent hard-locked anchors without treating them as overlap', () => {
    const blocks: DailyProgramBlock[] = [
      makeBlock({ day_of_week: 1, block_order: 1, block_type: 'circle_time', title: 'Morning Prayer', start_time: '08:00', end_time: '08:10', notes: 'Anchor locked from preflight: Morning Prayer at 08:00.' }),
      makeBlock({ day_of_week: 1, block_order: 2, block_type: 'circle_time', title: 'Circle Time', start_time: '08:10', end_time: '08:30', notes: 'Anchor locked from preflight: Circle Time at 08:10.' }),
      makeBlock({ day_of_week: 1, block_order: 3, block_type: 'meal', title: 'Breakfast', start_time: '08:30', end_time: '09:00', notes: 'Anchor locked from preflight: Breakfast at 08:30.' }),
      makeBlock({ day_of_week: 1, block_order: 4, block_type: 'learning', title: 'Literacy', start_time: '09:00', end_time: '09:45' }),
      makeBlock({ day_of_week: 1, block_order: 5, block_type: 'nap', title: 'Nap / Quiet Time', start_time: '11:30', end_time: '12:00', notes: 'Anchor locked from preflight: Nap / Quiet Time at 11:30.' }),
      makeBlock({ day_of_week: 1, block_order: 6, block_type: 'meal', title: 'Lunch', start_time: '12:30', end_time: '13:00', notes: 'Anchor locked from preflight: Lunch at 12:30.' }),
    ];

    const result = stabilizeDailyRoutineBlocks(blocks, {
      ageGroup: '4-6',
      arrivalStartTime: '06:00',
      pickupCutoffTime: '14:00',
    });

    const monday = result.blocks.filter((block) => block.day_of_week === 1);
    const prayer = monday.find((block) => /morning prayer/i.test(block.title));
    const circle = monday.find((block) => /^circle time$/i.test(block.title));
    const breakfast = monday.find((block) => /^breakfast$/i.test(block.title));
    expect(prayer?.start_time).toBe('08:00');
    expect(prayer?.end_time).toBe('08:10');
    expect(circle?.start_time).toBe('08:10');
    expect(circle?.end_time).toBe('08:30');
    expect(breakfast?.start_time).toBe('08:30');
    expect(breakfast?.end_time).toBe('09:00');
    expect(result.metrics.anchorLocksApplied).toBeGreaterThanOrEqual(3);
    expect(countRoutineDayOverlaps(monday)).toBe(0);
  });

  it('keeps nap and lunch intent based on title/type even when notes contain opposite keyword', () => {
    const nap = makeBlock({
      block_type: 'nap',
      title: 'Nap / Quiet Time',
      notes: 'After lunch routine and lunch preparation notes.',
    });
    const lunch = makeBlock({
      block_type: 'meal',
      title: 'Lunch',
      notes: 'Prepare children for nap and quiet time afterwards.',
    });

    expect(classifyRoutineBlockIntent(nap)).toBe('nap');
    expect(classifyRoutineBlockIntent(lunch)).toBe('lunch');
  });
});
