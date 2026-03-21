/**
 * PayFast Checkout Creation Edge Function
 * 
 * Creates PayFast payment URLs for subscription upgrades.
 * Supports both sandbox and production modes based on PAYFAST_MODE secret.
 * 
 * NOTE: If a PayFast passphrase is configured, it must be included in signatures.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { createHash } from 'node:crypto';
import { WEB_BASE_URL } from '../_shared/urls.ts';

// CORS headers for browser requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonHeaders = {
  ...corsHeaders,
  'Content-Type': 'application/json',
};

interface CheckoutInput {
  scope: 'school' | 'user';
  schoolId?: string;
  userId?: string;
  planTier: string;
  billing: 'monthly' | 'annual';
  seats?: number;
  return_url?: string;
  cancel_url?: string;
  email_address?: string;
}

interface SubscriptionPlan {
  id: string;
  name: string;
  tier: string;
  price_monthly: number;
  price_annual: number;
  max_teachers?: number;
  max_students?: number;
  is_active?: boolean;
}

interface PayFastPaymentData {
  merchant_id: string;
  merchant_key: string;
  return_url: string;
  cancel_url: string;
  notify_url: string;
  name_first?: string;
  name_last?: string;
  email_address?: string;
  m_payment_id: string;
  amount: string;
  item_name: string;
  item_description?: string;
  custom_str1?: string; // user_id
  custom_str2?: string; // tier
  custom_str3?: string; // scope
  custom_str4?: string; // billing
  custom_str5?: string; // school_id
  custom_int1?: number; // seats
  // Subscription fields
  subscription_type?: string;
  billing_date?: string;
  recurring_amount?: string;
  frequency?: string;
  cycles?: string;
}

// PayFast custom integration signature order (matches docs attribute order).
// Using this explicit list avoids ambiguous ordering and signature mismatches.
const PAYFAST_SIGNATURE_ORDER: string[] = [
  'merchant_id',
  'merchant_key',
  'return_url',
  'cancel_url',
  'notify_url',
  'name_first',
  'name_last',
  'email_address',
  'cell_number',
  'm_payment_id',
  'amount',
  'item_name',
  'item_description',
  'custom_int1',
  'custom_int2',
  'custom_int3',
  'custom_int4',
  'custom_int5',
  'custom_str1',
  'custom_str2',
  'custom_str3',
  'custom_str4',
  'custom_str5',
  'email_confirmation',
  'confirmation_address',
  'payment_method',
  'subscription_type',
  'billing_date',
  'recurring_amount',
  'frequency',
  'cycles',
];

/**
 * PayFast-compatible encoding (urlencode + spaces as +)
 */
function encodePayfastValue(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()*~]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%[0-9a-f]{2}/gi, (m) => m.toUpperCase())
    .replace(/%20/g, '+');
}

/**
 * Build a deterministic parameter string for PayFast signatures.
 * PayFast signatures are sensitive to variable order, so default to
 * alphabetical ordering unless a specific order is provided.
 */
function buildParamString(
  data: Record<string, string | number | undefined>,
  orderedKeys?: string[]
): string {
  const parts: string[] = [];
  const baseKeys = (orderedKeys && orderedKeys.length > 0
    ? orderedKeys
    : PAYFAST_SIGNATURE_ORDER);
  const seen = new Set<string>(baseKeys);

  const remainingKeys = Object.keys(data)
    .filter((key) => key !== 'signature' && !seen.has(key))
    .sort();

  const finalKeys = [...baseKeys, ...remainingKeys];

  for (const key of finalKeys) {
    const value = data[key];
    if (value === undefined || value === null || value === '' || key === 'signature') {
      continue;
    }
    parts.push(`${key}=${encodePayfastValue(String(value).trim())}`);
  }

  return parts.join('&');
}

/**
 * Generate MD5 signature for PayFast payment
 */
function generatePayFastSignature(
  data: Record<string, string | number | undefined>,
  passphrase: string | undefined,
  orderedKeys?: string[]
): string {
  let paramString = buildParamString(data, orderedKeys);

  // Include passphrase if set in PayFast (sandbox or production)
  if (passphrase && passphrase.trim() !== '') {
    paramString += `&passphrase=${encodePayfastValue(passphrase.trim())}`;
  }

  return createHash('md5').update(paramString).digest('hex');
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse request body
    const input: CheckoutInput = await req.json();
    const scope = input.scope === 'school' || input.scope === 'user' ? input.scope : null;
    const billing = input.billing === 'monthly' || input.billing === 'annual' ? input.billing : null;
    const planTier = String(input.planTier || '').trim();
    
    console.log('[payments-create-checkout] Received input:', {
      scope,
      planTier,
      billing,
      hasSchoolId: !!input.schoolId,
      hasUserId: !!input.userId,
    });

    if (!scope) {
      return new Response(JSON.stringify({ error: 'invalid_scope' }), {
        headers: jsonHeaders,
        status: 400,
      });
    }

    if (!billing) {
      return new Response(JSON.stringify({ error: 'invalid_billing' }), {
        headers: jsonHeaders,
        status: 400,
      });
    }

    if (!planTier) {
      return new Response(JSON.stringify({ error: 'plan_tier_required' }), {
        headers: jsonHeaders,
        status: 400,
      });
    }

    if (scope === 'school' && !String(input.schoolId || '').trim()) {
      return new Response(JSON.stringify({ error: 'school_id_required' }), {
        headers: jsonHeaders,
        status: 400,
      });
    }

    if (scope === 'user' && !String(input.userId || '').trim()) {
      return new Response(JSON.stringify({ error: 'user_id_required' }), {
        headers: jsonHeaders,
        status: 400,
      });
    }
    
    // Get environment configuration
    const payfastMode = Deno.env.get('PAYFAST_MODE') || 'sandbox';
    const isProduction = payfastMode === 'production';
    const merchantId = (Deno.env.get('PAYFAST_MERCHANT_ID') || '').trim();
    const merchantKey = (Deno.env.get('PAYFAST_MERCHANT_KEY') || '').trim();
    const passphraseRaw = Deno.env.get('PAYFAST_PASSPHRASE');
    const passphrase = passphraseRaw && passphraseRaw.trim() !== '' ? passphraseRaw.trim() : undefined;
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const webBaseUrl = WEB_BASE_URL;
    
    if (!merchantId || !merchantKey) {
      throw new Error('PayFast credentials not configured');
    }
    
    // Recurring billing on PayFast commonly requires a passphrase in production.
    // Fail fast with a clear error instead of redirecting to a 400 on PayFast.
    const requiresRecurring = billing !== 'annual';
    if (isProduction && requiresRecurring && !passphrase) {
      throw new Error('PAYFAST_PASSPHRASE is required for recurring payments in production mode');
    }
    
    // Create Supabase client with service role
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const normalizedTier = planTier
      .trim()
      .toLowerCase()
      .replace(/-/g, '_');

    // Get subscription plan from database (RPC first for safer access)
    let plan: SubscriptionPlan | null = null;
    let planError: unknown | null = null;
    try {
      const { data, error } = await supabase.rpc('public_list_plans');
      if (error) throw error;
      if (Array.isArray(data)) {
        const plans = data as SubscriptionPlan[];
        plan = plans.find((p) => String(p.tier || '').toLowerCase().replace(/-/g, '_') === normalizedTier) || null;
      }
    } catch (err) {
      planError = err;
      plan = null;
    }

    if (!plan) {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .ilike('tier', normalizedTier)
        .eq('is_active', true)
        .maybeSingle();
      plan = data || null;
      planError = error || planError;
    }
    
    if (planError || !plan) {
      console.error('[payments-create-checkout] Plan not found:', planError);
      throw new Error(`Subscription plan not found: ${planTier}`);
    }
    
    // Check for enterprise tier
    if (plan.tier.toLowerCase() === 'enterprise') {
      return new Response(
        JSON.stringify({ error: 'contact_sales_required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }
    
    // Calculate price (prices are stored in rands)
    const isAnnual = billing === 'annual';
    let price = isAnnual ? plan.price_annual : plan.price_monthly;
    
    // Apply launch promo (50% off monthly parent tiers only until Mar 31, 2026)
    const promoEndDate = new Date('2026-03-31T23:59:59.999Z');
    const isPromoActive = new Date() <= promoEndDate;
    const isParentTier = normalizedTier.startsWith('parent_') || normalizedTier.startsWith('parent-');
    if (isPromoActive && isParentTier && !isAnnual) {
      price = Number((price * 0.5).toFixed(2));
    }
    
    if (!price || price <= 0) {
      throw new Error('Invalid price for plan');
    }
    
    // Generate unique payment ID
    const paymentId = `edp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Determine return and cancel URLs
    const returnUrl = input.return_url || `${webBaseUrl}/subscription/success?payment_id=${paymentId}`;
    const cancelUrl = input.cancel_url || `${webBaseUrl}/subscription/cancel?payment_id=${paymentId}`;
    const notifyUrl = `${supabaseUrl}/functions/v1/payfast-webhook`;
    
    // Build PayFast payment data
    const paymentData: PayFastPaymentData = {
      merchant_id: merchantId,
      merchant_key: merchantKey,
      return_url: returnUrl,
      cancel_url: cancelUrl,
      notify_url: notifyUrl,
      email_address: input.email_address,
      m_payment_id: paymentId,
      amount: price.toFixed(2),
      item_name: `EduDash Pro ${plan.name} (${isAnnual ? 'Annual' : 'Monthly'})`,
      item_description: `${plan.name} subscription - ${input.seats || plan.max_teachers || 1} seats`,
      custom_str1: input.userId || '',
      custom_str2: plan.tier,
      custom_str3: scope,
      custom_str4: billing,
      custom_str5: input.schoolId || '',
      custom_int1: input.seats || plan.max_teachers || 1,
    };
    
    // Add subscription (recurring) fields for non-annual payments
    if (!isAnnual) {
      paymentData.subscription_type = '1'; // Subscription
      paymentData.recurring_amount = price.toFixed(2);
      paymentData.frequency = '3'; // Monthly
      paymentData.cycles = '0'; // Until cancelled
    }
    
    // PayFast is sensitive to parameter ordering for signatures; use
    // a deterministic alphabetical order for both the signature and URL.
    const paramString = buildParamString(
      paymentData as unknown as Record<string, string | number | undefined>,
      PAYFAST_SIGNATURE_ORDER
    );

    const signature = generatePayFastSignature(
      paymentData as unknown as Record<string, string | number | undefined>,
      isProduction ? passphrase : undefined,
      PAYFAST_SIGNATURE_ORDER
    );

    // Build payment URL
    const baseUrl = isProduction 
      ? 'https://www.payfast.co.za/eng/process'
      : 'https://sandbox.payfast.co.za/eng/process';
    const redirectUrl = `${baseUrl}?${paramString}&signature=${signature}`;
    
    // Create pending payment record
    const { error: txError } = await supabase
      .from('payment_transactions')
      .insert({
        id: paymentId,
        status: 'pending',
        provider: 'payfast',
        amount: price,
        currency: 'ZAR',
        user_id: input.userId || null,
        school_id: input.schoolId || null,
        tier: plan.tier,
        billing_cycle: billing,
        subscription_plan_id: plan.id,
        metadata: {
          mode: payfastMode,
          plan_name: plan.name,
          promo_applied: isPromoActive && !isAnnual,
          seats: input.seats || plan.max_teachers || 1,
        },
      });
    
    if (txError) {
      console.warn('[payments-create-checkout] Failed to create payment record:', txError?.code || 'UNKNOWN');
      // Don't fail - payment can still proceed
    }
    
    return new Response(
      JSON.stringify({ 
        redirect_url: redirectUrl,
        payment_id: paymentId,
        mode: payfastMode,
      }),
      { headers: jsonHeaders }
    );
    
  } catch (error) {
    console.error('[payments-create-checkout] Error:', error instanceof Error ? error.message : 'Unknown error');
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: jsonHeaders, status: 500 }
    );
  }
});
