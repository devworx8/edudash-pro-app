// Hook for principal input window management
// WARP.md compliant (≤200 lines)

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { extractOrganizationId } from '@/lib/tenant/compat';
import { logger } from '@/lib/logger';
import {
  listInputWindows,
  createInputWindow,
  updateInputWindow,
  getSubmissionCounts,
  type InputWindow,
  type SubmissionCounts,
  type InputWindowType,
  type SubmissionCategory,
} from '@/lib/services/yearPlanInputService';

type ShowAlert = (config: {
  title: string;
  message?: string;
  type?: 'info' | 'warning' | 'success' | 'error';
}) => void;

interface UseInputWindowsReturn {
  windows: InputWindow[];
  counts: SubmissionCounts | null;
  loading: boolean;
  refreshing: boolean;
  handleRefresh: () => void;
  handleCreate: (data: {
    title: string;
    description?: string;
    windowType: InputWindowType;
    academicYear: number;
    targetTermId?: string;
    opensAt: string;
    closesAt: string;
    allowedCategories?: SubmissionCategory[];
  }) => Promise<boolean>;
  handleToggleActive: (window: InputWindow) => Promise<void>;
}

export function useInputWindows(showAlert: ShowAlert): UseInputWindowsReturn {
  const { profile, user } = useAuth();
  const orgId = extractOrganizationId(profile);
  const userId = user?.id;

  const [windows, setWindows] = useState<InputWindow[]>([]);
  const [counts, setCounts] = useState<SubmissionCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    if (!orgId) return;
    try {
      const [w, c] = await Promise.all([
        listInputWindows(orgId),
        getSubmissionCounts(orgId),
      ]);
      setWindows(w);
      setCounts(c);
    } catch (error) {
      logger.error('Error fetching input windows:', error);
      showAlert({ title: 'Error', message: 'Failed to load input windows', type: 'error' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const handleCreate = useCallback(async (data: Parameters<UseInputWindowsReturn['handleCreate']>[0]): Promise<boolean> => {
    if (!orgId || !userId) return false;
    try {
      const newWindow = await createInputWindow({
        preschoolId: orgId,
        createdBy: userId,
        title: data.title,
        description: data.description,
        windowType: data.windowType,
        academicYear: data.academicYear,
        targetTermId: data.targetTermId,
        opensAt: data.opensAt,
        closesAt: data.closesAt,
        allowedCategories: data.allowedCategories,
      });
      setWindows((prev) => [newWindow, ...prev]);
      showAlert({ title: 'Created', message: 'Input window created. Teachers can now submit.', type: 'success' });
      return true;
    } catch (error) {
      logger.error('Error creating input window:', error);
      showAlert({ title: 'Error', message: 'Failed to create window', type: 'error' });
      return false;
    }
  }, [orgId, userId, showAlert]);

  const handleToggleActive = useCallback(async (w: InputWindow) => {
    if (!orgId) return;
    try {
      const updated = await updateInputWindow(w.id, orgId, { is_active: !w.is_active });
      setWindows((prev) => prev.map((win) => win.id === updated.id ? updated : win));
      showAlert({
        title: updated.is_active ? 'Reopened' : 'Closed',
        message: updated.is_active ? 'Window is now open for teacher input' : 'Window closed. No new submissions.',
        type: 'success',
      });
    } catch (error) {
      logger.error('Error toggling input window:', error);
      showAlert({ title: 'Error', message: 'Failed to update window', type: 'error' });
    }
  }, [orgId, showAlert]);

  return { windows, counts, loading, refreshing, handleRefresh, handleCreate, handleToggleActive };
}
