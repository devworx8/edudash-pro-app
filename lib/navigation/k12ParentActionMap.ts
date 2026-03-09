/**
 * K-12 Parent Dashboard Action Map
 *
 * Single source of truth for all dashboard CTA destinations.
 * Prevents inline route duplication and makes it trivial to
 * assert route validity in tests.
 */

export type K12ParentActionId =
  | 'dashboard_home'
  | 'search'
  | 'notifications'
  | 'profile'
  | 'tutor_session'
  | 'exam_builder'
  | 'exam_history'
  | 'subscription_setup'
  | 'messages'
  | 'grades'
  | 'account'
  | 'children'
  | 'progress'
  | 'attendance'
  | 'payments'
  | 'announcements'
  | 'weekly_menu'
  | 'documents'
  | 'homework'
  | 'weekly_report'
  | 'daily_program'
  | 'timetable'
  | 'groups'
  | 'settings'
  | 'see_all_activity'
  | 'see_all_events'
  | 'annual_calendar'
  | 'event_detail'
  | 'school_communication'
  | 'child_detail'
  | 'calculator';

export interface K12ParentActionConfig {
  /** Destination route path */
  route: string;
  /** Optional params factory — returns search / query params */
  params?: Record<string, string>;
  /** Human-readable label (for telemetry / debugging) */
  label: string;
}

export const K12_PARENT_ACTIONS: Record<K12ParentActionId, K12ParentActionConfig> = {
  dashboard_home: {
    route: '/(k12)/parent/dashboard',
    label: 'Dashboard Home',
  },
  search: {
    route: '/screens/app-search',
    params: { scope: 'all' },
    label: 'Search',
  },
  notifications: {
    route: '/screens/notifications',
    label: 'Notifications',
  },
  profile: {
    route: '/screens/account',
    label: 'Profile / Account',
  },
  tutor_session: {
    route: '/screens/dash-tutor',
    params: { source: 'k12_parent', mode: 'diagnostic' },
    label: 'Start Tutor Session',
  },
  exam_builder: {
    route: '/screens/exam-prep',
    label: 'Exam Builder',
  },
  exam_history: {
    route: '/screens/parent-my-exams',
    label: 'My Exams & Scores',
  },
  subscription_setup: {
    route: '/screens/subscription-setup',
    label: 'Subscription Setup',
  },
  messages: {
    route: '/screens/parent-messages',
    label: 'Messages',
  },
  grades: {
    route: '/screens/grades',
    label: 'Grades',
  },
  account: {
    route: '/screens/account',
    label: 'Account',
  },
  children: {
    route: '/screens/parent-children',
    label: 'My Children',
  },
  progress: {
    route: '/screens/parent-progress',
    label: 'Progress',
  },
  attendance: {
    route: '/screens/parent-attendance',
    label: 'Attendance',
  },
  payments: {
    route: '/screens/parent-payments',
    label: 'Payments',
  },
  announcements: {
    route: '/screens/parent-announcements',
    label: 'Announcements',
  },
  weekly_menu: {
    route: '/screens/parent-menu',
    label: 'Weekly Menu',
  },
  documents: {
    route: '/screens/parent-document-upload',
    label: 'Documents',
  },
  homework: {
    route: '/screens/homework',
    label: 'Homework',
  },
  weekly_report: {
    route: '/screens/parent-weekly-report',
    label: 'Weekly Report',
  },
  daily_program: {
    route: '/screens/parent-daily-program',
    label: 'Daily Routine',
  },
  timetable: {
    route: '/screens/parent-timetable',
    label: 'Timetable',
  },
  groups: {
    route: '/screens/group-management',
    label: 'Study & Teacher Groups',
  },
  settings: {
    route: '/screens/settings',
    label: 'Settings',
  },
  see_all_activity: {
    route: '/screens/parent-activity-feed',
    label: 'See All Recent Activity',
  },
  see_all_events: {
    route: '/screens/calendar',
    params: { source: 'k12_parent', tab: 'events' },
    label: 'See All Events',
  },
  annual_calendar: {
    route: '/screens/parent-annual-calendar',
    label: 'Annual Calendar',
  },
  event_detail: {
    route: '/screens/calendar',
    label: 'Event Detail',
  },
  school_communication: {
    route: '/screens/parent-announcements',
    label: 'School Communication',
  },
  child_detail: {
    route: '/screens/parent-children',
    label: 'Child Detail',
  },
  calculator: {
    route: '/(k12)/student/calculator',
    label: 'Calculator',
  },
};

/**
 * Returns an array of all destination routes used by the K-12 parent dashboard.
 * Useful for route-validity assertions in tests.
 */
export function getAllK12ParentRoutes(): string[] {
  return [...new Set(Object.values(K12_PARENT_ACTIONS).map((a) => a.route))];
}

function stringifyParams(params: Record<string, string | number | boolean | undefined>) {
  return Object.fromEntries(
    Object.entries(params)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, String(value)])
  );
}

/**
 * Builds a router target for a K-12 parent dashboard action.
 * Keeps all CTA routing aligned to the central action map.
 */
export function buildK12ParentActionTarget(
  actionId: K12ParentActionId,
  params?: Record<string, string | number | boolean | undefined>
): string | { pathname: string; params: Record<string, string> } {
  const config = K12_PARENT_ACTIONS[actionId];
  const mergedParams = stringifyParams({
    ...(config.params || {}),
    ...(params || {}),
  });

  if (Object.keys(mergedParams).length === 0) {
    return config.route;
  }

  return {
    pathname: config.route,
    params: mergedParams,
  };
}
