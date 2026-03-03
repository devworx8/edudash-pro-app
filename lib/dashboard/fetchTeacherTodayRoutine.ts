import { assertSupabase } from '@/lib/supabase';
import { logError } from '@/lib/debug';
import type { TeacherDashboardData, TeacherRoutineSnapshot } from '@/types/dashboard';

type TeacherRoutineBundle = {
  todayRoutine: TeacherDashboardData['todayRoutine'];
  schoolWideRoutine: TeacherDashboardData['schoolWideRoutine'];
  classRoutines: NonNullable<TeacherDashboardData['classRoutines']>;
};

const EMPTY_ROUTINE_BUNDLE: TeacherRoutineBundle = {
  todayRoutine: null,
  schoolWideRoutine: null,
  classRoutines: [],
};

function toDateOnlyUTC(value: Date): string {
  return value.toISOString().split('T')[0];
}

function getDayOfWeekMondayFirst(value: Date): number {
  const day = value.getDay();
  return day === 0 ? 7 : day;
}

function normalizeTimeValue(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function parseTimeToMinutes(value: unknown): number | null {
  const normalized = normalizeTimeValue(value);
  if (!normalized) return null;
  const [hours, minutes] = normalized.split(':').map(Number);
  return hours * 60 + minutes;
}

function getProgramStatusScore(value: unknown): number {
  const status = String(value || '').toLowerCase();
  if (status === 'published') return 50;
  if (status === 'approved') return 40;
  if (status === 'submitted') return 30;
  if (status === 'draft') return 20;
  return 10;
}

function routinePriorityScore(row: Record<string, unknown>): number {
  return getProgramStatusScore(row.status) + (row.class_id ? 5 : 0);
}

function compareRoutineRows(a: Record<string, unknown>, b: Record<string, unknown>): number {
  const aScore = routinePriorityScore(a);
  const bScore = routinePriorityScore(b);
  if (aScore !== bScore) return bScore - aScore;
  const aUpdated = new Date(String(a.updated_at || a.created_at || 0)).getTime();
  const bUpdated = new Date(String(b.updated_at || b.created_at || 0)).getTime();
  return bUpdated - aUpdated;
}

function mapRoutineRowToSnapshot(
  row: Record<string, unknown>,
  dayOfWeek: number,
  dayBlocks: Array<Record<string, unknown>>,
): TeacherRoutineSnapshot {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const blocks = dayBlocks.map((block) => ({
    id: String(block.id || ''),
    title: String(block.title || 'Routine block'),
    blockType: String(block.block_type || 'learning'),
    startTime: normalizeTimeValue(block.start_time),
    endTime: normalizeTimeValue(block.end_time),
  }));

  const nextBlock = blocks.find((block) => {
    const startMinutes = parseTimeToMinutes(block.startTime);
    return startMinutes !== null && startMinutes >= nowMinutes;
  }) || null;

  return {
    weeklyProgramId: String(row.id || ''),
    classId: row.class_id ? String(row.class_id) : null,
    termId: row.term_id ? String(row.term_id) : null,
    themeId: row.theme_id ? String(row.theme_id) : null,
    title: row.title ? String(row.title) : null,
    summary: row.summary ? String(row.summary) : null,
    weekStartDate: String(row.week_start_date || ''),
    weekEndDate: String(row.week_end_date || ''),
    dayOfWeek,
    blockCount: blocks.length,
    nextBlockTitle: nextBlock?.title || null,
    nextBlockStart: nextBlock?.startTime || null,
    blocks,
  };
}

export async function fetchTodayRoutine(
  schoolId: string,
  classIds: string[]
): Promise<TeacherRoutineBundle> {
  const supabase = assertSupabase();
  const now = new Date();
  const today = toDateOnlyUTC(now);
  const dayOfWeek = getDayOfWeekMondayFirst(now);

  let programsQuery: any = supabase
    .from('weekly_programs')
    .select(
      'id, class_id, term_id, theme_id, title, summary, week_start_date, week_end_date, status, published_at, created_at, updated_at'
    )
    .eq('preschool_id', schoolId);

  if (typeof programsQuery?.lte === 'function' && typeof programsQuery?.gte === 'function') {
    programsQuery = programsQuery.lte('week_start_date', today).gte('week_end_date', today);
  }
  if (typeof programsQuery?.order === 'function') {
    programsQuery = programsQuery.order('published_at', { ascending: false, nullsFirst: false });
  }
  if (typeof programsQuery?.order === 'function') {
    programsQuery = programsQuery.order('updated_at', { ascending: false });
  }

  const { data: programRows, error: programsError } = await programsQuery;

  if (programsError) {
    logError('Today routine programs fetch error:', programsError);
    return EMPTY_ROUTINE_BUNDLE;
  }

  const candidates = (programRows || []).filter((row: Record<string, unknown>) => {
    const classId = row.class_id ? String(row.class_id) : null;
    const weekStart = String(row.week_start_date || '');
    const weekEnd = String(row.week_end_date || '');
    const inCurrentWeek = !!weekStart && !!weekEnd && weekStart <= today && weekEnd >= today;
    return inCurrentWeek && (!classId || classIds.includes(classId));
  });

  if (candidates.length === 0) {
    return EMPTY_ROUTINE_BUNDLE;
  }

  candidates.sort(compareRoutineRows);
  const candidateIds = candidates.map((row: Record<string, unknown>) => String(row.id || '')).filter(Boolean);

  const { data: blockRows, error: blocksError } = await supabase
    .from('daily_program_blocks')
    .select('id, weekly_program_id, title, block_type, start_time, end_time, day_of_week, block_order')
    .in('weekly_program_id', candidateIds)
    .eq('day_of_week', dayOfWeek)
    .order('block_order', { ascending: true });

  if (blocksError) {
    logError('Today routine blocks fetch error:', blocksError);
    return EMPTY_ROUTINE_BUNDLE;
  }

  const blocksByProgramId = new Map<string, Array<Record<string, unknown>>>();
  for (const row of (blockRows || []) as Array<Record<string, unknown>>) {
    const programId = String(row.weekly_program_id || '');
    if (!programId) continue;
    const list = blocksByProgramId.get(programId) || [];
    list.push(row);
    blocksByProgramId.set(programId, list);
  }

  const routineByProgramId = new Map<string, TeacherRoutineSnapshot>();
  for (const row of candidates) {
    const programId = String(row.id || '');
    if (!programId) continue;
    const dayBlocks = (blocksByProgramId.get(programId) || [])
      .slice()
      .sort((a, b) => Number(a.block_order || 0) - Number(b.block_order || 0));
    routineByProgramId.set(programId, mapRoutineRowToSnapshot(row, dayOfWeek, dayBlocks));
  }

  const classRoutineRows = candidates.filter((row: Record<string, unknown>) => {
    const classId = row.class_id ? String(row.class_id) : null;
    return !!classId && classIds.includes(classId);
  });
  const schoolWideRoutineRow =
    candidates.find((row: Record<string, unknown>) => !row.class_id) || null;

  const classRoutines = classRoutineRows
    .map((row: Record<string, unknown>) => routineByProgramId.get(String(row.id || '')))
    .filter(Boolean) as TeacherRoutineSnapshot[];

  const schoolWideRoutine = schoolWideRoutineRow
    ? routineByProgramId.get(String(schoolWideRoutineRow.id || '')) || null
    : null;

  const todayRoutine =
    classRoutines[0] ||
    schoolWideRoutine ||
    routineByProgramId.get(String(candidates[0]?.id || '')) ||
    null;

  return {
    todayRoutine,
    schoolWideRoutine,
    classRoutines,
  };
}
