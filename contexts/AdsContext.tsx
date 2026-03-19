import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useAuth } from '@/contexts/AuthContext';
import { initializeAdMob, showAppOpenAd, showInterstitialAd, showRewardedAd } from '@/lib/adMob';
import { isAdsEligibleUser } from '@/lib/ads/gating';
import { PLACEMENT_KEYS } from '@/lib/ads/placements';
import { track } from '@/lib/analytics';
import { debug, warn } from '@/lib/debug';
import { usePathname } from 'expo-router';
import { isAuthLikeRoute } from '@/lib/ads/routeClassifier';
import { WebInterstitial } from '@/components/ads/WebInterstitial';

interface AdsContextType {
  ready: boolean;
  canShowBanner: boolean;
  /** Whether rewarded ads can be offered for quota extension (not tier-gated). */
  canOfferRewardedQuotaAd: boolean;
  maybeShowInterstitial: (tag: string) => Promise<boolean>;
  offerRewarded: (tag: string) => Promise<{ shown: boolean; rewarded: boolean }>;
  /** Grant temporary access to a premium feature after a rewarded ad. Default: 30 minutes. */
  unlockFeature: (featureKey: string, durationMs?: number) => void;
  /** Returns true if the feature was unlocked via a rewarded ad and the grant hasn't expired. */
  isFeatureUnlocked: (featureKey: string) => boolean;
}

const AdsContext = createContext<AdsContextType>({
  ready: false,
  canShowBanner: false,
  canOfferRewardedQuotaAd: false,
  maybeShowInterstitial: async () => false,
  offerRewarded: async () => ({ shown: false, rewarded: false }),
  unlockFeature: () => {},
  isFeatureUnlocked: () => false,
});

// Storage keys for frequency control
const STORAGE_KEYS = {
  lastInterstitialAt: 'ads:lastInterstitialAt',
  interstitialCount: (date: string) => `ads:interstitialCount:${date}`,
  rewardedOffersCount: (date: string) => `ads:rewardedOffersCount:${date}`,
  appStartTime: 'ads:appStartTime',
  lastAppOpenInterstitialAt: 'ads:lastAppOpenInterstitialAt',
  appOpenInterstitialCount: (date: string) => `ads:appOpenInterstitialCount:${date}`,
};

// Rate limiting constants
const RATE_LIMITS = {
  interstitialMinInterval: 2 * 60 * 1000, // 2 minutes
  interstitialMaxPerDay: 3,
  rewardedMaxPerDay: 5,
  initialGracePeriod: 60 * 1000, // 1 minute after app start
  appOpenMinInterval: 4 * 60 * 60 * 1000, // 4 hours between app-open interstitials
  appOpenMaxPerDay: 2,
  appOpenDelay: 12 * 1000, // Show after 12 seconds to avoid jarring UX
};

// Default rewarded unlock duration: 30 minutes
const REWARDED_UNLOCK_DURATION_MS = 30 * 60 * 1000;

export function AdsProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [appStartTime, setAppStartTime] = useState<number>(Date.now());
  const appOpenAttemptedRef = useRef(false);
  // In-memory map of featureKey → expiresAt timestamp. Clears on app restart (intentional).
  const unlockedFeaturesRef = useRef<Map<string, number>>(new Map());
  const [unlockVersion, setUnlockVersion] = useState(0);
  const { ready: subscriptionReady, tier } = useSubscription();
  const { user, profile, loading: authLoading, profileLoading } = useAuth();
  const pathname = usePathname();

  const authReady = !authLoading && !profileLoading;
  const isWeb = Platform.OS === 'web';
  const isAndroid = Platform.OS === 'android';
  const freeTierAdsEnabled = process.env.EXPO_PUBLIC_ENABLE_FREE_TIER_ADS !== 'false';
  const webAdsEnabled = process.env.EXPO_PUBLIC_ENABLE_WEB_ADS !== 'false';
  const adsEnabledEnv =
    process.env.EXPO_PUBLIC_ENABLE_ADS !== '0' &&
    freeTierAdsEnabled;
  const roleEligible = isAdsEligibleUser(profile);
  const platformEligible = isAndroid || (isWeb && webAdsEnabled);

  // Determine if ads should be enabled
  const shouldEnableAds = useMemo(() => {
    return (
      subscriptionReady &&
      authReady &&
      tier === 'free' &&
      platformEligible &&
      adsEnabledEnv &&
      roleEligible
    );
  }, [subscriptionReady, authReady, tier, platformEligible, adsEnabledEnv, roleEligible]);

  const canShowBanner = shouldEnableAds && isAndroid;

  // Rewarded ads for quota extension are available to ALL tiers (not just free).
  // Banners/interstitials remain free-tier-only via shouldEnableAds.
  const canOfferRewardedQuotaAd = authReady && isAndroid && adsEnabledEnv && roleEligible;

  const [webInterstitial, setWebInterstitial] = useState<{ visible: boolean; tag: string }>({
    visible: false,
    tag: '',
  });

  const closeWebInterstitial = useCallback(() => {
    setWebInterstitial({ visible: false, tag: '' });
  }, []);

  const showWebInterstitial = useCallback(async (tag: string): Promise<boolean> => {
    if (!isWeb) return false;
    setWebInterstitial({ visible: true, tag });
    return true;
  }, [isWeb]);

  // Reset app-open attempt state when the user changes or ads become disabled.
  useEffect(() => {
    appOpenAttemptedRef.current = false;
  }, [user?.id, shouldEnableAds]);

  useEffect(() => {
    let mounted = true;

    const initializeAds = async () => {
      try {
        // Set app start time for grace period
        const startTime = Date.now();
        setAppStartTime(startTime);
        await AsyncStorage.setItem(STORAGE_KEYS.appStartTime, startTime.toString());

        if (shouldEnableAds && !isWeb) {
          debug('[AdsProvider] Initializing AdMob for free tier user', {
            tier,
            roleEligible,
            platformEligible,
          });
          const initialized = await initializeAdMob();
          
          track('ads.context_initialized', {
            success: initialized,
            tier,
            platform: Platform.OS,
          });

          if (mounted) {
            setReady(true);
          }
        } else {
          if (!isWeb || __DEV__) {
            debug('[AdsProvider] Skipping AdMob initialization', {
              shouldEnableAds,
              subscriptionReady,
              tier,
              platform: Platform.OS
            });
          }

          if (mounted) {
            setReady(true);
          }
        }
      } catch (error) {
        warn('[AdsProvider] Failed to initialize ads:', error);
        if (mounted) {
          setReady(true); // Always set ready to avoid blocking UI
        }
      }
    };

    if (subscriptionReady) {
      initializeAds();
    }

    return () => {
      mounted = false;
    };
  }, [shouldEnableAds, tier, subscriptionReady]);

  const getTodayString = () => {
    return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  };

  const isWithinGracePeriod = async (): Promise<boolean> => {
    try {
      const startTimeStr = await AsyncStorage.getItem(STORAGE_KEYS.appStartTime);
      const startTime = startTimeStr ? parseInt(startTimeStr, 10) : appStartTime;
      const elapsed = Date.now() - startTime;
      return elapsed < RATE_LIMITS.initialGracePeriod;
    } catch {
      return false;
    }
  };

  const canShowInterstitial = async (): Promise<{ allowed: boolean; reason?: string }> => {
    if (!shouldEnableAds) {
      return { allowed: false, reason: 'ads_disabled' };
    }

    // Check grace period
    const inGracePeriod = await isWithinGracePeriod();
    if (inGracePeriod) {
      return { allowed: false, reason: 'grace_period' };
    }

    try {
      // Check time-based rate limit
      const lastInterstitialStr = await AsyncStorage.getItem(STORAGE_KEYS.lastInterstitialAt);
      if (lastInterstitialStr) {
        const lastInterstitialTime = parseInt(lastInterstitialStr, 10);
        const timeSinceLastInterstitial = Date.now() - lastInterstitialTime;
        
        if (timeSinceLastInterstitial < RATE_LIMITS.interstitialMinInterval) {
          return { allowed: false, reason: 'rate_limit' };
        }
      }

      // Check daily count limit
      const today = getTodayString();
      const dailyCountStr = await AsyncStorage.getItem(STORAGE_KEYS.interstitialCount(today));
      const dailyCount = dailyCountStr ? parseInt(dailyCountStr, 10) : 0;
      
      if (dailyCount >= RATE_LIMITS.interstitialMaxPerDay) {
        return { allowed: false, reason: 'daily_limit' };
      }

      return { allowed: true };
    } catch (error) {
      warn('[AdsProvider] Error checking interstitial limits:', error);
      return { allowed: false, reason: 'error' };
    }
  };

  const canShowAppOpenInterstitial = async (): Promise<{ allowed: boolean; reason?: string }> => {
    if (!shouldEnableAds) {
      return { allowed: false, reason: 'ads_disabled' };
    }
    if (!user?.id) {
      return { allowed: false, reason: 'no_user' };
    }
    if (isAuthLikeRoute(pathname)) {
      return { allowed: false, reason: 'auth_route' };
    }

    try {
      const lastShownStr = await AsyncStorage.getItem(STORAGE_KEYS.lastAppOpenInterstitialAt);
      if (lastShownStr) {
        const lastShown = parseInt(lastShownStr, 10);
        if (Number.isFinite(lastShown)) {
          const elapsed = Date.now() - lastShown;
          if (elapsed < RATE_LIMITS.appOpenMinInterval) {
            return { allowed: false, reason: 'rate_limit' };
          }
        }
      }

      const today = getTodayString();
      const dailyCountStr = await AsyncStorage.getItem(STORAGE_KEYS.appOpenInterstitialCount(today));
      const dailyCount = dailyCountStr ? parseInt(dailyCountStr, 10) : 0;
      if (dailyCount >= RATE_LIMITS.appOpenMaxPerDay) {
        return { allowed: false, reason: 'daily_limit' };
      }

      return { allowed: true };
    } catch (error) {
      warn('[AdsProvider] Error checking app-open limits:', error);
      return { allowed: false, reason: 'error' };
    }
  };

  const canShowRewarded = async (): Promise<{ allowed: boolean; reason?: string }> => {
    // Rewarded ads (for quota top-up) are not tier-gated — any Android user can watch.
    if (!canOfferRewardedQuotaAd) {
      return { allowed: false, reason: 'ads_disabled' };
    }

    try {
      const today = getTodayString();
      const dailyCountStr = await AsyncStorage.getItem(STORAGE_KEYS.rewardedOffersCount(today));
      const dailyCount = dailyCountStr ? parseInt(dailyCountStr, 10) : 0;
      
      if (dailyCount >= RATE_LIMITS.rewardedMaxPerDay) {
        return { allowed: false, reason: 'daily_limit' };
      }

      return { allowed: true };
    } catch (error) {
      warn('[AdsProvider] Error checking rewarded limits:', error);
      return { allowed: false, reason: 'error' };
    }
  };

  const maybeShowInterstitial = useCallback(async (tag: string): Promise<boolean> => {
    try {
      const { allowed, reason } = await canShowInterstitial();
      
      // Track attempt regardless of outcome
      track('ads.interstitial_attempt', {
        tag,
        allowed,
        reason_blocked: reason,
        tier,
        platform: Platform.OS,
      });

      if (!allowed) {
        if (!isWeb || __DEV__ || reason !== 'ads_disabled') {
          debug(`[AdsProvider] Interstitial blocked: ${reason}`, { tag });
        }
        return false;
      }

      // Attempt to show interstitial
      const shown = isWeb
        ? await showWebInterstitial(tag)
        : await showInterstitialAd(tag);
      
      if (shown) {
        // Update rate limiting storage
        const now = Date.now();
        const today = getTodayString();
        
        await AsyncStorage.setItem(STORAGE_KEYS.lastInterstitialAt, now.toString());
        
        const dailyCountStr = await AsyncStorage.getItem(STORAGE_KEYS.interstitialCount(today));
        const dailyCount = dailyCountStr ? parseInt(dailyCountStr, 10) : 0;
        await AsyncStorage.setItem(STORAGE_KEYS.interstitialCount(today), (dailyCount + 1).toString());

        track('ads.interstitial_shown', {
          tag,
          tier,
          platform: Platform.OS,
        });

        debug(`[AdsProvider] Interstitial shown successfully`, { tag });
      } else {
        debug(`[AdsProvider] Interstitial failed to show`, { tag });
      }

      return shown;
    } catch (error) {
      warn('[AdsProvider] Error showing interstitial:', error);
      track('ads.interstitial_error', {
        tag,
        error: error instanceof Error ? error.message : 'Unknown error',
        tier,
        platform: Platform.OS,
      });
      return false;
    }
  }, [shouldEnableAds, tier, isWeb, showWebInterstitial]);

  // Tested on real device 2026-03-19 — paid tier — lazy init + ad load verified ✅
  const offerRewarded = useCallback(async (tag: string): Promise<{ shown: boolean; rewarded: boolean }> => {
    try {
      const { allowed, reason } = await canShowRewarded();
      
      if (!allowed) {
        if (!isWeb || __DEV__ || reason !== 'ads_disabled') {
          debug(`[AdsProvider] Rewarded ad blocked: ${reason}`, { tag });
        }
        track('ads.rewarded_blocked', {
          tag,
          reason_blocked: reason,
          tier,
          platform: Platform.OS,
        });
        return { shown: false, rewarded: false };
      }

      // Lazy init: paid tier users skip the initial AdMob init; initialize on-demand here.
      await initializeAdMob();

      const rewardedPlacement =
        tag.startsWith('ai_tool_') || tag.startsWith('premium_preview_')
          ? PLACEMENT_KEYS.REWARDED_AI_PREVIEW
          : PLACEMENT_KEYS.REWARDED_PARENT_PERKS;

      // Attempt to show rewarded ad
      const result = await showRewardedAd(rewardedPlacement);
      
      if (result.shown) {
        // Update daily count
        const today = getTodayString();
        const dailyCountStr = await AsyncStorage.getItem(STORAGE_KEYS.rewardedOffersCount(today));
        const dailyCount = dailyCountStr ? parseInt(dailyCountStr, 10) : 0;
        await AsyncStorage.setItem(STORAGE_KEYS.rewardedOffersCount(today), (dailyCount + 1).toString());

        track('ads.rewarded_offer_shown', {
          tag,
          tier,
          platform: Platform.OS,
        });

        if (result.rewarded) {
          track('ads.rewarded_completed', {
            tag,
            reward: result.reward,
            tier,
            platform: Platform.OS,
          });
          debug(`[AdsProvider] Rewarded ad completed`, { tag, reward: result.reward });
        }
      }

      return result;
    } catch (error) {
      warn('[AdsProvider] Error with rewarded ad:', error);
      track('ads.rewarded_error', {
        tag,
        error: error instanceof Error ? error.message : 'Unknown error',
        tier,
        platform: Platform.OS,
      });
      return { shown: false, rewarded: false };
    }
  }, [canOfferRewardedQuotaAd, tier, isWeb]);

  const unlockFeature = useCallback((featureKey: string, durationMs = REWARDED_UNLOCK_DURATION_MS) => {
    unlockedFeaturesRef.current.set(featureKey, Date.now() + durationMs);
    setUnlockVersion((v) => v + 1);
    track('ads.feature_unlocked', { featureKey, durationMs, tier, platform: Platform.OS });
    debug('[AdsProvider] Feature unlocked via rewarded ad', { featureKey, durationMs });
  }, [tier]);

  const isFeatureUnlocked = useCallback((featureKey: string): boolean => {
    const expiresAt = unlockedFeaturesRef.current.get(featureKey);
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
      unlockedFeaturesRef.current.delete(featureKey);
      return false;
    }
    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlockVersion]);

  // Show an interstitial shortly after app open for eligible free-tier users.
  useEffect(() => {
    if (!ready || !shouldEnableAds || !authReady || !user?.id) return;
    if (isAuthLikeRoute(pathname)) return;
    if (appOpenAttemptedRef.current) return;

    appOpenAttemptedRef.current = true;

    const timer = setTimeout(async () => {
      const { allowed, reason } = await canShowAppOpenInterstitial();

      track('ads.app_open_interstitial_attempt', {
        allowed,
        reason_blocked: reason,
        tier,
        platform: Platform.OS,
        pathname,
      });

      if (!allowed) {
        if (!isWeb || __DEV__ || reason !== 'ads_disabled') {
          debug('[AdsProvider] App-open interstitial blocked', { reason, pathname });
        }
        return;
      }

      const shown = isWeb
        ? await showWebInterstitial(PLACEMENT_KEYS.INTERSTITIAL_APP_OPEN)
        : await showAppOpenAd(PLACEMENT_KEYS.INTERSTITIAL_APP_OPEN);
      if (!shown) return;

      const now = Date.now();
      const today = getTodayString();
      await AsyncStorage.setItem(STORAGE_KEYS.lastAppOpenInterstitialAt, now.toString());
      const dailyCountStr = await AsyncStorage.getItem(STORAGE_KEYS.appOpenInterstitialCount(today));
      const dailyCount = dailyCountStr ? parseInt(dailyCountStr, 10) : 0;
      await AsyncStorage.setItem(STORAGE_KEYS.appOpenInterstitialCount(today), (dailyCount + 1).toString());

      track('ads.app_open_interstitial_shown', {
        tier,
        platform: Platform.OS,
        pathname,
      });
    }, RATE_LIMITS.appOpenDelay);

    return () => clearTimeout(timer);
  }, [ready, shouldEnableAds, authReady, user?.id, pathname, tier]);

  const value = useMemo<AdsContextType>(
    () => ({
      ready,
      canShowBanner,
      canOfferRewardedQuotaAd,
      maybeShowInterstitial,
      offerRewarded,
      unlockFeature,
      isFeatureUnlocked,
    }),
    [ready, canShowBanner, canOfferRewardedQuotaAd, maybeShowInterstitial, offerRewarded, unlockFeature, isFeatureUnlocked]
  );

  return (
    <AdsContext.Provider value={value}>
      {children}
      {isWeb && (
        <WebInterstitial
          visible={webInterstitial.visible}
          tag={webInterstitial.tag}
          onClose={closeWebInterstitial}
        />
      )}
    </AdsContext.Provider>
  );
}

export function useAds() {
  const context = useContext(AdsContext);
  if (!context) {
    throw new Error('useAds must be used within an AdsProvider');
  }
  return context;
}

/**
 * Convenience hook for premium feature gates.
 *
 * Returns `isUnlocked` (true for 30 min after watching a rewarded ad) and
 * `offerRewardedUnlock` (call this when the user taps "Watch Ad").
 *
 * Usage:
 * ```tsx
 * const { isUnlocked, offerRewardedUnlock } = useRewardedFeature('advanced_analytics');
 * if (isUnlocked || tier !== 'free') return <FeatureContent />;
 * return <PremiumFeatureBanner onRewardedUnlock={offerRewardedUnlock} ... />;
 * ```
 */
export function useRewardedFeature(featureKey: string) {
  const { isFeatureUnlocked, unlockFeature, offerRewarded, canShowBanner } = useAds();
  const isUnlocked = isFeatureUnlocked(featureKey);

  const offerRewardedUnlock = useCallback(async (): Promise<boolean> => {
    const result = await offerRewarded(`premium_preview_${featureKey}`);
    if (result.rewarded) {
      unlockFeature(featureKey);
      return true;
    }
    return false;
  }, [featureKey, offerRewarded, unlockFeature]);

  return { isUnlocked, offerRewardedUnlock, canShowRewardedAd: canShowBanner };
}
