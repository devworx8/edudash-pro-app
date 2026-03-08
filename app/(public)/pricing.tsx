import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { marketingTokens } from '@/components/marketing/tokens';
import { GlassCard } from '@/components/marketing/GlassCard';
import { GradientButton } from '@/components/marketing/GradientButton';
import { QASection } from '@/components/marketing/sections/QASection';
import { supabase } from '@/lib/supabase';
import { listActivePlans, type SubscriptionPlan } from '@/lib/subscriptions/rpc-subscriptions';
import { EARLY_BIRD_DISCOUNT, TIER_PRICING, getEarlyBirdPrice, normalizeTierName, type TierNameAligned } from '@/lib/tiers';

/** Feature item in a plan */
interface PlanFeature {
  name: string;
  included: boolean;
}

/** Mapped plan for display */
interface MappedPlan {
  name: string;
  price: string;
  period: string;
  description: string;
  features: PlanFeature[];
  cta: string;
  featured: boolean;
  badge: string | null;
  tier: string;
  sortOrder: number;
}

// Fallback plans - Correct order: Parent plans, then School plans
const fallbackPlans = [
  // Parent Plans
  {
    name: 'Parent Starter',
    price: 'R49.50',
    period: 'per month',
    description: 'Perfect for parents managing 1-2 children',
    features: [
      { name: 'Track 1-2 children', included: true },
      { name: 'View assignments & grades', included: true },
      { name: 'Parent-teacher messaging', included: true },
      { name: 'Progress reports', included: true },
      { name: 'Calendar & events', included: true },
    ],
    cta: 'Start Free Trial',
    featured: true,
    badge: 'MOST POPULAR',
    tier: 'parent_starter',
    sortOrder: 1,
  },
  {
    name: 'Parent Plus',
    price: 'R99.50',
    period: 'per month',
    description: 'For parents with 3+ children or extended features',
    features: [
      { name: 'Track up to 5 children', included: true },
      { name: 'Everything in Starter', included: true },
      { name: 'AI homework help', included: true },
      { name: 'Advanced progress analytics', included: true },
      { name: 'Priority support', included: true },
      { name: 'Export reports', included: true },
    ],
    cta: 'Start Free Trial',
    featured: false,
    badge: null,
    tier: 'parent_plus',
    sortOrder: 2,
  },
  
  // Learner Plans (adult 18+, self-service)
  {
    name: 'Learner Starter',
    price: 'R99',
    period: 'per month',
    description: 'For adult learners wanting AI-assisted self-study',
    features: [
      { name: 'AI study assistant', included: true },
      { name: 'Progress tracking', included: true },
      { name: 'Subject quizzes & games', included: true },
      { name: 'Exam prep tools', included: true },
      { name: 'Mobile app access', included: true },
    ],
    cta: 'Start Free Trial',
    featured: false,
    badge: null,
    tier: 'learner_starter',
    sortOrder: 8,
  },
  {
    name: 'Learner Pro',
    price: 'R199',
    period: 'per month',
    description: 'Full AI power for serious adult learners',
    features: [
      { name: 'Everything in Learner Starter', included: true },
      { name: 'Unlimited AI interactions', included: true },
      { name: 'Advanced analytics', included: true },
      { name: 'Custom study plan', included: true },
      { name: 'Download study packs', included: true },
      { name: 'Priority support', included: true },
    ],
    cta: 'Start Free Trial',
    featured: false,
    badge: null,
    tier: 'learner_pro',
    sortOrder: 9,
  },

  // School/Organization Plans
  {
    name: 'Free',
    price: 'R0',
    period: 'forever',
    description: 'Perfect for small preschools getting started',
    features: [
      { name: 'Up to 2 teachers', included: true },
      { name: 'Up to 50 students', included: true },
      { name: 'Basic dashboard', included: true },
      { name: 'Parent communication', included: true },
    ],
    cta: 'Get Started',
    featured: false,
    badge: null,
    tier: 'free',
    sortOrder: 3,
  },
  {
    name: 'School Starter',
    price: 'R399',
    period: 'per month',
    description: 'Most popular choice for growing schools',
    features: [
      { name: 'Up to 5 teachers', included: true },
      { name: 'Up to 150 students', included: true },
      { name: 'AI-powered insights', included: true },
      { name: 'Parent portal', included: true },
      { name: 'WhatsApp notifications', included: true },
    ],
    cta: 'Start Free Trial',
    featured: false,
    badge: null,
    tier: 'school_starter',
    sortOrder: 4,
  },
  {
    name: 'School Premium',
    price: 'R599',
    period: 'per month',
    description: 'Best for schools and organizations seeking advanced features',
    features: [
      { name: 'Up to 15 teachers', included: true },
      { name: 'Up to 500 students', included: true },
      { name: 'Advanced reporting', included: true },
      { name: 'Priority support', included: true },
      { name: 'Custom branding', included: true },
      { name: 'API access', included: true },
    ],
    cta: 'Start Free Trial',
    featured: true,
    badge: 'BEST FOR SCHOOLS',
    tier: 'school_premium',
    sortOrder: 5,
  },
  {
    name: 'School Pro',
    price: 'R999',
    period: 'per month',
    description: 'Advanced features for large schools',
    features: [
      { name: 'Up to 30 teachers', included: true },
      { name: 'Up to 1000 students', included: true },
      { name: 'Everything in Premium', included: true },
      { name: 'Dedicated account manager', included: true },
      { name: 'Advanced AI features', included: true },
      { name: 'Priority API access', included: true },
    ],
    cta: 'Start Free Trial',
    featured: false,
    badge: null,
    tier: 'school_pro',
    sortOrder: 6,
  },
  {
    name: 'School Enterprise',
    price: 'Custom',
    period: 'contact us',
    description: 'Custom pricing for large organizations and multi-school networks',
    features: [
      { name: 'Up to 100 teachers', included: true },
      { name: 'Unlimited students', included: true },
      { name: 'Dedicated success manager', included: true },
      { name: 'SLA guarantee', included: true },
      { name: 'White-label solution', included: true },
      { name: 'Custom integrations', included: true },
      { name: '24/7 priority support', included: true },
    ],
    cta: 'Contact Sales',
    featured: false,
    badge: null,
    tier: 'school_enterprise',
    sortOrder: 7,
  },
];

/**
 * Detailed public pricing page (no auth required)
 */
export default function PricingPage() {
  const [plans, setPlans] = useState(fallbackPlans);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const isTablet = width >= 768;

  useEffect(() => {
    (async () => {
      try {
        let mapped: MappedPlan[] | null = null;

        const data = await listActivePlans(supabase);

        if (Array.isArray(data) && data.length > 0) {
          // Map database plans to display format
          mapped = data.map((p: SubscriptionPlan) => {
            const normalizedTier = normalizeTierName(String(p.tier || ''));
            const isEnterprise = normalizedTier === 'school_enterprise';
            const isFree = normalizedTier === 'free';
            const promoActive = EARLY_BIRD_DISCOUNT.enabled && new Date() <= EARLY_BIRD_DISCOUNT.endDate;
            const basePricing = TIER_PRICING[normalizedTier];
            const promoPricing = promoActive && normalizedTier.startsWith('parent_') ? getEarlyBirdPrice(normalizedTier) : null;
            
            // Handle pricing display
            let price = 'Custom';
            let period = 'contact us';
            
            if (isFree) {
              price = 'R0';
              period = 'forever';
            } else {
              const monthly = promoPricing?.monthly ?? basePricing?.monthly ?? p.price_monthly;
              if (!monthly || monthly === 0 || isEnterprise) {
                price = 'Custom';
                period = 'contact us';
              } else {
                price = `R${monthly.toFixed(2)}`;
                period = 'per month';
              }
            }
            
            // Determine sort order
            const tierOrder: { [key: string]: number } = {
              'parent_starter': 1,
              'parent_plus': 2,
              'free': 3,
              'school_starter': 4,
              'school_premium': 5,
              'school_pro': 6,
              'school_enterprise': 7,
            };
            
            return {
              name: p.name,
              price,
              period,
              description: p.description || '',
              features: Array.isArray(p.features)
                ? (p.features as unknown[]).map((f) =>
                    typeof f === 'string' ? { name: f, included: true } : (f as { name: string; included: boolean })
                  )
                : [],
              cta: isEnterprise || price === 'Custom' ? 'Contact Sales' : isFree ? 'Get Started' : 'Start Free Trial',
              featured: normalizedTier === 'parent_starter' || normalizedTier === 'school_premium',
              badge: normalizedTier === 'parent_starter' 
                ? 'MOST POPULAR' 
                : normalizedTier === 'school_premium' 
                ? 'BEST FOR SCHOOLS' 
                : null,
              tier: normalizedTier,
              sortOrder: (p.sort_order ?? tierOrder[normalizedTier]) || 99,
            };
          });
          
          // Sort by defined order
          mapped.sort((a, b) => a.sortOrder - b.sortOrder);
        }

        setPlans(mapped || fallbackPlans);
      } catch {
        setPlans(fallbackPlans);
      }
    })();
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      {/* Background */}
      <LinearGradient
        colors={marketingTokens.gradients.background}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <IconSymbol name="chevron.left" size={24} color={marketingTokens.colors.fg.primary} />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        </View>

        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Page Title */}
          <View style={styles.titleSection}>
            <Text style={styles.overline}>PRICING</Text>
            <Text style={styles.title}>Choose Your Plan</Text>
            <Text style={styles.subtitle}>
              Transparent pricing for parents, teachers, and schools.{'\n'}
              All plans include a 14-day free trial.
            </Text>
          </View>

          {/* Pricing Cards */}
          <View style={[styles.grid, isDesktop && styles.gridDesktop, isTablet && !isDesktop && styles.gridTablet]}>
            {plans.map((plan) => (
              <View
                key={plan.name}
                style={[
                  styles.cardWrapper,
                  isTablet && !isDesktop && styles.cardWrapperTablet,
                  isDesktop && styles.cardWrapperDesktop,
                ]}
              >
                <GlassCard 
                  intensity={plan.featured ? 'strong' : 'medium'}
                  style={[
                    styles.card,
                    plan.featured && styles.featuredCard,
                  ]}
                >
                  {/* Badge */}
                  {plan.badge && (
                    <View style={styles.featuredBadge}>
                      <LinearGradient
                        colors={marketingTokens.gradients.primary}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.badgeGradient}
                      >
                        <Text numberOfLines={1} ellipsizeMode="clip" style={styles.badgeText}>{plan.badge}</Text>
                      </LinearGradient>
                    </View>
                  )}

                  {/* Plan Header */}
                  <Text style={styles.planName}>{plan.name}</Text>
                  <Text style={styles.planDescription}>{plan.description}</Text>

                  {/* Price */}
                  <View style={styles.priceContainer}>
                    <Text style={styles.price}>{plan.price}</Text>
                    <Text style={styles.period}>{plan.period}</Text>
                  </View>

                  {/* Features List */}
                  <View style={styles.features}>
                    {plan.features.map((feature, idx) => (
                      <View key={idx} style={styles.featureRow}>
                        <IconSymbol 
                          name={feature.included ? 'checkmark.circle.fill' : 'xmark.circle'} 
                          size={18} 
                          color={
                            feature.included 
                              ? marketingTokens.colors.accent.cyan400 
                              : marketingTokens.colors.fg.tertiary
                          }
                        />
                        <Text style={[
                          styles.featureText,
                          !feature.included && styles.featureTextDisabled,
                        ]}>
                          {feature.name}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {/* CTA */}
                  <GradientButton
                    label={plan.cta}
                    onPress={() => router.push('/(auth)/sign-up')}
                    size="md"
                    variant={plan.featured ? 'primary' : 'indigo'}
                    style={styles.cta}
                  />
                </GlassCard>
              </View>
            ))}
          </View>

          {/* FAQ Section */}
          <QASection />

          {/* Contact Support */}
          <View style={styles.contact}>
            <Text style={styles.contactTitle}>Need help choosing?</Text>
            <Text style={styles.contactText}>
              Our team is here to help you find the perfect plan for your preschool.
            </Text>
            <Pressable
              onPress={() => router.push('/(auth)/sign-up')}
              style={styles.contactButton}
            >
              <Text style={styles.contactButtonText}>Contact Sales</Text>
              <IconSymbol name="arrow.right" size={16} color={marketingTokens.colors.accent.cyan400} />
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: marketingTokens.colors.bg.base,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: marketingTokens.spacing.lg,
    paddingVertical: marketingTokens.spacing.md,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: marketingTokens.spacing.sm,
  },
  backText: {
    ...marketingTokens.typography.body,
    color: marketingTokens.colors.fg.primary,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: marketingTokens.spacing.lg,
    paddingBottom: marketingTokens.spacing['4xl'],
    maxWidth: 1400,
    width: '100%',
    alignSelf: 'center',
  },
  titleSection: {
    alignItems: 'center',
    marginBottom: marketingTokens.spacing['3xl'],
  },
  overline: {
    ...marketingTokens.typography.overline,
    color: marketingTokens.colors.accent.cyan400,
    marginBottom: marketingTokens.spacing.sm,
  },
  title: {
    ...marketingTokens.typography.h1,
    fontSize: 32,
    color: marketingTokens.colors.fg.primary,
    textAlign: 'center',
    marginBottom: marketingTokens.spacing.md,
  },
  subtitle: {
    ...marketingTokens.typography.body,
    color: marketingTokens.colors.fg.secondary,
    textAlign: 'center',
    maxWidth: 480,
  },
  grid: {
    gap: marketingTokens.spacing.xl,
    marginBottom: marketingTokens.spacing['4xl'],
  },
  gridTablet: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  gridDesktop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: marketingTokens.spacing['2xl'],
  },
  cardWrapper: {
    marginTop: marketingTokens.spacing.md,
    width: '100%',
  },
  cardWrapperTablet: {
    width: '48%',
    minWidth: 320,
  },
  cardWrapperDesktop: {
    width: '31%',
    minWidth: 340,
    maxWidth: 400,
  },
  card: {
    position: 'relative',
    paddingTop: marketingTokens.spacing.xl,
  },
  featuredCard: {
    borderColor: marketingTokens.colors.accent.cyan400,
    borderWidth: 2,
  },
  featuredBadge: {
    position: 'absolute',
    top: -14,
    left: '50%',
    transform: [{ translateX: -60 }],
    borderRadius: marketingTokens.radii.full,
    overflow: 'hidden',
  },
  badgeGradient: {
    paddingHorizontal: marketingTokens.spacing['2xl'],
    paddingVertical: marketingTokens.spacing.xs,
    minWidth: 140,
    alignItems: 'center',
  },
  badgeText: {
    ...marketingTokens.typography.overline,
    color: marketingTokens.colors.fg.inverse,
    fontWeight: '800',
    fontSize: 10,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  planName: {
    ...marketingTokens.typography.h2,
    color: marketingTokens.colors.fg.primary,
    marginBottom: marketingTokens.spacing.sm,
  },
  planDescription: {
    ...marketingTokens.typography.caption,
    color: marketingTokens.colors.fg.secondary,
    marginBottom: marketingTokens.spacing.xl,
    minHeight: 40,
  },
  priceContainer: {
    alignItems: 'center',
    marginBottom: marketingTokens.spacing.xl,
  },
  price: {
    fontSize: 48,
    fontWeight: '900',
    color: marketingTokens.colors.fg.primary,
    lineHeight: 56,
  },
  period: {
    ...marketingTokens.typography.caption,
    color: marketingTokens.colors.fg.tertiary,
  },
  features: {
    gap: marketingTokens.spacing.md,
    marginBottom: marketingTokens.spacing.xl,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: marketingTokens.spacing.sm,
  },
  featureText: {
    ...marketingTokens.typography.body,
    fontSize: 14,
    color: marketingTokens.colors.fg.secondary,
    flex: 1,
  },
  featureTextDisabled: {
    opacity: 0.5,
    textDecorationLine: 'line-through',
  },
  cta: {
    width: '100%',
  },
  contact: {
    alignItems: 'center',
  },
  contactTitle: {
    ...marketingTokens.typography.h3,
    color: marketingTokens.colors.fg.primary,
    marginBottom: marketingTokens.spacing.sm,
  },
  contactText: {
    ...marketingTokens.typography.body,
    color: marketingTokens.colors.fg.secondary,
    textAlign: 'center',
    marginBottom: marketingTokens.spacing.lg,
    maxWidth: 400,
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: marketingTokens.spacing.sm,
    paddingVertical: marketingTokens.spacing.md,
  },
  contactButtonText: {
    ...marketingTokens.typography.body,
    color: marketingTokens.colors.accent.cyan400,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
