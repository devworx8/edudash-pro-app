// NOTE: Promise.any polyfill is loaded via Metro's getModulesRunBeforeMainModule
// in metro.config.js, which ensures it runs BEFORE any module initialization.
// No need to import it here.

import '../polyfills/react-use';

import 'react-native-get-random-values';
import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Platform, LogBox, useWindowDimensions } from 'react-native';
import { logger } from '@/lib/logger';

const TAG = 'RootLayout';
// Initialize i18n globally (web + native)
import '../lib/i18n';

// Suppress known dev warnings
if (__DEV__) {
  LogBox.ignoreLogs([
    'shadow* style props are deprecated',
    'textShadow* style props are deprecated',
    'props.pointerEvents is deprecated',
    'Require cycle:', // Suppress circular dependency warnings in dev
  ]);
}

// Initialize notification router for multi-account support
import { setupNotificationRouter } from '../lib/NotificationRouter';
// Initialize notification handler (setNotificationHandler) so foreground notifications display
import '../lib/NotificationService';
// Initialize agentic tool registry on startup
import { initializeTools } from '../services/dash-ai/tools';
initializeTools();
import { StatusBar } from 'expo-status-bar';
import { Stack, router, usePathname } from 'expo-router';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import ToastProvider from '../components/ui/ToastProvider';
import { QueryProvider } from '../lib/query/queryClient';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { SubscriptionProvider } from '../contexts/SubscriptionContext';
import { AdsProvider } from '../contexts/AdsContext';
import { DashAIProvider } from '../contexts/DashAIContext';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { DashboardPreferencesProvider } from '../contexts/DashboardPreferencesContext';
import { UpdatesProvider } from '../contexts/UpdatesProvider';
import { TermsProvider } from '../contexts/TerminologyContext';
import { OnboardingProvider } from '../contexts/OnboardingContext';
import { SpotlightTourProvider } from '../contexts/SpotlightTourContext';
import { allTours } from '../lib/tours';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AlertProvider } from '../components/ui/StyledAlert';
import { ErrorBoundary } from '../components/ErrorBoundary';
import DashWakeWordListener from '../components/ai/DashWakeWordListener';
import type { IDashAIAssistant } from '../services/dash-ai/DashAICompat';
import { DraggableDashFAB } from '../components/ui/DraggableDashFAB';
import { BottomTabBar } from '../components/navigation/BottomTabBar';
import { roleHasCenterDashTab } from '@/lib/navigation/navManifest';
import { isHiddenBottomNavPath } from '@/components/navigation/bottom-tabs/tabs';
import { buildVisibleTabs, getBottomTabVariant } from '@/components/navigation/bottom-tabs/helpers';
import { getBottomTabBarHeight } from '@/components/navigation/bottom-tabs/styles';
import { AnimatedSplash } from '../components/ui/AnimatedSplash';
import { CallProvider } from '../components/calls/CallProvider';
import { NotificationProvider } from '../contexts/NotificationContext';
import { GlobalUpdateBanner } from '../components/GlobalUpdateBanner';
import { SuperAdminImpersonationBanner } from '../components/super-admin/SuperAdminImpersonationBanner';
import { AppPreferencesProvider, useAppPreferencesSafe } from '../contexts/AppPreferencesContext';
import { ActiveChildProvider } from '../contexts/ActiveChildContext';
import { OrganizationBrandingProvider } from '../contexts/OrganizationBrandingContext';
import { AppTutorial } from '../components/onboarding/AppTutorial';
import { FloatingCallOverlay } from '../components/calls/FloatingCallOverlay';
import { BirthdayReminderStickyModal } from '../components/notifications/BirthdayReminderStickyModal';
import { PlayStoreUpdateChecker } from '../components/updates/PlayStoreUpdateChecker';
import { LoadingOverlayProvider, useLoadingOverlay } from '../contexts/LoadingOverlayContext';
import GlobalLoadingOverlay from '../components/ui/GlobalLoadingOverlay';
import { registerAppResetHandler } from '../lib/appReset';

// Extracted utilities and hooks (WARP.md refactoring)
import { useAuthGuard, useMobileWebGuard } from '../hooks/useRouteGuard';
import { useFABVisibility } from '../hooks/useFABVisibility';
import { useRouteInterstitial } from '../hooks/useRouteInterstitial';
import { setupPWAMetaTags } from '../lib/utils/pwa';
import { injectWebStyles } from '../lib/utils/web-styles';
import * as Linking from 'expo-linking';
import { setPasswordRecoveryInProgress } from '../lib/sessionManager';
import { patchNativeEventEmitterModules } from '../lib/nativeEventEmitterPatch';
import { parseDeepLinkUrl } from '../lib/utils/deepLink';
import { assertSupabase } from '../lib/supabase';
import { checkAndRefreshTokenIfNeeded, registerPushDevice } from '../lib/notifications';
import { resolveExplicitSchoolTypeFromProfile, resolveSchoolTypeFromProfile } from '../lib/schoolTypeResolver';
import { initPerformanceMonitoring } from '../lib/perf';
import { installThemedNativeAlert } from '@/lib/ui/installThemedNativeAlert';
import { getFeatureFlagsSync } from '@/lib/featureFlags';
import { uiTokens } from '@/lib/ui/tokens';
import { useFinancePrivacyMode } from '@/hooks/useFinancePrivacyMode';

patchNativeEventEmitterModules();

// Stable screen options — memoized outside component to prevent new object references
// on every render (which triggers Stack internal setState → re-render → infinite loop).
const STACK_SCREEN_OPTIONS = {
  headerShown: false as const,
  presentation: 'card' as const,
  animationTypeForReplace: 'push' as const,
  contentStyle: { backgroundColor: 'transparent' },
};
const WEB_DESKTOP_BREAKPOINT = 1024;

/** Bridge that reads user role from AuthContext and passes to SpotlightTourProvider */
function SpotlightTourBridge({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const role = profile?.role ?? undefined;
  return (
    <SpotlightTourProvider tours={allTours} userRole={role}>
      {children}
    </SpotlightTourProvider>
  );
}

// Inner component with access to AuthContext
function LayoutContent() {
  const pathname = usePathname();
  const { loading: authLoading, profileLoading, user, profile } = useAuth();
  const { isDark, theme } = useTheme();
  const loadingOverlay = useLoadingOverlay();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pushRegistrationRef = useRef<{ userId: string; attempted: boolean } | null>(null);

  // App preferences for FAB visibility
  const { showDashFAB, powerUserModeEnabled, tutorialCompleted } = useAppPreferencesSafe();
  const { hideFeesOnDashboards } = useFinancePrivacyMode();

  // Route guards (auth + mobile web)
  useAuthGuard();
  useMobileWebGuard();
  useRouteInterstitial();

  // FAB visibility logic
  const { shouldHideFAB } = useFABVisibility(pathname);

  // Determine if on auth route for FAB delay logic
  const isAuthRoute =
    typeof pathname === 'string' &&
    (pathname.startsWith('/(auth)') ||
      pathname === '/sign-in' ||
      pathname === '/(auth)/sign-in' ||
      pathname === '/landing' ||
      pathname === '/' ||
      pathname.includes('auth-callback') ||
      pathname.includes('sign-up') ||
      pathname.includes('signup') ||
      pathname.includes('register'));

  const shouldShowOverlay =
    (!isAuthRoute && (authLoading || profileLoading)) || loadingOverlay.visible;
  const isReadyForFAB = !authLoading && !profileLoading && !isAuthRoute && !!user;

  useEffect(() => {
    installThemedNativeAlert(isDark);
  }, [isDark]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!user?.id) {
      pushRegistrationRef.current = null;
      return;
    }
    if (pushRegistrationRef.current?.userId === user.id && pushRegistrationRef.current.attempted) {
      return;
    }

    pushRegistrationRef.current = { userId: user.id, attempted: true };
    const supabase = assertSupabase();
    checkAndRefreshTokenIfNeeded(supabase, user).catch(() => {
      registerPushDevice(supabase, user).catch(() => {});
    });
  }, [user?.id]);

  // Determine if FAB should be visible (user pref + route logic + must be logged in)
  const normalizedRole = String(profile?.role || 'parent').toLowerCase();
  const isPrincipalRole = normalizedRole === 'principal' || normalizedRole === 'principal_admin';
  const hasExplicitSchoolType = Boolean(resolveExplicitSchoolTypeFromProfile(profile));
  const hasAdminCenterDashTab = normalizedRole === 'admin' && hasExplicitSchoolType;
  const shouldShowFAB =
    isReadyForFAB && !shouldHideFAB && powerUserModeEnabled && showDashFAB && !!user;
  const hasCenterDashTab = roleHasCenterDashTab(normalizedRole) || hasAdminCenterDashTab;
  const shouldRenderFAB = shouldShowFAB && (!hasCenterDashTab || isPrincipalRole);
  const resolvedSchoolType = resolveSchoolTypeFromProfile(profile);
  const featureFlags = getFeatureFlagsSync();
  const bottomTabVariant = getBottomTabVariant(
    pathname,
    { userRole: normalizedRole, resolvedSchoolType },
    featureFlags,
  );
  const isWeb = Platform.OS === 'web';
  const isCoarsePointer =
    isWeb && typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches;
  const hasTouchPoints =
    isWeb && typeof navigator !== 'undefined' && (navigator.maxTouchPoints || 0) > 0;
  const isTouchDevice = isCoarsePointer || hasTouchPoints;
  const isWebDesktop = isWeb && windowWidth >= WEB_DESKTOP_BREAKPOINT && !isTouchDevice;
  const isCompactWeb = windowWidth < 360 || windowHeight < 700;
  const navBottomPadding = Math.max(insets.bottom, uiTokens.spacing.xs);
  const webBottomNavClearance = getBottomTabBarHeight({
    isCompact: isCompactWeb,
    navBottomPadding,
    isK12ParentNextGenNav: bottomTabVariant.isK12ParentNextGenNav,
  });
  const { tabs: visibleTabs } = buildVisibleTabs(profile, hideFeesOnDashboards);
  const hasVisibleBottomTabs = visibleTabs.length > 0;
  const shouldReserveBottomNavSpace =
    isWeb &&
    !isWebDesktop &&
    Boolean(user) &&
    Boolean(profile) &&
    hasVisibleBottomTabs &&
    !isHiddenBottomNavPath(pathname || null);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} animated />

      {/* App Tutorial - shows on first launch */}
      {Platform.OS !== 'web' && !tutorialCompleted && <AppTutorial />}

      {/* OTA Update Banner - shows when update is downloaded */}
      {Platform.OS !== 'web' && <GlobalUpdateBanner />}

      {/* Play Store Update Checker - prompts for native app updates */}
      {Platform.OS !== 'web' && <PlayStoreUpdateChecker />}

      {Platform.OS !== 'web' && <DashWakeWordListener />}

      <SuperAdminImpersonationBanner />

      {/* Main content area - leave space for bottom nav */}
      <View
        style={[
          styles.contentContainer,
          isWeb && shouldReserveBottomNavSpace
            ? { paddingBottom: webBottomNavClearance }
            : null,
        ]}
      >
        <Stack screenOptions={STACK_SCREEN_OPTIONS}>
          {/* Let Expo Router auto-discover screens */}
        </Stack>
      </View>

      {/* Draggable Dash Chat FAB - visible on dashboards and main screens */}
      {/* Hidden for center-tab roles, except principal power users */}
      {shouldRenderFAB && <DraggableDashFAB />}

      {/* Persistent Bottom Navigation - positioned at bottom */}
      <BottomTabBar />

      {/* Floating Call Overlay - persists across all screens and when backgrounded */}
      <FloatingCallOverlay />

      {/* Sticky acknowledgment for upcoming birthday reminders (7/5-day pipeline) */}
      <BirthdayReminderStickyModal />

      <GlobalLoadingOverlay
        visible={shouldShowOverlay}
        message={
          loadingOverlay.message ||
          (authLoading || profileLoading ? 'Loading your dashboard...' : undefined)
        }
      />

      {/* Call Interfaces are rendered by CallProvider - no duplicates needed here */}
    </View>
  );
}

export default function RootLayout() {
  const [resetKey, setResetKey] = useState(0);

  if (__DEV__) logger.debug(TAG, 'Rendering...');

  // Setup PWA meta tags on web
  useEffect(() => {
    initPerformanceMonitoring();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') {
      setupPWAMetaTags();
    }
  }, []);

  useEffect(() => {
    return registerAppResetHandler(() => {
      setResetKey((prev) => prev + 1);
    });
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider key={resetKey}>
        <QueryProvider>
          <ThemeProvider>
            <AuthProvider>
              <SubscriptionProvider>
                <AdsProvider>
                  <DashAIProvider>
                    <UpdatesProvider>
                      <AppPreferencesProvider>
                        <ActiveChildProvider>
                          <NotificationProvider>
                            <CallProvider>
                              <SpotlightTourBridge>
                                <OnboardingProvider>
                                  <OrganizationBrandingProvider>
                                    <DashboardPreferencesProvider>
                                      <TermsProvider>
                                        <ToastProvider>
                                          <LoadingOverlayProvider>
                                            <AlertProvider>
                                              <GestureHandlerRootView style={{ flex: 1 }}>
                                                <RootLayoutContent />
                                              </GestureHandlerRootView>
                                            </AlertProvider>
                                          </LoadingOverlayProvider>
                                        </ToastProvider>
                                      </TermsProvider>
                                    </DashboardPreferencesProvider>
                                  </OrganizationBrandingProvider>
                                </OnboardingProvider>
                              </SpotlightTourBridge>
                            </CallProvider>
                          </NotificationProvider>
                        </ActiveChildProvider>
                      </AppPreferencesProvider>
                    </UpdatesProvider>
                  </DashAIProvider>
                </AdsProvider>
              </SubscriptionProvider>
            </AuthProvider>
          </ThemeProvider>
        </QueryProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

function RootLayoutContent() {
  const [dashInstance, setDashInstance] = useState<IDashAIAssistant | null>(null);
  const [showSplash, setShowSplash] = useState(true);
  const { session } = useAuth();
  const lastDashSessionTokenRef = useRef<string | null>(null);

  if (__DEV__) logger.debug(TAG, 'RootLayoutContent Rendering...');

  // Setup notification router on native (once per app lifecycle)
  useEffect(() => {
    if (Platform.OS === 'web') return;

    logger.debug(TAG, 'Setting up notification router...');
    const cleanup = setupNotificationRouter();

    return () => {
      logger.debug(TAG, 'Cleaning up notification router');
      cleanup();
    };
  }, []);

  // Handle runtime deep links (e.g. returning from PayFast while the app is already open).
  // Cold-start deep links are handled by Expo Router + `app/index.tsx` safeguards, but warm-start
  // needs an explicit listener because the app may resume to the previous screen.
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const handleUrl = (url: string) => {
      try {
        const { path: normalized, params } = parseDeepLinkUrl(url);

        // Handle reset-password deep links (warm start)
        if (normalized === '/reset-password' || normalized.includes('reset-password')) {
          const search = new URLSearchParams();
          for (const [k, v] of Object.entries(params)) {
            if (v === undefined || v === null || v === '') continue;
            search.set(k, String(v));
          }
          logger.info(TAG, 'Password reset deep link detected - routing to native reset flow');
          try {
            setPasswordRecoveryInProgress(true);
          } catch {
            /* non-fatal */
          }
          router.replace(
            `/reset-password${search.toString() ? `?${search.toString()}` : ''}` as `/${string}`,
          );
          return;
        }

        // Handle auth-callback deep links (warm start)
        if (normalized === '/auth-callback' || normalized.includes('auth-callback')) {
          const search = new URLSearchParams();
          for (const [k, v] of Object.entries(params)) {
            if (v === undefined || v === null || v === '') continue;
            search.set(k, String(v));
          }
          logger.info(TAG, 'Auth callback deep link (warm start)');
          const flow = String(params.flow || params.type || '').toLowerCase();
          if (flow === 'recovery') {
            try {
              setPasswordRecoveryInProgress(true);
            } catch {
              /* non-fatal */
            }
          }
          router.replace(
            `/auth-callback${search.toString() ? `?${search.toString()}` : ''}` as `/${string}`,
          );
          return;
        }

        const flow = String(params.flow || '').toLowerCase();
        if (flow === 'payment-return' || flow === 'payment-cancel') {
          const paymentPath = flow === 'payment-return' ? 'return' : 'cancel';
          const search = new URLSearchParams();
          for (const [k, v] of Object.entries(params)) {
            if (k === 'flow') continue;
            if (v === undefined || v === null || v === '') continue;
            search.set(k, String(v));
          }
          const target = `/screens/payments/${paymentPath}${search.toString() ? `?${search.toString()}` : ''}`;
          router.replace(target as `/${string}`);
          return;
        }

        // Handle direct custom-scheme links (edudashpro://screens/payments/return?...).
        if (
          normalized.startsWith('/screens/payments/return') ||
          normalized.startsWith('/screens/payments/cancel')
        ) {
          const search = new URLSearchParams();
          for (const [k, v] of Object.entries(params)) {
            if (v === undefined || v === null || v === '') continue;
            search.set(k, String(v));
          }
          const target = `${normalized}${search.toString() ? `?${search.toString()}` : ''}`;
          router.replace(target as `/${string}`);
        }
      } catch {
        // ignore
      }
    };

    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  // Register service worker for PWA (web-only)
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const n = typeof navigator !== 'undefined' ? navigator : undefined;

    if (n?.serviceWorker) {
      n.serviceWorker
        .register('/sw.js')
        .then((registration: ServiceWorkerRegistration) => {
          logger.info(TAG, 'PWA Service worker registered:', registration.scope);
        })
        .catch((error: Error) => {
          logger.warn(TAG, 'PWA Service worker registration failed:', error);
        });
    } else {
      logger.debug(TAG, 'PWA Service workers not supported in this browser');
    }
  }, []);

  // Initialize Dash AI Assistant at root level and sync context
  useEffect(() => {
    // Skip Dash AI on web platform
    if (Platform.OS === 'web') {
      logger.debug(TAG, 'Skipping Dash AI on web');
      return;
    }

    // Skip initialization if no session (unauthenticated)
    if (!session) {
      lastDashSessionTokenRef.current = null;
      return;
    }

    // De-duplicate: skip if the access_token is the same as last init.
    // AuthContext emits multiple setSession calls during boot (cached → fresh),
    // each creating a new object reference. Without this guard, Dash AI
    // re-initializes on each reference change, calling AudioModule.setAudioModeAsync
    // which triggers a background→active AppState blip on Android.
    const currentToken = session.access_token;
    if (currentToken && currentToken === lastDashSessionTokenRef.current) {
      if (__DEV__) logger.debug(TAG, 'Skipping duplicate Dash AI init (same token)');
      return;
    }
    lastDashSessionTokenRef.current = currentToken ?? null;

    (async () => {
      try {
        const module = await import('../services/dash-ai/DashAICompat');
        type DashModule = {
          DashAIAssistant?: { getInstance?: () => IDashAIAssistant };
          default?: { getInstance?: () => IDashAIAssistant };
        };
        const typedModule = module as DashModule;
        const DashClass = typedModule.DashAIAssistant || typedModule.default;
        const dash: IDashAIAssistant | null = DashClass?.getInstance?.() || null;
        if (dash) {
          await dash.initialize();
          setDashInstance(dash);
          // Best-effort: sync Dash user context (language, traits)
          // Only call Edge Functions when authenticated
          try {
            const { getCurrentLanguage } = await import('../lib/i18n');
            const { syncDashContext } = await import('../lib/agent/dashContextSync');
            const { getAgenticCapabilitiesForContext } = await import('../lib/utils/agentic-mode');
            const { getCurrentProfile } = await import('../lib/sessionManager');
            const profile = await getCurrentProfile().catch(() => null);
            const role = profile?.role as string | undefined;
            const language = getCurrentLanguage();
            const tier =
              (profile as any)?.plan_tier || (profile as any)?.subscription_tier || 'free';
            const caps = role
              ? await getAgenticCapabilitiesForContext({
                  userId: profile?.id || session?.user?.id || '',
                  profile: profile || undefined,
                  role: role || '',
                  tier,
                  language,
                })
              : {
                  mode: 'assistant',
                  canRunDiagnostics: false,
                  canMakeCodeChanges: false,
                  canAccessSystemLevel: false,
                  canAutoExecuteHighRisk: false,
                  autonomyLevel: 'limited',
                };
            await syncDashContext({ language, traits: { agentic: caps, role: role || null } });
          } catch (syncErr) {
            if (__DEV__) console.warn('[RootLayout] dash-context-sync skipped:', syncErr);
          }
        }
      } catch (e) {
        console.error('[RootLayout] Failed to initialize Dash:', e);
      }
    })();
  }, [session]); // Re-run when session changes

  // Inject web-specific styles (Expo dev nav hiding, full viewport height)
  useEffect(() => {
    if (Platform.OS === 'web') {
      const cleanup = injectWebStyles();
      return cleanup;
    }
  }, []);

  // Show splash screen only on native
  if (showSplash && Platform.OS !== 'web') {
    return <AnimatedSplash onFinish={() => setShowSplash(false)} />;
  }

  return <LayoutContent />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    ...(Platform.OS === 'web'
      ? {
          height: '100vh' as any,
          overflow: 'hidden' as any,
        }
      : null),
  },
  contentContainer: {
    flex: 1,
    minHeight: 0,
  },
});
