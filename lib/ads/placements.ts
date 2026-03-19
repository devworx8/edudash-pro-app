/**
 * Ad Placements Registry
 * 
 * Central registry of all ad placements with metadata and frequency policies.
 * Each placement defines where, when, and how often ads should appear.
 */

import { AdPlacement } from './types';

export const AD_PLACEMENTS: Record<string, AdPlacement> = {
  // App open interstitial for free-tier users (shown shortly after launch)
  interstitial_app_open: {
    key: 'interstitial_app_open',
    type: 'appOpen',
    screen: 'app_open',
    position: 'navigation_break',
    adUnitEnvVar: 'EXPO_PUBLIC_ADMOB_ADUNIT_INTERSTITIAL_APP_OPEN',
    frequencyPolicy: {
      minInterval: 14400, // 4 hours between app-open interstitials
      dailyLimit: 2,
      minSessionsBeforeFirst: 1,
    },
    keywords: [
      'education', 'learning', 'parenting', 'student tools', 'tutoring',
    ],
    contentRating: 'general',
    description: 'Interstitial shown shortly after app launch for free-tier users',
    enabled: true,
  },

  // Banner ad at the bottom of parent dashboard
  banner_parent_dashboard_bottom: {
    key: 'banner_parent_dashboard_bottom',
    type: 'banner',
    screen: 'parent_dashboard',
    position: 'dashboard_bottom',
    adUnitEnvVar: 'EXPO_PUBLIC_ADMOB_ADUNIT_BANNER_PARENT_DASHBOARD',
    frequencyPolicy: {
      minInterval: 0, // Banner ads are persistent
      dailyLimit: 1000, // Effectively unlimited for banners
      minSessionsBeforeFirst: 1, // Show after first session
    },
    keywords: [
      'education', 'parenting', 'preschool', 'learning', 'child development',
      'school supplies', 'educational toys', 'tutoring', 'books'
    ],
    contentRating: 'parental',
    description: 'Bottom banner on parent dashboard main screen',
    enabled: true,
  },

  // Native ad in parent activity feeds
  native_parent_feed_inline: {
    key: 'native_parent_feed_inline',
    type: 'native',
    screen: 'parent_dashboard',
    position: 'feed_inline',
    adUnitEnvVar: 'EXPO_PUBLIC_ADMOB_ADUNIT_NATIVE_PARENT_FEED',
    frequencyPolicy: {
      minInterval: 300, // 5 minutes between native ads
      dailyLimit: 10, // Max 10 native ads per day
      feedItemInterval: 8, // One native ad every 8 feed items
      minSessionsBeforeFirst: 2, // Wait for 2nd session
    },
    keywords: [
      'educational apps', 'learning games', 'child safety', 'parenting tips',
      'homework help', 'after school care', 'educational content'
    ],
    contentRating: 'educational',
    description: 'Native ads within scrollable content feeds',
    enabled: true,
  },

  // Banner for messages/communication screens
  banner_parent_messages: {
    key: 'banner_parent_messages',
    type: 'banner',
    screen: 'parent_messages',
    position: 'content_end',
    adUnitEnvVar: 'EXPO_PUBLIC_ADMOB_ADUNIT_BANNER_PARENT_DASHBOARD',
    frequencyPolicy: {
      minInterval: 0,
      dailyLimit: 1000,
      minSessionsBeforeFirst: 1,
    },
    keywords: [
      'communication', 'parent teacher', 'school updates', 'messaging apps',
      'family organization', 'calendars'
    ],
    contentRating: 'parental',
    description: 'Banner on parent messages and communication screens',
    enabled: true,
  },

  // Interstitial for navigation transitions
  interstitial_parent_navigation: {
    key: 'interstitial_parent_navigation',
    type: 'interstitial',
    screen: 'parent_navigation',
    position: 'navigation_break',
    adUnitEnvVar: 'EXPO_PUBLIC_ADMOB_ADUNIT_INTERSTITIAL_PARENT_NAV',
    frequencyPolicy: {
      minInterval: 180, // 3 minutes minimum between interstitials
      dailyLimit: 4, // Max 4 interstitials per day
      minSessionsBeforeFirst: 3, // Never on first or second session
    },
    keywords: [
      'education', 'parenting', 'family apps', 'child development',
      'learning resources', 'educational services'
    ],
    contentRating: 'parental',
    description: 'Interstitial during natural navigation breaks',
    enabled: true,
  },

  // Rewarded video for premium perks
  rewarded_parent_perks: {
    key: 'rewarded_parent_perks',
    type: 'rewarded',
    screen: 'parent_dashboard',
    position: 'perk_unlock',
    adUnitEnvVar: 'EXPO_PUBLIC_ADMOB_ADUNIT_REWARDED_PARENT_PERK',
    frequencyPolicy: {
      minInterval: 900, // 15 minutes between rewarded ads
      dailyLimit: 8, // Max 8 rewarded ads per day
      userInitiated: true, // Always user-initiated
      minSessionsBeforeFirst: 1,
    },
    keywords: [
      'premium features', 'educational resources', 'parenting tools',
      'learning analytics', 'progress tracking', 'advanced features'
    ],
    contentRating: 'parental',
    description: 'Rewarded video to unlock premium perks',
    enabled: true,
  },

  // Rewarded ads used to preview/temporarily unlock premium AI tools
  rewarded_ai_preview: {
    key: 'rewarded_ai_preview',
    type: 'rewarded',
    screen: 'ai_tools',
    position: 'perk_unlock',
    adUnitEnvVar: 'EXPO_PUBLIC_ADMOB_ADUNIT_REWARDED_AI_PREVIEW',
    frequencyPolicy: {
      minInterval: 300, // 5 minutes between AI preview rewards
      dailyLimit: 5,
      userInitiated: true,
      minSessionsBeforeFirst: 1,
    },
    keywords: [
      'ai tutoring', 'education technology', 'study tools', 'learning support',
      'homework help', 'exam preparation',
    ],
    contentRating: 'educational',
    description: 'Rewarded ad to temporarily unlock premium AI features',
    enabled: true,
  },

  // Native ad in lists (like children list, history, etc.)
  native_parent_list_middle: {
    key: 'native_parent_list_middle',
    type: 'native',
    screen: 'parent_lists',
    position: 'list_middle',
    adUnitEnvVar: 'EXPO_PUBLIC_ADMOB_ADUNIT_NATIVE_PARENT_FEED',
    frequencyPolicy: {
      minInterval: 600, // 10 minutes between native ads in lists
      dailyLimit: 6, // Max 6 native ads per day in lists
      feedItemInterval: 12, // One native ad every 12 list items
      minSessionsBeforeFirst: 2,
    },
    keywords: [
      'child tracking', 'progress monitoring', 'educational assessments',
      'school management', 'attendance tracking', 'homework assistance'
    ],
    contentRating: 'parental',
    description: 'Native ads in middle of long lists',
    enabled: true,
  },

  // Banner ad for membership dashboards (EduPro, Youth President, etc.)
  banner_membership_dashboard: {
    key: 'banner_membership_dashboard',
    type: 'banner',
    screen: 'membership_dashboard',
    position: 'dashboard_bottom',
    adUnitEnvVar: 'EXPO_PUBLIC_ADMOB_ADUNIT_BANNER_MEMBERSHIP_DASHBOARD',
    frequencyPolicy: {
      minInterval: 0, // Banner ads are persistent
      dailyLimit: 1000, // Effectively unlimited for banners
      minSessionsBeforeFirst: 1, // Show after first session
    },
    keywords: [
      'membership', 'youth programs', 'community', 'leadership', 'networking',
      'organizations', 'social groups', 'events', 'community building'
    ],
    contentRating: 'general',
    description: 'Bottom banner on membership dashboards (Youth President, Secretary, etc.)',
    enabled: true,
  },

  // Interstitial ad for membership dashboard entry
  interstitial_membership_dashboard_enter: {
    key: 'interstitial_membership_dashboard_enter',
    type: 'interstitial',
    screen: 'membership_dashboard',
    position: 'navigation_break',
    adUnitEnvVar: 'EXPO_PUBLIC_ADMOB_ADUNIT_INTERSTITIAL_MEMBERSHIP_DASHBOARD',
    frequencyPolicy: {
      minInterval: 300, // 5 minutes minimum between interstitials
      dailyLimit: 3, // Max 3 interstitials per day
      minSessionsBeforeFirst: 2, // Never on first session
    },
    keywords: [
      'membership', 'youth programs', 'community', 'leadership', 'networking',
      'organizations', 'social groups', 'events', 'community building'
    ],
    contentRating: 'general',
    description: 'Interstitial shown when entering membership dashboard',
    enabled: true,
  },

  // Banner ad for learner/student dashboard
  banner_learner_dashboard: {
    key: 'banner_learner_dashboard',
    type: 'banner',
    screen: 'learner_dashboard',
    position: 'dashboard_bottom',
    adUnitEnvVar: 'EXPO_PUBLIC_ADMOB_ADUNIT_BANNER_LEARNER_DASHBOARD',
    frequencyPolicy: {
      minInterval: 0, // Banner ads are persistent
      dailyLimit: 1000, // Effectively unlimited for banners
      minSessionsBeforeFirst: 1, // Show after first session
    },
    keywords: [
      'education', 'learning', 'student apps', 'study tools', 'homework help',
      'educational games', 'tutoring', 'online courses', 'skill development'
    ],
    contentRating: 'general',
    description: 'Bottom banner on learner dashboard',
    enabled: true,
  },

  // Banner ad for K-12 parent dashboard
  banner_k12_parent_dashboard: {
    key: 'banner_k12_parent_dashboard',
    type: 'banner',
    screen: 'k12_parent_dashboard',
    position: 'dashboard_bottom',
    adUnitEnvVar: 'EXPO_PUBLIC_ADMOB_ADUNIT_BANNER_K12_PARENT_DASHBOARD',
    frequencyPolicy: {
      minInterval: 0,
      dailyLimit: 1000,
      minSessionsBeforeFirst: 1,
    },
    keywords: [
      'education', 'parenting', 'k12', 'school', 'learning', 'tutoring',
      'homework help', 'study tools', 'exam preparation',
    ],
    contentRating: 'parental',
    description: 'Bottom banner on K-12 parent dashboard',
    enabled: true,
  },

  // Interstitial ad for K-12 parent dashboard entry
  interstitial_k12_parent_dashboard_enter: {
    key: 'interstitial_k12_parent_dashboard_enter',
    type: 'interstitial',
    screen: 'k12_parent_dashboard',
    position: 'navigation_break',
    adUnitEnvVar: 'EXPO_PUBLIC_ADMOB_ADUNIT_INTERSTITIAL_K12_PARENT_DASHBOARD',
    frequencyPolicy: {
      minInterval: 300,
      dailyLimit: 3,
      minSessionsBeforeFirst: 2,
    },
    keywords: [
      'education', 'parenting', 'k12', 'school', 'learning resources',
      'tutoring', 'educational services',
    ],
    contentRating: 'parental',
    description: 'Interstitial shown when entering K-12 parent dashboard',
    enabled: true,
  },

  // Interstitial ad for learner dashboard navigation
  interstitial_learner_dashboard_enter: {
    key: 'interstitial_learner_dashboard_enter',
    type: 'interstitial',
    screen: 'learner_dashboard',
    position: 'navigation_break',
    adUnitEnvVar: 'EXPO_PUBLIC_ADMOB_ADUNIT_INTERSTITIAL_LEARNER_DASHBOARD',
    frequencyPolicy: {
      minInterval: 300, // 5 minutes minimum between interstitials
      dailyLimit: 3, // Max 3 interstitials per day
      minSessionsBeforeFirst: 2, // Never on first session
    },
    keywords: [
      'education', 'learning', 'student apps', 'study tools', 'courses',
      'tutoring', 'skill building', 'career development'
    ],
    contentRating: 'general',
    description: 'Interstitial shown when entering learner dashboard',
    enabled: true,
  },
};

/**
 * Get placement configuration by key
 */
export function getPlacement(key: string): AdPlacement | null {
  return AD_PLACEMENTS[key] || null;
}

/**
 * Get all placements for a specific screen
 */
export function getPlacementsForScreen(screen: string): AdPlacement[] {
  return Object.values(AD_PLACEMENTS).filter(p => p.screen === screen && p.enabled);
}

/**
 * Get all placements of a specific type
 */
export function getPlacementsByType(type: AdPlacement['type']): AdPlacement[] {
  return Object.values(AD_PLACEMENTS).filter(p => p.type === type && p.enabled);
}

/**
 * Get all enabled placements
 */
export function getEnabledPlacements(): AdPlacement[] {
  return Object.values(AD_PLACEMENTS).filter(p => p.enabled);
}

/**
 * Check if a placement exists and is enabled
 */
export function isValidPlacement(key: string): boolean {
  const placement = AD_PLACEMENTS[key];
  return placement ? placement.enabled : false;
}

/**
 * Get placement keys for easy access
 */
export const PLACEMENT_KEYS = {
  INTERSTITIAL_APP_OPEN: 'interstitial_app_open',
  BANNER_PARENT_DASHBOARD: 'banner_parent_dashboard_bottom',
  BANNER_PARENT_MESSAGES: 'banner_parent_messages',
  NATIVE_PARENT_FEED: 'native_parent_feed_inline',
  NATIVE_PARENT_LIST: 'native_parent_list_middle',
  INTERSTITIAL_PARENT_NAV: 'interstitial_parent_navigation',
  REWARDED_PARENT_PERKS: 'rewarded_parent_perks',
  REWARDED_AI_PREVIEW: 'rewarded_ai_preview',
  BANNER_MEMBERSHIP_DASHBOARD: 'banner_membership_dashboard',
  INTERSTITIAL_MEMBERSHIP_DASHBOARD_ENTER: 'interstitial_membership_dashboard_enter',
  // K-12 parent placements
  BANNER_K12_PARENT_DASHBOARD: 'banner_k12_parent_dashboard',
  INTERSTITIAL_K12_PARENT_DASHBOARD_ENTER: 'interstitial_k12_parent_dashboard_enter',
  // Learner/student placements
  BANNER_LEARNER_DASHBOARD: 'banner_learner_dashboard',
  INTERSTITIAL_LEARNER_DASHBOARD_ENTER: 'interstitial_learner_dashboard_enter',
} as const;

export type PlacementKey = keyof typeof PLACEMENT_KEYS;
