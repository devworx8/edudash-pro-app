/**
 * Tests for contexts/auth/sessionBoot.ts
 *
 * Validates the boot sequence:
 *   - Restores session from storage
 *   - Syncs with live Supabase session
 *   - Fetches fresh profile
 *   - Handles expired/missing sessions
 *   - Sets loading=false in finally block
 *   - Respects mounted flag
 */

// ── Mocks ────────────────────────────────────────────

jest.mock('@/lib/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@/lib/authDebug', () => ({
  authDebug: jest.fn(),
}));

const mockGetSession = jest.fn().mockResolvedValue({
  data: { session: null },
  error: null,
});

jest.mock('@/lib/supabase', () => ({
  assertSupabase: jest.fn(() => ({
    auth: {
      getSession: mockGetSession,
    },
  })),
}));

jest.mock('@/lib/posthogClient', () => ({
  getPostHog: jest.fn(() => ({ identify: jest.fn() })),
}));

jest.mock('@/lib/analytics', () => ({
  track: jest.fn(),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

const mockInitializeSession = jest.fn().mockResolvedValue({ session: null, profile: null });
jest.mock('@/lib/sessionManager', () => ({
  initializeSession: mockInitializeSession,
  syncSessionFromSupabase: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/visibilityHandler', () => ({
  initializeVisibilityHandler: jest.fn(),
}));

jest.mock('@/lib/rbac', () => ({
  fetchEnhancedUserProfile: jest.fn().mockResolvedValue(null),
  createPermissionChecker: jest.fn(() => ({})),
}));

jest.mock('@sentry/react-native', () => ({
  setUser: jest.fn(),
}));

jest.mock('@/contexts/auth/profileUtils', () => ({
  toEnhancedProfile: jest.fn((p: any) => ({
    ...p,
    capabilities: p.capabilities || [],
    hasCapability: (c: string) => (p.capabilities || []).includes(c),
    hasRole: (r: string) => p.role === r,
  })),
  buildFallbackProfileFromSession: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/contexts/auth/profileFetch', () => ({
  fetchProfileWithFallbacks: jest.fn().mockResolvedValue(undefined),
}));

import { bootSession, type BootDeps } from '@/contexts/auth/sessionBoot';
import { fetchProfileWithFallbacks } from '@/contexts/auth/profileFetch';
import { createMockUser, createMockSession } from '../../helpers/authTestUtils';

// ── Helpers ─────────────────────────────────────────

function createBootDeps(overrides: Partial<BootDeps> = {}): BootDeps {
  return {
    mounted: { current: true },
    setUser: jest.fn(),
    setSession: jest.fn(),
    setProfile: jest.fn(),
    setPermissions: jest.fn(),
    setProfileLoading: jest.fn(),
    setLoading: jest.fn(),
    setLastRefreshAttempt: jest.fn(),
    sessionRef: { current: null },
    existingProfile: null,
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────

describe('bootSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockInitializeSession.mockResolvedValue({ session: null, profile: null });
  });

  // ── Loading flag ──────────────────────────────────

  it('sets loading=false in finally block', async () => {
    const deps = createBootDeps();
    await bootSession(deps);
    expect(deps.setLoading).toHaveBeenCalledWith(false);
  });

  it('sets loading=false even when boot throws', async () => {
    mockInitializeSession.mockRejectedValue(new Error('storage fail'));
    const deps = createBootDeps();

    await bootSession(deps).catch(() => {});
    expect(deps.setLoading).toHaveBeenCalledWith(false);
  });

  // ── No stored session ─────────────────────────────

  it('handles no stored session gracefully', async () => {
    const deps = createBootDeps();
    await bootSession(deps);

    // No user set because no session
    expect(deps.setUser).toHaveBeenCalledWith(null);
    expect(deps.setSession).toHaveBeenCalledWith(null);
  });

  // ── Stored session restoration ────────────────────

  it('restores stored session and profile', async () => {
    const storedSession = {
      access_token: 'stored-token',
      refresh_token: 'stored-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user_id: 'user-1',
      email: 'test@test.com',
    };
    const storedProfile = {
      id: 'user-1',
      email: 'test@test.com',
      role: 'teacher',
    };
    mockInitializeSession.mockResolvedValue({
      session: storedSession,
      profile: storedProfile,
    });

    const deps = createBootDeps();
    await bootSession(deps);

    // Should set session from storage before syncing with live
    expect(deps.setSession).toHaveBeenCalled();
    expect(deps.setProfile).toHaveBeenCalled();
  });

  // ── Live session sync ─────────────────────────────

  it('syncs with live Supabase session', async () => {
    const liveSession = createMockSession();
    mockGetSession.mockResolvedValue({
      data: { session: liveSession },
      error: null,
    });

    const deps = createBootDeps();
    await bootSession(deps);

    expect(deps.setSession).toHaveBeenCalledWith(liveSession);
    expect(deps.setUser).toHaveBeenCalledWith(liveSession.user);
  });

  it('fetches fresh profile when live session exists', async () => {
    const liveSession = createMockSession();
    mockGetSession.mockResolvedValue({
      data: { session: liveSession },
      error: null,
    });

    const deps = createBootDeps();
    await bootSession(deps);

    expect(fetchProfileWithFallbacks).toHaveBeenCalledWith(
      liveSession.user.id,
      expect.any(Object),
      null, // existingProfile
      expect.objectContaining({ mounted: true }),
    );
  });

  // ── Mounted guard ─────────────────────────────────

  it('skips state updates when unmounted', async () => {
    const liveSession = createMockSession();
    mockGetSession.mockResolvedValue({
      data: { session: liveSession },
      error: null,
    });

    const deps = createBootDeps({ mounted: { current: false } });
    await bootSession(deps);

    // Profile fetch should be skipped since mounted=false
    expect(fetchProfileWithFallbacks).not.toHaveBeenCalled();
  });

  // ── Expired stored session (email mismatch) ───────

  it('clears profile when stored profile ID does not match session', async () => {
    const storedSession = {
      access_token: 'stored-token',
      refresh_token: 'stored-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user_id: 'user-1',
      email: 'test@test.com',
    };
    const storedProfile = {
      id: 'different-user-999',
      email: 'other@test.com',
      role: 'parent',
    };
    mockInitializeSession.mockResolvedValue({
      session: storedSession,
      profile: storedProfile,
    });

    const deps = createBootDeps();
    await bootSession(deps);

    // Should set profile to null (or use createPermissionChecker(null))
    // because the stored profile doesn't match the session user
    const profileCalls = (deps.setProfile as jest.Mock).mock.calls;
    const nullCall = profileCalls.find((c: any[]) => c[0] === null);
    expect(nullCall).toBeDefined();
  });
});
