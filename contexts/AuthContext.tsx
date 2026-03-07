/**
 * AuthContext — single source of truth for authentication state.
 *
 * Heavy logic has been extracted into:
 *   - contexts/auth/sessionBoot.ts       (initial session restoration)
 *   - contexts/auth/handleSignedIn.ts     (SIGNED_IN pipeline)
 *   - contexts/auth/handleSignedOut.ts    (SIGNED_OUT cleanup)
 *   - contexts/auth/profileFetch.ts       (profile resolution chain)
 *   - contexts/auth/profileUtils.ts       (profile conversion helpers)
 *
 * @module contexts/AuthContext
 */

import { logger } from '@/lib/logger';
import { authDebug } from '@/lib/authDebug';
import { authEventQueue } from '@/lib/auth/authEventQueue';
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { assertSupabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { clearAllNavigationLocks } from '@/lib/routeAfterLogin';
import { useQueryClient } from '@tanstack/react-query';
import {
  fetchEnhancedUserProfile,
  createPermissionChecker,
  type EnhancedUserProfile,
  type PermissionChecker,
} from '@/lib/rbac';
import { signOut, clearStoredAuthData, syncSessionFromSupabase } from '@/lib/sessionManager';
import { isAccountSwitchInProgress, setAccountSwitchInProgress } from '@/lib/authActions';
import { destroyVisibilityHandler } from '@/lib/visibilityHandler';
import { mark, measure } from '@/lib/perf';
import { showLoadingOverlay, hideLoadingOverlay } from '@/contexts/LoadingOverlayContext';
import type { User } from '@supabase/supabase-js';
import * as Sentry from '@sentry/react-native';
import { getPostHog } from '@/lib/posthogClient';

// Extracted modules
import { bootSession } from '@/contexts/auth/sessionBoot';
import { handleSignedIn, type SignedInDeps } from '@/contexts/auth/handleSignedIn';
import { handleSignedOut } from '@/contexts/auth/handleSignedOut';
import { toEnhancedProfile } from '@/contexts/auth/profileUtils';

// ── Context type + default ──────────────────────

export type AuthContextValue = {
  user: User | null;
  session: import('@supabase/supabase-js').Session | null;
  profile: EnhancedUserProfile | null;
  permissions: PermissionChecker;
  loading: boolean;
  profileLoading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  profile: null,
  permissions: createPermissionChecker(null),
  loading: true,
  profileLoading: false,
  refreshProfile: async () => {},
  signOut: async () => {},
});

const debugEnabled = process.env.EXPO_PUBLIC_DEBUG_MODE === 'true' || __DEV__;
const debugLog = (...args: unknown[]) => {
  if (debugEnabled) logger.debug('AuthContext', ...args);
};

// ── Provider ────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  // State
  const [user, setUser] = useState<User | null>(null);
  const [session, setSessionRaw] = useState<AuthContextValue['session']>(null);
  const sessionRef = useRef<AuthContextValue['session']>(null);
  const setSession = useCallback((s: AuthContextValue['session']) => {
    sessionRef.current = s;
    setSessionRaw(s);
  }, []);
  const [profile, _setProfile] = useState<EnhancedUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, _setProfileLoading] = useState(false);
  const [permissions, setPermissions] = useState<PermissionChecker>(createPermissionChecker(null));
  const [lastRefreshAttempt, setLastRefreshAttempt] = useState(0);

  // Refs
  const lastUserIdRef = useRef<string | null>(null);
  const orgNameRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileRef = useRef<EnhancedUserProfile | null>(null);
  const profileLoadingRef = useRef(false);
  const signedInGenerationRef = useRef(0);

  // Wrapped setters that keep refs in sync
  const setProfile = useCallback((p: EnhancedUserProfile | null) => {
    profileRef.current = p;
    _setProfile(p);
  }, []);
  const setProfileLoading = useCallback((v: boolean) => {
    profileLoadingRef.current = v;
    _setProfileLoading(v);
  }, []);

  // ── Refresh profile ───────────────────────
  const refreshProfile = useCallback(async () => {
    if (!user?.id) return;
    try {
      setProfileLoading(true);
      const fresh = await fetchEnhancedUserProfile(user.id);
      if (fresh) {
        setProfile(fresh);
        setPermissions(createPermissionChecker(fresh));
      }
    } catch (e) {
      logger.error('AuthContext', 'refreshProfile failed:', e);
    } finally {
      setProfileLoading(false);
    }
  }, [user?.id]);

  // ── Sign out ──────────────────────────────
  const handleSignOutCallback = useCallback(async () => {
    try {
      try { clearAllNavigationLocks(); } catch { /* noop */ }
      try { await signOut({ preserveOtherSessions: true }); } catch { /* noop */ }

      setUser(null);
      setSession(null);
      setProfile(null);
      setPermissions(createPermissionChecker(null));
      setProfileLoading(false);
      lastUserIdRef.current = null;

      try { queryClient.clear(); } catch { /* noop */ }
      Promise.resolve().then(async () => {
        try { await getPostHog()?.reset(); } catch { /* noop */ }
        try { Sentry.setUser(null as any); } catch { /* noop */ }
      });
    } catch (error) {
      logger.error('AuthContext', 'Sign out failed:', error);
      setUser(null);
      setSession(null);
      setProfile(null);
      setPermissions(createPermissionChecker(null));
      setProfileLoading(false);
    }
  }, [queryClient]);

  // ── Main effect: boot + listener ──────────
  useEffect(() => {
    let mounted = true;
    let unsub: { subscription?: { unsubscribe: () => void } } | null = null;

    // Theme fix (non-fatal)
    try {
      const root = (globalThis as any)?.document?.documentElement;
      if (root && typeof (globalThis as any).matchMedia === 'function') {
        const dark = (globalThis as any).matchMedia('(prefers-color-scheme: dark)')?.matches;
        if (dark) root.classList.add('dark'); else root.classList.remove('dark');
      }
    } catch { /* noop */ }

    // Boot
    (async () => {
      mark('auth_bootstrap_start');
      await bootSession({
        mounted: { get current() { return mounted; } },
        setUser,
        setSession,
        setProfile,
        setPermissions,
        setProfileLoading,
        setLoading,
        setLastRefreshAttempt,
        sessionRef,
        existingProfile: profileRef.current,
      });

      const authBootstrapPerf = measure('auth_bootstrap_start');
      track('edudash.app.auth_bootstrap', {
        duration_ms: authBootstrapPerf.duration,
        platform: typeof navigator !== 'undefined' ? 'web' : 'native',
      });

      // Auth state listener (serialised via authEventQueue)
      const { data: listener } = assertSupabase().auth.onAuthStateChange((event, s) => {
        if (!mounted) return;
        authEventQueue.enqueue(event, s, async (qEvent, qS) => {
          if (!mounted) return;
          authDebug('auth.state', { event: qEvent, userId: qS?.user?.id });

          // Sync storage (skip clear on SIGNED_OUT when switching account — next event will be SIGNED_IN)
          const skipSignOutCleanup = qEvent === 'SIGNED_OUT' && isAccountSwitchInProgress();
          if (skipSignOutCleanup && __DEV__) {
            console.log('[AccountSwitch] SIGNED_OUT during switch — skipping cleanup, waiting for SIGNED_IN');
          }
          try {
            if (qEvent === 'SIGNED_OUT' && !skipSignOutCleanup) await clearStoredAuthData();
            else if (qEvent !== 'SIGNED_OUT') await syncSessionFromSupabase(qS ?? null);
          } catch { /* noop */ }

          // Single-session: when this device signs in, revoke all other sessions (other devices log out)
          const singleSessionEnabled = process.env.EXPO_PUBLIC_SINGLE_SESSION_ENABLED !== 'false';
          if (qEvent === 'SIGNED_IN' && qS?.user?.id && singleSessionEnabled) {
            assertSupabase()
              .auth.signOut({ scope: 'others' } as { scope: 'others' })
              .catch(() => {});
          }

          // Keep biometric session restore reliable by persisting rotated refresh tokens.
          // Supabase refresh tokens rotate; if we don't update biometric storage on TOKEN_REFRESHED,
          // biometric sign-in will later fail with refresh_token_not_found.
          if (
            (qEvent === 'SIGNED_IN' || qEvent === 'TOKEN_REFRESHED') &&
            qS?.user?.id &&
            (qS as any)?.refresh_token
          ) {
            const userIdForRefresh = qS.user.id;
            const refreshToken = (qS as any).refresh_token as string;
            import('@/services/biometricStorage')
              .then(({ setRefreshTokenForUser, setGlobalRefreshToken }) => {
                setRefreshTokenForUser(userIdForRefresh, refreshToken).catch(() => {});
                setGlobalRefreshToken(refreshToken).catch(() => {});
              })
              .catch(() => {});
          }

          const nextUserId = qS?.user?.id ?? null;
          if (qEvent === 'SIGNED_OUT' && !skipSignOutCleanup) signedInGenerationRef.current += 1;

          // Detect user switch (SIGNED_IN or TOKEN_REFRESHED when user actually changed)
          const userChanged =
            !!nextUserId &&
            (
              (lastUserIdRef.current && lastUserIdRef.current !== nextUserId) ||
              (profileRef.current?.id && profileRef.current.id !== nextUserId)
            );
          const isSwitch =
            (qEvent === 'SIGNED_IN' || qEvent === 'TOKEN_REFRESHED') && userChanged;
          if (isSwitch) {
            setProfile(null);
            setPermissions(createPermissionChecker(null));
            setProfileLoading(true);
            if (__DEV__) console.log('[AccountSwitch] User changed in auth state — running SIGNED_IN pipeline', { event: qEvent, newUserId: nextUserId });
          }
          if (qEvent === 'SIGNED_IN' || (qEvent === 'TOKEN_REFRESHED' && userChanged)) setAccountSwitchInProgress(false);
          lastUserIdRef.current = nextUserId;

          // Update session state only on token change (skip nulling out when switching account)
          const prevToken = sessionRef.current?.access_token;
          if (skipSignOutCleanup) {
            // Leave session/user unchanged; SIGNED_IN will follow with new user
          } else if (prevToken !== qS?.access_token || qEvent === 'SIGNED_OUT') {
            setSession(qS ?? null);
            setUser(qS?.user ?? null);
          }

          try {
            // Run full sign-in pipeline for SIGNED_IN or when TOKEN_REFRESHED reflects an account switch
            const runSignedInPipeline = (qEvent === 'SIGNED_IN' || (qEvent === 'TOKEN_REFRESHED' && userChanged)) && qS?.user;
            if (runSignedInPipeline) {
              const deps: SignedInDeps = {
                mounted,
                setProfile,
                setPermissions,
                setProfileLoading,
                profileRef,
                profileLoadingRef,
                lastUserIdRef,
                signedInGenerationRef,
                orgNameRefreshTimerRef,
                showLoadingOverlay,
                hideLoadingOverlay,
              };
              await handleSignedIn(qS, deps);
            }

            if (qEvent === 'SIGNED_OUT' && mounted && !skipSignOutCleanup) {
              await handleSignedOut(qS?.user, {
                mounted,
                setProfile,
                setPermissions,
                setUser,
                setSession,
                setProfileLoading,
                lastUserIdRef,
                fallbackUserId: user?.id,
              });
            }
          } catch (error) {
            logger.error('AuthContext', 'Auth state handler error:', error);
            if (mounted && (qEvent === 'SIGNED_IN' || qEvent === 'TOKEN_REFRESHED')) setProfileLoading(false);
          }
        }); // end authEventQueue.enqueue
      });
      unsub = listener;
    })();

    return () => {
      mounted = false;
      if (orgNameRefreshTimerRef.current) {
        clearTimeout(orgNameRefreshTimerRef.current);
        orgNameRefreshTimerRef.current = null;
      }
      try { unsub?.subscription?.unsubscribe(); } catch { /* noop */ }
      try { destroyVisibilityHandler(); } catch { /* noop */ }
    };
  }, []);

  useEffect(() => {
    if (!loading && !profileLoading) {
      mark('auth_bootstrap_done');
      const profileFetchPerf = measure('auth_bootstrap_done', 'auth_bootstrap_start');
      track('edudash.app.profile_ready', {
        duration_ms: profileFetchPerf.duration,
        has_profile: !!profile,
        role: profile?.role || null,
      });
    }
  }, [loading, profileLoading, profile]);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        permissions,
        loading,
        profileLoading,
        refreshProfile,
        signOut: handleSignOutCallback,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ── Hooks ───────────────────────────────────────

export function useAuth() {
  return useContext(AuthContext);
}

export function usePermissions(): PermissionChecker {
  return useAuth().permissions;
}

export function useUserProfile(): EnhancedUserProfile | null {
  return useAuth().profile;
}
