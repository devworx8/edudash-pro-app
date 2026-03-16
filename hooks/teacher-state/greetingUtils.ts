import type { TFunction } from 'i18next';

/**
 * Greeting based on time of day + teacher name.
 */
export const getGreeting = (t: TFunction, teacherName: string): string => {
  const hour = new Date().getHours();
  if (hour < 12) return t('dashboard.good_morning') + ', ' + teacherName;
  if (hour < 18) return t('dashboard.good_afternoon') + ', ' + teacherName;
  return t('dashboard.good_evening') + ', ' + teacherName;
};

/**
 * Contextual subtitle — surfaces the most relevant "what's next" info.
 */
export const getContextualSubtitle = (t: TFunction, dashboardData: any): string => {
  const pending = dashboardData?.pendingGrading ?? 0;
  const upcoming = dashboardData?.upcomingLessons ?? 0;
  const students = dashboardData?.totalStudents ?? 0;

  if (pending > 0) {
    return pending === 1
      ? t('teacher.subtitle_pending_one', { defaultValue: 'You have 1 assignment to grade today' })
      : t('teacher.subtitle_pending', {
          defaultValue: 'You have {{count}} assignments to grade',
          count: pending,
        });
  }

  if (upcoming > 0) {
    return upcoming === 1
      ? t('teacher.subtitle_upcoming_one', { defaultValue: 'You have 1 lesson coming up today' })
      : t('teacher.subtitle_upcoming', {
          defaultValue: '{{count}} lessons planned for today',
          count: upcoming,
        });
  }

  if (students > 0) {
    return t('teacher.subtitle_caught_up', {
      defaultValue: 'All caught up! {{count}} students are learning with you',
      count: students,
    });
  }

  return t('teacher.dashboard_subtitle');
};
