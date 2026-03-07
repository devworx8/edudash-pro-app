'use client';

import { useState } from 'react';
import { X, Crown, Zap, Sparkles, CheckCircle, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTier: 'free' | 'trial' | 'parent_starter' | 'parent_plus' | 'premium' | 'school';
  userId: string;
  userEmail: string;
  userName?: string;
  featureBlocked?: string; // e.g., "exam generation", "explanations"
  currentUsage?: number;
  currentLimit?: number;
}

interface TierOption {
  tier: 'parent_starter' | 'parent_plus';
  name: string;
  price: number;
  color: string;
  icon: any;
  tagline: string;
  features: string[];
  limits: {
    exams: string;
    explanations: string;
    chat: string;
  };
  recommended?: boolean;
}

const TIER_OPTIONS: TierOption[] = [
  {
    tier: 'parent_starter',
    name: 'Parent Starter',
    price: 99,
    color: '#3b82f6',
    icon: Zap,
    tagline: 'Perfect for focused learning',
    features: [
      '50 exams per month',
      '50 explanations per month',
      '100 chat messages per day',
      'All CAPS subjects',
      'Interactive exercises',
      'Progress tracking',
      'Email support',
    ],
    limits: {
      exams: '50/month',
      explanations: '50/month',
      chat: '100/day',
    },
  },
  {
    tier: 'parent_plus',
    name: 'Parent Plus',
    price: 199,
    color: '#8b5cf6',
    icon: Crown,
    tagline: 'Unlimited learning potential',
    features: [
      'Unlimited exams',
      'Unlimited explanations',
      'Unlimited chat',
      'All CAPS subjects',
      'Interactive exercises',
      'Advanced analytics',
      'Multiple children',
      'Priority support',
      'Gamification',
    ],
    limits: {
      exams: 'Unlimited',
      explanations: 'Unlimited',
      chat: 'Unlimited',
    },
    recommended: true,
  },
];

export function UpgradeModal({
  isOpen,
  onClose,
  currentTier,
  userId,
  userEmail,
  userName,
  featureBlocked,
  currentUsage,
  currentLimit,
}: UpgradeModalProps) {
  const [processingPayment, setProcessingPayment] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleUpgrade = async (tier: 'parent_starter' | 'parent_plus') => {
    setProcessingPayment(tier);
    setPaymentError(null);

    try {
      const tierOption = TIER_OPTIONS.find(t => t.tier === tier);
      if (!tierOption) {
        throw new Error('Invalid tier selected');
      }

      // Call Supabase Edge Function to create payment
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Please log in to continue');
      }

      // Call Supabase Edge Function to create payment
      const { data, error } = await supabase.functions.invoke('payfast-create-payment', {
        body: {
          user_id: userId,
          tier: tier,
          amount: tierOption.price,
          email: userEmail,
          firstName: userName?.split(' ')[0] || userEmail.split('@')[0],
          lastName: userName?.split(' ').slice(1).join(' ') || 'User',
          itemName: tierOption.name,
          itemDescription: tierOption.tagline,
          subscriptionType: '1', // Subscription
          frequency: '3', // Monthly
          cycles: '0', // Until cancelled
        },
      });

      if (error || !data) {
        throw new Error(error?.message || data?.error || 'Failed to create payment');
      }

      // Redirect to PayFast payment page
      if (data.payment_url) {
        console.log('[UpgradeModal] Redirecting to PayFast:', {
          tier,
          paymentId: data.payment_id,
          mode: data.mode,
        });
        window.location.href = data.payment_url;
      } else {
        throw new Error('No payment URL received');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('[UpgradeModal] Payment failed:', error);
      setPaymentError(errorMessage);
      setProcessingPayment(null);
    }
  };

  // Filter tiers based on current tier
  const availableTiers = TIER_OPTIONS.filter((option) => {
    if (currentTier === 'free' || currentTier === 'trial') return true;
    if (currentTier === 'parent_starter') return option.tier === 'parent_plus';
    return false; // Already on highest tier
  });

  if (availableTiers.length === 0) {
    return null; // User is already on highest tier
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={onClose}
    >
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes slideUp {
          from {
            transform: translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>

      <div
        style={{
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
          borderRadius: '24px',
          maxWidth: '900px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          position: 'relative',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          animation: 'slideUp 0.3s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.1)',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
            zIndex: 10,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
            e.currentTarget.style.transform = 'scale(1.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <X size={20} />
        </button>

        {/* Header */}
        <div
          style={{
            padding: '40px 32px 32px',
            textAlign: 'center',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              margin: '0 auto 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Sparkles size={32} color="white" />
          </div>

          <h2 style={{ fontSize: '32px', fontWeight: 800, marginBottom: '12px', color: '#fff' }}>
            {featureBlocked ? `Unlock ${featureBlocked}` : 'Upgrade Your Plan'}
          </h2>

          <p style={{ fontSize: '16px', color: 'rgba(255, 255, 255, 0.7)', maxWidth: '500px', margin: '0 auto' }}>
            {currentUsage !== undefined && currentLimit !== undefined ? (
              <>
                You've used <strong style={{ color: '#00f5ff' }}>{currentUsage} of {currentLimit}</strong> this period.
                Upgrade to continue learning without limits!
              </>
            ) : (
              'Choose the plan that fits your learning goals and unlock unlimited potential.'
            )}
          </p>
        </div>

        {/* Plans */}
        <div
          style={{
            padding: '32px',
            display: 'grid',
            gridTemplateColumns: availableTiers.length === 1 ? '1fr' : 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '20px',
          }}
        >
          {availableTiers.map((option) => {
            const Icon = option.icon;
            const isProcessing = processingPayment === option.tier;

            return (
              <div
                key={option.tier}
                style={{
                  background: option.recommended
                    ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(139, 92, 246, 0.05))'
                    : 'rgba(255, 255, 255, 0.03)',
                  border: option.recommended ? `2px solid ${option.color}` : '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '16px',
                  padding: '28px 24px',
                  position: 'relative',
                  transition: 'all 0.3s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = `0 12px 24px -8px ${option.color}40`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {option.recommended && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '-12px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: option.color,
                      color: '#fff',
                      padding: '4px 16px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    RECOMMENDED
                  </div>
                )}

                <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                  <div
                    style={{
                      width: '56px',
                      height: '56px',
                      borderRadius: '12px',
                      background: option.color,
                      margin: '0 auto 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon size={28} color="white" />
                  </div>

                  <h3 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px', color: '#fff' }}>
                    {option.name}
                  </h3>

                  <p style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '16px' }}>
                    {option.tagline}
                  </p>

                  <div style={{ fontSize: '40px', fontWeight: 800, color: '#fff', marginBottom: '4px' }}>
                    R{option.price}
                  </div>
                  <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.5)' }}>per month</div>
                </div>

                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px 0' }}>
                  {option.features.map((feature, idx) => (
                    <li
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        marginBottom: '12px',
                        fontSize: '14px',
                        color: 'rgba(255, 255, 255, 0.9)',
                      }}
                    >
                      <CheckCircle size={18} color={option.color} style={{ flexShrink: 0 }} />
                      {feature}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleUpgrade(option.tier)}
                  disabled={isProcessing}
                  style={{
                    width: '100%',
                    padding: '14px 24px',
                    background: option.recommended
                      ? `linear-gradient(135deg, ${option.color}, ${option.color}dd)`
                      : 'rgba(255, 255, 255, 0.1)',
                    color: '#fff',
                    border: option.recommended ? 'none' : '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '12px',
                    fontSize: '16px',
                    fontWeight: 700,
                    cursor: isProcessing ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s',
                    opacity: isProcessing ? 0.6 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!isProcessing) {
                      e.currentTarget.style.transform = 'scale(1.02)';
                      e.currentTarget.style.boxShadow = `0 8px 16px -4px ${option.color}60`;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isProcessing) {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.boxShadow = 'none';
                    }
                  }}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                      Processing...
                    </>
                  ) : (
                    <>
                      Upgrade Now
                      <ArrowRight size={20} />
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Error message */}
        {paymentError && (
          <div
            style={{
              margin: '0 32px 20px',
              padding: '16px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
            }}
          >
            <AlertCircle size={20} color="#ef4444" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '14px', fontWeight: 600, color: '#ef4444', margin: '0 0 4px 0' }}>
                Payment Error
              </p>
              <p style={{ fontSize: '13px', color: 'rgba(239, 68, 68, 0.9)', margin: 0 }}>
                {paymentError}
              </p>
              <button
                onClick={() => setPaymentError(null)}
                style={{
                  marginTop: '8px',
                  padding: '4px 12px',
                  background: 'rgba(239, 68, 68, 0.2)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '6px',
                  color: '#ef4444',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            padding: '20px 32px',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '0 0 24px 24px',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.5)', margin: 0 }}>
            🔒 Secure payment powered by PayFast • Cancel anytime • No hidden fees
          </p>
        </div>
      </div>
    </div>
  );
}
