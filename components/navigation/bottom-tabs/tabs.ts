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
  { id: 'principal-messages', label: 'Messages', icon: 'chatbubble-outline', activeIcon: 'chatbubble', route: '/screens/principal-messages', roles: ['principal', 'principal_admin'] },
  { id: 'principal-reports', label: 'Fees', icon: 'cash-outline', activeIcon: 'cash', route: '/screens/finance-control-center', roles: ['principal', 'principal_admin'] },
  { id: 'ceo-dashboard', label: 'Home', icon: 'home-outline', activeIcon: 'home', route: '/screens/membership/ceo-dashboard', roles: ['national_admin'] },
  { id: 'ceo-regions', label: 'Regions', icon: 'map-outline', activeIcon: 'map', route: '/screens/membership/regional-managers', roles: ['national_admin'] },
  { id: 'ceo-finance', label: 'Finance', icon: 'wallet-outline', activeIcon: 'wallet', route: '/screens/membership/finance', roles: ['national_admin'] },
  { id: 'ceo-members', label: 'Members', icon: 'people-outline', activeIcon: 'people', route: '/screens/membership/members', roles: ['national_admin'] },
  { id: 'ceo-settings', label: 'Settings', icon: 'settings-outline', activeIcon: 'settings', route: '/screens/settings', roles: ['national_admin'] },
  { id: 'youth-dashboard', label: 'Home', icon: 'home-outline', activeIcon: 'home', route: '/screens/membership/youth-president-dashboard', roles: ['youth_president'] },
  { id: 'youth-members', label: 'Members', icon: 'people-outline', activeIcon: 'people', route: '/screens/membership/members-list', roles: ['youth_president'] },
  { id: 'youth-events', label: 'Events', icon: 'calendar-outline', activeIcon: 'calendar', route: '/screens/membership/events', roles: ['youth_president'] },
  { id: 'youth-approvals', label: 'Approvals', icon: 'checkmark-circle-outline', activeIcon: 'checkmark-circle', route: '/screens/membership/pending-approvals', roles: ['youth_president'] },
  { id: 'youth-settings', label: 'Settings', icon: 'settings-outline', activeIcon: 'settings', route: '/screens/membership/settings', roles: ['youth_president'] },
  { id: 'regional-dashboard', label: 'Home', icon: 'home-outline', activeIcon: 'home', route: '/screens/membership/dashboard', roles: ['regional_manager'] },
  { id: 'regional-members', label: 'Members', icon: 'people-outline', activeIcon: 'people', route: '/screens/membership/members-list', roles: ['regional_manager'] },
  { id: 'regional-approvals', label: 'Approvals', icon: 'checkmark-circle-outline', activeIcon: 'checkmark-circle', route: '/screens/membership/pending-approvals', roles: ['regional_manager'] },
  { id: 'regional-events', label: 'Events', icon: 'calendar-outline', activeIcon: 'calendar', route: '/screens/membership/events', roles: ['regional_manager'] },
  { id: 'regional-settings', label: 'Settings', icon: 'settings-outline', activeIcon: 'settings', route: '/screens/membership/settings', roles: ['regional_manager'] },
  { id: 'women-dashboard', label: 'Home', icon: 'home-outline', activeIcon: 'home', route: '/screens/membership/women-dashboard', roles: ['women_league'] },
  { id: 'women-members', label: 'Members', icon: 'people-outline', activeIcon: 'people', route: '/screens/membership/members-list', roles: ['women_league'] },
  { id: 'women-events', label: 'Events', icon: 'calendar-outline', activeIcon: 'calendar', route: '/screens/membership/events', roles: ['women_league'] },
  { id: 'women-approvals', label: 'Approvals', icon: 'checkmark-circle-outline', activeIcon: 'checkmark-circle', route: '/screens/membership/pending-approvals', roles: ['women_league'] },
  { id: 'women-settings', label: 'Settings', icon: 'settings-outline', activeIcon: 'settings', route: '/screens/membership/settings', roles: ['women_league'] },
  { id: 'veterans-dashboard', label: 'Home', icon: 'home-outline', activeIcon: 'home', route: '/screens/membership/veterans-dashboard', roles: ['veterans_league'] },
  { id: 'veterans-members', label: 'Members', icon: 'people-outline', activeIcon: 'people', route: '/screens/membership/members-list', roles: ['veterans_league'] },
  { id: 'veterans-events', label: 'Events', icon: 'calendar-outline', activeIcon: 'calendar', route: '/screens/membership/events', roles: ['veterans_league'] },
  { id: 'veterans-approvals', label: 'Approvals', icon: 'checkmark-circle-outline', activeIcon: 'checkmark-circle', route: '/screens/membership/pending-approvals', roles: ['veterans_league'] },
  { id: 'veterans-settings', label: 'Settings', icon: 'settings-outline', activeIcon: 'settings', route: '/screens/membership/settings', roles: ['veterans_league'] },
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
