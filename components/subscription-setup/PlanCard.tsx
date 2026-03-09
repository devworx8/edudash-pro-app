import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { SubscriptionPlan } from './types';
import { getPlanColor, isParentPlan, convertPriceToRands, isLaunchPromoActive } from './utils';

interface PlanCardProps {
  plan: SubscriptionPlan;
  annual: boolean;
  selected: boolean;
  isCurrentPlan?: boolean;
  onSelect: () => void;
  onSubscribe: () => void;
  creating: boolean;
  schoolType?: string;
}

export function PlanCard({
  plan,
  annual,
  selected,
  isCurrentPlan = false,
  onSelect,
  onSubscribe,
  creating,
  schoolType,
}: PlanCardProps) {
  const tierLower = (plan.tier || '').toLowerCase();
  const isParentTier = isParentPlan(plan.tier);
  const rawPrice = annual ? plan.price_annual : plan.price_monthly;
  const priceInRands = convertPriceToRands(rawPrice);

  const rawYearlySavings = annual ? Math.round((plan.price_monthly * 12 - plan.price_annual) / 12) : 0;
  const savings = rawYearlySavings > 100 ? rawYearlySavings / 100 : rawYearlySavings;
  const isFree = rawPrice === 0;
  const isEnterprise = tierLower === 'enterprise';

  // Database stores BASE prices. Apply promo discount for display (monthly only).
  const isParentPromoEligible = isLaunchPromoActive() && isParentTier && !isFree && !isEnterprise && priceInRands > 0 && !annual;
  const originalPriceInRands = priceInRands;
  const promoPriceInRands = isParentPromoEligible ? priceInRands * 0.5 : priceInRands;

  const isRecommended =
    schoolType &&
    plan.school_types &&
    plan.school_types.includes(schoolType) &&
    plan.school_types.length === 1;

  const planColor = getPlanColor(plan.tier);

  return (
    <View style={[styles.planCard, selected && styles.planCardSelected, isCurrentPlan && styles.planCardCurrent]}>
      <TouchableOpacity style={styles.planCardTouchable} onPress={onSelect} activeOpacity={0.8}>
        <View style={styles.planHeader}>
          <View style={styles.planTitleRow}>
            <View style={styles.planTitleContainer}>
              <Text style={styles.planName}>{plan.name}</Text>
              <View style={[styles.planTierBadge, { backgroundColor: planColor + '20' }]}>
                <Text style={[styles.planTier, { color: planColor }]}>{plan.tier}</Text>
              </View>
            </View>
            {isRecommended && (
              <View style={styles.recommendedBadge}>
                <Text style={styles.recommendedText}>Recommended</Text>
              </View>
            )}
            {isCurrentPlan && (
              <View style={styles.currentBadge}>
                <Text style={styles.currentBadgeText}>Current Plan</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.priceSection}>
          <View style={styles.priceContainer}>
            {isFree ? (
              <Text style={styles.freePrice}>Free</Text>
            ) : isEnterprise ? (
              <Text style={styles.customPrice}>Custom</Text>
            ) : (
              <>
                <Text style={[styles.price, { color: planColor }]}>
                  R{promoPriceInRands.toFixed(2)}
                </Text>
                <Text style={styles.pricePeriod}>/ {annual ? 'year' : 'month'}</Text>
              </>
            )}
          </View>
          {isParentPromoEligible && (
            <View style={styles.savingsBadge}>
              <Text style={styles.savings}>
                <Text style={{ textDecorationLine: 'line-through' }}>
                  R{originalPriceInRands.toFixed(2)}
                </Text>{' '}
                launch special
              </Text>
            </View>
          )}
          {savings > 0 && (
            <View style={styles.savingsBadge}>
              <Text style={styles.savings}>Save R{savings.toFixed(2)}/mo</Text>
            </View>
          )}
        </View>

        <View style={styles.planDetailsSection}>
          {plan.tier && !isParentTier && (
            <View style={styles.limitsContainer}>
              {plan.max_teachers > 0 && (
                <View style={styles.limitRow}>
                  <Text style={styles.limitIcon}>👥</Text>
                  <Text style={styles.limitItem}>Up to {plan.max_teachers} teachers</Text>
                </View>
              )}
              {plan.max_students > 0 && (
                <View style={styles.limitRow}>
                  <Text style={styles.limitIcon}>🎓</Text>
                  <Text style={styles.limitItem}>Up to {plan.max_students} students</Text>
                </View>
              )}
            </View>
          )}
          {plan.tier && isParentTier && plan.max_students > 0 && (
            <View style={styles.limitsContainer}>
              <View style={styles.limitRow}>
                <Text style={styles.limitIcon}>👨‍👩‍👧</Text>
                <Text style={styles.limitItem}>
                  {plan.max_students === 1 ? '1 child' : `Up to ${plan.max_students} children`}
                </Text>
              </View>
            </View>
          )}

          {plan.features && plan.features.length > 0 && (
            <View style={styles.featuresContainer}>
              <Text style={styles.featuresTitle}>Features included:</Text>
              {plan.features.slice(0, 4).map((feature, index) => (
                <View key={index} style={styles.featureRow}>
                  <Text style={styles.featureIcon}>✓</Text>
                  <Text style={styles.featureItem}>{feature}</Text>
                </View>
              ))}
              {plan.features.length > 4 && (
                <Text style={styles.moreFeatures}>+{plan.features.length - 4} more features</Text>
              )}
            </View>
          )}
        </View>
      </TouchableOpacity>

      <View style={styles.ctaSection}>
        {selected ? (
          <TouchableOpacity
            style={[
              styles.subscribeButton,
              { backgroundColor: planColor },
              (creating || isCurrentPlan) && styles.subscribeButtonDisabled,
            ]}
            onPress={onSubscribe}
            disabled={creating || isCurrentPlan}
            testID={`subscribe-${plan.id}`}
            accessibilityRole="button"
            accessibilityLabel={isCurrentPlan ? `${plan.name} current plan` : `Subscribe to ${plan.name}`}
          >
            {creating ? (
              <Text style={styles.subscribeButtonText}>Creating...</Text>
            ) : (
              <>
                <Text style={styles.subscribeButtonText}>
                  {isCurrentPlan
                    ? 'Current Plan'
                    : isFree
                      ? 'Get Started Free'
                      : isEnterprise
                        ? 'Contact Sales'
                        : 'Subscribe Now'}
                </Text>
                {!isCurrentPlan && !isFree && !isEnterprise && (
                  <Text style={styles.subscribeButtonSubtext}>
                    Start your {annual ? 'annual' : 'monthly'} plan
                  </Text>
                )}
              </>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.selectPrompt}>
            <Text style={[styles.selectPromptText, { color: planColor }]}>
              Tap to select this plan
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  planCard: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#1f2937',
    marginBottom: 12,
  },
  planCardSelected: {
    borderColor: '#00f5ff',
  },
  planCardCurrent: {
    borderColor: '#10b981',
  },
  planCardTouchable: {
    flex: 1,
  },
  planHeader: {
    marginBottom: 12,
  },
  planTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  planTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  planName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  planTierBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  planTier: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  recommendedBadge: {
    backgroundColor: '#10b981',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  recommendedText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  currentBadge: {
    backgroundColor: '#10b981',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  currentBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  priceSection: {
    marginBottom: 16,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  price: {
    fontSize: 24,
    fontWeight: '900',
    color: '#00f5ff',
  },
  pricePeriod: {
    fontSize: 16,
    color: '#9CA3AF',
  },
  freePrice: {
    fontSize: 24,
    fontWeight: '900',
    color: '#10b981',
  },
  customPrice: {
    fontSize: 24,
    fontWeight: '900',
    color: '#f59e0b',
  },
  savingsBadge: {
    backgroundColor: '#10b981',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  savings: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  planDetailsSection: {
    marginBottom: 16,
  },
  limitsContainer: {
    marginBottom: 12,
  },
  limitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  limitIcon: {
    fontSize: 14,
  },
  limitItem: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
  },
  featuresContainer: {
    marginBottom: 16,
  },
  featuresTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  featureIcon: {
    color: '#10b981',
    fontSize: 12,
    fontWeight: '600',
  },
  featureItem: {
    color: '#9CA3AF',
    fontSize: 14,
    lineHeight: 20,
  },
  moreFeatures: {
    color: '#9CA3AF',
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
  },
  ctaSection: {
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
    paddingTop: 16,
    marginTop: 8,
  },
  subscribeButton: {
    backgroundColor: '#00f5ff',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  subscribeButtonDisabled: {
    opacity: 0.5,
  },
  subscribeButtonText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 16,
  },
  subscribeButtonSubtext: {
    color: '#000',
    fontSize: 12,
    opacity: 0.7,
    marginTop: 2,
  },
  selectPrompt: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  selectPromptText: {
    fontSize: 14,
    fontWeight: '600',
    opacity: 0.7,
  },
});
