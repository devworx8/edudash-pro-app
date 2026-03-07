import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface TierUpdateData {
  tier: string;
  updated_at: string;
}

/**
 * Hook to listen for real-time tier updates
 * Useful for detecting when a payment completes and tier changes
 */
export function useTierUpdates(userId: string | undefined, onTierChange?: (newTier: string) => void) {
  const [currentTier, setCurrentTier] = useState<string>('free');
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    let channel: RealtimeChannel | null = null;

    const setupRealtimeSubscription = async () => {
      // First, try to fetch from user_ai_tiers (may not exist for community users)
      const { data, error } = await supabase
        .from('user_ai_tiers')
        .select('tier')
        .eq('user_id', userId)
        .single();

      // Silently ignore errors for community users (table may not exist or be accessible)
      // Only log unexpected errors (not 400/404/406/PGRST116)
      if (error) {
        const isExpectedError = 
          error.code === 'PGRST116' || // Not found
          error.code === 'PGRST204' || // Column not found
          error.message?.includes('relation "user_ai_tiers" does not exist') ||
          error.message?.includes('406') || // Not acceptable
          error.message?.includes('400');
        
        if (!isExpectedError) {
          console.error('[TierUpdates] Unexpected error fetching tier:', error);
        }
      }
      
      if (data && data.tier) {
        setCurrentTier(data.tier);
      } else {
        // Fallback: check profile for trial or subscription tier
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_trial, trial_plan_tier, subscription_tier')
          .eq('id', userId)
          .single();
        
        if (profile) {
          if (profile.is_trial && profile.trial_plan_tier) {
            setCurrentTier(profile.trial_plan_tier);
          } else if (profile.subscription_tier) {
            setCurrentTier(profile.subscription_tier);
          } else {
            setCurrentTier('free');
          }
        }
      }

      setLoading(false);

      // Subscribe to changes
      channel = supabase
        .channel(`tier-updates-${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'user_ai_tiers',
            filter: `user_id=eq.${userId}`,
          },
          (payload: any) => {
            console.log('[TierUpdates] Tier changed:', payload);
            const newTier = (payload.new as TierUpdateData).tier;
            setCurrentTier(newTier);
            
            // Notify callback
            if (onTierChange) {
              onTierChange(newTier);
            }

            // Show toast notification
            if (typeof window !== 'undefined') {
              const tierNames: Record<string, string> = {
                free: 'Free',
                trial: '7-Day Trial',
                basic: 'Parent Starter',
                premium: 'Parent Plus',
                school: 'School Plan',
              };
              
              const tierName = tierNames[newTier] || newTier;
              console.log(`🎉 Tier upgraded to ${tierName}!`);
              
              // You can replace this with a toast library later
              alert(`🎉 Your plan has been upgraded to ${tierName}! Enjoy your new features.`);
            }
          }
        )
        .subscribe();
    };

    setupRealtimeSubscription();

    // Cleanup
    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [userId, onTierChange, supabase]);

  return { currentTier, loading };
}
