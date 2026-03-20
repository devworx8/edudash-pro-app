/**
 * Admin Invite Edge Function
 *
 * Creates a new admin user account and sends a branded welcome email with credentials.
 * Only callable by superadmins.
 *
 * Expected body: {
 *   email: string,
 *   full_name: string,
 *   role: 'admin' | 'content_moderator' | 'support_admin' | 'billing_admin' | 'system_admin',
 *   department: string,
 *   send_email?: boolean
 * }
 * Auth: Bearer token required (caller must be superadmin)
 */

import { serve } from 'https://deno.land/std@0.214.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { renderEduDashProEmail } from '../_shared/edudashproEmail.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'EduDash Pro <support@edudashpro.org.za>';
const APP_WEB_URL = Deno.env.get('APP_WEB_URL') || 'https://app.edudashpro.org.za';

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
}

const VALID_ROLES = ['admin', 'content_moderator', 'support_admin', 'billing_admin', 'system_admin'];

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  content_moderator: 'Content Moderator',
  support_admin: 'Support Admin',
  billing_admin: 'Billing Admin',
  system_admin: 'System Admin',
};

const isSuperAdminRole = (role: string | null | undefined): boolean => {
  const r = String(role || '').toLowerCase();
  return r === 'superadmin' || r === 'super_admin' || r === 'platform_admin';
};

// ─── Secure password generator (Deno-compatible) ────────

const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghjkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%^&*_+-=?';
const ALL_CHARS = UPPERCASE + LOWERCASE + DIGITS + SYMBOLS;

function generateSecurePassword(length = 20): string {
  const bytes = new Uint8Array(length * 2);
  crypto.getRandomValues(bytes);
  const chars: string[] = [];

  // Guarantee at least one from each category
  chars.push(UPPERCASE[bytes[0]! % UPPERCASE.length]!);
  chars.push(LOWERCASE[bytes[1]! % LOWERCASE.length]!);
  chars.push(DIGITS[bytes[2]! % DIGITS.length]!);
  chars.push(SYMBOLS[bytes[3]! % SYMBOLS.length]!);

  // Fill the rest
  for (let i = 4; i < length; i++) {
    chars.push(ALL_CHARS[bytes[i]! % ALL_CHARS.length]!);
  }

  // Fisher-Yates shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = bytes[length + i]! % (i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }

  return chars.join('');
}

// ─── Email helpers ──────────────────────────────────────

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function buildCredentialBlock(email: string, password: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background:#f1f5f9;border-radius:12px;border:1px solid #e2e8f0;">
    <tr><td style="padding:18px 20px;">
    <div style="font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Your Login Credentials</div>
    <table role="presentation" cellpadding="0" cellspacing="0">
    <tr>
      <td style="padding:3px 0;font-size:13px;color:#64748b;width:80px;">Email</td>
      <td style="padding:3px 0 3px 12px;font-size:14px;font-weight:600;color:#0f172a;font-family:'Courier New',Courier,monospace;">${escapeHtml(email)}</td>
    </tr>
    <tr>
      <td style="padding:3px 0;font-size:13px;color:#64748b;width:80px;">Password</td>
      <td style="padding:3px 0 3px 12px;font-size:14px;font-weight:600;color:#0f172a;font-family:'Courier New',Courier,monospace;">${escapeHtml(password)}</td>
    </tr>
    </table>
    </td></tr>
    </table>
    <p style="margin:0;font-size:12px;color:#ea580c;">⚠ Change your password after your first sign-in. Do not share these credentials.</p>`;
}

async function sendResendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.warn('[admin-invite] RESEND_API_KEY not configured — skipping email');
    return false;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [to],
        subject,
        html,
        reply_to: 'support@edudashpro.org.za',
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[admin-invite] Resend error:', res.status, body);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[admin-invite] Resend fetch error:', err);
    return false;
  }
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
    // Verify auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY!);

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify caller is superadmin
    const { data: callerProfiles, error: callerErr } = await supabase
      .from('profiles')
      .select('role')
      .or(`id.eq.${user.id},auth_user_id.eq.${user.id}`)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (callerErr) {
      return new Response(JSON.stringify({ error: 'Unable to verify superadmin role' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const callerRole = callerProfiles?.[0]?.role || null;
    if (!isSuperAdminRole(callerRole)) {
      return new Response(JSON.stringify({ error: 'Forbidden — superadmin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse and validate body
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || '').toLowerCase().trim();
    const fullName = String(body?.full_name || '').trim();
    const role = String(body?.role || 'admin').toLowerCase();
    const department = String(body?.department || 'customer_success').trim();
    const sendEmail = body?.send_email !== false;

    if (!email || !fullName) {
      return new Response(
        JSON.stringify({ error: 'email and full_name are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email address' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!VALID_ROLES.includes(role)) {
      return new Response(
        JSON.stringify({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Check if user already exists
    const { data: existingProfiles } = await supabase
      .from('profiles')
      .select('id, email, role')
      .eq('email', email)
      .limit(1);

    if (existingProfiles && existingProfiles.length > 0) {
      return new Response(
        JSON.stringify({ error: 'A user with this email already exists' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Generate a secure password that will be emailed to the user
    const password = generateSecurePassword();

    const { data: authData, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role,
        department,
        invited_by: user.id,
      },
    });

    if (createError || !authData?.user) {
      console.error('[admin-invite] Create user error:', createError);
      return new Response(
        JSON.stringify({ error: createError?.message || 'Failed to create user account' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const newUserId = authData.user.id;

    // Create profile record
    // The profiles table role CHECK only allows: parent, teacher, principal, superadmin, admin, instructor, student
    // Specialized admin roles (content_moderator, etc.) are stored in user_metadata for now
    const profileRole = ['admin', 'parent', 'teacher', 'principal', 'superadmin', 'instructor', 'student'].includes(role) ? role : 'admin';

    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: newUserId,
        auth_user_id: newUserId,
        email,
        full_name: fullName,
        role: profileRole,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

    if (profileError) {
      console.error('[admin-invite] Profile creation error:', profileError);
      // Best-effort cleanup: delete the auth user if profile creation fails
      await supabase.auth.admin.deleteUser(newUserId).catch(() => {});
      return new Response(
        JSON.stringify({ error: 'Failed to create user profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Send branded welcome email with login credentials via Resend
    let emailSent = false;
    if (sendEmail) {
      const roleLabel = ROLE_LABELS[role] || role;
      const firstName = fullName.split(' ')[0] || fullName;
      const signInUrl = `${APP_WEB_URL}/sign-in`;

      const credentialsHtml = buildCredentialBlock(email, password);

      const html = renderEduDashProEmail({
        title: `Welcome to EduDash Pro`,
        preheader: `Your ${roleLabel} account is ready — sign in now.`,
        subtitle: `Hi ${escapeHtml(firstName)}, an administrator has created a <strong>${escapeHtml(roleLabel)}</strong> account for you.`,
        bodyHtml: `
          <p>You can sign in to EduDash Pro using the credentials below:</p>
          ${credentialsHtml}
          <p style="margin-top:16px;">Once signed in, you'll have access to the <strong>${escapeHtml(roleLabel)}</strong> dashboard and tools.</p>
        `,
        cta: { label: 'Sign In to EduDash Pro', url: signInUrl },
        footerNote: 'If you did not expect this invitation, you can safely ignore this email.',
      });

      emailSent = await sendResendEmail(
        email,
        `Your EduDash Pro ${roleLabel} Account`,
        html,
      );

      if (!emailSent) {
        console.warn('[admin-invite] Email sending failed — user was still created');
      }
    }

    // Log the invite action
    await supabase
      .from('platform_activity_log')
      .insert({
        actor_id: user.id,
        action: 'admin_invited',
        entity_type: 'profile',
        entity_id: newUserId,
        metadata: { email, role, department, send_email: sendEmail },
      })
      .catch(() => {
        // Table may not exist yet — non-fatal
      });

    return new Response(
      JSON.stringify({
        success: true,
        user_id: newUserId,
        email,
        role,
        department,
        email_sent: emailSent,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[admin-invite] Error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
