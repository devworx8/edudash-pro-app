import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { isSuperAdmin } from '@/lib/roleUtils';
import { fetchPlatformActivity, fetchActivityStats } from './fetchActivity';
import { matchesFilter } from './types';
import type { ShowAlertConfig, PlatformActivity, ActivityFilter } from './types';

export function useSuperAdminTeamActivity(showAlert: (config: ShowAlertConfig) => void) {
  const { profile } = useAuth();
  const [activities, setActivities] = useState<PlatformActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [stats, setStats] = useState<{ today: number; thisWeek: number; uniqueActors: number } | null>(null);

  const loadData = useCallback(async () => {
    if (!isSuperAdmin(profile?.role)) return;
    const [acts, st] = await Promise.all([fetchPlatformActivity(), fetchActivityStats()]);
    setActivities(acts);
    setStats(st);
  }, [profile?.role]);

  useEffect(() => {
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const filteredActivities = activities.filter((a) => matchesFilter(a.action, filter));

  return {
    profile,
    activities: filteredActivities,
    allActivities: activities,
    loading,
    refreshing,
    filter,
    setFilter,
    stats,
    onRefresh,
  };
}
