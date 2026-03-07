'use client';

import { useQuotaCheck } from '@/hooks/useQuotaCheck';
import { useEffect, useState } from 'react';
import { TrendingUp, MessageSquare, FileText, HelpCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { FeatureQuotaBar } from '@/components/ui/FeatureQuotaBar';

interface QuotaCardProps {
  userId: string;
}

interface TierLimits {
  exams_per_month: number;
  explanations_per_month: number;
  chat_messages_per_month: number;
}

// Tier limits from database configuration (aligned with tier_name_aligned enum)
const TIER_LIMITS: Record<string, TierLimits> = {
  free: {
    exams_per_month: 70, // 10 per week × 7 days/week × 4 weeks ≈ 70/month
    explanations_per_month: 1500, // 50 per day × 30 days
    chat_messages_per_month: 300,
  },
  trial: {
    exams_per_month: 10,
    explanations_per_month: 20,
    chat_messages_per_month: 1500,
  },
  parent_starter: {
    exams_per_month: 30,
    explanations_per_month: 100,
    chat_messages_per_month: 6000,
  },
  parent_plus: {
    exams_per_month: 100,
    explanations_per_month: 500,
    chat_messages_per_month: 30000,
  },
  teacher_starter: {
    exams_per_month: 50,
    explanations_per_month: 200,
    chat_messages_per_month: 9000,
  },
  teacher_pro: {
    exams_per_month: 200,
    explanations_per_month: 1000,
    chat_messages_per_month: 60000,
  },
  school_starter: {
    exams_per_month: 500,
    explanations_per_month: 2000,
    chat_messages_per_month: 150000,
  },
  school_premium: {
    exams_per_month: 2000,
    explanations_per_month: 10000,
    chat_messages_per_month: 600000,
  },
  school_pro: {
    exams_per_month: 999999,
    explanations_per_month: 999999,
    chat_messages_per_month: 999999,
  },
  school_enterprise: {
    exams_per_month: 999999,
    explanations_per_month: 999999,
    chat_messages_per_month: 999999,
  },
};

export function QuotaCard({ userId }: QuotaCardProps) {
  const { usage, loading, refreshUsage } = useQuotaCheck(userId);
  const [limits, setLimits] = useState<TierLimits | null>(null);
  const [schoolType, setSchoolType] = useState<'preschool' | 'k12' | 'unknown'>('preschool');
  const supabase = createClient();

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const resolveSchoolType = async () => {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, preschool_id, organization_id, school_type')
          .eq('id', userId)
          .maybeSingle();

        const profileSchoolType = profile?.school_type;
        if (profileSchoolType && !cancelled) {
          const normalized = String(profileSchoolType).toLowerCase();
          setSchoolType(normalized.includes('k12') ? 'k12' : 'preschool');
          return;
        }

        const schoolId = profile?.preschool_id || profile?.organization_id;
        if (!schoolId) {
          if (!cancelled) setSchoolType('preschool');
          return;
        }

        const { data: preschool } = await supabase
          .from('preschools')
          .select('id, school_type, type')
          .eq('id', schoolId)
          .maybeSingle();

        if (preschool?.school_type || preschool?.type) {
          const normalized = String(preschool.school_type || preschool.type).toLowerCase();
          if (!cancelled) setSchoolType(normalized.includes('k12') ? 'k12' : 'preschool');
          return;
        }

        const { data: org } = await supabase
          .from('organizations')
          .select('id, school_type, organization_type, type')
          .eq('id', schoolId)
          .maybeSingle();

        const orgType = org?.school_type || org?.organization_type || org?.type;
        if (!cancelled) {
          const normalized = String(orgType || 'preschool').toLowerCase();
          setSchoolType(normalized.includes('k12') ? 'k12' : 'preschool');
        }
      } catch {
        if (!cancelled) setSchoolType('preschool');
      }
    };

    resolveSchoolType();
    return () => {
      cancelled = true;
    };
  }, [userId, supabase]);

  useEffect(() => {
    // Default to 'free' tier if no tier is detected
    const tier = usage?.current_tier?.toLowerCase() || 'free';
    const tierLimits = TIER_LIMITS[tier] || TIER_LIMITS.free;
    setLimits(tierLimits);
  }, [usage?.current_tier]);

  if (loading) {
    return (
      <div className="card" style={{ padding: 'var(--space-4)' }}>
        <div className="loading-skeleton" style={{ height: 200 }} />
      </div>
    );
  }

  // If no usage data exists yet, default to free tier
  if (!usage) {
    const freeLimits = TIER_LIMITS.free;
    const isPreschool = schoolType !== 'k12';
    return (
      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp size={20} style={{ color: 'var(--primary)' }} />
            AI Usage
          </h3>
          <span 
            className="badge" 
            style={{ 
              textTransform: 'capitalize',
              fontSize: 12,
              backgroundColor: '#6b7280',
              color: 'white',
              padding: '4px 12px',
              borderRadius: 12
            }}
          >
            Free Plan
          </span>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', fontSize: 14, color: 'var(--text-muted)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <FileText size={16} style={{ color: '#3b82f6' }} />
            <span>
              {isPreschool
                ? `${freeLimits.exams_per_month} activities/month (10/week) • ad-supported`
                : `${freeLimits.exams_per_month} exams/month (10/week) • ad-supported`}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <HelpCircle size={16} style={{ color: '#8b5cf6' }} />
            <span>
              {isPreschool
                ? `${freeLimits.explanations_per_month} learning tips/month (50/day) • ad-supported`
                : `${freeLimits.explanations_per_month} explanations/month (50/day) • ad-supported`}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <MessageSquare size={16} style={{ color: '#10b981' }} />
            <span>{freeLimits.chat_messages_per_month} chat messages per month</span>
          </div>
        </div>
        
        <div 
          style={{
            marginTop: 'var(--space-4)',
            padding: 'var(--space-3)',
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          <p style={{ margin: '0 0 var(--space-2) 0', color: 'var(--text-muted)' }}>
            💡 Start using AI features and upgrade anytime for higher limits.
          </p>
          <a 
            href="/dashboard/parent/subscription" 
            className="btn btn-primary"
            style={{
              fontSize: 12,
              padding: '8px 16px',
              width: '100%',
              textAlign: 'center',
              textDecoration: 'none',
              display: 'block',
              cursor: 'pointer',
              backgroundColor: 'var(--accent)',
              color: 'white',
              borderRadius: 6,
              fontWeight: 500,
            }}
          >
            View Plans
          </a>
        </div>
      </div>
    );
  }
  
  if (!limits) {
    return (
      <div className="card" style={{ padding: 'var(--space-4)' }}>
        <div className="loading-skeleton" style={{ height: 200 }} />
      </div>
    );
  }

  const isUnlimited = usage?.current_tier && ['school_starter', 'school_premium', 'school_pro', 'school_enterprise'].includes(usage.current_tier.toLowerCase());
  const isHighestTier = usage?.current_tier && ['parent_plus', 'school_starter', 'school_premium', 'school_pro', 'school_enterprise'].includes(usage.current_tier.toLowerCase());
  const isPreschool = schoolType !== 'k12';

  const quotaItems = [
    {
      icon: FileText,
      label: isPreschool ? 'Activities Generated' : 'Exams Generated',
      used: usage.exams_generated_this_month,
      limit: limits.exams_per_month,
      period: 'this month',
      color: '#3b82f6',
    },
    {
      icon: HelpCircle,
      label: isPreschool ? 'Learning Tips' : 'Explanations',
      used: usage.explanations_requested_this_month,
      limit: limits.explanations_per_month,
      period: 'this month',
      color: '#8b5cf6',
    },
    {
      icon: MessageSquare,
      label: 'Chat Messages',
      used: usage.chat_messages_this_month ?? usage.chat_messages_today,
      limit: limits.chat_messages_per_month,
      period: 'this month',
      color: '#10b981',
    },
  ];

  const getPercentage = (used: number, limit: number) => {
    if (isUnlimited) return 0;
    return Math.min((used / limit) * 100, 100);
  };

  const getStatusColor = (percentage: number) => {
    if (percentage >= 90) return '#ef4444'; // red
    if (percentage >= 70) return '#f59e0b'; // orange
    return '#10b981'; // green
  };

  return (
    <div className="card" style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <TrendingUp size={20} style={{ color: 'var(--primary)' }} />
          AI Usage
        </h3>
        <span 
          className="badge" 
          style={{ 
            textTransform: 'capitalize',
            fontSize: 12,
            background: 'var(--primary)',
            color: 'white',
            padding: '4px 12px',
            borderRadius: '12px'
          }}
        >
          {usage.current_tier} Plan
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {quotaItems.map((item) => {
          const percentage = getPercentage(item.used, item.limit);
          const statusColor = getStatusColor(percentage);
          const Icon = item.icon;

          return (
            <div key={item.label}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <Icon size={16} style={{ color: item.color }} />
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{item.label}</span>
                </div>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {isUnlimited ? (
                    <span style={{ color: item.color, fontWeight: 600 }}>Unlimited</span>
                  ) : (
                    <>
                      <strong style={{ color: statusColor }}>{item.used}</strong> / {item.limit} {item.period}
                    </>
                  )}
                </span>
              </div>
              
              <FeatureQuotaBar
                feature={item.label}
                used={item.used}
                limit={isUnlimited ? -1 : item.limit}
                remaining={isUnlimited ? Number.POSITIVE_INFINITY : Math.max(0, item.limit - item.used)}
                periodLabel={item.period === 'this month' ? 'month' : item.period}
              />
            </div>
          );
        })}
      </div>

      {!isUnlimited && !isHighestTier && (
        <div 
          style={{
            marginTop: 'var(--space-4)',
            padding: 'var(--space-3)',
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: 8,
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
          }}
        >
          <p style={{ margin: 0, color: 'var(--text-muted)', flex: 1 }}>
            💡 Need more? <a 
              href="/dashboard/parent/subscription" 
              style={{ 
                color: '#3b82f6', 
                fontWeight: 600,
                textDecoration: 'underline',
                cursor: 'pointer'
              }}
            >
              Upgrade your plan
            </a> for higher limits and priority support.
          </p>
          <a 
            href="/dashboard/parent/subscription" 
            className="btn btn-primary"
            style={{
              fontSize: 12,
              padding: '6px 16px',
              whiteSpace: 'nowrap',
              textDecoration: 'none',
              cursor: 'pointer',
              backgroundColor: 'var(--accent)',
              color: 'white',
              borderRadius: 6,
              fontWeight: 500,
              transition: 'opacity 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            Upgrade
          </a>
        </div>
      )}

      <button
        onClick={refreshUsage}
        className="btn btn-ghost"
        style={{ marginTop: 'var(--space-3)', width: '100%', fontSize: 13 }}
      >
        Refresh Usage
      </button>
    </div>
  );
}
