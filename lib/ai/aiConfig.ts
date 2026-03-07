/**
 * AI Configuration - Single Source of Truth
 *
 * Centralizes all AI feature flags, model selection, and quota config.
 * Every hook and service MUST import from here instead of reading
 * env vars directly. Uses opt-in semantics (=== 'true') per WARP.md
 * Security-First principle.
 *
 * @module lib/ai/aiConfig
 * @see WARP.md § AI Integration, § Security Guidelines
 */

/** Whether AI features are globally enabled (opt-in: must be explicitly 'true') */
export function isAIEnabled(): boolean {
  return (
    process.env.EXPO_PUBLIC_AI_ENABLED === 'true' ||
    process.env.EXPO_PUBLIC_ENABLE_AI_FEATURES === 'true'
  );
}

/**
 * Available AI model tiers — use the cheapest model that meets quality needs.
 *
 * | Tier   | Model                          | Use Case                      | Cost (input/MTok) |
 * |--------|--------------------------------|-------------------------------|--------------------|
 * | fast   | claude-haiku-4-5-20251001      | Summaries, suggestions, chat  | low                |
 * | balanced | claude-3-7-sonnet-20250219   | Most classroom workflows      | medium             |
 * | premium | claude-sonnet-4-20250514      | Higher-accuracy generation    | medium-high        |
 *
 * @see https://docs.anthropic.com/en/docs/about-claude/models
 */
export const AI_MODELS = {
  fast: 'claude-haiku-4-5-20251001',
  balanced: 'claude-3-7-sonnet-20250219',
  premium: 'claude-sonnet-4-20250514',
} as const;

export type AIModelTier = keyof typeof AI_MODELS;

/** Get the model ID for a given tier.
 * Respects EXPO_PUBLIC_AI_MODEL env override so operators can pin a model
 * for a specific deployment without a code change. */
export function getAIModel(tier: AIModelTier = 'balanced'): string {
  const envOverride = typeof process !== 'undefined'
    ? (process.env.EXPO_PUBLIC_AI_MODEL || '').trim()
    : '';
  if (envOverride) return envOverride;
  return AI_MODELS[tier];
}

/** Default model for lesson generation */
export function getDefaultLessonModel(): string {
  return AI_MODELS.balanced;
}

/** Default model for grading */
export function getDefaultGradingModel(): string {
  return AI_MODELS.balanced;
}

/** Default model for quick suggestions / summaries */
export function getDefaultQuickModel(): string {
  return AI_MODELS.fast;
}

/**
 * AI quota configuration defaults.
 * Server-side values in `organization_ai_quotas` table take precedence.
 */
export const AI_QUOTA_DEFAULTS = {
  /** Max lesson generations per day per user (free tier) */
  free_daily_lessons: 3,
  /** Max grading operations per day per user (free tier) */
  free_daily_grading: 10,
  /** Max lesson generations per day per user (premium tier) */
  premium_daily_lessons: 120,
  /** Max grading operations per day per user (premium tier) */
  premium_daily_grading: 200,
  /** Network timeout for quota check (ms) — fail CLOSED on timeout */
  quota_check_timeout_ms: 10_000,
} as const;

/**
 * AI service types that match the DB constraint on `ai_usage_logs.service_type`.
 * Use these constants when invoking the ai-gateway or ai-proxy edge functions.
 */
export const AI_SERVICE_TYPES = {
  lessonGeneration: 'lesson_generation',
  gradingAssistance: 'grading_assistance',
  homeworkHelp: 'homework_help',
  progressAnalysis: 'progress_analysis',
  chatAssistant: 'chat_assistant',
  quizGeneration: 'quiz_generation',
  imageGeneration: 'image_generation',
} as const;

export type AIServiceType = (typeof AI_SERVICE_TYPES)[keyof typeof AI_SERVICE_TYPES];
