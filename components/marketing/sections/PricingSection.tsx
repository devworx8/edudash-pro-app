import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withRepeat, withSequence, withDelay } from 'react-native-reanimated';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { marketingTokens } from '../tokens';
import { Section } from '../Section';
import { SectionHeader } from '../SectionHeader';
import { GlassCard } from '../GlassCard';
import { GradientButton } from '../GradientButton';
import { supabase } from '@/lib/supabase';

type DBPlan = {
  id: string;
  name: string;
  tier: string;
  price_monthly: number | null;
  features: string[] | any;
  is_active: boolean;
};

type UIPlan = {
  name: string;
  price: string;
  period: string;
  features: string[];
  cta: string;
  featured: boolean;
};

const fallbackPlans: UIPlan[] = [
  {
    name: 'Free',
    price: 'R0',
    period: 'forever',
    features: ['Up to 50 students', 'Basic lessons', 'Parent messaging', 'Community support'],
    cta: 'Get Started',
    featured: false,
  },
  {
    name: 'School Starter',
    price: 'R399',
    period: 'per month',
    features: ['Up to 150 students', '5 teachers', 'AI-powered insights', 'Parent portal', 'WhatsApp notifications'],
    cta: 'Start Free Trial',
    featured: false,
  },
  {
    name: 'School Premium',
    price: 'R599',
    period: 'per month',
    features: ['Up to 500 students', '15 teachers', 'Advanced reporting', 'Custom branding', 'Priority support'],
    cta: 'Start Free Trial',
    featured: true,
  },
  {
    name: 'School Pro',
    price: 'R999',
    period: 'per month',
    features: ['Up to 1000 students', '30 teachers', 'Dedicated account manager', 'Advanced AI features', 'Priority API access'],
    cta: 'Start Free Trial',
    featured: false,
  },
  {
    name: 'School Enterprise',
    price: 'Custom',
    period: 'contact us',
    features: ['Unlimited students', '100 teachers', 'Dedicated support', 'Custom integrations', 'SLA guarantee'],
    cta: 'Contact Sales',
    featured: false,
  },
];

interface PricingSectionProps {
  columns: number;
}

export function PricingSection({ columns }: PricingSectionProps) {
  const [plansData, setPlansData] = useState<UIPlan[]>(fallbackPlans);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        let uiPlans: UIPlan[] | null = null;

        // Try RPC first
        const rpc = await supabase.rpc('public_list_plans');
        if (!rpc.error && Array.isArray(rpc.data)) {
          uiPlans = rpc.data.map((p: DBPlan) => ({
            name: p.name,
            price: p.price_monthly && p.price_monthly > 0 ? `R${p.price_monthly}` : 'Custom',
            period: p.price_monthly && p.price_monthly > 0 ? 'per month' : 'contact us',
            features: Array.isArray(p.features) ? p.features : [],
            cta: p.price_monthly && p.price_monthly > 0 ? 'Start Free Trial' : 'Contact Sales',
            featured: p.tier === 'school_premium' || p.tier === 'school_pro' || p.tier === 'premium' || p.tier === 'pro',
          }));
        } else {
          // Fallback to direct table select if RPC is unavailable
          const sel = await supabase
            .from('subscription_plans')
            .select('name,tier,price_monthly,features,is_active')
            .eq('is_active', true)
            .order('price_monthly', { ascending: true });

          if (!sel.error && Array.isArray(sel.data)) {
            uiPlans = sel.data.map((p: DBPlan) => ({
              name: p.name,
              price: p.price_monthly && p.price_monthly > 0 ? `R${p.price_monthly}` : 'Custom',
              period: p.price_monthly && p.price_monthly > 0 ? 'per month' : 'contact us',
              features: Array.isArray(p.features) ? p.features : [],
              cta: p.price_monthly && p.price_monthly > 0 ? 'Start Free Trial' : 'Contact Sales',
              featured: p.tier === 'school_premium' || p.tier === 'school_pro' || p.tier === 'premium' || p.tier === 'pro',
            }));
          }
        }

        if (mounted) setPlansData(uiPlans?.slice(0, 3) || fallbackPlans);
      } catch {
        setPlansData(fallbackPlans);
      }
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <Section style={styles.section}>
      <SectionHeader
        overline="Pricing"
        title="Simple, Transparent Pricing"
        subtitle="Choose the plan that fits your preschool's needs"
      />

      <View style={[styles.grid, { gap: columns > 1 ? 20 : 16 }]}>
        {plansData.map((plan, index) => (
          <PricingCard
            key={plan.name}
            plan={plan}
            index={index}
            width={columns === 1 ? '100%' : columns === 2 ? '48%' : '31%'}
          />
        ))}
      </View>

      {/* Trust signal */}
      <View style={styles.trustRow}>
        <IconSymbol name="lock.shield.fill" size={16} color={marketingTokens.colors.accent.green400} />
        <Text style={styles.trustText}>
          14-day free trial • No credit card required • Cancel anytime
        </Text>
      </View>

      {/* View all plans link */}
      <Pressable 
        style={styles.viewAllPlans}
        onPress={() => router.push('/(public)/pricing')}
        accessibilityRole="button"
        accessibilityLabel="View detailed pricing comparison"
      >
        <Text style={styles.viewAllPlansText}>View Detailed Pricing Comparison</Text>
        <IconSymbol name="arrow.right" size={16} color={marketingTokens.colors.accent.cyan400} />
      </Pressable>
    </Section>
  );
}

interface PricingCardProps {
  plan: UIPlan;
  width: string;
  index: number;
}

function PricingCard({ plan, width, index }: PricingCardProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(16);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  // Breathing glow for featured cards
  const glow = useSharedValue(0.6);
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));

  // Animate in on mount
  React.useEffect(() => {
    opacity.value = withDelay(index * 80, withTiming(1, { duration: 400 }));
    translateY.value = withDelay(index * 80, withTiming(0, { duration: 400 }));

    // Start breathing animation for glow (breathing effect)
    glow.value = withRepeat(
      withSequence(
        withTiming(0.9, { duration: 1800 }),
        withTiming(0.6, { duration: 1800 })
      ),
      -1,
      true
    );
  }, [index]);

  return (
    <Animated.View style={[styles.cardWrapper, { width: width as any }, animatedStyle]}>
      {/* Featured glow background */}
      {plan.featured && (
        <Animated.View pointerEvents="none" style={[styles.featuredGlow, glowStyle]}>
          <LinearGradient
            colors={[
              'rgba(76,111,255,0.20)',
              'rgba(43,217,239,0.12)',
              'rgba(76,111,255,0.08)'
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}

      <GlassCard intensity={plan.featured ? 'strong' : 'medium'} style={[
        styles.card,
        plan.featured && styles.featuredCard,
      ]}>
        {/* Featured badge */}
        {plan.featured && (
          <View style={styles.featuredBadge}>
            <LinearGradient
              colors={marketingTokens.gradients.primary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.featuredBadgeGradient}
            >
              <Text numberOfLines={1} ellipsizeMode="clip" style={styles.featuredBadgeText}>MOST POPULAR</Text>
            </LinearGradient>
          </View>
        )}

        {/* Plan name */}
        <Text style={styles.planName}>{plan.name}</Text>

        {/* Price */}
        <View style={styles.priceContainer}>
          <Text style={styles.price}>{plan.price}</Text>
          <Text style={styles.period}>{plan.period}</Text>
        </View>

        {/* Features */}
        <View style={styles.features}>
          {plan.features.map((feature, idx) => (
            <View key={idx} style={styles.featureRow}>
              <IconSymbol 
                name="checkmark.circle.fill" 
                size={16} 
                color={marketingTokens.colors.accent.cyan400} 
              />
              <Text style={styles.featureText}>{feature}</Text>
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
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: marketingTokens.colors.bg.surface,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: marketingTokens.spacing.xl,
  },
  cardWrapper: {
    marginBottom: marketingTokens.spacing.lg,
    marginTop: marketingTokens.spacing.md, // Space for badge
  },
  card: {
    position: 'relative',
    alignItems: 'center',
    paddingTop: marketingTokens.spacing.xl, // Extra space for badge
  },
  featuredCard: {
    borderColor: marketingTokens.colors.accent.cyan400,
    borderWidth: 2,
  },
  featuredGlow: {
    position: 'absolute',
    top: -8,
    bottom: -8,
    left: -8,
    right: -8,
    borderRadius: marketingTokens.radii.lg,
    zIndex: -1,
  },
  featuredBadge: {
    position: 'absolute',
    top: -14,
    left: '50%',
    transform: [{ translateX: -60 }],
    borderRadius: marketingTokens.radii.full,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: marketingTokens.colors.accent.cyan400,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  featuredBadgeGradient: {
    paddingHorizontal: marketingTokens.spacing['2xl'], // Wider badge
    paddingVertical: marketingTokens.spacing.xs,
    minWidth: 140,
    alignItems: 'center',
  },
  featuredBadgeText: {
    ...marketingTokens.typography.overline,
    color: marketingTokens.colors.fg.inverse,
    fontWeight: '800',
    fontSize: 10,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  planName: {
    ...marketingTokens.typography.h3,
    color: marketingTokens.colors.fg.primary,
    marginBottom: marketingTokens.spacing.lg,
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
    letterSpacing: -1,
  },
  period: {
    ...marketingTokens.typography.caption,
    color: marketingTokens.colors.fg.tertiary,
  },
  features: {
    alignSelf: 'stretch',
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
  cta: {
    width: '100%',
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: marketingTokens.spacing.sm,
  },
  trustText: {
    ...marketingTokens.typography.caption,
    color: marketingTokens.colors.fg.tertiary,
  },
  viewAllPlans: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: marketingTokens.spacing.sm,
    paddingVertical: marketingTokens.spacing.md,
    marginTop: marketingTokens.spacing.lg,
  },
  viewAllPlansText: {
    ...marketingTokens.typography.body,
    color: marketingTokens.colors.accent.cyan400,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
