import * as Sentry from '@sentry/react-native';
import { Platform } from 'react-native';
import { initPostHog } from '@/lib/posthogClient';
import { getFeatureFlagsSync } from '@/lib/featureFlags';

let started = false;

// PII patterns to scrub from logs and telemetry
const PII_PATTERNS = [
  // Email patterns
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  // Phone patterns (various formats)
  /(?:\+?1[-\s.]?)?\(?[0-9]{3}\)?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4}/g,
  // ID numbers (potential student IDs, etc.)
  /\b\d{6,12}\b/g,
  // Names (basic heuristic - capitalized words that might be names)
  /\b[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}\b/g,
];

/**
 * Scrub PII from data before sending to monitoring services
 */
function scrubPII(data: unknown): unknown {
  if (typeof data === 'string') {
    let scrubbed = data;
    PII_PATTERNS.forEach(pattern => {
      scrubbed = scrubbed.replace(pattern, '[REDACTED]');
    });
    return scrubbed;
  }
  
  if (Array.isArray(data)) {
    return data.map(scrubPII);
  }
  
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const scrubbed: Record<string, unknown> = {};
    Object.keys(data as Record<string, unknown>).forEach(key => {
      // Always scrub known sensitive fields
      if (['email', 'phone', 'firstName', 'lastName', 'name', 'studentId', 'parentId'].includes(key)) {
        scrubbed[key] = '[REDACTED]';
      } else {
        scrubbed[key] = scrubPII(data[key]);
      }
    });
    return scrubbed;
  }
  
  return data;
}

/**
 * Android-specific Sentry configuration
 */
function configureSentryForAndroid() {
  const flags = getFeatureFlagsSync();
  
  return {
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN || '',
    debug: process.env.EXPO_PUBLIC_DEBUG_MODE === 'true',
    tracesSampleRate: parseFloat(process.env.EXPO_PUBLIC_SENTRY_TRACE_SAMPLE_RATE || '0.2'),
    
    // Native crash/perf collection is intentionally disabled for this release hardening phase.
    enableNative: false,
    enableNativeCrashHandling: false,
    enableAutoPerformanceTracing: false,
    enableAutoBreadcrumbTracking: true,
    
    // PII scrubbing
    beforeSend: (event: any) => {
      if (!flags.production_db_dev_mode && process.env.EXPO_PUBLIC_PII_SCRUBBING_ENABLED === 'true') {
        // In production, scrub PII from all event data
        event = scrubPII(event);
      }
      return event;
    },
    
    beforeBreadcrumb: (breadcrumb: any) => {
      // Scrub PII from breadcrumbs
      if (process.env.EXPO_PUBLIC_PII_SCRUBBING_ENABLED === 'true') {
        breadcrumb = scrubPII(breadcrumb);
      }
      return breadcrumb;
    },
    
    // Tag Android testing builds
    initialScope: {
      tags: {
        platform_testing: flags.android_only_mode ? 'android' : 'multi',
        production_db_dev: flags.production_db_dev_mode ? 'true' : 'false',
        admob_test_mode: flags.admob_test_ids ? 'true' : 'false',
      },
      user: {
        // No PII in initial scope
      },
    },
  };
}

/**
 * Android-specific PostHog configuration
 */
function configurePostHogForAndroid() {
  const flags = getFeatureFlagsSync();
  
  return {
    host: process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
    captureAppLifecycleEvents: process.env.EXPO_PUBLIC_POSTHOG_AUTOCAPTURE === 'true',
    captureDeepLinks: true,
    enableSessionRecording: false, // Disabled for privacy
    
    // Android-specific settings
    android: {
      captureApplicationLifecycleEvents: true,
      captureDeepLinkEvents: true,
    },
    
    // Custom properties for all events
    defaultProperties: {
      platform_testing: flags.android_only_mode ? 'android' : 'multi',
      production_db_dev: flags.production_db_dev_mode,
      app_version: require('../package.json').version,
      environment: process.env.EXPO_PUBLIC_ENVIRONMENT || 'development',
    },
  };
}

/**
 * Simple monitoring initialization for production use
 */
export function initMonitoring(config?: { enableInDevelopment?: boolean; environment?: string }) {
  if (started) return;
  started = true;

  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  const looksValidDsn = !!dsn && /https?:\/\/.+@.+/i.test(dsn);
  if (!looksValidDsn) {
    if (__DEV__) {
      console.log('Monitoring: No valid Sentry DSN, skipping initialization');
    }
    return;
  }

  try {
    Sentry.init({
      dsn,
      debug: __DEV__,
      environment: config?.environment || process.env.EXPO_PUBLIC_ENVIRONMENT || 'production',
      tracesSampleRate: __DEV__ ? 1.0 : 0.2,
      beforeSend: (event) => {
        // Enhanced PII scrubbing
        return scrubPII(event) as any;
      },
    });

    if (__DEV__) {
      console.log('Monitoring: Sentry initialized successfully');
    }
  } catch (error) {
    console.warn('Monitoring: Failed to initialize Sentry', error);
  }
}

export function startMonitoring() {
  if (started) return;
  started = true;

  // Only start monitoring on Android during testing phase
  const flags = getFeatureFlagsSync();
  if (flags.android_only_mode && Platform.OS !== 'android') {
    console.log('Monitoring disabled: Android-only mode active, current platform:', Platform.OS);
    return;
  }

  // Initialize Sentry (guarded)
  const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
  const telemetryDisabled = process.env.EXPO_PUBLIC_TELEMETRY_DISABLED === 'true';
  const sentryExplicitlyDisabled = process.env.EXPO_PUBLIC_SENTRY_ENABLED === 'false' || process.env.EXPO_PUBLIC_ENABLE_SENTRY === 'false';
  const looksValidDsn = !!SENTRY_DSN && /https?:\/\/.+@.+/i.test(SENTRY_DSN);
  const SENTRY_ENABLED = !telemetryDisabled && !sentryExplicitlyDisabled && looksValidDsn;
  if (SENTRY_ENABLED) {
    try {
      const sentryConfig = configureSentryForAndroid();
      Sentry.init(sentryConfig);
      Sentry.setContext('testing_environment', {
        android_only: flags.android_only_mode,
        production_db_dev: flags.production_db_dev_mode,
        admob_test_ids: flags.admob_test_ids,
      });

      console.log('Sentry initialized');
    } catch (error) {
      // Keep quiet unless debug mode is explicitly enabled
      if (process.env.EXPO_PUBLIC_DEBUG_MODE === 'true') {
        console.warn('Sentry initialization skipped or failed:', error);
      }
    }
  } else {
    if (process.env.EXPO_PUBLIC_DEBUG_MODE === 'true') {
      console.log('Sentry disabled (missing DSN or disabled by env).');
    }
  }

  // Initialize PostHog
  const PH_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;
  if (PH_KEY) {
    try {
      const posthogConfig = configurePostHogForAndroid();
      const posthog = initPostHog(PH_KEY, posthogConfig);
      
      // Set up Android-specific super properties
      if (posthog) {
        posthog.register({
          platform_os: Platform.OS,
          platform_version: Platform.Version,
          testing_mode: flags.android_only_mode,
          production_db_dev: flags.production_db_dev_mode,
        });
      }
      
      console.log('PostHog initialized for Android testing');
    } catch (error) {
      console.error('Failed to initialize PostHog:', error);
    }
  }
}

/**
 * Enhanced error reporting with PII scrubbing
 */
export function reportError(error: Error, context?: Record<string, any>) {
  try {
    const telemetryDisabled = process.env.EXPO_PUBLIC_TELEMETRY_DISABLED === 'true' || process.env.EXPO_PUBLIC_SENTRY_ENABLED === 'false' || process.env.EXPO_PUBLIC_ENABLE_SENTRY === 'false';
    if (telemetryDisabled || !process.env.EXPO_PUBLIC_SENTRY_DSN) {
      if (process.env.EXPO_PUBLIC_DEBUG_MODE === 'true') {
        console.log('reportError() noop: telemetry disabled');
      }
      return;
    }

    const scrubbed = process.env.EXPO_PUBLIC_PII_SCRUBBING_ENABLED === 'true'
      ? scrubPII(context)
      : context;
    Sentry.captureException(error, {
      extra: scrubbed,
      tags: {
        component: 'app_error',
        platform: Platform.OS,
      },
    } as any);
  } catch (reportingError) {
    if (process.env.EXPO_PUBLIC_DEBUG_MODE === 'true') {
      console.error('Failed to report error:', reportingError);
    }
  }
}

/**
 * Track performance events with Android-specific context
 */
export function trackPerformance(eventName: string, duration: number, context?: Record<string, any>) {
  try {
    const telemetryDisabled = process.env.EXPO_PUBLIC_TELEMETRY_DISABLED === 'true' || process.env.EXPO_PUBLIC_SENTRY_ENABLED === 'false' || process.env.EXPO_PUBLIC_ENABLE_SENTRY === 'false';
    if (telemetryDisabled || !process.env.EXPO_PUBLIC_SENTRY_DSN) {
      return;
    }

    const scrubbed: Record<string, any> = context
      ? (process.env.EXPO_PUBLIC_PII_SCRUBBING_ENABLED === 'true'
        ? (scrubPII(context) as Record<string, any> || {})
        : context)
      : {};
    Sentry.addBreadcrumb({
      category: 'performance',
      message: eventName,
      level: 'info',
      data: {
        duration_ms: duration,
        platform: Platform.OS,
        ...scrubbed,
      },
    });
  } catch (error) {
    if (process.env.EXPO_PUBLIC_DEBUG_MODE === 'true') {
      console.error('Failed to track performance:', error);
    }
  }
}
