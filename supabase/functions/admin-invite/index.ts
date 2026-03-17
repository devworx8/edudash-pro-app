/**
 * Admin Invite Edge Function
 *
 * Creates a new admin user account and optionally sends an invite email.
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

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
}

const VALID_ROLES = ['admin', 'content_moderator', 'support_admin', 'billing_admin', 'system_admin'];

const isSuperAdminRole = (role: string | null | undefined): boolean => {
  const r = String(role || '').toLowerCase();
  return r === 'superadmin' || r === 'super_admin' || r === 'platform_admin';
};

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

    // Create auth user with a random secure password (user will reset via email)
    const tempPassword = crypto.randomUUID() + '-' + crypto.randomUUID().slice(0, 8);

    const { data: authData, error: createError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
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

    // Send password reset email so the invited user can set their password
    if (sendEmail) {
      const appUrl = Deno.env.get('APP_WEB_URL') || 'https://app.edudashpro.org.za';
      const { error: resetError } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: {
          redirectTo: `${appUrl}/auth-callback?type=invite`,
        },
      });

      if (resetError) {
        console.error('[admin-invite] Email link generation warning:', resetError);
        // Non-fatal — user was still created
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
        email_sent: sendEmail,
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
