import {
  ROLES_WITH_CENTER_TAB,
  SCHOOL_ADMIN_DASH_TAB,
} from '@/lib/navigation/navManifest';
import type { BottomTabItem } from './types';

export { ROLES_WITH_CENTER_TAB, SCHOOL_ADMIN_DASH_TAB };

export const DASH_SEARCH_ROUTE = '/screens/app-search?scope=dash&q=dash';

export const TAB_ITEMS: BottomTabItem[] = [
  { id: 'parent-dashboard', label: 'Dashboard', icon: 'grid-outline', activeIcon: 'grid', route: '/screens/parent-dashboard', roles: ['parent'] },
  { id: 'parent-children', label: 'Messages', icon: 'chatbubble-outline', activeIcon: 'chatbubble', route: '/screens/parent-messages', roles: ['parent'] },
  { id: 'parent-dash', label: 'Dash', icon: 'sparkles-outline', activeIcon: 'sparkles', route: '/screens/dash-assistant', roles: ['parent'], isCenterTab: true },
  { id: 'parent-messages', label: 'Grades', icon: 'stats-chart-outline', activeIcon: 'stats-chart', route: '/screens/parent-progress', roles: ['parent'] },
  { id: 'parent-calendar', label: 'Account', icon: 'person-outline', activeIcon: 'person', route: '/screens/account', roles: ['parent'] },
  { id: 'teacher-dashboard', label: 'Home', icon: 'home-outline', activeIcon: 'home', route: '/screens/teacher-dashboard', roles: ['teacher'] },
  { id: 'students', label: 'Students', icon: 'people-outline', activeIcon: 'people', route: '/screens/student-management', roles: ['teacher'] },
  { id: 'teacher-dash', label: 'Dash', icon: 'sparkles-outline', activeIcon: 'sparkles', route: '/screens/dash-assistant', roles: ['teacher'], isCenterTab: true },
  { id: 'teacher-message-list', label: 'Messages', icon: 'chatbubble-outline', activeIcon: 'chatbubble', route: '/screens/teacher-message-list', roles: ['teacher'] },
  { id: 'teacher-calendar', label: 'Calendar', icon: 'calendar-outline', activeIcon: 'calendar', route: '/screens/calendar', roles: ['teacher'] },
  { id: 'principal-dashboard', label: 'Home', icon: 'home-outline', activeIcon: 'home', route: '/screens/principal-dashboard', roles: ['principal', 'principal_admin'] },
  { id: 'principal-dash', label: 'Dash', icon: 'sparkles-outline', activeIcon: 'sparkles', route: '/screens/dash-assistant', roles: ['principal', 'principal_admin'], isCenterTab: true },
  { id: 'org-admin-dashboard', label: 'Home', icon: 'home-outline', activeIcon: 'home', route: '/screens/org-admin-dashboard', roles: ['admin'] },
  { id: 'org-admin-programs', label: 'Programs', icon: 'school-outline', activeIcon: 'school', route: '/screens/org-admin/programs', roles: ['admin'] },
  { id: 'org-admin-enrollments', label: 'Enroll', icon: 'person-add-outline', activeIcon: 'person-add', route: '/screens/org-admin/enrollments', roles: ['admin'] },
  { id: 'org-admin-instructors', label: 'Team', icon: 'people-outline', activeIcon: 'people', route: '/screens/org-admin/instructors', roles: ['admin'] },
  { id: 'org-admin-settings', label: 'Settings', icon: 'settings-outline', activeIcon: 'settings', route: '/screens/org-admin/settings', roles: ['admin'] },
  { id: 'learner-dashboard', label: 'Home', icon: 'home-outline', activeIcon: 'home', route: '/screens/learner-dashboard', roles: ['student', 'learner'] },
  { id: 'student-programs', label: 'Programs', icon: 'school-outline', activeIcon: 'school', route: '/screens/learner/programs', roles: ['student', 'learner'] },
  { id: 'learner-dash', label: 'Dash', icon: 'sparkles-outline', activeIcon: 'sparkles', route: '/screens/dash-assistant', roles: ['student', 'learner'], isCenterTab: true },
  { id: 'student-submissions', label: 'Work', icon: 'document-text-outline', activeIcon: 'document-text', route: '/screens/learner/submissions', roles: ['student', 'learner'] },
  { id: 'learner-messages', label: 'Messages', icon: 'chatbubble-outline', activeIcon: 'chatbubble', route: '/screens/learner/messages', roles: ['student', 'learner'] },
  { id: 'principal-students', label: 'Students', icon: 'people-outline', activeIcon: 'people', route: '/screens/student-management', roles: ['principal', 'principal_admin'] },
];

export const MESSAGE_TAB_IDS = new Set([
  'parent-children',
  'teacher-message-list',
  'principal-messages',
  'learner-messages',
]);

const HIDDEN_ROUTE_FRAGMENTS = [
  '/(auth)',
  '/sign-in',
  '/register',
  '/landing',
  '/onboarding',
  'org-onboarding',
  'principal-onboarding',
  'school-registration',
  'parent-child-registration',
  'learner-registration',
  'parent-registration',
  'teacher-registration',
  'teacher-approval-pending',
  '/auth-callback',
  '/invite/',
  'message-thread',
  '/screens/dash-tutor',
  '/screens/ai-',
  'exam-generation',
  '/screens/dash-assistant',
  '/screens/dash-voice',
  '/screens/dash-orb',
  '/screens/worksheet-viewer',
  '/screens/lesson-viewer',
];

export function isHiddenBottomNavPath(pathname: string | null | undefined): boolean {
  if (!pathname || pathname === '/') return true;
  return HIDDEN_ROUTE_FRAGMENTS.some((fragment) => pathname.includes(fragment));
}
