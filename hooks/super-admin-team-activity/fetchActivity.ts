import { assertSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type { PlatformActivity } from './types';

/**
 * Fetch platform activity log with actor profiles.
 * Returns up to `limit` most recent activities.
 */
export async function fetchPlatformActivity(
  limit = 200,
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
