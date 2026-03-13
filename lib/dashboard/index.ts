/**
 * Dashboard Library - Index
 * 
 * Re-exports all dashboard-related utilities and functions.
 * @module lib/dashboard
 */

// Core fetcher
export { fetchTeacherDashboardData } from './fetchTeacherDashboard';

// Utilities
export {
  formatTimeAgo,
  calculateEstimatedRevenue,
  calculateAttendanceRate,
  getNextLessonTime,
  formatDueDate,
  mapActivityType,
  formatEventTime,
  createEmptyTeacherData,
} from './utils';

// Request deduplication
export {
  createRequestKey,
  dedupeRequest,
  clearPendingRequests,
  getPendingRequestCount,
  isRequestPending,
} from './requestDeduplication';

// Optimistic updates
export {
  optimisticAttendanceUpdate,
  batchOptimisticAttendanceUpdate,
  updateAttendanceInData,
  type AttendanceUpdate,
} from './optimisticUpdates';

// Types
export type { TeacherDashboardData } from '@/types/dashboard';