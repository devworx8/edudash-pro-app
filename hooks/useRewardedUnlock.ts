/**
 * useRewardedUnlock
 *
 * Convenience hook that wraps AdsContext.offerRewarded() with feature
 * gating logic. Used by screens to gate premium features behind a
 * rewarded ad for free-tier users.
 *
 * Usage:
 *   const { canUnlock, unlock, unlocked } = useRewardedUnlock('ai_preview');
 *   if (!unlocked) return <PremiumFeatureBanner onRewardedUnlock={unlock} />;
 *
 * ≤200 lines per WARP.md
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Platform } from 'react-native';
import { useAds } from '@/contexts/AdsContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { logger } from '@/lib/logger';

// ─── Types ───────────────────────────────────────────────────────────────────

export type RewardTag =
  | 'ai_preview'
  | 'homework_help'
  | 'tutor_session'
  | 'lesson_preview'
  | 'parent_perks'
  | 'report_download';

interface UseRewardedUnlockResult {
  /** Whether the rewarded ad flow is available (free tier + Android + ads ready) */
  canUnlock: boolean;
  /** Whether the feature has been unlocked via reward this session */
  unlocked: boolean;
  /** Trigger the rewarded ad flow; resolves true if reward was granted */
  unlock: () => Promise<boolean>;
  /** Reset the unlock state (e.g., on screen unmount) */
  resetUnlock: () => void;
  /** Whether the ad is currently loading/showing */
  loading: boolean;
}

// Unlock duration: reward lasts 30 minutes per session
const UNLOCK_DURATION_MS = 30 * 60 * 1000;

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useRewardedUnlock(tag: RewardTag): UseRewardedUnlockResult {
  const { canShowBanner, offerRewarded } = useAds();
  const { tier } = useSubscription();
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const unlockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isFree = tier === 'free' || tier === 'trial';
  const canUnlock =
    isFree && canShowBanner && Platform.OS === 'android' && !unlocked;

  const unlock = useCallback(async (): Promise<boolean> => {
    if (unlocked) return true;
    if (!canUnlock) return false;

    setLoading(true);
    try {
      const result = await offerRewarded(tag);
      if (result.rewarded) {
        setUnlocked(true);

        // Auto-expire after duration
        if (unlockTimer.current) clearTimeout(unlockTimer.current);
        unlockTimer.current = setTimeout(() => {
          setUnlocked(false);
        }, UNLOCK_DURATION_MS);

        logger.info('[useRewardedUnlock] Feature unlocked', { tag });
        return true;
      }
      return false;
    } catch (err) {
      logger.error('[useRewardedUnlock] Ad flow failed', { tag, error: err });
      return false;
    } finally {
      setLoading(false);
    }
  }, [unlocked, canUnlock, offerRewarded, tag]);

  const resetUnlock = useCallback(() => {
    setUnlocked(false);
    if (unlockTimer.current) clearTimeout(unlockTimer.current);
  }, []);

  // Clean up timer on unmount to prevent setState on unmounted component
  useEffect(() => {
    return () => {
      if (unlockTimer.current) clearTimeout(unlockTimer.current);
    };
  }, []);

  return { canUnlock, unlocked, unlock, resetUnlock, loading };
}
