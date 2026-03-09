import { assertSupabase } from '@/lib/supabase';
import type { CompletionInsightSummary } from './weeklyProgramCopilot.types';

export const getCompletionInsightSummary = async (
  preschoolId: string
): Promise<CompletionInsightSummary> => {
  const supabase = assertSupabase();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('lesson_completions')
    .select('score, feedback')
    .eq('preschool_id', preschoolId)
    .gte('completed_at', thirtyDaysAgo)
    .order('completed_at', { ascending: false })
    .limit(300);

  if (error) {
    return { totalCompletions: 0, avgScore: null, topDomains: [] };
  }

  const rows = data || [];
  const scores = rows
    .map((row: any) => row.score)
    .filter((value: unknown): value is number => Number.isFinite(value as number));
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const domainMap = new Map<string, { count: number; scores: number[] }>();

  rows.forEach((row: any) => {
    const feedback = row.feedback && typeof row.feedback === 'object' ? row.feedback : {};
    const activityMeta = (feedback as Record<string, unknown>).activity_meta;
    const domain = activityMeta && typeof activityMeta === 'object'
      ? String((activityMeta as Record<string, unknown>).domain || '').trim().toLowerCase()
      : '';
    if (!domain) return;
    const current = domainMap.get(domain) || { count: 0, scores: [] };
    current.count += 1;
    if (Number.isFinite(row.score)) current.scores.push(Number(row.score));
    domainMap.set(domain, current);
  });

  const topDomains = Array.from(domainMap.entries())
    .map(([domain, value]) => ({
      domain,
      count: value.count,
      avgScore: value.scores.length ? Math.round(value.scores.reduce((a, b) => a + b, 0) / value.scores.length) : null,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return { totalCompletions: rows.length, avgScore, topDomains };
};
