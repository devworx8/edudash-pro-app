'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Crown, Sparkles } from 'lucide-react';

interface TierBadgeProps {
  userId?: string;
  preschoolId?: string;
  size?: 'sm' | 'md' | 'lg';
  showUpgrade?: boolean;
}

type TierMeta = {
  label: string;
  color: string;
  icon: typeof Crown | typeof Sparkles;
};

function getTierMeta(tier?: string): TierMeta {
  const t = String(tier || 'free').toLowerCase();
  switch (t) {
    case 'starter':
    case 'school_starter':
      return { label: 'Starter', color: '#059669', icon: Sparkles };
    case 'premium':
    case 'school_premium':
      return { label: 'Premium', color: '#7C3AED', icon: Crown };
    case 'school_pro':
    case 'pro':
    case 'professional':
      return { label: 'Pro', color: '#6366F1', icon: Crown };
    case 'enterprise':
    case 'school_enterprise':
      return { label: 'Enterprise', color: '#DC2626', icon: Crown };
    case 'parent-starter':
    case 'parent_starter':
      return { label: 'Parent Starter', color: '#06B6D4', icon: Sparkles };
    case 'parent-plus':
    case 'parent_plus':
      return { label: 'Parent Plus', color: '#22C55E', icon: Crown };
    case 'free':
    default:
      return { label: 'Free', color: '#6B7280', icon: Sparkles };
  }
}

export function TierBadge({ userId, preschoolId, size = 'md', showUpgrade = false }: TierBadgeProps) {
  const [tier, setTier] = useState<string>('free');
  const [isVirtualSchool, setIsVirtualSchool] = useState(false);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    if (!userId && !preschoolId) return;

    const loadTier = async () => {
      try {
        // Prefer direct school lookup
        let schoolId = preschoolId;

        if (!schoolId && userId) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('preschool_id')
            .eq('id', userId)
            .maybeSingle();
          schoolId = profile?.preschool_id || undefined;
        }

        if (!schoolId) {
          setTier('free');
          return;
        }

        // Check if this is the EduDash Pro Community School
        const COMMUNITY_SCHOOL_ID = '00000000-0000-0000-0000-000000000001';
        if (schoolId === COMMUNITY_SCHOOL_ID) {
          setIsVirtualSchool(true);
          setTier('enterprise'); // Has enterprise access but shows as virtual school
          return;
        }

        // Fetch plan info from preschools (more stable across schemas)
        // Try both subscription_plan and subscription_tier for compatibility
        const { data: school } = await supabase
          .from('preschools')
          .select('subscription_plan, subscription_tier')
          .eq('id', schoolId)
          .maybeSingle();

        // Use subscription_tier first (newer), fall back to subscription_plan, default to free
        const plan = (school?.subscription_tier || school?.subscription_plan as string | null) || 'free';
        setTier(plan);
      } catch (error) {
        console.error('Error loading tier:', error);
      } finally {
        setLoading(false);
      }
    };

    loadTier();
  }, [userId, preschoolId, supabase]);

  const meta = isVirtualSchool 
    ? { label: 'Virtual School', color: '#8B5CF6', icon: Sparkles }
    : getTierMeta(tier);
  const Icon = meta.icon;

  const sizeMap = {
    sm: { height: 22, fontSize: 11, iconSize: 12, padding: '4px 10px' },
    md: { height: 26, fontSize: 12, iconSize: 14, padding: '6px 12px' },
    lg: { height: 32, fontSize: 14, iconSize: 16, padding: '8px 16px' },
  };

  const sizing = sizeMap[size];
  const isPremium = tier !== 'free' || isVirtualSchool;

  if (loading) {
    return (
      <div
        style={{
          height: sizing.height,
          padding: sizing.padding,
          borderRadius: 999,
          background: '#6B7280',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span style={{ fontSize: sizing.fontSize, fontWeight: 700, color: 'white' }}>...</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          height: sizing.height,
          padding: sizing.padding,
          borderRadius: 999,
          background: isPremium
            ? `linear-gradient(135deg, ${meta.color}dd, ${meta.color}88)`
            : meta.color,
          border: `1px solid ${meta.color}`,
          boxShadow: isPremium ? `0 0 12px ${meta.color}66` : 'none',
          animation: isPremium ? 'pulse 2s ease-in-out infinite' : 'none',
        }}
      >
        <Icon size={sizing.iconSize} style={{ color: 'white' }} />
        <span
          style={{
            fontSize: sizing.fontSize,
            fontWeight: 900,
            color: 'white',
            textTransform: 'uppercase',
            letterSpacing: 0.6,
            textShadow: `0 0 8px ${meta.color}`,
          }}
        >
          {meta.label}
        </span>
      </div>

      {showUpgrade && tier === 'free' && !isVirtualSchool && (
        <button
          className="btn"
          style={{
            height: sizing.height,
            padding: '0 12px',
            fontSize: sizing.fontSize - 1,
            background: 'linear-gradient(135deg, #7C3AED, #A855F7)',
            color: 'white',
            border: 'none',
            fontWeight: 600,
          }}
          onClick={() => {
            router.push('/pricing');
          }}
        >
          Upgrade
        </button>
      )}

      <style jsx>{`
        @keyframes pulse {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.05);
            opacity: 0.9;
          }
        }
      `}</style>
    </div>
  );
}
