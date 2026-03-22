/**
 * Ad Configuration and Unit ID Management
 * 
 * Handles ad unit IDs, test IDs, and ad request configuration.
 * Ensures test IDs are used in development and proper IDs in production.
 */

import { Platform } from 'react-native';
import { AdRequestOptions } from './types';
import { getPlacement } from './placements';
import { areTestIdsOnly, getContextualKeywords, hasUserConsentForPersonalizedAds } from './gating';

// Google's official test ad unit IDs
export const TEST_AD_UNIT_IDS = {
  BANNER: 'ca-app-pub-3940256099942544/6300978111',
  INTERSTITIAL: 'ca-app-pub-3940256099942544/1033173712',
  REWARDED: 'ca-app-pub-3940256099942544/5224354917',
  NATIVE: 'ca-app-pub-3940256099942544/2247696110',
  APP_OPEN: 'ca-app-pub-3940256099942544/9257395921',
} as const;

/**
 * Production ad unit IDs from AdMob dashboard.
 * Used as fallback when EAS secrets / env vars are not populated.
 * App ID: ca-app-pub-2808416461095370~5255516826
 */
export const PRODUCTION_AD_UNIT_IDS: Record<string, string> = {
  // Banner ads
  banner: 'ca-app-pub-2808416461095370/4783059322',       // Banner_Ad
  banner_2: 'ca-app-pub-2808416461095370/9817578366',     // Banner_Ad-2
  // Interstitial ads
  interstitial: 'ca-app-pub-2808416461095370/5737917881', // Interstitial
  interstitial_1: 'ca-app-pub-2808416461095370/6125745363', // Interstial-1
  // Rewarded ads
  rewarded: 'ca-app-pub-2808416461095370/8953107650',     // REWARDED_Main
  // App open ads
  appOpen: 'ca-app-pub-2808416461095370/3886594836',      // App open
  // Native ads
  native: 'ca-app-pub-2808416461095370/7191415021',       // Native advanced
  native_rewarded: 'ca-app-pub-2808416461095370/7590071512', // Native Rewarded
} as const;

/**
 * Map placement env var keys to production ad unit IDs.
 * When an env var is empty (e.g. EAS secrets not set), these are used.
 */
const PLACEMENT_PRODUCTION_FALLBACKS: Record<string, string> = {
  EXPO_PUBLIC_ADMOB_ADUNIT_INTERSTITIAL_APP_OPEN: PRODUCTION_AD_UNIT_IDS.appOpen,
  EXPO_PUBLIC_ADMOB_ADUNIT_BANNER_PARENT_DASHBOARD: PRODUCTION_AD_UNIT_IDS.banner,
  EXPO_PUBLIC_ADMOB_ADUNIT_BANNER_MEMBERSHIP_DASHBOARD: PRODUCTION_AD_UNIT_IDS.banner_2,
  EXPO_PUBLIC_ADMOB_ADUNIT_BANNER_LEARNER_DASHBOARD: PRODUCTION_AD_UNIT_IDS.banner,
  EXPO_PUBLIC_ADMOB_ADUNIT_NATIVE_PARENT_FEED: PRODUCTION_AD_UNIT_IDS.native,
  EXPO_PUBLIC_ADMOB_ADUNIT_INTERSTITIAL_PARENT_NAV: PRODUCTION_AD_UNIT_IDS.interstitial,
  EXPO_PUBLIC_ADMOB_ADUNIT_INTERSTITIAL_MEMBERSHIP_DASHBOARD: PRODUCTION_AD_UNIT_IDS.interstitial_1,
  EXPO_PUBLIC_ADMOB_ADUNIT_INTERSTITIAL_LEARNER_DASHBOARD: PRODUCTION_AD_UNIT_IDS.interstitial_1,
  EXPO_PUBLIC_ADMOB_ADUNIT_REWARDED_PARENT_PERK: PRODUCTION_AD_UNIT_IDS.rewarded,
  EXPO_PUBLIC_ADMOB_ADUNIT_REWARDED_AI_PREVIEW: PRODUCTION_AD_UNIT_IDS.rewarded,
};

function isValidAdUnitId(value?: string): value is string {
  return typeof value === 'string' && value.startsWith('ca-app-pub-');
}

/**
 * Get ad unit ID for a specific placement
 * Returns test IDs in development, production IDs otherwise
 */
export function getAdUnitId(placementKey: string): string {
  const placement = getPlacement(placementKey);
  const useTestIds = areTestIdsOnly() || __DEV__;
  
  if (!placement) {
    console.warn(`[AdConfig] Unknown placement: ${placementKey}`);
    return useTestIds ? TEST_AD_UNIT_IDS.BANNER : '';
  }

  // Always use test IDs if flag is set or in development
  if (useTestIds) {
    // Map placement types to test ad unit IDs
    const testIdMap: Record<string, string> = {
      banner: TEST_AD_UNIT_IDS.BANNER,
      interstitial: TEST_AD_UNIT_IDS.INTERSTITIAL,
      rewarded: TEST_AD_UNIT_IDS.REWARDED,
      native: TEST_AD_UNIT_IDS.NATIVE,
      appOpen: TEST_AD_UNIT_IDS.APP_OPEN,
    };
    
    return testIdMap[placement.type];
  }

  // Production: get from environment variable
  const productionAdUnitId = process.env[placement.adUnitEnvVar];
  
  if (isValidAdUnitId(productionAdUnitId)) {
    return productionAdUnitId;
  }

  // Fallback: hardcoded production IDs keyed by the placement env var
  const hardcodedFallback = PLACEMENT_PRODUCTION_FALLBACKS[placement.adUnitEnvVar];
  if (isValidAdUnitId(hardcodedFallback)) {
    return hardcodedFallback;
  }

  // Last resort: type-based production fallback
  const typeFallback = PRODUCTION_AD_UNIT_IDS[placement.type];
  if (isValidAdUnitId(typeFallback)) {
    return typeFallback;
  }

  console.warn(
    `[AdConfig] Missing production ad unit ID for ${placementKey}. ` +
    'Ad will be disabled for this placement in production.'
  );
  return '';
}

/**
 * Get AdMob app ID for the current platform
 */
export function getAppId(): string {
  const useTestIds = areTestIdsOnly() || __DEV__;
  
  if (useTestIds) {
    // Google's test app IDs
    return Platform.OS === 'android' 
      ? 'ca-app-pub-3940256099942544~3347511713'  // Test Android App ID
      : 'ca-app-pub-3940256099942544~1458002511'; // Test iOS App ID
  }

  // Production app IDs from environment
  const productionAppId = Platform.OS === 'android'
    ? process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID
    : process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID;

  if (!productionAppId) {
    console.warn(`[AdConfig] Missing production app ID for ${Platform.OS}.`);
    return '';
  }

  return productionAppId;
}

/**
 * Create ad request options with appropriate targeting and consent
 */
export async function createAdRequestOptions(
  placementKey: string,
  screenName?: string,
  userProfile?: any
): Promise<AdRequestOptions> {
  const placement = getPlacement(placementKey);
  const hasConsent = await hasUserConsentForPersonalizedAds();
  
  // Base options
  const options: AdRequestOptions = {
    nonPersonalizedAds: !hasConsent, // Use non-personalized ads if no consent
    childDirectedTreatment: false,   // App targets parents, not children
    tagForChildDirectedTreatment: false,
  };

  // Add contextual keywords
  if (placement) {
    const contextualKeywords = getContextualKeywords(screenName, userProfile);
    const placementKeywords = placement.keywords || [];
    
    options.keywords = [...new Set([...contextualKeywords, ...placementKeywords])];
  }

  // Set content URL if available (for content-based targeting)
  if (screenName) {
    options.contentUrl = `https://edudashpro.org.za/${screenName}`;
  }

  console.log(`[AdConfig] Ad request options for ${placementKey}:`, {
    keywords: options.keywords?.slice(0, 5), // Log first 5 keywords
    nonPersonalizedAds: options.nonPersonalizedAds,
    hasConsent,
  });

  return options;
}

/**
 * Check if ads are properly configured
 */
export function isAdConfigValid(): boolean {
  const requiredEnvVars = [
    'EXPO_PUBLIC_ENABLE_FREE_TIER_ADS',
    'EXPO_PUBLIC_ADMOB_TEST_IDS_ONLY',
  ];

  const missingVars = requiredEnvVars.filter(varName => 
    !process.env[varName]
  );

  if (missingVars.length > 0) {
    console.warn('[AdConfig] Missing required environment variables:', missingVars);
    return false;
  }

  return true;
}

/**
 * Get ad configuration summary for debugging
 */
export function getAdConfigSummary(): {
  platform: string;
  useTestIds: boolean;
  adsEnabled: boolean;
  appId: string;
  configValid: boolean;
} {
  return {
    platform: Platform.OS,
    useTestIds: areTestIdsOnly() || __DEV__,
    adsEnabled: process.env.EXPO_PUBLIC_ENABLE_FREE_TIER_ADS === 'true',
    appId: getAppId(),
    configValid: isAdConfigValid(),
  };
}

/**
 * Log current ad configuration (for debugging)
 */
export function logAdConfig(): void {
  const summary = getAdConfigSummary();
  console.log('[AdConfig] Configuration:', summary);
  
  if (!summary.configValid) {
    console.warn('[AdConfig] Ad configuration is invalid. Ads may not work properly.');
  }
  
  if (summary.useTestIds) {
    console.log('[AdConfig] Using test ad unit IDs for development/testing.');
  } else {
    console.log('[AdConfig] Using production ad unit IDs.');
  }
}
