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
} as const;

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
    const testIdMap = {
      banner: TEST_AD_UNIT_IDS.BANNER,
      interstitial: TEST_AD_UNIT_IDS.INTERSTITIAL,
      rewarded: TEST_AD_UNIT_IDS.REWARDED,
      native: TEST_AD_UNIT_IDS.NATIVE,
    };
    
    return testIdMap[placement.type];
  }

  // Production: get from environment variable
  const productionAdUnitId = process.env[placement.adUnitEnvVar];
  
  if (!isValidAdUnitId(productionAdUnitId)) {
    // Try legacy env var fallbacks by ad type before giving up.
    const legacyFallbacks: Record<typeof placement.type, string[]> = {
      banner: ['EXPO_PUBLIC_ADMOB_ANDROID_BANNER_UNIT_ID'],
      interstitial: ['EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL_UNIT_ID', 'ADMOB_INTERSTITIAL_ANDROID'],
      rewarded: ['EXPO_PUBLIC_ADMOB_ANDROID_REWARDED_UNIT_ID', 'ADMOB_REWARDED_ANDROID'],
      native: ['EXPO_PUBLIC_ADMOB_ADUNIT_NATIVE_PARENT_FEED'],
    };

    for (const fallbackVar of legacyFallbacks[placement.type]) {
      const fallbackValue = process.env[fallbackVar];
      if (isValidAdUnitId(fallbackValue)) {
        console.log(`[AdConfig] Using legacy ad unit ID from ${fallbackVar} for ${placementKey}`);
        return fallbackValue;
      }
    }

    console.warn(
      `[AdConfig] Missing production ad unit ID for ${placementKey}. ` +
      'Ad will be disabled for this placement in production.'
    );
    return '';
  }

  return productionAdUnitId;
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
