/**
 * SIGNED_OUT auth-event handler.
 *
 * Extracted from AuthContext.tsx to comply with WARP.md (≤400 lines).
 *
 * @module contexts/auth/handleSignedOut
 */

import { logger } from '@/lib/logger';
import { authDebug } from '@/lib/authDebug';
import { assertSupabase } from '@/lib/supabase';
import { getPostHog } from '@/lib/posthogClient';
import { track } from '@/lib/analytics';
import { createPermissionChecker, type EnhancedUserProfile, type PermissionChecker } from '@/lib/rbac';
import * as Sentry from '@sentry/react-native';
import type { User } from '@supabase/supabase-js';

export interface SignedOutDeps {
  mounted: boolean;
  setProfile: (p: EnhancedUserProfile | null) => void;
  setPermissions: (p: PermissionChecker) => void;
  setUser: (u: User | null) => void;
  setSession: (s: any) => void;
  setProfileLoading: (v: boolean) => void;
  lastUserIdRef: { current: string | null };
  /** Falls back to this if session has no user. */
  fallbackUserId?: string | null;
}

/**
 * Handle SIGNED_OUT event — clears all auth-related React state,
 * storage, push registration, and monitoring identities.
 */
export async function handleSignedOut(
  sessionUser: User | null | undefined,
  deps: SignedOutDeps,
): Promise<void> {
  const userId = sessionUser?.id || deps.fallbackUserId;
  authDebug('auth.signed_out', { userId });
  logger.debug('handleSignedOut', 'SIGNED_OUT event received, clearing all auth state');

  // Clear React state
  deps.setProfile(null);
  deps.setPermissions(createPermissionChecker(null));
  deps.setUser(null);
  deps.setSession(null);
  deps.setProfileLoading(false);
  deps.lastUserIdRef.current = null;

  // Clear auth storage keys
  import('@/lib/auth/authStorageKeys')
    .then(({ clearAuthStorage }) => {
      const { storage } = require('@/lib/session/storage');
      clearAuthStorage(storage).catch(() => {});
    })
    .catch(() => {});

  // Deregister push device (guard: userId may be undefined during anon sign-out)
  if (userId) {
    try {
      const { deregisterPushDevice } = await import('@/lib/notifications');
      await deregisterPushDevice(assertSupabase(), { id: userId });
    } catch (e) {
      logger.debug('Push deregistration failed', e);
    }
  }

  // Deactivate device session
  import('@/lib/deviceSessionTracker')
    .then(({ deactivateDeviceSession }) => deactivateDeviceSession().catch(() => {}))
    .catch(() => {});

  // Clear monitoring
  try { await getPostHog()?.reset(); } catch { /* noop */ }
  try { Sentry.setUser(null as any); } catch { /* noop */ }

  track('edudash.auth.signed_out', {});

  // Toast confirmation — skip when user is switching accounts so it doesn't feel like a full sign-out
  try {
    const { isAccountSwitchPending } = await import('@/lib/authActions');
    if (!isAccountSwitchPending()) {
      const { toast } = await import('@/components/ui/ToastProvider');
      toast.success('You have been signed out');
    }
  } catch { /* noop */ }

  logger.debug('handleSignedOut', 'Sign-out cleanup complete — navigation handled by useAuthGuard');
}
