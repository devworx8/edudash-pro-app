/**
 * Ad Gating Logic
 * 
 * Determines when and where ads should be shown based on user role,
 * subscription tier, platform, and other contextual factors.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isUnderAgeOfConsent } from '@/lib/services/consentService';
import { AdGatingContext } from './types';

// Conditionally import NetInfo to avoid web bundling issues
let NetInfo: any = null;
try {
  if (Platform.OS !== 'web') {
    NetInfo = require('@react-native-community/netinfo');
  }
} catch (error) {
  console.debug('NetInfo not available:', error);
}

/**
 * Check if the current platform is Android
 */
export function isAndroid(): boolean {
  return Platform.OS === 'android';
}

/**
 * Check if the current platform is iOS
 */
export function isIOS(): boolean {
  return Platform.OS === 'ios';
}

/**
 * Check if we're running on web platform
 */
export function isWeb(): boolean {
  return Platform.OS === 'web';
}

/**
 * Check if ads are globally enabled in environment
 */
export function areAdsEnabledInEnv(): boolean {
  return process.env.EXPO_PUBLIC_ENABLE_FREE_TIER_ADS === 'true';
}

/**
 * Check if we're using test ads only
 */
export function areTestIdsOnly(): boolean {
  return process.env.EXPO_PUBLIC_ADMOB_TEST_IDS_ONLY === 'true';
}

/**
 * Check if user has parent role
 */
export function isParentRole(userProfile: any): boolean {
  if (!userProfile) return false;
  return userProfile.role === 'parent';
}

/**
 * Check if user has learner/student role
 */
export function isLearnerRole(userProfile: any): boolean {
  if (!userProfile) return false;
  return userProfile.role === 'student' || userProfile.role === 'learner';
}

/**
 * Check if user is a membership/organization user (EduPro, etc.)
 */
export function isMembershipUser(userProfile: any): boolean {
  if (!userProfile) return false;
  
  // Check if user has organization_membership with member_type
  const hasOrgMembership = userProfile.organization_membership?.member_type ||
                           userProfile.organization_membership?.organization_id;
  
  // Check if user has member_type directly
  const hasMemberType = userProfile.member_type;
  
  // Check if user's role indicates membership (not parent, teacher, student, etc.)
  const isMembershipRole = userProfile.role && 
    !['parent', 'teacher', 'student', 'learner', 'principal', 'super_admin', 'superadmin'].includes(userProfile.role);
  
  return !!(hasOrgMembership || hasMemberType || isMembershipRole);
}

/**
 * Check if user is eligible for ads (parent, learner, OR membership user).
 * Teachers, principals, and admin roles are intentionally excluded from ads.
 */
export function isAdsEligibleUser(userProfile: any): boolean {
  if (!userProfile) return false;
  const role = String(userProfile.role || '').toLowerCase();
  const dateOfBirth = userProfile.date_of_birth || userProfile.dateOfBirth || null;
  if (role === 'super_admin' || role === 'superadmin') return false;
  if (['principal', 'principal_admin', 'admin'].includes(role)) return false;
  // Institutional teachers (org-provisioned) are excluded; standalone teachers are eligible
  if (role === 'teacher' && userProfile.organization_id) return false;
  if (isUnderAgeOfConsent(dateOfBirth)) {
    return false;
  }
  return isParentRole(userProfile) || isLearnerRole(userProfile) || isMembershipUser(userProfile);
}

/**
 * Check if user is on free subscription tier
 */
export function isFreeTier(subscriptionTier?: string): boolean {
  if (!subscriptionTier) return true; // Default to free
  return subscriptionTier === 'free';
}

/**
 * Check network connectivity
 */
export async function getNetworkState(): Promise<{
  isOnline: boolean;
  connectionType: string | null;
}> {
  // Web platform - use navigator API
  if (Platform.OS === 'web') {
    try {
      if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
        return {
          isOnline: navigator.onLine,
          connectionType: 'web'
        };
      }
    } catch (error) {
      console.debug('Web navigator not available:', error);
    }
    // Fallback for web
    return {
      isOnline: true,
      connectionType: 'web'
    };
  }

  // Native platforms
  try {
    if (!NetInfo) {
      console.debug('NetInfo not available, assuming online');
      return {
        isOnline: true,
        connectionType: null
      };
    }

    const state = await NetInfo.fetch();
    return {
      isOnline: state.isConnected ?? false,
      connectionType: state.type
    };
  } catch (error) {
    console.warn('Failed to get network state:', error);
    return {
      isOnline: true, // Assume online if we can't check
      connectionType: null
    };
  }
}

/**
 * Get user session count from AsyncStorage
 */
export async function getUserSessionCount(): Promise<number> {
  try {
    const count = await AsyncStorage.getItem('@edudash_session_count');
    return count ? parseInt(count, 10) : 0;
  } catch (error) {
    console.warn('Failed to get session count:', error);
    return 0;
  }
}

/**
 * Increment user session count
 */
export async function incrementSessionCount(): Promise<number> {
  try {
    const current = await getUserSessionCount();
    const newCount = current + 1;
    await AsyncStorage.setItem('@edudash_session_count', newCount.toString());
    return newCount;
  } catch (error) {
    console.warn('Failed to increment session count:', error);
    return 1;
  }
}

/**
 * Check if this is the user's first session
 */
export async function isFirstSession(): Promise<boolean> {
  const sessionCount = await getUserSessionCount();
  return sessionCount <= 1;
}

/**
 * Build comprehensive gating context
 */
export async function buildGatingContext(
  userProfile?: any,
  subscriptionTier?: string,
  currentScreen?: string
): Promise<AdGatingContext> {
  const networkState = await getNetworkState();
  const sessionCount = await getUserSessionCount();

  return {
    isAndroid: isAndroid(),
    isParentRole: isAdsEligibleUser(userProfile), // Now includes both parent and membership users
    isFreeTier: isFreeTier(subscriptionTier),
    adsEnabled: areAdsEnabledInEnv(),
    isOnline: networkState.isOnline,
    currentScreen,
    sessionCount,
  };
}

/**
 * Main gating function - determines if ads should be shown
 */
export async function shouldShowAds(
  userProfile?: any,
  subscriptionTier?: string
): Promise<boolean> {
  const context = await buildGatingContext(userProfile, subscriptionTier);
  
  // All conditions must be true for ads to show
  const conditions = [
    context.isAndroid,           // Only on Android
    context.isParentRole,        // Only for parent users
    context.isFreeTier,          // Only for free tier
    context.adsEnabled,          // Only if ads are enabled
    context.isOnline,            // Only when online
  ];

  const shouldShow = conditions.every(condition => condition === true);

  console.log('[AdGating] Should show ads:', shouldShow, {
    isAndroid: context.isAndroid,
    isParentRole: context.isParentRole,
    isFreeTier: context.isFreeTier,
    adsEnabled: context.adsEnabled,
    isOnline: context.isOnline,
    sessionCount: context.sessionCount,
  });

  return shouldShow;
}

/**
 * Check if ads are allowed in the current app state
 */
export async function isAppStateAllowedForAds(): Promise<boolean> {
  try {
    // Don't show ads if app is in background
    // Note: This would need to be integrated with app state listeners
    // For now, we assume foreground
    return true;
  // eslint-disable-next-line no-unreachable
  } catch (error) {
    console.warn('Failed to check app state:', error);
    return true;
  }
}

/**
 * Get contextual keywords based on current screen and user context
 */
export function getContextualKeywords(
  screenName?: string,
  userProfile?: any
): string[] {
  const baseKeywords = ['education', 'parenting', 'preschool', 'learning'];
  
  // Add screen-specific keywords
  const screenKeywords: Record<string, string[]> = {
    'parent-dashboard': ['child development', 'progress tracking'],
    'parent-messages': ['communication', 'teacher-parent'],
    'parent-attendance': ['school attendance', 'child safety'],
    'parent-homework': ['homework help', 'tutoring'],
    'parent-progress': ['academic progress', 'assessments'],
    'parent-payments': ['school fees', 'educational expenses'],
  };

  const additionalKeywords = screenKeywords[screenName || ''] || [];
  
  return [...baseKeywords, ...additionalKeywords];
}

/**
 * Check if user has given consent for personalized ads
 */
export async function hasUserConsentForPersonalizedAds(): Promise<boolean> {
  try {
    const consent = await AsyncStorage.getItem('@edudash_ad_consent');
    return consent === 'granted';
  } catch (error) {
    console.warn('Failed to get ad consent:', error);
    return false; // Default to non-personalized ads
  }
}

/**
 * Set user consent for personalized ads
 */
export async function setUserAdConsent(granted: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem('@edudash_ad_consent', granted ? 'granted' : 'denied');
  } catch (error) {
    console.warn('Failed to set ad consent:', error);
  }
}
