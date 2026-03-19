/**
 * Ad System Types and Interfaces
 * 
 * Core type definitions for EduDash Pro's ad system.
 * Supports banner, interstitial, native, and rewarded ads.
 */

export type AdType = 'banner' | 'interstitial' | 'native' | 'rewarded' | 'appOpen';

export type AdPosition = 
  | 'dashboard_bottom' 
  | 'feed_inline' 
  | 'navigation_break' 
  | 'perk_unlock'
  | 'list_middle'
  | 'content_end';

export interface FrequencyPolicy {
  /** Minimum seconds between ad shows */
  minInterval: number;
  /** Maximum ads per day */
  dailyLimit: number;
  /** Minimum app sessions before first show */
  minSessionsBeforeFirst?: number;
  /** Minimum items between native ads in feeds */
  feedItemInterval?: number;
  /** Whether user initiation is required */
  userInitiated?: boolean;
}

export interface AdPlacement {
  /** Unique placement key */
  key: string;
  /** Type of ad */
  type: AdType;
  /** Screen where this placement appears */
  screen: string;
  /** Position within the screen */
  position: AdPosition;
  /** Environment variable containing the ad unit ID */
  adUnitEnvVar: string;
  /** @deprecated Frequency control is handled by AdsContext RATE_LIMITS, not per-placement. */
  frequencyPolicy?: FrequencyPolicy;
  /** Contextual keywords for targeting */
  keywords: string[];
  /** Content rating requirements */
  contentRating: 'general' | 'parental' | 'educational';
  /** Human-readable description */
  description: string;
  /** Whether this placement is enabled by default */
  enabled: boolean;
}

export type AdEvent = 
  | 'load'
  | 'impression' 
  | 'click' 
  | 'dismiss' 
  | 'reward' 
  | 'error'
  | 'close';

export interface AdEventData {
  placement: string;
  adUnitId: string;
  timestamp: number;
  userId?: string;
  userRole?: string;
  subscriptionTier?: string;
  platform: string;
  networkState?: string;
  loadTimeMs?: number;
  errorMessage?: string;
  rewardType?: string;
  rewardAmount?: number;
}

export interface AdMetrics {
  impressions: number;
  clicks: number;
  clickThroughRate: number;
  revenue: number;
  errors: number;
  lastShown?: number;
  dailyCount: number;
  totalCount: number;
}

export interface AdFrequencyState {
  lastShown: number;
  dailyCount: number;
  totalCount: number;
  firstEligibleTime?: number;
}

export interface AdGatingContext {
  /** Is the platform Android? */
  isAndroid: boolean;
  /** Is the user eligible for ads? (parent role OR membership/organization user) */
  isParentRole: boolean;
  /** Is the user on free tier? */
  isFreeTier: boolean;
  /** Are ads globally enabled? */
  adsEnabled: boolean;
  /** Is the user online? */
  isOnline: boolean;
  /** Current screen name */
  currentScreen?: string;
  /** User session count */
  sessionCount?: number;
}

export interface AdRequestOptions {
  keywords?: string[];
  contentUrl?: string;
  nonPersonalizedAds?: boolean;
  childDirectedTreatment?: boolean;
  tagForChildDirectedTreatment?: boolean;
}

export interface AdReward {
  type: 'ai_tips' | 'pdf_export' | 'theme_unlock' | 'bonus_credits';
  amount: number;
  expiresAt: number;
  description: string;
}

export interface AdConfig {
  enabled: boolean;
  testIdsOnly: boolean;
  placements: Record<string, AdPlacement>;
  keywords: string[];
  contentRating: string;
  userConsent?: boolean;
}

export interface RemoteAdConfig {
  isEnabled: boolean;
  nativeEnabled: boolean;
  interstitialEnabled: boolean;
  rewardedEnabled: boolean;
  bannerEnabled: boolean;
  interstitialMinIntervalSec: number;
  interstitialDailyCap: number;
  nativeIntervalItems: number;
  keywords: string[];
  lastUpdatedAt: string;
  killSwitch: boolean;
}

export interface AdLoadState {
  isLoading: boolean;
  isLoaded: boolean;
  error?: string;
  loadStartTime?: number;
}

export interface AdProviderState {
  config: AdConfig;
  remoteConfig: RemoteAdConfig;
  frequencyStates: Record<string, AdFrequencyState>;
  metrics: Record<string, AdMetrics>;
  loadStates: Record<string, AdLoadState>;
  gatingContext: AdGatingContext;
}

export interface AdProviderMethods {
  canShow(placement: string): Promise<boolean>;
  recordImpression(placement: string): Promise<void>;
  recordClick(placement: string): Promise<void>;
  recordError(placement: string, error: string): Promise<void>;
  showInterstitial(placement: string): Promise<boolean>;
  showRewarded(placement: string): Promise<AdReward | null>;
  preloadAd(placement: string): Promise<void>;
  refreshRemoteConfig(): Promise<void>;
  getMetrics(placement?: string): AdMetrics | Record<string, AdMetrics>;
}