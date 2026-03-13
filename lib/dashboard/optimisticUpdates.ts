/**
 * Optimistic Updates Utility for Teacher Dashboard
 * 
 * Provides optimistic UI update patterns for attendance and other mutations.
 * Handles rollback on failure and maintains UI responsiveness.
 * 
 * @module lib/dashboard/optimisticUpdates
 */

import { QueryClient } from '@tanstack/react-query';

/**
 * Attendance update payload
 */
export interface AttendanceUpdate {
  studentId: string;
  date: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  previousStatus?: string;
}

/**
 * Optimistic update context for rollback
 */
interface OptimisticContext {
  previousData: unknown;
  queryKey: readonly unknown[];
}

/**
 * Apply optimistic attendance update with automatic rollback on failure
 * 
 * @param queryClient - React Query client instance
 * @param queryKey - Query key for the data to update
 * @param update - Attendance update to apply
 * @param getUpdater - Function to produce the updated data
 * @param mutationFn - Actual mutation function to call
 * 
 * @example
 * await optimisticAttendanceUpdate(
 *   queryClient,
 *   teacherDashboardKeys.dashboard(userId),
 *   { studentId: '123', date: '2024-01-15', status: 'present' },
 *   (old, update) => updateAttendanceInData(old, update),
 *   async (update) => await submitAttendance(update)
 * );
 */
export async function optimisticAttendanceUpdate<TData>(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  update: AttendanceUpdate,
  getUpdater: (oldData: TData | undefined, update: AttendanceUpdate) => TData,
  mutationFn: (update: AttendanceUpdate) => Promise<void>
): Promise<void> {
  // Cancel any ongoing refetches to prevent overwriting our optimistic update
  await queryClient.cancelQueries({ queryKey });

  // Snapshot the previous data for rollback
  const previousData = queryClient.getQueryData<TData>(queryKey);

  // Optimistically update the cache
  queryClient.setQueryData<TData>(queryKey, (old) => getUpdater(old, update));

  try {
    // Perform the actual mutation
    await mutationFn(update);
  } catch (error) {
    // Rollback on failure
    queryClient.setQueryData(queryKey, previousData);
    throw error;
  }

  // Refetch to ensure sync with server (optional, can be skipped for better UX)
  // await queryClient.invalidateQueries({ queryKey });
}

/**
 * Helper to update attendance in teacher dashboard data
 */
export function updateAttendanceInData(
  data: any,
  update: AttendanceUpdate
): any {
  if (!data) return data;

  // Deep clone to avoid mutation
  const newData = JSON.parse(JSON.stringify(data));

  // Update myClasses attendance if present
  if (newData.myClasses) {
    newData.myClasses = newData.myClasses.map((cls: any) => {
      if (!cls.__studentIds?.includes(update.studentId)) return cls;

      // Recalculate attendance
      const wasPresent = update.previousStatus === 'present';
      const isPresent = update.status === 'present';

      if (wasPresent !== isPresent) {
        cls.presentToday = (cls.presentToday || 0) + (isPresent ? 1 : -1);
        cls.attendanceRate = cls.studentCount > 0
          ? Math.round((cls.presentToday / cls.studentCount) * 100)
          : 0;
      }

      return cls;
    });
  }

  // Update today's highlights if present
  if (newData.attendanceRate !== undefined) {
    // Recalculate total attendance
    let totalPresent = 0;
    let totalStudents = 0;

    if (newData.myClasses) {
      newData.myClasses.forEach((cls: any) => {
        totalPresent += cls.presentToday || 0;
        totalStudents += cls.studentCount || 0;
      });
    }

    newData.attendanceRate = totalStudents > 0
      ? Math.round((totalPresent / totalStudents) * 100)
      : 0;
    newData.presentToday = totalPresent;
  }

  return newData;
}

/**
 * Batch optimistic update for multiple attendance records
 */
export async function batchOptimisticAttendanceUpdate<TData>(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  updates: AttendanceUpdate[],
  getUpdater: (oldData: TData | undefined, updates: AttendanceUpdate[]) => TData,
  mutationFn: (updates: AttendanceUpdate[]) => Promise<void>
): Promise<void> {
  await queryClient.cancelQueries({ queryKey });

  const previousData = queryClient.getQueryData<TData>(queryKey);

  queryClient.setQueryData<TData>(queryKey, (old) => getUpdater(old, updates));

  try {
    await mutationFn(updates);
  } catch (error) {
    queryClient.setQueryData(queryKey, previousData);
    throw error;
  }
}