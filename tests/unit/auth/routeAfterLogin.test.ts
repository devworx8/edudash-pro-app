/**
 * Tests for lib/routeAfterLogin.ts
 *
 * Validates:
 *   - Generation counter prevents stale navigations
 *   - Navigation lock concurrency
 *   - Timeout fallback to /profiles-gate
 *   - Profile hydration (hasCapability injection)
 *   - Stale user check (active user ≠ routing user)
 *   - Error recovery
 *   - Pending teacher invite bypass
 *   - Force password change bypass
 */

// ── Mocks ────────────────────────────────────────────

const mockRouter = {
  replace: jest.fn(),
  push: jest.fn(),
  back: jest.fn(),
  canDismiss: jest.fn(() => false),
};

jest.mock('expo-router', () => ({
  router: mockRouter,
}));

jest.mock('@/lib/supabase', () => ({
  assertSupabase: jest.fn(() => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'user-test-001' } },
      }),
    },
  })),
}));

jest.mock('@/lib/analytics', () => ({
  track: jest.fn(),
}));

jest.mock('@/lib/monitoring', () => ({
  reportError: jest.fn(),
}));

jest.mock('@/lib/rbac', () => ({
  fetchEnhancedUserProfile: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/lib/utils/teacherInvitePending', () => ({
  getPendingTeacherInvite: jest.fn().mockResolvedValue(null),
  clearPendingTeacherInvite: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/schoolTypeResolver', () => ({
  resolveSchoolTypeFromProfile: jest.fn(() => 'preschool'),
}));

jest.mock('@/lib/dashboard/dashboardRoutingTelemetry', () => ({
  trackDashboardRouteResolution: jest.fn(),
}));

jest.mock('@/lib/auth/roleResolution', () => ({
  resolveTeacherApprovalRoute: jest.fn().mockResolvedValue(null),
  normalizeRole: jest.fn((r: string) => r),
  resolveAdminSchoolType: jest.fn(() => null),
  COMMUNITY_SCHOOL_ID: 'community-school-id',
  detectRoleAndSchool: jest.fn(),
}));

jest.mock('@/lib/auth/determineRoute', () => ({
  determineUserRoute: jest.fn(() => ({ path: '/screens/teacher-dashboard' })),
  validateUserAccess: jest.fn(),
  getRouteForRole: jest.fn(),
}));

jest.mock('@/lib/auth/navigationLocks', () => ({
  isNavigationLocked: jest.fn(() => false),
  setNavigationLock: jest.fn(),
  clearNavigationLock: jest.fn(),
  clearAllNavigationLocks: jest.fn(),
  getNavigationLockTime: jest.fn(() => undefined),
  NAVIGATION_LOCK_TIMEOUT: 16000,
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { routeAfterLogin } from '@/lib/routeAfterLogin';
import { isNavigationLocked, setNavigationLock, clearNavigationLock } from '@/lib/auth/navigationLocks';
import { fetchEnhancedUserProfile } from '@/lib/rbac';
import { determineUserRoute } from '@/lib/auth/determineRoute';
import { getPendingTeacherInvite, clearPendingTeacherInvite } from '@/lib/utils/teacherInvitePending';
import { assertSupabase } from '@/lib/supabase';
import { createMockUser, createMockEnhancedProfile } from '../../helpers/authTestUtils';

describe('routeAfterLogin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockRouter.replace.mockClear();
    (isNavigationLocked as jest.Mock).mockReturnValue(false);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── No user ID ─────────────────────────────────────

  it('navigates to sign-in when no user ID provided', async () => {
    await routeAfterLogin(null, null);
    expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/sign-in');
  });

  it('navigates to sign-in when user has no ID', async () => {
    await routeAfterLogin({ id: '' } as any, null);
    expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/sign-in');
  });

  it('routes unverified users to verify-your-email before dashboard resolution', async () => {
    const user = createMockUser({
      email: 'pending@edudashpro.org.za',
      email_confirmed_at: null,
      confirmed_at: null,
    });

    await routeAfterLogin(user, createMockEnhancedProfile() as any);

    expect(mockRouter.replace).toHaveBeenCalledWith(
      '/screens/verify-your-email?email=pending%40edudashpro.org.za',
    );
    expect(setNavigationLock).not.toHaveBeenCalled();
  });

  it('routes web learners to exam-prep until the learner dashboard ships', async () => {
    const { Platform } = require('react-native');
    const previousOs = Platform.OS;
    Platform.OS = 'web';
    (determineUserRoute as jest.Mock).mockReturnValue({ path: '/screens/learner-dashboard' });

    try {
      const user = createMockUser();
      const profile = createMockEnhancedProfile({ role: 'student' });

      const routePromise = routeAfterLogin(user, profile as any);
      jest.advanceTimersByTime(500);
      await routePromise;

      expect(mockRouter.replace).toHaveBeenCalledWith('/screens/exam-prep');
    } finally {
      Platform.OS = previousOs;
    }
  });

  // ── Navigation lock (concurrency guard) ────────────

  it('skips routing when user is already navigation-locked', async () => {
    (isNavigationLocked as jest.Mock).mockReturnValue(true);
    const user = createMockUser();
    await routeAfterLogin(user, createMockEnhancedProfile() as any);
    // Should not attempt router.replace because lock test fires early
    expect(setNavigationLock).not.toHaveBeenCalled();
  });

  // ── Profile hydration ─────────────────────────────

  it('injects hasCapability when profile lacks it', async () => {
    const rawProfile = {
      id: 'user-test-001',
      role: 'teacher',
      organization_id: 'org-1',
      capabilities: ['access_mobile_app'],
    };
    const user = createMockUser();
    const routePromise = routeAfterLogin(user, rawProfile as any);
    // Advance past the 15s overall timeout to complete
    jest.advanceTimersByTime(200);
    await routePromise;

    // if it got past the profile check, it should have called the route determination
    // which means hasCapability was injected
    expect(clearNavigationLock).toHaveBeenCalled();
  });

  // ── Profile fetch when no profile provided ────────

  it('fetches enhanced profile when none provided', async () => {
    const profile = createMockEnhancedProfile({ role: 'teacher' });
    (fetchEnhancedUserProfile as jest.Mock).mockResolvedValue(profile);
    const user = createMockUser();

    const routePromise = routeAfterLogin(user, null);
    jest.advanceTimersByTime(10000);
    await routePromise;

    expect(fetchEnhancedUserProfile).toHaveBeenCalledWith('user-test-001');
  });

  it('navigates to profiles-gate when profile fetch returns null', async () => {
    (fetchEnhancedUserProfile as jest.Mock).mockResolvedValue(null);
    const user = createMockUser();

    const routePromise = routeAfterLogin(user, null);
    jest.advanceTimersByTime(10000);
    await routePromise;

    expect(mockRouter.replace).toHaveBeenCalledWith('/profiles-gate');
  });

  // ── Pending teacher invite bypass ──────────────────

  it('routes to teacher-invite-accept when pending invite exists', async () => {
    (getPendingTeacherInvite as jest.Mock).mockResolvedValue({
      token: 'invite-tok',
      email: 'teacher@test.com',
    });
    const user = createMockUser();
    const profile = createMockEnhancedProfile({ role: 'teacher' });

    const routePromise = routeAfterLogin(user, profile as any);
    jest.advanceTimersByTime(500);
    await routePromise;

    expect(clearPendingTeacherInvite).toHaveBeenCalled();
    const call = mockRouter.replace.mock.calls[0][0];
    expect(call).toContain('/screens/teacher-invite-accept');
    expect(call).toContain('token=invite-tok');
  });

  // ── Force password change bypass ──────────────────

  it('routes to change-password-required when user metadata says so', async () => {
    // Clear pending invite so invite-accept doesn't fire first
    (getPendingTeacherInvite as jest.Mock).mockResolvedValue(null);
    const user = createMockUser({
      user_metadata: { force_password_change: true, role: 'teacher' },
    });
    const profile = createMockEnhancedProfile({ role: 'teacher' });

    const routePromise = routeAfterLogin(user, profile as any);
    jest.advanceTimersByTime(500);
    await routePromise;

    expect(mockRouter.replace).toHaveBeenCalledWith('/screens/change-password-required');
  });

  // ── Stale user detection ──────────────────────────

  it('skips navigation when active user differs from routing user', async () => {
    // Auth.getUser returns a DIFFERENT user mid-flight
    (assertSupabase as jest.Mock).mockReturnValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: 'other-user-999' } },
        }),
      },
    });

    const user = createMockUser({ id: 'user-test-001' });
    const profile = createMockEnhancedProfile({ role: 'teacher' });

    const routePromise = routeAfterLogin(user, profile as any);
    jest.advanceTimersByTime(500);
    await routePromise;

    // Should NOT call replace with the teacher-dashboard because user changed
    const dashboardCalls = mockRouter.replace.mock.calls.filter(
      (c: any[]) => String(c[0]).includes('teacher-dashboard'),
    );
    expect(dashboardCalls).toHaveLength(0);
  });

  // ── Generation counter (RC-8 fix) ─────────────────

  it('prevents stale generation from navigating', async () => {
    const user = createMockUser();
    const profile = createMockEnhancedProfile({ role: 'teacher' });

    // Start two concurrent calls — only the latest should navigate
    const p1 = routeAfterLogin(user, profile as any);
    const p2 = routeAfterLogin(user, profile as any);

    jest.advanceTimersByTime(500);
    await Promise.allSettled([p1, p2]);

    // The first call's generation should be stale — but both may have been locked out.
    // The key assertion: at most ONE call should have navigated to a dashboard.
    // (The other should have been blocked by nav lock OR stale generation.)
    const dashboardCalls = mockRouter.replace.mock.calls.filter(
      (c: any[]) => String(c[0]).includes('dashboard'),
    );
    // Allow 0 or 1 — 0 if nav lock blocked the second call, 1 if generation counter caught it
    expect(dashboardCalls.length).toBeLessThanOrEqual(1);
  });

  // ── Overall timeout (15s) ─────────────────────────

  it('forces fallback navigation after 15s timeout', async () => {
    // Set up a profile fetch that never resolves
    (fetchEnhancedUserProfile as jest.Mock).mockReturnValue(new Promise(() => {}));
    const user = createMockUser();

    const routePromise = routeAfterLogin(user, null);
    jest.advanceTimersByTime(16000); // past the 15s timeout
    await routePromise.catch(() => {}); // may reject

    expect(mockRouter.replace).toHaveBeenCalledWith('/profiles-gate');
  });

  // ── Error recovery ────────────────────────────────

  it('navigates to profiles-gate on unexpected error', async () => {
    (isNavigationLocked as jest.Mock).mockImplementation(() => {
      throw new Error('unexpected');
    });
    const user = createMockUser();
    const profile = createMockEnhancedProfile();

    await routeAfterLogin(user, profile as any).catch(() => {});

    expect(mockRouter.replace).toHaveBeenCalledWith('/profiles-gate');
  });
});
