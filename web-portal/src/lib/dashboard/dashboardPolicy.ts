import type { ResolvedSchoolType } from '@/lib/tenant/schoolTypeResolver';

export type DashboardPolicyRole = 'parent' | 'teacher' | 'principal';

type PolicyMap = Record<ResolvedSchoolType, Record<DashboardPolicyRole, ReadonlySet<string>>>;

const makeSet = <T extends string>(ids: T[]): ReadonlySet<string> => new Set(ids);

const POLICY: PolicyMap = {
  preschool: {
    parent: makeSet([
      'view_homework',
      'daily_program',
      'assigned_lessons',
      'check_attendance',
      'activity_feed',
      'learning_hub',
      'dash_playground',
      'family_activity',
      'upload_progress',
      'messages',
      'events',
      'calls',
      'ai_help',
      'generate_image',
      'dash_tutor',
      'upgrade',
      'payments',
      'dash_grade_test',
      'dev_notifications',
    ]),
    teacher: makeSet([
      'browse_lessons',
      'create_lesson',
      'quick_lesson',
      'create_activity',
      'take_attendance',
      'start_live_lesson',
      'assign_lesson',
      'assign_homework',
      'my_class',
      'room_display_connect',
      'birthday_chart',
      'weekly_menu',
      'messages',
      'manage_groups',
      'request_petty_cash',
      'student_reports',
      'family_activity_review',
      'reputation',
      'generate_image',
      'ai_assistant',
      'call_parent',
    ]),
    principal: makeSet([
      'students',
      'teachers',
      'parent-links',
      'classes',
      'groups',
      'teacher-approval',
      'learner-activity-control',
      'seat-management',
      'registrations',
      'payments',
      'uniform-orders',
      'unpaid-fees',
      'fee-management',
      'log-expense',
      'petty-cash-request',
      'aftercare',
      'browse-lessons',
      'create-lesson',
      'assign-lessons',
      'reports',
      'family-activity-review',
      'activities',
      'calendar',
      'weekly-menu',
      'year-planner',
      'ai-year-planner',
      'daily-program-ai',
      'room-display-connect',
      'curriculum-themes',
      'lesson-templates',
      'weekly-plans',
      'live-lessons',
      'announcements',
      'birthday-chart',
      'excursions',
      'meetings',
      'settings',
      'dash-studio',
      'dash-advisor',
      'dash-tutor',
    ]),
  },
  k12_school: {
    parent: makeSet([
      'view_homework',
      'daily_program',
      'assigned_lessons',
      'check_attendance',
      'activity_feed',
      'messages',
      'events',
      'calls',
      'ai_help',
      'generate_image',
      'dash_tutor',
      'upgrade',
      'payments',
      'dash_grade_test',
      'dev_notifications',
    ]),
    teacher: makeSet([
      'browse_lessons',
      'create_lesson',
      'create_activity',
      'take_attendance',
      'start_live_lesson',
      'assign_lesson',
      'assign_homework',
      'my_class',
      'room_display_connect',
      'messages',
      'manage_groups',
      'request_petty_cash',
      'student_reports',
      'family_activity_review',
      'reputation',
      'generate_image',
      'ai_assistant',
      'call_parent',
    ]),
    principal: makeSet([
      'students',
      'teachers',
      'classes',
      'groups',
      'teacher-approval',
      'learner-activity-control',
      'registrations',
      'payments',
      'uniform-orders',
      'unpaid-fees',
      'fee-management',
      'log-expense',
      'petty-cash-request',
      'browse-lessons',
      'create-lesson',
      'assign-lessons',
      'reports',
      'calendar',
      'weekly-menu',
      'year-planner',
      'ai-year-planner',
      'daily-program-ai',
      'room-display-connect',
      'curriculum-themes',
      'lesson-templates',
      'weekly-plans',
      'live-lessons',
      'announcements',
      'settings',
      'dash-advisor',
      'dash-tutor',
    ]),
  },
};

function normalizeRole(role: string): DashboardPolicyRole | null {
  const normalized = String(role || '').toLowerCase();
  if (normalized === 'parent') return 'parent';
  if (normalized === 'teacher') return 'teacher';
  if (normalized === 'principal' || normalized === 'principal_admin') return 'principal';
  return null;
}

export function isDashboardActionAllowed(
  role: string,
  schoolType: ResolvedSchoolType,
  actionId: string
): boolean {
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) return true;

  const rolePolicy = POLICY[schoolType][normalizedRole];
  return rolePolicy.has(actionId);
}

export function filterActionsByDashboardPolicy<T extends { id: string }>(
  actions: T[],
  role: string,
  schoolType: ResolvedSchoolType
): T[] {
  return actions.filter((action) => isDashboardActionAllowed(role, schoolType, action.id));
}
