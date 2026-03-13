import React, { useEffect, useRef } from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { router, useRootNavigationState } from 'expo-router';
import * as Linking from 'expo-linking';
import { useAuth } from '@/contexts/AuthContext';
import MarketingLanding from '@/components/marketing/MarketingLanding';
import { isNavigationLocked, routeAfterLogin } from '@/lib/routeAfterLogin';
import { useTheme } from '@/contexts/ThemeContext';
import { setPasswordRecoveryInProgress } from '@/lib/sessionManager';
import { parseDeepLinkUrl } from '@/lib/utils/deepLink';
import { logger } from '@/lib/logger';

const TAG = 'Index';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
// Default theme fallback (used before ThemeProvider mounts)
const defaultTheme = {
  background: '#ffffff',
  primary: '#007AFF',
};

/**
 * Root index route - handles different flows based on platform:
 * - Native app (installed): Skip landing, go directly to sign-in or dashboard
 * - Web (not installed): Show marketing landing page
 * - Authenticated users: Redirect to appropriate dashboard
 */
export default function Index() {
  const { session, user, profile, loading, profileLoading } = useAuth();
  const rootNavigationState = useRootNavigationState();
  // Safe theme access with fallback
  let theme = defaultTheme;
  try {
    const themeContext = useTheme();
    theme = themeContext.theme;
  } catch (err) {
    // ThemeProvider not yet mounted, use default
  }
  const hasNavigatedRef = useRef(false);
  const isNative = Platform.OS !== 'web';
  const isRootNavigationReady = Boolean(rootNavigationState?.key);

  useEffect(() => {
    // Wait for auth to finish loading
    if (loading) return;
    if (!isRootNavigationReady) return;
    
    // Prevent duplicate navigation
    if (hasNavigatedRef.current) return;
    
    // If AuthContext is still resolving the profile after sign-in,
    // let it handle routing via SIGNED_IN handler — don't compete.
    // This prevents Index + AuthContext from both calling routeAfterLogin.
    if (session && user && !profile && profileLoading) return;
    if (session && user && isNavigationLocked(user.id)) return;
    
    // Native app: Always skip landing page
    if (isNative) {
      // If we were launched via a deep link (e.g. PayFast return -> /landing?flow=payment-return),
      // respect it and route there before running our "default" native redirects.
      // This avoids losing deep links on cold start due to the Index screen redirecting immediately.
      (async () => {
        try {
          const initialUrl = await Linking.getInitialURL();
          if (initialUrl) {
            const { path, params } = parseDeepLinkUrl(initialUrl);

            // Ignore common "empty" or dev-client URLs
            const shouldHandle =
              !!path &&
              path !== '/' &&
              !path.startsWith('/--/') &&
              !path.startsWith('/expo-development-client');

            if (shouldHandle) {
              const search = new URLSearchParams();
              for (const [k, v] of Object.entries(params)) {
                if (v === undefined || v === null || v === '') continue;
                search.set(k, String(v));
              }
              const target = `${path}${search.toString() ? `?${search.toString()}` : ''}`;
              logger.info(TAG, 'Detected initial deep link, routing to:', target);
              
              // Special handling for auth-related deep links
              if (path === '/reset-password' || path.includes('reset-password')) {
                logger.info(TAG, 'Password reset deep link detected - routing to native reset flow');
                // Set recovery flag early so AuthContext does not auto-route away.
                try { setPasswordRecoveryInProgress(true); } catch { /* non-fatal */ }
                hasNavigatedRef.current = true;
                router.replace(`/reset-password${search.toString() ? `?${search.toString()}` : ''}` as `/${string}`);
                return;
              }
              if (path === '/auth-callback' || path.includes('auth-callback')) {
                logger.info(TAG, 'Auth callback deep link detected');
                const flow = String(params.flow || params.type || '').toLowerCase();
                if (flow === 'recovery') {
                  try { setPasswordRecoveryInProgress(true); } catch { /* non-fatal */ }
                }
                hasNavigatedRef.current = true;
                router.replace(`/auth-callback${search.toString() ? `?${search.toString()}` : ''}` as `/${string}`);
                return;
              }
              
              hasNavigatedRef.current = true;
              router.replace(target as `/${string}`);
              return;
            }
          }
        } catch (e) {
          // Non-fatal: continue with normal routing below
        }

        // If authenticated with profile, go to dashboard
        if (session && user && profile?.role) {
          logger.info(TAG, 'Native + authenticated, routing to dashboard');
          hasNavigatedRef.current = true;
          routeAfterLogin(user, profile).catch((err) => {
            console.error('[Index] routeAfterLogin failed:', err);
            hasNavigatedRef.current = false;
            // AuthContext may already be routing this user; avoid competing redirects here.
          });
        } else if (session && user) {
          // Authenticated but no role - go to profiles gate
          logger.info(TAG, 'Native + authenticated but no role, going to profiles-gate');
          hasNavigatedRef.current = true;
          router.replace('/profiles-gate');
        } else {
          // Not authenticated - go to next-gen welcome (Sign In | Sign Up)
          logger.info(TAG, 'Native + not authenticated, going to welcome');
          hasNavigatedRef.current = true;
          router.replace('/(auth)/welcome');
        }
      })();
      return;
    }
    
    // Web: Only redirect if authenticated
    if (session && user) {
      logger.info(TAG, 'Web + authenticated, routing to dashboard');
      
      if (profile?.role) {
        hasNavigatedRef.current = true;
        routeAfterLogin(user, profile).catch((err) => {
          console.error('[Index] routeAfterLogin failed:', err);
          hasNavigatedRef.current = false;
          // AuthContext may already be routing this user; avoid competing redirects here.
        });
      } else {
        hasNavigatedRef.current = true;
        router.replace('/profiles-gate');
      }
    }
    // Web + not authenticated: Show landing page (default render)
  }, [session, user, profile, loading, isNative, isRootNavigationReady, profileLoading]);

  // Native: Show loading indicator while redirecting (NEVER show landing page)
  if (isNative) {
    return (
      <View style={[styles.nativeLoading, { backgroundColor: theme.background }]}>
        <EduDashSpinner size="large" color={theme.primary} />
      </View>
    );
  }
  
  // Web: Show landing page for unauthenticated users or while loading
  return <MarketingLanding />;
}

const styles = StyleSheet.create({
  nativeLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
