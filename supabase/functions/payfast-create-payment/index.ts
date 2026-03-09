/**
 * PayFast Create Payment Edge Function
 * 
 * Creates a PayFast payment URL for subscription upgrades.
 * Called from mobile (parent-upgrade) and web (UpgradeModal, pricing page).
 * 
 * Expected body:
 *   user_id, tier, amount, email, firstName, lastName,
 *   itemName, itemDescription, subscriptionType, frequency, cycles
 * 
 * Returns: { payment_url, payment_id, mode }
 */

import { serve } from 'https://deno.land/std@0.214.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createHash } from 'node:crypto';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { APP_URL } from '../_shared/urls.ts';

// PayFast config
const PAYFAST_MERCHANT_ID = Deno.env.get('PAYFAST_MERCHANT_ID') || '';
const PAYFAST_MERCHANT_KEY = Deno.env.get('PAYFAST_MERCHANT_KEY') || '';
const PAYFAST_PASSPHRASE = Deno.env.get('PAYFAST_PASSPHRASE') || '';
const PAYFAST_SANDBOX = Deno.env.get('PAYFAST_SANDBOX') === 'true';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
}

const BASE_URL = PAYFAST_SANDBOX
  ? 'https://sandbox.payfast.co.za/eng/process'
  : 'https://www.payfast.co.za/eng/process';

function encodePayfastValue(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()*~]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%[0-9a-f]{2}/gi, (m) => m.toUpperCase())
    .replace(/%20/g, '+');
}

function generateSignature(data: Record<string, string>, passphrase?: string): string {
  const sortedKeys = Object.keys(data).sort();
  const parts: string[] = [];
  for (const key of sortedKeys) {
    const value = data[key];
    if (value !== undefined && value !== null && value !== '') {
      parts.push(`${key}=${encodePayfastValue(String(value).trim())}`);
    }
  }
  let paramString = parts.join('&');
  if (passphrase && passphrase.trim() !== '') {
    paramString += `&passphrase=${encodePayfastValue(passphrase.trim())}`;
  }
  return createHash('md5').update(paramString).digest('hex');
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY!);

    // Verify user session
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const {
      user_id,
      tier,
      amount,
      email,
      firstName,
      lastName,
      itemName,
      itemDescription,
      subscriptionType,
      frequency,
      cycles,
    } = body;

    // Validate required fields
    if (!user_id || !tier || !amount || !email) {
      return new Response(JSON.stringify({ error: 'Missing required fields: user_id, tier, amount, email' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Ensure the authenticated user matches the request
    if (user.id !== user_id) {
      return new Response(JSON.stringify({ error: 'User ID mismatch' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate unique payment ID
    const paymentId = `EDUDASH-${tier}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Get the webhook URL (return URL after payment)
    const returnUrl = `${APP_URL}/payment/success?tier=${tier}`;
    const cancelUrl = `${APP_URL}/payment/cancel`;
    const notifyUrl = `${SUPABASE_URL}/functions/v1/payfast-webhook`;

    // Build PayFast payment data
    const paymentData: Record<string, string> = {
      merchant_id: PAYFAST_MERCHANT_ID,
      merchant_key: PAYFAST_MERCHANT_KEY,
      return_url: returnUrl,
      cancel_url: cancelUrl,
      notify_url: notifyUrl,
      m_payment_id: paymentId,
      amount: String(Number(amount).toFixed(2)),
      item_name: itemName || `EduDash Pro ${tier}`,
      item_description: itemDescription || `${tier} subscription`,
      email_address: email,
      name_first: firstName || '',
      name_last: lastName || '',
      // Custom fields for webhook identification
      custom_str1: user_id,
      custom_str2: tier,
      custom_str3: 'subscription',
    };

    // Add subscription fields if provided
    if (subscriptionType) {
      paymentData.subscription_type = subscriptionType;
    }
    if (frequency) {
      paymentData.frequency = frequency;
    }
    if (cycles) {
      paymentData.cycles = cycles;
    }

    // Generate signature
    const signature = generateSignature(paymentData, PAYFAST_PASSPHRASE || undefined);
    paymentData.signature = signature;

    // Build the payment URL
    const queryParams = Object.entries(paymentData)
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join('&');
    const paymentUrl = `${BASE_URL}?${queryParams}`;

    // Log the payment creation
    console.log('[payfast-create-payment] Payment created:', {
      paymentId,
      tier,
      amount,
      userId: user_id,
      mode: PAYFAST_SANDBOX ? 'sandbox' : 'production',
    });

    // Store pending payment in DB for tracking
    try {
      await supabase.from('subscriptions').upsert({
        user_id,
        tier,
        status: 'pending',
        payment_id: paymentId,
        amount: Number(amount),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
    } catch (dbErr) {
      // Non-critical — log but don't fail the payment creation
      console.warn('[payfast-create-payment] Could not store pending subscription:', dbErr);
    }

    return new Response(
      JSON.stringify({
        payment_url: paymentUrl,
        payment_id: paymentId,
        mode: PAYFAST_SANDBOX ? 'sandbox' : 'production',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (err) {
    console.error('[payfast-create-payment] Error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
