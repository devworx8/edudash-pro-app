/**
 * Session Manager — Auth Operations
 * 
 * Sign-in, sign-out, session initialization, and current session/profile getters.
 */

import { assertSupabase } from '@/lib/supabase';
import { track, identifyUser } from '@/lib/analytics';
import { identifyUserForFlags } from '@/lib/featureFlags';
import { reportError } from '@/lib/monitoring';
import { authDebug } from '@/lib/authDebug';
import type { UserSession, UserProfile } from './types';
import {
  storeSession,
  storeProfile,
  getStoredSession,
  getStoredProfile,
  clearStoredData,
  clearAppSessionKeys,
  resetPasswordRecoveryFlag,
} from './storage';
import { fetchUserProfile, buildMinimalProfileFromUser } from './profile';
import {
  needsRefresh,
  refreshSession,
  setupAutoRefresh,
  clearAutoRefreshTimer,
  resetPendingRefresh,
} from './refresh';
import { withTimeout, withTimeoutMarker } from './helpers';

/**
 * Initialize session from stored data
 */
export async function initializeSession(): Promise<{
  session: UserSession | null;
  profile: UserProfile | null;
}> {
  try {
    const storedSession = await getStoredSession();
    const { getStoredProfile } = await import('./storage');
    const storedProfile = await getStoredProfile();

    if (!storedSession) {
      return { session: null, profile: null };
    }

    if (needsRefresh(storedSession)) {
      const { result: refreshedSession, timedOut } = await withTimeoutMarker(
        refreshSession(storedSession.refresh_token),
        8000
      );
      if (timedOut) {
        console.warn('[SessionManager] Session refresh timed out during boot, continuing with stored session');
        setupAutoRefresh(storedSession);
        return { session: storedSession, profile: storedProfile };
      }
      if (!refreshedSession) {
        await clearStoredData();
        return { session: null, profile: null };
      }

      setupAutoRefresh(refreshedSession);
      return { session: refreshedSession, profile: storedProfile };
    }

    setupAutoRefresh(storedSession);
    return { session: storedSession, profile: storedProfile };
  } catch (error) {
    reportError(new Error('Session initialization failed'), { error });
    await clearStoredData();
    return { session: null, profile: null };
  }
}

/**
 * Sign in and establish session
 */
export async function signInWithSession(
  email: string,
  password: string
): Promise<{
  session: UserSession | null;
  profile: UserProfile | null;
  error?: string;
}> {
  try {
    authDebug('signIn.start');
    const wantedEmail = (email || '').trim();
    const wantedPassword = typeof password === 'string' ? password : '';
    if (__DEV__) console.log('[SessionManager] signInWithSession called for:', wantedEmail);

    // Guard: avoid calling Supabase with empty/whitespace credentials (can present as "Invalid login credentials").
    if (!wantedEmail || !wantedPassword || wantedPassword.trim().length === 0) {
      authDebug('signIn.error', { message: 'Missing email/password' });
      return { session: null, profile: null, error: 'Please enter your email and password.' };
    }

    // Quick check if there's an existing session for a different user
    try {
      const wantedEmailLower = wantedEmail.toLowerCase();
      const { data: existing } = await withTimeout(
        assertSupabase().auth.getSession(),
        2000,
        { data: { session: null }, error: null }
      );
      const existingEmail = existing?.session?.user?.email?.toLowerCase();
      if (existing?.session && existingEmail && existingEmail !== wantedEmailLower) {
        if (__DEV__) console.log('[SessionManager] Existing session detected for different user, saving account and signing out first...');
        const { setAccountSwitchPending } = await import('@/lib/authActions');
        setAccountSwitchPending();
        // Persist current user to saved accounts so they can switch back without re-entering password
        try {
          const curSession = await getStoredSession();
          const curProfile = await getStoredProfile();
          const curUserId = existing.session.user.id;
          const curEmail = existing.session.user.email ?? '';
          const refreshToken = existing.session.refresh_token ?? curSession?.refresh_token;
          const { EnhancedBiometricAuth } = await import('@/services/EnhancedBiometricAuth');
          await EnhancedBiometricAuth.storeBiometricSession(curUserId, curEmail, curProfile ?? undefined, refreshToken ?? undefined);
        } catch (storeErr) {
          if (__DEV__) console.warn('[SessionManager] Could not store current account for switching (non-fatal):', storeErr);
        }
        await withTimeout(
          assertSupabase().auth.signOut({ scope: 'local' } as any),
          1500,
          { error: null }
        );
      }
    } catch (e) {
      if (__DEV__) console.log('[SessionManager] Pre sign-in check failed (non-fatal)', e);
    }

    // Clear app-level stale session data (NOT Supabase's own storage key)
    if (__DEV__) console.log('[SessionManager] Clearing stale app session data before sign-in...');
    await clearAppSessionKeys();

    const signInPromise = assertSupabase().auth.signInWithPassword({
      email: wantedEmail,
      password: wantedPassword,
    }).catch((err) => ({
      data: { session: null, user: null },
      error: err,
    }));

    const SIGN_IN_TIMEOUT_MS = 10000;

    const signInResult = await withTimeout(
      signInPromise,
      SIGN_IN_TIMEOUT_MS,
      { data: { session: null, user: null }, error: { message: 'Sign-in timed out. Please try again.' } as any }
    );

    const { data, error } = signInResult;

    if (error) {
      const msg = String(error.message || 'Sign-in failed');
      const lower = msg.toLowerCase();
      const friendly =
        lower.includes('invalid login credentials') || lower.includes('invalid_grant')
          ? 'Invalid email or password.'
          : msg;
      console.error('[SessionManager] Supabase auth error:', msg);
      authDebug('signIn.error', { message: msg });

      // Check if this is a timeout — auth might have actually succeeded in background
      if (error.message?.toLowerCase()?.includes('timed out')) {
        try {
          const { data: sessionData } = await assertSupabase().auth.getSession();
          if (sessionData?.session?.user) {
            if (__DEV__) console.log('[SessionManager] Late session found after timeout');
            const session: UserSession = {
              access_token: sessionData.session.access_token,
              refresh_token: sessionData.session.refresh_token,
              expires_at: sessionData.session.expires_at || Date.now() / 1000 + 3600,
              user_id: sessionData.session.user.id,
              email: sessionData.session.user.email,
            };
            const profile = await buildMinimalProfileFromUser(sessionData.session.user);
            await Promise.all([storeSession(session), storeProfile(profile)]);
            setupAutoRefresh(session);
            return { session, profile };
          }
        } catch (lateErr) {
          console.warn('[SessionManager] Late session check failed:', lateErr);
        }
      }

      // Special handling for "already signed in" errors
      if (error.message?.includes('already') || error.message?.includes('signed in')) {
        try {
          const { data: sessionData } = await assertSupabase().auth.getSession();
          if (sessionData?.session?.user) {
            const wantedEmail = email.trim().toLowerCase();
            const existingEmail = sessionData.session.user.email?.toLowerCase();
            if (existingEmail && existingEmail !== wantedEmail) {
              await assertSupabase().auth.signOut({ scope: 'local' } as any);
              await new Promise((resolve) => setTimeout(resolve, 200));
              const retry = await assertSupabase().auth.signInWithPassword({ email, password });
              if (retry.error || !retry.data.session || !retry.data.user) {
                return { session: null, profile: null, error: retry.error?.message || 'Invalid credentials' };
              }
              const session: UserSession = {
                access_token: retry.data.session.access_token,
                refresh_token: retry.data.session.refresh_token,
                expires_at: retry.data.session.expires_at || Date.now() / 1000 + 3600,
                user_id: retry.data.user.id,
                email: retry.data.user.email,
              };
              const profile = await buildMinimalProfileFromUser(retry.data.user);
              await Promise.all([storeSession(session), storeProfile(profile)]);
              setupAutoRefresh(session);
              return { session, profile };
            }
            // Same user — use existing session
            const session: UserSession = {
              access_token: sessionData.session.access_token,
              refresh_token: sessionData.session.refresh_token,
              expires_at: sessionData.session.expires_at || Date.now() / 1000 + 3600,
              user_id: sessionData.session.user.id,
              email: sessionData.session.user.email,
            };
            const profile = await buildMinimalProfileFromUser(sessionData.session.user);
            await Promise.all([storeSession(session), storeProfile(profile)]);
            setupAutoRefresh(session);
            return { session, profile };
          }
        } catch (recoveryError) {
          console.error('[SessionManager] Session recovery failed:', recoveryError);
        }
      }

      track('edudash.auth.sign_in', {
        method: 'email',
        role: 'unknown',
        success: false,
        error: msg,
      });
      return { session: null, profile: null, error: friendly };
    }

    if (!data.session || !data.user) {
      return { session: null, profile: null, error: 'Invalid credentials' };
    }

    // ── FAST PATH: Store session immediately + build minimal profile ──
    const session: UserSession = {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at || Date.now() / 1000 + 3600,
      user_id: data.user.id,
      email: data.user.email,
    };

    const profile = await buildMinimalProfileFromUser(data.user);

    if (__DEV__) console.log('[SessionManager] Storing session and minimal profile...');
    await Promise.all([storeSession(session), storeProfile(profile)]);
    setupAutoRefresh(session);

    if (__DEV__) console.log('[SessionManager] Sign-in fast path complete for:', data.user.email);
    authDebug('signIn.success', { userId: data.user.id });

    // Fire-and-forget: analytics, last-login update, monitoring
    void (async () => {
      try {
        await withTimeout(
          assertSupabase().rpc('update_user_last_login') as unknown as Promise<any>,
          2000,
          null
        );
      } catch { /* non-fatal */ }

      try {
        identifyUser(data.user!.id, {
          role: profile.role,
          organization_id: profile.organization_id,
          seat_status: profile.seat_status,
        });
        identifyUserForFlags(data.user!.id, {
          role: profile.role,
          organization_tier: profile.organization_id ? 'org_member' : 'individual',
          capabilities: profile.capabilities,
        });
      } catch { /* non-fatal */ }

      track('edudash.auth.sign_in', {
        method: 'email',
        role: profile.role,
        success: true,
      });
    })();

    return { session, profile };

  } catch (error) {
    console.error('[SessionManager] signInWithSession caught error:', error);
    console.error('[SessionManager] Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : 'No stack',
    });
    reportError(new Error('Sign-in failed'), { email, error });
    authDebug('signIn.error', { message: error instanceof Error ? error.message : 'Sign-in failed' });
    return {
      session: null,
      profile: null,
      error: error instanceof Error ? error.message : 'Sign-in failed',
    };
  }
}

/**
 * Sign out and clear session
 */
export async function signOut(options: { preserveOtherSessions?: boolean } = {}): Promise<void> {
  try {
    authDebug('signOut.start');
    console.log('[SessionManager] Starting sign-out process...');
    const session = await getStoredSession();
    const currentUserId = session?.user_id;
    const sessionDuration = session
      ? Math.round((Date.now() - (session.expires_at * 1000 - 3600000)) / 1000 / 60)
      : 0;
    const preserveOtherSessions = options.preserveOtherSessions === true;

    clearAutoRefreshTimer();
    resetPendingRefresh();
    resetPasswordRecoveryFlag();

    // Best-effort: clear user-scoped offline cache
    if (currentUserId) {
      try {
        const { offlineCacheService } = await import('@/lib/services/offlineCacheService');
        await offlineCacheService.clearUserCache(currentUserId);
        console.log('[SessionManager] Cleared offline cache for user:', currentUserId);
      } catch (cacheError) {
        console.warn('[SessionManager] Failed to clear offline cache (non-fatal):', cacheError);
      }
    }

    // Supabase sign-out: global first (needs valid token), then local
    if (!preserveOtherSessions) {
      try {
        console.log('[SessionManager] Signing out from Supabase (global scope first — needs valid token)...');
        await withTimeout(
          assertSupabase().auth.signOut({ scope: 'global' } as any),
          2000,
          { error: null }
        );
        console.log('[SessionManager] Global sign-out completed');
      } catch (supabaseError) {
        console.warn('[SessionManager] Global sign-out error (continuing):', supabaseError);
      }
    } else {
      console.log('[SessionManager] Preserving other account sessions (skipping global sign-out)');
    }

    try {
      console.log('[SessionManager] Signing out from Supabase (local scope)...');
      await withTimeout(
        assertSupabase().auth.signOut({ scope: 'local' } as any),
        1000,
        { error: null }
      );
      console.log('[SessionManager] Local sign-out completed');
    } catch (localError) {
      console.warn('[SessionManager] Local sign-out error (continuing):', localError);
    }

    console.log('[SessionManager] Clearing stored session data...');
    await clearStoredData();

    // Also clear auth storage keys (including Supabase's own storageKey)
    try {
      const { clearAuthStorage } = await import('@/lib/auth/authStorageKeys');
      const { storage } = await import('@/lib/storage');
      await clearAuthStorage(storage);
    } catch { /* non-fatal */ }

    track('edudash.auth.sign_out', {
      session_duration_minutes: sessionDuration,
    });

    console.log('[SessionManager] Sign-out completed successfully');
    authDebug('signOut.done');

  } catch (error) {
    console.error('[SessionManager] Sign-out failed:', error);
    try {
      await clearStoredData();
    } catch (clearError) {
      console.error('[SessionManager] Failed to clear data during error recovery:', clearError);
    }
    reportError(new Error('Sign-out failed'), { error });
  }
}

/**
 * Get current session if valid
 */
export async function getCurrentSession(): Promise<UserSession | null> {
  const session = await getStoredSession();

  if (!session) return null;

  const now = Date.now();
  const timeUntilExpiry = session.expires_at * 1000 - now;

  if (timeUntilExpiry <= 0) {
    console.log('Session expired, attempting refresh');
    const refreshedSession = await refreshSession(session.refresh_token);
    if (refreshedSession) {
      setupAutoRefresh(refreshedSession);
      return refreshedSession;
    }
    await clearStoredData();
    return null;
  }

  if (needsRefresh(session)) {
    console.log('Session needs refresh, attempting refresh');
    const refreshedSession = await refreshSession(session.refresh_token);
    if (refreshedSession) {
      setupAutoRefresh(refreshedSession);
      return refreshedSession;
    }
    console.warn('Session refresh failed, clearing stale session');
    await clearStoredData();
    return null;
  }

  return session;
}

/**
 * Get current user profile
 */
export async function getCurrentProfile(): Promise<UserProfile | null> {
  const { getStoredProfile } = await import('./storage');
  return await getStoredProfile();
}

/**
 * Refresh user profile data
 */
export async function refreshProfile(): Promise<UserProfile | null> {
  const session = await getCurrentSession();
  if (!session) return null;

  const profile = await fetchUserProfile(session.user_id);
  if (profile) {
    await storeProfile(profile);
  }

  return profile;
}
