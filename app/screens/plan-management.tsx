/**
 * Plan Management Screen
 * 
 * A dedicated screen for principals to view their current plan,
 * compare available plans, and upgrade/downgrade their subscription.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Dimensions } from 'react-native';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { Stack, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { assertSupabase } from '@/lib/supabase';
import { listActivePlans } from '@/lib/subscriptions/rpc-subscriptions';
import { track } from '@/lib/analytics';
import { navigateToUpgrade } from '@/lib/upgrade/upgradeRoutes';
import { 
  TIER_PRICING, 
  TIER_QUOTAS, 
  getTierDisplayName, 
  getCapabilityTier,
  getAvailableTiersForRole,
  type TierNameAligned,
} from '@/lib/tiers';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
const { width } = Dimensions.get('window');

interface Plan {
  id: string;
  name: string;
  tier: string;
  price_monthly: number;
  price_annual: number | null;
  max_teachers: number;
  max_students: number;
  features: string[];
  is_active: boolean;
}

// ============================================================================
// PLAN CARD COMPONENT
// ============================================================================

interface PlanCardProps {
  plan: Plan;
  isCurrentPlan: boolean;
  onSelect: () => void;
  annual: boolean;
}

const PlanCard: React.FC<PlanCardProps> = ({ plan, isCurrentPlan, onSelect, annual }) => {
  const { t } = useTranslation();
  const pricing = TIER_PRICING[plan.tier as TierNameAligned];
  const quotas = TIER_QUOTAS[getCapabilityTier(plan.tier)];
  
  const price = annual 
    ? (pricing?.annual || plan.price_annual || 0) 
    : (pricing?.monthly || plan.price_monthly || 0);
  const isFree = plan.tier.toLowerCase() === 'free' || price === 0;
  const isEnterprise = plan.tier.toLowerCase().includes('enterprise');
  
  const gradientColors = isCurrentPlan 
    ? ['#00f5ff', '#0080ff'] as const
    : ['#1a1a2e', '#16213e'] as const;
    
  const features = Array.isArray(plan.features) 
    ? plan.features 
    : typeof plan.features === 'string'
      ? JSON.parse(plan.features || '[]')
      : [];

  return (
    <TouchableOpacity
      onPress={onSelect}
      disabled={isCurrentPlan}
      style={styles.planCardWrapper}
      activeOpacity={0.8}
    >
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.planCard,
          isCurrentPlan && styles.planCardCurrent,
        ]}
      >
        {isCurrentPlan && (
          <View style={styles.currentBadge}>
            <Text style={styles.currentBadgeText}>
              {t('plan.current', { defaultValue: 'Current Plan' })}
            </Text>
          </View>
        )}
        
        <Text style={[styles.planName, isCurrentPlan && styles.planNameCurrent]}>
          {getTierDisplayName(plan.tier as TierNameAligned)}
        </Text>
        
        <View style={styles.priceRow}>
          <Text style={[styles.planPrice, isCurrentPlan && styles.planPriceCurrent]}>
            {isFree ? t('plan.free', { defaultValue: 'Free' }) : 
             isEnterprise ? t('plan.custom', { defaultValue: 'Custom' }) :
             `R${price}`}
          </Text>
          {!isFree && !isEnterprise && (
            <Text style={[styles.planPeriod, isCurrentPlan && styles.planPeriodCurrent]}>
              /{annual ? t('plan.year', { defaultValue: 'year' }) : t('plan.month', { defaultValue: 'month' })}
            </Text>
          )}
        </View>
        
        {/* Quick Stats */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Ionicons name="people" size={14} color={isCurrentPlan ? '#000' : '#8a8a8a'} />
            <Text style={[styles.statText, isCurrentPlan && styles.statTextCurrent]}>
              {plan.max_teachers || '∞'} {t('plan.teachers', { defaultValue: 'teachers' })}
            </Text>
          </View>
          <View style={styles.stat}>
            <Ionicons name="school" size={14} color={isCurrentPlan ? '#000' : '#8a8a8a'} />
            <Text style={[styles.statText, isCurrentPlan && styles.statTextCurrent]}>
              {plan.max_students || '∞'} {t('plan.students', { defaultValue: 'students' })}
            </Text>
          </View>
        </View>
        
        {/* AI Quotas */}
        <View style={styles.quotasSection}>
          <Text style={[styles.quotasTitle, isCurrentPlan && styles.quotasTitleCurrent]}>
            {t('plan.ai_features', { defaultValue: 'AI Features' })}
          </Text>
          <View style={styles.quotaItem}>
            <Ionicons name="bulb" size={12} color={isCurrentPlan ? '#000' : '#00f5ff'} />
            <Text style={[styles.quotaText, isCurrentPlan && styles.quotaTextCurrent]}>
              {quotas.lesson_generation} {t('plan.lessons_month', { defaultValue: 'lessons/month' })}
            </Text>
          </View>
          <View style={styles.quotaItem}>
            <Ionicons name="chatbubble" size={12} color={isCurrentPlan ? '#000' : '#00f5ff'} />
            <Text style={[styles.quotaText, isCurrentPlan && styles.quotaTextCurrent]}>
              {quotas.claude_messages} {t('plan.ai_messages', { defaultValue: 'AI messages' })}
            </Text>
          </View>
        </View>
        
        {/* Features Preview */}
        {features.length > 0 && (
          <View style={styles.featuresPreview}>
            {features.slice(0, 3).map((feature: string, idx: number) => (
              <View key={idx} style={styles.featureItem}>
                <Ionicons 
                  name="checkmark-circle" 
                  size={14} 
                  color={isCurrentPlan ? '#000' : '#22c55e'} 
                />
                <Text 
                  style={[styles.featureText, isCurrentPlan && styles.featureTextCurrent]}
                  numberOfLines={1}
                >
                  {feature}
                </Text>
              </View>
            ))}
            {features.length > 3 && (
              <Text style={[styles.moreFeatures, isCurrentPlan && styles.moreFeaturesText]}>
                +{features.length - 3} {t('plan.more_features', { defaultValue: 'more features' })}
              </Text>
            )}
          </View>
        )}
        
        {/* Action Button */}
        {!isCurrentPlan && (
          <View style={styles.actionButton}>
            <Text style={styles.actionButtonText}>
              {isEnterprise 
                ? t('plan.contact_sales', { defaultValue: 'Contact Sales' })
                : isFree 
                  ? t('plan.downgrade', { defaultValue: 'Downgrade' })
                  : t('plan.upgrade', { defaultValue: 'Upgrade' })}
            </Text>
            <Ionicons name="arrow-forward" size={16} color="#000" />
          </View>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
};

// ============================================================================
// MAIN SCREEN
// ============================================================================

export default function PlanManagementScreen() {
  const { t } = useTranslation();
  const { showAlert, alertProps } = useAlertModal();
  const { profile } = useAuth();
  const { tier: currentTier, seats, refresh: refreshSubscription } = useSubscription();
  
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [annual, setAnnual] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const userRole = profile?.role || 'parent';
  const roleNorm = String(userRole || '').toLowerCase();
  const canManageSeats = ['principal', 'principal_admin', 'admin', 'super_admin', 'superadmin'].includes(roleNorm);
  const availableTiers = getAvailableTiersForRole(userRole);

  const loadPlans = useCallback(async () => {
    try {
      setError(null);
      const data = await listActivePlans(assertSupabase());

      // Filter plans based on available tiers for the role
      const filteredPlans = (data || [])
        .map((plan: any) => ({
          ...plan,
          features: Array.isArray(plan.features)
            ? plan.features.map((feature: any) => (typeof feature === 'string' ? feature : String(feature?.name || feature)))
            : [],
        }))
        .filter((plan) => {
          const planTier = String(plan.tier || '').toLowerCase().replace(/-/g, '_');
          if (!planTier) return false;

          // Strict match against available tiers to avoid cross-role leakage
          return availableTiers.includes(planTier as TierNameAligned);
        });

      setPlans(filteredPlans);
      
      track('plan_management_loaded', {
        plans_count: filteredPlans.length,
        current_tier: currentTier,
        user_role: userRole,
      });
    } catch (err: any) {
      console.error('Error loading plans:', err);
      setError(err.message || 'Failed to load plans');
      track('plan_management_error', { error: err.message });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [availableTiers, currentTier, userRole]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refreshSubscription();
    loadPlans();
  }, [loadPlans, refreshSubscription]);

  const handlePlanSelect = (plan: Plan) => {
    const planTier = plan.tier.toLowerCase();
    const isEnterprise = planTier.includes('enterprise');
    const isFree = planTier === 'free';
    const currentTierNorm = (currentTier || 'free').toLowerCase();
    
    if (isEnterprise) {
      showAlert({
        title: t('plan.enterprise_title', { defaultValue: 'Enterprise Plan' }),
        message: t('plan.enterprise_message', { 
          defaultValue: 'Enterprise plans require custom configuration. Our team will contact you to discuss your needs.' 
        }),
        type: 'info',
        buttons: [
          { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
          { 
            text: t('plan.contact_sales', { defaultValue: 'Contact Sales' }),
            onPress: () => {
              track('enterprise_inquiry_started', { from: 'plan_management' });
              router.push('/screens/contact');
            }
          }
        ]
      });
      return;
    }
    
    if (isFree && currentTierNorm !== 'free') {
      showAlert({
        title: t('plan.downgrade_title', { defaultValue: 'Downgrade Plan' }),
        message: t('plan.downgrade_message', { 
          defaultValue: 'Are you sure you want to downgrade to the Free plan? You will lose access to premium features at the end of your billing period.' 
        }),
        type: 'warning',
        buttons: [
          { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
          { 
            text: t('plan.confirm_downgrade', { defaultValue: 'Downgrade' }),
            style: 'destructive',
            onPress: () => {
              track('plan_downgrade_started', { from_tier: currentTier, to_tier: 'free' });
              // Navigate to manage subscription for downgrade flow
              router.push('/screens/manage-subscription');
            }
          }
        ]
      });
      return;
    }
    
    // Upgrade flow
    track('plan_upgrade_started', { from_tier: currentTier, to_tier: plan.tier });
    navigateToUpgrade({
      source: 'plan_management',
      planId: plan.tier,
      billing: annual ? 'annual' : 'monthly',
    });
  };

  const handleManageSeats = () => {
    router.push('/screens/principal-seat-management');
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen 
          options={{ 
            title: t('plan.title', { defaultValue: 'Plan Management' }),
            headerStyle: { backgroundColor: '#0b1220' },
            headerTintColor: '#00f5ff',
          }} 
        />
        <View style={styles.loadingContainer}>
          <EduDashSpinner size="large" color="#00f5ff" />
          <Text style={styles.loadingText}>
            {t('plan.loading', { defaultValue: 'Loading plans...' })}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Stack.Screen 
        options={{ 
          title: t('plan.title', { defaultValue: 'Plan Management' }),
          headerStyle: { backgroundColor: '#0b1220' },
          headerTintColor: '#00f5ff',
        }} 
      />
      <StatusBar style="light" />
      
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            tintColor="#00f5ff"
            colors={['#00f5ff']}
          />
        }
      >
        {/* Current Plan Summary */}
        <View style={styles.currentPlanSection}>
          <LinearGradient
            colors={['rgba(0, 245, 255, 0.1)', 'rgba(0, 128, 255, 0.1)']}
            style={styles.currentPlanCard}
          >
            <View style={styles.currentPlanHeader}>
              <Text style={styles.currentPlanTitle}>
                {t('plan.your_plan', { defaultValue: 'Your Current Plan' })}
              </Text>
              <View style={styles.tierBadge}>
                <Text style={styles.tierBadgeText}>
                  {getTierDisplayName((currentTier || 'free') as TierNameAligned)}
                </Text>
              </View>
            </View>
            
            {canManageSeats && seats && (
              <View style={styles.seatsInfo}>
                <Ionicons name="people-circle" size={20} color="#00f5ff" />
                <Text style={styles.seatsText}>
                  {t('plan.seats_used', { 
                    defaultValue: '{{used}} of {{total}} teacher seats used',
                    used: seats.used,
                    total: seats.total,
                  })}
                </Text>
              </View>
            )}
            
            {canManageSeats && (
              <TouchableOpacity 
                style={styles.manageSeatsButton}
                onPress={handleManageSeats}
              >
                <Text style={styles.manageSeatsText}>
                  {t('plan.manage_seats', { defaultValue: 'Manage Teacher Seats' })}
                </Text>
                <Ionicons name="chevron-forward" size={16} color="#00f5ff" />
              </TouchableOpacity>
            )}
          </LinearGradient>
        </View>
        
        {/* Billing Toggle */}
        <View style={styles.billingToggle}>
          <TouchableOpacity
            style={[styles.toggleOption, !annual && styles.toggleOptionActive]}
            onPress={() => setAnnual(false)}
          >
            <Text style={[styles.toggleText, !annual && styles.toggleTextActive]}>
              {t('plan.monthly', { defaultValue: 'Monthly' })}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleOption, annual && styles.toggleOptionActive]}
            onPress={() => setAnnual(true)}
          >
            <Text style={[styles.toggleText, annual && styles.toggleTextActive]}>
              {t('plan.annual', { defaultValue: 'Annual' })}
            </Text>
            <View style={styles.saveBadge}>
              <Text style={styles.saveText}>
                {t('plan.save', { defaultValue: 'Save 10%' })}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
        
        {/* Error State */}
        {error && (
          <View style={styles.errorContainer}>
            <Ionicons name="warning" size={24} color="#ef4444" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadPlans}>
              <Text style={styles.retryText}>
                {t('common.retry', { defaultValue: 'Retry' })}
              </Text>
            </TouchableOpacity>
          </View>
        )}
        
        {/* Plans Grid */}
        <View style={styles.plansSection}>
          <Text style={styles.sectionTitle}>
            {t('plan.available_plans', { defaultValue: 'Available Plans' })}
          </Text>
          
          <View style={styles.plansGrid}>
            {plans.map((plan) => {
              const planTierNorm = plan.tier.toLowerCase().replace(/-/g, '_');
              const currentTierNorm = (currentTier || 'free').toLowerCase().replace(/-/g, '_');
              const isCurrentPlan = planTierNorm === currentTierNorm || 
                (planTierNorm === 'free' && currentTierNorm === 'free');
              
              return (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  isCurrentPlan={isCurrentPlan}
                  onSelect={() => handlePlanSelect(plan)}
                  annual={annual}
                />
              );
            })}
          </View>
          
          {plans.length === 0 && !error && (
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={48} color="#4a4a4a" />
              <Text style={styles.emptyStateText}>
                {t('plan.no_plans', { defaultValue: 'No plans available' })}
              </Text>
            </View>
          )}
        </View>
        
        {/* FAQ Section */}
        <View style={styles.faqSection}>
          <Text style={styles.faqTitle}>
            {t('plan.faq_title', { defaultValue: 'Frequently Asked Questions' })}
          </Text>
          
          <View style={styles.faqItem}>
            <Text style={styles.faqQuestion}>
              {t('plan.faq_upgrade_q', { defaultValue: 'Can I upgrade or downgrade anytime?' })}
            </Text>
            <Text style={styles.faqAnswer}>
              {t('plan.faq_upgrade_a', { 
                defaultValue: 'Yes! Upgrades take effect immediately. Downgrades take effect at the end of your billing period.' 
              })}
            </Text>
          </View>
          
          <View style={styles.faqItem}>
            <Text style={styles.faqQuestion}>
              {t('plan.faq_refund_q', { defaultValue: 'What about refunds?' })}
            </Text>
            <Text style={styles.faqAnswer}>
              {t('plan.faq_refund_a', { 
                defaultValue: 'We offer pro-rated credits for mid-cycle downgrades. Contact support for assistance.' 
              })}
            </Text>
          </View>
        </View>
        
        {/* Support Link */}
        <TouchableOpacity 
          style={styles.supportLink}
          onPress={() => router.push('/screens/contact')}
        >
          <Ionicons name="help-circle-outline" size={20} color="#00f5ff" />
          <Text style={styles.supportLinkText}>
            {t('plan.need_help', { defaultValue: 'Need help choosing a plan? Contact us' })}
          </Text>
        </TouchableOpacity>
      </ScrollView>
      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1220',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#8a8a8a',
    marginTop: 12,
    fontSize: 14,
  },
  currentPlanSection: {
    marginBottom: 24,
  },
  currentPlanCard: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 245, 255, 0.3)',
  },
  currentPlanHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  currentPlanTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  tierBadge: {
    backgroundColor: '#00f5ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  tierBadgeText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  seatsInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  seatsText: {
    color: '#b0b0b0',
    fontSize: 14,
  },
  manageSeatsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 245, 255, 0.15)',
    padding: 12,
    borderRadius: 8,
  },
  manageSeatsText: {
    color: '#00f5ff',
    fontWeight: '600',
  },
  billingToggle: {
    flexDirection: 'row',
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  toggleOption: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 6,
  },
  toggleOptionActive: {
    backgroundColor: '#00f5ff',
  },
  toggleText: {
    color: '#8a8a8a',
    fontWeight: '600',
  },
  toggleTextActive: {
    color: '#000',
  },
  saveBadge: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  saveText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  errorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  errorText: {
    color: '#ef4444',
    marginTop: 8,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#ef4444',
    borderRadius: 6,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  plansSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
  },
  plansGrid: {
    gap: 16,
  },
  planCardWrapper: {
    width: '100%',
  },
  planCard: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },
  planCardCurrent: {
    borderColor: '#00f5ff',
    borderWidth: 2,
  },
  currentBadge: {
    position: 'absolute',
    top: -10,
    right: 16,
    backgroundColor: '#22c55e',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  currentBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  planName: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  planNameCurrent: {
    color: '#000',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 16,
  },
  planPrice: {
    color: '#00f5ff',
    fontSize: 32,
    fontWeight: '800',
  },
  planPriceCurrent: {
    color: '#000',
  },
  planPeriod: {
    color: '#8a8a8a',
    fontSize: 14,
    marginLeft: 4,
  },
  planPeriodCurrent: {
    color: 'rgba(0, 0, 0, 0.6)',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 16,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statText: {
    color: '#8a8a8a',
    fontSize: 13,
  },
  statTextCurrent: {
    color: 'rgba(0, 0, 0, 0.7)',
  },
  quotasSection: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  quotasTitle: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  quotasTitleCurrent: {
    color: '#000',
  },
  quotaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  quotaText: {
    color: '#b0b0b0',
    fontSize: 13,
  },
  quotaTextCurrent: {
    color: 'rgba(0, 0, 0, 0.7)',
  },
  featuresPreview: {
    marginBottom: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  featureText: {
    color: '#b0b0b0',
    fontSize: 13,
    flex: 1,
  },
  featureTextCurrent: {
    color: 'rgba(0, 0, 0, 0.7)',
  },
  moreFeatures: {
    color: '#00f5ff',
    fontSize: 12,
    marginTop: 8,
    fontStyle: 'italic',
  },
  moreFeaturesText: {
    color: 'rgba(0, 0, 0, 0.6)',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00f5ff',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  actionButtonText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 15,
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
  },
  emptyStateText: {
    color: '#8a8a8a',
    marginTop: 12,
    fontSize: 16,
  },
  faqSection: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  faqTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  faqItem: {
    marginBottom: 16,
  },
  faqQuestion: {
    color: '#00f5ff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  faqAnswer: {
    color: '#b0b0b0',
    fontSize: 13,
    lineHeight: 18,
  },
  supportLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  supportLinkText: {
    color: '#00f5ff',
    fontSize: 14,
  },
});
