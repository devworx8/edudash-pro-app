/**
 * SIGNED_IN auth-event handler.
 *
 * Extracted from AuthContext.tsx to comply with WARP.md (≤400 lines).
 * Contains the entire SIGNED_IN pipeline: profile resolution → routing
 * → background operations (push, biometric, analytics).
 *
 * @module contexts/auth/handleSignedIn
 */

import { logger } from '@/lib/logger';
import { authDebug } from '@/lib/authDebug';
import { assertSupabase } from '@/lib/supabase';
import { getPostHog } from '@/lib/posthogClient';
import { track } from '@/lib/analytics';
import { Platform } from 'react-native';
import { routeAfterLogin } from '@/lib/routeAfterLogin';
import {
  fetchEnhancedUserProfile,
  createPermissionChecker,
  type EnhancedUserProfile,
} from '@/lib/rbac';
import { isPasswordRecoveryInProgress } from '@/lib/sessionManager';
import { securityAuditor } from '@/lib/security-audit';
import * as Sentry from '@sentry/react-native';
import type { Session, User } from '@supabase/supabase-js';
import {
  toEnhancedProfile,
  isSameUserProfile,
  persistProfileSnapshot,
  buildFallbackProfileFromSession,
} from '@/contexts/auth/profileUtils';

const debugEnabled = process.env.EXPO_PUBLIC_DEBUG_MODE === 'true' || __DEV__;
const debugLog = (...args: unknown[]) => {
  if (debugEnabled) logger.debug('handleSignedIn', ...args);
};

// ── Dependency injection interface ──────────────

export interface SignedInDeps {
  mounted: boolean;
  setProfile: (p: EnhancedUserProfile | null) => void;
  setPermissions: (p: ReturnType<typeof createPermissionChecker>) => void;
  setProfileLoading: (v: boolean) => void;
  profileRef: { current: EnhancedUserProfile | null };
  profileLoadingRef: { current: boolean };
  lastUserIdRef: { current: string | null };
  signedInGenerationRef: { current: number };
  orgNameRefreshTimerRef: { current: ReturnType<typeof setTimeout> | null };
  /** Show branded loading overlay during profile resolution */
  showLoadingOverlay?: (message?: string) => void;
  /** Hide the loading overlay after routing completes */
  hideLoadingOverlay?: () => void;
}

// ── Main handler ────────────────────────────────

export async function handleSignedIn(
  s: Session,
  deps: SignedInDeps,
): Promise<void> {
  const userId = s.user.id;
  const currentGen = ++deps.signedInGenerationRef.current;
  const isStale = () =>
    deps.signedInGenerationRef.current !== currentGen ||
    !deps.mounted ||
    deps.lastUserIdRef.current !== userId;

  // De-duplicate: skip if we already have a valid profile for this user
  if (
    deps.profileRef.current?.id === userId &&
    !deps.profileLoadingRef.current &&
    deps.lastUserIdRef.current === userId
  ) {
    debugLog('Skipping duplicate SIGNED_IN for already-resolved user:', userId);
    return;
  }

  authDebug('auth.signed_in', { userId });
  deps.setProfileLoading(true);

  // ── Profile resolution chain ──────────────
  // STRATEGY: Wait for the real profile (up to 6s total) before routing.
  // This eliminates double-navigation — we route ONCE with the best profile.
  const PROFILE_TIMEOUT = 6000;
  let enhancedProfile: EnhancedUserProfile | null = null;
  let profileSource: 'rpc' | 'stored' | 'fallback' = 'rpc';
  let needsOrgNameRefresh = false;

  // Show loading overlay while we resolve the profile
  deps.showLoadingOverlay?.('Setting up your dashboard...');

  // 1. Main RPC fetch — await with generous timeout
  try {
    enhancedProfile = await Promise.race([
      fetchEnhancedUserProfile(userId, s),
      new Promise<null>((r) => setTimeout(() => r(null), PROFILE_TIMEOUT)),
    ]) as EnhancedUserProfile | null;
  } catch (err) {
    logger.warn('handleSignedIn', 'Profile fetch failed:', err);
  }
  if (isStale()) { deps.hideLoadingOverlay?.(); return; }

  // Invalidate stale cached profile if user changed
  const safeExisting = isSameUserProfile(s.user, deps.profileRef.current)
    ? deps.profileRef.current
    : null;
  if (deps.profileRef.current && !safeExisting) {
    deps.setProfile(null);
    deps.setPermissions(createPermissionChecker(null));
  }

  // 2. DB fallback (only if RPC returned nothing)
  if (!enhancedProfile) {
    try {
      enhancedProfile = await Promise.race([
        buildFallbackProfileFromSession(s.user, safeExisting),
        new Promise<null>((r) => setTimeout(() => { r(null); }, 2500)),
      ]) as EnhancedUserProfile | null;
      if (enhancedProfile) profileSource = 'fallback';
    } catch { /* noop */ }
    if (isStale()) { deps.hideLoadingOverlay?.(); return; }
  }

  // 3. Stored profile
  if (!enhancedProfile) {
    try {
      const { getStoredProfileForUser } = await import('@/lib/sessionManager');
      const stored = await getStoredProfileForUser(userId);
      if (stored) {
        enhancedProfile = toEnhancedProfile(stored as any);
        profileSource = 'stored';
      }
    } catch { /* noop */ }
    if (isStale()) { deps.hideLoadingOverlay?.(); return; }
  }

  // 4. Emergency min profile
  if (!enhancedProfile && s.user) {
    enhancedProfile = buildMinimalProfile(s.user);
    profileSource = 'fallback';
  }

  // ── Apply profile to state ────────────────
  if (deps.mounted && enhancedProfile) {
    deps.setProfile(enhancedProfile);
    deps.setPermissions(createPermissionChecker(enhancedProfile));
    void persistProfileSnapshot(enhancedProfile, s.user);

    needsOrgNameRefresh = detectMissingOrgName(enhancedProfile, userId);

    track('edudash.auth.profile_loaded', {
      user_id: userId,
      has_profile: true,
      role: enhancedProfile.role,
      capabilities_count: enhancedProfile.capabilities?.length || 0,
      source: profileSource,
    });

    securityAuditor.auditAuthenticationEvent(userId, 'login', {
      role: enhancedProfile.role,
      organization: enhancedProfile.organization_id,
      capabilities_count: enhancedProfile.capabilities?.length || 0,
      source: profileSource,
    });
  }

  // Safety net: if enhancedProfile is STILL null, build last-resort
  if (!enhancedProfile && deps.mounted && s?.user) {
    enhancedProfile = buildMinimalProfile(s.user);
    if (enhancedProfile) {
      deps.setProfile(enhancedProfile);
      deps.setPermissions(createPermissionChecker(enhancedProfile));
    }
  }

  deps.setProfileLoading(false);

  // ── Routing ───────────────────────────────
  if (deps.mounted && enhancedProfile) {
    // Final stale check before routing — prevents superseded handler from navigating
    if (isStale()) { deps.hideLoadingOverlay?.(); return; }

    const shouldSkipRouting = checkRecoverySession(s);
    if (shouldSkipRouting) {
      debugLog('Password recovery session detected, skipping auto-routing');
      deps.hideLoadingOverlay?.();
    } else {
      debugLog('RouteAfterLogin-CALLING', JSON.stringify({ userId, role: enhancedProfile.role }));
      authDebug('routeAfterLogin.called', { userId });

      void routeAfterLogin(s.user, enhancedProfile)
        .catch((error) => {
          logger.error('handleSignedIn', 'Post-login routing failed:', error);
        })
        .finally(() => {
          deps.hideLoadingOverlay?.();
        });

      // Store biometric session (fire-and-forget)
      import('@/services/EnhancedBiometricAuth')
        .then(({ EnhancedBiometricAuth }) => {
          EnhancedBiometricAuth.storeBiometricSession(
            userId,
            s.user.email || '',
            enhancedProfile || undefined,
            s.refresh_token,
          ).catch(() => {});
        })
        .catch(() => {});

      // Register device session (fire-and-forget)
      import('@/lib/deviceSessionTracker')
        .then(({ registerDeviceSession }) => {
          registerDeviceSession()
            .then((result) => {
              if (result.isNewDevice && result.otherDevices.length > 0) {
                const names = result.otherDevices.map((d: any) => d.device_name || d.platform).join(', ');
                import('@/components/ui/ToastProvider')
                  .then(({ toast }) => toast.info(`Also signed in on: ${names}`, 5000))
                  .catch(() => {});
              }
            })
            .catch(() => {});
        })
        .catch(() => {});
    }
  }

  // ── Deferred org-name refresh ─────────────
  if (deps.mounted && needsOrgNameRefresh) {
    scheduleOrgNameRefresh(userId, s, deps);
  }

  // ── Monitoring ────────────────────────────
  if (deps.mounted) {
    identifyInMonitoring(s.user, enhancedProfile);
    track('edudash.auth.signed_in', { user_id: userId, role: enhancedProfile?.role, profile_source: profileSource });
  }

  // ── Background operations ─────────────────
  void updateLastLogin();
  void registerPush(s.user);
}

// ── Private helpers ─────────────────────────────

function buildMinimalProfile(user: User): EnhancedUserProfile | null {
  const meta = (user.user_metadata || {}) as Record<string, any>;
  const appMeta = (user.app_metadata || {}) as Record<string, any>;
  return toEnhancedProfile({
    id: user.id,
    email: user.email || '',
    role: meta.role || appMeta.role || 'parent',
    first_name: meta.first_name || meta.given_name || '',
    last_name: meta.last_name || meta.family_name || '',
    full_name: meta.full_name || meta.name || '',
    organization_id: meta.organization_id || meta.preschool_id || null,
    organization_name: meta.organization_name || null,
    school_type: meta.school_type || appMeta.school_type || null,
    seat_status: 'active',
    capabilities: [],
  });
}

function detectMissingOrgName(profile: EnhancedUserProfile, userId: string): boolean {
  const orgName = profile.organization_name || profile.organization_membership?.organization_name || '';
  const hasOrg = !!(profile.organization_id || (profile as any)?.preschool_id || profile.organization_membership?.organization_id);
  const missing = hasOrg && (!orgName || orgName.trim().length === 0 || orgName.trim().toLowerCase() === 'unknown');
  if (missing) {
    logger.warn('[handleSignedIn] Organization name missing after sign-in', { user_id: userId, organization_id: profile.organization_id });
  }
  return missing;
}

function checkRecoverySession(s: Session): boolean {
  const globalFlag = isPasswordRecoveryInProgress();
  const recoverySentAt = (s.user as any).recovery_sent_at;
  const isRecovery = recoverySentAt && (Date.now() - new Date(recoverySentAt).getTime()) < 3600000;
  let isOnResetPage = false;
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      isOnResetPage = window.location.pathname.includes('reset-password');
    }
  } catch { /* noop */ }
  return !!(globalFlag || isRecovery || isOnResetPage);
}

function scheduleOrgNameRefresh(userId: string, s: Session, deps: SignedInDeps): void {
  if (deps.orgNameRefreshTimerRef.current) clearTimeout(deps.orgNameRefreshTimerRef.current);
  deps.orgNameRefreshTimerRef.current = setTimeout(async () => {
    deps.orgNameRefreshTimerRef.current = null;
    if (!deps.mounted || deps.lastUserIdRef.current !== userId) return;
    try {
      const refreshed = await Promise.race([
        fetchEnhancedUserProfile(userId, s),
        new Promise<null>((r) => setTimeout(() => r(null), 5000)),
      ]) as EnhancedUserProfile | null;
      if (refreshed && deps.mounted && deps.lastUserIdRef.current === userId) {
        deps.setProfile(refreshed);
        deps.setPermissions(createPermissionChecker(refreshed));
        void persistProfileSnapshot(refreshed, s.user);
      }
    } catch (err) {
      logger.warn('[handleSignedIn] Forced org-name refresh failed', err);
    }
  }, 1500);
}

function identifyInMonitoring(user: User, profile: EnhancedUserProfile | null): void {
  try {
    const ph = getPostHog();
    ph?.identify(user.id, {
      ...(user.email ? { email: user.email } : {}),
      ...(profile?.role ? { role: profile.role } : {}),
      ...(profile?.organization_id ? { organization_id: profile.organization_id } : {}),
      ...(profile?.organization_membership?.plan_tier ? { plan_tier: profile.organization_membership.plan_tier } : {}),
    });
  } catch { /* noop */ }
  try {
    Sentry.setUser({ id: user.id, email: user.email || undefined } as any);
  } catch { /* noop */ }
}

async function updateLastLogin(): Promise<void> {
  try {
    await Promise.resolve(assertSupabase().rpc('update_user_last_login'));
  } catch (e) {
    logger.debug('update_user_last_login RPC failed (non-blocking)', e);
  }
}

async function registerPush(user: User): Promise<void> {
  try {
    const { registerPushDevice, checkAndRefreshTokenIfNeeded } = await import('@/lib/notifications');
    const wasRefreshed = await checkAndRefreshTokenIfNeeded(assertSupabase(), user);
    if (!wasRefreshed) {
      await registerPushDevice(assertSupabase(), user);
    }
  } catch { /* non-fatal */ }
}
