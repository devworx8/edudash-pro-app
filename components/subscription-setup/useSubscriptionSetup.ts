import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { assertSupabase } from '@/lib/supabase';
import { listActivePlans, type SubscriptionPlan } from '@/lib/subscriptions/rpc-subscriptions';
import { track } from '@/lib/analytics';
import { createCheckout } from '@/lib/payments';
import { navigateTo } from '@/lib/navigation/router-utils';
import { getReturnUrl, getCancelUrl } from '@/lib/payments/urls';
import { isParentPlan } from '@/components/subscription-setup/utils';
import type { AlertButton } from '@/components/ui/AlertModal';
import type { ParentOverageConfig, RouteParams } from '@/components/subscription-setup/types';

type AlertType = 'info' | 'warning' | 'success' | 'error';

type ShowAlertConfig = {
  title: string;
  message?: string;
  type?: AlertType;
  buttons?: AlertButton[];
};

type NormalizedPlan = SubscriptionPlan & {
  features: string[];
  school_types: string[];
};

type UseSubscriptionSetupInput = {
  params: Partial<RouteParams>;
  showAlert: (config: ShowAlertConfig) => void;
};

const SUPPORT_EMAIL = 'support@edudashpro.org.za';

const toNormalizedPlan = (plan: SubscriptionPlan): NormalizedPlan => ({
  ...plan,
  features: Array.isArray(plan.features)
    ? plan.features.map((feature) => (typeof feature === 'string' ? feature : String((feature as any)?.name || feature)))
    : [],
  school_types: Array.isArray(plan.school_types) ? plan.school_types : [],
});

const mapRoutePlanId = (raw?: string): string | undefined => {
  if (!raw) return undefined;
  return raw.trim().replace(/-/g, '_');
};

export function useSubscriptionSetup({ params, showAlert }: UseSubscriptionSetupInput) {
  const { profile, user } = useAuth();
  const { refresh: refreshSubscription, tier } = useSubscription();
  const [allPlans, setAllPlans] = useState<NormalizedPlan[]>([]);
  const [plans, setPlans] = useState<NormalizedPlan[]>([]);
  const [schoolInfo, setSchoolInfo] = useState<{ school_type: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [annual, setAnnual] = useState(params.billing === 'annual');
  const [creating, setCreating] = useState(false);
  const [existingSubscription, setExistingSubscription] = useState<any>(null);
  const [parentOverageConfig, setParentOverageConfig] = useState<ParentOverageConfig | null>(null);
  const autoStartedRef = useRef(false);
  const isParent = profile?.role === 'parent';
  const currentTier = String((tier || (profile as any)?.subscription_tier || 'free')).toLowerCase();
  const isParentPlus = currentTier === 'parent_plus' || currentTier === 'parent-plus';

  const getSchoolId = useCallback(async (): Promise<string | null> => {
    if (isParent) return null;

    const direct = (profile as any)?.organization_id || (profile as any)?.preschool_id;
    if (direct) return String(direct);

    if (!profile?.id) return null;
    try {
      const { data } = await assertSupabase()
        .from('profiles')
        .select('organization_id, preschool_id')
        .eq('id', profile.id)
        .maybeSingle();
      return String((data as any)?.organization_id || (data as any)?.preschool_id || '') || null;
    } catch {
      return null;
    }
  }, [isParent, profile]);

  const loadPlans = useCallback(async () => {
    const data = await listActivePlans(assertSupabase());
    const normalizedPlans = (data || []).map(toNormalizedPlan);
    setAllPlans(normalizedPlans);
  }, []);

  const loadSchoolInfo = useCallback(async () => {
    if (isParent) {
      setSchoolInfo(null);
      return;
    }

    const schoolId = await getSchoolId();
    if (!schoolId) return;

    const { data, error } = await assertSupabase()
      .from('preschools')
      .select('school_type, name')
      .eq('id', schoolId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    setSchoolInfo(data || null);
  }, [getSchoolId, isParent]);

  const checkExistingSubscription = useCallback(async () => {
    if (isParent) {
      setExistingSubscription(null);
      return;
    }

    const schoolId = await getSchoolId();
    if (!schoolId) return;

    const { data, error } = await assertSupabase()
      .from('subscriptions')
      .select(`
        *,
        subscription_plans:plan_id (
          id,
          name,
          tier
        )
      `)
      .eq('school_id', schoolId)
      .eq('status', 'active')
      .maybeSingle();

    if (error && error.code !== 'PGRST116') throw error;
    setExistingSubscription(data || null);
  }, [getSchoolId, isParent]);

  const loadParentOverageConfig = useCallback(async () => {
    if (!isParentPlus) {
      setParentOverageConfig(null);
      return;
    }

    try {
      const { data, error } = await assertSupabase()
        .from('plan_quotas')
        .select('quota_type, monthly_limit, overage_enabled, overage_unit_price')
        .eq('plan_tier', 'parent_plus')
        .eq('quota_type', 'homework_help')
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        setParentOverageConfig({
          quotaType: 'homework_help',
          monthlyLimit: 100,
          overageEnabled: false,
          overageUnitPrice: 0,
        });
        return;
      }

      setParentOverageConfig({
        quotaType: String((data as any)?.quota_type || 'homework_help'),
        monthlyLimit: Number((data as any)?.monthly_limit || 100),
        overageEnabled: Boolean((data as any)?.overage_enabled),
        overageUnitPrice: Number((data as any)?.overage_unit_price || 0),
      });
    } catch {
      setParentOverageConfig({
        quotaType: 'homework_help',
        monthlyLimit: 100,
        overageEnabled: false,
        overageUnitPrice: 0,
      });
    }
  }, [isParentPlus]);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      await loadPlans();
      await Promise.all([
        loadSchoolInfo(),
        checkExistingSubscription(),
        loadParentOverageConfig(),
      ]);
    } catch (error: any) {
      setLoadError(error?.message || 'Failed to load subscription options.');
    } finally {
      setLoading(false);
    }
  }, [checkExistingSubscription, loadParentOverageConfig, loadPlans, loadSchoolInfo]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    if (allPlans.length === 0) return;

    let filteredPlans: NormalizedPlan[] = [];
    if (isParent) {
      filteredPlans = allPlans.filter((plan) => {
        const normalizedTier = String(plan.tier || '').toLowerCase();
        return normalizedTier === 'free' || isParentPlan(normalizedTier);
      });
    } else {
      const schoolType = params.schoolType || schoolInfo?.school_type || 'preschool';
      filteredPlans = allPlans.filter((plan) => {
        if (!Array.isArray(plan.school_types) || plan.school_types.length === 0) return true;
        return plan.school_types.includes(schoolType) || plan.school_types.includes('hybrid');
      });
    }

    filteredPlans.sort((a, b) => Number(a.sort_order || 999) - Number(b.sort_order || 999));
    setPlans(filteredPlans);

    track('subscription_plans_filtered', {
      user_type: isParent ? 'parent' : 'school',
      school_type: isParent ? null : (params.schoolType || schoolInfo?.school_type || 'preschool'),
      total_plans: allPlans.length,
      filtered_plans: filteredPlans.length,
      source: params.source || 'unknown',
    });
  }, [allPlans, isParent, params.schoolType, params.source, schoolInfo?.school_type]);

  useEffect(() => {
    if (!params.planId || plans.length === 0) return;
    const target = mapRoutePlanId(params.planId);
    const matchingPlan = plans.find((plan) => {
      const id = mapRoutePlanId(String(plan.id));
      const tierName = mapRoutePlanId(String(plan.tier));
      return id === target || tierName === target;
    });
    if (!matchingPlan) return;

    setSelectedPlan(matchingPlan.id);
    track('subscription_setup_preselected', {
      plan_id: matchingPlan.tier,
      billing: params.billing || 'monthly',
      source: params.source || 'unknown',
      reason: params.reason || 'unknown',
    });
  }, [params.billing, params.planId, params.reason, params.source, plans]);

  useEffect(() => {
    if (params.auto !== '1' || !selectedPlan || creating || autoStartedRef.current) return;
    const plan = plans.find((entry) => entry.id === selectedPlan || entry.tier === selectedPlan);
    if (!plan) return;
    const price = annual ? plan.price_annual : plan.price_monthly;
    const isFree = String(plan.tier || '').toLowerCase() === 'free' || Number(price) <= 0;
    if (isFree) return;
    autoStartedRef.current = true;
    void createSubscription(plan.id);
  }, [annual, creating, params.auto, plans, selectedPlan]);

  const requestParentOverage = useCallback(async (option: 'payg' | 'pack_50' | 'pack_150') => {
    const subject = encodeURIComponent(`Parent Plus Overage Request (${option})`);
    const body = encodeURIComponent(
      `Hi Support,\n\nPlease assist with a Parent Plus overage request.\n\nUser ID: ${user?.id || 'unknown'}\nPlan: ${currentTier}\nOption: ${option}\n\nThanks.`,
    );
    const mailto = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;

    try {
      const canOpen = await Linking.canOpenURL(mailto);
      if (canOpen) {
        await Linking.openURL(mailto);
        return;
      }
    } catch {
      // Fallback alert below.
    }

    showAlert({
      title: 'Overage request',
      message: `Please email ${SUPPORT_EMAIL} and mention option "${option}" so we can enable your overage request.`,
      type: 'info',
    });
  }, [currentTier, showAlert, user?.id]);

  const resolveSchoolIdForCheckout = useCallback(async (): Promise<string | null> => {
    const direct = (profile as any)?.organization_id || (profile as any)?.preschool_id;
    if (direct) return String(direct);
    if (!user?.id) return null;

    try {
      const { data } = await assertSupabase()
        .from('profiles')
        .select('organization_id, preschool_id')
        .eq('id', user.id)
        .maybeSingle();
      return String((data as any)?.organization_id || (data as any)?.preschool_id || '') || null;
    } catch {
      return null;
    }
  }, [profile, user?.id]);

  const createSubscription = useCallback(async (planId: string) => {
    const plan = plans.find((entry) => entry.id === planId);
    if (!plan) {
      showAlert({
        title: 'Plan unavailable',
        message: 'That plan is not available right now. Please refresh and try again.',
        type: 'warning',
      });
      return;
    }

    const planTierLower = String(plan.tier || '').toLowerCase();
    const isEnterprise = planTierLower.includes('enterprise');
    const isFree = planTierLower === 'free';
    const price = annual ? plan.price_annual : plan.price_monthly;

    setCreating(true);
    try {
      if (isEnterprise) {
        showAlert({
          title: 'Enterprise Plan',
          message: 'Enterprise plans require custom setup. Our sales team can help configure this for your institution.',
          type: 'info',
          buttons: [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Contact Sales',
              onPress: () => {
                track('enterprise_redirect_from_setup', {
                  plan_tier: plan.tier,
                  user_role: profile?.role,
                });
                navigateTo.contact();
              },
            },
          ],
        });
        return;
      }

      if (isFree) {
        if (isParent) {
          showAlert({
            title: 'Free Plan',
            message: 'You are already on the free plan. You can continue using core features immediately.',
            type: 'info',
            buttons: [{ text: 'Continue', onPress: () => router.push('/' as any) }],
          });
          return;
        }

        const schoolId = await getSchoolId();
        if (!schoolId) {
          showAlert({
            title: 'School info missing',
            message: 'We could not find your school information. Please sign out and back in, then retry.',
            type: 'warning',
          });
          return;
        }

        let rpcError: any | null = null;
        try {
          const { error } = await assertSupabase().rpc('ensure_school_free_subscription', {
            p_school_id: schoolId,
            p_seats: plan.max_teachers || 1,
          });
          rpcError = error || null;
        } catch (error) {
          rpcError = error;
        }

        if (rpcError) {
          const activePlans = await listActivePlans(assertSupabase());
          const freePlan = activePlans.find((entry) => String(entry.tier || '').toLowerCase() === 'free');
          if (!freePlan?.id) {
            throw new Error('Free plan not found.');
          }

          const { error: upsertError } = await assertSupabase()
            .from('subscriptions')
            .insert({
              school_id: schoolId,
              plan_id: freePlan.id,
              status: 'active',
              billing_frequency: 'monthly',
              seats_total: plan.max_teachers || 1,
              seats_used: 0,
            })
            .select('id')
            .single();

          if (upsertError && !String(upsertError.message || '').toLowerCase().includes('duplicate')) {
            throw upsertError;
          }
        }

        try {
          await assertSupabase()
            .from('preschools')
            .update({ subscription_tier: plan.tier as any })
            .eq('id', schoolId);
        } catch {
          // Non-blocking metadata sync only.
        }

        showAlert({
          title: 'Success',
          message: 'Your free school subscription is active. You can now manage teacher seats.',
          type: 'success',
          buttons: [{ text: 'Continue', onPress: () => router.push('/screens/principal-seat-management' as any) }],
        });
        return;
      }

      const isPlanForParent = isParentPlan(plan.tier);
      const schoolId = isPlanForParent ? null : await resolveSchoolIdForCheckout();
      const scope: 'user' | 'school' = isPlanForParent || !schoolId ? 'user' : 'school';

      if (scope === 'school' && !schoolId) {
        showAlert({
          title: 'School setup required',
          message: 'We could not find your school profile to attach this upgrade. Please sign out, sign in again, and retry.',
          type: 'warning',
        });
        return;
      }

      const checkoutResult = await createCheckout({
        scope,
        schoolId: scope === 'school' ? schoolId ?? undefined : undefined,
        userId: scope === 'user' ? user?.id || profile?.id : undefined,
        planTier: plan.tier,
        billing: annual ? 'annual' : 'monthly',
        seats: plan.max_teachers || 1,
        email_address: profile?.email || user?.email || undefined,
        return_url: getReturnUrl(),
        cancel_url: getCancelUrl(),
      });

      if (checkoutResult.error || !checkoutResult.redirect_url) {
        throw new Error(checkoutResult.error || 'Could not start checkout.');
      }

      track('checkout_redirected', {
        plan_tier: plan.tier,
        billing: annual ? 'annual' : 'monthly',
        price,
        source: params.source || 'unknown',
        reason: params.reason || 'unknown',
      });

      if (Platform.OS === 'web') {
        await Linking.openURL(checkoutResult.redirect_url);
      } else {
        await WebBrowser.openBrowserAsync(checkoutResult.redirect_url, {
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
          showTitle: true,
          toolbarColor: '#0b1220',
        });
      }

      refreshSubscription();
    } catch (error: any) {
      showAlert({
        title: 'Checkout error',
        message: error?.message || 'We could not start checkout right now. Please try again.',
        type: 'error',
      });
      track('checkout_failed', {
        plan_tier: plan.tier,
        error: error?.message || 'unknown',
      });
    } finally {
      setCreating(false);
    }
  }, [
    annual,
    params.reason,
    params.source,
    plans,
    profile?.email,
    profile?.id,
    profile?.role,
    refreshSubscription,
    getSchoolId,
    resolveSchoolIdForCheckout,
    showAlert,
    user?.email,
    user?.id,
  ]);

  const retryLoad = useCallback(() => {
    void loadInitial();
  }, [loadInitial]);

  return useMemo(() => ({
    allPlans,
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
  }), [
    allPlans,
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
  ]);
}
