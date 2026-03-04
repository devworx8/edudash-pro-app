/**
 * Tests for lib/authActions.ts — signOutAndRedirect
 *
 * Validates:
 *   - Normal sign-out flow
 *   - Local vs global sign-out scope
 *   - Deduplication (skip if already signing out)
 *   - Account switch pending flags
 *   - Stale sign-out detection
 *
 * NOTE: These tests use real timers because signOutAndRedirect has
 * deeply nested async code (dynamic imports, withTimeout, setTimeout chains)
 * that cannot be reliably tested with jest.useFakeTimers.
 * With mocked dependencies the function completes in <500ms.
 */

// ── Mocks ────────────────────────────────────────────

const mockRouter = {
  replace: jest.fn(),
  push: jest.fn(),
  back: jest.fn(),
  canDismiss: jest.fn(() => false),
  dismissAll: jest.fn(),
};

jest.mock('expo-router', () => ({
  router: mockRouter,
}));

jest.mock('@/lib/sessionManager', () => ({
  signOut: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  BackHandler: { exitApp: jest.fn() },
}));

jest.mock('@/lib/pushTokenUtils', () => ({
  deactivateCurrentUserTokens: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

// After signOut(), hasActiveSupabaseSession() must see no session so navigation runs.
jest.mock('@/lib/supabase', () => ({
  assertSupabase: jest.fn(() => ({
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
    },
  })),
}));

jest.mock('@/lib/routeAfterLogin', () => ({
  clearAllNavigationLocks: jest.fn(),
}));

jest.mock('@/lib/appReset', () => ({
  requestAppReset: jest.fn(),
}));

import {
  signOutAndRedirect,
  resetSignOutState,
  isSignOutInProgress,
  isAccountSwitchPending,
  setAccountSwitchPending,
  clearAccountSwitchPending,
} from '@/lib/authActions';
import { signOut } from '@/lib/sessionManager';

// ──────────────────────────────────────────────────────

afterAll(() => {
  resetSignOutState();
  jest.restoreAllMocks();
});

describe('signOutAndRedirect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetSignOutState();
    mockRouter.replace.mockClear();
    mockRouter.dismissAll.mockClear();
  });

  afterEach(() => {
    resetSignOutState();
  });

  it('calls signOut with local scope by default', async () => {
    await signOutAndRedirect();

    expect(signOut).toHaveBeenCalledWith(
      expect.objectContaining({ preserveOtherSessions: true }),
    );
  }, 10_000);

  it('respects preserveOtherSessions=false for global sign-out', async () => {
    await signOutAndRedirect({ preserveOtherSessions: false });

    expect(signOut).toHaveBeenCalledWith(
      expect.objectContaining({ preserveOtherSessions: false }),
    );
  }, 10_000);

  it('navigates after sign-out', async () => {
    await signOutAndRedirect();
    // Mobile path: 300ms wait then setTimeout(100) for router.replace
    await new Promise(r => setTimeout(r, 450));

    const navCalled =
      mockRouter.replace.mock.calls.length > 0 ||
      mockRouter.dismissAll.mock.calls.length > 0;
    expect(navCalled).toBe(true);
  }, 10_000);

  it('adds fresh=1 param to sign-in redirect', async () => {
    await signOutAndRedirect();
    await new Promise(r => setTimeout(r, 450));

    const calls = mockRouter.replace.mock.calls;
    const hasFresh = calls.some((c: any[]) => String(c[0]).includes('fresh=1'));
    expect(hasFresh).toBe(true);
  }, 10_000);

  it('deduplicates concurrent sign-out calls', async () => {
    const p1 = signOutAndRedirect();
    const p2 = signOutAndRedirect(); // should be skipped

    await Promise.allSettled([p1, p2]);

    expect(signOut).toHaveBeenCalledTimes(1);
  }, 10_000);

  it('clears navigation locks before sign-out', async () => {
    await signOutAndRedirect();

    const { clearAllNavigationLocks } = require('@/lib/routeAfterLogin');
    expect(clearAllNavigationLocks).toHaveBeenCalled();
  }, 10_000);

  it('navigates to custom redirectTo route', async () => {
    await signOutAndRedirect({ redirectTo: '/landing' });
    await new Promise(r => setTimeout(r, 450));

    const calls = mockRouter.replace.mock.calls;
    const hasLanding = calls.some((c: any[]) => String(c[0]).includes('/landing'));
    expect(hasLanding).toBe(true);
  }, 10_000);

  it('resets sign-out flag after completion', async () => {
    await signOutAndRedirect();
    await new Promise(r => setTimeout(r, 450));
    expect(isSignOutInProgress()).toBe(false);
  }, 10_000);
});

// ──────────────────────────────────────────────────────
// Account switch pending flags
// ──────────────────────────────────────────────────────

describe('account switch pending flags', () => {
  beforeEach(() => {
    clearAccountSwitchPending();
  });

  it('is not pending by default', () => {
    expect(isAccountSwitchPending()).toBe(false);
  });

  it('becomes pending after setAccountSwitchPending', () => {
    setAccountSwitchPending();
    expect(isAccountSwitchPending()).toBe(true);
  });

  it('clears after clearAccountSwitchPending', () => {
    setAccountSwitchPending();
    clearAccountSwitchPending();
    expect(isAccountSwitchPending()).toBe(false);
  });

  it('auto-expires after stale threshold', () => {
    jest.useFakeTimers();
    setAccountSwitchPending();
    expect(isAccountSwitchPending()).toBe(true);

    // Advance past the 30s stale threshold
    jest.advanceTimersByTime(31_000);
    expect(isAccountSwitchPending()).toBe(false);
    jest.useRealTimers();
  });
});

// ──────────────────────────────────────────────────────
// Stale sign-out detection
// ──────────────────────────────────────────────────────

describe('stale sign-out detection', () => {
  beforeEach(() => {
    resetSignOutState();
  });

  it('resetSignOutState clears the in-progress flag', async () => {
    const p = signOutAndRedirect();
    expect(isSignOutInProgress()).toBe(true);
    resetSignOutState();
    expect(isSignOutInProgress()).toBe(false);
    await p.catch(() => {});
  }, 10_000);
});
