'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useParentDashboardData } from '@/lib/hooks/useParentDashboardData';
import { useQuotaCheck } from '@/hooks/useQuotaCheck';
import { useTierUpdates } from '@/hooks/useTierUpdates';
import { ParentShell } from '@/components/dashboard/parent/ParentShell';
import {
  Crown,
  Zap,
  TrendingUp,
  Calendar,
  CreditCard,
  ArrowUpCircle,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronRight,
  Sparkles,
  Users,
  School,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Subscription {
  id: string;
  user_id: string;
  tier: string;
  status: string;
  created_at: string;
  updated_at: string;
  payment_reference?: string;
  amount_paid?: number;
}

interface TierInfo {
  name: string;
  displayName: string;
  price: number;
  color: string;
  icon: any;
  features: string[];
  limits: {
    exams: number;
    explanations: number;
    chat: number;
  };
}

const TIER_INFO: Record<string, TierInfo> = {
  free: {
    name: 'free',
    displayName: 'Free',
    price: 0,
    color: '#6b7280',
    icon: Users,
    features: [
      '5 exams per month',
      '5 explanations per month',
      '10 chat messages per day',
      'CAPS curriculum aligned',
      'Basic support',
    ],
    limits: { exams: 5, explanations: 5, chat: 10 },
  },
  trial: {
    name: 'trial',
    displayName: '7-Day Trial',
    price: 0,
    color: '#f59e0b',
    icon: Sparkles,
    features: [
      '20 exams per month',
      '20 explanations per month',
      '50 chat messages per day',
      'All CAPS subjects',
      'Priority support',
      'No credit card required',
    ],
    limits: { exams: 20, explanations: 20, chat: 50 },
  },
  parent_starter: {
    name: 'parent_starter',
    displayName: 'Parent Starter',
    price: 99,
    color: '#3b82f6',
    icon: Zap,
    features: [
      '30 Homework Helper/month',
      'AI lesson support',
      'Child-safe explanations',
      'Progress tracking',
      'Email support',
    ],
    limits: { exams: 30, explanations: 30, chat: 100 },
  },
  parent_plus: {
    name: 'parent_plus',
    displayName: 'Parent Plus',
    price: 199,
    color: '#8b5cf6',
    icon: Crown,
    features: [
      '100 Homework Helper/month',
      'Priority processing',
      'Up to 3 children',
      'Advanced learning insights',
      'Priority support',
      'WhatsApp Connect',
      'Learning Resources',
      'Progress Analytics',
    ],
    limits: { exams: 100, explanations: 100, chat: 999999 },
  },
  school: {
    name: 'school',
    displayName: 'School Plan',
    price: 999,
    color: '#10b981',
    icon: School,
    features: [
      'Unlimited everything',
      'Multi-tenant management',
      'Teacher dashboards',
      'Class analytics',
      'Bulk student import',
      'Custom branding',
      'API access',
      'Dedicated support',
    ],
    limits: { exams: 999999, explanations: 999999, chat: 999999 },
  },
};

function SubscriptionPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const { userId, userName, hasOrganization, tenantSlug } = useParentDashboardData();
  const { usage, refreshUsage } = useQuotaCheck(userId || undefined);
  
  const [currentTier, setCurrentTier] = useState<string>('free');
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentAlert, setPaymentAlert] = useState<{type: 'success' | 'error' | 'info', message: string} | null>(null);

  // Use custom hook for tier updates
  useTierUpdates(userId || undefined, (newTier) => {
    console.log('[Subscription] Tier updated via realtime:', newTier);
    setCurrentTier(newTier);
  });

  // Handle payment status from URL params
  useEffect(() => {
    const paymentStatus = searchParams.get('payment');
    if (paymentStatus === 'success') {
      setPaymentAlert({
        type: 'success',
        message: 'Payment successful! Your subscription is being activated. Please allow a few moments for the update.'
      });
      // Refresh tier data after successful payment
      if (userId) {
        loadSubscriptionData();
        refreshUsage();
      }
      // Clear URL params after showing message
      const timer = setTimeout(() => {
        router.replace('/dashboard/parent/subscription');
      }, 100);
      return () => clearTimeout(timer);
    } else if (paymentStatus === 'cancelled') {
      setPaymentAlert({
        type: 'error',
        message: 'Payment was cancelled. Your subscription has not been changed.'
      });
      // Clear URL params
      const timer = setTimeout(() => {
        router.replace('/dashboard/parent/subscription');
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [searchParams, router, userId]);

  useEffect(() => {
    if (userId) {
      loadSubscriptionData();
      refreshUsage();
    }
  }, [userId]);

  const loadSubscriptionData = async () => {
    if (!userId) return;

    setLoading(true);
    try {
      console.log('[Subscription] Loading data for user:', userId);
      
      // Get current tier
      const { data: tierData, error: tierError } = await supabase
        .from('user_ai_tiers')
        .select('tier')
        .eq('user_id', userId)
        .single();

      console.log('[Subscription] Tier query result:', { tierData, tierError });

      if (tierError) {
        console.error('[Subscription] Failed to fetch tier:', tierError);
        // Default to free if no tier record exists
        setCurrentTier('free');
      } else if (tierData) {
        console.log('[Subscription] Setting tier to:', tierData.tier);
        setCurrentTier(tierData.tier || 'free');
      }

      // Get payment history
      const { data: subsData, error: subsError } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (subsError) {
        console.error('[Subscription] Failed to fetch history:', subsError);
      } else if (subsData) {
        setSubscriptions(subsData);
      }
    } catch (error) {
      console.error('[Subscription] Load error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = (targetTier: string) => {
    // Redirect to pricing page with selected tier
    router.push(`/pricing?tier=${targetTier}`);
  };

  const tierInfo = TIER_INFO[currentTier] || TIER_INFO.free;
  const TierIcon = tierInfo.icon;

  return (
    <ParentShell
      userName={userName}
      preschoolName={hasOrganization ? undefined : undefined}
      hasOrganization={hasOrganization}
      tenantSlug={tenantSlug}
    >
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
        {/* PAYMENT STATUS ALERT */}
        {paymentAlert && (
          <div style={{
            background: paymentAlert.type === 'success' 
              ? 'linear-gradient(135deg, rgb(34, 197, 94) 0%, rgb(22, 163, 74) 100%)'
              : paymentAlert.type === 'error'
              ? 'linear-gradient(135deg, rgb(239, 68, 68) 0%, rgb(220, 38, 38) 100%)'
              : 'linear-gradient(135deg, rgb(59, 130, 246) 0%, rgb(37, 99, 235) 100%)',
            borderRadius: '16px',
            padding: '20px 24px',
            marginBottom: '24px',
            border: '2px solid rgba(255, 255, 255, 0.2)',
            boxShadow: paymentAlert.type === 'success'
              ? '0 4px 20px rgba(34, 197, 94, 0.4)'
              : paymentAlert.type === 'error'
              ? '0 4px 20px rgba(239, 68, 68, 0.4)'
              : '0 4px 20px rgba(59, 130, 246, 0.4)',
            animation: 'slideDown 0.3s ease-out'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                background: 'rgba(255, 255, 255, 0.2)',
                borderRadius: '12px',
                padding: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {paymentAlert.type === 'success' ? (
                  <CheckCircle size={24} color="white" />
                ) : paymentAlert.type === 'error' ? (
                  <XCircle size={24} color="white" />
                ) : (
                  <AlertCircle size={24} color="white" />
                )}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ color: 'white', fontSize: '16px', fontWeight: 600, margin: 0 }}>
                  {paymentAlert.message}
                </p>
              </div>
              <button
                onClick={() => setPaymentAlert(null)}
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* PROMO ALERT */}
        {(currentTier === 'free' || currentTier === 'trial') && (
          <div style={{ 
            background: 'linear-gradient(135deg, rgb(99, 102, 241) 0%, rgb(139, 92, 246) 100%)', 
            borderRadius: '16px',
            padding: '20px 24px',
            marginBottom: '24px',
            border: '2px solid rgba(255, 255, 255, 0.2)',
            boxShadow: '0 4px 20px rgba(139, 92, 246, 0.4)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '250px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '24px' }}>🔥</span>
                  <h3 style={{ fontSize: '20px', fontWeight: 800, margin: 0, color: '#fff' }}>
                    LAUNCH SPECIAL: 50% OFF FOR 6 MONTHS!
                  </h3>
                </div>
                <p style={{ fontSize: '14px', margin: 0, color: 'rgba(255, 255, 255, 0.95)', lineHeight: 1.5 }}>
                  🎁 Join before Dec 31, 2025: Parent Starter at <strong>R49.50/mo</strong> (was R99) or Parent Plus at <strong>R99.50/mo</strong> (was R199) for 6 months
                  <br />
                  ⏰ Then reverts to full price • Lock in your savings by joining now!
                </p>
              </div>
              <button
                onClick={() => router.push('/pricing')}
                style={{
                  background: '#fff',
                  color: 'rgb(99, 102, 241)',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '12px 24px',
                  fontSize: '16px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                  whiteSpace: 'nowrap'
                }}
              >
                View Special Pricing →
              </button>
            </div>
          </div>
        )}

        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 800, marginBottom: '8px' }}>
            Subscription & Billing
          </h1>
          <p style={{ color: 'var(--textMuted)', fontSize: '16px' }}>
            Manage your plan, view usage, and upgrade for more features
          </p>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px' }}>
            <div className="spinner" style={{ margin: '0 auto 16px' }}></div>
            <p style={{ color: 'var(--textMuted)' }}>Loading subscription data...</p>
          </div>
        ) : (
          <>
            {/* Current Plan Card */}
            <div
              style={{
                background: `linear-gradient(135deg, ${tierInfo.color}15, ${tierInfo.color}05)`,
                border: `2px solid ${tierInfo.color}40`,
                borderRadius: '16px',
                padding: '32px',
                marginBottom: '32px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px' }}>
                <div style={{ flex: 1, minWidth: '250px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <div
                      style={{
                        width: '56px',
                        height: '56px',
                        borderRadius: '16px',
                        background: tierInfo.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <TierIcon size={28} color="white" />
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', color: 'var(--textMuted)', marginBottom: '4px' }}>
                        Current Plan
                      </div>
                      <div style={{ fontSize: '24px', fontWeight: 800 }}>
                        {tierInfo.displayName}
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: '36px', fontWeight: 800, marginBottom: '8px' }}>
                    R{tierInfo.price}
                    <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--textMuted)' }}>
                      /month
                    </span>
                  </div>

                  <ul style={{ listStyle: 'none', padding: 0, margin: '20px 0 0 0' }}>
                    {tierInfo.features.map((feature, idx) => (
                      <li
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          marginBottom: '8px',
                        }}
                      >
                        <CheckCircle size={16} color={tierInfo.color} />
                        <span style={{ fontSize: '14px' }}>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Only show upgrade button if not on highest tier */}
                {currentTier !== 'parent_plus' && 
                 currentTier !== 'teacher_pro' && 
                 !['school_starter', 'school_premium', 'school_pro', 'school_enterprise'].includes(currentTier) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'flex-end' }}>
                    <button
                      onClick={() => router.push('/pricing')}
                      className="btn btnCyan"
                      style={{
                        padding: '12px 24px',
                        fontSize: '16px',
                        fontWeight: 700,
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <ArrowUpCircle size={20} />
                      Upgrade Plan
                    </button>
                    <p style={{ fontSize: '12px', color: 'var(--textMuted)', maxWidth: '200px', textAlign: 'right' }}>
                      Get more exams, explanations, and features
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Usage Stats */}
            {usage && (
              <div style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '16px' }}>
                  Current Usage
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
                  <div className="card" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                      <div
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '12px',
                          background: 'linear-gradient(135deg, #667eea, #764ba2)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Calendar size={20} color="white" />
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', color: 'var(--textMuted)' }}>Exams</div>
                        <div style={{ fontSize: '20px', fontWeight: 700 }}>
                          {usage.exams_generated_this_month} / {tierInfo.limits.exams === 999999 ? '∞' : tierInfo.limits.exams}
                        </div>
                      </div>
                    </div>
                    <div
                      style={{
                        width: '100%',
                        height: '8px',
                        borderRadius: '4px',
                        background: 'var(--cardBg)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.min(100, (usage.exams_generated_this_month / tierInfo.limits.exams) * 100)}%`,
                          height: '100%',
                          background: 'linear-gradient(135deg, #667eea, #764ba2)',
                          transition: 'width 0.3s',
                        }}
                      />
                    </div>
                  </div>

                  <div className="card" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                      <div
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '12px',
                          background: 'linear-gradient(135deg, #f093fb, #f5576c)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Sparkles size={20} color="white" />
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', color: 'var(--textMuted)' }}>Explanations</div>
                        <div style={{ fontSize: '20px', fontWeight: 700 }}>
                          {usage.explanations_requested_this_month} / {tierInfo.limits.explanations === 999999 ? '∞' : tierInfo.limits.explanations}
                        </div>
                      </div>
                    </div>
                    <div
                      style={{
                        width: '100%',
                        height: '8px',
                        borderRadius: '4px',
                        background: 'var(--cardBg)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.min(100, (usage.explanations_requested_this_month / tierInfo.limits.explanations) * 100)}%`,
                          height: '100%',
                          background: 'linear-gradient(135deg, #f093fb, #f5576c)',
                          transition: 'width 0.3s',
                        }}
                      />
                    </div>
                  </div>

                  <div className="card" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                      <div
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '12px',
                          background: 'linear-gradient(135deg, #4facfe, #00f2fe)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Zap size={20} color="white" />
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', color: 'var(--textMuted)' }}>Chat Today</div>
                        <div style={{ fontSize: '20px', fontWeight: 700 }}>
                          {usage.chat_messages_today} / {tierInfo.limits.chat === 999999 ? '∞' : tierInfo.limits.chat}
                        </div>
                      </div>
                    </div>
                    <div
                      style={{
                        width: '100%',
                        height: '8px',
                        borderRadius: '4px',
                        background: 'var(--cardBg)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.min(100, (usage.chat_messages_today / tierInfo.limits.chat) * 100)}%`,
                          height: '100%',
                          background: 'linear-gradient(135deg, #4facfe, #00f2fe)',
                          transition: 'width 0.3s',
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Payment History */}
            {subscriptions.length > 0 && (
              <div style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '16px' }}>
                  Payment History
                </h2>
                <div className="card" style={{ overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--cardBorder)' }}>
                        <th style={{ padding: '16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--textMuted)' }}>
                          Date
                        </th>
                        <th style={{ padding: '16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--textMuted)' }}>
                          Plan
                        </th>
                        <th style={{ padding: '16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--textMuted)' }}>
                          Amount
                        </th>
                        <th style={{ padding: '16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--textMuted)' }}>
                          Status
                        </th>
                        <th style={{ padding: '16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--textMuted)' }}>
                          Reference
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {subscriptions.map((sub) => {
                        const subTierInfo = TIER_INFO[sub.tier] || TIER_INFO.free;
                        return (
                          <tr key={sub.id} style={{ borderBottom: '1px solid var(--cardBorder)' }}>
                            <td style={{ padding: '16px', fontSize: '14px' }}>
                              {formatDistanceToNow(new Date(sub.created_at), { addSuffix: true })}
                            </td>
                            <td style={{ padding: '16px', fontSize: '14px', fontWeight: 600 }}>
                              {subTierInfo.displayName}
                            </td>
                            <td style={{ padding: '16px', fontSize: '14px', fontWeight: 700 }}>
                              R{sub.amount_paid || subTierInfo.price}
                            </td>
                            <td style={{ padding: '16px' }}>
                              <span
                                style={{
                                  padding: '4px 12px',
                                  borderRadius: '12px',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  background: sub.status === 'active' ? '#10b98120' : '#6b728020',
                                  color: sub.status === 'active' ? '#10b981' : '#6b7280',
                                }}
                              >
                                {sub.status}
                              </span>
                            </td>
                            <td style={{ padding: '16px', fontSize: '12px', color: 'var(--textMuted)', fontFamily: 'monospace' }}>
                              {sub.payment_reference || 'N/A'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Available Upgrades */}
            <div>
              <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '16px' }}>
                Available Plans
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                {Object.values(TIER_INFO)
                  .filter((tier) => {
                    // Don't show current tier
                    if (tier.name === currentTier) return false;
                    // Don't show school plan (not for parents)
                    if (tier.name === 'school') return false;
                    // Don't show trial if user already has a paid plan or is on free
                    if (tier.name === 'trial' && currentTier !== 'free') return false;
                    return true;
                  })
                  .map((tier) => {
                    const Icon = tier.icon;
                    const isCurrent = tier.name === currentTier;
                    return (
                      <div
                        key={tier.name}
                        className="card"
                        style={{
                          padding: '24px',
                          border: isCurrent ? `2px solid ${tier.color}` : undefined,
                          opacity: isCurrent ? 0.6 : 1,
                          cursor: isCurrent ? 'default' : 'pointer',
                          transition: 'all 0.2s',
                        }}
                        onClick={() => !isCurrent && handleUpgrade(tier.name)}
                      >
                        <div
                          style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '12px',
                            background: tier.color,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginBottom: '16px',
                          }}
                        >
                          <Icon size={24} color="white" />
                        </div>
                        <h3 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>
                          {tier.displayName}
                        </h3>
                        <div style={{ fontSize: '32px', fontWeight: 800, marginBottom: '16px' }}>
                          R{tier.price}
                          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--textMuted)' }}>
                            /mo
                          </span>
                        </div>
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '13px' }}>
                          {tier.features.slice(0, 5).map((feature, idx) => (
                            <li key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                              <CheckCircle size={14} color={tier.color} />
                              {feature}
                            </li>
                          ))}
                        </ul>
                        {!isCurrent && (
                          <button
                            className="btn btnCyan"
                            style={{
                              width: '100%',
                              marginTop: '16px',
                              padding: '10px',
                              fontSize: '14px',
                              fontWeight: 600,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px',
                            }}
                          >
                            Select Plan <ChevronRight size={16} />
                          </button>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          </>
        )}
      </div>
    </ParentShell>
  );
}

export default function ParentSubscriptionPage() {
  return (
    <Suspense fallback={
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: 'var(--background)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 16px' }} />
          <p style={{ color: 'var(--muted)' }}>Loading subscription...</p>
        </div>
      </div>
    }>
      <SubscriptionPageContent />
    </Suspense>
  );
}
