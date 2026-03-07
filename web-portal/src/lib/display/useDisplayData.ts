'use client';

import { useState, useEffect, useCallback } from 'react';
import type { DisplayData } from '@/lib/display/types';

const REFRESH_INTERVAL_MS = 60 * 1000; // 1 minute

export interface UseDisplayDataOptions {
  orgId: string | null;
  classId?: string | null;
  enabled?: boolean;
}

export function useDisplayData({
  orgId,
  classId = null,
  enabled = true,
}: UseDisplayDataOptions) {
  const [data, setData] = useState<DisplayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!orgId || !enabled) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ org: orgId });
      if (classId) params.set('class', classId);

      const response = await fetch(`/api/display/preview?${params.toString()}`, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'include',
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `Request failed: ${response.status}`);
      }

      const payload = (await response.json()) as DisplayData;
      setData(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load display data');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [orgId, classId, enabled]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
