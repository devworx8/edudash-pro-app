/**
 * Sign Out Hook
 * 
 * Extracted from AuthContext to meet WARP.md file size limits.
 * Handles sign out with proper cleanup of analytics, monitoring, and navigation.
 */

import { useCallback } from 'react';
import { Platform } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { signOut } from '@/lib/sessionManager';
import { logger } from '@/lib/logger';
import { getPostHog } from '@/lib/posthogClient';
import { securityAuditor } from '@/lib/security-audit';
import { createPermissionChecker, type EnhancedUserProfile, type PermissionChecker } from '@/lib/rbac';
import type { Session, User } from '@supabase/supabase-js';

const TAG = 'SignOut';

export interface SignOutActions {
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  setProfile: (profile: EnhancedUserProfile | null) => void;
  setPermissions: (permissions: PermissionChecker) => void;
  setProfileLoading: (loading: boolean) => void;
}

/**
 * Hook to handle sign out with proper cleanup
 */
export function useSignOut(
  user: User | null,
  profile: EnhancedUserProfile | null,
  session: Session | null,
  actions: SignOutActions,
): () => Promise<void> {
  const queryClient = useQueryClient();

  return useCallback(async () => {
    try {
      logger.info(TAG, 'Starting sign-out process...');
      
      // Security audit for logout
      if (user?.id) {
        securityAuditor.auditAuthenticationEvent(user.id, 'logout', {
          role: profile?.role,
          session_duration: session ? Date.now() - (session.user.created_at ? new Date(session.user.created_at).getTime() : Date.now()) : null,
        });
      }
      
      // Clear all state immediately to prevent stale data
      logger.info(TAG, 'Clearing auth state...');
      actions.setUser(null);
      actions.setSession(null);
      actions.setProfile(null);
      actions.setPermissions(createPermissionChecker(null));
      actions.setProfileLoading(false);
      
      // Clear TanStack Query cache to prevent stale data flash
      try {
        logger.debug(TAG, 'Clearing TanStack Query cache...');
        queryClient.clear();
        logger.debug(TAG, 'Query cache cleared successfully');
      } catch (cacheErr) {
        console.warn('[AuthContext] Query cache clear failed:', cacheErr);
      }
      
      // CRITICAL: Clear all navigation locks before sign-out to prevent stale locks
      // This prevents sign-in freeze caused by leftover locks from previous session
      try {
        const { clearAllNavigationLocks } = await import('@/lib/routeAfterLogin');
        clearAllNavigationLocks();
        logger.debug(TAG, 'All navigation locks cleared before sign-out');
      } catch (lockErr) {
        console.warn('[AuthContext] Failed to clear navigation locks (non-fatal):', lockErr);
      }
      
      // Call sessionManager sign out (this clears storage and Supabase session)
      await signOut();
      
      // Clear PostHog and Sentry
      try {
        await getPostHog()?.reset();
        logger.debug(TAG, 'PostHog reset completed');
      } catch (e) {
        console.warn('[AuthContext] PostHog reset failed:', e);
      }
      
      try {
        Sentry.setUser(null as any);
        logger.debug(TAG, 'Sentry user cleared');
      } catch (e) {
        console.warn('[AuthContext] Sentry clear user failed:', e);
      }
      
      logger.info(TAG, 'Sign-out completed successfully');
      
      // Navigate to sign-in screen
      navigateToSignIn();
    } catch (error) {
      console.error('[AuthContext] Sign out failed:', error);
      
      // Even if sign-out fails, clear local state to prevent UI issues
      actions.setUser(null);
      actions.setSession(null);
      actions.setProfile(null);
      actions.setPermissions(createPermissionChecker(null));
      
      // Clear query cache even on error
      try {
        queryClient.clear();
      } catch { /* Intentional: non-fatal */ }
      
      // Security audit for failed logout
      if (user?.id) {
        securityAuditor.auditAuthenticationEvent(user.id, 'auth_failure', {
          action: 'logout',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      
      // Still try to navigate even if there was an error
      navigateToSignIn();
    }
  }, [user?.id, profile?.role, session, queryClient, actions]);
}

/**
 * Navigate to sign-in screen with proper history management
 */
function navigateToSignIn(): void {
  try {
    // Web-only: Clear browser history to prevent back button to protected routes
    if (Platform.OS === 'web') {
      try {
        const w = globalThis as any;
        // Clear all history and navigate to sign-in with a fresh history stack
        if (w?.location) {
          // Use location.replace to completely replace history entry
          w.location.replace('/(auth)/sign-in');
          logger.debug(TAG, 'Browser navigated to sign-in with history cleared');
        } else {
          // Fallback to router if location is not available
          router.replace('/(auth)/sign-in');
        }
      } catch (historyErr) {
        console.warn('[AuthContext] Browser history manipulation failed:', historyErr);
        router.replace('/(auth)/sign-in');
      }
    } else {
      // Mobile: use router replace
      router.replace('/(auth)/sign-in');
    }
  } catch (navErr) {
    console.error('[AuthContext] Navigation to sign-in failed:', navErr);
    try { router.replace('/sign-in'); } catch { /* Intentional: non-fatal */ }
  }
}
