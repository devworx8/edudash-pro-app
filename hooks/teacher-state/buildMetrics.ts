import type { TFunction } from 'i18next';

/**
 * Build the 4-tile metrics array for the teacher dashboard.
 */
export const buildMetrics = (t: TFunction, theme: any, dashboardData: any) => [
  {
    title: t('teacher.students_total'),
    value: String(dashboardData?.totalStudents ?? 0),
    icon: 'people',
    color: theme.primary,
    trend: 'stable',
  },
  {
    title: t('teacher.classes_active'),
    value: String(dashboardData?.totalClasses ?? 0),
    icon: 'school',
    color: theme.secondary,
    trend: 'good',
  },
  {
    title: t('teacher.assignments_pending'),
    value: String(dashboardData?.pendingGrading ?? 0),
    icon: 'document-text',
    color: theme.warning,
    trend: 'attention',
  },
  {
    title: t('teacher.upcoming_lessons'),
    value: String(dashboardData?.upcomingLessons ?? 0),
    icon: 'calendar',
    color: theme.success,
    trend: 'up',
  },
];
