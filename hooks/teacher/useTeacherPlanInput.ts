// Hook for teacher year plan input — fetches open windows + own submissions
// WARP.md compliant (≤200 lines)

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { extractOrganizationId } from '@/lib/tenant/compat';
import { logger } from '@/lib/logger';
import {
  listInputWindows,
  listSubmissions,
  createSubmission,
  type InputWindow,
  type TeacherSubmission,
  type SubmissionCategory,
  type SubmissionPriority,
} from '@/lib/services/yearPlanInputService';

type ShowAlert = (config: {
  title: string;
  message?: string;
  type?: 'info' | 'warning' | 'success' | 'error';
}) => void;

interface UseTeacherPlanInputReturn {
  windows: InputWindow[];
  submissions: TeacherSubmission[];
  loading: boolean;
  refreshing: boolean;
  submitting: boolean;
  handleRefresh: () => void;
  handleSubmit: (data: {
    windowId: string;
    category: SubmissionCategory;
    title: string;
    description?: string;
    targetTermNumber?: number;
    targetMonth?: number;
    targetWeekNumber?: number;
    suggestedDate?: string;
    suggestedBucket?: string;
    learningObjectives?: string[];
    materialsNeeded?: string[];
    estimatedCost?: string;
    ageGroups?: string[];
    priority?: SubmissionPriority;
  }) => Promise<boolean>;
}

export function useTeacherPlanInput(showAlert: ShowAlert): UseTeacherPlanInputReturn {
  const { profile, user } = useAuth();
  const orgId = extractOrganizationId(profile);
  const userId = user?.id;

  const [windows, setWindows] = useState<InputWindow[]>([]);
  const [submissions, setSubmissions] = useState<TeacherSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    if (!orgId || !userId) return;
    try {
      const [w, s] = await Promise.all([
        listInputWindows(orgId, true),
        listSubmissions({ preschoolId: orgId, teacherId: userId }),
      ]);
      // Filter windows to only currently-open ones for teacher view
      const now = Date.now();
      const openWindows = w.filter((win) => {
        const opens = new Date(win.opens_at).getTime();
        const closes = new Date(win.closes_at).getTime();
        return win.is_active && now >= opens && now <= closes;
      });
      setWindows(openWindows);
      setSubmissions(s);
    } catch (error) {
      logger.error('Error fetching teacher plan input:', error);
      showAlert({ title: 'Error', message: 'Failed to load planning data', type: 'error' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orgId, userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const handleSubmit = useCallback(async (data: Parameters<UseTeacherPlanInputReturn['handleSubmit']>[0]): Promise<boolean> => {
    if (!orgId || !userId) return false;
    if (!data.title.trim()) {
      showAlert({ title: 'Required', message: 'Please enter a title', type: 'warning' });
      return false;
    }
    setSubmitting(true);
    try {
      const newSub = await createSubmission({
        preschoolId: orgId,
        windowId: data.windowId,
        submittedBy: userId,
        category: data.category,
        title: data.title,
        description: data.description,
        targetTermNumber: data.targetTermNumber,
        targetMonth: data.targetMonth,
        targetWeekNumber: data.targetWeekNumber,
        suggestedDate: data.suggestedDate,
        suggestedBucket: data.suggestedBucket,
        learningObjectives: data.learningObjectives,
        materialsNeeded: data.materialsNeeded,
        estimatedCost: data.estimatedCost,
        ageGroups: data.ageGroups,
        priority: data.priority,
      });
      setSubmissions((prev) => [newSub, ...prev]);
      showAlert({ title: 'Submitted', message: 'Your input has been sent to the principal', type: 'success' });
      return true;
    } catch (error) {
      logger.error('Error submitting plan input:', error);
      showAlert({ title: 'Error', message: 'Failed to submit. Please try again.', type: 'error' });
      return false;
    } finally {
      setSubmitting(false);
    }
  }, [orgId, userId, showAlert]);

  return { windows, submissions, loading, refreshing, submitting, handleRefresh, handleSubmit };
}
