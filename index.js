/**
 * Entry point for EduDash Pro mobile app
 * 
 * Note: Promise.any polyfill is loaded via Metro's getModulesRunBeforeMainModule
 * in metro.config.js, which ensures it runs before any module initialization.
 */

// CRITICAL: Install Promise.any polyfill FIRST (before any other imports)
// This must be imported before any library that uses Promise.any (like Daily.co)
import './polyfills/promise';

// =====================================================
// SENTRY INITIALIZATION - MUST BE EARLY FOR CRASH TRACKING
// =====================================================
import Constants from 'expo-constants';

// Check if running in Expo Go (native Sentry not available in Expo Go)
const isExpoGo = Constants.appOwnership === 'expo';

// Only initialize Sentry if NOT running in Expo Go
// The @sentry/react-native import itself can trigger native client errors in Expo Go
if (!isExpoGo) {
  const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (SENTRY_DSN && /https?:\/\/.+@.+/i.test(SENTRY_DSN)) {
    try {
      // Dynamic import to avoid loading native modules in Expo Go
      const Sentry = require('@sentry/react-native');
      Sentry.init({
        dsn: SENTRY_DSN,
        enableInExpoDevelopment: false,
        debug: __DEV__,
        environment: process.env.EXPO_PUBLIC_ENVIRONMENT || (__DEV__ ? 'development' : 'production'),
        tracesSampleRate: __DEV__ ? 1.0 : 0.2,
        // Native crash/perf collection is intentionally disabled for now.
        enableNative: false,
        enableNativeCrashHandling: false,
        enableAutoPerformanceTracing: false,
        enableAutoBreadcrumbTracking: true,
      });
      console.log('[Sentry] ✅ Initialized at app entry point');
    } catch (e) {
      console.warn('[Sentry] ❌ Failed to initialize:', e);
    }
  } else {
    console.log('[Sentry] ⚠️ No valid DSN, skipping initialization');
  }
} else {
  console.log('[Sentry] ⚠️ Skipping in Expo Go (native not available)');
}

// Suppress known harmless warnings from third-party libraries
import { LogBox, Platform } from 'react-native';
if (Platform.OS !== 'web') {
  // Suppress NativeEventEmitter warnings from react-native-webrtc and similar modules
  // These are harmless warnings from third-party libraries with incomplete bridge implementations
  LogBox.ignoreLogs([
    'new NativeEventEmitter',
    'Require cycle:',
  ]);
}

// Load React polyfills before expo-router
import './polyfills/react-use';

// Register HeadlessJS task for background call handling (MUST be before expo-router)
// This enables incoming calls to display when the app is killed or backgrounded on Android
import { registerCallHeadlessTask } from './lib/calls/CallHeadlessTask';
registerCallHeadlessTask();

// Register Expo background notification task for incoming calls
// This handles notifications when app is backgrounded (works without Firebase)
import { registerBackgroundNotificationTask } from './lib/calls/CallBackgroundNotification';

// CRITICAL: Await registration to ensure channel is setup before notifications arrive
registerBackgroundNotificationTask()
  .then(() => {
    console.log('[App] ✅ Background notifications ready');
  })
  .catch((error) => {
    console.error('[App] ❌ Background notification setup failed:', error);
  });

// Register Notifee foreground service and background event handler for call notifications
// CRITICAL: Both must be at root level to work when app is backgrounded/killed
import { 
  registerCallNotificationBackgroundHandler, 
  registerCallForegroundService 
} from './components/calls/hooks/useCallBackgroundHandler';

// Register the foreground service task FIRST (required for asForegroundService notifications)
registerCallForegroundService();

// Then register background event handler
registerCallNotificationBackgroundHandler();

// Load expo-router entry
import 'expo-router/entry';
