import { useQuery } from '@tanstack/react-query';
import { AdminWorkflowService } from '@/services/AdminWorkflowService';
import type { AdminDashboardBundle, AdminOrgTypeV1 } from '@/lib/dashboard/admin/types';

interface UseAdminDashboardDataParams {
  orgId?: string | null;
  orgType?: AdminOrgTypeV1 | null;
  enabled?: boolean;
}

interface UseAdminDashboardDataResult {
  data: AdminDashboardBundle | null;
  isLoading: boolean;
  isRefetching: boolean;
  error: Error | null;
  refetch: () => Promise<AdminDashboardBundle | null>;
}

export function useAdminDashboardData(params: UseAdminDashboardDataParams): UseAdminDashboardDataResult {
  const { orgId, orgType, enabled = true } = params;
  const queryEnabled = enabled && !!orgId && !!orgType;

  const query = useQuery({
    queryKey: ['adaptive-admin-dashboard-bundle', orgId, orgType],
    queryFn: async () => {
      if (!orgId || !orgType) return null;
      return AdminWorkflowService.getDashboardBundle(orgId, orgType, 'mobile');
    },
    enabled: queryEnabled,
    staleTime: 2 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  return {
    data: (query.data as AdminDashboardBundle | null) || null,
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    error: (query.error as Error | null) || null,
    refetch: async () => {
      const result = await query.refetch();
      return (result.data as AdminDashboardBundle | null) || null;
    },
  };
}
