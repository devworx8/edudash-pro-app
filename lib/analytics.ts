import * as Sentry from '@sentry/react-native';
import { Platform } from 'react-native';
import { getPostHog } from '@/lib/posthogClient';
import { getFeatureFlagsSync } from '@/lib/featureFlags';

/**
 * Standardized event naming convention: edudash.module.action
 * Examples:
 * - edudash.auth.sign_in
 * - edudash.dashboard.view
 * - edudash.ai.lesson_generated
 * - edudash.principal.meeting_started
 * - edudash.teacher.assignment_created
 * - edudash.parent.homework_help_requested
 */

export interface AnalyticsEvent {
  // Authentication events
  'edudash.auth.sign_in': { method: 'email' | 'google' | 'apple'; role: string };
  'edudash.auth.sign_up': { method: 'email' | 'google' | 'apple'; role: string };
  'edudash.auth.sign_out': { session_duration_minutes: number };
  'edudash.auth.password_reset': { success: boolean };
  
  // Dashboard events
  'edudash.dashboard.view': { role: string; features_enabled: string[] };
  'edudash.dashboard.refresh': { role: string; load_time_ms: number };
  
  // AI events - Comprehensive taxonomy as per WARP.md compliance
  'edudash.ai.tool.opened': { tool_type: 'lesson_generator' | 'homework_helper' | 'grader' | 'progress_analysis' | 'insights'; source: string; user_role: string };
  'edudash.ai.request.started': { service_type: 'lesson_generation' | 'grading_assistance' | 'homework_help' | 'progress_analysis' | 'insights'; model: string; quota_remaining: number };
  'edudash.ai.request.succeeded': { service_type: string; duration_ms: number; tokens_used: number; cost_cents: number };
  'edudash.ai.request.failed': { service_type: string; error_code: string; duration_ms: number; retry_count: number };
  'edudash.ai.quota.blocked': { service_type: string; quota_used: number; quota_limit: number; user_tier: string; upgrade_shown: boolean };
  'edudash.ai.insights.viewed': { scope: 'teacher' | 'principal' | 'parent'; insights_count: number; generated_at: string; confidence_score?: number };
  'edudash.ai.onboarding.shown': { feature: string; user_role: string; first_time_user: boolean };
  'edudash.ai.upsell.shown': { trigger: string; current_tier: string; target_tier: string; quota_percentage: number };
  // Legacy AI events - for backward compatibility
  'edudash.ai.lesson_generation_started': { subject: string; grade_level: string; duration_minutes: number };
  'edudash.ai.lesson_generation_completed': { success: boolean; duration_ms: number; model_used: string };
  'edudash.ai.homework_help_requested': { subject: string; attachment_count: number };
  'edudash.ai.homework_help_completed': { success: boolean; duration_ms: number; response_length: number };
  'edudash.ai.grading_assistance_used': { assignment_type: string; student_count: number };
  'edudash.ai.stem_activity_generated': { topic: string; age_group: string; materials_count: number };
  
  // Principal Hub events
  'edudash.principal.hub_viewed': { meetings_count: number; participants_count: number };
  'edudash.principal.meeting_created': { scheduled: boolean; privacy: 'public' | 'private' };
  'edudash.principal.meeting_joined': { role: 'host' | 'cohost' | 'member'; duration_minutes: number };
  'edudash.principal.meeting_recording_started': { participants_count: number };
  'edudash.principal.whiteboard_used': { session_duration_minutes: number };
  
  // Teacher events
  'edudash.teacher.assignment_created': { type: 'quiz' | 'essay' | 'project'; ai_assisted: boolean };
  'edudash.teacher.assignment_graded': { type: string; ai_assisted: boolean; student_count: number };
  'edudash.teacher.class_viewed': { student_count: number; assignment_count: number };
  'edudash.teacher.resource_shared': { type: string; visibility: 'class' | 'school' };
  
  // Parent events
  'edudash.parent.child_progress_viewed': { child_count: number; assignment_count: number };
  'edudash.parent.homework_help_requested': { subject: string; child_age: number };
  'edudash.parent.teacher_message_sent': { message_length: number };
  
  // WhatsApp Integration events
  'edudash.whatsapp.quick_action_pressed': { connected: boolean; timestamp: string };
  'edudash.whatsapp.opt_in': { user_id: string; preschool_id: string; phone_number_hash: string; consent_given: boolean; timestamp: string };
  'edudash.whatsapp.opt_in_success': { user_id: string; preschool_id?: string; consent_status: string; timestamp: string };
  'edudash.whatsapp.opt_in_error': { user_id: string; preschool_id?: string; error_message: string; timestamp: string };
  'edudash.whatsapp.opt_out': { user_id: string; preschool_id?: string; timestamp: string };
  'edudash.whatsapp.opt_out_error': { user_id: string; preschool_id?: string; error_message: string; timestamp: string };
  'edudash.whatsapp.test_message_sent': { user_id?: string; preschool_id?: string; timestamp: string };
  'edudash.whatsapp.test_message_error': { user_id: string; preschool_id?: string; error_message: string; timestamp: string };
  'edudash.whatsapp.deep_link_opened': { user_id: string; preschool_id?: string; has_school_number: boolean };
  'edudash.whatsapp.modal_opened': { current_status: 'connected' | 'disconnected'; timestamp: string };
  'edudash.whatsapp.modal_closed': { final_status: 'connected' | 'disconnected'; session_duration_ms: number };
  'edudash.whatsapp.phone_validation_failed': { phone_input: string; error_type: 'format' | 'length' | 'country' };
  'edudash.whatsapp.consent_given': { user_id: string; timestamp: string };
  'edudash.whatsapp.consent_declined': { user_id: string; step: 'consent' | 'phone'; timestamp: string };
  'edudash.whatsapp.feature_viewed': { feature_name: string; connection_status: 'connected' | 'disconnected'; timestamp: string };
  'edudash.whatsapp.demo_quick_action': { timestamp: string };
  
  // Subscription/Billing events
  'edudash.billing.upgrade_viewed': { current_tier: string; target_tier: string };
  'edudash.billing.checkout_started': { tier: string; seat_count: number; annual: boolean };
  'edudash.billing.checkout_completed': { tier: string; amount_cents: number; seat_count: number };
  'edudash.billing.contact_sales_requested': { tier: 'enterprise'; org_size: string };
  
  // Feature Flag events
  'edudash.feature_flag.evaluated': { flag_name: string; enabled: boolean; user_id: string };
  'edudash.feature_flag.override_applied': { flag_name: string; value: boolean; reason: string };
  
  // Error and Performance events
  'edudash.error.occurred': { error_type: string; component: string; fatal: boolean };
  'edudash.performance.slow_operation': { operation: string; duration_ms: number; threshold_ms: number };
  'edudash.performance.api_call': { endpoint: string; duration_ms: number; status_code: number };
  
  // Generic fallback
  [key: string]: Record<string, any>;
}

type QueuedAnalyticsEvent = {
  event: string;
  properties: Record<string, any>;
};

const ANALYTICS_BATCH_INTERVAL_MS = 30000;
const ANALYTICS_BATCH_SIZE = 10;
const ANALYTICS_BATCHING_ENABLED = process.env.EXPO_PUBLIC_ANALYTICS_BATCHING_ENABLED !== 'false';

const analyticsQueue: QueuedAnalyticsEvent[] = [];
let analyticsFlushTimer: ReturnType<typeof setTimeout> | null = null;

function flushAnalyticsQueue() {
  const ph = getPostHog();
  if (!ph || analyticsQueue.length === 0) return;

  const batch = analyticsQueue.splice(0, analyticsQueue.length);
  batch.forEach((item) => {
    try {
      ph.capture(item.event, item.properties);
    } catch (error) {
      if (__DEV__) {
        console.debug('[Analytics] Failed to flush event:', item.event, error);
      }
    }
  });
}

function scheduleAnalyticsFlush() {
  if (!ANALYTICS_BATCHING_ENABLED) return;
  if (analyticsFlushTimer) return;
  analyticsFlushTimer = setTimeout(() => {
    analyticsFlushTimer = null;
    flushAnalyticsQueue();
  }, ANALYTICS_BATCH_INTERVAL_MS);
}

/**
 * PII scrubbing patterns for analytics
 */
const ANALYTICS_PII_PATTERNS = [
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, // emails
  /\b\d{6,12}\b/g, // potential IDs
];

function scrubAnalyticsData(data: Record<string, any>): Record<string, any> {
  const flags = getFeatureFlagsSync();
  
  if (!flags.production_db_dev_mode || process.env.EXPO_PUBLIC_PII_SCRUBBING_ENABLED !== 'true') {
    return data;
  }
  
  const scrubbed: Record<string, any> = {};
  
  Object.keys(data).forEach(key => {
    const value = data[key];
    
    // Always scrub known sensitive fields
    if (['email', 'phone', 'name', 'firstName', 'lastName', 'studentId', 'parentId'].includes(key)) {
      scrubbed[key] = '[REDACTED]';
    } else if (typeof value === 'string') {
      let scrubbedValue = value;
      ANALYTICS_PII_PATTERNS.forEach(pattern => {
        scrubbedValue = scrubbedValue.replace(pattern, '[REDACTED]');
      });
      scrubbed[key] = scrubbedValue;
    } else {
      scrubbed[key] = value;
    }
  });
  
  return scrubbed;
}

/**
 * Enhanced tracking with standardized event names and Android-specific context
 */
export function track<T extends keyof AnalyticsEvent>(
  event: T,
  properties?: AnalyticsEvent[T] & Record<string, any>
) {
  try {
    const flags = getFeatureFlagsSync();
    
    // Skip tracking on non-Android platforms during Android-only testing
    if (flags.android_only_mode && Platform.OS !== 'android') {
      return;
    }
    
    const enrichedProperties = {
      ...properties,
      // Add standard context
      platform: Platform.OS,
      platform_version: Platform.Version,
      timestamp: new Date().toISOString(),
      testing_mode: flags.android_only_mode,
      production_db_dev: flags.production_db_dev_mode,
      // Feature flag context (for A/B testing analysis)
      ai_gateway_enabled: flags.ai_gateway_enabled,
      enterprise_tier_enabled: flags.enterprise_tier_enabled,
    };
    
    const scrubbedProperties = scrubAnalyticsData(enrichedProperties);
    
    // Track in PostHog (batched if enabled)
    const ph = getPostHog();
    if (ph) {
      if (ANALYTICS_BATCHING_ENABLED) {
        analyticsQueue.push({ event: String(event), properties: scrubbedProperties });
        if (analyticsQueue.length >= ANALYTICS_BATCH_SIZE) {
          flushAnalyticsQueue();
        } else {
          scheduleAnalyticsFlush();
        }
      } else {
        ph.capture(String(event), scrubbedProperties);
      }
    }
    
    // Add to Sentry breadcrumbs for error context
    try {
      Sentry.addBreadcrumb({
        category: 'analytics',
        message: String(event),
        data: scrubbedProperties,
        level: 'info',
      });
    } catch (sentryError) {
      // Silently ignore Sentry errors - analytics/monitoring failures shouldn't break app
      if (__DEV__) {
        console.debug('[Analytics] Sentry breadcrumb failed:', sentryError);
      }
    }
    
    // Console log in debug mode
    if (process.env.EXPO_PUBLIC_DEBUG_MODE === 'true') {
      console.log(`[Analytics] ${event}:`, scrubbedProperties);
    }
    
  } catch (error) {
    console.error('Failed to track analytics event:', error);
    // Don't throw - analytics failures shouldn't break app functionality
  }
}

/**
 * Track user identification for cohort analysis
 */
export function identifyUser(userId: string, properties: Record<string, any> = {}) {
  try {
    const flags = getFeatureFlagsSync();
    
    if (flags.android_only_mode && Platform.OS !== 'android') {
      return;
    }
    
    const scrubbedProperties = scrubAnalyticsData({
      ...properties,
      platform: Platform.OS,
      testing_mode: flags.android_only_mode,
      production_db_dev: flags.production_db_dev_mode,
    });
    
    // Set user context in Sentry
    try {
      if (typeof Sentry.setUser === 'function') {
        Sentry.setUser({
          id: userId,
          ...scrubbedProperties,
        });
      }
    } catch (sentryError) {
      if (__DEV__) {
        console.debug('[Analytics] Sentry setUser failed:', sentryError);
      }
    }
    
    const ph = getPostHog();
    if (ph) {
      ph.identify(userId, scrubbedProperties);
    }
    
  } catch (error) {
    console.error('Failed to identify user:', error);
  }
}

/**
 * Track funnel events for conversion analysis
 */
export function trackFunnelStep(
  funnelName: string,
  step: string,
  properties?: Record<string, any>
) {
  track(`edudash.funnel.${funnelName}.${step}` as keyof AnalyticsEvent, {
    funnel_name: funnelName,
    funnel_step: step,
    ...properties,
  });
}

/**
 * Track A/B test events
 */
export function trackABTestEvent(
  testName: string,
  variant: string,
  action: 'viewed' | 'converted' | 'dropped',
  properties?: Record<string, any>
) {
  track(`edudash.ab_test.${testName}.${action}` as keyof AnalyticsEvent, {
    test_name: testName,
    variant,
    action,
    ...properties,
  });
}

/**
 * Track revenue events for business intelligence
 */
export function trackRevenue(
  eventType: 'subscription_created' | 'subscription_upgraded' | 'subscription_cancelled',
  properties: {
    amount_cents: number;
    tier: string;
    seat_count?: number;
    annual?: boolean;
    trial_days?: number;
  }
) {
  track(`edudash.revenue.${eventType}` as keyof AnalyticsEvent, properties);
}
