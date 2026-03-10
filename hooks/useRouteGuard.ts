/**
 * Route Guard Hooks
 *
 * Auth guard that redirects unauthenticated users to sign-in
 * and authenticated users from auth routes to their dashboard.
 * Respects account-switch, recovery, and navigation-lock flows.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useGlobalSearchParams, usePathname, useRootNavigationState, router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import {
  isSignOutInProgress,
  isAccountSwitchPending,
  isAccountSwitchInProgress,
} from '@/lib/authActions';
import { isNavigationLocked } from '@/lib/routeAfterLogin';
import { authDebug } from '@/lib/authDebug';
import {
  isAuthRoute as classifyAuthRoute,
  isAuthCallbackRoute as classifyAuthCallback,
  isProfilesGateRoute,
  isOnboardingRoute as classifyOnboarding,
  isOrgAdminFamilyRoute as classifyOrgAdmin,
  isAccountSwitchIntent,
  checkRecoveryFlow,
} from '@/hooks/auth/routeClassification';
import {
  resolveDashboard,
  trackResolution,
  checkDashboardMismatch,
  resolveSchoolGuardDashboard,
} from '@/hooks/auth/dashboardResolution';

/** Grace window (ms) before treating auth-route + no-profile as stuck. */
const AUTH_ROUTE_PROFILE_GRACE_MS = 3500;
/** De-duplication window (ms) for identical redirects. */
const REDIRECT_DEDUP_WINDOW_MS = 1200;

/** Mobile web guard - currently no-op */
export const useMobileWebGuard = () => { useEffect(() => {}, []); };

/** Auth guard - handles redirect based on authentication state */
export const useAuthGuard = () => {
  const pathname = usePathname();
  const rootNavigationState = useRootNavigationState();
  const searchParams = useGlobalSearchParams<Record<string, string | string[]>>();
  const { user, loading, profile, profileLoading } = useAuth();
  const hasNavigated = useRef(false);
  const lastAttemptAt = useRef(0);
  const lastRedirectKey = useRef<string | null>(null);
  const lastRedirectAt = useRef(0);
  const lastUserId = useRef<string | null>(null);
  const lastMismatchKey = useRef<string | null>(null);
  const authRouteSeenAt = useRef<number | null>(null);
  const signingOut = isSignOutInProgress();
  const accountSwitchInProgress = isAccountSwitchInProgress();
  const isRootNavigationReady = Boolean(rootNavigationState?.key);

  const safeReplace = useCallback((to: string, reason: string) => {
    const from = typeof pathname === 'string' ? pathname : '';
    if (from === to) {
      return false;
    }

    const key = `${from}->${to}`;
    const now = Date.now();
    if (lastRedirectKey.current === key && now - lastRedirectAt.current < REDIRECT_DEDUP_WINDOW_MS) {
      authDebug('guard.redirect_skipped', { from, to, reason });
      return false;
    }

    if (!isRootNavigationReady) {
      authDebug('guard.redirect_deferred', { from, to, reason, navigationReady: false });
      return false;
    }

    lastRedirectKey.current = key;
    lastRedirectAt.current = now;
    authDebug('guard.redirect', { from, to, reason });
    try {
      router.replace(to as any);
      return true;
    } catch (error) {
      authDebug('guard.redirect_error', { from, to, reason, error });
      return false;
    }
  }, [isRootNavigationReady, pathname]);

  const commitRedirect = useCallback(
    (to: string, reason: string, options?: { markAttempt?: boolean }) => {
      const didNavigate = safeReplace(to, reason);
      if (!didNavigate) {
        return false;
      }

      hasNavigated.current = true;
      if (options?.markAttempt) {
        lastAttemptAt.current = Date.now();
      }

      return true;
    },
    [safeReplace]
  );
  
  useEffect(() => {
    // Reset navigation attempt when the authenticated user changes
    const currentUserId = user?.id ?? null;
    if (currentUserId !== lastUserId.current) {
      hasNavigated.current = false;
      lastAttemptAt.current = 0;
      lastUserId.current = currentUserId;
      authRouteSeenAt.current = currentUserId ? Date.now() : null;
    }

    // Only pause guard while sign-out is in-flight AND the old user is still present.
    // Once user becomes null, allow guard redirects immediately so we never strand on a blank protected route.
    if (signingOut && user) { hasNavigated.current = false; return; }
    // Don't redirect while auth is loading
    if (loading) { return; }
    if (!isRootNavigationReady) { return; }
    
    // Determine if current route is an auth route
    const isAuthRoute = classifyAuthRoute(pathname);
    const isAuthCallback = classifyAuthCallback(pathname);
    const isRecoveryFlow = checkRecoveryFlow(searchParams);
    const isProfilesGate = isProfilesGateRoute(pathname);
    const isOnboarding = classifyOnboarding(pathname);
    const isOrgAdminFamily = classifyOrgAdmin(pathname);

    // Not authenticated: redirect to sign-in (unless on auth route)
    if (!user) {
      authRouteSeenAt.current = null;
      if (!isAuthRoute && !isOnboarding && !hasNavigated.current) {
        console.log('[AuthGuard] No user, redirecting to welcome from:', pathname);
        commitRedirect('/(auth)/welcome', 'no_user');
      }
      return;
    }

    // Authenticated but missing profile: avoid dashboards getting stuck loading
    if (
      user &&
      !profileLoading &&
      !profile &&
      !isAuthRoute &&
      !isProfilesGate &&
      !isOnboarding &&
      !accountSwitchInProgress
    ) {
      console.log('[AuthGuard] Missing profile, redirecting to profiles-gate from:', pathname);
      commitRedirect('/profiles-gate', 'missing_profile_protected_route');
      return;
    }
    
    // Authenticated: redirect from auth routes to dashboard
    if (user && isAuthRoute) {
      // Account-switch bypass — let user reach sign-in for new credentials
      const isSwitching = isAccountSwitchIntent(searchParams) || isAccountSwitchPending();
      if (__DEV__) {
        console.log('[AuthGuard] Auth route check', {
          pathname,
          addAccount: searchParams.addAccount,
          switch: searchParams.switch,
          fresh: searchParams.fresh,
          isSwitching,
        });
      }
      if (isSwitching) {
        authDebug('guard.account_switch_bypass', { pathname, params: searchParams });
        return;
      }
      if (!authRouteSeenAt.current) authRouteSeenAt.current = Date.now();
      if (profileLoading) return; // let AuthContext handle routing
      if (isNavigationLocked(user.id)) return; // navigation lock active
      // Missing profile after loading — route to profile gate after grace window
      if (!profile) {
        const elapsed = Date.now() - (authRouteSeenAt.current || Date.now());
        if (elapsed < AUTH_ROUTE_PROFILE_GRACE_MS) return;
        if (!isProfilesGate && !hasNavigated.current) {
          commitRedirect('/profiles-gate', 'missing_profile_after_auth_grace');
        }
        return;
      }
      authRouteSeenAt.current = null;
      if (profile?.id && user?.id && profile.id !== user.id) return; // stale profile
      if (pathname.includes('reset-password')) return;
      if (isAuthCallback || isRecoveryFlow) return;

      const now = Date.now();
      if (hasNavigated.current && now - lastAttemptAt.current < 1500) return;

      const dashInfo = resolveDashboard(user, profile);
      trackResolution(user, dashInfo, 'useAuthGuard.auth-route');
      commitRedirect(dashInfo.targetDashboard, 'authenticated_auth_route', { markAttempt: true });
      return;
    }

    if (user && profile && !profileLoading && !isAuthRoute && typeof pathname === 'string') {
      // Hard guard: school tenants must never render org-admin/tertiary dashboard family.
      if (isOrgAdminFamily) {
        const schoolDashboard = resolveSchoolGuardDashboard(profile, user);
        if (schoolDashboard && pathname !== schoolDashboard && !hasNavigated.current) {
          commitRedirect(schoolDashboard, 'school_dashboard_guard', { markAttempt: true });
          return;
        }
      }

      checkDashboardMismatch(user, profile, pathname, lastMismatchKey);
    }
    
    // NOTE: Do NOT reset hasNavigated in cleanup — it resets on user change above.
  }, [
    pathname,
    searchParams.type,
    searchParams.flow,
    searchParams.addAccount,
    searchParams.switch,
    searchParams.fresh,
    user,
    loading,
    profile?.role,
    profile?.id,
    profile?.organization_id,
    profile?.preschool_id,
    profile?.organization_membership?.school_type,
    (profile as any)?.organization_membership?.organization_kind,
    (profile as any)?.organization_type,
    profileLoading,
    accountSwitchInProgress,
    isRootNavigationReady,
    signingOut,
    commitRedirect,
  ]);
};
