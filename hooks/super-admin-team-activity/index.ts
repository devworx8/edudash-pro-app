import { useMemo, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { isPlatformStaff } from '@/lib/roleUtils';
import { fetchPlatformActivity } from './fetchActivity';
import { matchesFilter, groupByDate, buildStats } from './types';
import type { ShowAlertConfig, ActivityFilter, ActivityStats, ActivityGroup } from './types';

export { ACTIVITY_FILTERS, getActionConfig, groupByDate } from './types';
export type { PlatformActivity, ActivityFilter, ActivityStats, ActivityGroup } from './types';

export function useSuperAdminTeamActivity(_showAlert?: (config: ShowAlertConfig) => void) {
  const { profile } = useAuth();
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const enabled = isPlatformStaff(profile?.role);

  const { data: allActivities = [], isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['superadmin', 'team-activity'],
    queryFn: () => fetchPlatformActivity(200),
    enabled,
    staleTime: 2 * 60_000,
    gcTime: 5 * 60_000,
  });

  const filteredActivities = useMemo(
    () => allActivities.filter((a) => matchesFilter(a.action, filter)),
    [allActivities, filter],
  );

  const stats: ActivityStats = useMemo(() => buildStats(allActivities), [allActivities]);
  const groups: ActivityGroup[] = useMemo(() => groupByDate(filteredActivities), [filteredActivities]);

  const onRefresh = useCallback(async () => { await refetch(); }, [refetch]);

  return {
    profile,
    activities: filteredActivities,
    allActivities,
    groups,
    loading: isLoading,
    refreshing: isRefetching,
    filter,
    setFilter,
    stats,
    onRefresh,
  };
}
