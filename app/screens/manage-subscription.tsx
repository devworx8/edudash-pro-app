import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { Stack, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import { TierBadge } from '@/components/ui/TierBadge';
import { SubscriptionStatusCard } from '@/components/ui/SubscriptionStatusCard';
import { Card } from '@/components/ui/Card';
import { cancelSubscription } from '@/lib/payments';
import { navigateToUpgrade } from '@/lib/upgrade/upgradeRoutes';

export default function ManageSubscriptionScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { profile } = useAuth();
  const { tier, ready: subscriptionReady, refresh: refreshSubscription } = useSubscription();
  const styles = createStyles(theme);
  const { showAlert, alertProps } = useAlertModal();

  const isFreeTier = !tier || tier === 'free';

  const handleCancelSubscription = () => {
    showAlert({
      title: t('settings.billing.cancel_subscription', { defaultValue: 'Cancel Subscription' }),
      message: t('settings.billing.cancel_confirm', { 
        defaultValue: 'Are you sure you want to cancel your subscription? You will keep access until the end of your current billing period.' 
      }),
      type: 'warning',
      buttons: [
        { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        {
          text: t('settings.billing.cancel_subscription', { defaultValue: 'Cancel Subscription' }),
          style: 'destructive',
          onPress: async () => {
            try {
              const scope: 'user' | 'school' = profile?.role === 'parent' ? 'user' : 'school';
              const result = await cancelSubscription({
                scope,
                userId: scope === 'user' ? profile?.id : undefined,
                schoolId: scope === 'school' ? (profile as any)?.preschool_id : undefined,
              });

              if (result.error) {
                showAlert({ title: 'Error', message: result.error, type: 'error' });
                return;
              }

              showAlert({
                title: t('settings.billing.cancel_success', { defaultValue: 'Cancellation requested' }),
                message: t('settings.billing.cancel_success_message', { defaultValue: 'Your subscription has been cancelled. You will retain access until the end of your current billing period.' }),
                type: 'success',
              });
              refreshSubscription();
            } catch (err) {
              showAlert({ title: 'Error', message: 'Failed to cancel subscription. Please try again.', type: 'error' });
            }
          }
        },
      ]
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Stack.Screen 
        options={{ 
          title: t('settings.billing.manage_subscription', { defaultValue: 'Manage Subscription' }),
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.text,
        }} 
      />
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Current Subscription Status */}
        <Card padding={20} margin={0} elevation="medium" style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <Text style={styles.sectionTitle}>
              {t('settings.billing.current_subscription', { defaultValue: 'Current Subscription' })}
            </Text>
            {tier && tier !== 'free' && (
              <TierBadge tier={tier} size="md" />
            )}
          </View>
          
          <SubscriptionStatusCard 
            showPaymentHistory={false}
            showUpgradeCTA={isFreeTier}
            showCancelOption={false}
          />
        </Card>

        {/* Upgrade/Manage Actions */}
        <Card padding={20} margin={0} elevation="small" style={styles.actionsCard}>
          <Text style={styles.sectionTitle}>
            {t('settings.billing.actions', { defaultValue: 'Actions' })}
          </Text>
          
          {isFreeTier ? (
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.primary }]}
              onPress={() => navigateToUpgrade({ source: 'manage_subscription' })}
            >
              <Ionicons name="arrow-up-circle" size={24} color="#fff" />
              <View style={styles.actionContent}>
                <Text style={styles.actionTitle}>
                  {t('settings.billing.upgrade_plan', { defaultValue: 'Upgrade Plan' })}
                </Text>
                <Text style={styles.actionSubtitle}>
                  {t('settings.billing.upgrade_subtitle', { defaultValue: 'Unlock premium features and unlimited AI access' })}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#fff" />
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }]}
                onPress={() => router.push('/screens/plan-management')}
              >
                <Ionicons name="swap-horizontal" size={24} color={theme.primary} />
                <View style={styles.actionContent}>
                  <Text style={[styles.actionTitle, { color: theme.text }]}>
                    {t('settings.billing.change_plan', { defaultValue: 'Change Plan' })}
                  </Text>
                  <Text style={[styles.actionSubtitle, { color: theme.textSecondary }]}>
                    {t('settings.billing.change_plan_subtitle', { defaultValue: 'Upgrade or downgrade your subscription' })}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
              </TouchableOpacity>
              
              {/* Cancel Subscription Button */}
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: theme.error }]}
                onPress={handleCancelSubscription}
              >
                <Ionicons name="close-circle-outline" size={24} color={theme.error} />
                <View style={styles.actionContent}>
                  <Text style={[styles.actionTitle, { color: theme.error }]}>
                    {t('settings.billing.cancel_subscription', { defaultValue: 'Cancel Subscription' })}
                  </Text>
                  <Text style={[styles.actionSubtitle, { color: theme.textSecondary }]}>
                    {t('settings.billing.cancel_subtitle', { defaultValue: 'End your subscription at the billing period' })}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
              </TouchableOpacity>
            </>
          )}
        </Card>

        {/* Payment History Link */}
        {!isFreeTier && (
          <Card padding={20} margin={0} elevation="small" style={styles.historyCard}>
            <TouchableOpacity
              style={styles.historyButton}
              onPress={() => {
                // TODO: Navigate to payment history screen when available
                router.push('/screens/payments/return');
              }}
            >
              <Ionicons name="receipt-outline" size={24} color={theme.primary} />
              <View style={styles.actionContent}>
                <Text style={[styles.actionTitle, { color: theme.text }]}>
                  {t('settings.billing.payment_history', { defaultValue: 'Payment History' })}
                </Text>
                <Text style={[styles.actionSubtitle, { color: theme.textSecondary }]}>
                  {t('settings.billing.view_payments', { defaultValue: 'View your past payments and invoices' })}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          </Card>
        )}
      </ScrollView>
      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  statusCard: {
    marginBottom: 16,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.text,
    marginBottom: 12,
  },
  actionsCard: {
    marginBottom: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginTop: 12,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  actionContent: {
    flex: 1,
    marginLeft: 12,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  actionSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: theme.surfaceVariant || theme.surface,
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    marginLeft: 8,
  },
  historyCard: {
    marginBottom: 16,
  },
  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
