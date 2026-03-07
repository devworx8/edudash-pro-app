/**
 * Server-only: fetch display data using a Supabase client (e.g. service role).
 * Used by GET /api/display/data and GET /api/display/preview.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  DisplayData,
  DisplayTodayRoutine,
  DisplayRoutineBlock,
  DisplayScheduledLesson,
  DisplayLessonWithDetails,
  DisplayMenuDay,
  DisplayAnnouncement,
  DisplayInsight,
} from '@/lib/display/types';
import { extractStepsFromContent, extractMediaFromContent } from '@/lib/display/parseLessonContent';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DEFAULT_ORG_TIMEZONE = 'Africa/Johannesburg';
const WEEKDAY_TO_MONDAY_FIRST: Record<string, number> = {
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
  sun: 7,
};

type ProgramRow = {
  id: string;
  class_id: string | null;
  title: string | null;
  summary: string | null;
  week_start_date: string;
  week_end_date: string;
  status: string | null;
  published_at: string | null;
  updated_at: string | null;
  created_at: string | null;
};

type BlockRow = {
  id: string;
  title: string;
  block_type: string | null;
  start_time: string | null;
  end_time: string | null;
  day_of_week: number;
  block_order: number;
};

type AssignmentRow = {
  id: string;
  lesson_id: string | null;
  class_id: string | null;
  due_date: string | null;
  assigned_at: string | null;
  notes: string | null;
  priority: string | null;
  status: string | null;
};

type LessonRow = {
  id: string;
  title: string;
  description: string | null;
  content: unknown;
  thumbnail_url: string | null;
  duration_minutes: number | null;
};

type ScheduledRow = {
  id: string;
  title: string;
  description: string | null;
  scheduled_at: string;
  duration_minutes: number | null;
  room_url: string | null;
  status: string;
};

type ManualLinkRow = {
  daily_program_block_id: string;
  lesson_id: string;
};

function toDateOnly(value: Date): string {
  return value.toISOString().split('T')[0];
}

function getDayOfWeekMondayFirst(value: Date): number {
  return value.getDay() === 0 ? 7 : value.getDay();
}

function isValidTimeZone(value: unknown): value is string {
  const timezone = String(value || '').trim();
  if (!timezone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function extractTimezoneFromSettings(settings: unknown): string | null {
  if (!settings || typeof settings !== 'object') return null;
  const timezone = (settings as Record<string, unknown>).timezone;
  return isValidTimeZone(timezone) ? String(timezone).trim() : null;
}

async function resolveOrgTimezone(
  supabase: SupabaseClient,
  orgId: string,
): Promise<string> {
  try {
    const { data: preschoolRow } = await supabase
      .from('preschools')
      .select('settings')
      .eq('id', orgId)
      .maybeSingle();

    const preschoolTimezone = extractTimezoneFromSettings((preschoolRow as { settings?: unknown } | null)?.settings);
    if (preschoolTimezone) return preschoolTimezone;

    const { data: organizationRow } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', orgId)
      .maybeSingle();

    const organizationTimezone = extractTimezoneFromSettings(
      (organizationRow as { settings?: unknown } | null)?.settings,
    );
    if (organizationTimezone) return organizationTimezone;
  } catch {
    // Non-fatal. Fall back to default timezone.
  }

  return DEFAULT_ORG_TIMEZONE;
}

function resolveCalendarContext(value: Date, timeZone: string): {
  dateLabel: string;
  dayOfWeek: number;
  dayName: string;
} {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
  });
  const parts = formatter.formatToParts(value);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  const weekdayLong = parts.find((part) => part.type === 'weekday')?.value || '';

  if (!year || !month || !day) {
    return {
      dateLabel: toDateOnly(value),
      dayOfWeek: getDayOfWeekMondayFirst(value),
      dayName: DAY_NAMES[value.getDay()],
    };
  }

  const weekdayKey = weekdayLong.slice(0, 3).toLowerCase();
  return {
    dateLabel: `${year}-${month}-${day}`,
    dayOfWeek: WEEKDAY_TO_MONDAY_FIRST[weekdayKey] || getDayOfWeekMondayFirst(value),
    dayName: weekdayLong || DAY_NAMES[value.getDay()],
  };
}

function normalizeTime(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function getProgramStatusScore(status: unknown): number {
  const s = String(status ?? '').toLowerCase();
  if (s === 'published') return 50;
  if (s === 'approved') return 40;
  if (s === 'submitted') return 30;
  if (s === 'draft') return 20;
  return 10;
}

function startOfWeekMonday(dateLike: string): string {
  const d = new Date(`${dateLike.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return dateLike;
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return toDateOnly(d);
}

function parseDateWithClock(dateLabel: string, clock: string | null): number | null {
  if (!clock) return null;
  const normalized = String(clock).trim();
  const match = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return null;
  }
  const date = new Date(`${dateLabel}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`);
  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function normalizeIsoForLocal(dateLabel: string, clock: string | null): string | null {
  const ms = parseDateWithClock(dateLabel, clock);
  if (!ms) return null;
  return new Date(ms).toISOString();
}

function toDateOnlySafe(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const dateMatch = raw.match(/^\d{4}-\d{2}-\d{2}/);
  if (dateMatch) return dateMatch[0];
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return toDateOnly(parsed);
}

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 2);
}

function titleScore(blockTitle: string, lessonTitle: string): number {
  const a = blockTitle.toLowerCase().trim();
  const b = lessonTitle.toLowerCase().trim();
  if (!a || !b) return 0;
  if (a === b) return 120;
  if (a.includes(b) || b.includes(a)) return 80;

  const aTokens = new Set(tokens(a));
  const bTokens = new Set(tokens(b));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  let overlap = 0;
  aTokens.forEach((token) => {
    if (bTokens.has(token)) overlap += 1;
  });

  const ratio = overlap / Math.max(aTokens.size, bTokens.size);
  return Math.round(ratio * 70);
}

function computeAutoMatchScore(params: {
  block: DisplayRoutineBlock;
  dateLabel: string;
  lesson: DisplayLessonWithDetails;
  scheduledByTitle: Map<string, number[]>;
}): number {
  const { block, dateLabel, lesson, scheduledByTitle } = params;
  let score = titleScore(block.title, lesson.title);

  const blockStart = parseDateWithClock(dateLabel, block.startTime);
  const blockEnd = parseDateWithClock(dateLabel, block.endTime);
  const titleKey = lesson.title.toLowerCase().trim();
  const starts = scheduledByTitle.get(titleKey) || [];

  if (blockStart != null && blockEnd != null && starts.length > 0) {
    let timeScore = 0;
    for (const startMs of starts) {
      if (startMs >= blockStart && startMs < blockEnd) {
        timeScore = Math.max(timeScore, 95);
      } else {
        const diffMinutes = Math.abs(startMs - blockStart) / 60_000;
        if (diffMinutes <= 15) timeScore = Math.max(timeScore, 70);
        else if (diffMinutes <= 45) timeScore = Math.max(timeScore, 45);
      }
    }
    score += timeScore;
  }

  if ((lesson.steps?.length || 0) > 0) score += 10;
  return score;
}

function toDisplayLessonFromLessonRow(params: {
  lesson: LessonRow;
  sourceId: string;
  status: string;
  scheduledAt: string;
  description?: string | null;
}): DisplayLessonWithDetails {
  const { lesson, sourceId, status, scheduledAt, description } = params;
  return {
    id: sourceId,
    lesson_id: lesson.id,
    title: lesson.title || 'Lesson',
    description: description ?? lesson.description ?? null,
    scheduled_at: scheduledAt,
    duration_minutes: typeof lesson.duration_minutes === 'number' ? lesson.duration_minutes : 30,
    room_url: null,
    status,
    steps: extractStepsFromContent(lesson.content),
    media: extractMediaFromContent(lesson.content, lesson.thumbnail_url),
  };
}

async function resolveClassContext(params: {
  supabase: SupabaseClient;
  orgId: string;
  today: string;
  explicitClassId: string | null;
  programClassId: string | null;
}): Promise<string | null> {
  const { supabase, orgId, today, explicitClassId, programClassId } = params;
  if (explicitClassId) return explicitClassId;
  if (programClassId) return programClassId;

  const { data: classRows } = await supabase
    .from('lesson_assignments')
    .select('class_id')
    .eq('preschool_id', orgId)
    .eq('due_date', today)
    .not('class_id', 'is', null)
    .neq('status', 'cancelled')
    .limit(200);

  const uniqueClassIds = Array.from(
    new Set((classRows || []).map((row: { class_id?: string | null }) => String(row.class_id || '')).filter(Boolean)),
  );

  return uniqueClassIds.length === 1 ? uniqueClassIds[0] : null;
}

export async function fetchDisplayDataServer(
  supabase: SupabaseClient,
  orgId: string,
  classId: string | null,
): Promise<DisplayData> {
  const now = new Date();
  const orgTimezone = await resolveOrgTimezone(supabase, orgId);
  const calendarContext = resolveCalendarContext(now, orgTimezone);
  const today = calendarContext.dateLabel;
  const dayOfWeek = calendarContext.dayOfWeek;

  let routine: DisplayTodayRoutine | null = null;
  let themeLabel: string | null = null;

  const { data: programRows, error: programsError } = await supabase
    .from('weekly_programs')
    .select(
      'id, class_id, title, summary, week_start_date, week_end_date, status, published_at, updated_at, created_at',
    )
    .eq('preschool_id', orgId)
    .lte('week_start_date', today)
    .gte('week_end_date', today)
    .order('published_at', { ascending: false })
    .order('updated_at', { ascending: false });

  let selectedProgram: ProgramRow | null = null;
  let rawBlocks: BlockRow[] = [];

  if (!programsError && programRows?.length) {
    const candidates = (programRows as ProgramRow[]).filter((row) => {
      const rowClassId = row.class_id ? String(row.class_id) : null;
      const inWeek = !!row.week_start_date && !!row.week_end_date && row.week_start_date <= today && row.week_end_date >= today;
      const classMatches = !classId || !rowClassId || rowClassId === classId;
      return inWeek && classMatches;
    });

    candidates.sort((a, b) => {
      const aScore = getProgramStatusScore(a.status) + (a.class_id ? 5 : 0);
      const bScore = getProgramStatusScore(b.status) + (b.class_id ? 5 : 0);
      if (aScore !== bScore) return bScore - aScore;
      const aT = new Date(String(a.updated_at || a.created_at || 0)).getTime();
      const bT = new Date(String(b.updated_at || b.created_at || 0)).getTime();
      return bT - aT;
    });

    selectedProgram = candidates[0] || null;

    if (selectedProgram?.id) {
      const { data: blockRows, error: blocksError } = await supabase
        .from('daily_program_blocks')
        .select('id, title, block_type, start_time, end_time, day_of_week, block_order')
        .eq('weekly_program_id', selectedProgram.id)
        .eq('day_of_week', dayOfWeek)
        .order('block_order', { ascending: true });

      if (!blocksError && blockRows?.length) {
        rawBlocks = blockRows as BlockRow[];
      }
    }
  }

  const effectiveClassId = await resolveClassContext({
    supabase,
    orgId,
    today,
    explicitClassId: classId,
    programClassId: selectedProgram?.class_id || null,
  });

  const classScopedId = classId || effectiveClassId;

  let scheduledRows: ScheduledRow[] = [];
  if (classScopedId) {
    const dayStart = `${today}T00:00:00.000Z`;
    const dayEnd = `${today}T23:59:59.999Z`;

    const { data } = await supabase
      .from('scheduled_lessons')
      .select('id, title, description, scheduled_at, duration_minutes, room_url, status')
      .eq('preschool_id', orgId)
      .eq('class_id', classScopedId)
      .gte('scheduled_at', dayStart)
      .lte('scheduled_at', dayEnd)
      .order('scheduled_at', { ascending: true });

    scheduledRows = (data || []) as ScheduledRow[];
  }

  let assignmentRows: AssignmentRow[] = [];
  if (effectiveClassId) {
    const { data } = await supabase
      .from('lesson_assignments')
      .select('id, lesson_id, class_id, due_date, assigned_at, notes, priority, status')
      .eq('preschool_id', orgId)
      .eq('class_id', effectiveClassId)
      .neq('status', 'cancelled')
      .order('assigned_at', { ascending: false })
      .limit(250);

    const rawAssignments = (data || []) as AssignmentRow[];
    assignmentRows = rawAssignments.filter((row) => {
      const dueDate = toDateOnlySafe(row.due_date);
      if (dueDate === today) return true;
      if (dueDate) return false;
      const assignedDate = toDateOnlySafe(row.assigned_at);
      return assignedDate === today;
    });
  }

  const blockIds = rawBlocks.map((block) => block.id);
  const manualLinkByBlockId = new Map<string, string>();

  if (blockIds.length > 0) {
    const { data: manualRows } = await supabase
      .from('daily_program_block_lesson_links')
      .select('daily_program_block_id, lesson_id')
      .eq('preschool_id', orgId)
      .in('daily_program_block_id', blockIds);

    (manualRows || []).forEach((row) => {
      const typed = row as ManualLinkRow;
      if (typed.daily_program_block_id && typed.lesson_id) {
        manualLinkByBlockId.set(String(typed.daily_program_block_id), String(typed.lesson_id));
      }
    });
  }

  const lessonIdsFromAssignments = assignmentRows.map((row) => String(row.lesson_id || '')).filter(Boolean);
  const lessonIdsFromManualLinks = Array.from(manualLinkByBlockId.values()).filter(Boolean);
  const lessonIds = Array.from(new Set([...lessonIdsFromAssignments, ...lessonIdsFromManualLinks]));

  const lessonsById = new Map<string, LessonRow>();
  const lessonsByTitle = new Map<string, LessonRow>();

  if (lessonIds.length > 0) {
    const { data: lessonRows } = await supabase
      .from('lessons')
      .select('id, title, description, content, thumbnail_url, duration_minutes')
      .eq('preschool_id', orgId)
      .in('id', lessonIds);

    (lessonRows || []).forEach((row) => {
      const lesson = row as LessonRow;
      lessonsById.set(lesson.id, lesson);
      lessonsByTitle.set(String(lesson.title || '').toLowerCase().trim(), lesson);
    });
  }

  const scheduledTitles = Array.from(new Set(scheduledRows.map((row) => String(row.title || '').trim()).filter(Boolean)));
  if (scheduledTitles.length > 0) {
    const { data: scheduledTitleLessons } = await supabase
      .from('lessons')
      .select('id, title, description, content, thumbnail_url, duration_minutes')
      .eq('preschool_id', orgId)
      .in('title', scheduledTitles)
      .limit(200);

    (scheduledTitleLessons || []).forEach((row) => {
      const lesson = row as LessonRow;
      lessonsById.set(lesson.id, lesson);
      lessonsByTitle.set(String(lesson.title || '').toLowerCase().trim(), lesson);
    });
  }

  const assignmentByLessonId = new Map<string, AssignmentRow>();
  assignmentRows.forEach((row) => {
    const lessonId = String(row.lesson_id || '').trim();
    if (!lessonId || assignmentByLessonId.has(lessonId)) return;
    assignmentByLessonId.set(lessonId, row);
  });

  const assignedLessonPool: DisplayLessonWithDetails[] = Array.from(assignmentByLessonId.entries())
    .map(([lessonId, assignment]) => {
      const lesson = lessonsById.get(lessonId);
      if (!lesson) return null;
      return toDisplayLessonFromLessonRow({
        lesson,
        sourceId: `assignment:${assignment.id}`,
        status: assignment.status || 'assigned',
        scheduledAt: `${today}T00:00:00.000Z`,
        description: lesson.description || assignment.notes || null,
      });
    })
    .filter((item): item is DisplayLessonWithDetails => item !== null);

  const scheduledByTitle = new Map<string, number[]>();
  scheduledRows.forEach((row) => {
    const key = String(row.title || '').toLowerCase().trim();
    if (!key) return;
    const starts = scheduledByTitle.get(key) || [];
    const startMs = new Date(row.scheduled_at).getTime();
    if (Number.isFinite(startMs)) starts.push(startMs);
    scheduledByTitle.set(key, starts);
  });

  const usedAutoLessonIds = new Set<string>();

  const routineBlocks: DisplayRoutineBlock[] = rawBlocks.map((row) => {
    const block: DisplayRoutineBlock = {
      id: String(row.id || ''),
      title: String(row.title || 'Block'),
      blockType: String(row.block_type || 'learning'),
      startTime: normalizeTime(row.start_time),
      endTime: normalizeTime(row.end_time),
      linkedLesson: null,
      lessonLinkSource: null,
    };

    const manualLessonId = manualLinkByBlockId.get(block.id) || null;
    if (manualLessonId) {
      const manualLessonRow = lessonsById.get(manualLessonId);
      if (manualLessonRow) {
        const scheduledAt = normalizeIsoForLocal(today, block.startTime) || `${today}T00:00:00.000Z`;
        block.linkedLesson = toDisplayLessonFromLessonRow({
          lesson: manualLessonRow,
          sourceId: `manual:${block.id}:${manualLessonId}`,
          status: 'assigned',
          scheduledAt,
        });
        block.lessonLinkSource = 'manual';
        return block;
      }
    }

    let best: { lesson: DisplayLessonWithDetails; score: number } | null = null;
    for (const lesson of assignedLessonPool) {
      const lessonId = String(lesson.lesson_id || '').trim();
      if (!lessonId || usedAutoLessonIds.has(lessonId)) continue;
      const score = computeAutoMatchScore({
        block,
        dateLabel: today,
        lesson,
        scheduledByTitle,
      });
      if (!best || score > best.score) {
        best = { lesson, score };
      }
    }

    if (best && best.score >= 45) {
      const lessonId = String(best.lesson.lesson_id || '').trim();
      if (lessonId) usedAutoLessonIds.add(lessonId);
      block.linkedLesson = {
        ...best.lesson,
        scheduled_at: normalizeIsoForLocal(today, block.startTime) || best.lesson.scheduled_at,
      };
      block.lessonLinkSource = 'auto';
    }

    return block;
  });

  if (selectedProgram) {
    routine = {
      weeklyProgramId: String(selectedProgram.id),
      classId: selectedProgram.class_id || effectiveClassId || null,
      title: selectedProgram.title ? String(selectedProgram.title) : null,
      summary: selectedProgram.summary ? String(selectedProgram.summary) : null,
      dayOfWeek,
      blocks: routineBlocks,
    };
    themeLabel = selectedProgram.title ? String(selectedProgram.title) : null;
  }

  const scheduledLessons: DisplayLessonWithDetails[] = scheduledRows.map((row) => {
    const base: DisplayScheduledLesson = {
      id: String(row.id ?? ''),
      title: String(row.title ?? 'Lesson'),
      description: row.description ? String(row.description) : null,
      scheduled_at: String(row.scheduled_at ?? ''),
      duration_minutes: typeof row.duration_minutes === 'number' ? row.duration_minutes : null,
      room_url: row.room_url ? String(row.room_url) : null,
      status: String(row.status ?? 'scheduled'),
    };

    const matched = lessonsByTitle.get(String(base.title || '').toLowerCase().trim());
    if (!matched) return base;

    return {
      ...base,
      lesson_id: matched.id,
      steps: extractStepsFromContent(matched.content),
      media: extractMediaFromContent(matched.content, matched.thumbnail_url),
      duration_minutes: base.duration_minutes ?? matched.duration_minutes ?? 30,
      description: base.description || matched.description || null,
    };
  });

  const lessonsWithDetails: DisplayLessonWithDetails[] = [...scheduledLessons];
  const lessonKeySeen = new Set<string>(
    lessonsWithDetails.map((lesson) => String(lesson.lesson_id || lesson.title).toLowerCase().trim()).filter(Boolean),
  );

  routineBlocks.forEach((block) => {
    if (!block.linkedLesson) return;
    const key = String(block.linkedLesson.lesson_id || block.linkedLesson.title).toLowerCase().trim();
    if (!key || lessonKeySeen.has(key)) return;
    lessonsWithDetails.push(block.linkedLesson);
    lessonKeySeen.add(key);
  });

  lessonsWithDetails.sort((a, b) => {
    const aMs = new Date(a.scheduled_at).getTime();
    const bMs = new Date(b.scheduled_at).getTime();
    if (!Number.isFinite(aMs) && !Number.isFinite(bMs)) return 0;
    if (!Number.isFinite(aMs)) return 1;
    if (!Number.isFinite(bMs)) return -1;
    return aMs - bMs;
  });

  const weekStart = startOfWeekMonday(today);
  let menuToday: DisplayMenuDay | null = null;
  try {
    const { data: menuRows } = await supabase.rpc('get_school_week_menu', {
      p_preschool_id: orgId,
      p_week_start_date: weekStart,
    });
    const rows = (menuRows || []) as Array<{
      menu_date: string;
      breakfast_items?: string[];
      lunch_items?: string[];
      snack_items?: string[];
    }>;
    const dayRow = rows.find((r) => r.menu_date === today);
    if (dayRow) {
      menuToday = {
        date: today,
        breakfast: Array.isArray(dayRow.breakfast_items) ? dayRow.breakfast_items : [],
        lunch: Array.isArray(dayRow.lunch_items) ? dayRow.lunch_items : [],
        snack: Array.isArray(dayRow.snack_items) ? dayRow.snack_items : [],
      };
    }
  } catch {
    // RPC may not exist or fail
  }

  const { data: announcementRows } = await supabase
    .from('announcements')
    .select('id, title, content, published_at')
    .eq('preschool_id', orgId)
    .order('published_at', { ascending: false })
    .limit(2);

  const announcements: DisplayAnnouncement[] = (announcementRows || []).map((row: Record<string, unknown>) => ({
    id: String(row.id ?? ''),
    title: String(row.title ?? ''),
    body_preview: String((row.content ?? '')).slice(0, 200),
    published_at: row.published_at ? String(row.published_at) : null,
  }));

  let insights: DisplayInsight | null = null;
  try {
    const { data: insightsData } = await supabase.functions.invoke('ai-insights', {
      body: { scope: 'teacher', period_days: 7, context: { organization_id: orgId } },
    });
    if (insightsData?.bullets?.length && Array.isArray(insightsData.bullets)) {
      const bullets = insightsData.bullets
        .filter((b: string) => typeof b === 'string' && b.length < 120)
        .slice(0, 3);
      if (bullets.length) {
        insights = {
          title: insightsData.title || "This week's focus",
          bullets,
        };
      }
    }
  } catch {
    // Non-fatal
  }

  return {
    routine,
    themeLabel,
    lessons: lessonsWithDetails,
    menuToday,
    announcements,
    insights,
    dateLabel: today,
    dayName: calendarContext.dayName,
  };
}
