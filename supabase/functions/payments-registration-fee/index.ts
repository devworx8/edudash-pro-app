/**
 * Payments Registration Fee Edge Function
 * 
 * Creates a PayFast checkout for aftercare registration with promotional pricing.
 * 
 * Expected body: { registration_id, user_id, original_fee, user_type }
 * Auth: Bearer token required
 * Returns: { checkout_url, transaction_id, amount, promo_applied }
 */

import { serve } from 'https://deno.land/std@0.214.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const PAYFAST_MERCHANT_ID = Deno.env.get('PAYFAST_MERCHANT_ID') || '';
const PAYFAST_MERCHANT_KEY = Deno.env.get('PAYFAST_MERCHANT_KEY') || '';
const PAYFAST_PASSPHRASE = Deno.env.get('PAYFAST_PASSPHRASE') || '';
const PAYFAST_SANDBOX = Deno.env.get('PAYFAST_SANDBOX') === 'true';

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
}

function generatePayFastSignature(
  data: Record<string, string>,
  passphrase: string
): string {
  const params = Object.entries(data)
    .filter(([_, v]) => v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v).replace(/%20/g, '+')}`)
    .join('&');

  const withPassphrase = passphrase
    ? `${params}&passphrase=${encodeURIComponent(passphrase).replace(/%20/g, '+')}`
    : params;

  // MD5 hash
  const encoder = new TextEncoder();
  const data_bytes = encoder.encode(withPassphrase);
  const hashBuffer = new Uint8Array(16);
  
  // Use SubtleCrypto for MD5 — not available in all Deno versions
  // Fallback: use a simple implementation
  const md5 = async (message: string): Promise<string> => {
    const msgUint8 = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('MD5', msgUint8).catch(() => null);
    
    if (hashBuffer) {
      return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    }
    
    // Some Deno environments don't support MD5 via SubtleCrypto
    // Import from std library
    const { createHash } = await import('https://deno.land/std@0.214.0/crypto/mod.ts');
    const hash = createHash('md5');
    hash.update(message);
    return hash.toString('hex');
  };

  // We can't easily do async in a sync function, so we use the standard crypto API
  return ''; // Placeholder — actual signature generated async below
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return handleCorsOptions(req);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY!);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { registration_id, user_id, original_fee, user_type = 'parent' } = body;

    if (!registration_id || !user_id || !original_fee) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get promotional price via database function
    let finalAmount = Number(original_fee);
    let promoApplied = false;

    try {
      const { data: promoPrice, error: promoErr } = await supabase.rpc(
        'get_promotional_registration_fee',
        {
          p_user_id: user_id,
          p_original_fee: original_fee,
          p_user_type: user_type,
        }
      );

      if (!promoErr && promoPrice !== null) {
        const promoAmount = Number(promoPrice);
        if (promoAmount < finalAmount) {
          finalAmount = promoAmount;
          promoApplied = true;
        }
      }
    } catch (promoCheckErr) {
      console.warn('[payments-registration-fee] Promo check failed, using original fee:', promoCheckErr);
    }

    // Generate transaction ID
    const transactionId = crypto.randomUUID();

    // Build PayFast payment data
    const baseUrl = 'https://edudashpro.org.za';
    const paymentData: Record<string, string> = {
      merchant_id: PAYFAST_MERCHANT_ID,
      merchant_key: PAYFAST_MERCHANT_KEY,
      return_url: `${baseUrl}/payment/success?type=registration&id=${registration_id}`,
      cancel_url: `${baseUrl}/payment/cancel?type=registration&id=${registration_id}`,
      notify_url: `${SUPABASE_URL}/functions/v1/payfast-webhook`,
      name_first: '',
      name_last: '',
      email_address: user.email || '',
      m_payment_id: transactionId,
      amount: finalAmount.toFixed(2),
      item_name: `Aftercare Registration${promoApplied ? ' (Promotional Price)' : ''}`,
      item_description: `Registration ID: ${registration_id}`,
      custom_str1: registration_id,
      custom_str2: user_id,
      custom_str3: 'registration_fee',
      custom_str4: promoApplied ? 'promo' : 'standard',
      custom_int1: String(Math.round(Number(original_fee) * 100)),
    };

    // Generate MD5 signature
    const signatureString = Object.entries(paymentData)
      .filter(([_, v]) => v !== '')
      .map(([k, v]) => `${k}=${encodeURIComponent(v).replace(/%20/g, '+')}`)
      .join('&');

    const withPassphrase = PAYFAST_PASSPHRASE
      ? `${signatureString}&passphrase=${encodeURIComponent(PAYFAST_PASSPHRASE).replace(/%20/g, '+')}`
      : signatureString;

    // MD5 hash using crypto.subtle (Deno supports this)
    let signature = '';
    try {
      const msgBytes = new TextEncoder().encode(withPassphrase);
      const hashBuffer = await crypto.subtle.digest('MD5', msgBytes);
      signature = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      // Fallback for environments without MD5 support
      const { crypto: stdCrypto } = await import('https://deno.land/std@0.214.0/crypto/mod.ts');
      const hashBuffer = await stdCrypto.subtle.digest('MD5', new TextEncoder().encode(withPassphrase));
      signature = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    }

    paymentData.signature = signature;

    // Build checkout URL
    const payfastBase = PAYFAST_SANDBOX
      ? 'https://sandbox.payfast.co.za/eng/process'
      : 'https://www.payfast.co.za/eng/process';

    const queryString = Object.entries(paymentData)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');

    const checkoutUrl = `${payfastBase}?${queryString}`;

    // Store pending payment
    await supabase.from('payment_transactions').insert({
      id: transactionId,
      user_id,
      amount: finalAmount,
      original_amount: Number(original_fee),
      type: 'registration_fee',
      status: 'pending',
      reference_id: registration_id,
      promo_applied: promoApplied,
      metadata: {
        user_type: userType,
        registration_id,
      },
    }).then(({ error }) => {
      if (error) console.warn('[payments-registration-fee] Failed to store transaction:', error?.code || 'UNKNOWN');
    });

    return new Response(JSON.stringify({
      checkout_url: checkoutUrl,
      transaction_id: transactionId,
      amount: finalAmount,
      promo_applied: promoApplied,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[payments-registration-fee] Error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
