import { useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assertSupabase } from '@/lib/supabase';
import type {
  PlatformError,
  PlatformIncident,
  ErrorMonitorStats,
  ErrorMonitorFilters,
  ErrorStatus,
  IncidentStatus,
} from './types';

// ─── Query Keys ──────────────────────────────────────────────
const KEYS = {
  errors: (filters?: ErrorMonitorFilters) => ['platform-errors', filters] as const,
  incidents: (status?: string) => ['platform-incidents', status] as const,
  stats: ['platform-error-stats'] as const,
  scanResult: ['platform-error-scan'] as const,
};

function getTimeRangeFilter(range: ErrorMonitorFilters['time_range']): string {
  const now = new Date();
  switch (range) {
    case 'last_hour': return new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    case 'last_6h': return new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();
    case 'last_24h': return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    case 'last_7d': return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    case 'last_30d': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    default: return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  }
}

// ─── Fetch Errors ────────────────────────────────────────────
export function usePlatformErrors(filters: ErrorMonitorFilters = {}) {
  return useQuery({
    queryKey: KEYS.errors(filters),
    queryFn: async (): Promise<PlatformError[]> => {
      const supabase = assertSupabase();
      let query = supabase
        .from('platform_error_logs')
        .select('*')
        .order('occurred_at', { ascending: false })
        .limit(100);

      const since = getTimeRangeFilter(filters.time_range || 'last_24h');
      query = query.gte('occurred_at', since);

      if (filters.severity?.length) {
        query = query.in('severity', filters.severity);
      }
      if (filters.status?.length) {
        query = query.in('status', filters.status);
      }
      if (filters.category?.length) {
        query = query.in('category', filters.category);
      }
      if (filters.assigned_team?.length) {
        query = query.in('assigned_team', filters.assigned_team);
      }
      if (filters.search) {
        query = query.or(
          `error_message.ilike.%${filters.search}%,request_path.ilike.%${filters.search}%,ai_diagnosis.ilike.%${filters.search}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as PlatformError[];
    },
    staleTime: 30_000, // 30s — errors change frequently
    refetchInterval: 60_000, // auto-refresh every minute
  });
}

// ─── Fetch Incidents ─────────────────────────────────────────
export function usePlatformIncidents(statusFilter?: IncidentStatus) {
  return useQuery({
    queryKey: KEYS.incidents(statusFilter),
    queryFn: async (): Promise<PlatformIncident[]> => {
      const supabase = assertSupabase();
      let query = supabase
        .from('platform_incidents')
        .select('*')
        .order('last_seen_at', { ascending: false })
        .limit(50);

      if (statusFilter) {
        query = query.eq('status', statusFilter);
      } else {
        query = query.in('status', ['open', 'investigating', 'mitigating']);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as PlatformIncident[];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

// ─── Dashboard Stats ─────────────────────────────────────────
export function usePlatformErrorStats() {
  return useQuery({
    queryKey: KEYS.stats,
    queryFn: async (): Promise<ErrorMonitorStats> => {
      const supabase = assertSupabase();
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // Fetch errors from last 24h
      const { data: errors } = await supabase
        .from('platform_error_logs')
        .select('severity, status, category, assigned_team, auto_fix_applied')
        .gte('occurred_at', since24h);

      // Fetch open incidents
      const { count: openIncidents } = await supabase
        .from('platform_incidents')
        .select('id', { count: 'exact', head: true })
        .in('status', ['open', 'investigating', 'mitigating']);

      const allErrors = errors || [];
      const bySeverity = { low: 0, medium: 0, high: 0, critical: 0 };
      const byStatus: Record<string, number> = {};
      const byCategory: Record<string, number> = {};
      const byTeam: Record<string, number> = {};
      let autoResolved = 0;

      for (const e of allErrors) {
        bySeverity[e.severity as keyof typeof bySeverity] = (bySeverity[e.severity as keyof typeof bySeverity] || 0) + 1;
        byStatus[e.status] = (byStatus[e.status] || 0) + 1;
        if (e.category) byCategory[e.category] = (byCategory[e.category] || 0) + 1;
        if (e.assigned_team) byTeam[e.assigned_team] = (byTeam[e.assigned_team] || 0) + 1;
        if (e.auto_fix_applied) autoResolved++;
      }

      return {
        total_errors: allErrors.length,
        by_severity: bySeverity,
        by_status: byStatus,
        by_category: byCategory,
        by_team: byTeam,
        auto_resolved_count: autoResolved,
        open_incidents: openIncidents || 0,
        avg_resolution_time_hours: null, // TODO: compute from resolutions table
      };
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

// ─── Mutations ───────────────────────────────────────────────
export function usePlatformErrorActions() {
  const queryClient = useQueryClient();

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['platform-errors'] });
    queryClient.invalidateQueries({ queryKey: ['platform-incidents'] });
    queryClient.invalidateQueries({ queryKey: KEYS.stats });
  }, [queryClient]);

  // Update error status
  const updateErrorStatus = useMutation({
    mutationFn: async ({ errorId, status }: { errorId: string; status: ErrorStatus }) => {
      const { error } = await assertSupabase()
        .from('platform_error_logs')
        .update({
          status,
          ...(status === 'resolved' ? { resolved_at: new Date().toISOString() } : {}),
        })
        .eq('id', errorId);
      if (error) throw error;
    },
    onSuccess: invalidateAll,
  });

  // Update incident status
  const updateIncidentStatus = useMutation({
    mutationFn: async ({ incidentId, status, notes }: { incidentId: string; status: IncidentStatus; notes?: string }) => {
      const { error } = await assertSupabase()
        .from('platform_incidents')
        .update({
          status,
          ...(notes ? { resolution_notes: notes } : {}),
          ...(status === 'resolved' ? { resolved_at: new Date().toISOString() } : {}),
        })
        .eq('id', incidentId);
      if (error) throw error;
    },
    onSuccess: invalidateAll,
  });

  // Trigger manual scan
  const triggerScan = useMutation({
    mutationFn: async (params?: { scan_minutes?: number; dry_run?: boolean }) => {
      const { data, error } = await assertSupabase().functions.invoke('platform-error-monitor', {
        body: { source: 'manual', ...params },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      // Delay invalidation to let the scan complete
      setTimeout(invalidateAll, 2000);
    },
  });

  // Assign error to team/person
  const assignError = useMutation({
    mutationFn: async ({ errorId, team, userId }: { errorId: string; team?: string; userId?: string }) => {
      const { error } = await assertSupabase()
        .from('platform_error_logs')
        .update({
          assigned_team: team,
          assigned_to: userId,
          status: 'acknowledged',
        })
        .eq('id', errorId);
      if (error) throw error;
    },
    onSuccess: invalidateAll,
  });

  return {
    updateErrorStatus,
    updateIncidentStatus,
    triggerScan,
    assignError,
  };
}

// ─── Convenience: severity color mapping ─────────────────────
export function useSeverityColors() {
  return useMemo(() => ({
    critical: { bg: '#991B1B', text: '#FCA5A5', border: '#DC2626' },
    high:     { bg: '#92400E', text: '#FCD34D', border: '#F59E0B' },
    medium:   { bg: '#1E3A5F', text: '#93C5FD', border: '#3B82F6' },
    low:      { bg: '#1C3829', text: '#86EFAC', border: '#22C55E' },
  }), []);
}

export function useStatusLabels() {
  return useMemo(() => ({
    detected: 'Detected',
    classifying: 'Classifying',
    auto_resolved: 'Auto-Resolved',
    diagnosing: 'Diagnosing',
    escalated: 'Escalated',
    acknowledged: 'Acknowledged',
    resolved: 'Resolved',
    ignored: 'Ignored',
  }), []);
}
