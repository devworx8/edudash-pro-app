/**
 * Unit tests for K12 Parent Dashboard routes
 *
 * Validates that every CTA in the K12 parent action map
 * points to a route that is plausible (no known dead routes).
 */

import {
  K12_PARENT_ACTIONS,
  getAllK12ParentRoutes,
  type K12ParentActionId,
} from '@/lib/navigation/k12ParentActionMap';

/**
 * Routes that are known to exist as actual screen files in app/screens/.
 * This acts as a safety net against routing to non-existent screens.
 */
const KNOWN_VALID_ROUTES = new Set([
  '/(k12)/parent/dashboard',
  '/screens/app-search',
  '/screens/notifications',
  '/screens/account',
  '/screens/dash-assistant',
  '/screens/dash-tutor',
  '/screens/exam-prep',
  '/screens/subscription-setup',
  '/screens/parent-messages',
  '/screens/grades',
  '/screens/parent-children',
  '/screens/parent-progress',
  '/screens/parent-attendance',
  '/screens/parent-payments',
  '/screens/parent-announcements',
  '/screens/parent-menu',
  '/screens/parent-document-upload',
  '/screens/homework',
  '/screens/parent-weekly-report',
  '/screens/settings',
  '/screens/parent-activity-feed',
  '/screens/calendar',
  '/screens/parent-daily-program',
  '/screens/parent-annual-calendar',
  '/screens/parent-my-exams',
  '/screens/parent-timetable',
  '/screens/group-management',
  '/(k12)/student/calculator',
]);

/** Routes that must NOT appear in the action map (they don't exist). */
const KNOWN_DEAD_ROUTES = [
  '/screens/parent-events',
  '/screens/search',
];

describe('K12 Parent Action Map', () => {
  it('exports all expected action IDs', () => {
    const expectedIds: K12ParentActionId[] = [
      'dashboard_home',
      'search',
      'notifications',
      'profile',
      'tutor_session',
      'exam_builder',
      'subscription_setup',
      'messages',
      'grades',
      'account',
      'children',
      'progress',
      'attendance',
      'payments',
      'announcements',
      'weekly_menu',
      'documents',
      'homework',
      'weekly_report',
      'settings',
      'see_all_activity',
      'see_all_events',
      'event_detail',
      'school_communication',
      'child_detail',
      'daily_program',
      'annual_calendar',
      'exam_history',
      'timetable',
      'groups',
    ];
    expectedIds.forEach((id) => {
      expect(K12_PARENT_ACTIONS).toHaveProperty(id);
    });
  });

  it('every action route maps to a known valid route', () => {
    const routes = getAllK12ParentRoutes();
    routes.forEach((route) => {
      expect(KNOWN_VALID_ROUTES).toContain(route);
    });
  });

  it('no action route points to a known dead route', () => {
    const routes = getAllK12ParentRoutes();
    KNOWN_DEAD_ROUTES.forEach((dead) => {
      expect(routes).not.toContain(dead);
    });
  });

  it('search action points to /screens/app-search (not /screens/search)', () => {
    expect(K12_PARENT_ACTIONS.search.route).toBe('/screens/app-search');
  });

  it('grades action points to /screens/grades (not /screens/parent-progress)', () => {
    expect(K12_PARENT_ACTIONS.grades.route).toBe('/screens/grades');
  });

  it('see_all_events points to /screens/calendar (not /screens/parent-events)', () => {
    expect(K12_PARENT_ACTIONS.see_all_events.route).toBe('/screens/calendar');
  });

  it('tutor_session includes mode=diagnostic param', () => {
    expect(K12_PARENT_ACTIONS.tutor_session.params?.mode).toBe('diagnostic');
  });

  it('every action has a non-empty label', () => {
    Object.entries(K12_PARENT_ACTIONS).forEach(([id, config]) => {
      expect(config.label).toBeTruthy();
      expect(config.label.length).toBeGreaterThan(0);
    });
  });

  it('getAllK12ParentRoutes returns unique routes', () => {
    const routes = getAllK12ParentRoutes();
    const unique = new Set(routes);
    expect(unique.size).toBe(routes.length);
  });
});
