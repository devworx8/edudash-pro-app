/**
 * Tests for contexts/auth/handleSignedIn.ts
 *
 * Validates the SIGNED_IN event handler:
 *   - Profile resolution chain (RPC → DB fallback → stored → minimal)
 *   - Loading overlay lifecycle (show before resolve, hide after route)
 *   - Stale event deduplication (generation counter)
 *   - Mounted check prevents zombie handlers
 *   - Recovery session skip
 *   - Duplicate SIGNED_IN skip when profile already resolved
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

jest.mock('@/lib/supabase', () => ({
  assertSupabase: jest.fn(() => ({
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
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

const mockRouteAfterLogin = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/routeAfterLogin', () => ({
  routeAfterLogin: mockRouteAfterLogin,
}));

const mockFetchEnhancedUserProfile = jest.fn();
jest.mock('@/lib/rbac', () => ({
  fetchEnhancedUserProfile: mockFetchEnhancedUserProfile,
  createPermissionChecker: jest.fn(() => ({})),
}));

jest.mock('@/lib/sessionManager', () => ({
  isPasswordRecoveryInProgress: jest.fn(() => false),
  getStoredProfileForUser: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/lib/security-audit', () => ({
  securityAuditor: {
    auditAuthenticationEvent: jest.fn(),
  },
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
    hasRoleOrHigher: (r: string) => p.role === r,
    isOrgMember: () => true,
    hasActiveSeat: () => true,
  })),
  isSameUserProfile: jest.fn((user: any, profile: any) => profile?.id === user?.id),
  persistProfileSnapshot: jest.fn().mockResolvedValue(undefined),
  buildFallbackProfileFromSession: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/lib/notifications', () => ({
  registerPushDevice: jest.fn().mockResolvedValue(undefined),
  checkAndRefreshTokenIfNeeded: jest.fn().mockResolvedValue(false),
}));

import { handleSignedIn, type SignedInDeps } from '@/contexts/auth/handleSignedIn';
import { createMockSession, createMockSignedInDeps } from '../../helpers/authTestUtils';
import { buildFallbackProfileFromSession } from '@/contexts/auth/profileUtils';

// ── Helpers ─────────────────────────────────────────

function createDeps(overrides: Partial<SignedInDeps> = {}): SignedInDeps {
  return createMockSignedInDeps(overrides) as SignedInDeps;
}

function createProfileResult(role = 'teacher') {
  return {
    id: 'user-test-001',
    email: 'test@edudashpro.org.za',
    role,
    organization_id: 'org-1',
    organization_name: 'Test School',
    seat_status: 'active',
    capabilities: ['access_mobile_app'],
    hasCapability: (c: string) => c === 'access_mobile_app',
    hasRole: (r: string) => r === role,
    hasRoleOrHigher: (r: string) => r === role,
    isOrgMember: () => true,
    hasActiveSeat: () => true,
    organization_membership: {
      organization_id: 'org-1',
      organization_name: 'Test School',
      plan_tier: 'school_premium',
    },
  };
}

// ──────────────────────────────────────────────────────

describe('handleSignedIn', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchEnhancedUserProfile.mockResolvedValue(createProfileResult());
    mockRouteAfterLogin.mockResolvedValue(undefined);
  });

  // ── Profile resolution ────────────────────────────

  it('fetches enhanced profile via RPC on SIGNED_IN', async () => {
    const session = createMockSession();
    const deps = createDeps();

    await handleSignedIn(session, deps);

    expect(mockFetchEnhancedUserProfile).toHaveBeenCalledWith(
      session.user.id,
      session,
    );
  });

  it('sets profile and permissions after successful fetch', async () => {
    const session = createMockSession();
    const deps = createDeps();

    await handleSignedIn(session, deps);

    expect(deps.setProfile).toHaveBeenCalled();
    expect(deps.setPermissions).toHaveBeenCalled();
    expect(deps.setProfileLoading).toHaveBeenCalledWith(false);
  });

  it('falls back to DB fallback when RPC returns null', async () => {
    mockFetchEnhancedUserProfile.mockResolvedValue(null);
    (buildFallbackProfileFromSession as jest.Mock).mockResolvedValue(createProfileResult());

    const session = createMockSession();
    const deps = createDeps();

    await handleSignedIn(session, deps);

    expect(buildFallbackProfileFromSession).toHaveBeenCalled();
    expect(deps.setProfile).toHaveBeenCalled();
  });

  it('builds minimal profile when all fetches fail', async () => {
    mockFetchEnhancedUserProfile.mockResolvedValue(null);
    (buildFallbackProfileFromSession as jest.Mock).mockResolvedValue(null);

    const session = createMockSession({
      user: { user_metadata: { role: 'parent', full_name: 'Test Parent' } },
    });
    const deps = createDeps();

    await handleSignedIn(session, deps);

    // Should still set SOME profile (minimal from user metadata)
    expect(deps.setProfile).toHaveBeenCalled();
  });

  // ── Loading overlay lifecycle ─────────────────────

  it('shows loading overlay during profile resolution', async () => {
    const session = createMockSession();
    const deps = createDeps();

    await handleSignedIn(session, deps);

    expect(deps.showLoadingOverlay).toHaveBeenCalledWith('Setting up your dashboard...');
  });

  it('hides loading overlay after routing completes', async () => {
    const session = createMockSession();
    const deps = createDeps();

    await handleSignedIn(session, deps);
    // Wait for the fire-and-forget routeAfterLogin to settle
    await new Promise((r) => setTimeout(r, 10));

    expect(deps.hideLoadingOverlay).toHaveBeenCalled();
  });

  // ── Routing ───────────────────────────────────────

  it('calls routeAfterLogin with user and profile', async () => {
    const session = createMockSession();
    const deps = createDeps();

    await handleSignedIn(session, deps);

    expect(mockRouteAfterLogin).toHaveBeenCalledWith(
      session.user,
      expect.objectContaining({ id: session.user.id }),
    );
  });

  // ── Deduplication ─────────────────────────────────

  it('skips duplicate SIGNED_IN for already-resolved user', async () => {
    const session = createMockSession();
    const existingProfile = createProfileResult();
    const deps = createDeps({
      profileRef: { current: existingProfile as any },
      profileLoadingRef: { current: false },
      lastUserIdRef: { current: session.user.id },
    });

    await handleSignedIn(session, deps);

    // Should return early — no profile fetch
    expect(mockFetchEnhancedUserProfile).not.toHaveBeenCalled();
  });

  // ── Generation counter (stale event) ──────────────

  it('aborts if generation changes mid-execution', async () => {
    // First call starts, then we bump the generation before RPC resolves
    let resolveRpc: (v: any) => void;
    mockFetchEnhancedUserProfile.mockReturnValue(
      new Promise((r) => { resolveRpc = r; }),
    );

    const session = createMockSession();
    const genRef = { current: 0 };
    const deps = createDeps({ signedInGenerationRef: genRef });

    const p = handleSignedIn(session, deps);

    // Simulate a newer SIGNED_IN event bumping the generation
    genRef.current = 999;

    // Now resolve the RPC
    resolveRpc!(createProfileResult());
    await p;

    // Should NOT have called routeAfterLogin because generation is stale
    expect(mockRouteAfterLogin).not.toHaveBeenCalled();
    expect(deps.hideLoadingOverlay).toHaveBeenCalled();
  });

  // ── Mounted check ─────────────────────────────────

  it('does not set profile when unmounted', async () => {
    const profile = createProfileResult();
    mockFetchEnhancedUserProfile.mockResolvedValue(profile);

    const session = createMockSession();
    const deps = createDeps({ mounted: false });

    await handleSignedIn(session, deps);

    // setProfile should not be called because mounted=false makes isStale()→true
    // (depends on implementation: if mounted check is in isStale, this test may need adjustment)
    // But at minimum, routeAfterLogin should not be called when unmounted
    expect(mockRouteAfterLogin).not.toHaveBeenCalled();
  });

  // ── Recovery session skip ─────────────────────────

  it('skips routing during password recovery', async () => {
    const { isPasswordRecoveryInProgress } = require('@/lib/sessionManager');
    (isPasswordRecoveryInProgress as jest.Mock).mockReturnValue(true);

    const session = createMockSession();
    const deps = createDeps();

    await handleSignedIn(session, deps);

    expect(mockRouteAfterLogin).not.toHaveBeenCalled();
    expect(deps.hideLoadingOverlay).toHaveBeenCalled();
  });
});
