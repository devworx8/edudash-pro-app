/**
 * useTodayRoutineBlocks
 *
 * Fetches today's published routine blocks for the parent dashboard.
 * Queries `weekly_programs` (status=published) and `daily_program_blocks`
 * for the current day-of-week, scoped to the child's school.
 *
 * Uses TanStack Query for caching + background refresh.
 * ≤200 lines — WARP-compliant hook.
 */

import { useQuery } from '@tanstack/react-query';
import { assertSupabase } from '@/lib/supabase';

export interface RoutineBlock {
  id: string;
  title: string;
  blockType: string | null;
  startTime: string | null;
  endTime: string | null;
  parentTip: string | null;
}

export interface TodayRoutineData {
  blocks: RoutineBlock[];
  programTitle: string | null;
  weekLabel: string | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

interface FetchResult {
  blocks: RoutineBlock[];
  programTitle: string | null;
  weekLabel: string | null;
}

const EMPTY: FetchResult = { blocks: [], programTitle: null, weekLabel: null };

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function todayDayOfWeek(): number {
  const day = new Date().getDay();
  return day === 0 ? 7 : day;
}

function normalizeTime(value: string | null | undefined): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatWeekRange(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
  const fmt = (d: Date) => d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
  return `${fmt(s)} – ${fmt(e)}`;
}

async function fetchTodayBlocks(
  organizationId: string,
  classId?: string | null,
): Promise<FetchResult> {
  const supabase = assertSupabase();
  const today = new Date();
  const todayIso = toDateOnly(today);
  const dayOfWeek = todayDayOfWeek();

  if (dayOfWeek > 5) return EMPTY;

  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - 7);
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + 7);

  const { data: programs, error: pgErr } = await supabase
    .from('weekly_programs')
    .select('id, class_id, title, week_start_date, week_end_date, published_at')
    .eq('preschool_id', organizationId)
    .eq('status', 'published')
    .gte('week_end_date', toDateOnly(windowStart))
    .lte('week_start_date', toDateOnly(windowEnd))
    .order('week_start_date', { ascending: false })
    .order('published_at', { ascending: false })
    .limit(5);

  if (pgErr) throw pgErr;
  if (!programs || programs.length === 0) return EMPTY;

  const ranked = [...programs].sort((a, b) => {
    const aClass = classId && a.class_id === classId ? 20 : 0;
    const bClass = classId && b.class_id === classId ? 20 : 0;
    const containsToday = (p: { week_start_date: string; week_end_date: string }) =>
      p.week_start_date <= todayIso && p.week_end_date >= todayIso ? 30 : 0;
    return (bClass + containsToday(b)) - (aClass + containsToday(a));
  });

  const best = ranked[0];

  const { data: blockRows, error: blkErr } = await supabase
    .from('daily_program_blocks')
    .select('id, title, block_type, start_time, end_time, parent_tip')
    .eq('weekly_program_id', best.id)
    .eq('day_of_week', dayOfWeek)
    .order('block_order', { ascending: true });

  if (blkErr) throw blkErr;

  return {
    blocks: (blockRows || []).map((b) => ({
      id: b.id,
      title: b.title || 'Activity',
      blockType: b.block_type,
      startTime: normalizeTime(b.start_time),
      endTime: normalizeTime(b.end_time),
      parentTip: b.parent_tip || null,
    })),
    programTitle: best.title || null,
    weekLabel: formatWeekRange(best.week_start_date, best.week_end_date),
  };
}

export function useTodayRoutineBlocks(
  organizationId: string | null | undefined,
  classId?: string | null,
): TodayRoutineData {
  const query = useQuery({
    queryKey: ['today-routine-blocks', organizationId, classId ?? null],
    queryFn: () => fetchTodayBlocks(organizationId!, classId),
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000, // 5 min — routines don't change mid-day
  });

  return {
    blocks: query.data?.blocks ?? [],
    programTitle: query.data?.programTitle ?? null,
    weekLabel: query.data?.weekLabel ?? null,
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    refresh: () => { query.refetch(); },
  };
}
