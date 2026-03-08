import { getSACalendarForYear } from '@/lib/data/saSchoolCalendar';
import { startOfWeekMonday } from './weeklyProgramCopilot.parsing';
import type { GenerateWeeklyProgramFromTermInput, ToiletRoutinePolicy } from './weeklyProgramCopilot.types';

const getHolidaysInWeek = (weekStart: string): Array<{ date: string; name: string; dayOfWeek: number }> => {
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
    const match = holidays.find(h => h.date === dateStr);
    if (match) result.push({ date: dateStr, name: match.name, dayOfWeek });
  }
  return result;
};

export const buildPrompt = (
  input: GenerateWeeklyProgramFromTermInput,
  toiletPolicy: ToiletRoutinePolicy
): string => {
  const constraints = input.constraints || {};
  const objectivesText = (input.weeklyObjectives || []).join('; ') || 'Age-appropriate learning outcomes';
  const routineRequirements: string[] = [];
  const preflight = input.preflightAnswers;
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
    'STRICT ARRIVAL AND PICKUP WINDOWS (do not schedule outside these):',
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
            .map(h => `Day ${h.dayOfWeek} (${h.date}): ${h.name}`)
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
