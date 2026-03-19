/**
 * AI Quota Fallback Chain
 *
 * Graduated fallback when a user exhausts their AI quota:
 *   1. Model downgrade  — paid tiers: switch to cheapest available model
 *   2. Rewarded ad      — free tier (Android): watch ad for 10 bonus messages
 *   3. Upgrade CTA      — everyone: "View Plans"
 *
 * ≤200 lines per WARP.md
 */

import { Platform } from 'react-native';
import type { AIModelId, SubscriptionTier } from './models';
import { TIER_HIERARCHY } from './models';

// ── Constants ────────────────────────────────────────────────────────────────

/** Messages granted per rewarded ad view */
export const REWARDED_AD_BONUS_MESSAGES = 10;

/** Feature key stored in AdsContext.unlockFeature for ad-based quota extension */
export const QUOTA_EXTENSION_FEATURE_KEY = 'ai_quota_extension';

/** Duration of ad-based quota extension (30 minutes) */
export const QUOTA_EXTENSION_DURATION_MS = 30 * 60 * 1000;

/** Rewarded ad tag for quota top-up */
export const QUOTA_AD_TAG = 'ai_quota_topup';

/** The cheapest model everyone has access to */
const FALLBACK_MODEL: AIModelId = 'claude-haiku-4-5-20251001';

// ── Types ────────────────────────────────────────────────────────────────────

export type QuotaFallbackAction =
  | { type: 'model_downgrade'; targetModel: AIModelId; message: string }
  | { type: 'rewarded_ad'; message: string }
  | { type: 'upgrade'; message: string };

export interface QuotaFallbackContext {
  tier: SubscriptionTier;
  currentModel: AIModelId;
  /** Whether the ad system is available (Android + ads loaded) */
  canShowRewardedAd: boolean;
  /** Whether the user already has an active ad-based extension */
  hasActiveExtension: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** True when the user is on the highest purchasable tier (no meaningful upgrade exists). */
function isHighestPurchasableTier(tier: SubscriptionTier): boolean {
  const maxLevel = Math.max(...Object.values(TIER_HIERARCHY));
  return TIER_HIERARCHY[tier] >= maxLevel;
}

// ── Core Logic ───────────────────────────────────────────────────────────────

/**
 * Determine the ordered list of fallback actions for a quota-exceeded user.
 * Returns actions from most preferred to least preferred.
 */
export function getQuotaFallbackActions(ctx: QuotaFallbackContext): QuotaFallbackAction[] {
  const actions: QuotaFallbackAction[] = [];
  const isPaid = TIER_HIERARCHY[ctx.tier] > TIER_HIERARCHY.free;

  // 1. Model downgrade — for ANY paying tier using a non-Swift model
  if (isPaid && ctx.currentModel !== FALLBACK_MODEL) {
    actions.push({
      type: 'model_downgrade',
      targetModel: FALLBACK_MODEL,
      message: 'Your AI messages are used up. Continuing with Dash Swift to keep you going.',
    });
  }

  // 2. Rewarded ad — any tier on Android, no active extension
  if (ctx.canShowRewardedAd && !ctx.hasActiveExtension) {
    actions.push({
      type: 'rewarded_ad',
      message: `Watch a short video to get ${REWARDED_AD_BONUS_MESSAGES} bonus AI messages.`,
    });
  }

  // 3. Upgrade CTA — only if a higher tier exists
  if (!isHighestPurchasableTier(ctx.tier)) {
    actions.push({
      type: 'upgrade',
      message: isPaid
        ? 'Upgrade your plan for more AI messages and access to advanced models.'
        : 'Upgrade for more AI messages, voice features, and smarter models.',
    });
  }

  return actions;
}

/**
 * Check if model downgrade is the right fallback for this user.
 * Quick boolean check for use in the send flow without building the full chain.
 */
export function shouldAutoDowngrade(
  tier: SubscriptionTier,
  currentModel: AIModelId,
): boolean {
  return TIER_HIERARCHY[tier] > TIER_HIERARCHY.free && currentModel !== FALLBACK_MODEL;
}

/**
 * Get the fallback model for auto-downgrade.
 */
export function getFallbackModel(): AIModelId {
  return FALLBACK_MODEL;
}

/**
 * Check if rewarded ads are available for quota extension on the current platform.
 * Tier eligibility is handled by AdsContext — this only checks platform support.
 */
export function isRewardedAdAvailable(_tier: SubscriptionTier): boolean {
  return Platform.OS === 'android';
}
