import { useCallback } from 'react';
import { Linking } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { track } from '@/lib/analytics';
import { fetchPlatformAdminData } from './fetchData';
import {
  ROLE_CONFIGS,
  type PlatformAdminRole,
  type PlatformAdminDashboardData,
  type QuickAction,
  type UsePlatformAdminDashboardReturn,
} from './types';

export { ROLE_CONFIGS } from './types';
export type {
  PlatformAdminRole,
  StatCard,
  QuickAction,
  ActivityItem,
  UsePlatformAdminDashboardReturn,
} from './types';

function resolveAdminRole(role?: string | null): PlatformAdminRole | null {
  if (!role) return null;
  const r = String(role).trim().toLowerCase();
  if (r === 'system_admin') return 'system_admin';
  if (r === 'content_moderator') return 'content_moderator';
  if (r === 'support_admin') return 'support_admin';
  if (r === 'billing_admin') return 'billing_admin';
  return null;
}

export function usePlatformAdminDashboard(): UsePlatformAdminDashboardReturn {
  const { profile, loading: authLoading, profileLoading } = useAuth();
  const queryClient = useQueryClient();

  const adminRole = resolveAdminRole(profile?.role);
  const roleConfig = adminRole ? ROLE_CONFIGS[adminRole] : null;

  const { data, isLoading, isFetching } = useQuery<PlatformAdminDashboardData>({
    queryKey: ['platform-admin-dashboard', adminRole],
    queryFn: () => fetchPlatformAdminData(adminRole!),
    enabled: !!adminRole,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const onRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['platform-admin-dashboard', adminRole] });
  }, [queryClient, adminRole]);

  const handleQuickAction = useCallback(
    (action: QuickAction) => {
      track('edudash.platform_admin.quick_action', { role: adminRole, action_id: action.id });
      if (action.externalUrl) {
        Linking.openURL(action.externalUrl).catch(() => {});
        return;
      }
      router.push(action.route as any);
    },
    [adminRole],
  );

  return {
    profile,
    authLoading,
    profileLoading,
    adminRole,
    roleConfig,
    loading: isLoading,
    refreshing: isFetching && !isLoading,
    data: data ?? null,
    onRefresh,
    handleQuickAction,
  };
}
