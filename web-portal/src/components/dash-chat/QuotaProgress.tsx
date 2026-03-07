'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Sparkles, TrendingUp, Zap, Crown, Building2 } from 'lucide-react';
import { FeatureQuotaBar } from '@/components/ui/FeatureQuotaBar';

interface QuotaProgressProps {
  userId: string;
  refreshTrigger?: number; // Increment this to trigger a refresh
}

interface QuotaData {
  used: number;
  limit: number;
  tier: string;
  resetDate?: string;
  isInherited?: boolean;
  organizationName?: string;
}

export function QuotaProgress({ userId, refreshTrigger }: QuotaProgressProps) {
  const [quota, setQuota] = useState<QuotaData | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  // Map display tier to ai_usage_tiers tier_name
  const mapTierToDbTier = (tier: string, role?: string): string => {
    const tierLower = tier.toLowerCase().replace(/[\s-]/g, '_');
    const roleLower = String(role || '').toLowerCase();
    const scope = roleLower.includes('parent')
      ? 'parent'
      : roleLower.includes('teacher')
        ? 'teacher'
        : 'school';
    
    // If already in correct format (e.g., school_starter), return as-is
    if (tierLower.startsWith('school_') || tierLower.startsWith('parent_') || tierLower.startsWith('teacher_')) {
      return tierLower;
    }
    
    // Map simple tier names to full tier names based on context
    // For school/organization members, use school_ prefix
    if (tierLower === 'starter') return scope === 'parent' ? 'parent_starter' : `${scope}_starter`;
    if (tierLower === 'premium') return scope === 'parent' ? 'parent_plus' : scope === 'teacher' ? 'teacher_pro' : 'school_premium';
    if (tierLower === 'pro') return scope === 'parent' ? 'parent_plus' : scope === 'teacher' ? 'teacher_pro' : 'school_pro';
    if (tierLower === 'enterprise') return 'school_enterprise';
    if (tierLower === 'basic') return scope === 'parent' ? 'parent_starter' : `${scope}_starter`;
    if (tierLower === 'free') return 'free';
    if (tierLower === 'trial') return 'trial';
    
    return tierLower;
  };

  // Get realistic chat limits for tiers
  // DB now has proper values, but keep fallback for edge cases
  const getRealisticLimit = (tierName: string, dbLimit: number): number => {
    // DB values are now correct, use them directly
    // Only override if DB returns 0 or negative
    if (dbLimit > 0) {
      return dbLimit;
    }

    // Fallback defaults (shouldn't be needed with updated DB)
    const tierLower = tierName.toLowerCase();
    if (tierLower === 'school_enterprise') return -1; // Unlimited
    if (tierLower === 'school_pro') return 5000;
    if (tierLower === 'school_premium') return 2000;
    if (tierLower === 'school_starter') return 1000;
    if (tierLower === 'teacher_pro') return 2000;
    if (tierLower === 'teacher_starter') return 500;
    if (tierLower === 'parent_plus') return 1000;
    if (tierLower === 'parent_starter') return 200;
    if (tierLower.includes('trial')) return 50;
    return 20; // free
  };

  const fetchQuota = useCallback(async () => {
    if (!userId) return;

    try {
      // First, check if user belongs to an organization and get their inherited tier
      const { data: profile } = await supabase
        .from('profiles')
        .select(`
          role,
          preschool_id,
          subscription_tier,
          preschool:preschools!preschool_id (
            id,
            name,
            subscription_tier
          )
        `)
        .eq('id', userId)
        .single();

      // Determine effective tier - organization tier takes precedence for affiliated users
      let effectiveTier = 'free';
      let displayTier = 'free';
      let isInherited = false;
      let organizationName: string | undefined;

      if (profile?.preschool && profile.preschool.subscription_tier) {
        // User is affiliated with an organization - inherit their tier
        displayTier = profile.preschool.subscription_tier;
        effectiveTier = mapTierToDbTier(displayTier, profile.role);
        isInherited = true;
        organizationName = profile.preschool.name;
      } else if (profile?.subscription_tier) {
        // User has their own subscription tier
        displayTier = profile.subscription_tier;
        effectiveTier = mapTierToDbTier(displayTier, profile.role);
      }

      // Get the tier limits directly from ai_usage_tiers
      const { data: tierLimits } = await supabase
        .from('ai_usage_tiers')
        .select('chat_messages_per_day, chat_messages_per_month, exams_per_month, explanations_per_month')
        .eq('tier_name', effectiveTier)
        .eq('is_active', true)
        .single();

      // Get current usage
      const { data: usage } = await supabase
        .from('user_ai_usage')
        .select('chat_messages_today, chat_messages_this_month')
        .eq('user_id', userId)
        .single();

      const dbLimit = tierLimits?.chat_messages_per_month || ((tierLimits?.chat_messages_per_day || 10) * 30);
      // Apply realistic limits (handles cases where DB has placeholder values like 999999)
      const limit = getRealisticLimit(effectiveTier, dbLimit);
      const used = usage?.chat_messages_this_month ?? usage?.chat_messages_today ?? 0;

      setQuota({
        used,
        limit,
        tier: displayTier,
        isInherited,
        organizationName,
      });
    } catch (error) {
      console.error('[QuotaProgress] Error:', error);
    } finally {
      setLoading(false);
    }
  }, [supabase, userId]);

  useEffect(() => {
    void fetchQuota();
  }, [fetchQuota, refreshTrigger]); // Re-fetch when refreshTrigger changes

  if (loading || !quota) return null;

  // Enterprise tier (999999 or -1) is unlimited
  const isUnlimited = quota.limit === -1 || quota.limit >= 999999;
  const percentage = !isUnlimited && quota.limit > 0 ? Math.min((quota.used / quota.limit) * 100, 100) : 0;
  const remaining = !isUnlimited ? Math.max(0, quota.limit - quota.used) : Infinity;
  const isLow = !isUnlimited && percentage > 80;
  const isExceeded = !isUnlimited && quota.used >= quota.limit;

  // Get tier display info
  const getTierInfo = (tier: string) => {
    const tierLower = tier.toLowerCase();
    if (tierLower.includes('premium') || tierLower.includes('pro') || tierLower.includes('enterprise')) {
      return { icon: Crown, color: 'from-amber-400 to-orange-500', badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30' };
    }
    if (tierLower.includes('basic') || tierLower.includes('starter')) {
      return { icon: Zap, color: 'from-blue-400 to-cyan-500', badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30' };
    }
    return { icon: Sparkles, color: 'from-purple-400 to-pink-500', badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30' };
  };

  const tierInfo = getTierInfo(quota.tier);
  const TierIcon = tierInfo.icon;

  return (
    <div className="px-3 sm:px-4 py-2 bg-gray-900/80 border-b border-gray-800/50 backdrop-blur-sm">
      <div className="max-w-4xl mx-auto flex items-center gap-2 sm:gap-3">
        {/* Organization Badge (if inherited) */}
        {quota.isInherited && quota.organizationName && (
          <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full bg-gray-800/50 border border-gray-700/50 text-xs text-gray-400">
            <Building2 className="w-3 h-3" />
            <span className="truncate max-w-[100px]">{quota.organizationName}</span>
          </div>
        )}

        {/* Tier Badge */}
        <div className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-full border text-[10px] sm:text-xs font-semibold ${tierInfo.badge}`}>
          <TierIcon className="w-3 h-3" />
          <span className="capitalize">{quota.tier.replace(/_/g, ' ')}</span>
        </div>

        {/* Progress Bar or Unlimited indicator */}
        {isUnlimited ? (
          <div className="flex-1 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-gradient-to-r from-blue-500/30 via-cyan-500/30 to-blue-500/30 rounded-full" />
            <span className="text-[10px] sm:text-xs font-medium text-cyan-400 whitespace-nowrap">
              ✨ Unlimited
            </span>
          </div>
        ) : (
          <div className="flex-1">
            <FeatureQuotaBar
              feature="chat messages"
              used={quota.used}
              limit={quota.limit}
              remaining={remaining}
              periodLabel="month"
            />
          </div>
        )}

        {/* Upgrade hint for low/exceeded (only for limited tiers) */}
        {!isUnlimited && (isExceeded || isLow) && (
          <button className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xs font-semibold hover:opacity-90 transition-opacity">
            <TrendingUp className="w-3 h-3" />
            <span>Upgrade</span>
          </button>
        )}
      </div>
    </div>
  );
}
