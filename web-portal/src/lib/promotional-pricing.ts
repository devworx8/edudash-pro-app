import { createClient } from '@/lib/supabase/client';

export interface PromotionalCampaign {
  id: string;
  code: string;
  name: string;
  description: string;
  user_type: 'parent' | 'teacher' | 'principal' | 'all';
  tier_filter: string[] | null;
  discount_type: 'percentage' | 'fixed_amount' | 'fixed_price';
  discount_value: number;
  promo_duration_months: number;
  start_date: string;
  end_date: string;
  max_uses: number | null;
  current_uses: number;
  is_active: boolean;
}

export interface PromotionalPrice {
  originalPrice: number;
  promoPrice: number;
  discountPercent: number;
  promoEndDate: string | null;
  hasPromo: boolean;
  campaign?: PromotionalCampaign;
}

/**
 * Get promotional price for a specific tier and user
 * Returns both original and promotional prices
 */
export async function getPromotionalPrice(
  userId: string,
  tier: 'parent_starter' | 'parent_plus' | 'teacher_starter' | 'teacher_pro' | 'school_starter' | 'school_premium' | 'school_pro' | 'school_enterprise',
  userType: 'parent' | 'teacher' | 'principal' = 'parent'
): Promise<PromotionalPrice> {
  const supabase = createClient();

  // Get original price from tier
  const originalPrices: Record<string, number> = {
    parent_starter: 99.00,
    parent_plus: 199.00,
    teacher_starter: 149.00,
    teacher_pro: 299.00,
    school_starter: 299.00,
    school_premium: 499.00,
    school_pro: 899.00,
    school_enterprise: 1999.00,
  };

  const originalPrice = originalPrices[tier] || 0;

  try {
    // Call database function to get promotional price
    const { data, error } = await supabase.rpc('get_promotional_price', {
      p_user_id: userId,
      p_tier: tier,
      p_user_type: userType,
      p_original_price: originalPrice,
    });

    if (error) {
      console.error('Error fetching promotional price:', error);
      return {
        originalPrice,
        promoPrice: originalPrice,
        discountPercent: 0,
        promoEndDate: null,
        hasPromo: false,
      };
    }

    const promoPrice = data as number;
    const hasPromo = promoPrice < originalPrice;
    const discountPercent = hasPromo
      ? Math.round(((originalPrice - promoPrice) / originalPrice) * 100)
      : 0;

    // Get user's active promo subscription to find end date
    let promoEndDate: string | null = null;
    let campaign: PromotionalCampaign | undefined;

    if (hasPromo) {
      const { data: promoSub } = await supabase
        .from('user_promotional_subscriptions')
        .select('promo_end_date, promotional_campaigns(*)')
        .eq('user_id', userId)
        .eq('tier', tier)
        .eq('is_active', true)
        .gte('promo_end_date', new Date().toISOString())
        .single();

      if (promoSub) {
        promoEndDate = promoSub.promo_end_date;
        campaign = (promoSub as any).promotional_campaigns;
      }
    }

    return {
      originalPrice,
      promoPrice,
      discountPercent,
      promoEndDate,
      hasPromo,
      campaign,
    };
  } catch (error) {
    console.error('Error in getPromotionalPrice:', error);
    return {
      originalPrice,
      promoPrice: originalPrice,
      discountPercent: 0,
      promoEndDate: null,
      hasPromo: false,
    };
  }
}

/**
 * Record that a user has signed up for a promotional subscription
 * This should be called after successful payment
 */
export async function recordPromotionalSubscription(
  userId: string,
  tier: 'parent_starter' | 'parent_plus' | 'teacher_starter' | 'teacher_pro' | 'school_starter' | 'school_premium' | 'school_pro' | 'school_enterprise',
  userType: 'parent' | 'teacher' | 'principal' = 'parent'
): Promise<{ success: boolean; promoEndDate?: string; error?: string }> {
  const supabase = createClient();

  const originalPrices: Record<string, number> = {
    parent_starter: 99.00,
    parent_plus: 199.00,
    teacher_starter: 149.00,
    teacher_pro: 299.00,
    school_starter: 299.00,
    school_premium: 499.00,
    school_pro: 899.00,
    school_enterprise: 1999.00,
  };

  const originalPrice = originalPrices[tier] || 0;

  try {
    const { data, error } = await supabase.rpc('record_promotional_subscription', {
      p_user_id: userId,
      p_tier: tier,
      p_user_type: userType,
      p_original_price: originalPrice,
    });

    if (error) {
      console.error('Error recording promotional subscription:', error);
      return { success: false, error: error.message };
    }

    // Fetch the recorded subscription to get promo end date
    const { data: promoSub } = await supabase
      .from('user_promotional_subscriptions')
      .select('promo_end_date')
      .eq('id', data)
      .single();

    return {
      success: true,
      promoEndDate: promoSub?.promo_end_date,
    };
  } catch (error) {
    console.error('Error in recordPromotionalSubscription:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get all active promotional campaigns
 * Useful for displaying available promos on pricing page
 */
export async function getActiveCampaigns(
  userType?: 'parent' | 'teacher' | 'principal'
): Promise<PromotionalCampaign[]> {
  const supabase = createClient();

  let query = supabase
    .from('promotional_campaigns')
    .select('*')
    .eq('is_active', true)
    .lte('start_date', new Date().toISOString())
    .gte('end_date', new Date().toISOString());

  if (userType) {
    query = query.or(`user_type.eq.${userType},user_type.eq.all`);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching active campaigns:', error);
    return [];
  }

  return data as PromotionalCampaign[];
}

/**
 * Calculate days remaining until promo enrollment deadline
 */
export function getDaysUntilPromoDeadline(endDate: string): number {
  const now = new Date();
  const deadline = new Date(endDate);
  const diffTime = deadline.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/**
 * Format promotional pricing display
 */
export function formatPromoDisplay(promo: PromotionalPrice): {
  displayPrice: string;
  originalPriceDisplay: string;
  savingsText: string;
} {
  return {
    displayPrice: `R${promo.promoPrice.toFixed(2)}`,
    originalPriceDisplay: `R${promo.originalPrice.toFixed(2)}`,
    savingsText: promo.hasPromo
      ? `Save ${promo.discountPercent}% for ${promo.campaign?.promo_duration_months || 6} months`
      : '',
  };
}
