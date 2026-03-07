import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Send notification email to superadmin
    const resendApiKey = process.env.RESEND_API_KEY;
    
    if (resendApiKey) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'EduDash Pro <support@edudashpro.org.za>',
          reply_to: 'support@edudashpro.org.za',
          to: ['superadmin@edudashpro.org.za'],
          subject: `📱 New Early Access Signup: ${email}`,
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; max-width: 500px;">
              <div style="background: linear-gradient(135deg, #7c3aed 0%, #00f5ff 100%); padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
                <h1 style="color: #fff; margin: 0; font-size: 20px;">📱 New Early Access Signup</h1>
              </div>
              <div style="background: #fff; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
                <p style="margin: 0 0 16px 0; color: #374151;">A new user has signed up for early access to the Google Play app:</p>
                <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; text-align: center;">
                  <p style="margin: 0; font-size: 18px; font-weight: 700; color: #111827;">${email}</p>
                </div>
                <p style="margin: 16px 0 0 0; color: #6b7280; font-size: 14px;">
                  <strong>Time:</strong> ${new Date().toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}<br>
                  <strong>Source:</strong> Homepage Early Access Form
                </p>
              </div>
            </body>
            </html>
          `,
        }),
      });
    }

    // Also log to console for visibility
    console.log(`[Early Access] New signup: ${email} at ${new Date().toISOString()}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Early access notification error:', error);
    return NextResponse.json({ success: true }); // Don't expose errors
  }
}
