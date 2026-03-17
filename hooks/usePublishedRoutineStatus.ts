/**
 * usePublishedRoutineStatus
 *
 * Checks whether the school has a published weekly program for the current week.
 * Used to show a notification badge / glow on the Daily Routine card in the parent dashboard.
 *
 * Uses TanStack Query for caching + background refresh.
 */

import { useQuery } from '@tanstack/react-query';
import { assertSupabase } from '@/lib/supabase';

interface PublishedRoutineStatus {
  hasPublished: boolean;
  publishedAt: string | null;
  weekLabel: string | null;
  isLoading: boolean;
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

interface StatusResult {
  hasPublished: boolean;
  publishedAt: string | null;
  weekLabel: string | null;
}

const NONE: StatusResult = { hasPublished: false, publishedAt: null, weekLabel: null };

async function fetchPublishedStatus(organizationId: string): Promise<StatusResult> {
  const supabase = assertSupabase();
  const today = new Date();
  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - 7);
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + 7);

  const { data, error } = await supabase
    .from('weekly_programs')
    .select('id, published_at, week_start_date, week_end_date')
    .eq('preschool_id', organizationId)
    .eq('status', 'published')
    .gte('week_end_date', toDateOnly(windowStart))
    .lte('week_start_date', toDateOnly(windowEnd))
    .order('week_start_date', { ascending: false })
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return NONE;

  const start = new Date(`${data.week_start_date}T00:00:00`);
  const end = new Date(`${data.week_end_date}T00:00:00`);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });

  return {
    hasPublished: true,
    publishedAt: data.published_at || null,
    weekLabel: `${fmt(start)} – ${fmt(end)}`,
  };
}

export function usePublishedRoutineStatus(organizationId: string | undefined): PublishedRoutineStatus {
  const query = useQuery({
    queryKey: ['published-routine-status', organizationId],
    queryFn: () => fetchPublishedStatus(organizationId!),
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000, // 5 min — routine publish is weekly
  });

  return {
    hasPublished: query.data?.hasPublished ?? false,
    publishedAt: query.data?.publishedAt ?? null,
    weekLabel: query.data?.weekLabel ?? null,
    isLoading: query.isLoading,
  };
}
