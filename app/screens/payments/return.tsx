import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import ThemedStatusBar from '@/components/ui/ThemedStatusBar';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { assertSupabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { useTheme } from '@/contexts/ThemeContext';
import { navigateTo } from '@/lib/navigation/router-utils';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
type PaymentStatus = 'processing' | 'success' | 'cancelled' | 'failed';

interface PaymentReturn {
  status?: string;
  invoice_id?: string;
  transaction_id?: string;
  m_payment_id?: string;
  invoice_number?: string;
  plan_tier?: string;
  scope?: string;
}

export default function PaymentReturnScreen() {
  const params = useLocalSearchParams() as Partial<PaymentReturn>;
  const { profile, refreshProfile } = useAuth();
  const { theme } = useTheme();
  const { refresh: refreshSubscription } = useSubscription();
  
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('processing');
  const [message, setMessage] = useState('Processing your payment...');
  const [subscription, setSubscription] = useState<any>(null);
  const [pollingCount, setPollingCount] = useState(0);
  
  const maxPollingAttempts = 30; // 60 seconds at 2s intervals
  const pollingInterval = 2000;

  useEffect(() => {
    track('payment_return_viewed', {
      status: params.status,
      invoice_id: params.invoice_id,
      transaction_id: params.transaction_id,
    });

    let cancelled = false;
    const txId = params.transaction_id || params.m_payment_id || '';

    const poll = async () => {
      for (let attempt = 1; attempt <= maxPollingAttempts; attempt += 1) {
        if (cancelled) return;
        setPollingCount(attempt);

        try {
          if (txId) {
            // Prefer polling payment_transactions by tx id (reliable for both user + school scope)
            const { data: tx, error: txErr } = await assertSupabase()
              .from('payment_transactions')
              .select('id,status,school_id,amount,subscription_plan_id,metadata,completed_at')
              .eq('id', txId)
              .maybeSingle();

            if (txErr && (txErr as any)?.code !== 'PGRST116') {
              console.warn('Payment transaction polling error:', txErr);
            }

            if (tx?.status === 'completed') {
              setPaymentStatus('success');
              setMessage('Payment successful! Updating your account...');

              // Best-effort: fetch latest active subscription for display (school scope)
              try {
                if (tx.school_id) {
                  const { data: sub } = await assertSupabase()
                    .from('subscriptions')
                    .select('*')
                    .eq('school_id', tx.school_id)
                    .eq('status', 'active')
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                  if (sub) setSubscription(sub);
                }
              } catch {
                // non-fatal
              }

              track('payment_activation_success', {
                transaction_id: tx.id,
                polling_attempts: attempt,
              });

              // Refresh both subscription + profile (tier/capabilities) so dashboards update
              try {
                await refreshProfile();
              } catch (e) {
                console.warn('refreshProfile failed after payment:', e);
              }
              try {
                refreshSubscription();
              } catch {
                // non-fatal
              }

              setMessage('Payment successful! Your subscription is now active.');
              return;
            }
          }
        } catch (error: any) {
          console.error('Payment verification error:', error);
          setPaymentStatus('failed');
          setMessage('Unable to verify payment status. Please contact support.');
          track('payment_verification_error', {
            error: error.message,
            polling_attempts: attempt,
          });
          return;
        }

        await new Promise<void>((resolve) => setTimeout(resolve, pollingInterval));
      }

      if (cancelled) return;
      setPaymentStatus('failed');
      setMessage('Payment processing timed out. Please contact support if you were charged.');
      track('payment_activation_timeout', {
        polling_attempts: maxPollingAttempts,
        invoice_id: params.invoice_id,
      });
    };

    poll();
    return () => {
      cancelled = true;
    };
  }, [params.invoice_id, params.m_payment_id, params.status, params.transaction_id, refreshProfile, refreshSubscription]);

  const handleContinue = () => {
    if (paymentStatus === 'success') {
      // Navigate to appropriate screen based on user role and subscription scope
      const isParent = profile?.role === 'parent';
      const scope = String(params.scope || '').toLowerCase();
      
      if (isParent) {
        // Parent subscription - always go to parent dashboard
        router.push('/dashboard/parent' as any);
      } else if (scope === 'school' || !!subscription) {
        // School subscription - go to seat management
        router.push('/screens/principal-seat-management');
      } else {
        // User subscription - go to dashboard
        router.push('/');
      }
    } else {
      // Go back to pricing
      router.push('/marketing/pricing' as any);
    }
  };

  const handleContactSupport = () => {
    Alert.alert(
      'Contact Support',
      'Please reach out to our support team with your transaction details.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Email',
          onPress: () => {
            const subject = encodeURIComponent('Payment Issue - Transaction ' + (params.transaction_id || 'Unknown'));
            const body = encodeURIComponent(`Hi Support Team,

I experienced an issue with my payment:
- Status: ${params.status}
- Invoice ID: ${params.invoice_id || 'N/A'}
- Transaction ID: ${params.transaction_id || 'N/A'}
- Time: ${new Date().toISOString()}

Please help me resolve this issue.

Thanks!`);
            
            const mailtoUrl = `mailto:support@edudashpro.org.za?subject=${subject}&body=${body}`;
            // Note: In a real app, you'd use Linking.openURL(mailtoUrl)
            // For now, we'll show an alert with the details
            Alert.alert('Support Email', `Please email: support@edudashpro.org.za\n\nSubject: ${decodeURIComponent(subject)}\n\nInclude transaction details: ${params.transaction_id || 'N/A'}`);
          }
        }
      ]
    );
  };

  const getStatusColor = () => {
    switch (paymentStatus) {
      case 'success': return '#10b981';
      case 'failed': return '#ef4444';
      case 'cancelled': return '#f59e0b';
      default: return theme.primary;
    }
  };

  const getStatusIcon = () => {
    switch (paymentStatus) {
      case 'success': return '✅';
      case 'failed': return '❌';
      case 'cancelled': return '⚠️';
      default: return '🔄';
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen 
        options={{
          title: 'Payment Status',
          headerStyle: { backgroundColor: theme.surface },
          headerTitleStyle: { color: theme.text },
          headerTintColor: theme.primary,
          headerLeft: () => null, // Prevent back navigation during processing
        }} 
      />
      <ThemedStatusBar />
      
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <View style={[styles.statusCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            
            {/* Status Icon */}
            <View style={[styles.iconContainer, { backgroundColor: getStatusColor() + '20' }]}>
              <Text style={styles.statusIcon}>{getStatusIcon()}</Text>
            </View>

            {/* Status Message */}
            <Text style={[styles.statusTitle, { color: theme.text }]}>
              {paymentStatus === 'success' && 'Payment Successful!'}
              {paymentStatus === 'failed' && 'Payment Failed'}
              {paymentStatus === 'cancelled' && 'Payment Cancelled'}
              {paymentStatus === 'processing' && 'Processing Payment...'}
            </Text>

            <Text style={[styles.statusMessage, { color: theme.textSecondary }]}>
              {message}
            </Text>

            {/* Loading indicator for processing */}
            {paymentStatus === 'processing' && (
              <EduDashSpinner 
                size="large" 
                color={theme.primary} 
                style={styles.loader}
              />
            )}

            {/* Subscription details for success */}
            {paymentStatus === 'success' && subscription && (
              <View style={[styles.subscriptionDetails, { borderColor: theme.border }]}>
                <Text style={[styles.detailsTitle, { color: theme.text }]}>
                  Subscription Details
                </Text>
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: theme.textTertiary }]}>Plan:</Text>
                  <Text style={[styles.detailValue, { color: theme.text }]}>{subscription.plan_id}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: theme.textTertiary }]}>Billing:</Text>
                  <Text style={[styles.detailValue, { color: theme.text }]}>{subscription.billing_frequency}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: theme.textTertiary }]}>Status:</Text>
                  <Text style={[styles.detailValue, { color: '#10b981' }]}>{subscription.status}</Text>
                </View>
              </View>
            )}

            {/* Transaction details */}
            {(params.invoice_id || params.transaction_id) && (
              <View style={[styles.transactionDetails, { borderColor: theme.border }]}>
                <Text style={[styles.detailsTitle, { color: theme.text }]}>
                  Transaction Details
                </Text>
                {params.invoice_id && (
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: theme.textTertiary }]}>Invoice:</Text>
                    <Text style={[styles.detailValue, { color: theme.text }]}>{params.invoice_id}</Text>
                  </View>
                )}
                {params.transaction_id && (
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: theme.textTertiary }]}>Transaction:</Text>
                    <Text style={[styles.detailValue, { color: theme.text }]}>{params.transaction_id}</Text>
                  </View>
                )}
              </View>
            )}

            {/* Polling progress for processing */}
            {paymentStatus === 'processing' && (
              <Text style={[styles.pollingProgress, { color: theme.textTertiary }]}>
                Checking payment status... ({pollingCount + 1}/{maxPollingAttempts})
              </Text>
            )}
          </View>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: theme.primary }]}
              onPress={handleContinue}
              disabled={paymentStatus === 'processing'}
            >
              <Text style={[styles.primaryButtonText, { color: theme.onPrimary }]}>
                {paymentStatus === 'success' ? 'Continue to Dashboard' : 'Back to Pricing'}
              </Text>
            </TouchableOpacity>

            {(paymentStatus === 'failed' || paymentStatus === 'cancelled') && (
              <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: theme.border }]}
                onPress={handleContactSupport}
              >
                <Text style={[styles.secondaryButtonText, { color: theme.text }]}>
                  Contact Support
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  statusCard: {
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 24,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  statusIcon: {
    fontSize: 40,
  },
  statusTitle: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  statusMessage: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 16,
  },
  loader: {
    marginVertical: 16,
  },
  subscriptionDetails: {
    width: '100%',
    padding: 16,
    borderTopWidth: 1,
    marginTop: 16,
  },
  transactionDetails: {
    width: '100%',
    padding: 16,
    borderTopWidth: 1,
    marginTop: 8,
  },
  detailsTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
    flex: 1,
    marginLeft: 16,
  },
  pollingProgress: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
  actions: {
    gap: 12,
  },
  primaryButton: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
