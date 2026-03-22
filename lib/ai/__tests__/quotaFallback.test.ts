import { getQuotaFallbackActions, shouldAutoDowngrade, isRewardedAdAvailable } from '../quotaFallback';
import type { SubscriptionTier } from '../models';

// Mock Platform.OS for rewarded ad availability check
jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

describe('quotaFallback', () => {
  describe('getQuotaFallbackActions', () => {
    it('offers model downgrade first for paid tier on non-Swift model', () => {
      const actions = getQuotaFallbackActions({
        tier: 'premium',
        currentModel: 'claude-sonnet-4-20250514',
        canShowRewardedAd: false,
        hasActiveExtension: false,
      });

      expect(actions[0].type).toBe('model_downgrade');
      if (actions[0].type === 'model_downgrade') {
        expect(actions[0].targetModel).toBe('claude-haiku-4-5-20251001');
      }
      expect(actions[actions.length - 1].type).toBe('upgrade');
    });

    it('skips downgrade for paid tier already on Swift', () => {
      const actions = getQuotaFallbackActions({
        tier: 'starter',
        currentModel: 'claude-haiku-4-5-20251001',
        canShowRewardedAd: false,
        hasActiveExtension: false,
      });

      expect(actions[0].type).toBe('upgrade');
      expect(actions).toHaveLength(1);
    });

    it('offers rewarded ad for free tier on Android', () => {
      const actions = getQuotaFallbackActions({
        tier: 'free',
        currentModel: 'claude-haiku-4-5-20251001',
        canShowRewardedAd: true,
        hasActiveExtension: false,
      });

      expect(actions[0].type).toBe('rewarded_ad');
      expect(actions[1].type).toBe('upgrade');
    });

    it('skips rewarded ad when extension is already active', () => {
      const actions = getQuotaFallbackActions({
        tier: 'free',
        currentModel: 'claude-haiku-4-5-20251001',
        canShowRewardedAd: true,
        hasActiveExtension: true,
      });

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe('upgrade');
    });

    it('skips rewarded ad when ads unavailable', () => {
      const actions = getQuotaFallbackActions({
        tier: 'free',
        currentModel: 'claude-haiku-4-5-20251001',
        canShowRewardedAd: false,
        hasActiveExtension: false,
      });

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe('upgrade');
    });

    it('offers downgrade for enterprise on Pro+ model (no upgrade — already highest tier)', () => {
      const actions = getQuotaFallbackActions({
        tier: 'enterprise',
        currentModel: 'claude-sonnet-4-5-20250514',
        canShowRewardedAd: false,
        hasActiveExtension: false,
      });

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe('model_downgrade');
    });
  });

  describe('shouldAutoDowngrade', () => {
    it('returns true for paid tier on non-Swift model', () => {
      expect(shouldAutoDowngrade('starter', 'claude-3-7-sonnet-20250219')).toBe(true);
      expect(shouldAutoDowngrade('premium', 'claude-sonnet-4-20250514')).toBe(true);
      expect(shouldAutoDowngrade('enterprise', 'claude-sonnet-4-5-20250514')).toBe(true);
    });

    it('returns false for paid tier already on Swift', () => {
      expect(shouldAutoDowngrade('starter', 'claude-haiku-4-5-20251001')).toBe(false);
    });

    it('returns false for free tier', () => {
      expect(shouldAutoDowngrade('free', 'claude-haiku-4-5-20251001')).toBe(false);
    });
  });

  describe('isRewardedAdAvailable', () => {
    it('returns true for free tier on Android', () => {
      expect(isRewardedAdAvailable('free')).toBe(true);
    });

    it('returns true for all tiers on Android (platform-only check)', () => {
      // isRewardedAdAvailable checks Platform.OS only, not tier
      expect(isRewardedAdAvailable('starter')).toBe(true);
      expect(isRewardedAdAvailable('premium')).toBe(true);
    });
  });
});
