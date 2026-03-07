'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PostgrestError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

interface ParentOverviewMetrics {
  attendanceRate: number;
  missedCalls: number;
}

interface UseParentOverviewMetricsReturn {
  metrics: ParentOverviewMetrics;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

interface UseParentOverviewMetricsParams {
  userId?: string;
  childIds: string[];
  organizationId?: string | null;
}

interface AttendanceRow {
  student_id: string;
  status: string | null;
}

interface ActiveCallRow {
  id: string;
  status: string | null;
  answered_at: string | null;
  duration_seconds: number | null;
}

interface AttendancePayload {
  new: { student_id?: string | null } | null;
}

const isMissingSchema = (error?: PostgrestError | null) => {
  if (!error) return false;
  return error.code === '42P01' || error.code === '42703';
};

export function useParentOverviewMetrics({
  userId,
  childIds,
  organizationId,
}: UseParentOverviewMetricsParams): UseParentOverviewMetricsReturn {
  const [metrics, setMetrics] = useState<ParentOverviewMetrics>({
    attendanceRate: 0,
    missedCalls: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);
  const childIdKey = useMemo(() => childIds.join('|'), [childIds]);

  const loadMetrics = useCallback(async () => {
    if (!userId || childIds.length === 0) {
      setMetrics({ attendanceRate: 0, missedCalls: 0 });
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const today = new Date().toISOString().split('T')[0];

      // Attendance rate
      let attendanceRate = 0;
      const attendanceQuery = supabase
        .from('attendance')
        .select('student_id, status')
        .in('student_id', childIds)
        .eq('attendance_date', today);

      if (organizationId) {
        attendanceQuery.eq('organization_id', organizationId);
      }

      const { data: attendanceRows, error: attendanceError } = await attendanceQuery;

      if (!attendanceError && attendanceRows) {
        const rows = attendanceRows as AttendanceRow[];
        const presentCount = rows.filter((row) => String(row.status || '').toLowerCase() === 'present').length;
        attendanceRate = childIds.length > 0 ? Math.round((presentCount / childIds.length) * 100) : 0;
      } else if (attendanceError && !isMissingSchema(attendanceError)) {
        setError(attendanceError.message);
      }

      // Missed calls
      let missedCalls = 0;
      const { data: callsData, error: callsError } = await supabase
        .from('active_calls')
        .select('id, status, answered_at, duration_seconds')
        .eq('callee_id', userId)
        .or('status.eq.missed,and(status.eq.ended,answered_at.is.null)');

      if (!callsError && callsData) {
        const calls = callsData as ActiveCallRow[];
        missedCalls = calls.filter((call) => {
          const status = String(call.status || '').toLowerCase();
          if (status === 'missed') return true;
          if (status === 'ended' && !call.answered_at) {
            return call.duration_seconds == null || call.duration_seconds === 0;
          }
          return false;
        }).length;
      } else if (callsError && !isMissingSchema(callsError)) {
        setError(callsError.message);
      }

      setMetrics({
        attendanceRate,
        missedCalls,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load metrics');
    } finally {
      setLoading(false);
    }
  }, [childIds, organizationId, supabase, userId]);

  useEffect(() => {
    void loadMetrics();
  }, [childIdKey, loadMetrics]);

  useEffect(() => {
    if (!userId) return;

    const attendanceChannel = supabase
      .channel(`parent-overview-attendance-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance' },
        (payload: AttendancePayload) => {
          const studentId = payload.new?.student_id ?? null;
          if (studentId && childIds.includes(studentId)) {
            void loadMetrics();
          }
        }
      )
      .subscribe();

    const callsChannel = supabase
      .channel(`parent-overview-calls-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'active_calls', filter: `callee_id=eq.${userId}` },
        () => {
          void loadMetrics();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(attendanceChannel);
      supabase.removeChannel(callsChannel);
    };
  }, [childIds, loadMetrics, supabase, userId]);

  return {
    metrics,
    loading,
    error,
    refetch: loadMetrics,
  };
}
