/**
 * Enhanced Biometric Authentication Service
 *
 * High-level biometric authentication flows: store sessions, authenticate,
 * switch accounts, and setup biometric for new users.
 *
 * Low-level storage is delegated to ./biometricStorage.
 */

import { BiometricAuthService } from './BiometricAuthService';
import {
  type BiometricSessionData,
  storage,
  BIOMETRIC_SESSION_KEY,
  generateSecureToken,
  getSessionsMap,
  setSessionsMap,
  setActiveUserId,
  setRefreshTokenForUser,
  getRefreshTokenForUser,
  getGlobalRefreshToken,
  setGlobalRefreshToken,
  getBiometricSession,
  getBiometricAccounts,
  removeBiometricSession,
  clearBiometricSession,
  updateCachedProfile,
  clearRefreshTokenForUser,
  clearGlobalRefreshToken,
  MAX_BIOMETRIC_ACCOUNTS,
} from './biometricStorage';

// Re-export for consumers that import from this module
export type { BiometricSessionData };
export {
  getBiometricAccounts,
  removeBiometricSession,
  clearBiometricSession,
  updateCachedProfile,
};

export type AccountSwitchResultReason =
  | 'ok'
  | 'target_refresh_missing'
  | 'target_refresh_invalid'
  | 'wrong_user_restored'
  | 'restore_error';

export type GlobalRevokeStatus =
  | 'revoked_global'
  | 'token_missing'
  | 'token_invalid'
  | 'wrong_user'
  | 'error';

type RestoreTargetUserResult = {
  sessionRestored: boolean;
  reason: AccountSwitchResultReason;
  error?: string;
  requiresPassword?: boolean;
};

export class EnhancedBiometricAuth {
  /** Set the active biometric user id */
  public static setActiveUserId = setActiveUserId;

  private static nextExpiryIso(days = 30): string {
    const expirationTime = new Date();
    expirationTime.setDate(expirationTime.getDate() + days);
    return expirationTime.toISOString();
  }

  // Delegate storage operations — kept on class for backward compatibility
  static getBiometricSession = getBiometricSession;
  static clearBiometricSession = clearBiometricSession;
  static getBiometricAccounts = getBiometricAccounts;
  static removeBiometricSession = removeBiometricSession;
  static updateCachedProfile = updateCachedProfile;

  /**
   * Store secure session data for biometric users (supports multi-account)
   */
  static async storeBiometricSession(
    userId: string,
    email: string,
    profile?: any,
    refreshToken?: string,
  ): Promise<boolean> {
    try {
      const sessionData: BiometricSessionData = {
        userId,
        email,
        sessionToken: await generateSecureToken(),
        expiresAt: this.nextExpiryIso(),
        lastUsed: new Date().toISOString(),
        profileSnapshot: profile
          ? {
              role: profile.role,
              organization_id: profile.organization_id,
              seat_status: profile.seat_status,
              cached_at: new Date().toISOString(),
            }
          : undefined,
      };

      await storage.setItem(BIOMETRIC_SESSION_KEY, JSON.stringify(sessionData));

      // Persist refresh token separately
      try {
        let tokenToStore = refreshToken;
        if (!tokenToStore) {
          const { getCurrentSession } = await import('@/lib/sessionManager');
          const current = await getCurrentSession();
          tokenToStore = current?.refresh_token;
        }
        if (tokenToStore) {
          await setGlobalRefreshToken(tokenToStore);
          await setRefreshTokenForUser(userId, tokenToStore);
        }
      } catch (storeTokenErr) {
        console.warn('Could not store biometric refresh token:', storeTokenErr);
      }

      // V2 multi-account: store in sessions map and set active user
      try {
        const sessions = await getSessionsMap();
        sessions[userId] = sessionData;
        const prunedSessions = Object.values(sessions)
          .sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime())
          .slice(0, MAX_BIOMETRIC_ACCOUNTS)
          .reduce<Record<string, BiometricSessionData>>((acc, item) => {
            acc[item.userId] = item;
            return acc;
          }, {});
        await setSessionsMap(prunedSessions);
        await setActiveUserId(userId);
      } catch (e) {
        console.warn('Could not persist v2 biometric sessions map:', e);
      }

      if (__DEV__) console.log('Stored biometric session data for user:', email);
      return true;
    } catch (error) {
      console.error('Error storing biometric session:', error);
      return false;
    }
  }

  private static isInvalidRefreshTokenError(error: unknown): boolean {
    const message = String((error as any)?.message || '').toLowerCase();
    return (
      message.includes('invalid login credentials') ||
      message.includes('invalid refresh token') ||
      message.includes('refresh token not found') ||
      message.includes('refresh_token_not_found') ||
      message.includes('invalid_grant')
    );
  }

  private static async restoreTargetUserSession(
    userId: string,
    logLabel: string,
  ): Promise<RestoreTargetUserResult> {
    try {
      const { assertSupabase } = await import('@/lib/supabase');
      const { data: existingSession } = await assertSupabase().auth.getSession();
      if (existingSession?.session?.user?.id === userId) {
        if (__DEV__) {
          console.log(`[AccountSwitch] ${logLabel} already on target user`, {
            targetUserId: userId,
          });
        }
        return { sessionRestored: true, reason: 'ok' };
      }

      const refresh = await getRefreshTokenForUser(userId);
      if (!refresh) {
        if (__DEV__) {
          console.log(`[AccountSwitch] ${logLabel} missing per-user refresh token`, {
            targetUserId: userId,
          });
        }
        return {
          sessionRestored: false,
          reason: 'target_refresh_missing',
          requiresPassword: true,
          error:
            'No saved session found for this account. Please sign in with your password.',
        };
      }

      const { data: refreshed, error: refreshErr } =
        await assertSupabase().auth.refreshSession({
          refresh_token: refresh,
        });
      if (__DEV__) {
        console.log(`[AccountSwitch] ${logLabel} refreshSession(per-user)`, {
          error: refreshErr?.message ?? null,
          gotUserId: refreshed?.session?.user?.id ?? null,
          expected: userId,
        });
      }

      if (refreshErr) {
        if (this.isInvalidRefreshTokenError(refreshErr)) {
          // Fallback: try the global refresh token in case per-user storage lagged
          try {
            const globalToken = await getGlobalRefreshToken();
            if (globalToken && globalToken !== refresh) {
              const { data: globalRefreshed, error: globalErr } =
                await assertSupabase().auth.refreshSession({ refresh_token: globalToken });
              if (!globalErr && globalRefreshed?.session?.user?.id === userId) {
                if (globalRefreshed.session.refresh_token) {
                  await setRefreshTokenForUser(userId, globalRefreshed.session.refresh_token);
                }
                return { sessionRestored: true, reason: 'ok' };
              }
              // Wrong user or error — sign out the wrong session and fall through
              if (globalRefreshed?.session?.user?.id && globalRefreshed.session.user.id !== userId) {
                await assertSupabase().auth.signOut({ scope: 'local' } as any).catch(() => {});
              }
            }
          } catch {
            /* best-effort fallback */
          }

          try {
            await clearRefreshTokenForUser(userId);
          } catch {
            /* best-effort */
          }
          return {
            sessionRestored: false,
            reason: 'target_refresh_invalid',
            requiresPassword: true,
            error:
              'Your saved session for this account expired. Sign in with password to refresh it.',
          };
        }
        return {
          sessionRestored: false,
          reason: 'restore_error',
          error: refreshErr.message || 'Could not restore saved session.',
        };
      }

      const restoredUserId = refreshed?.session?.user?.id;
      if (restoredUserId && restoredUserId !== userId) {
        try {
          await assertSupabase().auth.signOut({ scope: 'local' } as any);
        } catch {
          /* best-effort */
        }
        return {
          sessionRestored: false,
          reason: 'wrong_user_restored',
          error:
            'Session restore returned a different account. Please sign in with password.',
          requiresPassword: true,
        };
      }

      if (!restoredUserId || restoredUserId !== userId) {
        return {
          sessionRestored: false,
          reason: 'restore_error',
          error: 'Could not restore your session for the selected account.',
        };
      }

      if (refreshed.session.refresh_token && refreshed.session.refresh_token !== refresh) {
        await setRefreshTokenForUser(userId, refreshed.session.refresh_token);
      }

      return { sessionRestored: true, reason: 'ok' };
    } catch (error) {
      return {
        sessionRestored: false,
        reason: 'restore_error',
        error: String((error as any)?.message || 'Account switch restore failed.'),
      };
    }
  }

  /**
   * Perform enhanced biometric authentication with session management
   */
  static async authenticateWithBiometric(): Promise<{
    success: boolean;
    userData?: BiometricSessionData;
    sessionRestored?: boolean;
    error?: string;
  }> {
    try {
      const capabilities = await BiometricAuthService.checkCapabilities();
      if (!capabilities.isAvailable || !capabilities.isEnrolled) {
        return {
          success: false,
          error:
            'Biometric authentication is not available or not enrolled on this device',
        };
      }

      const sessionData = await getBiometricSession();
      if (!sessionData) {
        return {
          success: false,
          error: 'No biometric session found. Please sign in with password first.',
        };
      }

      const authResult = await BiometricAuthService.authenticate(
        'Use biometric authentication to sign in',
      );
      if (!authResult.success) {
        return {
          success: false,
          error: authResult.error || 'Biometric authentication failed',
        };
      }

      // Try to restore Supabase session
      const sessionRestored = await this.restoreSupabaseSession(sessionData);

      if (!sessionRestored) {
        if (__DEV__)
          console.log(
            'Failed to restore Supabase session, biometric login cannot proceed',
          );
        return {
          success: false,
          error:
            'Your session has expired. Please sign in with your email and password to refresh your saved account.',
          sessionRestored: false,
        };
      }

      // Update last used time
      sessionData.lastUsed = new Date().toISOString();
      sessionData.expiresAt = this.nextExpiryIso();
      await storage.setItem(BIOMETRIC_SESSION_KEY, JSON.stringify(sessionData));
      const newMap = await getSessionsMap();
      newMap[sessionData.userId] = sessionData;
      await setSessionsMap(newMap);
      await setActiveUserId(sessionData.userId);

      if (__DEV__)
        console.log(
          'Enhanced biometric authentication successful for:',
          sessionData.email,
        );

      // Persist updated session after token refresh
      try {
        const { getCurrentSession } = await import('@/lib/sessionManager');
        const current = await getCurrentSession();
        if (current) {
          await storage.setItem(
            BIOMETRIC_SESSION_KEY,
            JSON.stringify({ ...sessionData, lastUsed: new Date().toISOString() }),
          );
        }
      } catch (persistErr) {
        console.warn('Could not persist biometric session after restore:', persistErr);
      }

      return { success: true, userData: sessionData, sessionRestored };
    } catch (error) {
      console.error('Enhanced biometric authentication error:', error);
      return { success: false, error: 'Authentication failed due to an error' };
    }
  }

  /**
   * Attempt to restore a Supabase session via multiple refresh-token sources.
   * Returns true if a valid session is established.
   */
  private static async restoreSupabaseSession(
    sessionData: BiometricSessionData,
  ): Promise<boolean> {
    try {
      const { assertSupabase } = await import('@/lib/supabase');
      const { data } = await assertSupabase().auth.getSession();

      if (data.session?.user) {
        const existingUserId = data.session.user.id;
        if (existingUserId === sessionData.userId) {
          if (__DEV__) console.log('Valid Supabase session already exists');
          return true;
        }
        // Different user session present (multi-account). Ensure we restore the selected biometric user.
        try {
          await assertSupabase().auth.signOut({ scope: 'local' } as any);
        } catch {
          /* best-effort */
        }
      }

      if (__DEV__) console.log('No active Supabase session, attempting to restore');

      // 1) Per-user biometric refresh token
      const perUserRefresh = await getRefreshTokenForUser(sessionData.userId);
      if (perUserRefresh) {
        const { data: refreshed, error } =
          await assertSupabase().auth.refreshSession({
            refresh_token: perUserRefresh,
          });
        if (!error && refreshed?.session?.user?.id === sessionData.userId) {
          if (__DEV__)
            console.log('Restored via per-user biometric refresh token');
          // Persist rotated refresh token so the next biometric restore does not fail.
          try {
            const rotated = refreshed.session.refresh_token;
            if (rotated && rotated !== perUserRefresh) {
              await setRefreshTokenForUser(sessionData.userId, rotated);
              await setGlobalRefreshToken(rotated);
            }
          } catch (e) {
            console.warn('Could not persist rotated biometric refresh token:', e);
          }
          return true;
        } else if (!error && refreshed?.session?.user?.id) {
          // Wrong-user session established; do not proceed.
          try { await assertSupabase().auth.signOut({ scope: 'local' } as any); } catch { /* best-effort */ }
        } else if (error) {
          const msg = String((error as any)?.message || '');
          const lower = msg.toLowerCase();
          const looksInvalid =
            lower.includes('invalid login credentials') ||
            lower.includes('invalid refresh token') ||
            lower.includes('refresh token not found') ||
            lower.includes('refresh_token_not_found') ||
            lower.includes('invalid_grant');
          if (looksInvalid) {
            // Clear only the invalid refresh token, keep the biometric account entry.
            try { await clearRefreshTokenForUser(sessionData.userId); } catch { /* best-effort */ }
          }
        }
      }

      // 2) sessionManager stored session — only use when it's for the target user
      const { getCurrentSession } = await import('@/lib/sessionManager');
      const storedSession = await getCurrentSession();
      if (__DEV__ && storedSession) {
        console.log('[AccountSwitch] restoreSupabaseSession storedSession', {
          storedUserId: storedSession.user_id,
          targetUserId: sessionData.userId,
          useStored: storedSession.user_id === sessionData.userId,
        });
      }
      if (storedSession?.refresh_token && storedSession.user_id === sessionData.userId) {
        const { data: refreshed, error } =
          await assertSupabase().auth.refreshSession({
            refresh_token: storedSession.refresh_token,
          });
        if (!error && refreshed?.session?.user?.id === sessionData.userId) {
          if (__DEV__)
            console.log('Restored via stored session refresh token');
          try {
            const rotated = refreshed.session.refresh_token;
            if (rotated && rotated !== storedSession.refresh_token) {
              await setRefreshTokenForUser(sessionData.userId, rotated);
              await setGlobalRefreshToken(rotated);
            }
          } catch (e) {
            console.warn('Could not persist rotated refresh token from stored session:', e);
          }
          return true;
        } else if (!error && refreshed?.session?.user?.id) {
          try { await assertSupabase().auth.signOut({ scope: 'local' } as any); } catch { /* best-effort */ }
        }
      }

      // 3) Global biometric refresh token (last resort)
      const globalRefresh = await getGlobalRefreshToken();
      if (globalRefresh) {
        const { data: refreshed, error } =
          await assertSupabase().auth.refreshSession({
            refresh_token: globalRefresh,
          });
        if (!error && refreshed?.session?.user?.id === sessionData.userId) {
          if (__DEV__)
            console.log('Restored via global biometric refresh token');
          try {
            const rotated = refreshed.session.refresh_token;
            if (rotated && rotated !== globalRefresh) {
              await setRefreshTokenForUser(sessionData.userId, rotated);
              await setGlobalRefreshToken(rotated);
            }
          } catch (e) {
            console.warn('Could not persist rotated global refresh token:', e);
          }
          return true;
        } else if (!error && refreshed?.session?.user?.id) {
          try { await assertSupabase().auth.signOut({ scope: 'local' } as any); } catch { /* best-effort */ }
        } else if (error) {
          const msg = String((error as any)?.message || '');
          const lower = msg.toLowerCase();
          const looksInvalid =
            lower.includes('invalid login credentials') ||
            lower.includes('invalid refresh token') ||
            lower.includes('refresh token not found') ||
            lower.includes('refresh_token_not_found') ||
            lower.includes('invalid_grant');
          if (looksInvalid) {
            try { await clearGlobalRefreshToken(); } catch { /* best-effort */ }
          }
        }
      }

      return false;
    } catch (sessionError) {
      console.error('Error during session restoration:', sessionError);
      return false;
    }
  }

  /**
   * Authenticate and restore session for a specific user (switch account)
   */
  static async authenticateWithBiometricForUser(userId: string): Promise<{
    success: boolean;
    userData?: BiometricSessionData;
    sessionRestored?: boolean;
    reason?: AccountSwitchResultReason;
    requiresPassword?: boolean;
    error?: string;
  }> {
    try {
      const capabilities = await BiometricAuthService.checkCapabilities();
      if (!capabilities.isAvailable || !capabilities.isEnrolled) {
        return {
          success: false,
          reason: 'restore_error',
          error: 'Biometric not available or not enrolled',
        };
      }

      const sessions = await getSessionsMap();
      const sessionData = sessions[userId];
      if (!sessionData) {
        return {
          success: false,
          reason: 'target_refresh_missing',
          requiresPassword: true,
          error: 'No biometric session found for selected account',
        };
      }

      const authResult = await BiometricAuthService.authenticate(
        'Confirm to switch account',
      );
      if (!authResult.success) {
        return {
          success: false,
          reason: 'restore_error',
          error: authResult.error || 'Authentication failed',
        };
      }

      if (__DEV__) console.log('[AccountSwitch] Biometric auth passed, restoring session for', userId);
      const restoreResult = await this.restoreTargetUserSession(
        userId,
        'authenticateWithBiometricForUser',
      );
      if (!restoreResult.sessionRestored) {
        return {
          success: false,
          sessionRestored: false,
          reason: restoreResult.reason,
          requiresPassword: restoreResult.requiresPassword,
          error:
            restoreResult.error ||
            'Could not switch account. Please sign in with password.',
        };
      }

      // Update active user and last used ONLY after target-user session is verified.
      sessionData.lastUsed = new Date().toISOString();
      sessionData.expiresAt = this.nextExpiryIso();
      const newMap = await getSessionsMap();
      newMap[userId] = sessionData;
      await setSessionsMap(newMap);
      await setActiveUserId(userId);

      return {
        success: true,
        userData: sessionData,
        sessionRestored: true,
        reason: 'ok',
      };
    } catch (error) {
      console.error('authenticateWithBiometricForUser error:', error);
      return {
        success: false,
        reason: 'restore_error',
        error: 'Authentication failed due to an error',
      };
    }
  }

  /**
   * Restore a Supabase session for a specific user WITHOUT biometric verification.
   * Used when biometrics aren't enrolled but the user has a stored refresh token.
   * This is safe because the user is already authenticated on the device.
   */
  static async restoreSessionForUser(userId: string): Promise<{
    success: boolean;
    userData?: BiometricSessionData;
    sessionRestored?: boolean;
    reason?: AccountSwitchResultReason;
    requiresPassword?: boolean;
    error?: string;
  }> {
    if (__DEV__) console.log('[AccountSwitch] restoreSessionForUser (token path)', { targetUserId: userId });
    try {
      const sessions = await getSessionsMap();
      const sessionData = sessions[userId];
      if (!sessionData) {
        return {
          success: false,
          reason: 'target_refresh_missing',
          requiresPassword: true,
          error: 'No stored session found for this account. Please sign in with your password.',
        };
      }

      // Check if session has expired (30-day biometric session window)
      if (new Date(sessionData.expiresAt) < new Date()) {
        return {
          success: false,
          reason: 'target_refresh_invalid',
          requiresPassword: true,
          error: 'Your saved session has expired. Please sign in with your password.',
        };
      }

      const restoreResult = await this.restoreTargetUserSession(
        userId,
        'restoreSessionForUser',
      );
      if (!restoreResult.sessionRestored) {
        return {
          success: false,
          sessionRestored: false,
          reason: restoreResult.reason,
          requiresPassword: restoreResult.requiresPassword,
          error:
            restoreResult.error ||
            'Failed to restore session. Please sign in manually.',
        };
      }

      // Update active user and last used ONLY after target-user session is verified.
      sessionData.lastUsed = new Date().toISOString();
      sessionData.expiresAt = this.nextExpiryIso();
      const newMap = await getSessionsMap();
      newMap[userId] = sessionData;
      await setSessionsMap(newMap);
      await setActiveUserId(userId);

      return {
        success: true,
        userData: sessionData,
        sessionRestored: true,
        reason: 'ok',
      };
    } catch (error) {
      console.error('restoreSessionForUser error:', error);
      return {
        success: false,
        reason: 'restore_error',
        error: 'Failed to restore session. Please sign in manually.',
      };
    }
  }

  static async revokeSavedAccountSessionsGlobally(userId: string): Promise<{
    globalRevokeStatus: GlobalRevokeStatus;
    error?: string;
  }> {
    try {
      const refresh = await getRefreshTokenForUser(userId);
      if (!refresh) {
        return { globalRevokeStatus: 'token_missing' };
      }

      const { createClient } = await import('@supabase/supabase-js');
      const { supabaseUrl, supabaseAnonKey } = await import('@/lib/supabase');
      if (!supabaseUrl || !supabaseAnonKey) {
        return {
          globalRevokeStatus: 'error',
          error: 'Supabase configuration is missing.',
        };
      }

      const revokeClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storageKey: `edudash-revoke-${userId}-${Date.now()}`,
        },
      });

      const { data: refreshed, error: refreshErr } =
        await revokeClient.auth.refreshSession({
          refresh_token: refresh,
        });
      if (refreshErr) {
        if (this.isInvalidRefreshTokenError(refreshErr)) {
          try {
            await clearRefreshTokenForUser(userId);
          } catch {
            /* best-effort */
          }
          return {
            globalRevokeStatus: 'token_invalid',
            error: 'Saved refresh token is invalid or expired.',
          };
        }
        return {
          globalRevokeStatus: 'error',
          error: refreshErr.message || 'Unable to authenticate saved account.',
        };
      }

      const restoredUserId = refreshed?.session?.user?.id;
      if (!restoredUserId || restoredUserId !== userId) {
        try {
          await revokeClient.auth.signOut({ scope: 'local' } as any);
        } catch {
          /* best-effort */
        }
        return {
          globalRevokeStatus: 'wrong_user',
          error: 'Token did not resolve to the selected account.',
        };
      }

      const { error: signOutErr } = await revokeClient.auth.signOut({
        scope: 'global',
      } as any);
      if (signOutErr) {
        return {
          globalRevokeStatus: 'error',
          error: signOutErr.message || 'Global sign-out failed.',
        };
      }

      try {
        await revokeClient.auth.signOut({ scope: 'local' } as any);
      } catch {
        /* best-effort */
      }

      return { globalRevokeStatus: 'revoked_global' };
    } catch (error) {
      return {
        globalRevokeStatus: 'error',
        error: String((error as any)?.message || 'Unexpected revoke error'),
      };
    }
  }

  /**
   * Setup biometric authentication for a user after successful password login.
   * Returns { success, reason? } — callers should display alerts to the user.
   */
  static async setupBiometricForUser(
    user: any,
    profile?: any,
  ): Promise<{ success: boolean; reason?: string; message?: string }> {
    try {
      const capabilities = await BiometricAuthService.checkCapabilities();
      if (!capabilities.isAvailable || !capabilities.isEnrolled) {
        return {
          success: false,
          reason: 'not_available',
          message: 'Biometric authentication is not available or not set up on this device.',
        };
      }

      const authResult = await BiometricAuthService.authenticate(
        'Enable biometric sign-in for faster access',
      );
      if (!authResult.success) {
        return {
          success: false,
          reason: 'auth_failed',
          message: authResult.error || 'Could not verify biometric authentication',
        };
      }

      const enableResult = await BiometricAuthService.enableBiometric(
        user.id,
        user.email,
      );
      if (!enableResult) return { success: false, reason: 'enable_failed', message: 'Could not enable biometric.' };

      const sessionStored = await this.storeBiometricSession(
        user.id,
        user.email,
        profile,
      );
      if (!sessionStored) {
        await BiometricAuthService.disableBiometric();
        return {
          success: false,
          reason: 'session_failed',
          message: 'Could not complete biometric setup',
        };
      }

      return {
        success: true,
        message: 'You can now use biometric authentication to sign in quickly and securely.',
      };
    } catch (error) {
      console.error('Error setting up biometric authentication:', error);
      return {
        success: false,
        reason: 'error',
        message: 'Failed to set up biometric authentication',
      };
    }
  }
}
