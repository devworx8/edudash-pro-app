/**
 * useDashAIQuota — Pre-send quota check with graduated fallback.
 *
 * Extracted from useDashAssistantImpl.ts (Phase 1 refactor).
 * Encapsulates the entire quota pipeline: check → auto-downgrade →
 * rewarded ad → upgrade CTA — before a message is dispatched to ai-proxy.
 */

import { useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useAds } from '@/contexts/AdsContext';
import { useCapability } from '@/hooks/useCapability';
import { getCapabilityTier, normalizeTierName } from '@/lib/tiers';
import { checkAIQuota, showQuotaExceededAlert } from '@/lib/ai/guards';
import { track } from '@/lib/analytics';
import type { AIModelId, SubscriptionTier } from '@/lib/ai/models';
import type { AIQuotaFeature } from '@/lib/ai/limits';
import {
  getQuotaFallbackActions,
  shouldAutoDowngrade,
  getFallbackModel,
  isRewardedAdAvailable,
  QUOTA_EXTENSION_FEATURE_KEY,
  QUOTA_EXTENSION_DURATION_MS,
  QUOTA_AD_TAG,
} from '@/lib/ai/quotaFallback';
import { DASH_AI_SERVICE_TYPE } from './types';

// ─── Types ──────────────────────────────────────────────────

export interface QuotaCheckResult {
  /** Whether the message should proceed. */
  allowed: boolean;
  /** If a fallback model was selected, its ID. */
  fallbackModel?: AIModelId;
}

// ─── Hook ───────────────────────────────────────────────────

export function useDashAIQuota(
  selectedModel: AIModelId,
  setSelectedModel: (m: AIModelId) => void,
) {
  const { user } = useAuth();
  const { tier, ready: subReady } = useSubscription();
  const { offerRewarded, unlockFeature, isFeatureUnlocked, canOfferRewardedQuotaAd } = useAds();
  const { can, ready: capsReady } = useCapability();

  const capabilityTier = useMemo(
    () => getCapabilityTier(normalizeTierName(String(tier || 'free'))),
    [tier],
  );
  const isFreeTier = subReady ? capabilityTier === 'free' : false;

  /**
   * Run the full quota check + fallback pipeline.
   * Returns `{ allowed: true }` when the message may proceed.
   * Handles UI alerts internally when blocked.
   */
  const checkQuotaBeforeSend = useCallback(
    async (serviceType: AIQuotaFeature = DASH_AI_SERVICE_TYPE): Promise<QuotaCheckResult> => {
      if (!user?.id) return { allowed: true };

      // Bypass: active ad-based extension
      if (isFeatureUnlocked(QUOTA_EXTENSION_FEATURE_KEY)) {
        return { allowed: true };
      }

      try {
        const quotaCheck = await checkAIQuota(serviceType, user.id, 1);
        if (quotaCheck.allowed) return { allowed: true };

        const userTier = (capabilityTier || 'free') as SubscriptionTier;

        // Fallback 1: auto-downgrade for paid tiers
        if (shouldAutoDowngrade(userTier, selectedModel)) {
          const fallback = getFallbackModel();
          track('edudash.ai.quota.auto_downgrade', {
            service_type: serviceType,
            from_model: selectedModel,
            to_model: fallback,
            user_tier: userTier,
          });
          setSelectedModel(fallback);
          return { allowed: true, fallbackModel: fallback };
        }

        // Fallback 2 + 3: alert with rewarded ad / upgrade
        const fallbackActions = getQuotaFallbackActions({
          tier: userTier,
          currentModel: selectedModel,
          canShowRewardedAd: canOfferRewardedQuotaAd && isRewardedAdAvailable(userTier),
          hasActiveExtension: false,
        });

        track('edudash.ai.quota.blocked', {
          service_type: serviceType,
          quota_used: quotaCheck.quotaInfo?.used,
          quota_limit: quotaCheck.quotaInfo?.limit,
          user_tier: userTier,
          upgrade_shown: true,
          fallback_options: fallbackActions.map((a) => a.type),
        });

        showQuotaExceededAlert(serviceType, quotaCheck.quotaInfo, {
          customMessages: { title: 'AI Chat Limit Reached' },
          fallbackActions,
          onModelDowngrade: (targetModel) => setSelectedModel(targetModel),
          onRewardedAd: async () => {
            const result = await offerRewarded(QUOTA_AD_TAG);
            if (result.rewarded) {
              unlockFeature(QUOTA_EXTENSION_FEATURE_KEY, QUOTA_EXTENSION_DURATION_MS);
              track('edudash.ai.quota.ad_extension_granted', {
                service_type: serviceType,
                user_tier: userTier,
              });
            }
          },
        });

        return { allowed: false };
      } catch (quotaError) {
        console.warn('[useDashAIQuota] Quota check failed:', quotaError);
        return { allowed: true }; // Fail-open
      }
    },
    [user?.id, capabilityTier, selectedModel, setSelectedModel, canOfferRewardedQuotaAd, offerRewarded, unlockFeature, isFeatureUnlocked],
  );

  /**
   * Lesson-generation-specific quota gate.
   */
  const checkLessonQuota = useCallback(
    async (): Promise<boolean> => {
      if (!user?.id) return true;
      try {
        const result = await checkAIQuota('lesson_generation', user.id, 1);
        if (!result.allowed) {
          showQuotaExceededAlert('lesson_generation', result.quotaInfo, {
            customMessages: {
              title: 'Lesson Generation Limit Reached',
              message: 'You have used all lesson generation credits for this month.',
            },
          });
          return false;
        }
        return true;
      } catch {
        return true;
      }
    },
    [user?.id],
  );

  return {
    checkQuotaBeforeSend,
    checkLessonQuota,
    capabilityTier,
    isFreeTier,
  };
}
