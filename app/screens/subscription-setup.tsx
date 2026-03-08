import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { PlanCard } from '@/components/subscription-setup/PlanCard';
import { getSchoolTypeDescription, getSchoolTypeLabel } from '@/components/subscription-setup/utils';
import type { RouteParams } from '@/components/subscription-setup/types';
import { useSubscriptionSetup } from '@/components/subscription-setup/useSubscriptionSetup';
import { UPGRADE_REASONS, type UpgradeReason } from '@/components/subscription/types';
import { UpgradeHeader } from '@/components/subscription/UpgradeHeader';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import { useAIUserLimits } from '@/hooks/useAI';
import { createStyles } from '@/app/screens/subscription-setup.styles';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
const takeFirst = (value: unknown): string | undefined => {
  if (Array.isArray(value)) return value.length > 0 ? String(value[0]) : undefined;
  if (value == null) return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
};

const resolveReason = (source?: string, reason?: string): UpgradeReason => {
  const reasonKey = String(reason || '').toLowerCase();
  if (reasonKey in UPGRADE_REASONS) return UPGRADE_REASONS[reasonKey];
  const sourceKey = String(source || '').toLowerCase();
  if (sourceKey.includes('quota') || sourceKey.includes('limit') || reasonKey.includes('limit') || reasonKey.includes('quota')) {
    return UPGRADE_REASONS.limit_reached;
  }
  if (sourceKey.includes('feature') || sourceKey.includes('analytics') || reasonKey.includes('feature')) {
    return UPGRADE_REASONS.feature_needed;
  }
  return UPGRADE_REASONS.manual_upgrade;
};

const formatTier = (tier: string): string => tier.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());

const asRouteParams = (raw: Record<string, unknown>): Partial<RouteParams> => {
  const billing = takeFirst(raw.billing);
  const schoolType = takeFirst(raw.schoolType);
  return {
    planId: takeFirst(raw.planId),
    billing: billing === 'annual' ? 'annual' : 'monthly',
    schoolType: schoolType === 'k12_school' || schoolType === 'hybrid' || schoolType === 'preschool'
      ? schoolType
      : undefined,
    auto: takeFirst(raw.auto) === '1' ? '1' : undefined,
    source: takeFirst(raw.source),
    reason: takeFirst(raw.reason),
  };
};

export default function SubscriptionSetupScreen() {
  const rawParams = useLocalSearchParams();
  const params = useMemo(() => asRouteParams(rawParams as Record<string, unknown>), [rawParams]);
  const { showAlert, alertProps } = useAlertModal();
  const {
    plans,
    schoolInfo,
    loading,
    loadError,
    selectedPlan,
    annual,
    creating,
    existingSubscription,
    isParent,
    isParentPlus,
    currentTier,
    parentOverageConfig,
    setSelectedPlan,
    setAnnual,
    createSubscription,
    retryLoad,
    requestParentOverage,
  } = useSubscriptionSetup({ params, showAlert });
  const { data: aiLimits } = useAIUserLimits();
  const styles = useMemo(() => createStyles(), []);

  const hasContext = Boolean(params.source || params.reason);
  const reason = useMemo(() => resolveReason(params.source, params.reason), [params.reason, params.source]);

  const quotaLimit = Number((aiLimits as any)?.quotas?.homework_help || 0);
  const quotaUsed = Number(
    (aiLimits as any)?.used?.homework_help ??
    (aiLimits as any)?.current_usage?.homework_help ??
    0,
  );
  const quotaRemaining = Math.max(0, quotaLimit - quotaUsed);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <EduDashSpinner size="large" color="#00f5ff" />
        <Text style={styles.loadingText}>Loading subscription plans...</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Unable to load plans</Text>
          <Text style={styles.errorMessage}>{loadError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={retryLoad} accessibilityRole="button" accessibilityLabel="Retry loading plans">
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (existingSubscription && !isParent) {
    const planInfo = existingSubscription.subscription_plans;
    const planName = planInfo?.name || planInfo?.tier || 'Active Plan';

    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <Stack.Screen
          options={{
            title: 'Subscription Active',
            headerStyle: { backgroundColor: '#0b1220' },
            headerTitleStyle: { color: '#fff' },
            headerTintColor: '#00f5ff',
          }}
        />
        <StatusBar style="light" backgroundColor="#0b1220" />
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <View style={styles.existingSubscriptionCard}>
            <Text style={styles.existingTitle}>Active Subscription</Text>
            <Text style={styles.existingSubtitle}>Your school already has an active subscription.</Text>
            <View style={styles.subscriptionInfo}>
              <Text style={styles.infoLabel}>Plan</Text>
              <Text style={styles.infoValue}>{planName}</Text>
            </View>
            <View style={styles.subscriptionInfo}>
              <Text style={styles.infoLabel}>Status</Text>
              <Text style={styles.infoValue}>{String(existingSubscription.status || 'active')}</Text>
            </View>
            <View style={styles.subscriptionInfo}>
              <Text style={styles.infoLabel}>Seats</Text>
              <Text style={styles.infoValue}>{existingSubscription.seats_used} / {existingSubscription.seats_total}</Text>
            </View>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.push('/screens/principal-seat-management')}
              accessibilityRole="button"
              accessibilityLabel="Manage teacher seats"
            >
              <Text style={styles.primaryButtonText}>Manage Teacher Seats</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Text style={styles.secondaryButtonText}>Maybe later</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
        <AlertModal {...alertProps} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <Stack.Screen
        options={{
          title: 'Setup Subscription',
          headerStyle: { backgroundColor: '#0b1220' },
          headerTitleStyle: { color: '#fff' },
          headerTintColor: '#00f5ff',
        }}
      />
      <StatusBar style="light" backgroundColor="#0b1220" />
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {hasContext ? (
          <>
            <UpgradeHeader reason={reason} currentTier={formatTier(currentTier)} />
            {!!params.source && (
              <View style={styles.sourceTag}>
                <Text style={styles.sourceTagText}>{params.source.replace(/[_-]+/g, ' ')}</Text>
              </View>
            )}
          </>
        ) : (
          <View style={styles.plainHeader}>
            <Text style={styles.title}>Choose Your Subscription Plan</Text>
            <Text style={styles.subtitle}>
              {isParent
                ? 'Upgrade to unlock premium family learning features.'
                : schoolInfo
                  ? `Select a plan for ${schoolInfo.name} (${getSchoolTypeLabel(schoolInfo.school_type)})`
                  : 'Select a plan to enable teacher seat management for your school.'}
            </Text>
          </View>
        )}

        {schoolInfo?.school_type && (
          <View style={styles.schoolTypeInfo}>
            <Text style={styles.schoolTypeLabel}>School Type: {getSchoolTypeLabel(schoolInfo.school_type)}</Text>
            <Text style={styles.schoolTypeDescription}>{getSchoolTypeDescription(schoolInfo.school_type)}</Text>
          </View>
        )}

        <View style={styles.toggleRow}>
          <TouchableOpacity
            onPress={() => setAnnual(false)}
            style={[styles.toggleBtn, !annual && styles.toggleBtnActive]}
            accessibilityRole="button"
            accessibilityLabel="Switch to monthly billing"
          >
            <Text style={[styles.toggleBtnText, !annual && styles.toggleBtnTextActive]}>Monthly</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setAnnual(true)}
            style={[styles.toggleBtn, annual && styles.toggleBtnActive]}
            accessibilityRole="button"
            accessibilityLabel="Switch to annual billing"
          >
            <Text style={[styles.toggleBtnText, annual && styles.toggleBtnTextActive]}>Annual (Save 10%)</Text>
          </TouchableOpacity>
        </View>

        {isParentPlus && (
          <View style={styles.overageCard}>
            <Text style={styles.overageTitle}>Parent Plus overage options</Text>
            <Text style={styles.overageText}>
              {quotaLimit > 0
                ? `Homework Helper usage this month: ${quotaUsed}/${quotaLimit} (${quotaRemaining} remaining).`
                : 'Homework Helper usage is tracked monthly for your Parent Plus plan.'}
            </Text>
            <Text style={styles.overageText}>
              Add overage access when you need more support this month.
            </Text>
            <View style={styles.overageActions}>
              {parentOverageConfig?.overageEnabled && parentOverageConfig.overageUnitPrice > 0 && (
                <TouchableOpacity
                  style={styles.overageButton}
                  onPress={() => requestParentOverage('payg')}
                  accessibilityRole="button"
                  accessibilityLabel="Enable pay as you go overage"
                >
                  <Text style={styles.overageButtonText}>
                    Enable pay-as-you-go (R{parentOverageConfig.overageUnitPrice.toFixed(2)} per extra request)
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.overageButton, styles.overageButtonSecondary]}
                onPress={() => requestParentOverage('pack_50')}
                accessibilityRole="button"
                accessibilityLabel="Request fifty extra homework helper requests"
              >
                <Text style={styles.overageButtonText}>Request +50 Homework Helper pack</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.overageButton, styles.overageButtonSecondary]}
                onPress={() => requestParentOverage('pack_150')}
                accessibilityRole="button"
                accessibilityLabel="Request one hundred fifty extra homework helper requests"
              >
                <Text style={styles.overageButtonText}>Request +150 Homework Helper pack</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.divider} />
        <Text style={styles.headingLabel}>Plans</Text>
        <View style={styles.plansContainer}>
          {plans.map((plan) => {
            const normalizedPlanTier = String(plan.tier || '').toLowerCase().replace(/-/g, '_');
            const normalizedCurrentTier = currentTier.replace(/-/g, '_');
            const isCurrentPlan = normalizedPlanTier === normalizedCurrentTier;
            const isSelected = selectedPlan === plan.id || (!selectedPlan && isCurrentPlan);

            return (
              <PlanCard
                key={plan.id}
                plan={plan}
                annual={annual}
                selected={isSelected}
                isCurrentPlan={isCurrentPlan}
                onSelect={() => setSelectedPlan(plan.id)}
                onSubscribe={() => createSubscription(plan.id)}
                creating={creating}
                schoolType={schoolInfo?.school_type || params.schoolType}
              />
            );
          })}
        </View>

        {plans.length === 0 && (
          <View style={styles.noPlansCard}>
            <Text style={styles.noPlansText}>No plans available right now</Text>
            <Text style={styles.noPlansSubtext}>Please try again later or contact support.</Text>
          </View>
        )}

        <TouchableOpacity style={styles.backLink} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Maybe later">
          <Text style={styles.backLinkText}>Maybe later</Text>
        </TouchableOpacity>
      </ScrollView>
      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}
