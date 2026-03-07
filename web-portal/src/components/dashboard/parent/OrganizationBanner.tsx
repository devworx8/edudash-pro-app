'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Crown, Sparkles } from 'lucide-react';

interface OrganizationBannerProps {
  hasOrganization: boolean;
  preschoolName?: string;
  userId?: string;
}

export function OrganizationBanner({
  hasOrganization,
  preschoolName,
  userId
}: OrganizationBannerProps) {
  const router = useRouter();
  const supabase = createClient();
  const [isCommunitySchool, setIsCommunitySchool] = useState(false);
  const [parentTierInfo, setParentTierInfo] = useState<{ label: string; color: string } | null>(null);

  useEffect(() => {
    if (!userId) return;

    const checkParentStatus = async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('preschool_id, is_trial, trial_ends_at, subscription_tier')
        .eq('id', userId)
        .maybeSingle();

      const COMMUNITY_SCHOOL_ID = '00000000-0000-0000-0000-000000000001';
      setIsCommunitySchool(profile?.preschool_id === COMMUNITY_SCHOOL_ID);

      // Determine parent's tier/trial status
      if (profile?.is_trial && profile.trial_ends_at) {
        const trialEnd = new Date(profile.trial_ends_at);
        const now = new Date();
        if (trialEnd > now) {
          const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          setParentTierInfo({ 
            label: `Parent Plus Trial (${daysLeft}d)`, 
            color: '#7C3AED' 
          });
          return;
        }
      }

      // Show subscription tier if not on trial
      const tier = profile?.subscription_tier || 'free';
      const tierLabels: Record<string, { label: string; color: string }> = {
        parent_plus: { label: 'Parent Plus', color: '#7C3AED' },
        parent_starter: { label: 'Parent Starter', color: '#059669' },
        premium: { label: 'Parent Plus', color: '#7C3AED' }, // Legacy support
        basic: { label: 'Parent Starter', color: '#059669' }, // Legacy support
        free: { label: 'Free', color: '#6B7280' },
      };
      setParentTierInfo(tierLabels[tier] || tierLabels.free);
    };

    checkParentStatus();
  }, [userId, supabase]);

  // Don't render if no organization OR no preschool name
  if (!hasOrganization || !preschoolName) {
    return null;
  }

  return (
    <div
      className="card"
      style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        marginBottom: 12,
        cursor: isCommunitySchool ? 'default' : 'pointer',
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        flexWrap: 'wrap'
      }}
      onClick={() => {
        if (!isCommunitySchool) {
          router.push('/dashboard/parent/preschool');
        }
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>🏫</span>
        <span style={{
          fontSize: 13,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}>
          {preschoolName}
        </span>
      </div>
      {parentTierInfo && !isCommunitySchool && (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 6,
          padding: '4px 12px',
          borderRadius: 20,
          background: 'rgba(255, 255, 255, 0.25)',
          backdropFilter: 'blur(10px)',
          flexShrink: 0
        }}>
          {parentTierInfo.label.includes('Trial') ? (
            <Sparkles size={14} style={{ color: '#FCD34D' }} />
          ) : (
            <Crown size={14} style={{ color: parentTierInfo.color }} />
          )}
          <span style={{ 
            fontSize: 11, 
            fontWeight: 700, 
            color: 'white',
            whiteSpace: 'nowrap'
          }}>
            {parentTierInfo.label}
          </span>
        </div>
      )}
    </div>
  );
}
