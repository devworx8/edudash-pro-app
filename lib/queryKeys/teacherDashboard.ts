/**
 * Teacher Dashboard Query Key Factory
 *
 * Centralizes all React Query keys for teacher dashboard data.
 * Uses the factory pattern recommended by TkDodo:
 * @see https://tkdodo.eu/blog/effective-react-query-keys#use-query-key-factories
 *
 * @module lib/queryKeys/teacherDashboard
 */

export const teacherDashboardKeys = {
  /** Root scope — invalidate everything teacher-dashboard-related */
  all: ['teacher-dashboard'] as const,

  /** Teacher profile resolution */
  profile: (userId: string) =>
    [...teacherDashboardKeys.all, 'profile', userId] as const,

  /** School name + tier */
  school: (schoolId: string) =>
    [...teacherDashboardKeys.all, 'school', schoolId] as const,

  /** Classes list with student counts */
  classes: (teacherId: string, schoolId: string | null) =>
    [...teacherDashboardKeys.all, 'classes', teacherId, schoolId] as const,

  /** Today's attendance across all classes */
  attendance: (teacherId: string, date: string) =>
    [...teacherDashboardKeys.all, 'attendance', teacherId, date] as const,

  /** Recent assignments with submission counts */
  assignments: (teacherId: string) =>
    [...teacherDashboardKeys.all, 'assignments', teacherId] as const,

  /** Upcoming events for the school */
  events: (schoolId: string) =>
    [...teacherDashboardKeys.all, 'events', schoolId] as const,

  /** Composed dashboard data (all-in-one) */
  dashboard: (userId: string) =>
    [...teacherDashboardKeys.all, 'composed', userId] as const,

  /** Today's routine data */
  routine: (schoolId: string) =>
    [...teacherDashboardKeys.all, 'routine', schoolId] as const,

  /** Class-specific routine */
  classRoutine: (schoolId: string, classId: string) =>
    [...teacherDashboardKeys.all, 'routine', schoolId, classId] as const,
} as const;
