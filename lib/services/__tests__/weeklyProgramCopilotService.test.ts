const mockInvoke = jest.fn();

const createMockQueryChain = () => {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue({ data: [], error: null }),
  };
  return chain;
};

jest.mock('@/lib/supabase', () => ({
  assertSupabase: () => ({
    from: jest.fn(() => createMockQueryChain()),
    functions: {
      invoke: mockInvoke,
    },
  }),
}));

import { WeeklyProgramCopilotService, type GenerateWeeklyProgramFromTermInput } from '../weeklyProgramCopilotService';
import { classifyRoutineBlockIntent } from '@/lib/routines/dailyRoutineNormalization';

const baseInput: GenerateWeeklyProgramFromTermInput = {
  preschoolId: 'school-1',
  createdBy: 'user-1',
  weekStartDate: '2026-02-18',
  theme: 'Healthy Habits',
  ageGroup: '3-6',
};

describe('WeeklyProgramCopilotService', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it('parses weekday-keyed map responses without requiring explicit days[]', async () => {
    mockInvoke.mockResolvedValueOnce({
      error: null,
      data: {
        content: JSON.stringify({
          title: 'Healthy Habits',
          summary: 'A simple weekly flow',
          monday: [
            {
              title: 'Arrival & Welcome',
              block_type: 'transition',
              start: '07:30',
              end: '08:00',
            },
          ],
          tuesday: [
            {
              name: 'Outdoor Play',
              type: 'outdoor',
              startTime: '09:00',
              endTime: '09:30',
            },
          ],
        }),
      },
    });

    const draft = await WeeklyProgramCopilotService.generateWeeklyProgramFromTerm(baseInput);
    const arrival = draft.blocks.find((block) => block.title === 'Arrival & Welcome');
    const outdoorOnTuesday = draft.blocks.find(
      (block) => block.title === 'Outdoor Play' && block.day_of_week === 2,
    );
    const mondayWeather = draft.blocks.find((block) => block.day_of_week === 1 && /weather/i.test(block.title));
    const tuesdayWeather = draft.blocks.find((block) => block.day_of_week === 2 && /weather/i.test(block.title));

    expect(arrival?.day_of_week).toBe(1);
    expect(outdoorOnTuesday?.day_of_week).toBe(2);
    expect(outdoorOnTuesday?.block_type).toBe('outdoor');
    expect(mondayWeather).toBeTruthy();
    expect(tuesdayWeather).toBeTruthy();
  });

  it('parses nested wrappers and day objects that use activities[]', async () => {
    mockInvoke.mockResolvedValueOnce({
      error: null,
      data: JSON.stringify({
        result: {
          weeklyProgram: {
            title: 'Theme Week',
            days: {
              Wednesday: {
                activities: [
                  {
                    activity: 'Story Circle',
                    category: 'circle_time',
                    time_start: '10:00',
                    time_end: '10:20',
                    parentTip: 'Read together tonight',
                  },
                ],
              },
            },
          },
        },
      }),
    });

    const draft = await WeeklyProgramCopilotService.generateWeeklyProgramFromTerm(baseInput);
    const story = draft.blocks.find((block) => block.title === 'Story Circle' && block.day_of_week === 3);
    const weather = draft.blocks.find((block) => block.day_of_week === 3 && /weather/i.test(block.title));

    expect(story?.day_of_week).toBe(3);
    expect(story?.block_type).toBe('circle_time');
    expect(story?.start_time).toBe('10:00');
    expect(story?.end_time).toBe('10:20');
    expect(story?.parent_tip).toBe('Read together tonight');
    expect(weather).toBeTruthy();
  });

  it('accepts top-level activities[] as flat blocks', async () => {
    mockInvoke.mockResolvedValueOnce({
      error: null,
      data: {
        content: JSON.stringify({
          title: 'Creative Friday',
          activities: [
            {
              day: 'Friday',
              activity: 'Music & Movement',
              activity_type: 'movement',
              goals: ['Rhythm', 'Coordination'],
            },
          ],
        }),
      },
    });

    const draft = await WeeklyProgramCopilotService.generateWeeklyProgramFromTerm(baseInput);
    const movement = draft.blocks.find((block) => block.title === 'Music & Movement' && block.day_of_week === 5);
    const weather = draft.blocks.find((block) => block.day_of_week === 5 && /weather/i.test(block.title));

    expect(movement?.day_of_week).toBe(5);
    expect(movement?.objectives).toEqual(expect.arrayContaining(['Rhythm', 'Coordination']));
    expect(weather).toBeTruthy();
  });

  it('uses lesson_generation for repair fallback and recovers malformed output', async () => {
    mockInvoke
      .mockResolvedValueOnce({
        error: null,
        data: {
          content: '{"title":"Broken JSON","days":[{"day_of_week":1,"blocks":[{"title":"Arrival"}]}',
        },
      })
      .mockResolvedValueOnce({
        error: null,
        data: {
          content: JSON.stringify({
            title: 'Recovered Weekly Program',
            days: [
              {
                day_of_week: 1,
                blocks: [
                  {
                    block_order: 1,
                    block_type: 'transition',
                    title: 'Arrival',
                    start_time: '07:30',
                    end_time: '08:00',
                    objectives: [],
                    materials: [],
                    transition_cue: null,
                    notes: null,
                    parent_tip: null,
                  },
                ],
              },
            ],
          }),
        },
      });

    const draft = await WeeklyProgramCopilotService.generateWeeklyProgramFromTerm(baseInput);
    const arrival = draft.blocks.find((block) => block.title === 'Arrival');
    const weather = draft.blocks.find((block) => block.day_of_week === 1 && /weather/i.test(block.title));

    expect(arrival).toBeTruthy();
    expect(weather).toBeTruthy();
    expect(mockInvoke).toHaveBeenCalled();
    if (mockInvoke.mock.calls.length > 1) {
      expect(mockInvoke.mock.calls[1][1]?.body?.service_type).toBe('lesson_generation');
    }
  });

  it('backfills omitted weekdays with a full day structure', async () => {
    mockInvoke.mockResolvedValueOnce({
      error: null,
      data: {
        content: JSON.stringify({
          title: 'Incomplete Week',
          summary: 'Thursday omitted by model',
          days: {
            monday: [{ title: 'Arrival Routine', block_type: 'transition' }],
            tuesday: [{ title: 'Math Warmup', block_type: 'learning' }],
            wednesday: [{ title: 'Story Circle', block_type: 'circle_time' }],
            friday: [{ title: 'Music Movement', block_type: 'movement' }],
          },
        }),
      },
    });

    const draft = await WeeklyProgramCopilotService.generateWeeklyProgramFromTerm(baseInput);
    const thursdayBlocks = draft.blocks.filter((block) => block.day_of_week === 4);

    for (const day of [1, 2, 3, 4, 5]) {
      const dayBlocks = draft.blocks.filter((block) => block.day_of_week === day);
      expect(dayBlocks.length).toBeGreaterThanOrEqual(6);
      expect(dayBlocks.length).toBeLessThanOrEqual(10);
    }

    expect(thursdayBlocks.length).toBeGreaterThanOrEqual(6);
    expect(
      thursdayBlocks.some((block) =>
        String(block.notes || '').toLowerCase().includes('auto'),
      ),
    ).toBe(true);
  });

  it('guarantees six-to-ten blocks per weekday even when AI output is heavily truncated', async () => {
    mockInvoke.mockResolvedValueOnce({
      error: null,
      data: {
        content: JSON.stringify({
          title: 'Truncated Week',
          summary: 'Only one day came back from the model',
          days: [
            {
              day_of_week: 1,
              blocks: [{ block_order: 1, title: 'Arrival', block_type: 'transition' }],
            },
          ],
        }),
      },
    });

    const draft = await WeeklyProgramCopilotService.generateWeeklyProgramFromTerm(baseInput);

    for (const day of [1, 2, 3, 4, 5]) {
      const dayBlocks = draft.blocks.filter((block) => block.day_of_week === day);
      expect(dayBlocks.length).toBeGreaterThanOrEqual(6);
      expect(dayBlocks.length).toBeLessThanOrEqual(10);
    }
  });

  it('guarantees every weekday runs until at least 13:30', async () => {
    mockInvoke.mockResolvedValueOnce({
      error: null,
      data: {
        content: JSON.stringify({
          title: 'Short Day Response',
          summary: 'Model ended too early',
          days: [
            {
              day_of_week: 1,
              blocks: [
                { block_order: 1, title: 'Arrival', block_type: 'transition', start_time: '06:30', end_time: '07:00' },
                { block_order: 2, title: 'Math Game', block_type: 'learning', start_time: '07:00', end_time: '08:00' },
              ],
            },
          ],
        }),
      },
    });

    const draft = await WeeklyProgramCopilotService.generateWeeklyProgramFromTerm(baseInput);

    for (const day of [1, 2, 3, 4, 5]) {
      const dayBlocks = draft.blocks.filter((block) => block.day_of_week === day);
      expect(dayBlocks.length).toBeGreaterThan(0);

      const latestEnd = dayBlocks.reduce((max, block) => {
        const end = String(block.end_time || '');
        if (!/^\d{2}:\d{2}$/.test(end)) return max;
        const [h, m] = end.split(':').map(Number);
        const mins = (h * 60) + m;
        return Math.max(max, mins);
      }, -1);

      expect(latestEnd).toBeGreaterThanOrEqual((13 * 60) + 30);
    }
  });

  it('returns a full fallback week when AI returns no blocks', async () => {
    mockInvoke.mockResolvedValueOnce({
      error: null,
      data: {
        content: JSON.stringify({
          title: 'Empty Payload',
          summary: 'No usable blocks',
          days: [],
        }),
      },
    });

    const draft = await WeeklyProgramCopilotService.generateWeeklyProgramFromTerm(baseInput);

    for (const day of [1, 2, 3, 4, 5]) {
      const dayBlocks = draft.blocks.filter((block) => block.day_of_week === day);
      expect(dayBlocks.length).toBeGreaterThanOrEqual(6);
      const latestEnd = dayBlocks.reduce((max, block) => {
        const end = String(block.end_time || '');
        if (!/^\d{2}:\d{2}$/.test(end)) return max;
        const [h, m] = end.split(':').map(Number);
        return Math.max(max, (h * 60) + m);
      }, -1);
      expect(latestEnd).toBeGreaterThanOrEqual((13 * 60) + 30);
    }
  });

  it('enforces weather repetition across Monday-Friday blocks', async () => {
    mockInvoke.mockResolvedValueOnce({
      error: null,
      data: {
        content: JSON.stringify({
          title: 'Healthy Habits',
          summary: 'Repetition-focused routine',
          days: [
            {
              day_of_week: 1,
              blocks: [
                { block_order: 1, title: 'Weather Circle', block_type: 'circle_time' },
                { block_order: 2, title: 'Phonics', block_type: 'learning' },
              ],
            },
            {
              day_of_week: 2,
              blocks: [{ block_order: 1, title: 'Math Warmup', block_type: 'learning' }],
            },
            {
              day_of_week: 3,
              blocks: [{ block_order: 1, title: 'Story Circle', block_type: 'circle_time' }],
            },
            {
              day_of_week: 4,
              blocks: [{ block_order: 1, title: 'Outdoor Play', block_type: 'outdoor' }],
            },
            {
              day_of_week: 5,
              blocks: [{ block_order: 1, title: 'Art & Movement', block_type: 'movement' }],
            },
          ],
        }),
      },
    });

    const draft = await WeeklyProgramCopilotService.generateWeeklyProgramFromTerm(baseInput);
    const weatherSignals = ['weather', 'forecast', 'season', 'temperature', 'climate', 'sunny', 'rain', 'cloud'];

    for (const day of [1, 2, 3, 4, 5]) {
      const dayBlocks = draft.blocks.filter((block) => block.day_of_week === day);
      expect(dayBlocks.length).toBeGreaterThan(0);
      const hasWeather = dayBlocks.some((block) => {
        const haystack = `${block.title || ''} ${block.block_type || ''} ${block.notes || ''} ${block.transition_cue || ''}`.toLowerCase();
        return weatherSignals.some((keyword) => haystack.includes(keyword));
      });
      expect(hasWeather).toBe(true);
    }
  });

  it('does not convert toilet-before-nap blocks into nap anchor blocks', async () => {
    mockInvoke.mockResolvedValueOnce({
      error: null,
      data: {
        content: JSON.stringify({
          title: 'Anchor Safety',
          summary: 'Toilet before nap should remain toilet',
          days: [
            {
              day_of_week: 1,
              blocks: [
                { block_order: 1, title: 'Arrival', block_type: 'transition', start_time: '06:00', end_time: '08:00' },
                { block_order: 2, title: 'Toilet Routine (Before Nap)', block_type: 'transition', start_time: '11:10', end_time: '11:25' },
                { block_order: 3, title: 'Nap / Quiet Time', block_type: 'nap', start_time: '11:30', end_time: '12:30' },
                { block_order: 4, title: 'Lunch', block_type: 'meal', start_time: '12:30', end_time: '13:00' },
              ],
            },
          ],
        }),
      },
    });

    const draft = await WeeklyProgramCopilotService.generateWeeklyProgramFromTerm({
      ...baseInput,
      ageGroup: '4-6',
      preflightAnswers: {
        nonNegotiableAnchors: 'Nap at 11:30 and toilet before nap.',
        fixedWeeklyEvents: 'None',
        afterLunchPattern: 'Quiet transition',
        resourceConstraints: 'Normal staffing',
        safetyCompliance: 'Toilet support before nap',
      },
      constraints: {
        includeToiletRoutine: true,
        includeNapTime: true,
      },
    });

    const monday = draft.blocks.filter((block) => block.day_of_week === 1);
    const toiletBlocks = monday.filter((block) =>
      /toilet|bathroom|potty|washroom/i.test(`${block.title} ${block.notes || ''} ${block.block_type}`),
    );
    const napBlocks = monday.filter((block) => classifyRoutineBlockIntent(block) === 'nap');

    expect(toiletBlocks.some((block) => block.block_type === 'transition')).toBe(true);
    expect(napBlocks.length).toBeLessThanOrEqual(1);
  });

  it('enforces exactly one lunch and at most one nap per day for age 4-6', async () => {
    mockInvoke.mockResolvedValueOnce({
      error: null,
      data: {
        content: JSON.stringify({
          title: 'Duplicate Meals',
          summary: 'Should normalize lunch/nap duplicates',
          days: [
            {
              day_of_week: 1,
              blocks: [
                { block_order: 1, title: 'Arrival', block_type: 'transition', start_time: '06:00', end_time: '08:00' },
                { block_order: 2, title: 'Lunch', block_type: 'meal', start_time: '12:00', end_time: '12:30', notes: 'Anchor locked from preflight: Lunch at 12:00.' },
                { block_order: 3, title: 'Lunch', block_type: 'meal', start_time: '12:20', end_time: '12:50' },
                { block_order: 4, title: 'Nap / Quiet Time', block_type: 'nap', start_time: '11:30', end_time: '12:00' },
                { block_order: 5, title: 'Nap / Quiet Time', block_type: 'nap', start_time: '12:00', end_time: '12:45' },
                { block_order: 6, title: 'Dismissal', block_type: 'transition', start_time: '13:30', end_time: '14:00' },
              ],
            },
          ],
        }),
      },
    });

    const draft = await WeeklyProgramCopilotService.generateWeeklyProgramFromTerm({
      ...baseInput,
      ageGroup: '4-6',
      constraints: {
        includeNapTime: true,
        includeMealBlocks: true,
      },
    });

    for (const day of [1, 2, 3, 4, 5]) {
      const dayBlocks = draft.blocks.filter((block) => block.day_of_week === day);
      const lunchCount = dayBlocks.filter((block) => classifyRoutineBlockIntent(block) === 'lunch').length;
      const napCount = dayBlocks.filter((block) => classifyRoutineBlockIntent(block) === 'nap').length;
      expect(lunchCount).toBe(1);
      expect(napCount).toBeLessThanOrEqual(1);
    }
  });

  it('caps toilet block duration from safety compliance rules', async () => {
    mockInvoke.mockResolvedValueOnce({
      error: null,
      data: {
        content: JSON.stringify({
          title: 'Toilet Duration Stress',
          summary: 'Toilet block is too long and should be capped',
          days: [
            {
              day_of_week: 1,
              blocks: [
                { block_order: 1, title: 'Arrival', block_type: 'transition', start_time: '06:00', end_time: '08:00' },
                { block_order: 2, title: 'Morning Prayer', block_type: 'circle_time', start_time: '08:00', end_time: '08:10' },
                { block_order: 3, title: 'Circle Time', block_type: 'circle_time', start_time: '08:10', end_time: '08:30' },
                { block_order: 4, title: 'Breakfast', block_type: 'meal', start_time: '08:30', end_time: '09:00' },
                { block_order: 5, title: 'Toilet Routine & Hygiene', block_type: 'transition', start_time: '10:15', end_time: '11:15' },
                { block_order: 6, title: 'Nap / Quiet Time', block_type: 'nap', start_time: '11:30', end_time: '12:00' },
                { block_order: 7, title: 'Lunch', block_type: 'meal', start_time: '12:30', end_time: '13:00' },
              ],
            },
          ],
        }),
      },
    });

    const draft = await WeeklyProgramCopilotService.generateWeeklyProgramFromTerm({
      ...baseInput,
      ageGroup: '4-6',
      constraints: {
        includeToiletRoutine: true,
      },
      preflightAnswers: {
        nonNegotiableAnchors: 'Morning Prayer at 08:00, Circle Time at 08:10, Breakfast at 08:30, Nap at 11:30, Lunch at 12:30',
        fixedWeeklyEvents: 'None',
        afterLunchPattern: 'After lunch, calm transition',
        resourceConstraints: 'Enough staff',
        safetyCompliance: 'Any toilet/bathroom routine must not exceed 20 minutes.',
      },
    });

    const mondayToilets = draft.blocks
      .filter((block) => block.day_of_week === 1)
      .filter((block) => classifyRoutineBlockIntent(block) === 'toilet');

    expect(mondayToilets.length).toBeGreaterThan(0);
    for (const block of mondayToilets) {
      const start = String(block.start_time || '').split(':').map(Number);
      const end = String(block.end_time || '').split(':').map(Number);
      if (start.length === 2 && end.length === 2) {
        const duration = (end[0] * 60 + end[1]) - (start[0] * 60 + start[1]);
        expect(duration).toBeLessThanOrEqual(20);
      }
    }
    expect(draft.generation_context?.timingDiagnostics?.overlongToiletCapped ?? 0).toBeGreaterThan(0);
  });

  it('keeps hard anchors and records policy conflict when soft after-lunch pattern contradicts anchor order', async () => {
    mockInvoke.mockResolvedValueOnce({
      error: null,
      data: {
        content: JSON.stringify({
          title: 'Contradictory Pattern',
          summary: 'Soft narrative conflicts with hard anchor order',
          days: [
            {
              day_of_week: 1,
              blocks: [
                { block_order: 1, title: 'Arrival', block_type: 'transition', start_time: '06:00', end_time: '08:00' },
                { block_order: 2, title: 'Morning Prayer', block_type: 'circle_time', start_time: '07:55', end_time: '08:15' },
                { block_order: 3, title: 'Circle Time', block_type: 'circle_time', start_time: '08:15', end_time: '08:40' },
                { block_order: 4, title: 'Breakfast', block_type: 'meal', start_time: '08:40', end_time: '09:10' },
                { block_order: 5, title: 'Nap / Quiet Time', block_type: 'nap', start_time: '10:30', end_time: '11:00' },
                { block_order: 6, title: 'Lunch', block_type: 'meal', start_time: '11:30', end_time: '12:00' },
              ],
            },
          ],
        }),
      },
    });

    const draft = await WeeklyProgramCopilotService.generateWeeklyProgramFromTerm({
      ...baseInput,
      ageGroup: '4-6',
      preflightAnswers: {
        nonNegotiableAnchors: 'Morning Prayer at 08:00, Circle Time at 08:10, Breakfast at 08:30, Nap / Quiet Time at 11:30, Lunch at 12:30',
        fixedWeeklyEvents: 'None',
        afterLunchPattern: 'After lunch, calm transition -> free play -> nap/quiet routine.',
        resourceConstraints: 'Enough staff',
        safetyCompliance: 'Standard safety routines.',
      },
    });

    const applied = draft.generation_context?.anchorDiagnostics?.applied || [];
    expect(applied.some((item) => /nap \/ quiet time -> 11:30/i.test(item))).toBe(true);
    expect(applied.some((item) => /lunch -> 12:30/i.test(item))).toBe(true);
    expect((draft.generation_context?.policyConflicts || []).length).toBeGreaterThan(0);
  });

  it('applies requested hard anchors for the principal preflight scenario', async () => {
    mockInvoke.mockResolvedValueOnce({
      error: null,
      data: {
        content: JSON.stringify({
          title: 'Anchor Scenario',
          summary: 'AI returns conflicting times that should be normalized',
          days: [
            {
              day_of_week: 1,
              blocks: [
                { block_order: 1, title: 'Arrival & Greeting', block_type: 'transition', start_time: '06:00', end_time: '08:00' },
                { block_order: 2, title: 'Morning Prayer', block_type: 'circle_time', start_time: '07:40', end_time: '08:20' },
                { block_order: 3, title: 'Circle Time', block_type: 'circle_time', start_time: '08:20', end_time: '08:50' },
                { block_order: 4, title: 'Breakfast', block_type: 'meal', start_time: '08:50', end_time: '09:10' },
                { block_order: 5, title: 'Toilet Routine & Hygiene', block_type: 'transition', start_time: '09:10', end_time: '10:00' },
                { block_order: 6, title: 'Nap / Quiet Time', block_type: 'nap', start_time: '10:45', end_time: '11:15' },
                { block_order: 7, title: 'Lunch', block_type: 'meal', start_time: '11:15', end_time: '11:45' },
              ],
            },
          ],
        }),
      },
    });

    const draft = await WeeklyProgramCopilotService.generateWeeklyProgramFromTerm({
      ...baseInput,
      ageGroup: '4-6',
      preflightAnswers: {
        nonNegotiableAnchors: 'Morning Prayer MUST start at 08:00. Circle Time MUST start at 08:10. Breakfast MUST start at 08:30. Nap / Quiet Time MUST start at 11:30. Lunch MUST start at 12:30.',
        fixedWeeklyEvents: 'Wednesday year-end function practice. Friday sports, gardening, computer class.',
        afterLunchPattern: 'After lunch -> calm transition -> free play -> nap/quiet routine.',
        resourceConstraints: 'Enough staff for all planned blocks.',
        safetyCompliance: 'Toilet/bathroom blocks must remain 20 minutes or less.',
      },
      constraints: {
        includeToiletRoutine: true,
      },
    });

    const monday = draft.blocks.filter((block) => block.day_of_week === 1);
    const prayer = monday.find((block) => classifyRoutineBlockIntent(block) === 'morning_prayer');
    const circle = monday.find((block) => classifyRoutineBlockIntent(block) === 'circle');
    const breakfast = monday.find((block) => classifyRoutineBlockIntent(block) === 'breakfast');
    const nap = monday.find((block) => classifyRoutineBlockIntent(block) === 'nap');
    const lunch = monday.find((block) => classifyRoutineBlockIntent(block) === 'lunch');

    expect(prayer?.start_time).toBe('08:00');
    expect(circle?.start_time).toBe('08:10');
    expect(breakfast?.start_time).toBe('08:30');
    expect(nap?.start_time).toBe('11:30');
    expect(lunch?.start_time).toBe('12:30');
    expect(draft.generation_context?.anchorDiagnostics?.applied?.length ?? 0).toBeGreaterThan(0);
  });

  it('repairs overlapping schedules into non-overlapping weekday timelines', async () => {
    mockInvoke.mockResolvedValueOnce({
      error: null,
      data: {
        content: JSON.stringify({
          title: 'Overlap Stress',
          summary: 'Contains intentional overlap',
          days: [
            {
              day_of_week: 1,
              blocks: [
                { block_order: 1, title: 'Arrival', block_type: 'transition', start_time: '06:00', end_time: '08:00' },
                { block_order: 2, title: 'Learning A', block_type: 'learning', start_time: '08:00', end_time: '08:45' },
                { block_order: 3, title: 'Learning B', block_type: 'learning', start_time: '08:30', end_time: '09:10' },
                { block_order: 4, title: 'Lunch', block_type: 'meal', start_time: '12:00', end_time: '12:30', notes: 'Anchor locked from preflight: Lunch at 12:00.' },
                { block_order: 5, title: 'Nap / Quiet Time', block_type: 'nap', start_time: '12:10', end_time: '12:50' },
              ],
            },
          ],
        }),
      },
    });

    const draft = await WeeklyProgramCopilotService.generateWeeklyProgramFromTerm({
      ...baseInput,
      ageGroup: '4-6',
      constraints: {
        arrivalStartTime: '06:00',
        pickupCutoffTime: '14:00',
      },
    });

    for (const day of [1, 2, 3, 4, 5]) {
      const timed = draft.blocks
        .filter((block) => block.day_of_week === day)
        .map((block) => {
          const start = String(block.start_time || '');
          const end = String(block.end_time || '');
          if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return null;
          const [sh, sm] = start.split(':').map(Number);
          const [eh, em] = end.split(':').map(Number);
          return { start: (sh * 60) + sm, end: (eh * 60) + em };
        })
        .filter((item): item is { start: number; end: number } => item !== null)
        .sort((a, b) => a.start - b.start);

      for (let i = 1; i < timed.length; i += 1) {
        expect(timed[i].start).toBeGreaterThanOrEqual(timed[i - 1].end);
      }
    }
  });

  it('normalizes title/type mismatch where meal blocks are mislabeled as nap', async () => {
    mockInvoke.mockResolvedValueOnce({
      error: null,
      data: {
        content: JSON.stringify({
          title: 'Title-Type Alignment',
          summary: 'Meal block has nap title',
          days: [
            {
              day_of_week: 1,
              blocks: [
                { block_order: 1, title: 'Arrival', block_type: 'transition', start_time: '06:00', end_time: '08:00' },
                { block_order: 2, title: 'Nap / Quiet Time', block_type: 'meal', start_time: '12:00', end_time: '12:30', notes: 'Anchor locked from preflight: Lunch at 12:00.' },
                { block_order: 3, title: 'Dismissal', block_type: 'transition', start_time: '13:30', end_time: '14:00' },
              ],
            },
          ],
        }),
      },
    });

    const draft = await WeeklyProgramCopilotService.generateWeeklyProgramFromTerm({
      ...baseInput,
      ageGroup: '4-6',
    });

    const monday = draft.blocks.filter((block) => block.day_of_week === 1);
    const invalidMealNap = monday.filter((block) =>
      block.block_type === 'meal' && /nap|quiet time/i.test(block.title || ''),
    );
    const lunch = monday.filter((block) => /\blunch\b/i.test(block.title || ''));

    expect(invalidMealNap).toHaveLength(0);
    expect(lunch).toHaveLength(1);
  });

  it('preserves fixed-event weekday exceptions while retaining full weekday structure', async () => {
    mockInvoke.mockResolvedValueOnce({
      error: null,
      data: {
        content: JSON.stringify({
          title: 'Weekly Event Exception',
          summary: 'Wednesday should include year-end practice only once',
          days: [
            {
              day_of_week: 1,
              blocks: [
                { block_order: 1, title: 'Arrival & Greeting', block_type: 'transition', start_time: '06:00', end_time: '08:00' },
                { block_order: 2, title: 'Circle Time', block_type: 'circle_time', start_time: '08:00', end_time: '08:20' },
                { block_order: 3, title: 'Lunch', block_type: 'meal', start_time: '12:00', end_time: '12:30' },
                { block_order: 4, title: 'Dismissal', block_type: 'transition', start_time: '13:30', end_time: '14:00' },
              ],
            },
            {
              day_of_week: 3,
              blocks: [
                { block_order: 1, title: 'Arrival & Greeting', block_type: 'transition', start_time: '06:00', end_time: '08:00' },
                { block_order: 2, title: 'Year-End Function Practice', block_type: 'learning', start_time: '09:30', end_time: '10:30' },
                { block_order: 3, title: 'Lunch', block_type: 'meal', start_time: '12:00', end_time: '12:30' },
                { block_order: 4, title: 'Dismissal', block_type: 'transition', start_time: '13:30', end_time: '14:00' },
              ],
            },
          ],
        }),
      },
    });

    const draft = await WeeklyProgramCopilotService.generateWeeklyProgramFromTerm({
      ...baseInput,
      preflightAnswers: {
        nonNegotiableAnchors: 'Morning prayer at 08:00',
        fixedWeeklyEvents: 'Wednesday act practice for year-end function',
        afterLunchPattern: 'Story then transitions',
        resourceConstraints: 'Enough staff',
        safetyCompliance: 'Standard rules',
      },
    });

    const wed = draft.blocks.filter((block) => block.day_of_week === 3);
    const monday = draft.blocks.filter((block) => block.day_of_week === 1);
    const wedHasEvent = wed.some((block) => /year-end function practice/i.test(block.title || ''));
    const mondayHasEvent = monday.some((block) => /year-end function practice/i.test(block.title || ''));

    expect(wedHasEvent).toBe(true);
    expect(mondayHasEvent).toBe(false);
    expect(monday.length).toBeGreaterThanOrEqual(6);
    expect(wed.length).toBeGreaterThanOrEqual(6);
  });

  it('caps every weekday to between 6 and 10 blocks after normalization', async () => {
    const denseMondayBlocks = Array.from({ length: 15 }, (_, index) => {
      const startMinutes = (6 * 60) + (index * 20);
      const endMinutes = startMinutes + 20;
      const toHHMM = (minutes: number) => {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
      };

      return {
        block_order: index + 1,
        title: index === 5 ? 'Lunch' : `Block ${index + 1}`,
        block_type: index === 5 ? 'meal' : 'learning',
        start_time: toHHMM(startMinutes),
        end_time: toHHMM(endMinutes),
      };
    });

    mockInvoke.mockResolvedValueOnce({
      error: null,
      data: {
        content: JSON.stringify({
          title: 'Dense Weekday',
          summary: 'Many blocks should be trimmed',
          days: [
            {
              day_of_week: 1,
              blocks: denseMondayBlocks,
            },
          ],
        }),
      },
    });

    const draft = await WeeklyProgramCopilotService.generateWeeklyProgramFromTerm({
      ...baseInput,
      ageGroup: '4-6',
    });

    for (const day of [1, 2, 3, 4, 5]) {
      const count = draft.blocks.filter((block) => block.day_of_week === day).length;
      expect(count).toBeGreaterThanOrEqual(6);
      expect(count).toBeLessThanOrEqual(10);
    }
  });
});
