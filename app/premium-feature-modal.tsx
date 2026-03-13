import React, { useCallback } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import PremiumFeatureBanner from '@/components/ui/PremiumFeatureBanner';
import { useRewardedFeature } from '@/contexts/AdsContext';
import { Platform } from 'react-native';

/**
 * Premium Feature Modal Screen
 *
 * Shown when a user attempts to access a premium-only feature.
 * Supports rewarded ad unlock: pass `featureKey` as a route param to enable
 * the "Watch Ad for Free Trial" button. On completion the feature is unlocked
 * for 30 minutes in AdsContext and the modal navigates back.
 */
export default function PremiumFeatureModal() {
  const params = useLocalSearchParams<{
    featureName?: string;
    description?: string;
    screen?: string;
    icon?: string;
    /** Unique key for this feature used by useRewardedFeature on the calling screen */
    featureKey?: string;
  }>();

  const featureKey = params.featureKey || params.screen || 'unknown';
  const { offerRewardedUnlock, canShowRewardedAd } = useRewardedFeature(featureKey);

  const handleRewardedUnlock = useCallback(async () => {
    const unlocked = await offerRewardedUnlock();
    if (unlocked) {
      // Navigate back so the calling screen re-renders and checks isFeatureUnlocked()
      router.back();
    }
  }, [offerRewardedUnlock]);

  return (
    <PremiumFeatureBanner
      featureName={params.featureName || 'Premium Feature'}
      description={params.description || 'This feature requires a premium subscription.'}
      screen={params.screen || 'unknown'}
      icon={(params.icon || 'star') as any}
      variant="fullscreen"
      onRewardedUnlock={canShowRewardedAd && Platform.OS !== 'web' ? handleRewardedUnlock : undefined}
    />
  );
}