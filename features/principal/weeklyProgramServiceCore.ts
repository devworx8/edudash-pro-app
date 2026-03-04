import { Platform } from 'react-native';
import { assertSupabase } from '@/lib/supabase';
import type { DailyProgramBlock, WeeklyProgramDraft } from '@/types/ecd-planning';
import { fetchThemeForWeek } from '@/lib/services/curriculumThemeService';
import { stabilizeDailyRoutineBlocks } from '@/lib/routines/dailyRoutineNormalization';

export interface ProgramTimeRules {
  arrivalStartTime: string;
  arrivalCutoffTime: string;
  pickupStartTime: string;
  pickupCutoffTime: string;
}

export interface ShareWeeklyProgramInput {
  weeklyProgramId: string;
  preschoolId: string;
  sharedBy: string;
  rules: ProgramTimeRules;
  teacherUserIds?: string[];
}

export type WeeklyProgramShareAudience = 'parents' | 'teachers';

export interface SaveWeeklyProgramInput {
  weeklyProgram: WeeklyProgramDraft;
  rules?: ProgramTimeRules | null;
}

export interface DeleteWeeklyProgramInput {
  weeklyProgramId: string;
  preschoolId: string;
}

const DAY_LABELS: Record<number, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
};
const WEEKDAY_SEQUENCE = [1, 2, 3, 4, 5] as const;
const MIN_WEEKDAY_END_MINUTES = 13 * 60 + 30; // 13:30 hard floor

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function startOfWeekMonday(value: string): string {
  const date = new Date(`${String(value || '').slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid week start date');
  }

  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + offset);
  return toDateOnly(date);
}

function addDays(dateLike: string, days: number): string {
  const date = new Date(`${dateLike}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateOnly(date);
}

function normalizeTime(value: string): string | null {
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

function toMinutes(value: string): number | null {
  const normalized = normalizeTime(value);
  if (!normalized) return null;
  const [hours, minutes] = normalized.split(':').map((part) => Number(part));
  return hours * 60 + minutes;
}

function toHHMM(totalMinutes: number): string {
  const safe = Math.max(0, Math.min((23 * 60) + 59, Math.round(totalMinutes)));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function formatDateRange(weekStartDate: string): string {
  const start = new Date(`${weekStartDate}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 4);
  const startLabel = start.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
  const endLabel = end.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
  return `${startLabel} - ${endLabel}`;
}

function formatFilledDays(days: number[]): string {
  return days
    .filter((day, index, arr) => arr.indexOf(day) === index)
    .map((day) => DAY_LABELS[day] || `Day ${day}`)
    .join(', ');
}

function createFallbackWeekdayBlock(day: number): DailyProgramBlock {
  return {
    day_of_week: Math.min(7, Math.max(1, day)) as 1 | 2 | 3 | 4 | 5 | 6 | 7,
    block_order: 1,
    block_type: 'transition',
    title: `${DAY_LABELS[day] || 'Weekday'} Routine Starter`,
    start_time: null,
    end_time: null,
    objectives: ['Predictable classroom routine'],
    materials: ['Routine chart'],
    transition_cue: 'Welcome learners, review the routine, and transition into the day.',
    notes: 'Auto-added to keep Monday-Friday coverage complete when a day is missing.',
    parent_tip: null,
  };
}

function cloneDayBlocks(day: number, sourceDay: number, sourceBlocks: DailyProgramBlock[]): DailyProgramBlock[] {
  const sourceLabel = DAY_LABELS[sourceDay] || 'another day';
  const targetLabel = DAY_LABELS[day] || 'this day';

  return sourceBlocks
    .slice()
    .sort((a, b) => a.block_order - b.block_order)
    .map((block, index) => {
      const noteParts = [String(block.notes || '').trim()];
      noteParts.push(`Auto-filled from ${sourceLabel} because ${targetLabel} was missing.`);

      return {
        ...block,
        id: undefined,
        day_of_week: day as 1 | 2 | 3 | 4 | 5 | 6 | 7,
        block_order: index + 1,
        notes: noteParts.filter(Boolean).join(' '),
      };
    });
}

function findNearestSourceDay(
  groupedByDay: Map<number, DailyProgramBlock[]>,
  day: number,
): number | null {
  for (let distance = 1; distance <= 4; distance += 1) {
    const previous = day - distance;
    if (previous >= 1 && previous <= 5 && (groupedByDay.get(previous) || []).length > 0) {
      return previous;
    }

    const next = day + distance;
    if (next >= 1 && next <= 5 && (groupedByDay.get(next) || []).length > 0) {
      return next;
    }
  }
  return null;
}

function ensureWeekdayCoverage(blocks: DailyProgramBlock[]): { blocks: DailyProgramBlock[]; filledDays: number[] } {
  const groupedByDay = new Map<number, DailyProgramBlock[]>();
  for (let day = 1; day <= 7; day += 1) groupedByDay.set(day, []);

  for (const block of blocks) {
    const day = Math.min(7, Math.max(1, Number(block.day_of_week) || 1));
    groupedByDay.get(day)?.push({
      ...block,
      day_of_week: day as 1 | 2 | 3 | 4 | 5 | 6 | 7,
    });
  }

  const filledDays: number[] = [];
  for (const day of WEEKDAY_SEQUENCE) {
    const current = groupedByDay.get(day) || [];
    if (current.length > 0) continue;

    const sourceDay = findNearestSourceDay(groupedByDay, day);
    if (sourceDay !== null) {
      groupedByDay.set(day, cloneDayBlocks(day, sourceDay, groupedByDay.get(sourceDay) || []));
    } else {
      groupedByDay.set(day, [createFallbackWeekdayBlock(day)]);
    }
    filledDays.push(day);
  }

  const normalized: DailyProgramBlock[] = [];
  for (let day = 1; day <= 7; day += 1) {
    const dayBlocks = (groupedByDay.get(day) || [])
      .slice()
      .sort((a, b) => a.block_order - b.block_order)
      .map((block, index) => ({
        ...block,
        day_of_week: day as 1 | 2 | 3 | 4 | 5 | 6 | 7,
        block_order: index + 1,
      }));
    normalized.push(...dayBlocks);
  }

  return {
    blocks: normalized.sort((a, b) =>
      a.day_of_week === b.day_of_week ? a.block_order - b.block_order : a.day_of_week - b.day_of_week,
    ),
    filledDays,
  };
}

function ensureMinimumWeekdayEndCoverage(blocks: DailyProgramBlock[]): {
  blocks: DailyProgramBlock[];
  extendedDays: number[];
} {
  const groupedByDay = new Map<number, DailyProgramBlock[]>();
  for (let day = 1; day <= 7; day += 1) groupedByDay.set(day, []);

  for (const block of blocks) {
    const day = Math.min(7, Math.max(1, Number(block.day_of_week) || 1));
    groupedByDay.get(day)?.push({
      ...block,
      day_of_week: day as 1 | 2 | 3 | 4 | 5 | 6 | 7,
    });
  }

  const extendedDays: number[] = [];
  for (const day of WEEKDAY_SEQUENCE) {
    const dayBlocks = (groupedByDay.get(day) || [])
      .slice()
      .sort((a, b) => a.block_order - b.block_order);

    let latestEnd: number | null = null;
    for (const block of dayBlocks) {
      const end = block.end_time ? toMinutes(String(block.end_time)) : null;
      if (end !== null && (latestEnd === null || end > latestEnd)) {
        latestEnd = end;
      }
    }

    if (latestEnd !== null && latestEnd >= MIN_WEEKDAY_END_MINUTES) {
      groupedByDay.set(day, dayBlocks);
      continue;
    }

    const startMinutes = latestEnd ?? Math.max(0, MIN_WEEKDAY_END_MINUTES - 45);
    const endMinutes = MIN_WEEKDAY_END_MINUTES;
    const nextOrder = dayBlocks.length > 0
      ? Math.max(...dayBlocks.map((block) => Number(block.block_order) || 0)) + 1
      : 1;

    dayBlocks.push({
      day_of_week: day as 1 | 2 | 3 | 4 | 5 | 6 | 7,
      block_order: nextOrder,
      block_type: 'transition',
      title: 'Afternoon Close & Dismissal Preparation',
      start_time: toHHMM(startMinutes),
      end_time: toHHMM(endMinutes),
      objectives: ['End-of-day reflection', 'Orderly dismissal preparation'],
      materials: ['Bags and attendance register'],
      transition_cue: 'Pack away, review the day briefly, and prepare for pickup.',
      notes: 'Auto-added to enforce full-day coverage through at least 13:30.',
      parent_tip: null,
    });

    groupedByDay.set(day, dayBlocks);
    extendedDays.push(day);
  }

  const normalized: DailyProgramBlock[] = [];
  for (let day = 1; day <= 7; day += 1) {
    const dayBlocks = (groupedByDay.get(day) || [])
      .slice()
      .sort((a, b) => a.block_order - b.block_order)
      .map((block, index) => ({
        ...block,
        day_of_week: day as 1 | 2 | 3 | 4 | 5 | 6 | 7,
        block_order: index + 1,
      }));
    normalized.push(...dayBlocks);
  }

  return {
    blocks: normalized.sort((a, b) =>
      a.day_of_week === b.day_of_week ? a.block_order - b.block_order : a.day_of_week - b.day_of_week,
    ),
    extendedDays,
  };
}

function normalizeBlocksWithCoverage(
  blocks: DailyProgramBlock[],
  options?: {
    ageGroup?: string | null;
    rules?: ProgramTimeRules | null;
  },
): {
  blocks: DailyProgramBlock[];
  filledDays: number[];
  extendedDays: number[];
  normalizationWarnings: string[];
  normalizationMetrics: {
    overlapsResolved: number;
    dedupedBlocks: number;
    anchorLocksApplied: number;
  };
} {
  const normalized = (blocks || [])
    .map((block, index) => {
      const day = Math.min(7, Math.max(1, Number(block.day_of_week) || 1)) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
      const order = Math.max(1, Number(block.block_order) || index + 1);

      return {
        day_of_week: day,
        block_order: order,
        block_type: block.block_type || 'learning',
        title: String(block.title || '').trim() || `Program Block ${order}`,
        start_time: normalizeTime(String(block.start_time || '')),
        end_time: normalizeTime(String(block.end_time || '')),
        objectives: Array.isArray(block.objectives) ? block.objectives : [],
        materials: Array.isArray(block.materials) ? block.materials : [],
        transition_cue: block.transition_cue || null,
        notes: block.notes || null,
        parent_tip: block.parent_tip || null,
      };
    })
    .sort((a, b) => (a.day_of_week === b.day_of_week ? a.block_order - b.block_order : a.day_of_week - b.day_of_week));

  const withWeekdayCoverage = ensureWeekdayCoverage(normalized);
  const withMinimumEndCoverage = ensureMinimumWeekdayEndCoverage(withWeekdayCoverage.blocks);
  const stabilization = stabilizeDailyRoutineBlocks(withMinimumEndCoverage.blocks, {
    ageGroup: options?.ageGroup || null,
    arrivalStartTime: options?.rules?.arrivalStartTime || null,
    pickupCutoffTime: options?.rules?.pickupCutoffTime || null,
  });
  return {
    blocks: stabilization.blocks,
    filledDays: withWeekdayCoverage.filledDays,
    extendedDays: withMinimumEndCoverage.extendedDays,
    normalizationWarnings: stabilization.warnings,
    normalizationMetrics: stabilization.metrics,
  };
}

function validateRules(rules: ProgramTimeRules): { normalized: ProgramTimeRules; issues: string[] } {
  const normalized = {
    arrivalStartTime: normalizeTime(rules.arrivalStartTime) || '',
    arrivalCutoffTime: normalizeTime(rules.arrivalCutoffTime) || '',
    pickupStartTime: normalizeTime(rules.pickupStartTime) || '',
    pickupCutoffTime: normalizeTime(rules.pickupCutoffTime) || '',
  };

  const issues: string[] = [];

  if (!normalized.arrivalStartTime) issues.push('Arrival start time must be in HH:MM format.');
  if (!normalized.arrivalCutoffTime) issues.push('Arrival cutoff time must be in HH:MM format.');
  if (!normalized.pickupStartTime) issues.push('Pickup start time must be in HH:MM format.');
  if (!normalized.pickupCutoffTime) issues.push('Pickup cutoff time must be in HH:MM format.');

  const arrivalStart = toMinutes(normalized.arrivalStartTime);
  const arrivalCutoff = toMinutes(normalized.arrivalCutoffTime);
  const pickupStart = toMinutes(normalized.pickupStartTime);
  const pickupCutoff = toMinutes(normalized.pickupCutoffTime);

  if (arrivalStart !== null && arrivalCutoff !== null && arrivalStart >= arrivalCutoff) {
    issues.push('Arrival start time must be earlier than arrival cutoff time.');
  }

  if (pickupStart !== null && pickupCutoff !== null && pickupStart >= pickupCutoff) {
    issues.push('Pickup start time must be earlier than pickup cutoff time.');
  }

  if (arrivalCutoff !== null && pickupStart !== null && arrivalCutoff >= pickupStart) {
    issues.push('Pickup window must begin after arrival cutoff.');
  }

  if (pickupCutoff !== null && pickupCutoff < MIN_WEEKDAY_END_MINUTES) {
    issues.push('Pickup cutoff must be 13:30 or later so the full-day program is not truncated.');
  }

  return { normalized, issues };
}

function validateBlocksAgainstRules(blocks: DailyProgramBlock[], rules: ProgramTimeRules): string[] {
  const issues: string[] = [];

  const arrivalStart = toMinutes(rules.arrivalStartTime);
  const arrivalCutoff = toMinutes(rules.arrivalCutoffTime);
  const pickupCutoff = toMinutes(rules.pickupCutoffTime);

  if (arrivalStart === null || arrivalCutoff === null || pickupCutoff === null) {
    return ['Time rules are incomplete and could not be validated.'];
  }

  const starts: number[] = [];
  const ends: number[] = [];
  const latestEndByDay = new Map<number, number | null>();
  for (const day of WEEKDAY_SEQUENCE) {
    latestEndByDay.set(day, null);
  }

  for (const block of blocks) {
    const start = block.start_time ? toMinutes(String(block.start_time)) : null;
    const end = block.end_time ? toMinutes(String(block.end_time)) : null;

    if (start !== null) starts.push(start);
    if (end !== null) ends.push(end);
    const day = Number(block.day_of_week);
    if (end !== null && day >= 1 && day <= 5) {
      const current = latestEndByDay.get(day) ?? null;
      if (current === null || end > current) {
        latestEndByDay.set(day, end);
      }
    }

    if (start !== null && end !== null && start >= end) {
      issues.push(`${DAY_LABELS[block.day_of_week]} block \"${block.title}\" has an invalid time range.`);
    }

    if (start !== null && start < arrivalStart) {
      issues.push(`${DAY_LABELS[block.day_of_week]} block \"${block.title}\" starts before arrival window.`);
    }

    if (end !== null && end > pickupCutoff) {
      issues.push(`${DAY_LABELS[block.day_of_week]} block \"${block.title}\" ends after pickup cutoff.`);
    }
  }

  if (starts.length > 0) {
    const earliest = Math.min(...starts);
    if (earliest > arrivalCutoff) {
      issues.push('First program activity starts after the arrival cutoff.');
    }
  }

  if (ends.length > 0) {
    const latest = Math.max(...ends);
    if (latest > pickupCutoff) {
      issues.push('Latest program activity ends after the pickup cutoff.');
    }
  }

  for (const day of WEEKDAY_SEQUENCE) {
    const latestEnd = latestEndByDay.get(day) ?? null;
    if (latestEnd === null) {
      issues.push(`${DAY_LABELS[day]} has no valid end time. Every day must run until at least 13:30.`);
      continue;
    }
    if (latestEnd < MIN_WEEKDAY_END_MINUTES) {
      issues.push(`${DAY_LABELS[day]} ends at ${toHHMM(latestEnd)}. Every day must run until at least 13:30.`);
    }
  }

  return issues;
}

function renderParentSummary(params: {
  program: any;
  blocks: DailyProgramBlock[];
  rules: ProgramTimeRules;
}): string {
  const { program, blocks, rules } = params;
  const lines: string[] = [];

  lines.push(`Daily Routine Program (${formatDateRange(program.week_start_date)})`);
  lines.push('');
  lines.push(`Strict arrival window: ${rules.arrivalStartTime} - ${rules.arrivalCutoffTime}`);
  lines.push(`Strict pickup window: ${rules.pickupStartTime} - ${rules.pickupCutoffTime}`);
  lines.push('Learners arriving after cutoff require front-office check-in.');
  lines.push('Pickup after cutoff requires prior written approval.');
  lines.push('');

  for (let day = 1; day <= 5; day += 1) {
    const dayBlocks = blocks.filter((block) => block.day_of_week === day);
    if (dayBlocks.length === 0) continue;

    lines.push(DAY_LABELS[day]);

    for (const block of dayBlocks) {
      const timeLabel = block.start_time && block.end_time
        ? `${block.start_time} - ${block.end_time}`
        : block.start_time
          ? `${block.start_time}`
          : 'Time TBD';

      lines.push(`- ${timeLabel}: ${block.title}`);
    }

    lines.push('');
  }

  lines.push('Please follow the arrival and pickup windows strictly to protect class flow and safety.');
  return lines.join('\n');
}

function renderStaffSummary(params: {
  program: any;
  blocks: DailyProgramBlock[];
  rules: ProgramTimeRules;
}): string {
  const { program, blocks, rules } = params;
  const lines: string[] = [];

  lines.push(`Teacher Routine Brief (${formatDateRange(program.week_start_date)})`);
  lines.push('');
  lines.push(`Arrival control window: ${rules.arrivalStartTime} - ${rules.arrivalCutoffTime}`);
  lines.push(`Pickup control window: ${rules.pickupStartTime} - ${rules.pickupCutoffTime}`);
  lines.push('Please keep transitions tight and escalate late arrivals/pickups to front-office protocol.');
  lines.push('');

  for (let day = 1; day <= 5; day += 1) {
    const dayBlocks = blocks.filter((block) => block.day_of_week === day);
    if (dayBlocks.length === 0) continue;

    lines.push(DAY_LABELS[day]);
    for (const block of dayBlocks) {
      const timeLabel = block.start_time && block.end_time
        ? `${block.start_time} - ${block.end_time}`
        : block.start_time
          ? `${block.start_time}`
          : 'Time TBD';
      lines.push(`- ${timeLabel}: ${block.title}`);
    }
    lines.push('');
  }

  lines.push('This routine is now active for classroom execution.');
  return lines.join('\n');
}

export class WeeklyProgramService {
  static startOfWeekMonday = startOfWeekMonday;

  static validateProgramTimeRules(rules: ProgramTimeRules): { normalized: ProgramTimeRules; issues: string[] } {
    return validateRules(rules);
  }

  /** Get the most recent weekly program for an organization (for teacher lesson alignment) */
  static async getActiveWeeklyProgramForOrganization(preschoolId: string): Promise<WeeklyProgramDraft | null> {
    const programs = await this.listWeeklyPrograms({ preschoolId, limit: 1 });
    return programs[0] ?? null;
  }

  /** Format weekly program as context string for lesson generation alignment */
  static formatRoutineForLessonContext(program: WeeklyProgramDraft): string {
    const blocks = (program.blocks || []).filter((b) => {
      const d = Math.min(7, Math.max(1, Number(b.day_of_week) || 1));
      return d >= 1 && d <= 5;
    });
    const byDay = new Map<number, typeof blocks>();
    for (const b of blocks) {
      const d = Math.min(7, Math.max(1, Number(b.day_of_week) || 1)) as 1 | 2 | 3 | 4 | 5;
      const list = byDay.get(d) || [];
      list.push(b);
      byDay.set(d, list);
    }
    for (const [day, list] of byDay) {
      byDay.set(day, list.sort((a, b) => (a.block_order || 0) - (b.block_order || 0)));
    }
    const lines: string[] = [
      `Weekly Routine: ${program.title || 'Program'} (${program.week_start_date || ''} - ${program.week_end_date || ''})`,
      'Align your lesson with these blocks. Do not deviate from the routine structure.',
      '',
    ];
    for (let day = 1; day <= 5; day++) {
      const dayBlocks = byDay.get(day) || [];
      const label = DAY_LABELS[day] || `Day ${day}`;
      lines.push(`${label}:`);
      for (const b of dayBlocks) {
        const time = b.start_time && b.end_time ? `${b.start_time}-${b.end_time}` : 'TBD';
        lines.push(`  - ${time} [${b.block_type}]: ${b.title || 'Block'}`);
        if (Array.isArray(b.objectives) && b.objectives.length > 0) {
          lines.push(`    Objectives: ${b.objectives.join('; ')}`);
        }
      }
      lines.push('');
    }
    return lines.join('\n');
  }

  static async listWeeklyPrograms(params: {
    preschoolId: string;
    limit?: number;
  }): Promise<WeeklyProgramDraft[]> {
    const supabase = assertSupabase();
    const limit = Math.max(1, Math.min(100, Number(params.limit) || 20));

    const { data: programRows, error: programsError } = await supabase
      .from('weekly_programs')
      .select('*')
      .eq('preschool_id', params.preschoolId)
      .order('week_start_date', { ascending: false })
      .limit(limit);

    if (programsError) {
      throw new Error(programsError.message || 'Failed to load weekly programs');
    }

    const programs = (programRows || []) as any[];
    if (programs.length === 0) return [];

    const programIds = programs.map((program) => program.id);

    const { data: blockRows, error: blocksError } = await supabase
      .from('daily_program_blocks')
      .select('*')
      .in('weekly_program_id', programIds)
      .order('day_of_week', { ascending: true })
      .order('block_order', { ascending: true });

    if (blocksError) {
      throw new Error(blocksError.message || 'Failed to load daily program blocks');
    }

    const groupedBlocks = new Map<string, DailyProgramBlock[]>();

    for (const row of (blockRows || []) as any[]) {
      const programId = String(row.weekly_program_id || '');
      if (!programId) continue;
      const list = groupedBlocks.get(programId) || [];
      list.push({
        id: row.id,
        weekly_program_id: row.weekly_program_id,
        preschool_id: row.preschool_id,
        class_id: row.class_id,
        created_by: row.created_by,
        day_of_week: Number(row.day_of_week) as 1 | 2 | 3 | 4 | 5 | 6 | 7,
        block_order: Number(row.block_order) || 1,
        block_type: row.block_type,
        title: row.title,
        start_time: row.start_time,
        end_time: row.end_time,
        objectives: Array.isArray(row.objectives) ? row.objectives : [],
        materials: Array.isArray(row.materials) ? row.materials : [],
        transition_cue: row.transition_cue,
        notes: row.notes,
        parent_tip: row.parent_tip,
      });
      groupedBlocks.set(programId, list);
    }

    return programs.map((program) => {
      const rawProgramBlocks = groupedBlocks.get(program.id) || [];
      const { blocks: coveredBlocks } = normalizeBlocksWithCoverage(rawProgramBlocks, {
        ageGroup: program.age_group || null,
      });

      return {
        id: program.id,
        preschool_id: program.preschool_id,
        class_id: program.class_id,
        term_id: program.term_id,
        theme_id: program.theme_id,
        created_by: program.created_by,
        week_start_date: program.week_start_date,
        week_end_date: program.week_end_date,
        age_group: program.age_group,
        title: program.title,
        summary: program.summary,
        generated_by_ai: !!program.generated_by_ai,
        source: program.source || 'manual',
        status: program.status || 'draft',
        published_by: program.published_by,
        published_at: program.published_at,
        generation_context: (program as any).generation_context || null,
        blocks: coveredBlocks,
      };
    });
  }

  static async saveWeeklyProgram(input: SaveWeeklyProgramInput): Promise<WeeklyProgramDraft> {
    const supabase = assertSupabase();
    const weeklyProgram = input.weeklyProgram;

    const weekStartDate = startOfWeekMonday(weeklyProgram.week_start_date);
    const weekEndDate = addDays(weekStartDate, 4);
    const normalizedCoverage = normalizeBlocksWithCoverage(Array.isArray(weeklyProgram.blocks) ? weeklyProgram.blocks : [], {
      ageGroup: weeklyProgram.age_group || null,
      rules: input.rules || null,
    });
    const blocks = normalizedCoverage.blocks;
    const autoFilledDays = normalizedCoverage.filledDays;
    const extendedDays = normalizedCoverage.extendedDays;

    let themeId = weeklyProgram.theme_id || null;
    if (!themeId && weeklyProgram.preschool_id) {
      const theme = await fetchThemeForWeek(weeklyProgram.preschool_id, weekStartDate);
      if (theme) themeId = theme.id;
    }

    const basePayload = {
      preschool_id: weeklyProgram.preschool_id,
      class_id: weeklyProgram.class_id || null,
      term_id: weeklyProgram.term_id || null,
      theme_id: themeId,
      created_by: weeklyProgram.created_by,
      week_start_date: weekStartDate,
      week_end_date: weekEndDate,
      age_group: weeklyProgram.age_group || '3-6',
      title: weeklyProgram.title || 'Weekly Program',
      summary: weeklyProgram.summary || null,
      generated_by_ai: !!weeklyProgram.generated_by_ai,
      source: weeklyProgram.source || 'manual',
      status: weeklyProgram.status || 'draft',
    };

    const generationContextValue = {
      ...(weeklyProgram.generation_context || {}),
      normalizationWarnings: normalizedCoverage.normalizationWarnings,
      normalizationMetrics: normalizedCoverage.normalizationMetrics,
    };
    const withGenerationContext = {
      ...basePayload,
      generation_context: generationContextValue,
    };

    const withoutGenerationContext = {
      ...basePayload,
    };

    const isMissingGenerationContextColumn = (error: unknown): boolean => {
      const message = String((error as any)?.message || '').toLowerCase();
      const details = String((error as any)?.details || '').toLowerCase();
      return (
        (message.includes('generation_context') || details.includes('generation_context')) &&
        (
          message.includes('schema cache')
          || message.includes('could not find')
          || message.includes('column')
          || details.includes('schema cache')
          || details.includes('column')
        )
      );
    };

    const persistWeeklyProgram = async (payload: Record<string, unknown>): Promise<any> => {
      let saved: any = null;

      if (weeklyProgram.id) {
        const { data, error } = await supabase
          .from('weekly_programs')
          .update(payload)
          .eq('id', weeklyProgram.id)
          .select('*')
          .single();

        if (error || !data) {
          throw error || new Error('Failed to update weekly program');
        }
        saved = data;
      } else {
        const inserted = await supabase
          .from('weekly_programs')
          .insert(payload)
          .select('*')
          .single();

        if (inserted.error) {
          const isConflict = inserted.error.code === '23505';

          if (!isConflict) {
            throw inserted.error;
          }

          let existingQuery = supabase
            .from('weekly_programs')
            .select('*')
            .eq('preschool_id', weeklyProgram.preschool_id)
            .eq('week_start_date', weekStartDate)
            .order('updated_at', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(1);

          if (weeklyProgram.class_id) {
            existingQuery = existingQuery.eq('class_id', weeklyProgram.class_id);
          } else {
            existingQuery = existingQuery.is('class_id', null);
          }

          const { data: existingRows, error: existingError } = await existingQuery;
          const existing = Array.isArray(existingRows) ? existingRows[0] : null;

          if (existingError || !existing?.id) {
            throw existingError || inserted.error;
          }

          const { data: updatedExisting, error: updateError } = await supabase
            .from('weekly_programs')
            .update(payload)
            .eq('id', existing.id)
            .select('*')
            .single();

          if (updateError || !updatedExisting) {
            throw updateError || new Error('Failed to update existing weekly program');
          }

          saved = updatedExisting;
        } else {
          saved = inserted.data;
        }
      }

      return saved;
    };

    let savedProgram: any = null;
    let saveWarning: string | null = null;
    let autoFillWarning: string | null = null;
    let shortDayCoverageWarning: string | null = null;
    let usedFallbackWithoutGenerationContext = false;

    try {
      savedProgram = await persistWeeklyProgram(withGenerationContext);
    } catch (error) {
      if (!isMissingGenerationContextColumn(error)) {
        throw new Error((error as any)?.message || 'Failed to save weekly program');
      }

      console.warn('[weekly_program.save.retry_without_generation_context]', {
        weeklyProgramId: weeklyProgram.id || null,
        preschoolId: weeklyProgram.preschool_id,
      });

      try {
        savedProgram = await persistWeeklyProgram(withoutGenerationContext);
        usedFallbackWithoutGenerationContext = true;
        saveWarning =
          'Saved without preflight metadata because generation_context is not available in this database yet.';
        console.info('[weekly_program.save.retry_success]', {
          weeklyProgramId: savedProgram?.id || weeklyProgram.id || null,
          preschoolId: weeklyProgram.preschool_id,
        });
      } catch (retryError) {
        console.error('[weekly_program.save.retry_failed]', {
          weeklyProgramId: weeklyProgram.id || null,
          preschoolId: weeklyProgram.preschool_id,
          error: (retryError as any)?.message || 'retry_failed',
        });
        throw new Error((retryError as any)?.message || 'Failed to save weekly program');
      }
    }

    if (!savedProgram?.id) {
      throw new Error('Weekly program save failed unexpectedly');
    }

    if (autoFilledDays.length > 0) {
      autoFillWarning = `Auto-filled missing weekdays: ${formatFilledDays(autoFilledDays)}.`;
    }
    if (extendedDays.length > 0) {
      shortDayCoverageWarning = `Extended short weekdays to reach at least 13:30: ${formatFilledDays(extendedDays)}.`;
    }

    await supabase.from('daily_program_blocks').delete().eq('weekly_program_id', savedProgram.id);

    if (blocks.length > 0) {
      const blockRows = blocks.map((block) => ({
        weekly_program_id: savedProgram.id,
        preschool_id: weeklyProgram.preschool_id,
        class_id: weeklyProgram.class_id || null,
        created_by: weeklyProgram.created_by,
        day_of_week: block.day_of_week,
        block_order: block.block_order,
        block_type: block.block_type,
        title: block.title,
        start_time: block.start_time,
        end_time: block.end_time,
        objectives: block.objectives || [],
        materials: block.materials || [],
        transition_cue: block.transition_cue,
        notes: block.notes,
        parent_tip: block.parent_tip,
      }));

      const { error: blockError } = await supabase.from('daily_program_blocks').insert(blockRows);
      if (blockError) {
        throw new Error(blockError.message || 'Failed to save daily program blocks');
      }
    }

    const normalizationWarning = normalizedCoverage.normalizationWarnings.length > 0
      ? `Normalization applied: ${normalizedCoverage.normalizationWarnings.join(' | ')}`
      : null;
    const saveWarnings = [saveWarning, autoFillWarning, shortDayCoverageWarning, normalizationWarning].filter(Boolean) as string[];

    return {
      id: savedProgram.id,
      preschool_id: savedProgram.preschool_id,
      class_id: savedProgram.class_id,
      term_id: savedProgram.term_id,
      theme_id: savedProgram.theme_id,
      created_by: savedProgram.created_by,
      week_start_date: savedProgram.week_start_date,
      week_end_date: savedProgram.week_end_date,
      age_group: savedProgram.age_group,
      title: savedProgram.title,
      summary: savedProgram.summary,
      generated_by_ai: !!savedProgram.generated_by_ai,
      source: savedProgram.source || 'manual',
      status: savedProgram.status || 'draft',
      published_by: savedProgram.published_by,
      published_at: savedProgram.published_at,
      generation_context: usedFallbackWithoutGenerationContext ? null : (savedProgram.generation_context || null),
      save_warnings: saveWarnings.length > 0 ? saveWarnings : undefined,
      blocks,
    };
  }

  static async deleteWeeklyProgram(input: DeleteWeeklyProgramInput): Promise<void> {
    const supabase = assertSupabase();

    const weeklyProgramId = String(input.weeklyProgramId || '').trim();
    const preschoolId = String(input.preschoolId || '').trim();

    if (!weeklyProgramId || !preschoolId) {
      throw new Error('Missing weekly program context for delete');
    }

    const { data: existing, error: existingError } = await supabase
      .from('weekly_programs')
      .select('id')
      .eq('id', weeklyProgramId)
      .eq('preschool_id', preschoolId)
      .single();

    if (existingError || !existing?.id) {
      throw new Error(existingError?.message || 'Saved routine not found');
    }

    const { error: deleteError } = await supabase
      .from('weekly_programs')
      .delete()
      .eq('id', weeklyProgramId)
      .eq('preschool_id', preschoolId);

    if (deleteError) {
      throw new Error(deleteError.message || 'Failed to delete saved routine');
    }
  }

  private static async shareWeeklyProgramByAudience(
    input: ShareWeeklyProgramInput,
    audience: WeeklyProgramShareAudience,
  ): Promise<{ announcementId: string }> {
    const supabase = assertSupabase();

    const { normalized, issues: ruleIssues } = validateRules(input.rules);
    if (ruleIssues.length > 0) {
      throw new Error(ruleIssues.join('\n'));
    }

    const { data: programRow, error: programError } = await supabase
      .from('weekly_programs')
      .select('*')
      .eq('id', input.weeklyProgramId)
      .eq('preschool_id', input.preschoolId)
      .single();

    if (programError || !programRow) {
      throw new Error(programError?.message || 'Weekly program not found');
    }

    const { data: blockRows, error: blockError } = await supabase
      .from('daily_program_blocks')
      .select('*')
      .eq('weekly_program_id', input.weeklyProgramId)
      .order('day_of_week', { ascending: true })
      .order('block_order', { ascending: true });

    if (blockError) {
      throw new Error(blockError.message || 'Failed to load program blocks');
    }

    const normalizedCoverage = normalizeBlocksWithCoverage((blockRows || []) as DailyProgramBlock[], {
      ageGroup: programRow.age_group || null,
      rules: normalized,
    });
    const blocks = normalizedCoverage.blocks;
    const autoFilledDays = normalizedCoverage.filledDays;
    const extendedDays = normalizedCoverage.extendedDays;
    if (blocks.length === 0) {
      throw new Error('No daily program blocks found. Please generate or add routine blocks first.');
    }

    if (autoFilledDays.length > 0 || extendedDays.length > 0) {
      const healedRows = blocks.map((block) => ({
        weekly_program_id: input.weeklyProgramId,
        preschool_id: input.preschoolId,
        class_id: programRow.class_id || null,
        created_by: programRow.created_by || input.sharedBy || null,
        day_of_week: block.day_of_week,
        block_order: block.block_order,
        block_type: block.block_type,
        title: block.title,
        start_time: block.start_time || null,
        end_time: block.end_time || null,
        objectives: block.objectives || [],
        materials: block.materials || [],
        transition_cue: block.transition_cue || null,
        notes: block.notes || null,
        parent_tip: block.parent_tip || null,
      }));

      const { error: deleteError } = await supabase
        .from('daily_program_blocks')
        .delete()
        .eq('weekly_program_id', input.weeklyProgramId);

      if (deleteError) {
        console.warn('[weekly_program.share.coverage_delete_failed]', {
          weeklyProgramId: input.weeklyProgramId,
          missingDays: autoFilledDays,
          extendedDays,
          error: deleteError.message || 'delete_failed',
        });
      } else if (healedRows.length > 0) {
        const { error: healError } = await supabase.from('daily_program_blocks').insert(healedRows);
        if (healError) {
          console.warn('[weekly_program.share.coverage_insert_failed]', {
            weeklyProgramId: input.weeklyProgramId,
            missingDays: autoFilledDays,
            extendedDays,
            error: healError.message || 'insert_failed',
          });
        } else {
          console.info('[weekly_program.share.coverage_normalized]', {
            weeklyProgramId: input.weeklyProgramId,
            missingDays: autoFilledDays,
            extendedDays,
          });
        }
      } else {
        console.info('[weekly_program.share.coverage_no_rows_after_heal]', {
          weeklyProgramId: input.weeklyProgramId,
          missingDays: autoFilledDays,
          extendedDays,
        });
      }
    }

    const blockIssues = validateBlocksAgainstRules(blocks, normalized);
    if (blockIssues.length > 0) {
      throw new Error(blockIssues.join('\n'));
    }

    const weekStartDate = String(programRow.week_start_date || '').slice(0, 10);
    const dateRange = formatDateRange(weekStartDate);
    let classDisplayName: string | null = null;
    let classTeacherId: string | null = null;
    if (programRow.class_id) {
      const { data: classRow } = await supabase
        .from('classes')
        .select('name, teacher_id')
        .eq('id', String(programRow.class_id))
        .maybeSingle();
      classDisplayName = classRow?.name ? String(classRow.name) : null;
      classTeacherId = classRow?.teacher_id ? String(classRow.teacher_id) : null;
    }

    const normalizedTeacherUserIds = Array.from(
      new Set((input.teacherUserIds || []).map((id) => String(id || '').trim()).filter(Boolean)),
    );
    const teacherUserIds = audience === 'teachers'
      ? (normalizedTeacherUserIds.length > 0
        ? normalizedTeacherUserIds
        : classTeacherId
          ? [classTeacherId]
          : [])
      : [];

    if (audience === 'teachers' && programRow.class_id && teacherUserIds.length === 0) {
      throw new Error('This class has no assigned teacher yet. Assign a teacher to the class, then share again.');
    }

    const classTitleSuffix = classDisplayName ? ` • ${classDisplayName}` : '';
    const title = audience === 'teachers'
      ? `Teacher Routine${classTitleSuffix} • ${dateRange}`
      : `Daily Routine${classTitleSuffix} • ${dateRange}`;

    const summary = (audience === 'teachers' ? renderStaffSummary : renderParentSummary)({
      program: programRow,
      blocks,
      rules: normalized,
    });

    const attachments = [
      {
        kind: 'daily_program_structured',
        version: 1,
        weekly_program_id: input.weeklyProgramId,
        week_start_date: weekStartDate,
        week_end_date: String(programRow.week_end_date || '').slice(0, 10),
        age_group: programRow.age_group || null,
        title: programRow.title || null,
        summary: programRow.summary || null,
        strict_time_rules: normalized,
        days: blocks,
      },
    ];

    const { data: announcementRow, error: announcementError } = await supabase
      .from('announcements')
      .insert({
        preschool_id: input.preschoolId,
        author_id: input.sharedBy,
        title,
        content: summary,
        target_audience: audience,
        priority: 'medium',
        is_published: true,
        published_at: new Date().toISOString(),
        attachments,
      })
      .select('id')
      .single();

    if (announcementError || !announcementRow?.id) {
      throw new Error(announcementError?.message || 'Failed to share routine with parents');
    }

    const publishedAt = new Date().toISOString();
    const { data: publishedRow, error: publishError } = await supabase
      .from('weekly_programs')
      .update({
        status: 'published',
        published_by: input.sharedBy,
        published_at: publishedAt,
      })
      .eq('id', input.weeklyProgramId)
      .eq('preschool_id', input.preschoolId)
      .select('id, status, published_at')
      .single();
    if (publishError || !publishedRow?.id || String(publishedRow.status || '').toLowerCase() !== 'published') {
      throw new Error(publishError?.message || 'Failed to publish weekly routine');
    }

    try {
      const notificationFeature =
        audience === 'teachers' ? 'daily_program_share_teachers' : 'daily_program_share';
      const targetRoute =
        audience === 'teachers' ? '/screens/teacher-daily-program-planner' : '/screens/parent-daily-program';
      await supabase.functions.invoke('notifications-dispatcher', {
        body: {
          event_type: 'new_announcement',
          preschool_id: input.preschoolId,
          announcement_id: announcementRow.id,
          title,
          body: audience === 'teachers'
            ? 'New teacher routine brief is now active for classroom execution.'
            : 'New daily routine program shared with strict arrival and pickup windows.',
          target_audience: [audience],
          user_ids: audience === 'teachers' && teacherUserIds.length > 0 ? teacherUserIds : undefined,
          role_targets:
            audience === 'teachers'
              ? (programRow.class_id ? undefined : ['teacher'])
              : ['parent'],
          priority: audience === 'teachers' ? 'high' : 'medium',
          send_immediately: true,
          context: {
            feature: notificationFeature,
            weekly_program_id: input.weeklyProgramId,
            week_start_date: weekStartDate,
            class_id: programRow.class_id || null,
            navigate_to: targetRoute,
          },
          custom_payload: {
            type: 'announcement',
            feature: notificationFeature,
            screen: 'daily_program',
            navigate_to: targetRoute,
            weekly_program_id: input.weeklyProgramId,
            week_start_date: weekStartDate,
            class_id: programRow.class_id || null,
            announcement_id: announcementRow.id,
          },
          metadata: {
            feature: notificationFeature,
            weekly_program_id: input.weeklyProgramId,
            week_start_date: weekStartDate,
            platform: Platform.OS,
          },
        },
      });
    } catch {
      // Non-blocking notification dispatch.
    }

    return {
      announcementId: announcementRow.id,
    };
  }

  static async shareWeeklyProgramWithParents(input: ShareWeeklyProgramInput): Promise<{ announcementId: string }> {
    return this.shareWeeklyProgramByAudience(input, 'parents');
  }

  static async shareWeeklyProgramWithTeachers(input: ShareWeeklyProgramInput): Promise<{ announcementId: string }> {
    return this.shareWeeklyProgramByAudience(input, 'teachers');
  }
}
