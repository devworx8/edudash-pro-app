import { getPostHog } from '@/lib/posthogClient';

export interface FeatureFlags {
  // Core features
  ai_gateway_enabled: boolean;
  enterprise_tier_enabled: boolean;
  principal_hub_enabled: boolean;
  homework_v2_enabled: boolean;
  resource_portal_enabled: boolean;
  advanced_grading_enabled: boolean;
  contact_sales_enabled: boolean;
  
  // AI Features
  ai_lesson_generation: boolean;
  ai_homework_help: boolean;
  ai_grading_assistance: boolean;
  ai_stem_activities: boolean;
  ai_progress_analysis: boolean;
  ai_insights: boolean;
  ai_streaming_enabled: boolean;
  ENABLE_DASH_IMAGE_GEN: boolean;
  ENABLE_IMAGE_PROVIDER_FALLBACK: boolean;
  ENABLE_PARENT_TEMP_LESSONS: boolean;
  
  // Collaboration Features
  principal_meeting_rooms: boolean;
  real_time_whiteboard: boolean;
  meeting_recordings: boolean;
  
  // Analytics and Monitoring
  advanced_school_metrics: boolean;
  teacher_performance_analytics: boolean;
  parent_engagement_tracking: boolean;
  
  // Subscription Features
  stripe_billing_enabled: boolean;
  seat_management_enabled: boolean;
  enterprise_trials: boolean;
  
  // Platform Features
  android_only_mode: boolean;
  admob_test_ids: boolean;
  production_db_dev_mode: boolean;
  adaptive_admin_dashboard_mobile_v1: boolean;
  NEXT_GEN_DASH_POLICY_V1: boolean;
  dash_unified_shell_v1: boolean;
  dash_voice_policy_v1: boolean;
  dash_phonics_quality_v1: boolean;
  dash_context_window_v1: boolean;
  dash_tutor_sessions_v1: boolean;
  dash_phoneme_mastery_v1: boolean;
  dash_tutor_voice_sticky_v1: boolean;
  dash_tutor_auto_handoff_v1: boolean;
  dash_tutor_phonics_strict_v1: boolean;
  dash_chart_safe_mode_v1: boolean;
  k12_parent_quickwins_v1: boolean;
  learner_activity_lifecycle_v1: boolean;
  learner_inactivity_automation_v1: boolean;
  learner_duplicate_queue_v1: boolean;
  send_fcm_call_v2_enabled: boolean;
  push_device_rpc_enabled: boolean;
  build_update_push_enabled: boolean;
  progress_contract_v1: boolean;
  lesson_fullscreen_v1: boolean;
  dash_intent_router_v1: boolean;
  dash_caps_fail_open_v1: boolean;
  dash_single_thinking_indicator_v1: boolean;
  
  // Language Features
  enableMultilanguageSupport: boolean;
  
  // Parent Dashboard Features (NEW)
  parent_hub_enabled: boolean;
  whatsapp_integration: boolean;
  offline_homework: boolean;
  voice_notes: boolean;
  progress_tracking: boolean;
  in_app_messaging: boolean;
  school_announcements: boolean;
  parent_teacher_chat: boolean;
  homework_submissions_v2: boolean;
  push_notifications: boolean;
  multilingual_auto_translate: boolean;
  parent_engagement_metrics: boolean;
  
  // WhatsApp Specific Features
  whatsapp_opt_in: boolean;
  whatsapp_webhook: boolean;
  whatsapp_send_receive: boolean;
  
  // Offline Features
  offline_sync_engine: boolean;
  offline_media_storage: boolean;
  progressive_sync: boolean;
  
  // South African Localization
  sa_languages_support: boolean; // English, Afrikaans, isiZulu, Sesotho
  caps_curriculum_alignment: boolean;
  sa_payment_methods: boolean;
  
  // ============================================
  // PWA PARITY FEATURES (Native App)
  // ============================================
  
  // Video/Voice Calls (Daily.co)
  video_calls_enabled: boolean;
  voice_calls_enabled: boolean;
  group_calls_enabled: boolean;
  live_lessons_enabled: boolean;
  
  // E-Books Library
  ebooks_enabled: boolean;
  ebook_offline_download: boolean;
  ebook_bookmarks: boolean;
  
  // Registration Flows
  principal_signup_enabled: boolean;
  teacher_signup_enabled: boolean;
  parent_claim_child_enabled: boolean;
  
  // Exam Prep
  exam_prep_enabled: boolean;
  exam_prep_ai_questions: boolean;
  
  // Campaigns (Principal)
  campaigns_enabled: boolean;
  
  // Registrations (Principal - Child Registration Management)
  registrations_enabled: boolean;
}

// Default feature flags - primarily controlled via PostHog but with env fallbacks
const AI_DEFAULT = (process.env.EXPO_PUBLIC_AI_ENABLED !== 'false') && (process.env.EXPO_PUBLIC_ENABLE_AI_FEATURES !== 'false')
const SA_TENANT_DEFAULT = process.env.EXPO_PUBLIC_COUNTRY === 'ZA' || process.env.EXPO_PUBLIC_SA_TENANT === 'true'
const TENANT_SLUG_DEFAULT = !!process.env.EXPO_PUBLIC_TENANT_SLUG
const DEFAULT_FLAGS: FeatureFlags = {
  // Core features
  ai_gateway_enabled: process.env.EXPO_PUBLIC_AI_GATEWAY_ENABLED === 'true',
  enterprise_tier_enabled: process.env.EXPO_PUBLIC_ENTERPRISE_TIER_ENABLED === 'true',
  principal_hub_enabled: process.env.EXPO_PUBLIC_PRINCIPAL_HUB_ENABLED === 'true',
  homework_v2_enabled: process.env.EXPO_PUBLIC_HOMEWORK_V2_ENABLED === 'true',
  resource_portal_enabled: process.env.EXPO_PUBLIC_RESOURCE_PORTAL_ENABLED === 'true',
  advanced_grading_enabled: process.env.EXPO_PUBLIC_ADVANCED_GRADING_ENABLED === 'true',
  contact_sales_enabled: process.env.EXPO_PUBLIC_CONTACT_SALES_ENABLED === 'true',
  
  // AI Features - default to enabled unless explicitly disabled via env
  ai_lesson_generation: AI_DEFAULT,
  ai_homework_help: AI_DEFAULT,
  ai_grading_assistance: AI_DEFAULT,
  ai_stem_activities: AI_DEFAULT,
  ai_progress_analysis: AI_DEFAULT,
  ai_insights: AI_DEFAULT,
  ai_streaming_enabled: true, // NEXT-GEN: streaming by default for ChatGPT-like responsiveness
  ENABLE_DASH_IMAGE_GEN: process.env.EXPO_PUBLIC_ENABLE_DASH_IMAGE_GEN !== 'false',
  ENABLE_IMAGE_PROVIDER_FALLBACK: process.env.EXPO_PUBLIC_ENABLE_IMAGE_PROVIDER_FALLBACK === 'true',
  ENABLE_PARENT_TEMP_LESSONS: process.env.EXPO_PUBLIC_ENABLE_PARENT_TEMP_LESSONS !== 'false',
  
  // Collaboration Features
  principal_meeting_rooms: false,
  real_time_whiteboard: false,
  meeting_recordings: false,
  
  // Analytics and Monitoring - premium tier
  advanced_school_metrics: false,
  teacher_performance_analytics: false,
  parent_engagement_tracking: true, // basic tracking enabled
  
  // Subscription Features
  stripe_billing_enabled: false,
  seat_management_enabled: false,
  enterprise_trials: false,
  
  // Platform Features - honor project rules
  android_only_mode: process.env.EXPO_PUBLIC_PLATFORM_TESTING === 'android',
  admob_test_ids: process.env.EXPO_PUBLIC_ADMOB_TEST_IDS_ONLY === 'true',
  production_db_dev_mode: process.env.EXPO_PUBLIC_USE_PRODUCTION_DB_AS_DEV === 'true',
  adaptive_admin_dashboard_mobile_v1: process.env.EXPO_PUBLIC_ADAPTIVE_ADMIN_DASHBOARD_MOBILE_V1 !== 'false',
  NEXT_GEN_DASH_POLICY_V1: process.env.EXPO_PUBLIC_NEXT_GEN_DASH_POLICY_V1 !== 'false',
  dash_unified_shell_v1: process.env.EXPO_PUBLIC_DASH_UNIFIED_SHELL_V1 !== 'false',
  dash_voice_policy_v1: process.env.EXPO_PUBLIC_DASH_VOICE_POLICY_V1 !== 'false',
  dash_phonics_quality_v1: process.env.EXPO_PUBLIC_DASH_PHONICS_QUALITY_V1 !== 'false',
  dash_context_window_v1: process.env.EXPO_PUBLIC_DASH_CONTEXT_WINDOW_V1 !== 'false',
  dash_tutor_sessions_v1: process.env.EXPO_PUBLIC_DASH_TUTOR_SESSIONS_V1 === 'true',
  dash_phoneme_mastery_v1: process.env.EXPO_PUBLIC_DASH_PHONEME_MASTERY_V1 !== 'false',
  dash_tutor_voice_sticky_v1: process.env.EXPO_PUBLIC_DASH_TUTOR_VOICE_STICKY_V1 === 'true',
  dash_tutor_auto_handoff_v1: process.env.EXPO_PUBLIC_DASH_TUTOR_AUTO_HANDOFF_V1 === 'true',
  dash_tutor_phonics_strict_v1: process.env.EXPO_PUBLIC_DASH_TUTOR_PHONICS_STRICT_V1 === 'true',
  dash_chart_safe_mode_v1: process.env.EXPO_PUBLIC_DASH_CHART_SAFE_MODE_V1 === 'true',
  k12_parent_quickwins_v1: process.env.EXPO_PUBLIC_K12_PARENT_QUICKWINS_V1 !== 'false',
  // Staged rollout defaults:
  // v1 UI/policy enabled, automation + duplicate queue remain opt-in.
  learner_activity_lifecycle_v1: process.env.EXPO_PUBLIC_LEARNER_ACTIVITY_LIFECYCLE_V1 !== 'false',
  learner_inactivity_automation_v1: process.env.EXPO_PUBLIC_LEARNER_INACTIVITY_AUTOMATION_V1 === 'true',
  learner_duplicate_queue_v1: process.env.EXPO_PUBLIC_LEARNER_DUPLICATE_QUEUE_V1 === 'true',
  send_fcm_call_v2_enabled: process.env.EXPO_PUBLIC_SEND_FCM_CALL_V2_ENABLED !== 'false',
  push_device_rpc_enabled: process.env.EXPO_PUBLIC_PUSH_DEVICE_RPC_ENABLED !== 'false',
  build_update_push_enabled: process.env.EXPO_PUBLIC_BUILD_UPDATE_PUSH_ENABLED !== 'false',
  progress_contract_v1: process.env.EXPO_PUBLIC_PROGRESS_CONTRACT_V1 !== 'false',
  lesson_fullscreen_v1: process.env.EXPO_PUBLIC_LESSON_FULLSCREEN_V1 !== 'false',
  dash_intent_router_v1: process.env.EXPO_PUBLIC_DASH_INTENT_ROUTER_V1 !== 'false',
  dash_caps_fail_open_v1: process.env.EXPO_PUBLIC_DASH_CAPS_FAIL_OPEN_V1 !== 'false',
  dash_single_thinking_indicator_v1: process.env.EXPO_PUBLIC_DASH_SINGLE_THINKING_INDICATOR_V1 !== 'false',
  
  // Language Features
  enableMultilanguageSupport: process.env.EXPO_PUBLIC_ENABLE_MULTILANGUAGE !== 'false',
  
  // Parent Dashboard Features (NEW) - Strategic Roadmap Implementation
  parent_hub_enabled: process.env.EXPO_PUBLIC_PARENT_HUB_ENABLED !== 'false', // enabled by default
  whatsapp_integration: false, // EMERGENCY KILL SWITCH - client credentials exposed
  offline_homework: process.env.EXPO_PUBLIC_OFFLINE_HOMEWORK !== 'false', // beta feature
  voice_notes: true, // core feature enabled
  progress_tracking: true, // core feature enabled
  in_app_messaging: true, // core feature enabled
  school_announcements: true, // core feature enabled
  parent_teacher_chat: true, // core communication feature
  homework_submissions_v2: process.env.EXPO_PUBLIC_HOMEWORK_V2_ENABLED === 'true',
  push_notifications: process.env.EXPO_PUBLIC_PUSH_NOTIFICATIONS !== 'false',
  multilingual_auto_translate: SA_TENANT_DEFAULT, // for SA multi-language support
  parent_engagement_metrics: true, // basic engagement tracking
  
  // WhatsApp Specific Features - SECURITY: DISABLED DUE TO CLIENT-SIDE SECRET EXPOSURE
  whatsapp_opt_in: false, // EMERGENCY KILL SWITCH - client credentials exposed
  whatsapp_webhook: false, // EMERGENCY KILL SWITCH - client credentials exposed
  whatsapp_send_receive: false, // EMERGENCY KILL SWITCH - client credentials exposed
  
  // Offline Features - Strategic "Offline-First" Architecture
  offline_sync_engine: process.env.EXPO_PUBLIC_OFFLINE_SYNC !== 'false', // core offline feature
  offline_media_storage: process.env.EXPO_PUBLIC_OFFLINE_MEDIA !== 'false',
  progressive_sync: process.env.EXPO_PUBLIC_PROGRESSIVE_SYNC !== 'false',
  
  // South African Localization - Strategic "SA-First" Approach
  sa_languages_support: SA_TENANT_DEFAULT, // English, Afrikaans, isiZulu, Sesotho
  caps_curriculum_alignment: SA_TENANT_DEFAULT, // CAPS = Curriculum and Assessment Policy Statement
  sa_payment_methods: SA_TENANT_DEFAULT, // EFT, Ozow, SnapScan
  
  // ============================================
  // PWA PARITY FEATURES (Native App) - Default: ENABLED for development
  // Disable via environment variables when needed
  // ============================================
  
  // Video/Voice Calls (Daily.co) - Requires prebuild for native modules
  video_calls_enabled: process.env.EXPO_PUBLIC_ENABLE_VIDEO_CALLS !== 'false',
  voice_calls_enabled: process.env.EXPO_PUBLIC_ENABLE_VOICE_CALLS !== 'false',
  group_calls_enabled: process.env.EXPO_PUBLIC_ENABLE_GROUP_CALLS !== 'false',
  live_lessons_enabled: process.env.EXPO_PUBLIC_ENABLE_LIVE_LESSONS !== 'false',
  
  // E-Books Library - PDF viewing with offline support
  ebooks_enabled: process.env.EXPO_PUBLIC_ENABLE_EBOOKS === 'true',
  ebook_offline_download: process.env.EXPO_PUBLIC_ENABLE_EBOOK_OFFLINE === 'true',
  ebook_bookmarks: process.env.EXPO_PUBLIC_ENABLE_EBOOK_BOOKMARKS === 'true',
  
  // Registration Flows - Allow new users to sign up directly
  principal_signup_enabled: process.env.EXPO_PUBLIC_ENABLE_PRINCIPAL_SIGNUP === 'true',
  teacher_signup_enabled: process.env.EXPO_PUBLIC_ENABLE_TEACHER_SIGNUP === 'true',
  parent_claim_child_enabled: process.env.EXPO_PUBLIC_ENABLE_CLAIM_CHILD === 'true',
  
  // Exam Prep - CAPS-aligned AI question generation
  // Default ON for parity; explicitly disable with env === 'false'
  exam_prep_enabled: process.env.EXPO_PUBLIC_ENABLE_EXAM_PREP !== 'false',
  exam_prep_ai_questions: process.env.EXPO_PUBLIC_ENABLE_EXAM_AI !== 'false',
  
  // Campaigns - Principal marketing campaigns (default: true for principals)
  campaigns_enabled: process.env.EXPO_PUBLIC_ENABLE_CAMPAIGNS !== 'false',
  
  // Registrations - Principal child registration management (default: true for principals)
  registrations_enabled: process.env.EXPO_PUBLIC_ENABLE_REGISTRATIONS !== 'false',
};

let cachedFlags: FeatureFlags | null = null;
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Get feature flags with PostHog integration and local caching
 */
export async function getFeatureFlags(userId?: string): Promise<FeatureFlags> {
  const now = Date.now();
  
  // Return cached flags if still fresh
  if (cachedFlags && (now - lastFetchTime) < CACHE_DURATION) {
    return cachedFlags;
  }
  
  try {
    const posthog = getPostHog();
    
    if (!posthog || !userId) {
      // Fallback to environment defaults when PostHog unavailable or no user
      cachedFlags = { ...DEFAULT_FLAGS };
      lastFetchTime = now;
      return cachedFlags;
    }
    
    // Fetch flags from PostHog for this user
    const rawFlags = posthog.getFeatureFlags() ?? {};
    // Coerce PostHog values (string | boolean) to boolean for type safety
    const flag = (key: string, fallback: boolean): boolean => {
      const v = rawFlags[key];
      return v === undefined ? fallback : Boolean(v);
    };
    
    // Merge PostHog flags with defaults, with PostHog taking precedence
    cachedFlags = {
      ...DEFAULT_FLAGS,
      // Map PostHog flags to our feature flag structure
      ai_gateway_enabled: flag('ai_gateway_enabled', DEFAULT_FLAGS.ai_gateway_enabled),
      enterprise_tier_enabled: flag('enterprise_tier', DEFAULT_FLAGS.enterprise_tier_enabled),
      principal_hub_enabled: flag('principal_hub', DEFAULT_FLAGS.principal_hub_enabled),
      homework_v2_enabled: flag('homework_v2', DEFAULT_FLAGS.homework_v2_enabled),
      resource_portal_enabled: flag('resource_portal', DEFAULT_FLAGS.resource_portal_enabled),
      advanced_grading_enabled: flag('advanced_grading', DEFAULT_FLAGS.advanced_grading_enabled),
      contact_sales_enabled: flag('contact_sales', DEFAULT_FLAGS.contact_sales_enabled),
      
      // AI Features
      ai_lesson_generation: flag('ai_lesson_generation', DEFAULT_FLAGS.ai_lesson_generation),
      ai_homework_help: flag('ai_homework_help', DEFAULT_FLAGS.ai_homework_help),
      ai_grading_assistance: flag('ai_grading_assistance', DEFAULT_FLAGS.ai_grading_assistance),
      ai_stem_activities: flag('ai_stem_activities', DEFAULT_FLAGS.ai_stem_activities),
      ai_progress_analysis: flag('ai_progress_analysis', DEFAULT_FLAGS.ai_progress_analysis),
      ai_insights: flag('ai_insights', DEFAULT_FLAGS.ai_insights),
      ai_streaming_enabled: flag('ai_streaming', DEFAULT_FLAGS.ai_streaming_enabled),
      ENABLE_DASH_IMAGE_GEN: flag('enable_dash_image_gen', DEFAULT_FLAGS.ENABLE_DASH_IMAGE_GEN),
      ENABLE_IMAGE_PROVIDER_FALLBACK: flag('enable_image_provider_fallback', DEFAULT_FLAGS.ENABLE_IMAGE_PROVIDER_FALLBACK),
      ENABLE_PARENT_TEMP_LESSONS: flag('enable_parent_temp_lessons', DEFAULT_FLAGS.ENABLE_PARENT_TEMP_LESSONS),
      
      // Collaboration Features
      principal_meeting_rooms: flag('principal_meetings', DEFAULT_FLAGS.principal_meeting_rooms),
      real_time_whiteboard: flag('whiteboard', DEFAULT_FLAGS.real_time_whiteboard),
      meeting_recordings: flag('meeting_recordings', DEFAULT_FLAGS.meeting_recordings),
      
      // Analytics
      advanced_school_metrics: flag('advanced_metrics', DEFAULT_FLAGS.advanced_school_metrics),
      teacher_performance_analytics: flag('teacher_analytics', DEFAULT_FLAGS.teacher_performance_analytics),
      parent_engagement_tracking: flag('parent_engagement', DEFAULT_FLAGS.parent_engagement_tracking),
      
      // Billing
      stripe_billing_enabled: flag('stripe_billing', DEFAULT_FLAGS.stripe_billing_enabled),
      seat_management_enabled: flag('seat_management', DEFAULT_FLAGS.seat_management_enabled),
      enterprise_trials: flag('enterprise_trials', DEFAULT_FLAGS.enterprise_trials),
      
      // Platform - these should remain as env defaults
      android_only_mode: DEFAULT_FLAGS.android_only_mode,
      admob_test_ids: DEFAULT_FLAGS.admob_test_ids,
      production_db_dev_mode: DEFAULT_FLAGS.production_db_dev_mode,
      adaptive_admin_dashboard_mobile_v1: flag('adaptive_admin_dashboard_mobile_v1', DEFAULT_FLAGS.adaptive_admin_dashboard_mobile_v1),
      NEXT_GEN_DASH_POLICY_V1: flag('next_gen_dash_policy_v1', DEFAULT_FLAGS.NEXT_GEN_DASH_POLICY_V1),
      dash_unified_shell_v1: flag('dash_unified_shell_v1', DEFAULT_FLAGS.dash_unified_shell_v1),
      dash_voice_policy_v1: flag('dash_voice_policy_v1', DEFAULT_FLAGS.dash_voice_policy_v1),
      dash_phonics_quality_v1: flag('dash_phonics_quality_v1', DEFAULT_FLAGS.dash_phonics_quality_v1),
      dash_context_window_v1: flag('dash_context_window_v1', DEFAULT_FLAGS.dash_context_window_v1),
      dash_tutor_sessions_v1: flag('dash_tutor_sessions_v1', DEFAULT_FLAGS.dash_tutor_sessions_v1),
      dash_phoneme_mastery_v1: flag('dash_phoneme_mastery_v1', DEFAULT_FLAGS.dash_phoneme_mastery_v1),
      dash_tutor_voice_sticky_v1: flag('dash_tutor_voice_sticky_v1', DEFAULT_FLAGS.dash_tutor_voice_sticky_v1),
      dash_tutor_auto_handoff_v1: flag('dash_tutor_auto_handoff_v1', DEFAULT_FLAGS.dash_tutor_auto_handoff_v1),
      dash_tutor_phonics_strict_v1: flag('dash_tutor_phonics_strict_v1', DEFAULT_FLAGS.dash_tutor_phonics_strict_v1),
      dash_chart_safe_mode_v1: flag('dash_chart_safe_mode_v1', DEFAULT_FLAGS.dash_chart_safe_mode_v1),
      k12_parent_quickwins_v1: flag('k12_parent_quickwins_v1', DEFAULT_FLAGS.k12_parent_quickwins_v1),
      send_fcm_call_v2_enabled: flag('send_fcm_call_v2_enabled', DEFAULT_FLAGS.send_fcm_call_v2_enabled),
      push_device_rpc_enabled: flag('push_device_rpc_enabled', DEFAULT_FLAGS.push_device_rpc_enabled),
      build_update_push_enabled: flag('build_update_push_enabled', DEFAULT_FLAGS.build_update_push_enabled),
      progress_contract_v1: flag('progress_contract_v1', DEFAULT_FLAGS.progress_contract_v1),
      lesson_fullscreen_v1: flag('lesson_fullscreen_v1', DEFAULT_FLAGS.lesson_fullscreen_v1),
      dash_intent_router_v1: flag('dash_intent_router_v1', DEFAULT_FLAGS.dash_intent_router_v1),
      dash_caps_fail_open_v1: flag('dash_caps_fail_open_v1', DEFAULT_FLAGS.dash_caps_fail_open_v1),
      dash_single_thinking_indicator_v1: flag('dash_single_thinking_indicator_v1', DEFAULT_FLAGS.dash_single_thinking_indicator_v1),
      
      // Language - env default with PostHog override
      enableMultilanguageSupport: flag('multilanguage_support', DEFAULT_FLAGS.enableMultilanguageSupport),
      
      // PWA Parity Features - PostHog overrides for A/B testing
      video_calls_enabled: flag('video_calls', DEFAULT_FLAGS.video_calls_enabled),
      voice_calls_enabled: flag('voice_calls', DEFAULT_FLAGS.voice_calls_enabled),
      group_calls_enabled: flag('group_calls', DEFAULT_FLAGS.group_calls_enabled),
      live_lessons_enabled: flag('live_lessons', DEFAULT_FLAGS.live_lessons_enabled),
      ebooks_enabled: flag('ebooks', DEFAULT_FLAGS.ebooks_enabled),
      ebook_offline_download: flag('ebook_offline', DEFAULT_FLAGS.ebook_offline_download),
      ebook_bookmarks: flag('ebook_bookmarks', DEFAULT_FLAGS.ebook_bookmarks),
      principal_signup_enabled: flag('principal_signup', DEFAULT_FLAGS.principal_signup_enabled),
      teacher_signup_enabled: flag('teacher_signup', DEFAULT_FLAGS.teacher_signup_enabled),
      parent_claim_child_enabled: flag('claim_child', DEFAULT_FLAGS.parent_claim_child_enabled),
      exam_prep_enabled: flag('exam_prep', DEFAULT_FLAGS.exam_prep_enabled),
      exam_prep_ai_questions: flag('exam_ai', DEFAULT_FLAGS.exam_prep_ai_questions),
      campaigns_enabled: flag('campaigns', DEFAULT_FLAGS.campaigns_enabled),
    };
    
    lastFetchTime = now;
    return cachedFlags;
    
  } catch (error) {
    console.warn('Failed to fetch feature flags from PostHog, using defaults:', error);
    cachedFlags = { ...DEFAULT_FLAGS };
    lastFetchTime = now;
    return cachedFlags;
  }
}

/**
 * Check if a specific feature is enabled
 */
export async function isFeatureEnabled(
  flagName: keyof FeatureFlags, 
  userId?: string
): Promise<boolean> {
  const flags = await getFeatureFlags(userId);
  return flags[flagName];
}

/**
 * Force refresh feature flags cache
 */
export function invalidateFeatureFlagsCache(): void {
  cachedFlags = null;
  lastFetchTime = 0;
}

/**
 * Get feature flags synchronously (returns cached or defaults)
 */
export function getFeatureFlagsSync(): FeatureFlags {
  return cachedFlags || { ...DEFAULT_FLAGS };
}

type NextGenDashPolicyStage = 'internal' | 'pilot' | 'all';

function parseOrgAllowList(value: string | undefined): Set<string> {
  return new Set(
    String(value || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

/**
 * Phased rollout helper for #NEXT-GEN preschool dashboard policy.
 *
 * Environment controls:
 * - EXPO_PUBLIC_NEXT_GEN_DASH_POLICY_ROLLOUT: internal | pilot | all (default: all)
 * - EXPO_PUBLIC_NEXT_GEN_DASH_POLICY_QA_ORGS: comma-separated org IDs
 * - EXPO_PUBLIC_NEXT_GEN_DASH_POLICY_PILOT_ORGS: comma-separated org IDs
 */
export function isNextGenDashPolicyEnabled(options?: {
  organizationId?: string | null;
  resolvedSchoolType?: string | null;
}): boolean {
  const flags = getFeatureFlagsSync();
  if (!flags.NEXT_GEN_DASH_POLICY_V1) return false;

  const resolvedSchoolType = String(options?.resolvedSchoolType || 'preschool').toLowerCase();
  if (resolvedSchoolType !== 'preschool') {
    // Preschool-first rollout: keep K-12 flow isolated in dedicated route family.
    return false;
  }

  const stageRaw = String(process.env.EXPO_PUBLIC_NEXT_GEN_DASH_POLICY_ROLLOUT || 'all').toLowerCase();
  const stage: NextGenDashPolicyStage =
    stageRaw === 'internal' || stageRaw === 'pilot' || stageRaw === 'all'
      ? stageRaw
      : 'all';

  if (stage === 'all') return true;

  const orgId = options?.organizationId || null;
  if (!orgId) return false;

  const qaOrgIds = parseOrgAllowList(process.env.EXPO_PUBLIC_NEXT_GEN_DASH_POLICY_QA_ORGS);
  const pilotOrgIds = parseOrgAllowList(process.env.EXPO_PUBLIC_NEXT_GEN_DASH_POLICY_PILOT_ORGS);

  if (stage === 'internal') {
    return qaOrgIds.has(orgId);
  }

  // pilot stage includes internal + pilot lists
  return qaOrgIds.has(orgId) || pilotOrgIds.has(orgId);
}

/**
 * Identify user for feature flag targeting
 */
export function identifyUserForFlags(userId: string, properties?: Record<string, any>): void {
  try {
    const posthog = getPostHog();
    if (posthog) {
      posthog.identify(userId, properties);
      // Invalidate cache to fetch new flags for this user
      invalidateFeatureFlagsCache();
    }
  } catch (error) {
    console.warn('Failed to identify user for feature flags:', error);
  }
}
