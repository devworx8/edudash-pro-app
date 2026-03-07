import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    const {
      email,
      organization,
      seats,
      ai_cost_per_user_usd,
      ai_cost_per_user_zar,
      usd_to_zar_rate,
      base_fee,
      per_seat_fee,
      support_level,
      ai_bundle,
      total_estimate,
    } = payload || {};

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    const toEmail = process.env.CUSTOM_PLAN_EMAIL_TO || 'support@edudashpro.org.za';

    if (resendApiKey) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'EduDash Pro <support@edudashpro.org.za>',
          reply_to: email,
          to: [toEmail],
          subject: `Custom Plan Quote Request${organization ? ` - ${organization}` : ''}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>Custom Plan Quote Request</h2>
              <p><strong>Contact:</strong> ${email}</p>
              <p><strong>Organization:</strong> ${organization || 'N/A'}</p>
              <p><strong>Seats:</strong> ${seats ?? 'N/A'}</p>
              <p><strong>AI cost per user (USD):</strong> ${ai_cost_per_user_usd ?? 'N/A'}</p>
              <p><strong>USD → ZAR rate:</strong> ${usd_to_zar_rate ?? 'N/A'}</p>
              <p><strong>AI cost per user (ZAR):</strong> ${ai_cost_per_user_zar ?? 'N/A'}</p>
              <p><strong>Base fee (ZAR):</strong> ${base_fee ?? 'N/A'}</p>
              <p><strong>Per-seat fee (ZAR):</strong> ${per_seat_fee ?? 'N/A'}</p>
              <p><strong>Support level:</strong> ${support_level ?? 'N/A'}</p>
              <p><strong>AI bundle (ZAR):</strong> ${ai_bundle ?? 'N/A'}</p>
              <p><strong>Estimated total (ZAR):</strong> ${total_estimate ?? 'N/A'}</p>
              <p style="color: #6b7280; font-size: 12px;">Generated via pricing page estimator.</p>
            </div>
          `,
        }),
      });
    }

    console.log('[Custom Plan Quote] Request', payload);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Custom plan quote error:', error);
    return NextResponse.json({ success: true });
  }
}
