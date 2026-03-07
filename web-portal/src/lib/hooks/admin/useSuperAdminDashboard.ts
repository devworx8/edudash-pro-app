'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface SuperAdminMetrics {
  totalSchools: number;
  totalUsers: number;
  pendingRegistrations: number;
  totalPreschools: number;
  totalOrganizations: number;
  usersByRole: { teachers: number; principals: number; parents: number };
}

const EMPTY_METRICS: SuperAdminMetrics = {
  totalSchools: 0,
  totalUsers: 0,
  pendingRegistrations: 0,
  totalPreschools: 0,
  totalOrganizations: 0,
  usersByRole: { teachers: 0, principals: 0, parents: 0 },
};

export interface UseSuperAdminDashboardResult {
  metrics: SuperAdminMetrics;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Fetches platform-wide metrics for the SuperAdmin dashboard.
 * Uses direct table queries; falls back gracefully when tables or RPCs don't exist.
 */
export function useSuperAdminDashboard(): UseSuperAdminDashboardResult {
  const [metrics, setMetrics] = useState<SuperAdminMetrics>(EMPTY_METRICS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const supabase = createClient();
    setLoading(true);
    setError(null);

    try {
      // Try RPC first (if it exists and returns expected shape)
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_superadmin_dashboard_data');

      if (!rpcError && rpcData) {
        const data = (typeof rpcData === 'object' && 'data' in rpcData)
          ? (rpcData as { data?: unknown }).data
          : rpcData;
        const payload = data as {
          user_stats?: { total_users?: number; teachers?: number; principals?: number; parents?: number };
          preschool_stats?: { total_preschools?: number };
        } | null;

        if (payload?.user_stats) {
          const us = payload.user_stats;
          setMetrics((prev) => ({
            ...prev,
            totalUsers: us.total_users ?? prev.totalUsers,
            usersByRole: {
              teachers: us.teachers ?? prev.usersByRole.teachers,
              principals: us.principals ?? prev.usersByRole.principals,
              parents: us.parents ?? prev.usersByRole.parents,
            },
          }));
        }
        if (payload?.preschool_stats?.total_preschools != null) {
          setMetrics((prev) => ({
            ...prev,
            totalPreschools: payload.preschool_stats!.total_preschools!,
            totalSchools: payload.preschool_stats!.total_preschools!,
          }));
        }
      }

      // Parallel fetch: profiles count, preschools, organizations, role counts
      const [profilesRes, preschoolsRes, orgsRes, teachersRes, principalsRes, parentsRes] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('preschools').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('organizations').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'teacher'),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).in('role', ['principal', 'principal_admin']),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'parent'),
      ]);

      const totalUsers = profilesRes.count ?? 0;
      const totalPreschools = preschoolsRes.count ?? 0;
      const totalOrgs = orgsRes.count ?? 0;
      const totalSchools = totalPreschools + totalOrgs;
      const usersByRole = {
        teachers: teachersRes.count ?? 0,
        principals: principalsRes.count ?? 0,
        parents: parentsRes.count ?? 0,
      };

      // Pending registrations: try main DB first, then EduSitePro if configured
      let pendingRegistrations = 0;
      try {
        const { count: mainPending, error: mainErr } = await supabase
          .from('registration_requests')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending');
        if (!mainErr && mainPending != null) {
          pendingRegistrations = mainPending;
        } else {
          const edusiteUrl = process.env.NEXT_PUBLIC_EDUSITE_SUPABASE_URL;
          const edusiteKey = process.env.NEXT_PUBLIC_EDUSITE_SUPABASE_ANON_KEY;
          if (edusiteUrl && edusiteKey) {
            try {
              const { createClient } = await import('@supabase/supabase-js');
              const edusite = createClient(edusiteUrl, edusiteKey);
              const { count } = await edusite
                .from('registration_requests')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'pending');
              if (count != null) pendingRegistrations = count;
            } catch {
              // EduSitePro unreachable; keep 0
            }
          }
        }
      } catch {
        // registration_requests table may not exist in main DB; keep 0
      }

      setMetrics({
        totalSchools: totalSchools || 0,
        totalUsers: totalUsers || 0,
        pendingRegistrations,
        totalPreschools: totalPreschools || 0,
        totalOrganizations: totalOrgs || 0,
        usersByRole,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load dashboard data';
      setError(message);
      console.error('[useSuperAdminDashboard]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    metrics,
    loading,
    error,
    refresh: fetchData,
  };
}
