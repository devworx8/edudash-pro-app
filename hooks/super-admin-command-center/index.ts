// Platform Command Center — Main Hook
import { useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { isSuperAdmin } from '@/lib/roleUtils';
import { fetchCommandCenterData } from './fetchData';
import type { CommandCenterData } from './types';

export { SEVERITY_COLORS, CATEGORY_CONFIG, TIER_COLORS, ROLE_COLORS } from './types';
export type {
  KPICard, ErrorHeatmapEntry, LiveIncident, PlatformHealthMetric,
  UserGrowthPoint, RoleDistribution, TierDistribution, AIUsageMetric,
  RecentActivity, CommandCenterData,
} from './types';

export interface UseCommandCenterReturn {
  data: CommandCenterData | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: Error | null;
  refetch: () => void;
  onRefresh: () => void;
}

export function useCommandCenter(): UseCommandCenterReturn {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const isRefreshingRef = useRef(false);

  const enabled = isSuperAdmin(profile?.role);

  const { data, isLoading, error, refetch, isFetching } = useQuery<CommandCenterData>({
    queryKey: ['command-center'],
    queryFn: fetchCommandCenterData,
    enabled,
    staleTime: 2 * 60 * 1000,  // 2 min
    gcTime: 5 * 60 * 1000,     // 5 min
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const onRefresh = useCallback(() => {
    isRefreshingRef.current = true;
    queryClient.invalidateQueries({ queryKey: ['command-center'] });
  }, [queryClient]);

  const isRefreshing = isFetching && isRefreshingRef.current;
  if (!isFetching) isRefreshingRef.current = false;

  return {
    data: data ?? null,
    isLoading,
    isRefreshing,
    error: error as Error | null,
    refetch,
    onRefresh,
  };
}
