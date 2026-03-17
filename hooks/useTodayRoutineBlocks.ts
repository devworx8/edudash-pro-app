/**
 * useTodayRoutineBlocks
 *
 * Fetches today's published routine blocks for the parent dashboard.
 * Queries `weekly_programs` (status=published) and `daily_program_blocks`
 * for the current day-of-week, scoped to the child's school.
 *
 * ≤200 lines — WARP-compliant hook.
 */

import { useEffect, useState, useCallback } from 'react';
import { assertSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

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

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Monday=1 … Sunday=7 */
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

export function useTodayRoutineBlocks(
  organizationId: string | null | undefined,
  classId?: string | null,
): TodayRoutineData {
  const [blocks, setBlocks] = useState<RoutineBlock[]>([]);
  const [programTitle, setProgramTitle] = useState<string | null>(null);
  const [weekLabel, setWeekLabel] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    if (!organizationId) {
      setBlocks([]);
      setProgramTitle(null);
      setWeekLabel(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const supabase = assertSupabase();
      const today = new Date();
      const todayIso = toDateOnly(today);
      const dayOfWeek = todayDayOfWeek();

      // Weekends — no routine to show
      if (dayOfWeek > 5) {
        setBlocks([]);
        setProgramTitle(null);
        setWeekLabel(null);
        return;
      }

      // ±7 day window — same logic as parent-daily-program screen
      const windowStart = new Date(today);
      windowStart.setDate(windowStart.getDate() - 7);
      const windowEnd = new Date(today);
      windowEnd.setDate(windowEnd.getDate() + 7);

      let query = supabase
        .from('weekly_programs')
        .select('id, class_id, title, week_start_date, week_end_date, published_at')
        .eq('preschool_id', organizationId)
        .eq('status', 'published')
        .gte('week_end_date', toDateOnly(windowStart))
        .lte('week_start_date', toDateOnly(windowEnd))
        .order('week_start_date', { ascending: false })
        .order('published_at', { ascending: false })
        .limit(5);

      const { data: programs, error: pgErr } = await query;
      if (pgErr) throw pgErr;
      if (!programs || programs.length === 0) {
        setBlocks([]);
        setProgramTitle(null);
        setWeekLabel(null);
        return;
      }

      // Rank: class-specific match first, then contains-today, then most recent
      const ranked = [...programs].sort((a, b) => {
        const aClass = classId && a.class_id === classId ? 20 : 0;
        const bClass = classId && b.class_id === classId ? 20 : 0;
        const containsToday = (p: any) =>
          p.week_start_date <= todayIso && p.week_end_date >= todayIso ? 30 : 0;
        const aScore = aClass + containsToday(a);
        const bScore = bClass + containsToday(b);
        return bScore - aScore;
      });

      const best = ranked[0];

      const { data: blockRows, error: blkErr } = await supabase
        .from('daily_program_blocks')
        .select('id, title, block_type, start_time, end_time, parent_tip')
        .eq('weekly_program_id', best.id)
        .eq('day_of_week', dayOfWeek)
        .order('block_order', { ascending: true });

      if (blkErr) throw blkErr;

      setBlocks(
        (blockRows || []).map((b: any) => ({
          id: b.id,
          title: b.title || 'Activity',
          blockType: b.block_type,
          startTime: normalizeTime(b.start_time),
          endTime: normalizeTime(b.end_time),
          parentTip: b.parent_tip || null,
        })),
      );
      setProgramTitle(best.title || null);
      setWeekLabel(formatWeekRange(best.week_start_date, best.week_end_date));
    } catch (err: any) {
      logger.error('useTodayRoutineBlocks', 'Failed to load routine', err);
      setError(err?.message || 'Failed to load routine');
      setBlocks([]);
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, classId]);

  useEffect(() => {
    void fetch_();
  }, [fetch_]);

  return { blocks, programTitle, weekLabel, isLoading, error, refresh: fetch_ };
}
