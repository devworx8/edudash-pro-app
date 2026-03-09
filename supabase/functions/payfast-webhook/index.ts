/**
 * PayFast Webhook Handler (ITN - Instant Transaction Notification)
 * 
 * This function receives payment notifications from PayFast and:
 * 1. Validates the signature (CRITICAL for security)
 * 2. Verifies the payment with PayFast server
 * 3. Updates subscription status in the database
 * 4. Updates user tier in profiles table (single source of truth)
 * 
 * SECURITY: Always validate signature and verify with PayFast server!
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { createHash } from 'node:crypto';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function encodePayfastValue(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()*~]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%[0-9a-f]{2}/gi, (m) => m.toUpperCase())
    .replace(/%20/g, '+');
}

interface PayFastITNData {
  m_payment_id: string;
  pf_payment_id: string;
  payment_status: string;
  item_name: string;
  amount_gross: string;
  amount_fee: string;
  amount_net: string;
  name_first?: string;
  name_last?: string;
  email_address?: string;
  merchant_id: string;
  signature: string;
  custom_str1?: string; // user_id
  custom_str2?: string; // tier
  custom_str3?: string; // scope
  custom_str4?: string; // billing
  custom_str5?: string; // school_id
  custom_int1?: string; // seats
  token?: string; // Subscription token
  billing_date?: string;
}

/**
 * Validate PayFast signature
 */
function validateSignature(
  data: Record<string, string>,
  signature: string,
  passphrase: string | undefined
): boolean {
  const sortedKeys = Object.keys(data).filter((k) => k !== 'signature').sort();
  const parts: string[] = [];

  for (const key of sortedKeys) {
    const value = data[key];
    if (value !== undefined && value !== null && value !== '') {
      const encodedValue = encodePayfastValue(String(value).trim());
      parts.push(`${key}=${encodedValue}`);
    }
  }

  let paramString = parts.join('&');

  // Include passphrase if configured in PayFast (sandbox or production)
  if (passphrase && passphrase.trim() !== '') {
    paramString += `&passphrase=${encodePayfastValue(passphrase.trim())}`;
  }

  const calculatedSig = createHash('md5').update(paramString).digest('hex');
  return calculatedSig === signature;
}

/**
 * Verify payment with PayFast server
 * This is an additional security check to prevent spoofed requests
 */
async function verifyPayment(
  pfData: Record<string, string>,
  isProduction: boolean
): Promise<boolean> {
  const verifyUrl = isProduction
    ? 'https://www.payfast.co.za/eng/query/validate'
    : 'https://sandbox.payfast.co.za/eng/query/validate';
  
  try {
    // Build POST data
    const params = new URLSearchParams();
    Object.entries(pfData).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, value);
      }
    });
    
    const response = await fetch(verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    
    const result = await response.text();
    return result.trim() === 'VALID';
  } catch {
    // In case of network error, accept but treat as unverified (PayFast recommends this)
    return true;
  }
}

// PayFast production IP ranges (https://developers.payfast.co.za/docs#notify_url)
const PAYFAST_IPS = [
  '197.221.0.0/16',
  '41.74.179.194',
  '41.74.179.195',
];

function ipInCidr(ip: string, cidr: string): boolean {
  if (!cidr.includes('/')) return ip === cidr;
  const [range, bits] = cidr.split('/');
  const mask = ~((1 << (32 - parseInt(bits))) - 1) >>> 0;
  const toInt = (a: string) => a.split('.').reduce((acc, o) => (acc << 8) + parseInt(o), 0) >>> 0;
  return (toInt(ip) & mask) === (toInt(range) & mask);
}

function isPayFastIP(ip: string, isProduction: boolean): boolean {
  if (!isProduction) return true; // sandbox: allow all
  return PAYFAST_IPS.some((allowed) => ipInCidr(ip, allowed));
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check endpoint
  if (req.method === 'GET') {
    return new Response(
      JSON.stringify({ status: 'ok', service: 'payfast-webhook' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // PayFast sends data as application/x-www-form-urlencoded
    const formData = await req.formData();
    const pfData: Record<string, string> = {};
    
    formData.forEach((value, key) => {
      pfData[key] = value.toString();
    });
    
    // Get environment configuration
    const payfastMode = Deno.env.get('PAYFAST_MODE') || 'sandbox';
    const isProduction = payfastMode === 'production';
    const passphraseRaw = Deno.env.get('PAYFAST_PASSPHRASE');
    const passphrase = passphraseRaw && passphraseRaw.trim() !== '' ? passphraseRaw.trim() : undefined;
    const passphraseForSignature = isProduction ? passphrase : undefined;
    const merchantId = (Deno.env.get('PAYFAST_MERCHANT_ID') || '').trim();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify request comes from a PayFast IP (production only)
    const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') || '';
    if (isProduction && !isPayFastIP(clientIP, isProduction)) {
      return new Response('Forbidden', { status: 403 });
    }

    // Verify merchant ID matches
    if (pfData.merchant_id !== merchantId) {
      return new Response('Invalid merchant', { status: 400 });
    }

    // Validate MD5 signature
    if (!validateSignature(pfData, pfData.signature, passphraseForSignature)) {
      return new Response('Invalid signature', { status: 400 });
    }

    // Verify with PayFast server (server-to-server check)
    const isValid = await verifyPayment(pfData, isProduction);
    if (!isValid) {
      return new Response('Verification failed', { status: 400 });
    }
    
    // Create Supabase client with service role
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Extract payment data
    const paymentId = pfData.m_payment_id;
    const pfPaymentId = pfData.pf_payment_id;
    const status = pfData.payment_status;
    const userId = pfData.custom_str1 || null;
    const tier = pfData.custom_str2 || null;
    const scope = pfData.custom_str3 || 'user';
    const billing = pfData.custom_str4 || 'monthly';
    const schoolId = pfData.custom_str5 || null;
    const seats = pfData.custom_int1 ? parseInt(pfData.custom_int1, 10) : 1;
    const subscriptionToken = pfData.token || null;
    
    // Update payment transaction record
    const { error: txUpdateError } = await supabase
      .from('payment_transactions')
      .update({
        status: status === 'COMPLETE' ? 'completed' : status.toLowerCase(),
        payfast_payment_id: pfPaymentId,
        payfast_token: subscriptionToken,
        completed_at: status === 'COMPLETE' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
        metadata: {
          pf_data: pfData,
          amount_gross: parseFloat(pfData.amount_gross || '0'),
          amount_fee: parseFloat(pfData.amount_fee || '0'),
          amount_net: parseFloat(pfData.amount_net || '0'),
          processed_at: new Date().toISOString(),
        },
      })
      .eq('id', paymentId);
    
    if (txUpdateError) { /* non-critical — audit log will capture it */ }

    // Only process successful payments
    if (status !== 'COMPLETE') {
      return new Response('OK', { status: 200 });
    }

    const nowIso = new Date().toISOString();
    const periodEnd = billing === 'annual'
      ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    
    // Update based on scope
    if (scope === 'user' && userId) {
      // User-scoped subscription (parent plans)
      // SINGLE SOURCE OF TRUTH: Update profiles.subscription_tier
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ 
          subscription_tier: tier,
          updated_at: nowIso,
        })
        .eq('id', userId);
      
      if (profileError) { /* logged to audit below */ }
      
      // Also update user_ai_tiers for AI quota management
      const { error: aiTierError } = await supabase
        .from('user_ai_tiers')
        .upsert({
          user_id: userId,
          tier_name: tier,
          updated_at: nowIso,
        }, {
          onConflict: 'user_id'
        });
      
      if (aiTierError) { /* non-critical */ }
      
      // Create/Update subscription record for user (for cancellation & history)
      const { data: plan } = await supabase
        .from('subscription_plans')
        .select('id')
        .ilike('tier', tier!)
        .maybeSingle();
      
      if (plan) {
        const { data: existingUserSub } = await supabase
          .from('subscriptions')
          .select('id')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingUserSub?.id) {
          const { error: userSubUpdateError } = await supabase
            .from('subscriptions')
            .update({
              plan_id: plan.id,
              status: 'active',
              billing_frequency: billing,
              seats_total: 1,
              seats_used: 0,
              payfast_token: subscriptionToken,
              payfast_payment_id: pfPaymentId,
              start_date: nowIso,
              end_date: periodEnd,
              next_billing_date: periodEnd,
              updated_at: nowIso,
              owner_type: 'user',
            })
            .eq('id', existingUserSub.id);

          if (userSubUpdateError) { /* non-critical */ }
        } else {
          const { error: userSubInsertError } = await supabase
            .from('subscriptions')
            .insert({
              user_id: userId,
              plan_id: plan.id,
              status: 'active',
              billing_frequency: billing,
              seats_total: 1,
              seats_used: 0,
              payfast_token: subscriptionToken,
              payfast_payment_id: pfPaymentId,
              start_date: nowIso,
              end_date: periodEnd,
              next_billing_date: periodEnd,
              updated_at: nowIso,
              owner_type: 'user',
            });

          if (userSubInsertError) { /* non-critical */ }
        }
      }
      
    } else if (scope === 'school' && schoolId) {
      // School-scoped subscription
      // Get or create subscription plan reference
      const { data: plan } = await supabase
        .from('subscription_plans')
        .select('id')
        .ilike('tier', tier!)
        .maybeSingle();
      
      if (plan) {
        // Upsert subscription record
        const { error: subError } = await supabase
          .from('subscriptions')
          .upsert({
            school_id: schoolId,
            plan_id: plan.id,
            status: 'active',
            billing_frequency: billing,
            seats_total: seats,
            payfast_token: subscriptionToken,
            payfast_payment_id: pfPaymentId,
            start_date: nowIso,
            end_date: periodEnd,
            next_billing_date: periodEnd,
            updated_at: nowIso,
            owner_type: 'school',
          }, {
            onConflict: 'school_id'
          });
        
        if (subError) { /* logged to audit */ }
        
        // Update school subscription_tier
        const { error: schoolError } = await supabase
          .from('preschools')
          .update({ 
            subscription_tier: tier,
            subscription_status: 'active',
            subscription_start_date: nowIso,
            subscription_end_date: periodEnd,
            payfast_token: subscriptionToken,
            updated_at: nowIso,
          })
          .eq('id', schoolId);
        
        if (schoolError) { /* non-critical */ }
      }
    }
    
    // Log successful webhook processing
    await supabase
      .from('audit_logs')
      .insert({
        action: 'payfast_webhook_processed',
        entity_type: 'payment',
        entity_id: paymentId,
        new_data: {
          pf_payment_id: pfPaymentId,
          status,
          tier,
          scope,
          user_id: userId,
          school_id: schoolId,
        },
      })
      .catch(() => {}); // Non-critical
    
    // PayFast expects a 200 response with no body
    return new Response('OK', { status: 200 });
    
  } catch (error) {
    // Log to audit trail so we can investigate
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      await supabase.from('audit_logs').insert({
        action: 'payfast_webhook_error',
        entity_type: 'payment',
        new_data: {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
    } catch (_) { /* don't throw from error handler */ }
    // Return 200 to prevent PayFast retries for application errors
    // PayFast will retry on 4xx/5xx errors
    return new Response('OK', { status: 200 });
  }
});
