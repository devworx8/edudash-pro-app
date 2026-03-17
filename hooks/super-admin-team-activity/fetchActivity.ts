import { assertSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type { PlatformActivity } from './types';

/**
 * Fetch platform activity log with actor profiles.
 */
export async function fetchPlatformActivity(
  limit = 100,
): Promise<PlatformActivity[]> {
  try {
    const supabase = assertSupabase();

    const { data, error } = await supabase
      .from('platform_activity_log')
      .select(`
        *,
        actor:profiles!platform_activity_log_actor_id_fkey(full_name, email, avatar_url, role)
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error('fetchPlatformActivity', 'Failed:', error);
      // Table may not exist yet — return empty gracefully
      return [];
    }

    return (data || []).map((row) => ({
      ...row,
      actor: row.actor || null,
    }));
  } catch (err) {
    logger.error('fetchPlatformActivity', 'Unexpected:', err);
    return [];
  }
}

/**
 * Fetch activity stats for the dashboard summary cards.
 */
export async function fetchActivityStats(): Promise<{
  today: number;
  thisWeek: number;
  uniqueActors: number;
}> {
  try {
    const supabase = assertSupabase();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getTime() - 7 * 86400000).toISOString();

    const { data: activities, error } = await supabase
      .from('platform_activity_log')
      .select('actor_id, created_at')
      .gte('created_at', weekStart);

    if (error || !activities) {
      return { today: 0, thisWeek: 0, uniqueActors: 0 };
    }

    const today = activities.filter((a) => a.created_at >= todayStart).length;
    const uniqueActors = new Set(activities.map((a) => a.actor_id).filter(Boolean)).size;

    return {
      today,
      thisWeek: activities.length,
      uniqueActors,
    };
  } catch (err) {
    logger.error('fetchActivityStats', 'Unexpected:', err);
    return { today: 0, thisWeek: 0, uniqueActors: 0 };
  }
}
