import { Platform } from 'react-native';
// TODO: Implement AdMob when ready for production
// import {
//   BannerAd,
//   InterstitialAd,
//   RewardedAd,
//   TestIds,
//   AdEventType,
//   RewardedAdEventType,
// } from 'react-native-google-mobile-ads';
import { getFeatureFlagsSync } from '@/lib/featureFlags';
import { track } from '@/lib/analytics';
import { reportError } from '@/lib/monitoring';
import { log, warn, debug, error as logError } from '@/lib/debug';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { getAdUnitId as getPlacementAdUnitId } from '@/lib/ads/config';
import { getPlacement } from '@/lib/ads/placements';

/**
 * AdMob Test IDs for development - Google's official test IDs
 * Production IDs should be configured when ready for production deployment
 */
const ADMOB_TEST_IDS = {
  android: {
    banner: 'ca-app-pub-3940256099942544/6300978111',
    interstitial: 'ca-app-pub-3940256099942544/1033173712', 
    rewarded: 'ca-app-pub-3940256099942544/5224354917',
  },
  ios: {
    banner: 'ca-app-pub-3940256099942544/2934735716',
    interstitial: 'ca-app-pub-3940256099942544/4411468910',
    rewarded: 'ca-app-pub-3940256099942544/1712485313',
  },
};

/**
 * Production AdMob IDs - loaded from environment variables
 * Set these in EAS secrets or .env:
 * - ADMOB_BANNER_ANDROID / ADMOB_BANNER_IOS
 * - ADMOB_INTERSTITIAL_ANDROID / ADMOB_INTERSTITIAL_IOS
 * - ADMOB_REWARDED_ANDROID / ADMOB_REWARDED_IOS
 */
const getProductionIds = () => {
  const extra = Constants.expoConfig?.extra || {};
  return {
    android: {
      banner: extra.ADMOB_BANNER_ANDROID || process.env.ADMOB_BANNER_ANDROID || '',
      interstitial: extra.ADMOB_INTERSTITIAL_ANDROID || process.env.ADMOB_INTERSTITIAL_ANDROID || '',
      rewarded: extra.ADMOB_REWARDED_ANDROID || process.env.ADMOB_REWARDED_ANDROID || '',
    },
    ios: {
      banner: extra.ADMOB_BANNER_IOS || process.env.ADMOB_BANNER_IOS || '',
      interstitial: extra.ADMOB_INTERSTITIAL_IOS || process.env.ADMOB_INTERSTITIAL_IOS || '',
      rewarded: extra.ADMOB_REWARDED_IOS || process.env.ADMOB_REWARDED_IOS || '',
    },
  };
};

let isInitialized = false;

function isHuaweiNoGmsRiskDevice(): boolean {
  if (Platform.OS !== 'android') return false;
  const brand = String(Device.brand || '').toLowerCase();
  const manufacturer = String(Device.manufacturer || '').toLowerCase();
  return brand.includes('huawei') || manufacturer.includes('huawei');
}

/**
 * Check if we should use production ad IDs
 * Uses production IDs when:
 * 1. Not in development mode (__DEV__ is false)
 * 2. admob_test_ids feature flag is false
 * 3. Production IDs are configured
 */
function shouldUseProductionIds(): boolean {
  // Always use test IDs in development
  if (__DEV__) return false;
  
  const flags = getFeatureFlagsSync();
  // Feature flag allows forcing test IDs in production for testing
  if (flags.admob_test_ids) return false;
  
  return true;
}

/**
 * Get appropriate ad unit ID based on testing mode
 */
function getLegacyAdUnitId(adType: keyof typeof ADMOB_TEST_IDS.android): string {
  const platform = Platform.OS as 'android' | 'ios';
  
  if (shouldUseProductionIds()) {
    const productionIds = getProductionIds();
    const productionId = productionIds[platform]?.[adType];
    
    // Fall back to test IDs if production IDs aren't configured
    if (productionId && productionId.startsWith('ca-app-pub-')) {
      debug(`AdMob: Using production ${adType} ad ID`);
      return productionId;
    }
    
    warn(`AdMob: Production ${adType} ad ID not configured; ad disabled in production mode`);
    return '';
  }
  
  return ADMOB_TEST_IDS[platform][adType];
}

function resolveAdUnitId(
  adType: keyof typeof ADMOB_TEST_IDS.android,
  placementKey: string | undefined,
  testId: string
): string {
  if (placementKey) {
    const placement = getPlacement(placementKey);
    if (placement && placement.type === adType) {
      return getPlacementAdUnitId(placementKey);
    }
  }

  return shouldUseProductionIds() ? getLegacyAdUnitId(adType) : testId;
}

/**
 * Initialize AdMob - Calls the SDK's mobileAds().initialize()
 * Only activates on Android (Android-only mode).
 */
export async function initializeAdMob(): Promise<boolean> {
  if (isInitialized) return true;
  
  try {
    const flags = getFeatureFlagsSync();
    
    // Skip initialization on non-Android platforms during Android-only testing
    if (flags.android_only_mode && Platform.OS !== 'android') {
      log('AdMob initialization skipped: Android-only mode active');
      return false;
    }

    // Skip on web
    if (Platform.OS === 'web') {
      log('AdMob initialization skipped: web platform');
      return false;
    }
    if (isHuaweiNoGmsRiskDevice()) {
      warn('AdMob initialization skipped: Huawei/no-GMS risk device');
      return false;
    }
    
    const useProductionAds = shouldUseProductionIds();
    
    // Initialize the SDK
    try {
      const { default: mobileAds } = require('react-native-google-mobile-ads');
      await mobileAds().initialize();
      log('AdMob SDK initialized successfully');
    } catch (sdkErr) {
      // SDK not available (e.g., dev build without native module)
      warn('AdMob SDK not available, running in stub mode:', sdkErr);
    }

    isInitialized = true;
    
    track('edudash.ads.initialized', {
      platform: Platform.OS,
      test_mode: !useProductionAds,
      production_mode: useProductionAds,
      android_only: flags.android_only_mode,
    });
    
    log(`AdMob initialized - ${useProductionAds ? 'PRODUCTION' : 'TEST'} mode`);
    return true;
    
  } catch (error) {
    reportError(new Error('AdMob initialization failed'), { error });
    logError('Failed to initialize AdMob:', error);
    return false;
  }
}

// Interstitial ad instance cache
let interstitialAd: any = null;
let rewardedAd: any = null;

/**
 * Load interstitial ad
 */
async function loadInterstitialAd(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (Platform.OS !== 'android') return false;
  if (isHuaweiNoGmsRiskDevice()) return false;
  
  try {
    const { InterstitialAd, AdEventType, TestIds } = require('react-native-google-mobile-ads');
    const adUnitId = resolveAdUnitId('interstitial', undefined, TestIds.INTERSTITIAL);
    if (!adUnitId) {
      return false;
    }
    
    interstitialAd = InterstitialAd.createForAdRequest(adUnitId, {
      requestNonPersonalizedAdsOnly: true,
    });

    return new Promise((resolve) => {
      const loadedListener = interstitialAd.addAdEventListener(AdEventType.LOADED, () => {
        debug('AdMob: Interstitial ad loaded');
        loadedListener();
        resolve(true);
      });
      
      const errorListener = interstitialAd.addAdEventListener(AdEventType.ERROR, (error: any) => {
        warn('AdMob: Interstitial ad failed to load:', error);
        errorListener();
        resolve(false);
      });
      
      interstitialAd.load();
    });
  } catch (error) {
    warn('AdMob: Failed to load interstitial:', error);
    return false;
  }
}

/**
 * Show interstitial ad - Real implementation using react-native-google-mobile-ads
 */
export async function showInterstitialAd(placementKey?: string): Promise<boolean> {
  const flags = getFeatureFlagsSync();
  
  // Skip on enterprise tier
  if (flags.enterprise_tier_enabled) {
    return false;
  }
  
  // Skip on non-Android platforms
  if (Platform.OS === 'web') return false;
  if (Platform.OS !== 'android') return false;
  if (isHuaweiNoGmsRiskDevice()) return false;
  
  try {
    const { InterstitialAd, AdEventType, TestIds } = require('react-native-google-mobile-ads');
    const adUnitId = resolveAdUnitId('interstitial', placementKey, TestIds.INTERSTITIAL);
    if (!adUnitId) {
      return false;
    }
    
    const ad = InterstitialAd.createForAdRequest(adUnitId, {
      requestNonPersonalizedAdsOnly: true,
    });

    return new Promise((resolve) => {
      let resolved = false;
      
      const loadedListener = ad.addAdEventListener(AdEventType.LOADED, () => {
        debug('AdMob: Interstitial loaded, showing...');
        ad.show();
      });
      
      const closedListener = ad.addAdEventListener(AdEventType.CLOSED, () => {
        debug('AdMob: Interstitial closed');
        if (!resolved) {
          resolved = true;
          loadedListener();
          closedListener();
          errorListener();
          resolve(true);
        }
      });
      
      const errorListener = ad.addAdEventListener(AdEventType.ERROR, (error: any) => {
        warn('AdMob: Interstitial error:', error);
        track('edudash.ads.interstitial_error', {
          platform: Platform.OS,
          error: error?.message || 'Unknown error',
        });
        if (!resolved) {
          resolved = true;
          loadedListener();
          closedListener();
          errorListener();
          resolve(false);
        }
      });
      
      // Timeout after 10 seconds
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          loadedListener();
          closedListener();
          errorListener();
          resolve(false);
        }
      }, 10000);
      
      ad.load();
    });
  } catch (error) {
    warn('AdMob: Failed to show interstitial:', error);
    track('edudash.ads.interstitial_error', {
      platform: Platform.OS,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

/**
 * Show app open ad - uses AppOpenAd when available, falls back to interstitial.
 */
export async function showAppOpenAd(placementKey?: string): Promise<boolean> {
  const flags = getFeatureFlagsSync();

  if (flags.enterprise_tier_enabled) {
    return false;
  }

  if (Platform.OS === 'web') return false;
  if (Platform.OS !== 'android') return false;
  if (isHuaweiNoGmsRiskDevice()) return false;

  try {
    const { AppOpenAd, AppOpenAdOrientation, AdEventType, TestIds } = require('react-native-google-mobile-ads');

    // If AppOpenAd is not available in this build, gracefully fall back.
    if (!AppOpenAd) {
      return showInterstitialAd(placementKey);
    }

    const adUnitId = resolveAdUnitId('interstitial', placementKey, TestIds.APP_OPEN);
    if (!adUnitId) {
      return false;
    }

    const orientation = AppOpenAdOrientation?.PORTRAIT;
    const ad = orientation !== undefined
      ? AppOpenAd.createForAdRequest(
          adUnitId,
          { requestNonPersonalizedAdsOnly: true },
          orientation
        )
      : AppOpenAd.createForAdRequest(adUnitId, { requestNonPersonalizedAdsOnly: true });

    return new Promise((resolve) => {
      let resolved = false;

      const loadedListener = ad.addAdEventListener(AdEventType.LOADED, () => {
        debug('AdMob: App open loaded, showing...');
        ad.show();
      });

      const closedListener = ad.addAdEventListener(AdEventType.CLOSED, () => {
        debug('AdMob: App open closed');
        if (!resolved) {
          resolved = true;
          loadedListener();
          closedListener();
          errorListener();
          resolve(true);
        }
      });

      const errorListener = ad.addAdEventListener(AdEventType.ERROR, (error: unknown) => {
        warn('AdMob: App open error:', error);
        track('edudash.ads.app_open_error', {
          platform: Platform.OS,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        if (!resolved) {
          resolved = true;
          loadedListener();
          closedListener();
          errorListener();
          resolve(false);
        }
      });

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          loadedListener();
          closedListener();
          errorListener();
          resolve(false);
        }
      }, 12000);

      ad.load();
    });
  } catch (error) {
    warn('AdMob: Failed to show app open ad:', error);
    track('edudash.ads.app_open_error', {
      platform: Platform.OS,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

/**
 * Show rewarded ad - Real implementation using react-native-google-mobile-ads
 */
export async function showRewardedAd(placementKey?: string): Promise<{
  shown: boolean;
  rewarded: boolean;
  reward?: { type: string; amount: number };
}> {
  const flags = getFeatureFlagsSync();
  
  // Skip on enterprise tier
  if (flags.enterprise_tier_enabled) {
    return { shown: false, rewarded: false };
  }
  
  // Skip on non-Android platforms
  if (Platform.OS === 'web') return { shown: false, rewarded: false };
  if (Platform.OS !== 'android') return { shown: false, rewarded: false };
  if (isHuaweiNoGmsRiskDevice()) return { shown: false, rewarded: false };
  
  try {
    const { RewardedAd, RewardedAdEventType, TestIds } = require('react-native-google-mobile-ads');
    const adUnitId = resolveAdUnitId('rewarded', placementKey, TestIds.REWARDED);
    if (!adUnitId) {
      return { shown: false, rewarded: false };
    }
    
    const ad = RewardedAd.createForAdRequest(adUnitId, {
      requestNonPersonalizedAdsOnly: true,
    });

    return new Promise((resolve) => {
      let resolved = false;
      let earnedReward: { type: string; amount: number } | undefined;
      
      const loadedListener = ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
        debug('AdMob: Rewarded ad loaded, showing...');
        ad.show();
      });
      
      const earnedListener = ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, (reward: any) => {
        debug('AdMob: Reward earned:', reward);
        earnedReward = {
          type: reward.type || 'coins',
          amount: reward.amount || 1,
        };
        track('edudash.ads.rewarded_earned', {
          platform: Platform.OS,
          reward_type: earnedReward.type,
          reward_amount: earnedReward.amount,
        });
      });
      
      const closedListener = ad.addAdEventListener('closed', () => {
        debug('AdMob: Rewarded ad closed');
        if (!resolved) {
          resolved = true;
          loadedListener();
          earnedListener();
          closedListener();
          errorListener();
          resolve({ 
            shown: true, 
            rewarded: !!earnedReward,
            reward: earnedReward,
          });
        }
      });
      
      const errorListener = ad.addAdEventListener('error', (error: any) => {
        warn('AdMob: Rewarded ad error:', error);
        track('edudash.ads.rewarded_error', {
          platform: Platform.OS,
          error: error?.message || 'Unknown error',
        });
        if (!resolved) {
          resolved = true;
          loadedListener();
          earnedListener();
          closedListener();
          errorListener();
          resolve({ shown: false, rewarded: false });
        }
      });
      
      // Timeout after 15 seconds
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          loadedListener();
          earnedListener();
          closedListener();
          errorListener();
          resolve({ shown: false, rewarded: false });
        }
      }, 15000);
      
      ad.load();
    });
  } catch (error) {
    warn('AdMob: Failed to show rewarded ad:', error);
    track('edudash.ads.rewarded_error', {
      platform: Platform.OS,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return { shown: false, rewarded: false };
  }
}

/**
 * Check if interstitial ad is ready - Stub implementation
 */
export function isInterstitialReady(): boolean {
  return false; // Stub always returns false
}

/**
 * Check if rewarded ad is ready - Stub implementation
 */
export function isRewardedReady(): boolean {
  return false; // Stub always returns false
}

/**
 * Get banner ad unit ID for AdBanner component
 */
export function getBannerAdUnitId(): string {
  return getLegacyAdUnitId('banner');
}

/**
 * Clean up AdMob resources - Stub implementation
 */
export function cleanupAdMob(): void {
  debug('AdMob Stub: Cleanup called');
  isInitialized = false;
}
