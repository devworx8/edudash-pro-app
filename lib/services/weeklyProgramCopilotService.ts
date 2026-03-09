import { assertSupabase } from '@/lib/supabase';
import { stabilizeDailyRoutineBlocks } from '@/lib/routines/dailyRoutineNormalization';
import type {
  DailyProgramBlock,
  WeeklyProgramDraft,
} from '@/types/ecd-planning';
import {
  addDays,
  clampDayOfWeek,
  extractJson,
  parseDayOfWeek,
  pickField,
  startOfWeekMonday,
  toBlockType,
  toStringArray,
  type WeeklyProgramAIResponse,
} from './weeklyProgramCopilot.parsing';
import {
  extractAIContent,
  extractFunctionErrorMessage,
  normalizeWeeklyProgramErrorMessage,
  repairWeeklyProgramJson,
  type SupabaseFunctionsClient,
} from './weeklyProgramCopilot.ai';
import { toBlocksFromDays, toBlocksFromFlat } from './weeklyProgramCopilot.blocks';
import { buildPrompt } from './weeklyProgramCopilot.prompt';
import { getCompletionInsightSummary } from './weeklyProgramCopilot.insights';
import {
  findAnchorTimeInSource,
  minutesToTime,
  parseFlexibleTimeToMinutes,
  parseTimeToMinutes,
} from './weeklyProgramCopilot.time';
import type {
  AnchorDiagnostics,
  AnchorPolicyEnforcementOutcome,
  AnchorRule,
  AnchorRuleDefinition,
  AnchorRuleKey,
  CapsCoverageSummary,
  CompletionInsightSummary,
  GenerateWeeklyProgramFromTermInput,
  PreflightAnchorPolicy,
  ToiletRoutinePolicy,
} from './weeklyProgramCopilot.types';
import {
  WEATHER_KEYWORDS,
  WEEKDAY_SEQUENCE,
  WEEKDAY_LABELS,
  MIN_BLOCKS_PER_WEEKDAY,
  MAX_BLOCKS_PER_WEEKDAY,
  CAPS_HOME_LANGUAGE_KEYWORDS,
  CAPS_MATHEMATICS_KEYWORDS,
  CAPS_LIFE_SKILLS_KEYWORDS,
  TOILET_KEYWORDS,
  BREAKFAST_KEYWORDS,
  LUNCH_KEYWORDS,
  NAP_KEYWORDS,
  NUMBER_WORDS,
  PREFLIGHT_ANCHOR_DEFINITIONS,
  MIN_DAY_END_MINUTES,
} from './weeklyProgramCopilot.constants';

export type { GenerateWeeklyProgramFromTermInput } from './weeklyProgramCopilot.types';

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

const appendNote = (existing: string | null | undefined, suffix: string): string => {
  const base = String(existing || '').trim();
  return base ? `${base} ${suffix}` : suffix;
};

const normalizeDayBlock = (
  block: DailyProgramBlock,
  day: number,
  order: number,
  noteSuffix?: string,
): DailyProgramBlock => ({
  ...block,
  day_of_week: clampDayOfWeek(day),
  block_order: Math.max(1, order),
  block_type: toBlockType(block.block_type),
  title: String(block.title || '').trim() || `Learning Block ${Math.max(1, order)}`,
  start_time: typeof block.start_time === 'string' ? block.start_time : null,
  end_time: typeof block.end_time === 'string' ? block.end_time : null,
  objectives: toStringArray(block.objectives).slice(0, 3),
  materials: toStringArray(block.materials).slice(0, 3),
  transition_cue: String(block.transition_cue || '').trim() || null,
  notes: noteSuffix ? appendNote(block.notes, noteSuffix) : String(block.notes || '').trim() || null,
  parent_tip: String(block.parent_tip || '').trim() || null,
});

const createFallbackWeekdayBlocks = (day: number): DailyProgramBlock[] => {
  const safeDay = clampDayOfWeek(day);
  return [
    {
      day_of_week: safeDay,
      block_order: 1,
      block_type: 'circle_time',
      title: 'Morning Circle: Weather & Greetings',
      start_time: '06:00',
      end_time: '08:00',
      objectives: ['Daily weather observation', 'Calm start to the day'],
      materials: ['Weather chart', 'Greeting song cards'],
      transition_cue: 'Welcome learners and transition to guided learning.',
      notes: 'Auto-filled to preserve a complete daily structure.',
      parent_tip: null,
    },
    {
      day_of_week: safeDay,
      block_order: 2,
      block_type: 'learning',
      title: 'Focused Learning Stations',
      start_time: '08:00',
      end_time: '09:30',
      objectives: ['Home Language and Mathematics integration', 'Guided small-group practice'],
      materials: ['Manipulatives', 'Picture cards'],
      transition_cue: 'Rotate groups smoothly with clear instructions.',
      notes: 'Auto-filled learning anchor block.',
      parent_tip: null,
    },
    {
      day_of_week: safeDay,
      block_order: 3,
      block_type: 'meal',
      title: 'Morning Snack, Hygiene & Reset',
      start_time: '09:30',
      end_time: '10:00',
      objectives: ['Healthy routine habits', 'Self-help and hygiene reinforcement'],
      materials: ['Snack station', 'Handwashing supplies'],
      transition_cue: 'Handwashing first, then settle for the next activity.',
      notes: 'Auto-filled meal/hygiene block.',
      parent_tip: null,
    },
    {
      day_of_week: safeDay,
      block_order: 4,
      block_type: 'outdoor',
      title: 'Outdoor Play & Gross Motor',
      start_time: '10:00',
      end_time: '11:00',
      objectives: ['Gross motor development', 'Social-emotional confidence'],
      materials: ['Outdoor play equipment'],
      transition_cue: 'Cool down and reflect before transitioning indoors.',
      notes: 'Auto-filled movement/outdoor anchor block.',
      parent_tip: null,
    },
    {
      day_of_week: safeDay,
      block_order: 5,
      block_type: 'meal',
      title: 'Lunch Break',
      start_time: '11:30',
      end_time: '12:00',
      objectives: ['Nutritional routine', 'Self-help skills during mealtimes'],
      materials: ['Lunch boxes', 'Handwashing supplies'],
      transition_cue: 'Pack away and wash hands before transitioning to afternoon activities.',
      notes: 'Auto-filled lunch block. Adjust times to match school schedule.',
      parent_tip: null,
    },
    {
      day_of_week: safeDay,
      block_order: 6,
      block_type: 'circle_time',
      title: 'Afternoon Story & Creative Time',
      start_time: '12:00',
      end_time: '13:00',
      objectives: ['Literacy development through storytelling', 'Creative expression and fine motor skills'],
      materials: ['Story books', 'Art supplies'],
      transition_cue: 'Settle down for story time, then move into creative activity.',
      notes: 'Auto-filled post-lunch afternoon block.',
      parent_tip: null,
    },
    {
      day_of_week: safeDay,
      block_order: 7,
      block_type: 'transition',
      title: 'Afternoon Reflection & Dismissal Prep',
      start_time: '13:00',
      end_time: '14:00',
      objectives: ['Reflective closure of the school day', 'Pack-up and dismissal readiness'],
      materials: ['School bags', 'Daily reflection chart'],
      transition_cue: 'Pack bags, share one thing learned today, line up calmly for pickup.',
      notes: 'Auto-filled dismissal block. Day must not end before 13:30.',
      parent_tip: null,
    },
  ];
};

const findNearestSourceDay = (
  grouped: Map<number, DailyProgramBlock[]>,
  targetDay: number,
  minimumBlocks = 1,
  excludeDay?: number,
): number | null => {
  for (let distance = 1; distance <= 4; distance += 1) {
    const previous = targetDay - distance;
    if (
      previous >= 1
      && previous <= 5
      && previous !== excludeDay
      && (grouped.get(previous) || []).length >= minimumBlocks
    ) {
      return previous;
    }

    const next = targetDay + distance;
    if (
      next >= 1
      && next <= 5
      && next !== excludeDay
      && (grouped.get(next) || []).length >= minimumBlocks
    ) {
      return next;
    }
  }
  return null;
};

const appendUniqueBlocks = (params: {
  base: DailyProgramBlock[];
  additions: DailyProgramBlock[];
  day: number;
  note: string;
  maxBlocks: number;
}): DailyProgramBlock[] => {
  const { base, additions, day, note, maxBlocks } = params;
  const next = [...base];
  const seenTitles = new Set(
    next
      .map((block) => String(block.title || '').trim().toLowerCase())
      .filter(Boolean),
  );

  for (const candidate of additions) {
    if (next.length >= maxBlocks) break;

    const titleKey = String(candidate.title || '').trim().toLowerCase();
    if (titleKey && seenTitles.has(titleKey)) continue;

    next.push(normalizeDayBlock(candidate, day, next.length + 1, note));
    if (titleKey) seenTitles.add(titleKey);
  }

  return next;
};

const ensureWeekdayCoverage = (blocks: DailyProgramBlock[]): DailyProgramBlock[] => {
  const sourceByDay = new Map<number, DailyProgramBlock[]>();
  for (const day of WEEKDAY_SEQUENCE) sourceByDay.set(day, []);

  blocks.forEach((block) => {
    const day = clampDayOfWeek(block.day_of_week);
    if (day < 1 || day > 5) return;
    sourceByDay.get(day)?.push(normalizeDayBlock(block, day, Number(block.block_order) || 1));
  });

  for (const day of WEEKDAY_SEQUENCE) {
    const dayBlocks = (sourceByDay.get(day) || [])
      .slice()
      .sort((a, b) => a.block_order - b.block_order)
      .slice(0, MAX_BLOCKS_PER_WEEKDAY)
      .map((block, index) => normalizeDayBlock(block, day, index + 1));
    sourceByDay.set(day, dayBlocks);
  }

  const normalized: DailyProgramBlock[] = [];
  for (const day of WEEKDAY_SEQUENCE) {
    let dayBlocks = (sourceByDay.get(day) || [])
      .slice()
      .sort((a, b) => a.block_order - b.block_order)
      .map((block, index) => normalizeDayBlock(block, day, index + 1))
      .slice(0, MAX_BLOCKS_PER_WEEKDAY);

    if (dayBlocks.length === 0) {
      const sourceDay =
        findNearestSourceDay(sourceByDay, day, MIN_BLOCKS_PER_WEEKDAY, day) ||
        findNearestSourceDay(sourceByDay, day, 1, day);

      if (sourceDay) {
        const sourceLabel = WEEKDAY_LABELS[sourceDay] || `Day ${sourceDay}`;
        const targetLabel = WEEKDAY_LABELS[day] || `Day ${day}`;
        dayBlocks = (sourceByDay.get(sourceDay) || [])
          .slice(0, MAX_BLOCKS_PER_WEEKDAY)
          .map((block, index) =>
            normalizeDayBlock(
              block,
              day,
              index + 1,
              `Auto-filled from ${sourceLabel} because ${targetLabel} was incomplete.`,
            ),
          );
      } else {
        dayBlocks = createFallbackWeekdayBlocks(day);
      }
    }

    if (dayBlocks.length < MIN_BLOCKS_PER_WEEKDAY) {
      dayBlocks = appendUniqueBlocks({
        base: dayBlocks,
        additions: createFallbackWeekdayBlocks(day),
        day,
        note: 'Auto-added to preserve a full daily routine.',
        maxBlocks: MIN_BLOCKS_PER_WEEKDAY,
      });

      while (dayBlocks.length < MIN_BLOCKS_PER_WEEKDAY) {
        const order = dayBlocks.length + 1;
        dayBlocks.push({
          day_of_week: day as 1 | 2 | 3 | 4 | 5 | 6 | 7,
          block_order: order,
          block_type: 'learning',
          title: `Learning Support Block ${order}`,
          start_time: null,
          end_time: null,
          objectives: ['Maintain consistent classroom flow'],
          materials: ['Classroom routine resources'],
          transition_cue: 'Transition calmly into the next block.',
          notes: 'Auto-added to preserve the minimum daily block count.',
          parent_tip: null,
        });
      }
    }

    dayBlocks = dayBlocks
      .slice(0, MAX_BLOCKS_PER_WEEKDAY)
      .map((block, index) => normalizeDayBlock(block, day, index + 1));

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

const blockHeaderText = (block: DailyProgramBlock): string =>
  [
    block.block_type,
    block.title,
  ]
    .map((value) => String(value || '').trim().toLowerCase())
    .join(' ');

const blockTitleOnly = (block: DailyProgramBlock): string =>
  String(block.title || '').trim().toLowerCase();

const hasKeyword = (source: string, keywords: string[]): boolean =>
  keywords.some((keyword) => source.includes(keyword));

/** True if block title contains any of the given keywords (used to avoid assigning wrong anchor to a block). */
const blockTitleMatchesKeywords = (block: DailyProgramBlock, keywords: string[]): boolean =>
  hasKeyword(blockTitleOnly(block), keywords);

const blockHeaderMatchesKeywords = (block: DailyProgramBlock, keywords: string[]): boolean =>
  hasKeyword(blockHeaderText(block), keywords);

const blockTypeMatchesAnchor = (block: DailyProgramBlock, anchor: AnchorRule): boolean =>
  String(block.block_type || '').toLowerCase() === String(anchor.blockType || '').toLowerCase();

const findBestAnchorCandidateIndex = (
  dayBlocks: DailyProgramBlock[],
  claimedBlockIndexes: Set<number>,
  anchor: AnchorRule,
  otherAnchors: AnchorRule[],
): number => {
  const anchorStart = parseTimeToMinutes(anchor.startTime);
  let bestIndex = -1;
  let bestScore = -Infinity;

  dayBlocks.forEach((block, index) => {
    if (claimedBlockIndexes.has(index)) return;
    if (isToiletRoutineBlock(block)) return;

    const titleHit = blockTitleMatchesKeywords(block, anchor.keywords);
    const headerHit = blockHeaderMatchesKeywords(block, anchor.keywords);
    const typeHit = blockTypeMatchesAnchor(block, anchor);
    if (!titleHit && !headerHit && !typeHit) return;

    const titleMatchesOther = otherAnchors.some((item) => blockTitleMatchesKeywords(block, item.keywords));
    if (titleMatchesOther) return;

    let score = 0;
    if (titleHit) score += 1000;
    if (headerHit) score += 800;
    if (typeHit) score += 350;

    const start = parseTimeToMinutes(block.start_time);
    if (start != null && anchorStart != null) {
      score += Math.max(0, 240 - Math.abs(start - anchorStart));
    }

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestScore >= 300 ? bestIndex : -1;
};

const parseToiletMaxDurationMinutes = (source: string): number | null => {
  const patterns = [
    /(?:toilet|bathroom|potty|washroom)[^\n\r\.]{0,60}?(?:not\s*be\s*(?:more|longer)\s*than|no\s*more\s*than|maximum\s*(?:of)?|max\s*(?:of)?|under|less\s*than|must\s*not\s*exceed|not\s*exceed)\s*(\d{1,2})\s*(?:minutes?|mins?)/i,
    /(?:not\s*be\s*(?:more|longer)\s*than|no\s*more\s*than|maximum\s*(?:of)?|max\s*(?:of)?|under|less\s*than|must\s*not\s*exceed)\s*(\d{1,2})\s*(?:minutes?|mins?)[^\n\r\.]{0,40}?(?:toilet|bathroom|potty|washroom)/i,
    /(?:toilet|bathroom|potty|washroom)[^\n\r\.]{0,40}?(\d{1,2})\s*(?:minutes?|mins?)\s*or\s*less/i,
    /(\d{1,2})\s*(?:minutes?|mins?)\s*or\s*less[^\n\r\.]{0,30}?(?:toilet|bathroom|potty|washroom)/i,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (!match) continue;
    const parsed = Number(match[1]);
    if (!Number.isFinite(parsed)) continue;
    return Math.max(5, Math.min(30, Math.trunc(parsed)));
  }
  return null;
};

const collectPreflightSections = (
  input: GenerateWeeklyProgramFromTermInput,
): string[] => [
  input.preflightAnswers?.nonNegotiableAnchors,
  input.preflightAnswers?.fixedWeeklyEvents,
  input.preflightAnswers?.afterLunchPattern,
  input.preflightAnswers?.resourceConstraints,
  input.preflightAnswers?.safetyCompliance,
]
  .map((value) => String(value || '').trim())
  .filter(Boolean);

const parsePreflightAnchorPolicy = (
  input: GenerateWeeklyProgramFromTermInput,
): PreflightAnchorPolicy => {
  const source = collectPreflightSections(input).join(' ');

  if (!source) {
    return {
      anchors: [],
      toiletMaxDurationMinutes: null,
    };
  }

  const DEFAULT_ANCHOR_TIMES: Partial<Record<AnchorRuleKey, string>> = {
    morning_prayer: '08:00',
    circle_time: '08:10',
    breakfast: '08:30',
    nap: '11:30',
    lunch: '12:30',
  };
  const anchors: AnchorRule[] = [];
  for (const anchor of PREFLIGHT_ANCHOR_DEFINITIONS) {
    const parsed = findAnchorTimeInSource(source, anchor.keywords);
    const startTime = parsed ?? DEFAULT_ANCHOR_TIMES[anchor.key] ?? null;
    if (!startTime) continue;
    anchors.push({
      ...anchor,
      startTime,
    });
  }
  anchors.sort((a, b) => {
    const aMinutes = parseFlexibleTimeToMinutes(a.startTime);
    const bMinutes = parseFlexibleTimeToMinutes(b.startTime);
    if (aMinutes == null && bMinutes == null) return 0;
    if (aMinutes == null) return 1;
    if (bMinutes == null) return -1;
    return aMinutes - bMinutes;
  });
  const toiletMax = parseToiletMaxDurationMinutes(source);
  return {
    anchors,
    toiletMaxDurationMinutes: toiletMax ?? (source.toLowerCase().includes('toilet') && source.toLowerCase().includes('20') ? 20 : null),
  };
};

const buildAnchorBlock = (
  day: number,
  order: number,
  anchor: AnchorRule,
): DailyProgramBlock => {
  const startMinutes = parseTimeToMinutes(anchor.startTime) ?? 0;
  const endMinutes = Math.min(23 * 60 + 59, startMinutes + anchor.defaultDurationMinutes);
  const noteSuffix = `Auto-added from preflight non-negotiable anchor (${anchor.label} ${anchor.startTime}).`;

  return {
    day_of_week: clampDayOfWeek(day),
    block_order: Math.max(1, order),
    block_type: anchor.blockType,
    title: anchor.label,
    start_time: anchor.startTime,
    end_time: minutesToTime(endMinutes),
    objectives: [`Respect daily anchor: ${anchor.label}`],
    materials: [],
    transition_cue: 'Keep this anchor fixed, then continue with the next planned activity.',
    notes: noteSuffix,
    parent_tip: null,
  };
};

const applyAnchorTimingToBlock = (
  block: DailyProgramBlock,
  anchor: AnchorRule,
): DailyProgramBlock => {
  const existingStart = parseTimeToMinutes(block.start_time);
  const existingEnd = parseTimeToMinutes(block.end_time);
  const baseDuration =
    existingStart != null && existingEnd != null && existingEnd > existingStart
      ? existingEnd - existingStart
      : anchor.defaultDurationMinutes;

  let duration = Math.max(10, baseDuration);
  if (anchor.key === 'morning_prayer') duration = Math.min(duration, 20);
  if (anchor.key === 'breakfast' || anchor.key === 'lunch') duration = Math.max(20, Math.min(duration, 45));
  if (anchor.key === 'nap') duration = Math.max(30, duration);

  const startMinutes = parseTimeToMinutes(anchor.startTime) ?? 0;
  const endMinutes = Math.min(23 * 60 + 59, startMinutes + duration);
  const shouldForceAnchorTitle = anchor.key === 'breakfast' || anchor.key === 'lunch' || anchor.key === 'nap';

  return {
    ...block,
    block_type: anchor.blockType,
    title: shouldForceAnchorTitle
      ? anchor.label
      : (String(block.title || '').trim() || anchor.label),
    start_time: anchor.startTime,
    end_time: minutesToTime(endMinutes),
    notes: appendNote(block.notes, `Anchor locked from preflight: ${anchor.label} at ${anchor.startTime}.`),
  };
};

const capToiletBlockDuration = (
  block: DailyProgramBlock,
  maxMinutes: number,
): DailyProgramBlock => {
  if (!isToiletRoutineBlock(block)) return block;
  const start = parseTimeToMinutes(block.start_time);
  const end = parseTimeToMinutes(block.end_time);
  if (start == null || end == null || end <= start) return block;
  if (end - start <= maxMinutes) return block;
  return {
    ...block,
    end_time: minutesToTime(start + maxMinutes),
    notes: appendNote(block.notes, `Toilet routine capped to ${maxMinutes} minutes from preflight rule.`),
  };
};

const enforcePreflightAnchorPolicy = (
  blocks: DailyProgramBlock[],
  input: GenerateWeeklyProgramFromTermInput,
): AnchorPolicyEnforcementOutcome => {
  const policy = parsePreflightAnchorPolicy(input);
  const requested = policy.anchors.map((anchor) => `${anchor.label} ${anchor.startTime}`);
  const anchorDiagnostics: AnchorDiagnostics = {
    requested,
    applied: [],
    skippedConflicts: [],
  };
  if (policy.anchors.length === 0 && policy.toiletMaxDurationMinutes == null) {
    return {
      blocks,
      policy,
      appliedCount: 0,
      insertedCount: 0,
      toiletCappedCount: 0,
      anchorDiagnostics,
    };
  }

  const grouped = new Map<number, DailyProgramBlock[]>();
  for (const day of WEEKDAY_SEQUENCE) grouped.set(day, []);

  for (const block of blocks) {
    const day = clampDayOfWeek(block.day_of_week);
    if (day >= 1 && day <= 5) {
      grouped.get(day)?.push(block);
    }
  }

  let appliedCount = 0;
  let insertedCount = 0;
  let toiletCappedCount = 0;

  for (const day of WEEKDAY_SEQUENCE) {
    const dayBlocks = (grouped.get(day) || [])
      .slice()
      .sort((a, b) => a.block_order - b.block_order);
    const claimedBlockIndexes = new Set<number>();

    for (const anchor of policy.anchors) {
      const otherAnchors = policy.anchors.filter((a) => a.key !== anchor.key);
      const idx = findBestAnchorCandidateIndex(
        dayBlocks,
        claimedBlockIndexes,
        anchor,
        otherAnchors,
      );
      if (idx < 0) {
        const skippedToilet = dayBlocks.some(
          (block, index) =>
            !claimedBlockIndexes.has(index) &&
            isToiletRoutineBlock(block) &&
            blockHeaderMatchesKeywords(block, anchor.keywords),
        );
        if (skippedToilet) {
          anchorDiagnostics.skippedConflicts.push(
            `Day ${day}: ${anchor.label} avoided toilet/hygiene block keyword collision.`,
          );
        }
      }
      if (idx >= 0) {
        dayBlocks[idx] = applyAnchorTimingToBlock(dayBlocks[idx], anchor);
        claimedBlockIndexes.add(idx);
        anchorDiagnostics.applied.push(`Day ${day}: ${anchor.label} -> ${anchor.startTime} (matched existing)`);
      } else {
        dayBlocks.push(buildAnchorBlock(day, dayBlocks.length + 1, anchor));
        claimedBlockIndexes.add(dayBlocks.length - 1);
        insertedCount += 1;
        anchorDiagnostics.applied.push(`Day ${day}: ${anchor.label} -> ${anchor.startTime} (inserted)`);
      }
      appliedCount += 1;
    }

    if (policy.toiletMaxDurationMinutes != null) {
      for (let i = 0; i < dayBlocks.length; i += 1) {
        const previousEnd = dayBlocks[i].end_time;
        dayBlocks[i] = capToiletBlockDuration(dayBlocks[i], policy.toiletMaxDurationMinutes);
        if (dayBlocks[i].end_time !== previousEnd) {
          toiletCappedCount += 1;
        }
      }
    }

    dayBlocks.sort((a, b) => {
      const aStart = parseTimeToMinutes(a.start_time);
      const bStart = parseTimeToMinutes(b.start_time);
      if (aStart != null && bStart != null && aStart !== bStart) return aStart - bStart;
      if (aStart != null && bStart == null) return -1;
      if (aStart == null && bStart != null) return 1;
      return a.block_order - b.block_order;
    });

    grouped.set(
      day,
      dayBlocks.map((block, index) => ({
        ...block,
        day_of_week: day as 1 | 2 | 3 | 4 | 5 | 6 | 7,
        block_order: index + 1,
      })),
    );
  }

  const normalized: DailyProgramBlock[] = [];
  for (const day of WEEKDAY_SEQUENCE) {
    normalized.push(...(grouped.get(day) || []));
  }

  return {
    blocks: normalized.sort((a, b) =>
      a.day_of_week === b.day_of_week ? a.block_order - b.block_order : a.day_of_week - b.day_of_week,
    ),
    policy,
    appliedCount,
    insertedCount,
    toiletCappedCount,
    anchorDiagnostics,
  };
};

const parseToiletRoutinePolicy = (input: GenerateWeeklyProgramFromTermInput): ToiletRoutinePolicy => {
  const preflightSections = collectPreflightSections(input);
  const preflightText = preflightSections.map((value) => value.toLowerCase()).join(' ');

  const hasToiletLanguage = TOILET_KEYWORDS.some((keyword) => preflightText.includes(keyword));
  let requiredPerDay = input.constraints?.includeToiletRoutine ? 1 : 0;

  if (hasToiletLanguage) {
    const numericSignals = [
      ...Array.from(preflightText.matchAll(/(\d+)\s*(?:x|times?)\s*(?:a\s*day|daily|per\s*day)?\s*(?:toilet|bathroom|potty)?/g)),
      ...Array.from(preflightText.matchAll(/(\d+)\s*(?:toilet|bathroom|potty)\s*routines?/g)),
      ...Array.from(preflightText.matchAll(/(?:toilet|bathroom|potty)\s*routines?\s*(\d+)/g)),
    ];
    const wordSignals = Array.from(
      preflightText.matchAll(
        /\b(one|two|three|four|five|six)\b\s*(?:toilet|bathroom|potty)?\s*routines?\b/g,
      ),
    )
      .map((match) => NUMBER_WORDS[match[1]] ?? 0)
      .filter((value) => Number.isFinite(value) && value > 0);
    const parsed = numericSignals
      .map((match) => Number(match[1]))
      .filter((value) => Number.isFinite(value) && value > 0)
      .concat(wordSignals)
      .map((value) => Math.min(6, Math.max(1, Math.trunc(value))));
    if (parsed.length > 0) {
      requiredPerDay = Math.max(requiredPerDay, ...parsed);
    }
  }

  const beforeBreakfast = hasToiletLanguage && /(?:before|pre-)\s*breakfast/.test(preflightText);
  const beforeLunch = hasToiletLanguage && /(?:before|pre-)\s*lunch/.test(preflightText);
  const beforeNap = hasToiletLanguage && /(?:before|pre-)\s*(?:nap|quiet\s*time|rest)/.test(preflightText);
  const anchorCount =
    Number(beforeBreakfast) + Number(beforeLunch) + Number(beforeNap);
  if (hasToiletLanguage && anchorCount > 0) {
    requiredPerDay = Math.max(requiredPerDay, anchorCount);
  }

  const maxDuration = parseToiletMaxDurationMinutes(preflightText)
    ?? (hasToiletLanguage && preflightText.includes('20') ? 20 : null);

  return {
    requiredPerDay,
    beforeBreakfast: beforeBreakfast || requiredPerDay >= 3,
    beforeLunch: beforeLunch || requiredPerDay >= 3,
    beforeNap: beforeNap || requiredPerDay >= 3,
    maxDurationMinutes: maxDuration,
  };
};

const isToiletRoutineBlock = (block: DailyProgramBlock): boolean =>
  hasKeyword(blockText(block), TOILET_KEYWORDS);

const isAnchorBlock = (block: DailyProgramBlock, keywords: string[]): boolean =>
  hasKeyword(blockHeaderText(block), keywords);

const createToiletRoutineBlock = (
  day: number,
  order: number,
  label?: string,
): DailyProgramBlock => ({
  day_of_week: clampDayOfWeek(day),
  block_order: Math.max(1, order),
  block_type: 'transition',
  title: label ? `Toilet Routine (${label})` : 'Toilet Routine & Hygiene',
  start_time: null,
  end_time: null,
  objectives: ['Toilet support and handwashing', 'Healthy hygiene habits'],
  materials: ['Soap', 'Water', 'Towels'],
  transition_cue: 'Move calmly to toilet routine, then transition back to class.',
  notes: 'Auto-enforced from preflight non-negotiable routine constraints.',
  parent_tip: null,
});

const normalizeDayOrdering = (day: number, blocks: DailyProgramBlock[]): DailyProgramBlock[] =>
  blocks
    .slice()
    .sort((a, b) => (a.block_order === b.block_order ? String(a.title || '').localeCompare(String(b.title || '')) : a.block_order - b.block_order))
    .map((block, index) => normalizeDayBlock(block, day, index + 1));

const enforceToiletRoutinePolicy = (
  blocks: DailyProgramBlock[],
  input: GenerateWeeklyProgramFromTermInput,
): {
  blocks: DailyProgramBlock[];
  policy: ToiletRoutinePolicy;
  insertedCount: number;
  adjustedDays: number[];
  toiletCappedCount: number;
} => {
  const policy = parseToiletRoutinePolicy(input);
  if (policy.requiredPerDay <= 0) {
    return {
      blocks,
      policy,
      insertedCount: 0,
      adjustedDays: [],
      toiletCappedCount: 0,
    };
  }

  const grouped = new Map<number, DailyProgramBlock[]>();
  for (const day of WEEKDAY_SEQUENCE) grouped.set(day, []);
  for (const block of blocks) {
    const day = clampDayOfWeek(block.day_of_week);
    if (day >= 1 && day <= 5) {
      grouped.get(day)?.push(block);
    }
  }

  let insertedCount = 0;
  let toiletCappedCount = 0;
  const adjustedDays: number[] = [];

  for (const day of WEEKDAY_SEQUENCE) {
    let dayBlocks = normalizeDayOrdering(day, grouped.get(day) || []);
    const initialLength = dayBlocks.length;
    const initialToiletCount = dayBlocks.filter(isToiletRoutineBlock).length;

    const ensureAnchorBefore = (anchorKeywords: string[], label: string) => {
      const anchorIndex = dayBlocks.findIndex((block) => isAnchorBlock(block, anchorKeywords));
      if (anchorIndex < 0) return;
      const hasToiletBefore = dayBlocks.slice(0, anchorIndex).some(isToiletRoutineBlock);
      if (hasToiletBefore) return;
      dayBlocks.splice(anchorIndex, 0, createToiletRoutineBlock(day, anchorIndex + 1, label));
      insertedCount += 1;
    };

    if (policy.beforeBreakfast) ensureAnchorBefore(BREAKFAST_KEYWORDS, 'Before Breakfast');
    if (policy.beforeLunch) ensureAnchorBefore(LUNCH_KEYWORDS, 'Before Lunch');
    if (policy.beforeNap) ensureAnchorBefore(NAP_KEYWORDS, 'Before Nap');

    let toiletCount = dayBlocks.filter(isToiletRoutineBlock).length;
    while (toiletCount < policy.requiredPerDay) {
      const lunchIndex = dayBlocks.findIndex((block) => isAnchorBlock(block, LUNCH_KEYWORDS));
      const insertIndex = lunchIndex > 0 ? lunchIndex : dayBlocks.length;
      dayBlocks.splice(insertIndex, 0, createToiletRoutineBlock(day, insertIndex + 1, 'Scheduled'));
      insertedCount += 1;
      toiletCount += 1;
    }

    if (policy.maxDurationMinutes != null) {
      for (let i = 0; i < dayBlocks.length; i += 1) {
        const previousEnd = dayBlocks[i].end_time;
        dayBlocks[i] = capToiletBlockDuration(dayBlocks[i], policy.maxDurationMinutes);
        if (dayBlocks[i].end_time !== previousEnd) {
          toiletCappedCount += 1;
        }
      }
    }

    dayBlocks = normalizeDayOrdering(day, dayBlocks);
    grouped.set(day, dayBlocks);

    const finalToiletCount = dayBlocks.filter(isToiletRoutineBlock).length;
    if (dayBlocks.length !== initialLength || finalToiletCount !== initialToiletCount) {
      adjustedDays.push(day);
    }
  }

  const normalized: DailyProgramBlock[] = [];
  for (const day of WEEKDAY_SEQUENCE) {
    normalized.push(...(grouped.get(day) || []));
  }

  return {
    blocks: normalized.sort((a, b) =>
      a.day_of_week === b.day_of_week ? a.block_order - b.block_order : a.day_of_week - b.day_of_week,
    ),
    policy,
    insertedCount,
    adjustedDays: Array.from(new Set(adjustedDays)),
    toiletCappedCount,
  };
};

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

/**
 * Ensure every weekday's last block ends at or after 13:30.
 * When a day ends early, append an afternoon block so the full day is covered.
 */
const ensureFullDayCoverage = (blocks: DailyProgramBlock[]): DailyProgramBlock[] => {
  const grouped = new Map<number, DailyProgramBlock[]>();
  for (const d of WEEKDAY_SEQUENCE) grouped.set(d, []);
  for (const b of blocks) {
    const d = clampDayOfWeek(b.day_of_week);
    if (d >= 1 && d <= 5) grouped.get(d)?.push(b);
  }

  const result: DailyProgramBlock[] = [];
  for (const day of WEEKDAY_SEQUENCE) {
    const dayBlocks = (grouped.get(day) || [])
      .slice()
      .sort((a, b) => a.block_order - b.block_order);

    if (dayBlocks.length === 0) {
      result.push(...createFallbackWeekdayBlocks(day));
      continue;
    }

    // Find the latest end_time across all blocks for this day
    let latestEndMinutes: number | null = null;
    for (const b of dayBlocks) {
      const t = parseTimeToMinutes(b.end_time);
      if (t !== null && (latestEndMinutes === null || t > latestEndMinutes)) {
        latestEndMinutes = t;
      }
    }

    const nextOrder = Math.max(...dayBlocks.map((b) => b.block_order)) + 1;

    if (latestEndMinutes !== null && latestEndMinutes < MIN_DAY_END_MINUTES) {
      // Day ends before 13:30 — determine what's missing
      const startMinutes = latestEndMinutes;
      const startH = String(Math.floor(startMinutes / 60)).padStart(2, '0');
      const startM = String(startMinutes % 60).padStart(2, '0');

      // Add afternoon session starting from where the day ended
      dayBlocks.push({
        day_of_week: day as 1 | 2 | 3 | 4 | 5 | 6 | 7,
        block_order: nextOrder,
        block_type: 'circle_time',
        title: 'Afternoon Story & Creative Activity',
        start_time: `${startH}:${startM}`,
        end_time: '13:30',
        objectives: [
          'Literacy through storytelling',
          'Creative expression and fine motor development',
          'Calm afternoon routine before dismissal',
        ],
        materials: ['Story books', 'Art/craft supplies', 'Colouring sheets'],
        transition_cue: 'Pack away and prepare for dismissal.',
        notes: 'Auto-added: day must not end before 13:30.',
        parent_tip: null,
      });

      // Add dismissal block if latest end is still before 13:30
      dayBlocks.push({
        day_of_week: day as 1 | 2 | 3 | 4 | 5 | 6 | 7,
        block_order: nextOrder + 1,
        block_type: 'transition',
        title: 'Dismissal Preparation & Pack-Up',
        start_time: '13:30',
        end_time: '14:00',
        objectives: ['Organised end-of-day routine', 'Reflection and pack-up'],
        materials: ['School bags', 'Daily chart'],
        transition_cue: 'Line up calmly and wait for parents or transport.',
        notes: 'Auto-added dismissal block. Adjust if school closes later.',
        parent_tip: null,
      });
    } else if (latestEndMinutes === null) {
      // No times on any block — append an untimed afternoon close block
      dayBlocks.push({
        day_of_week: day as 1 | 2 | 3 | 4 | 5 | 6 | 7,
        block_order: nextOrder,
        block_type: 'transition',
        title: 'Afternoon Close & Dismissal',
        start_time: '13:30',
        end_time: '14:00',
        objectives: ['End-of-day pack-up and reflection'],
        materials: ['School bags'],
        transition_cue: 'Pack bags and prepare for pickup.',
        notes: 'Auto-added to ensure full-day coverage through 13:30.',
        parent_tip: null,
      });
    }

    result.push(...dayBlocks.map((b, i) => ({ ...b, day_of_week: day as 1|2|3|4|5|6|7, block_order: i + 1 })));
  }

  return result.sort((a, b) =>
    a.day_of_week === b.day_of_week ? a.block_order - b.block_order : a.day_of_week - b.day_of_week,
  );
};

/** Fix common AI slips in generated block text (rainy→many, prefflight, truncation). */
const sanitizeGeneratedBlockText = (str: string | null | undefined): string => {
  if (str == null || typeof str !== 'string') return '';
  let out = str.trim();
  // "if many" is a common truncation of "if rainy" in outdoor fallback phrases
  out = out.replace(/\bif\s+many\b/gi, 'if rainy');
  // Double-f preflight typo
  out = out.replace(/prefflight/gi, 'preflight');
  out = out.replace(/pre-?flight/gi, 'preflight');
  return out;
};

/** Apply text sanitization to a single block's notes, objectives, materials, transition_cue. */
const sanitizeGeneratedBlockContent = (block: DailyProgramBlock): DailyProgramBlock => {
  const notes = sanitizeGeneratedBlockText(block.notes);
  const objectives = (block.objectives || []).map((o) => sanitizeGeneratedBlockText(o)).filter(Boolean);
  const materials = (block.materials || []).map((m) => sanitizeGeneratedBlockText(m)).filter(Boolean);
  const transition_cue = block.transition_cue != null ? sanitizeGeneratedBlockText(block.transition_cue) : block.transition_cue;
  return {
    ...block,
    notes: notes || (block.notes ?? undefined),
    objectives: objectives.length > 0 ? objectives : (block.objectives || []),
    materials: materials.length > 0 ? materials : (block.materials || []),
    transition_cue: transition_cue || (block.transition_cue ?? undefined),
  };
};

const extractAnchorMinutes = (
  policy: PreflightAnchorPolicy,
  key: AnchorRuleKey,
): number | null => {
  const anchor = policy.anchors.find((item) => item.key === key);
  return anchor ? parseFlexibleTimeToMinutes(anchor.startTime) : null;
};

const detectPolicyConflicts = (
  input: GenerateWeeklyProgramFromTermInput,
  policy: PreflightAnchorPolicy,
): string[] => {
  const conflicts: string[] = [];
  const afterLunchPattern = String(input.preflightAnswers?.afterLunchPattern || '').toLowerCase();
  if (!afterLunchPattern) return conflicts;

  const lunchMinutes = extractAnchorMinutes(policy, 'lunch');
  const napMinutes = extractAnchorMinutes(policy, 'nap');
  const requestsNapAfterLunch =
    afterLunchPattern.includes('after lunch')
    && (afterLunchPattern.includes('nap') || afterLunchPattern.includes('quiet'));

  if (
    requestsNapAfterLunch
    && lunchMinutes != null
    && napMinutes != null
    && napMinutes <= lunchMinutes
  ) {
    conflicts.push(
      `Soft after-lunch narrative conflicts with hard anchors (nap ${minutesToTime(
        napMinutes,
      )} is not after lunch ${minutesToTime(lunchMinutes)}). Hard anchors kept.`,
    );
  }

  return conflicts;
};

const extractGapsFilledCount = (warnings: string[]): number =>
  warnings.reduce((total, warning) => {
    const match = warning.match(/filled\s+(\d+)\s+internal timeline gap/i);
    if (!match?.[1]) return total;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? total + parsed : total;
  }, 0);

const summarizeDayTimeline = (blocks: DailyProgramBlock[]): Record<number, string[]> => {
  const summary: Record<number, string[]> = {};
  for (const day of WEEKDAY_SEQUENCE) {
    summary[day] = blocks
      .filter((block) => block.day_of_week === day)
      .sort((a, b) => a.block_order - b.block_order)
      .map((block) => `${block.title} [${block.start_time || '--'}-${block.end_time || '--'}]`);
  }
  return summary;
};

const normalizeAIResponse = (
  response: WeeklyProgramAIResponse,
  input: GenerateWeeklyProgramFromTermInput,
  modelUsed?: string | null,
): WeeklyProgramDraft => {
  const weekStart = startOfWeekMonday(input.weekStartDate);
  const weekEnd = addDays(weekStart, 4);
  const flatBlocks = Array.isArray(response.blocks) ? toBlocksFromFlat(response.blocks) : [];
  const dayBlocks = toBlocksFromDays(response.days);
  const rawBlocks = flatBlocks.length > 0 ? flatBlocks : dayBlocks;

  // Enforce full 5-day cycle: only keep Monday–Friday (1–5), no exceptions
  const blocks = rawBlocks.filter((b) => {
    const d = clampDayOfWeek(b.day_of_week);
    return d >= 1 && d <= 5;
  });

  const safeBlocks = blocks.length > 0
    ? blocks
    : WEEKDAY_SEQUENCE.flatMap((day) => createFallbackWeekdayBlocks(day));

  const sanitizedBlocks = safeBlocks.map(sanitizeGeneratedBlockContent);
  const weekdayCoveredBlocks = ensureWeekdayCoverage(sanitizedBlocks);
  const toiletPolicyOutcome = enforceToiletRoutinePolicy(weekdayCoveredBlocks, input);
  const anchorPolicyOutcome = enforcePreflightAnchorPolicy(toiletPolicyOutcome.blocks, input);
  const policyConflicts = detectPolicyConflicts(input, anchorPolicyOutcome.policy);
  const fullDayBlocks = ensureFullDayCoverage(anchorPolicyOutcome.blocks);
  const normalizedBlocks = ensureDailyWeatherRepetition(fullDayBlocks);
  if (__DEV__) {
    console.log('[WeeklyProgramCopilot] before stabilization', {
      modelUsed: modelUsed || null,
      weekdayInputBlocks: weekdayCoveredBlocks.length,
      afterToiletPolicyBlocks: toiletPolicyOutcome.blocks.length,
      afterAnchorPolicyBlocks: anchorPolicyOutcome.blocks.length,
      requestedAnchors: anchorPolicyOutcome.anchorDiagnostics.requested,
      appliedAnchors: anchorPolicyOutcome.anchorDiagnostics.applied.length,
      skippedAnchorConflicts: anchorPolicyOutcome.anchorDiagnostics.skippedConflicts,
      toiletPolicy: toiletPolicyOutcome.policy,
      policyConflicts,
    });
  }
  const stabilization = stabilizeDailyRoutineBlocks(normalizedBlocks, {
    ageGroup: input.ageGroup,
    arrivalStartTime: input.constraints?.arrivalStartTime || null,
    pickupCutoffTime: input.constraints?.pickupCutoffTime || null,
  });
  const combinedNormalizationWarnings = [
    ...stabilization.warnings,
    ...policyConflicts,
  ];
  const timingDiagnostics = {
    gapsFilled: extractGapsFilledCount(stabilization.warnings),
    overlongToiletCapped:
      (toiletPolicyOutcome.toiletCappedCount || 0) + (anchorPolicyOutcome.toiletCappedCount || 0),
  };
  const initialCoverage = computeCapsCoverage(stabilization.blocks);
  const correctedBlocks = applyCapsCoverageMetadata(stabilization.blocks, initialCoverage);
  const finalCoverage = computeCapsCoverage(correctedBlocks);
  if (__DEV__) {
    console.log('[WeeklyProgramCopilot] after stabilization', {
      warnings: combinedNormalizationWarnings,
      metrics: stabilization.metrics,
      timingDiagnostics,
      anchorDiagnostics: anchorPolicyOutcome.anchorDiagnostics,
      timelineByDay: summarizeDayTimeline(correctedBlocks),
    });
  }
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
  if (toiletPolicyOutcome.policy.requiredPerDay > 0) {
    const anchorHints = [
      toiletPolicyOutcome.policy.beforeBreakfast ? 'before breakfast' : null,
      toiletPolicyOutcome.policy.beforeLunch ? 'before lunch' : null,
      toiletPolicyOutcome.policy.beforeNap ? 'before nap/quiet time' : null,
    ].filter(Boolean);
    assumptionSummary.push(
      `Toilet routine requirement: at least ${toiletPolicyOutcome.policy.requiredPerDay} per weekday${anchorHints.length > 0 ? ` (${anchorHints.join(', ')})` : ''}.`,
    );
  }
  if (toiletPolicyOutcome.policy.maxDurationMinutes != null) {
    assumptionSummary.push(
      `Toilet max duration parsed from preflight: ${toiletPolicyOutcome.policy.maxDurationMinutes} minutes.`,
    );
  }
  if (toiletPolicyOutcome.insertedCount > 0) {
    assumptionSummary.push(
      `Auto-enforced toilet routines: inserted ${toiletPolicyOutcome.insertedCount} block(s) across day(s) ${toiletPolicyOutcome.adjustedDays.join(', ')} to satisfy preflight constraints.`,
    );
  }
  if (anchorPolicyOutcome.policy.anchors.length > 0) {
    assumptionSummary.push(
      `Anchor locks detected: ${anchorPolicyOutcome.policy.anchors
        .map((anchor) => `${anchor.label} ${anchor.startTime}`)
        .join('; ')}`,
    );
  }
  if (anchorPolicyOutcome.appliedCount > 0) {
    assumptionSummary.push(
      `Anchor enforcement applied ${anchorPolicyOutcome.appliedCount} time(s) across weekdays (${anchorPolicyOutcome.insertedCount} anchor block(s) added).`,
    );
  }
  if (anchorPolicyOutcome.policy.toiletMaxDurationMinutes != null) {
    assumptionSummary.push(
      `Toilet duration cap enforced at ${anchorPolicyOutcome.policy.toiletMaxDurationMinutes} minutes per timed block.`,
    );
  }
  if (timingDiagnostics.overlongToiletCapped > 0) {
    assumptionSummary.push(
      `Toilet duration caps applied to ${timingDiagnostics.overlongToiletCapped} block(s).`,
    );
  }
  if (modelUsed) {
    assumptionSummary.push(`AI model used: ${modelUsed}`);
  }
  if (combinedNormalizationWarnings.length > 0) {
    assumptionSummary.push(
      `Normalization warnings: ${combinedNormalizationWarnings.join(' | ')}`,
    );
  }
  assumptionSummary.push(
    `Normalization metrics: overlaps resolved=${stabilization.metrics.overlapsResolved}, deduped blocks=${stabilization.metrics.dedupedBlocks}, anchor locks=${stabilization.metrics.anchorLocksApplied}.`,
  );

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
      modelUsed: modelUsed || null,
      capsCoverage: finalCoverage,
      normalizationWarnings: combinedNormalizationWarnings,
      normalizationMetrics: stabilization.metrics,
      anchorDiagnostics: anchorPolicyOutcome.anchorDiagnostics,
      policyConflicts,
      timingDiagnostics,
    },
    blocks: correctedBlocks,
  };
};

export class WeeklyProgramCopilotService {
  static async generateWeeklyProgramFromTerm(
    input: GenerateWeeklyProgramFromTermInput,
  ): Promise<WeeklyProgramDraft> {
    const supabase = assertSupabase();
    const completionInsights = await getCompletionInsightSummary(input.preschoolId);
    const completionInsightText =
      completionInsights.topDomains.length > 0
        ? `Recent completion insights (last 30 days): total=${completionInsights.totalCompletions}, avgScore=${completionInsights.avgScore ?? 'n/a'}, topDomains=${completionInsights.topDomains
            .map((domain) => `${domain.domain}:${domain.count} (${domain.avgScore ?? 'n/a'}%)`)
            .join('; ')}. Use this to reinforce weaker domains while maintaining balanced coverage.`
        : 'Recent completion insights unavailable; maintain balanced reinforcement across Home Language, Mathematics, and Life Skills.';
    const prompt = `${buildPrompt(input, parseToiletRoutinePolicy(input))}\n${completionInsightText}`;

    const { data, error } = await supabase.functions.invoke('ai-proxy', {
      body: {
        service_type: 'lesson_generation',
        payload: {
          prompt,
        },
        // Prefer Anthropic first for stricter instruction-following on
        // non-negotiable routine anchors. ai-proxy still cross-falls back.
        prefer_openai: false,
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
      if (__DEV__) {
        console.warn('[WeeklyProgramCopilot] AI generation failed:', { raw: detailedMessage || error });
      }
      throw new Error(combinedMessage);
    }

    const content = extractAIContent(data);
    const modelUsed =
      data && typeof data === 'object' && typeof (data as Record<string, unknown>).model === 'string'
        ? String((data as Record<string, unknown>).model)
        : null;

    const parsed = extractJson(content);
    if (parsed) {
      return normalizeAIResponse(parsed, input, modelUsed);
    }

    const repaired = await repairWeeklyProgramJson(
      supabase as unknown as SupabaseFunctionsClient,
      content,
    );
    if (repaired) {
      if (__DEV__) {
        console.log('[WeeklyProgramCopilot] Successfully repaired non-JSON AI output');
      }
      return normalizeAIResponse(repaired, input, modelUsed);
    }

    if (__DEV__) {
      console.warn('[WeeklyProgramCopilot] Non-JSON AI output after repair attempt', {
        chars: content.length,
        preview: content.slice(0, 500),
      });
    }

    throw new Error(
      'Unable to generate program. The AI returned an unexpected format. Please try again.',
    );
  }

  // Compatibility alias for previous snake_case naming used in docs/plans.
  static async generate_weekly_program_from_term(
    input: GenerateWeeklyProgramFromTermInput,
  ): Promise<WeeklyProgramDraft> {
    return this.generateWeeklyProgramFromTerm(input);
  }
}
