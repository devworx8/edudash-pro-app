'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAIQuota } from '@/lib/hooks/useAIQuota';
import { ParentShell } from '@/components/dashboard/parent/ParentShell';
import { Check, Zap, Crown, Building, Loader2 } from 'lucide-react';

interface PricingTier {
  id: string;
  name: string;
  price: number;
  period: string;
  features: string[];
  limits: {
    exams: number;
    explanations: number;
    chat: number;
  };
  popular?: boolean;
  icon: any;
  color: string;
}

export default function UpgradePage() {
  const router = useRouter();
  const supabase = createClient();
  const { usage, loading: usageLoading } = useAIQuota();
  const [loading, setLoading] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserEmail(user.email || '');
    };
    getUser();
  }, [supabase]);

  const tiers = [
    {
      id: 'parent_starter',
      name: 'Starter',
      price: 99,
      icon: Zap,
      color: '#10b981',
      features: [
        '30 AI-generated exams per month',
        '100 AI explanations',
        '200 chat messages per day',
        'CAPS-aligned content',
        'All subjects and grades',
        'PDF export',
        'Email support',
        'Interactive robotics (2 free modules)',
      ],
    },
    {
      id: 'parent_plus',
      name: 'Plus',
      price: 199,
      icon: Crown,
      color: '#7c3aed',
      popular: true,
      features: [
        '100 AI-generated exams per month',
        '500 AI explanations',
        '1000 chat messages per day',
        'Priority AI processing',
        'Advanced analytics',
        'Personalized learning paths',
        'All robotics modules unlocked',
        'All 37 DBE textbooks',
        'AI diagram generation',
        'Priority email support',
      ],
    },
  ];  const handleUpgrade = async (tierId: string, price: number) => {
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('Please sign in to upgrade');
        router.push('/sign-in');
        return;
      }

      // Get current session for auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Please sign in to continue');
        router.push('/sign-in');
        return;
      }

      // Call Supabase Edge Function to create payment
      const { data, error } = await supabase.functions.invoke('payfast-create-payment', {
        body: {
          user_id: user.id,
          tier: tierId,
          amount: price,
          email: userEmail,
        },
      });

      if (error || !data) {
        alert(`Payment error: ${error?.message || data?.error || 'Unknown error'}`);
        return;
      }

      // Redirect to PayFast
      if (data.payment_url) {
        window.location.href = data.payment_url;
      }
    } catch (error) {
      console.error('Upgrade error:', error);
      alert('Failed to process upgrade. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ParentShell>
      <div className="container" style={{ maxWidth: 1200, margin: '0 auto', padding: 'var(--space-4)' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-8)' }}>
          <h1 style={{ fontSize: 36, fontWeight: 700, marginBottom: 'var(--space-2)' }}>
            Upgrade Your Plan
          </h1>
          <p style={{ fontSize: 18, color: 'var(--muted)', maxWidth: 600, margin: '0 auto' }}>
            Get more AI-powered features to help your child excel
          </p>
        </div>

        {/* Current Usage */}
        {usage && !usageLoading && (
          <div style={{
            background: 'var(--surface)',
            padding: 'var(--space-4)',
            borderRadius: 'var(--radius-2)',
            marginBottom: 'var(--space-6)',
            border: '1px solid var(--border)',
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 'var(--space-3)' }}>
              Current Usage ({usage.current_tier.charAt(0).toUpperCase() + usage.current_tier.slice(1)} Plan)
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-3)' }}>
              <div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 'var(--space-1)' }}>
                  Exams Generated
                </div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>
                  {usage.exams_generated_this_month}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 'var(--space-1)' }}>
                  Explanations
                </div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>
                  {usage.explanations_requested_this_month}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 'var(--space-1)' }}>
                  Chat Messages Today
                </div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>
                  {usage.chat_messages_today}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Pricing Tiers */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-6)',
        }}>
          {tiers.map((tier) => {
            const Icon = tier.icon;
            const isCurrentTier = usage?.current_tier === tier.id;

            return (
              <div
                key={tier.id}
                style={{
                  background: 'var(--card)',
                  padding: 'var(--space-6)',
                  borderRadius: 'var(--radius-2)',
                  border: tier.popular ? `2px solid ${tier.color}` : '1px solid var(--border)',
                  position: 'relative',
                  boxShadow: tier.popular ? `0 8px 32px ${tier.color}33` : undefined,
                }}
              >
                {tier.popular && (
                  <div style={{
                    position: 'absolute',
                    top: -12,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: tier.color,
                    color: 'white',
                    padding: '4px 16px',
                    borderRadius: 'var(--radius-1)',
                    fontSize: 12,
                    fontWeight: 600,
                  }}>
                    MOST POPULAR
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                  <Icon size={28} color={tier.color} />
                  <h3 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>{tier.name}</h3>
                </div>

                <div style={{ marginBottom: 'var(--space-4)' }}>
                  {tier.price === 0 ? (
                    <div style={{ fontSize: 20, fontWeight: 600, color: tier.color }}>
                      Contact Us
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
                        <div style={{ fontSize: 42, fontWeight: 700, lineHeight: 1 }}>
                          R{tier.id === 'parent_starter' ? '49.50' : '99.50'}
                        </div>
                        <div style={{ 
                          fontSize: 20, 
                          fontWeight: 500, 
                          color: 'var(--muted)', 
                          textDecoration: 'line-through' 
                        }}>
                          R{tier.price}
                        </div>
                      </div>
                      <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 'var(--space-1)' }}>
                        per month · <span style={{ color: '#10b981', fontWeight: 600 }}>50% OFF</span> for 6 months
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                        Early Bird Special - Ends Dec 31, 2025
                      </div>
                    </>
                  )}
                </div>

                <ul style={{ listStyle: 'none', padding: 0, marginBottom: 'var(--space-4)' }}>
                  {tier.features.map((feature, idx) => (
                    <li key={idx} style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 'var(--space-2)',
                      marginBottom: 'var(--space-2)',
                      fontSize: 14,
                    }}>
                      <Check size={18} color={tier.color} style={{ flexShrink: 0, marginTop: 2 }} />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  className="btn"
                  onClick={() => {
                    // Use promotional price for early bird period
                    const promoPrice = tier.id === 'parent_starter' ? 49.50 : 99.50;
                    handleUpgrade(tier.id, promoPrice);
                  }}
                  disabled={loading || isCurrentTier}
                  style={{
                    width: '100%',
                    background: isCurrentTier ? 'var(--surface-2)' : `linear-gradient(135deg, ${tier.color}, ${tier.color}dd)`,
                    border: 'none',
                    color: isCurrentTier ? 'var(--muted)' : 'white',
                    cursor: isCurrentTier ? 'not-allowed' : 'pointer',
                  }}
                >
                  {loading && <Loader2 size={16} className="animate-spin" />}
                  {isCurrentTier ? 'Current Plan' : 'Upgrade Now'}
                </button>
              </div>
            );
          })}
        </div>

        {/* FAQ */}
        <div style={{
          background: 'var(--surface)',
          padding: 'var(--space-6)',
          borderRadius: 'var(--radius-2)',
          border: '1px solid var(--border)',
        }}>
          <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 'var(--space-4)' }}>
            Frequently Asked Questions
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div>
              <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                How do I upgrade?
              </h4>
              <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>
                Click "Upgrade Now" on your desired plan. You'll be redirected to PayFast for secure payment processing.
              </p>
            </div>
            <div>
              <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                What happens when I reach my limit?
              </h4>
              <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>
                You'll receive a warning when approaching your limit. Once exceeded, you'll need to upgrade to continue using AI features.
              </p>
            </div>
            <div>
              <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                Can I cancel anytime?
              </h4>
              <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>
                Yes! You can cancel your subscription at any time. Your current plan will remain active until the end of your billing period.
              </p>
            </div>
          </div>
        </div>
      </div>
    </ParentShell>
  );
}
