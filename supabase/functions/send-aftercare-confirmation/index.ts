// Supabase Edge Function: send-aftercare-confirmation
// Sends confirmation email when parent registers for aftercare
// Includes banking details for payment and WhatsApp group link

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

// Community School banking details (EduDash Pro Pty Ltd - Capitec Business)
const BANK_DETAILS = {
  bank_name: 'Capitec Bank',
  account_holder: 'EduDash Pro Pty Ltd',
  account_number: '1053747152',
  branch_code: '450105',
  account_type: 'Business',
  reference_prefix: 'AC-',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ConfirmationEmailRequest {
  registration_id: string;
  parent_email: string;
  parent_name: string;
  child_name: string;
  payment_reference: string;
  has_proof: boolean;
  registration_fee?: number;
  is_early_bird?: boolean;
}

function generateConfirmationEmailHTML(data: ConfirmationEmailRequest): string {
  const feeAmount = data.registration_fee || (data.is_early_bird ? 200 : 400);
  const originalFee = 400;
  const discountText = data.is_early_bird
    ? `<span style="color:#10B981;font-weight:700;">R${feeAmount}</span> <span style="text-decoration:line-through;color:#94a3b8;">R${originalFee}</span> (50% early bird)`
    : `<strong>R${feeAmount}</strong>`;

  const paymentReferenceBlock = `
<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:12px;margin:14px 0;">
  <p style="margin:0;color:#0369a1;font-weight:600;">Payment reference: <code style="background:#e0f2fe;padding:2px 6px;border-radius:6px;">${data.payment_reference}</code></p>
</div>`;

  const paymentDetailsBlock = !data.has_proof
    ? `
<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:16px;margin:16px 0;">
  <p style="margin:0 0 10px 0;color:#92400e;font-weight:600;">Bank details</p>
  <p style="margin:0 0 10px 0;color:#78350f;">Registration fee: ${discountText}</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;color:#1f2937;">
    <tr><td style="padding:6px 0;font-weight:600;">Bank:</td><td style="padding:6px 0;">${BANK_DETAILS.bank_name}</td></tr>
    <tr><td style="padding:6px 0;font-weight:600;">Account Name:</td><td style="padding:6px 0;">${BANK_DETAILS.account_holder}</td></tr>
    <tr><td style="padding:6px 0;font-weight:600;">Account Number:</td><td style="padding:6px 0;font-family:monospace;">${BANK_DETAILS.account_number}</td></tr>
    <tr><td style="padding:6px 0;font-weight:600;">Branch Code:</td><td style="padding:6px 0;font-family:monospace;">${BANK_DETAILS.branch_code}</td></tr>
    <tr><td style="padding:6px 0;font-weight:600;">Account Type:</td><td style="padding:6px 0;">${BANK_DETAILS.account_type}</td></tr>
    <tr><td style="padding:6px 0;font-weight:600;">Reference:</td><td style="padding:6px 0;font-family:monospace;font-weight:700;">${data.payment_reference}</td></tr>
  </table>
  <p style="margin:10px 0 0 0;color:#92400e;font-size:13px;">Please use the reference above when paying.</p>
</div>`
    : `
<div style="background:#ecfdf5;border:1px solid #86efac;border-radius:12px;padding:14px;margin:16px 0;">
  <p style="margin:0;color:#166534;">We received your proof of payment and it is being reviewed.</p>
</div>`;

  const nextStepsBlock = `
<p><strong>What happens next:</strong></p>
<ul style="margin:0 0 0 18px;padding:0;color:#475569;">
  ${!data.has_proof ? '<li>Make payment using the banking details above.</li><li>Upload your proof of payment.</li>' : ''}
  <li>We verify payment (1-2 business days).</li>
  <li>You receive a welcome email with login details.</li>
  <li>Access the parent portal for schedules and updates.</li>
</ul>`;

  const bodyHtml = `
<p>Hi ${data.parent_name},</p>
<p>Thanks for registering <strong>${data.child_name}</strong> for the EduDash Pro Community School aftercare program.</p>
${paymentReferenceBlock}
${paymentDetailsBlock}
${nextStepsBlock}
<p>Stay updated by joining our WhatsApp community.</p>
  `.trim();

  const title = data.has_proof ? 'Aftercare registration received' : 'Complete payment to finish registration';
  const subtitle = data.has_proof ? 'Proof of payment received' : 'Payment required to secure your child’s place';

  return renderEduDashProEmail({
    title,
    subtitle,
    preheader: title,
    bodyHtml,
    cta: !data.has_proof
      ? { label: 'Upload proof of payment', url: buildWebUrl('/aftercare') }
      : { label: 'Open EduDash Pro', url: buildWebUrl('/sign-in') },
    secondaryCta: { label: 'Join WhatsApp Group', url: WHATSAPP_GROUP_LINK },
    supportEmail: SUPPORT_EMAIL,
  });
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body: ConfirmationEmailRequest = await req.json();
    console.log('[send-aftercare-confirmation] Request:', {
      registration_id: body.registration_id,
      parent_email: body.parent_email,
      child_name: body.child_name,
      has_proof: body.has_proof,
    });

    // Validate required fields
    if (!body.parent_email || !body.parent_name || !body.child_name || !body.payment_reference) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!RESEND_API_KEY) {
      console.error('[send-aftercare-confirmation] RESEND_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Email service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate email content
    const emailHtml = generateConfirmationEmailHTML(body);
    const subject = body.has_proof
      ? `✅ Aftercare Registration Received - ${body.child_name}`
      : `📋 Aftercare Registration Received - Payment Required for ${body.child_name}`;

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
    console.log('[send-aftercare-confirmation] Resend response:', {
      status: resendResponse.status,
      id: resendData.id,
    });

    if (!resendResponse.ok) {
      console.error('[send-aftercare-confirmation] Resend error:', resendData);
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
            type: 'aftercare_confirmation',
            registration_id: body.registration_id,
            child_name: body.child_name,
            has_proof: body.has_proof,
          },
        });
      } catch (logErr) {
        console.warn('[send-aftercare-confirmation] Could not log email:', logErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message_id: resendData.id,
        message: 'Confirmation email sent successfully',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[send-aftercare-confirmation] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
