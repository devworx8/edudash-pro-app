/**
 * useRoutineSharing Hook
 * 
 * React hook for routine sharing functionality with:
 * - React Query for caching and optimistic updates
 * - Real-time subscriptions for live updates
 * - Automatic cache invalidation
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { RoutineSharingService, RoutineShare, ShareRoutineParams } from '@/lib/services/routineSharingService';
import { logger } from '@/lib/logger';

// Query keys
const routineShareKeys = {
  all: ['routine-shares'] as const,
  teacher: (teacherId: string) => [...routineShareKeys.all, 'teacher', teacherId] as const,
  parent: (parentId: string) => [...routineShareKeys.all, 'parent', parentId] as const,
  stats: (programId: string) => [...routineShareKeys.all, 'stats', programId] as const,
};

/**
 * Hook for fetching routines shared with a teacher
 */
export function useTeacherRoutines(teacherId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: routineShareKeys.teacher(teacherId || ''),
    queryFn: () => teacherId ? RoutineSharingService.getSharedRoutinesForTeacher(teacherId) : [],
    enabled: !!teacherId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Subscribe to real-time updates
  useEffect(() => {
    if (!teacherId) return;

    const unsubscribe = RoutineSharingService.subscribeToRoutineShares(
      teacherId,
      ({ eventType, share }) => {
        logger.info('useTeacherRoutines', 'Received real-time update', { eventType, shareId: share.id });
        
        // Invalidate and refetch
        queryClient.invalidateQueries({ queryKey: routineShareKeys.teacher(teacherId) });
      }
    );

    return unsubscribe;
  }, [teacherId, queryClient]);

  return query;
}

/**
 * Hook for fetching routines shared with a parent
 */
export function useParentRoutines(parentId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: routineShareKeys.parent(parentId || ''),
    queryFn: () => parentId ? RoutineSharingService.getSharedRoutinesForParent(parentId) : [],
    enabled: !!parentId,
    staleTime: 5 * 60 * 1000,
  });

  // Subscribe to real-time updates
  useEffect(() => {
    if (!parentId) return;

    const unsubscribe = RoutineSharingService.subscribeToRoutineShares(
      parentId,
      ({ eventType, share }) => {
        logger.info('useParentRoutines', 'Received real-time update', { eventType, shareId: share.id });
        
        queryClient.invalidateQueries({ queryKey: routineShareKeys.parent(parentId) });
      }
    );

    return unsubscribe;
  }, [parentId, queryClient]);

  return query;
}

/**
 * Hook for sharing a routine
 */
export function useShareRoutine() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: ShareRoutineParams) => RoutineSharingService.shareRoutine(params),
    onSuccess: (data, variables) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: routineShareKeys.all });
      
      logger.info('useShareRoutine', 'Routine shared successfully', {
        shareId: data.id,
        classCount: variables.classIds.length,
      });
    },
    onError: (error) => {
      logger.error('useShareRoutine', 'Failed to share routine', { error });
    },
  });
}

/**
 * Hook for marking a routine as viewed
 */
export function useMarkRoutineViewed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ shareId, userId }: { shareId: string; userId: string }) =>
      RoutineSharingService.markAsViewed(shareId, userId),
    onSuccess: (_, { userId }) => {
      // Invalidate user's routines
      queryClient.invalidateQueries({ queryKey: routineShareKeys.teacher(userId) });
      queryClient.invalidateQueries({ queryKey: routineShareKeys.parent(userId) });
    },
  });
}

/**
 * Hook for revoking a routine share
 */
export function useRevokeRoutineShare() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (shareId: string) => RoutineSharingService.revokeShare(shareId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: routineShareKeys.all });
    },
  });
}

/**
 * Hook for routine share statistics
 */
export function useRoutineShareStats(weeklyProgramId: string | undefined) {
  return useQuery({
    queryKey: routineShareKeys.stats(weeklyProgramId || ''),
    queryFn: () => weeklyProgramId ? RoutineSharingService.getShareStats(weeklyProgramId) : null,
    enabled: !!weeklyProgramId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Combined hook for all routine sharing operations
 */
export function useRoutineSharing(options?: { teacherId?: string; parentId?: string }) {
  const teacherRoutines = useTeacherRoutines(options?.teacherId);
  const parentRoutines = useParentRoutines(options?.parentId);
  const shareMutation = useShareRoutine();
  const markViewedMutation = useMarkRoutineViewed();
  const revokeMutation = useRevokeRoutineShare();

  return {
    // Queries
    teacherRoutines: teacherRoutines.data || [],
    parentRoutines: parentRoutines.data || [],
    isLoading: teacherRoutines.isLoading || parentRoutines.isLoading,
    isRefreshing: teacherRoutines.isFetching || parentRoutines.isFetching,
    error: teacherRoutines.error || parentRoutines.error,

    // Mutations
    shareRoutine: shareMutation.mutateAsync,
    isSharing: shareMutation.isPending,
    markAsViewed: markViewedMutation.mutateAsync,
    revokeShare: revokeMutation.mutateAsync,

    // Actions
    refresh: () => {
      if (options?.teacherId) teacherRoutines.refetch();
      if (options?.parentId) parentRoutines.refetch();
    },
  };
}

export default useRoutineSharing;