/**
 * useRealtimeTier Hook
 * 
 * Provides real-time subscription updates by listening to user_ai_tiers
 * and user_ai_usage table changes via Supabase Realtime.
 * 
 * Complies with WARP.md:
 * - Hooks ≤200 lines
 * - Multi-tenant security with user_id scoping
 * - Analytics tracking for tier changes
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { assertSupabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { track } from '@/lib/analytics';
import { getQuotaStatus } from '@/lib/ai/api';
import { logger } from '@/lib/logger';
import { getTierDisplayName, normalizeTierName } from '@/lib/tiers';
import { resolveEffectiveTier } from '@/lib/tiers/resolveEffectiveTier';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export interface TierStatus {
  tier: string;
  tierDisplayName: string;
  isActive: boolean;
  expiresAt: string | null;
  quotaUsed: number;
  quotaLimit: number;
  quotaPercentage: number;
  lastUpdated: Date;
}

export interface UseRealtimeTierOptions {
  /** Enable real-time updates (default: true) */
  enabled?: boolean;
  /** Custom user ID (defaults to current auth user) */
  userId?: string;
  /** Callback when tier changes */
  onTierChange?: (newTier: string, oldTier: string) => void;
}

const normalizeTierForLimits = (tier: string): string => {
  const raw = String(tier || '').trim().toLowerCase();
  if (!raw) return 'free';
  try {
    return normalizeTierName(raw);
  } catch {
    return raw;
  }
};

const formatRealtimeTierName = (tier: string): string => {
  const raw = String(tier || '').trim();
  if (!raw) return 'Free';
  try {
    return getTierDisplayName(normalizeTierName(raw));
  } catch {
    const normalized = raw.toLowerCase().replace('-', '_');
    const names: Record<string, string> = {
      free: 'Free',
      parent_starter: 'Parent Starter',
      parent_plus: 'Parent Plus',
      starter: 'Starter',
      premium: 'Premium',
      pro: 'Pro',
      enterprise: 'Enterprise',
      school_starter: 'School Starter',
      school_premium: 'School Premium',
      school_pro: 'School Pro',
      teacher_starter: 'Teacher Starter',
      teacher_pro: 'Teacher Pro',
    };
    return names[normalized] || raw.charAt(0).toUpperCase() + raw.slice(1);
  }
};

/**
 * Hook for real-time tier status updates
 */
export function useRealtimeTier(options: UseRealtimeTierOptions = {}) {
  const { enabled = true, userId: customUserId, onTierChange } = options;
  const { user } = useAuth();
  const { tier: contextTier, refresh: refreshContext } = useSubscription();
  
  const userId = customUserId || user?.id;
  const [tierStatus, setTierStatus] = useState<TierStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const previousTierRef = useRef<string | null>(null);
  
  /**
   * Fetch current tier status from database
   */
  const fetchTierStatus = useCallback(async () => {
    if (!userId) return;
    
    try {
      const supabase = assertSupabase();
      
      // Fetch usage + tier in parallel to reduce latency
      const [usageResult, tierResult] = await Promise.all([
        supabase
          .from('user_ai_usage')
          .select('current_tier, chat_messages_today, chat_messages_this_month, exams_generated_this_month, last_monthly_reset_at')
          .eq('user_id', userId)
          .maybeSingle(),
        supabase
          .from('user_ai_tiers')
          .select('tier, expires_at, updated_at')
          .eq('user_id', userId)
          .maybeSingle(),
      ]);

      const usageData = usageResult.data;
      const usageError = usageResult.error;
      const tierData = tierResult.data;
      const tierError = tierResult.error;

      if (usageError) throw usageError;
      
      // Determine effective tier from all available sources.
      // We choose the highest capability-equivalent tier to avoid false "free"
      // displays when one source lags behind (common during tier propagation).
      const effectiveTier = resolveEffectiveTier({
        profileTier: contextTier,
        usageTier: usageData?.current_tier,
        candidates: [tierData?.tier],
      }).rawTier;
      
      // Get tier limits (daily chat quota)
      // Valid tiers: free, trial, parent_starter, parent_plus, teacher_starter, teacher_pro, 
      // school_starter, school_premium, school_pro, school_enterprise
      const normalizedTier = normalizeTierForLimits(effectiveTier);
      const { data: limitsData, error: limitsError } = await supabase
        .from('ai_usage_tiers')
        .select('chat_messages_per_day, chat_messages_per_month, exams_per_month, explanations_per_month')
        .eq('tier_name', normalizedTier)
        .eq('is_active', true)
        .maybeSingle();
      
      if (limitsError) {
        logger.warn('[RealtimeTier] Failed to fetch tier limits', { 
          tier: effectiveTier, 
          error: limitsError 
        });
      }

      const dailyLimit = limitsData?.chat_messages_per_day || 10;
      let quotaLimit = limitsData?.chat_messages_per_month || (dailyLimit * 30);
      let quotaUsed = (usageData?.chat_messages_this_month ?? usageData?.chat_messages_today) || 0;

      // Prefer authoritative quota from Edge Function (ai-usage) when available
      try {
        const quotaStatus = await getQuotaStatus(userId, 'chat_message');
        if (typeof quotaStatus?.limit === 'number') {
          quotaLimit = quotaStatus.limit;
        }
        if (typeof quotaStatus?.used === 'number') {
          quotaUsed = quotaStatus.used;
        }
      } catch (quotaErr) {
        console.warn('[useRealtimeTier] Quota status fallback to local counters:', quotaErr);
      }

      const normalizedUsed = quotaLimit > 0 ? Math.min(quotaUsed, quotaLimit) : quotaUsed;
      
      const newStatus: TierStatus = {
        tier: effectiveTier,
        tierDisplayName: formatRealtimeTierName(effectiveTier),
        isActive: !tierData?.expires_at || new Date(tierData.expires_at) > new Date(),
        expiresAt: tierData?.expires_at || null,
        quotaUsed: normalizedUsed,
        quotaLimit,
        quotaPercentage: quotaLimit > 0 ? (normalizedUsed / quotaLimit) * 100 : 0,
        lastUpdated: new Date(),
      };
      
      // Detect tier changes
      if (previousTierRef.current && previousTierRef.current !== effectiveTier) {
        track('edudash.subscription.tier_changed', {
          old_tier: previousTierRef.current,
          new_tier: effectiveTier,
          user_id: userId,
          source: 'realtime',
        });
        
        onTierChange?.(effectiveTier, previousTierRef.current);
      }
      
      previousTierRef.current = effectiveTier;
      setTierStatus(newStatus);
      setError(null);
      
    } catch (err) {
      console.error('[useRealtimeTier] Error fetching tier status:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch tier status'));
    } finally {
      setIsLoading(false);
    }
  }, [userId, contextTier, onTierChange]);
  
  /**
   * Set up real-time subscription
   */
  useEffect(() => {
    if (!enabled || !userId) return;
    
    // Initial fetch
    fetchTierStatus();
    
    // Set up real-time subscription
    const supabase = assertSupabase();
    
    const channel = supabase.channel(`tier-updates-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all changes
          schema: 'public',
          table: 'user_ai_usage',
          filter: `user_id=eq.${userId}`,
        },
        (payload: RealtimePostgresChangesPayload<any>) => {
          console.log('[useRealtimeTier] user_ai_usage change detected:', payload);
          fetchTierStatus();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_ai_tiers',
          filter: `user_id=eq.${userId}`,
        },
        (payload: RealtimePostgresChangesPayload<any>) => {
          console.log('[useRealtimeTier] user_ai_tiers change detected:', payload);
          fetchTierStatus();
          
          // Also refresh the subscription context
          refreshContext();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[useRealtimeTier] Realtime subscription active');
        } else if (status === 'CHANNEL_ERROR') {
          console.warn('[useRealtimeTier] Realtime subscription error');
          setError(new Error('Realtime subscription error'));
        }
      });
    
    channelRef.current = channel;
    
    // Cleanup
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [enabled, userId, fetchTierStatus, refreshContext]);
  
  /**
   * Manual refresh function
   */
  const refresh = useCallback(() => {
    setIsLoading(true);
    fetchTierStatus();
  }, [fetchTierStatus]);

  /**
   * Optimistic quota increment — call immediately when a message is sent
   * so the ring updates without waiting for the server round-trip.
   * The next `refresh()` (called 2s after response) will sync the real value.
   */
  const incrementQuota = useCallback((by: number) => {
    setTierStatus((prev) => {
      if (!prev) return prev;
      const newUsed = prev.quotaUsed + by;
      const cappedUsed = prev.quotaLimit > 0 ? Math.min(newUsed, prev.quotaLimit) : newUsed;
      return {
        ...prev,
        quotaUsed: cappedUsed,
        quotaPercentage: prev.quotaLimit > 0 ? (cappedUsed / prev.quotaLimit) * 100 : 0,
      };
    });
  }, []);

  return {
    tierStatus,
    isLoading,
    error,
    refresh,
    incrementQuota,
    tier: tierStatus?.tier || contextTier || 'free',
    tierDisplayName: tierStatus?.tierDisplayName || formatRealtimeTierName(contextTier || 'free'),
    isActive: tierStatus?.isActive ?? true,
    quotaPercentage: tierStatus?.quotaPercentage || 0,
  };
}

export default useRealtimeTier;
