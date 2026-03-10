/**
 * Dashboard Prefetch Hook
 * 
 * Prefetches commonly accessed data when the dashboard mounts,
 * reducing perceived latency for subsequent navigation.
 * 
 * @module hooks/useDashboardPrefetch
 */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { teacherDashboardKeys } from '@/lib/queryKeys/teacherDashboard';
import { fetchTeacherDashboardData } from '@/lib/dashboard/fetchTeacherDashboard';
import { fetchTodayRoutine } from '@/lib/dashboard/fetchTeacherTodayRoutine';

interface UseDashboardPrefetchOptions {
  /**
   * Enable prefetching (default: true)
   */
  enabled?: boolean;
  /**
   * Delay before prefetching starts (default: 500ms)
   * Allows initial render to complete first
   */
  delayMs?: number;
  /**
   * Prefetch routine data (default: true)
   */
  prefetchRoutine?: boolean;
}

/**
 * Prefetch dashboard data on mount for faster subsequent loads.
 * 
 * @example
 * function TeacherDashboard() {
 *   useDashboardPrefetch({ enabled: true });
 *   // ... rest of component
 * }
 */
export function useDashboardPrefetch(options: UseDashboardPrefetchOptions = {}) {
  const {
    enabled = true,
    delayMs = 500,
    prefetchRoutine = true,
  } = options;

  const { user } = useAuth();
  const queryClient = useQueryClient();
  const hasPrefetched = useRef(false);

  useEffect(() => {
    if (!enabled || !user?.id || hasPrefetched.current) return;

    // Mark as prefetched to avoid duplicate prefetches
    hasPrefetched.current = true;

    const prefetchData = async () => {
      // Small delay to let initial render complete
      await new Promise(resolve => setTimeout(resolve, delayMs));

      // Prefetch dashboard data if not already cached
      const dashboardKey = teacherDashboardKeys.dashboard(user.id);
      const existingData = queryClient.getQueryData(dashboardKey);

      if (!existingData) {
        try {
          const data = await fetchTeacherDashboardData(user.id);
          queryClient.setQueryData(dashboardKey, data);
        } catch (error) {
          // Prefetch failure is non-fatal
          if (__DEV__) {
            console.log('[useDashboardPrefetch] Prefetch failed:', error);
          }
        }
      }

      // Prefetch routine data if enabled
      if (prefetchRoutine) {
        const dashboardData = queryClient.getQueryData(dashboardKey) as any;
        if (dashboardData?.myClasses?.length) {
          const schoolId = dashboardData.schoolId;
          if (schoolId) {
            try {
              const classIds = dashboardData.myClasses.map((c: any) => c.id);
              const routineData = await fetchTodayRoutine(schoolId, classIds);
              
              // Cache routine data
              queryClient.setQueryData(
                teacherDashboardKeys.routine(schoolId),
                routineData
              );
            } catch (error) {
              if (__DEV__) {
                console.log('[useDashboardPrefetch] Routine prefetch failed:', error);
              }
            }
          }
        }
      }
    };

    void prefetchData();
  }, [enabled, user?.id, delayMs, prefetchRoutine, queryClient]);

  // Reset prefetch flag when user changes
  useEffect(() => {
    hasPrefetched.current = false;
  }, [user?.id]);
}

/**
 * Hook return type - currently void as this is a side-effect only hook
 */
export type UseDashboardPrefetchReturn = void;