/**
 * usePrincipalHub — Web data layer for the Principal Dashboard.
 *
 * Mirrors the mobile `hooks/principal-hub/` but uses `@supabase/ssr`
 * browser client and returns a simpler shape suited to the web dashboard.
 *
 * ≤200 lines (WARP hook limit).
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

// ── Types ────────────────────────────────────────────────

export interface PrincipalMetrics {
  totalStudents: number;
  totalTeachers: number;
  totalClasses: number;
  revenue: number;
  pendingPayments: number;
  upcomingEvents: number;
}

export interface RecentActivity {
  id: string;
  type: 'registration' | 'student' | 'system';
  title: string;
  description: string;
  timestamp: string;
}

export interface PrincipalHubResult {
  metrics: PrincipalMetrics;
  activities: RecentActivity[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  lastRefresh: Date;
}

const EMPTY_METRICS: PrincipalMetrics = {
  totalStudents: 0,
  totalTeachers: 0,
  totalClasses: 0,
  revenue: 0,
  pendingPayments: 0,
  upcomingEvents: 0,
};

// ── Hook ─────────────────────────────────────────────────

export function usePrincipalHub(preschoolId?: string | null): PrincipalHubResult {
  const supabase = createClient();
  const [metrics, setMetrics] = useState<PrincipalMetrics>(EMPTY_METRICS);
  const [activities, setActivities] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);

  useEffect(() => () => { mountedRef.current = false; }, []);

  const fetchAll = useCallback(async () => {
    if (!preschoolId) {
      setLoading(false);
      return;
    }
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    setError(null);
    setLastRefresh(new Date());

    try {
      // Parallel: counts + financials + activities
      const [studentsRes, teachersRes, classesRes, regRes, studentsListRes] = await Promise.all([
        supabase
          .from('students')
          .select('*', { count: 'exact', head: true })
          .eq('preschool_id', preschoolId)
          .eq('status', 'active')
          .eq('is_active', true),
        supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('preschool_id', preschoolId)
          .eq('role', 'teacher'),
        supabase
          .from('classes')
          .select('*', { count: 'exact', head: true })
          .eq('preschool_id', preschoolId),
        supabase
          .from('registration_requests')
          .select('registration_fee_amount, registration_fee_paid, payment_verified, status')
          .eq('organization_id', preschoolId),
        supabase
          .from('students')
          .select('id, first_name, last_name, enrollment_date, created_at, status')
          .eq('preschool_id', preschoolId)
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

      // Compute financials
      let revenue = 0;
      let pendingPayments = 0;
      if (regRes.data) {
        const verified = regRes.data.filter(
          (r: any) => r.payment_verified && r.status === 'approved',
        );
        const pending = regRes.data.filter(
          (r: any) => !r.payment_verified && r.registration_fee_amount && r.status !== 'rejected',
        );
        revenue = verified.reduce(
          (sum: number, r: any) => sum + (parseFloat(r.registration_fee_amount as any) || 0),
          0,
        );
        pendingPayments = pending.length;
      }

      // Build activities
      const recentActivities: RecentActivity[] = (studentsListRes.data || []).map(
        (s: any) => ({
          id: `student-${s.id}`,
          type: 'student' as const,
          title: s.status === 'active' ? 'Student Enrolled' : 'Student Added',
          description: `${s.first_name} ${s.last_name}`,
          timestamp: s.enrollment_date || s.created_at,
        }),
      );
      recentActivities.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );

      if (mountedRef.current) {
        setMetrics({
          totalStudents: studentsRes.count || 0,
          totalTeachers: teachersRes.count || 0,
          totalClasses: classesRes.count || 0,
          revenue,
          pendingPayments,
          upcomingEvents: 0,
        });
        setActivities(recentActivities.slice(0, 5));
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
      }
    } finally {
      if (mountedRef.current) setLoading(false);
      inFlightRef.current = false;
    }
  }, [preschoolId, supabase]);

  useEffect(() => {
    if (!preschoolId) return;
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preschoolId]);

  const refresh = useCallback(async () => {
    inFlightRef.current = false;
    await fetchAll();
  }, [fetchAll]);

  return { metrics, activities, loading, error, refresh, lastRefresh };
}
