/** Principal Hub — Orchestrator Hook. Composes domain fetchers into `usePrincipalHub()`. */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePettyCashDashboard } from '@/hooks/usePettyCashDashboard';
import { useTranslation } from 'react-i18next';
import { logger } from '@/lib/logger';
import { formatCurrencyCompact } from '@/lib/utils/payment-utils';
import { useFinanceRealtimeRefresh } from '@/hooks/useFinanceRealtimeRefresh';

// Domain sub-modules
import type { PrincipalHubData } from './types';
import { EMPTY_HUB_DATA } from './types';
import { buildMetrics } from './buildMetrics';
import { fetchStatsAndCounts } from './fetchStatsAndCounts';
import { processTeachers } from './processTeachers';
import { fetchFinancials, buildFinancialSummary } from './fetchFinancials';
import { fetchUniformPayments } from './fetchUniforms';
import { fetchRecentActivities } from './fetchActivities';
import { buildSchoolStats, buildCapacityMetrics, buildEnrollmentPipeline } from './assembleHubData';

// Re-export public API
export type { SchoolStats, TeacherSummary, FinancialSummary, UniformPaymentSummary, CapacityMetrics, EnrollmentPipeline, ActivitySummary, PrincipalHubData } from './types';
export { getPendingReportCount } from './types';

// ── Global fetch guard (React StrictMode double-mount) ──────
const __FETCH_GUARD: Record<string, number> =
  ((global as any).__EDUDASH_FETCH_GUARD__ ??= {});

const normalizeErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const asRecord = error as Record<string, unknown>;
    const nested = asRecord.message || asRecord.error || asRecord.details;
    if (typeof nested === 'string' && nested.trim().length > 0) {
      return nested;
    }
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

export const usePrincipalHub = () => {
  const { user, profile } = useAuth();
  const { metrics: pettyCashMetrics } = usePettyCashDashboard();
  const { t } = useTranslation();

  const [data, setData] = useState<PrincipalHubData>({
    ...EMPTY_HUB_DATA,
    schoolName: t('dashboard.no_school_assigned_text'),
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const userId = user?.id ?? null;

  const preschoolId = useMemo((): string | null => {
    if (profile?.organization_id) return profile.organization_id as string;
    const pId = (profile as { preschool_id?: string | null } | null)?.preschool_id ?? null;
    if (pId) return pId;
    const md = user?.user_metadata as
      | { preschool_id?: string | null; organization_id?: string | null }
      | undefined;
    return md?.organization_id ?? md?.preschool_id ?? null;
  }, [
    profile?.organization_id,
    (profile as { preschool_id?: string | null } | null)?.preschool_id,
    user?.user_metadata,
  ]);

  const isMountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const initialFetchComplete = useRef(false);

  useEffect(() => () => { isMountedRef.current = false; }, []);

  // ── Core fetch orchestration ────────────────────────────
  const fetchData = useCallback(
    async (forceRefresh = false) => {
      if (!preschoolId || !userId) {
        setError(!preschoolId ? 'School not assigned' : 'User not authenticated');
        if (isMountedRef.current) setLoading(false);
        return;
      }

      if (inFlightRef.current && !forceRefresh) return;
      if (initialFetchComplete.current && !forceRefresh) return;

      inFlightRef.current = true;
      if (isMountedRef.current) setLoading(true);
      setError(null);
      setLastRefresh(new Date());

      try {
        // Phase 1: parallel — stats + uniforms (both independent)
        const [rawStats, uniformResult] = await Promise.all([
          fetchStatsAndCounts(
            preschoolId,
            user?.user_metadata?.school_name || t('dashboard.your_school'),
          ),
          fetchUniformPayments(preschoolId),
        ]);

        // Phase 2: parallel — teachers, financials, activities (depend on rawStats)
        const [teachers, financialRaw, activities] = await Promise.all([
          processTeachers(rawStats.teachersData, preschoolId, t),
          fetchFinancials(preschoolId, uniformResult.structureIds),
          fetchRecentActivities(preschoolId, {
            studentsCount: rawStats.studentsCount,
            applicationsCount: rawStats.applicationsCount,
          }),
        ]);

        // Phase 3: assemble (sync, CPU-only)
        const stats = buildSchoolStats(
          rawStats,
          financialRaw.monthlyRevenue,
          financialRaw.previousMonthRevenue,
          rawStats.registrationFeesCollected,
          t,
        );
        const financialSummary = buildFinancialSummary(financialRaw, {
          currentBalance: pettyCashMetrics?.currentBalance,
          monthlyExpenses: pettyCashMetrics?.monthlyExpenses,
          pendingTransactionsCount: pettyCashMetrics?.pendingTransactionsCount,
        });
        const capacityMetrics = buildCapacityMetrics(
          rawStats.studentsCount,
          rawStats.preschoolCapacity,
        );
        const enrollmentPipeline = buildEnrollmentPipeline(rawStats);

        logger.info('✅ [PrincipalHub] Data ready', {
          students: stats.students.total,
          teachers: stats.staff.total,
          revenue: formatCurrencyCompact(stats.monthlyRevenue.total),
        });

        if (isMountedRef.current) {
          setData({
            stats,
            teachers,
            financialSummary,
            enrollmentPipeline,
            capacityMetrics,
            recentActivities: activities,
            pendingReportApprovals: rawStats.pendingReportsCount,
            pendingActivityApprovals: rawStats.pendingActivityApprovalsCount,
            pendingHomeworkApprovals: rawStats.pendingHomeworkApprovalsCount,
            uniformPayments: uniformResult.summary,
            schoolId: preschoolId,
            schoolName: rawStats.schoolName,
          });
        }

        if (!initialFetchComplete.current) initialFetchComplete.current = true;
      } catch (err) {
        const normalizedError = normalizeErrorMessage(err) || 'Failed to load dashboard data';
        logger.warn('principalhub.financials.snapshot_fallback', {
          reason: normalizedError,
          preschoolId,
          userId,
          source: 'usePrincipalHub.catch',
        });
        setError(normalizedError);
      } finally {
        if (isMountedRef.current) setLoading(false);
        inFlightRef.current = false;
      }
    },
    [userId, preschoolId, t],
  );

  // ── Trigger on mount / deps change ─────────────────────
  useEffect(() => {
    if (!userId || !preschoolId) return;

    const key = `${userId}:${preschoolId}`;
    const now = Date.now();
    if (now - (__FETCH_GUARD[key] || 0) < 2000) return;
    __FETCH_GUARD[key] = now;

    fetchData().then(() => {
      initialFetchComplete.current = true;
    });

    return () => { initialFetchComplete.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, preschoolId]);

  const refresh = useCallback(() => fetchData(true), [fetchData]);

  useFinanceRealtimeRefresh({
    organizationId: preschoolId,
    enabled: Boolean(preschoolId),
    onRefresh: refresh,
  });

  // ── Convenience helpers ─────────────────────────────────
  const getMetrics = useCallback(
    () => (data.stats ? buildMetrics(data.stats, t) : []),
    [data, t],
  );

  const getTeachersWithStatus = useCallback(() => data.teachers || [], [data.teachers]);

  return {
    data,
    loading,
    error,
    refresh,
    lastRefresh,
    getMetrics,
    getTeachersWithStatus,
    hasData: !!data.stats,
    isReady: !loading && !error && !!data.stats,
    isEmpty: !loading && !data.stats,
  };
};
