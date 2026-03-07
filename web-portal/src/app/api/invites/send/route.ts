import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

// Initialize Resend for email sending (only if API key is configured)
const resend = process.env.RESEND_API_KEY 
  ? new Resend(process.env.RESEND_API_KEY) 
  : null;

interface InviteRequest {
  type: 'email' | 'sms';
  email?: string;
  phone?: string;
  inviteLink: string;
  preschoolName?: string;
  inviterName?: string;
  inviteRole?: 'parent' | 'teacher' | 'staff' | 'member';
}

/**
 * POST /api/invites/send
 * Send an invite email or SMS to a potential user
 */
export async function POST(request: NextRequest) {
  try {
    const body: InviteRequest = await request.json();
    const { type, email, inviteLink, preschoolName, inviterName, inviteRole } = body;
    const roleLabel = inviteRole === 'teacher'
      ? 'teacher'
      : inviteRole === 'staff'
        ? 'staff member'
        : inviteRole === 'member'
          ? 'member'
          : 'parent';

    if (type === 'email') {
      if (!email) {
        return NextResponse.json(
          { error: 'Email address is required' },
          { status: 400 }
        );
      }

      // Check if Resend is configured
      if (!process.env.RESEND_API_KEY || !resend) {
        console.warn('RESEND_API_KEY not configured or Resend not available - simulating email send');
        // In development, just simulate success
        return NextResponse.json({ success: true, simulated: true });
      }

      // Send invite email
      const { error: emailError } = await resend.emails.send({
        from: 'EduDash Pro <support@edudashpro.org.za>',
        replyTo: 'support@edudashpro.org.za',
        to: email,
        subject: `${inviterName || 'Someone'} invited you to join ${preschoolName || 'EduDash Pro'} as a ${roleLabel}`,
        html: generateInviteEmailHtml({
          inviterName: inviterName || 'A team member',
          preschoolName: preschoolName || 'EduDash Pro',
          inviteLink,
          roleLabel,
        }),
      });

      if (emailError) {
        console.error('Email send error:', emailError);
        return NextResponse.json(
          { error: 'Failed to send email' },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true });
    }

    // For SMS, we return a success since the actual SMS is handled client-side
    // by opening the native SMS app
    if (type === 'sms') {
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: 'Invalid invite type' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Invite send error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Generate HTML email for invite
 */
function generateInviteEmailHtml(params: {
  inviterName: string;
  preschoolName: string;
  inviteLink: string;
  roleLabel: string;
}): string {
  const { inviterName, preschoolName, inviteLink, roleLabel } = params;
  const inviteBodyText = roleLabel === 'parent'
    ? "EduDash Pro helps parents stay connected with their child's school. Get updates, communicate with teachers, and track progress—all in one place."
    : 'EduDash Pro helps school teams collaborate and stay connected. Share updates, coordinate with families, and keep everything organized—all in one place.';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're Invited to ${preschoolName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0f172a;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 480px; width: 100%; border-collapse: collapse;">
          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom: 32px;">
              <div style="width: 60px; height: 60px; border-radius: 16px; background: linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%); display: inline-flex; align-items: center; justify-content: center;">
                <span style="font-size: 28px; font-weight: 700; color: white;">E</span>
              </div>
            </td>
          </tr>
          
          <!-- Card -->
          <tr>
            <td style="background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%); border-radius: 24px; padding: 40px 32px; border: 1px solid rgba(255, 255, 255, 0.1);">
              <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 700; color: white; text-align: center;">
                You're Invited! 🎉
              </h1>
              <p style="margin: 0 0 24px 0; font-size: 15px; color: rgba(255, 255, 255, 0.7); text-align: center; line-height: 1.5;">
                <strong style="color: white;">${inviterName}</strong> has invited you to join <strong style="color: white;">${preschoolName}</strong> as a ${roleLabel} on EduDash Pro.
              </p>
              
              <p style="margin: 0 0 24px 0; font-size: 14px; color: rgba(255, 255, 255, 0.6); text-align: center; line-height: 1.6;">
                ${inviteBodyText}
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center">
                    <a href="${inviteLink}" 
                       style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); color: white; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 12px; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);">
                      Join Now
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 24px 0 0 0; font-size: 12px; color: rgba(255, 255, 255, 0.4); text-align: center;">
                Or copy and paste this link in your browser:<br>
                <a href="${inviteLink}" style="color: #60a5fa; word-break: break-all;">${inviteLink}</a>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top: 24px;">
              <p style="margin: 0; font-size: 12px; color: rgba(255, 255, 255, 0.4);">
                © ${new Date().getFullYear()} EduDash Pro. All rights reserved.
              </p>
              <p style="margin: 8px 0 0 0; font-size: 11px; color: rgba(255, 255, 255, 0.3);">
                If you didn't expect this invitation, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}
