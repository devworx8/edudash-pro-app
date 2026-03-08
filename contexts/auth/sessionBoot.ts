/**
 * Session boot sequence — initial session restoration + visibility handler.
 *
 * Extracted from AuthContext.tsx to comply with WARP.md (≤400 lines).
 *
 * @module contexts/auth/sessionBoot
 */

import { logger } from '@/lib/logger';
import { authDebug } from '@/lib/authDebug';
import { assertSupabase } from '@/lib/supabase';
import { getPostHog } from '@/lib/posthogClient';
import { track } from '@/lib/analytics';
import { Platform } from 'react-native';
import {
  fetchEnhancedUserProfile,
  createPermissionChecker,
  type EnhancedUserProfile,
} from '@/lib/rbac';
import { initializeSession, syncSessionFromSupabase } from '@/lib/sessionManager';
import { initializeVisibilityHandler } from '@/lib/visibilityHandler';
import * as Sentry from '@sentry/react-native';
import type { Session, User } from '@supabase/supabase-js';
import {
  toEnhancedProfile,
  buildFallbackProfileFromSession,
} from '@/contexts/auth/profileUtils';
import { fetchProfileWithFallbacks, type ProfileFetchSetters } from '@/contexts/auth/profileFetch';

const debugLog = (...args: unknown[]) => {
  if (process.env.EXPO_PUBLIC_DEBUG_MODE === 'true' || __DEV__) {
    logger.debug('sessionBoot', ...args);
  }
};

// ── Dependency injection ────────────────────────

export interface BootDeps {
  mounted: { current: boolean };
  setUser: (u: User | null) => void;
  setSession: (s: Session | null) => void;
  setProfile: (p: EnhancedUserProfile | null) => void;
  setPermissions: (p: ReturnType<typeof createPermissionChecker>) => void;
  setProfileLoading: (v: boolean) => void;
  setLoading: (v: boolean) => void;
  setLastRefreshAttempt: (v: number) => void;
  sessionRef: { current: Session | null };
  existingProfile: EnhancedUserProfile | null;
}

// ── Boot function ───────────────────────────────

/**
 * Run the full session-boot sequence:
 * 1. Restore session from secure storage
 * 2. Sync with live Supabase session
 * 3. Fetch fresh user profile
 * 4. Identify in monitoring tools
 * 5. Set up visibility handler
 */
export async function bootSession(deps: BootDeps): Promise<void> {
  try {
    // ── 1. Restore from storage ─────────────
    const { session: stored, profile: storedProfile } = await initializeSession();
    authDebug('initializeSession.result', {
      hasStoredSession: !!stored,
      storedUserId: stored?.user_id,
      hasStoredProfile: !!storedProfile,
    });

    const canUseStored =
      !!stored &&
      !!storedProfile &&
      (
        (storedProfile as any)?.id === stored.user_id ||
        (
          (storedProfile as any)?.email &&
          stored.email &&
          String((storedProfile as any).email).toLowerCase() === String(stored.email).toLowerCase()
        )
      );

    if (stored && deps.mounted.current) {
      deps.setSession({
        access_token: stored.access_token,
        refresh_token: stored.refresh_token,
        expires_at: stored.expires_at,
        user: { id: stored.user_id, email: stored.email },
      } as any);
      deps.setUser({ id: stored.user_id, email: stored.email } as any);

      if (canUseStored) {
        const enhanced = toEnhancedProfile(storedProfile as any);
        deps.setProfile(enhanced);
        deps.setPermissions(createPermissionChecker(enhanced));
      } else {
        deps.setProfile(null);
        deps.setPermissions(createPermissionChecker(null));
      }
    }

    // ── 2. Sync with live session ───────────
    const client = assertSupabase();
    const { data } = await client.auth.getSession();
    authDebug('auth.getSession', { hasSession: !!data.session, userId: data.session?.user?.id });
    syncSessionFromSupabase(data.session ?? null).catch(() => {});

    if (deps.mounted.current) {
      deps.setSession(data.session ?? null);
      deps.setUser(data.session?.user ?? null);
    }

    // ── 3. Fetch fresh profile ──────────────
    if (data.session?.user && deps.mounted.current) {
      try {
        await fetchProfileWithFallbacks(
          data.session.user.id,
          {
            setProfile: deps.setProfile,
            setPermissions: deps.setPermissions,
            setProfileLoading: deps.setProfileLoading,
          },
          deps.existingProfile,
          { mounted: deps.mounted.current },
        );
      } catch (e) {
        logger.debug('Initial profile refresh failed', e);
      }
    }

    // ── 4. Monitoring ───────────────────────
    if (data.session?.user && deps.mounted.current) {
      identifyUser(data.session.user, deps.existingProfile);
    }
  } finally {
    if (deps.mounted.current) {
      deps.setLoading(false);
    }
  }

  // ── 5. Visibility handler ───────────────
  setupVisibilityHandler(deps);
}

// ── Helpers ─────────────────────────────────────

function identifyUser(user: User, profile: EnhancedUserProfile | null): void {
  try {
    const ph = getPostHog();
    ph?.identify(user.id, {
      ...(user.email ? { email: user.email } : {}),
      ...(profile?.role ? { role: profile.role } : {}),
      ...(profile?.organization_id ? { organization_id: profile.organization_id } : {}),
    });
  } catch { /* noop */ }
  try {
    Sentry.setUser({ id: user.id, email: user.email || undefined } as any);
  } catch { /* noop */ }
}

function setupVisibilityHandler(deps: BootDeps): void {
  try {
    const isWeb = Platform.OS === 'web';
    if (isWeb) {
      logger.info('[Visibility] Web visibility tracking enabled (NO auto-refresh)');
      initializeVisibilityHandler({
        onVisibilityChange: (isVisible) => {
          if (isVisible && deps.mounted.current) {
            track('auth.tab_focused', { platform: 'web', timestamp: new Date().toISOString() });
          }
        },
      });
    } else {
      logger.info('[Visibility] Mobile visibility handler enabled');
      initializeVisibilityHandler({
        onSessionRefresh: async () => {
          const now = Date.now();
          deps.setLastRefreshAttempt(now);
          try {
            const { data: { session: cur } } = await assertSupabase().auth.getSession();
            if (cur && deps.mounted.current) {
              if (deps.sessionRef.current?.access_token !== cur.access_token) {
                deps.setSession(cur);
                deps.setUser(cur.user);
              }
            }
          } catch (e) {
            logger.error('sessionBoot', 'Mobile session refresh failed:', e);
          }
        },
        onVisibilityChange: (isVisible) => {
          if (isVisible && deps.mounted.current) {
            track('auth.tab_focused', { platform: 'mobile', timestamp: new Date().toISOString() });
          }
        },
        refreshDelay: 2000,
      });
    }
  } catch (e) {
    logger.debug('[Visibility] Handler init failed', e);
  }
}
