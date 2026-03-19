// Hook for principal review of teacher submissions
// WARP.md compliant (≤200 lines)

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { extractOrganizationId } from '@/lib/tenant/compat';
import { logger } from '@/lib/logger';
import {
  listSubmissions,
  reviewSubmission,
  incorporateSubmission,
  getSubmissionCounts,
  type TeacherSubmission,
  type SubmissionStatus,
  type SubmissionCategory,
  type SubmissionCounts,
} from '@/lib/services/yearPlanInputService';

type ShowAlert = (config: {
  title: string;
  message?: string;
  type?: 'info' | 'warning' | 'success' | 'error';
}) => void;

interface Filters {
  status: SubmissionStatus | 'all';
  category: SubmissionCategory | 'all';
  windowId?: string;
}

interface UseTeacherInputReviewReturn {
  submissions: TeacherSubmission[];
  counts: SubmissionCounts | null;
  filters: Filters;
  loading: boolean;
  refreshing: boolean;
  setFilters: (f: Partial<Filters>) => void;
  handleRefresh: () => void;
  handleReview: (id: string, status: SubmissionStatus, notes: string) => Promise<boolean>;
  handleBulkApprove: (ids: string[]) => Promise<void>;
  handleIncorporate: (submissionId: string, target: { targetType: 'monthly_entry' | 'curriculum_theme'; academicYear?: number; monthIndex?: number; bucket?: string; termId?: string; weekNumber?: number }) => Promise<void>;
}

export function useTeacherInputReview(showAlert: ShowAlert, initialWindowId?: string): UseTeacherInputReviewReturn {
  const { profile, user } = useAuth();
  const orgId = extractOrganizationId(profile);
  const userId = user?.id;

  const [submissions, setSubmissions] = useState<TeacherSubmission[]>([]);
  const [counts, setCounts] = useState<SubmissionCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFiltersState] = useState<Filters>({
    status: 'all',
    category: 'all',
    windowId: initialWindowId,
  });

  const setFilters = useCallback((partial: Partial<Filters>) => {
    setFiltersState((prev) => ({ ...prev, ...partial }));
  }, []);

  const fetchData = useCallback(async () => {
    if (!orgId) return;
    try {
      const [subs, c] = await Promise.all([
        listSubmissions({
          preschoolId: orgId,
          windowId: filters.windowId,
          status: filters.status === 'all' ? undefined : filters.status,
          category: filters.category === 'all' ? undefined : filters.category,
        }),
        getSubmissionCounts(orgId),
      ]);
      setSubmissions(subs);
      setCounts(c);
    } catch (error) {
      logger.error('Error fetching submissions for review:', error);
      showAlert({ title: 'Error', message: 'Failed to load submissions', type: 'error' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orgId, filters.windowId, filters.status, filters.category]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const handleReview = useCallback(async (id: string, status: SubmissionStatus, notes: string): Promise<boolean> => {
    if (!orgId || !userId) return false;
    try {
      const updated = await reviewSubmission({
        id,
        preschoolId: orgId,
        status,
        reviewedBy: userId,
        principalNotes: notes || undefined,
      });
      setSubmissions((prev) => prev.map((s) => s.id === id ? updated : s));
      const labels: Record<string, string> = { approved: 'Approved', modified: 'Modified & Approved', declined: 'Declined' };
      showAlert({ title: labels[status] || 'Updated', type: 'success' });
      // Refresh counts
      getSubmissionCounts(orgId).then(setCounts).catch(() => {});
      return true;
    } catch (error) {
      logger.error('Error reviewing submission:', error);
      showAlert({ title: 'Error', message: 'Failed to review submission', type: 'error' });
      return false;
    }
  }, [orgId, userId, showAlert]);

  const handleBulkApprove = useCallback(async (ids: string[]) => {
    if (!orgId || !userId) return;
    let successCount = 0;
    for (const id of ids) {
      try {
        const updated = await reviewSubmission({
          id,
          preschoolId: orgId,
          status: 'approved',
          reviewedBy: userId,
        });
        setSubmissions((prev) => prev.map((s) => s.id === id ? updated : s));
        successCount++;
      } catch (error) {
        logger.error(`Error bulk-approving ${id}:`, error);
      }
    }
    showAlert({ title: 'Bulk Approved', message: `${successCount} of ${ids.length} submissions approved`, type: 'success' });
    getSubmissionCounts(orgId).then(setCounts).catch(() => {});
  }, [orgId, userId, showAlert]);

  const handleIncorporate = useCallback(async (
    submissionId: string,
    target: { targetType: 'monthly_entry' | 'curriculum_theme'; academicYear?: number; monthIndex?: number; bucket?: string; termId?: string; weekNumber?: number },
  ) => {
    if (!orgId || !userId) return;
    try {
      await incorporateSubmission({
        submissionId,
        preschoolId: orgId,
        userId,
        ...target,
      });
      showAlert({ title: 'Placed in Plan', message: `Submission added to ${target.targetType === 'monthly_entry' ? 'monthly plan' : 'curriculum themes'}`, type: 'success' });
      fetchData();
    } catch (error) {
      logger.error('Error incorporating submission:', error);
      showAlert({ title: 'Error', message: 'Failed to place in plan', type: 'error' });
    }
  }, [orgId, userId, fetchData, showAlert]);

  return {
    submissions, counts, filters, loading, refreshing,
    setFilters, handleRefresh, handleReview, handleBulkApprove, handleIncorporate,
  };
}
