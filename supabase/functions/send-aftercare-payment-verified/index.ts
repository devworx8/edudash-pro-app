// Supabase Edge Function: send-aftercare-payment-verified
// Sends notification email when principal verifies parent's payment
// Informs parent that payment was received and next steps

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { renderEduDashProEmail } from '../_shared/edudashproEmail.ts';
import { buildWebUrl } from '../_shared/urls.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const FROM_EMAIL = 'EduDash Pro <support@edudashpro.org.za>';
const SUPPORT_EMAIL = 'support@edudashpro.org.za';
const WHATSAPP_GROUP_LINK = 'https://chat.whatsapp.com/FQVPXqY6daRLIonPjQqZTv';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PaymentVerifiedEmailRequest {
  registration_id: string;
  parent_email: string;
  parent_name: string;
  child_name: string;
  payment_amount?: number;
  verified_by?: string;
}

function generatePaymentVerifiedEmailHTML(data: PaymentVerifiedEmailRequest): string {
  const amountText = data.payment_amount ? `R${data.payment_amount.toFixed(2)}` : 'your payment';

  const bodyHtml = `
<p>Hi ${data.parent_name},</p>
<p>Good news! We verified ${amountText} for <strong>${data.child_name}</strong>'s aftercare registration.</p>
<div style="background:#ecfdf5;border:1px solid #86efac;border-radius:12px;padding:12px;margin:14px 0;">
  <p style="margin:0;color:#166534;font-weight:600;">Payment verified and recorded.</p>
</div>
<p><strong>Next steps:</strong></p>
<ul style="margin:0 0 0 18px;padding:0;color:#475569;">
  <li>We finalize enrollment (1-2 business days).</li>
  <li>You receive parent login details.</li>
  <li>You'll get schedules and key updates.</li>
</ul>
<p>Join the WhatsApp group to stay connected.</p>
  `.trim();

  return renderEduDashProEmail({
    title: 'Payment verified',
    subtitle: 'Your aftercare registration is being finalized',
    preheader: `Payment verified for ${data.child_name}`,
    bodyHtml,
    cta: { label: 'Join WhatsApp Group', url: WHATSAPP_GROUP_LINK },
    secondaryCta: { label: 'Open EduDash Pro', url: buildWebUrl('/sign-in') },
    supportEmail: SUPPORT_EMAIL,
  });
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body: PaymentVerifiedEmailRequest = await req.json();
    console.log('[send-aftercare-payment-verified] Request:', {
      registration_id: body.registration_id,
      parent_email: body.parent_email,
      child_name: body.child_name,
    });

    // Validate required fields
    if (!body.parent_email || !body.parent_name || !body.child_name) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!RESEND_API_KEY) {
      console.error('[send-aftercare-payment-verified] RESEND_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Email service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate email content
    const emailHtml = generatePaymentVerifiedEmailHTML(body);
    const subject = `✅ Payment Verified - ${body.child_name}'s Aftercare Registration`;

    // Send email via Resend
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [body.parent_email],
        subject: subject,
        html: emailHtml,
        reply_to: SUPPORT_EMAIL,
      }),
    });

    const resendData = await resendResponse.json();
    console.log('[send-aftercare-payment-verified] Resend response:', {
      status: resendResponse.status,
      id: resendData.id,
    });

    if (!resendResponse.ok) {
      console.error('[send-aftercare-payment-verified] Resend error:', resendData);
      return new Response(
        JSON.stringify({ success: false, error: resendData.message || 'Failed to send email' }),
        { status: resendResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log to database if available
    if (SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        await supabase.from('email_logs').insert({
          recipient: body.parent_email,
          subject: subject,
          status: 'sent',
          message_id: resendData.id,
          metadata: {
            type: 'aftercare_payment_verified',
            registration_id: body.registration_id,
            child_name: body.child_name,
            payment_amount: body.payment_amount,
          },
        });
      } catch (logErr) {
        console.warn('[send-aftercare-payment-verified] Could not log email:', logErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message_id: resendData.id,
        message: 'Payment verified email sent successfully',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[send-aftercare-payment-verified] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
