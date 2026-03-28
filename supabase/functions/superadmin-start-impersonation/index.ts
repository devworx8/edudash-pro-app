/**
 * Superadmin Start Impersonation
 *
 * Generates a one-time sign-in link for a target user after verifying that the
 * caller is a superadmin. The client uses the returned action link to switch
 * into the target account via the normal auth-callback route.
 */

import { serve } from 'https://deno.land/std@0.214.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { APP_URL, WEB_BASE_URL, buildAppUrl } from '../_shared/urls.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

type ImpersonationRequest = {
  target_user_id?: string;
  user_id?: string;
  email?: string;
  redirect_to?: string;
};

const DEV_ALLOWED_ORIGINS = new Set([
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:8081',
  'http://localhost:8082',
  'http://localhost:8083',
  'http://localhost:19006',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8081',
  'http://127.0.0.1:8082',
  'http://127.0.0.1:8083',
  'http://127.0.0.1:19006',
]);

const DEFAULT_REDIRECT_TO = buildAppUrl('/auth-callback?impersonation=1');

function jsonResponse(
  req: Request,
  status: number,
  payload: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

function isSuperAdminRole(role: string | null | undefined): boolean {
  const normalized = String(role || '').toLowerCase();
  return (
    normalized === 'superadmin' ||
    normalized === 'super_admin' ||
    normalized === 'platform_admin'
  );
}

function buildAllowedOrigins(): Set<string> {
  const allowed = new Set<string>([...DEV_ALLOWED_ORIGINS]);
  const candidates = [APP_URL, WEB_BASE_URL];

  candidates.forEach((value) => {
    try {
      allowed.add(new URL(value).origin);
    } catch {
      // Ignore invalid env values and fall back to defaults
    }
  });

  return allowed;
}

function sanitizeRedirectTo(redirectTo: unknown): string {
  const raw = String(redirectTo || '').trim();
  if (!raw) return DEFAULT_REDIRECT_TO;

  if (
    (raw.startsWith('edudashpro://') || raw.startsWith('exp://')) &&
    raw.includes('auth-callback')
  ) {
    return raw;
  }

  try {
    const parsed = new URL(raw);
    if (!parsed.pathname.includes('auth-callback')) {
      return DEFAULT_REDIRECT_TO;
    }

    const allowedOrigins = buildAllowedOrigins();
    if (!allowedOrigins.has(parsed.origin)) {
      return DEFAULT_REDIRECT_TO;
    }

    return parsed.toString();
  } catch {
    return DEFAULT_REDIRECT_TO;
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  if (req.method !== 'POST') {
    return jsonResponse(req, 405, { success: false, error: 'Method not allowed' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(req, 500, {
      success: false,
      error: 'Supabase configuration is missing',
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse(req, 401, { success: false, error: 'Unauthorized' });
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return jsonResponse(req, 401, { success: false, error: 'Unauthorized' });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const {
      data: { user: actorUser },
      error: actorError,
    } = await supabaseAdmin.auth.getUser(token);

    if (actorError || !actorUser) {
      return jsonResponse(req, 401, { success: false, error: 'Invalid session' });
    }

    const { data: actorProfile, error: actorProfileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, role')
      .or(`id.eq.${actorUser.id},auth_user_id.eq.${actorUser.id}`)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (actorProfileError || !actorProfile) {
      return jsonResponse(req, 403, { success: false, error: 'Profile not found' });
    }

    if (!isSuperAdminRole(actorProfile.role)) {
      return jsonResponse(req, 403, { success: false, error: 'Forbidden' });
    }

    const body = (await req.json().catch(() => ({}))) as ImpersonationRequest;
    const requestedUserId = String(body.target_user_id || body.user_id || '').trim();
    const requestedEmail = String(body.email || '').trim().toLowerCase();
    const redirectTo = sanitizeRedirectTo(body.redirect_to);

    if (!requestedUserId && !requestedEmail) {
      return jsonResponse(req, 400, {
        success: false,
        error: 'target_user_id or email is required',
      });
    }

    let targetUserId = requestedUserId;
    let targetEmail = requestedEmail;

    if (!targetUserId && requestedEmail) {
      const { data: authLookup, error: authLookupError } = await supabaseAdmin
        .schema('auth')
        .from('users')
        .select('id, email')
        .eq('email', requestedEmail)
        .maybeSingle();

      if (authLookupError || !authLookup?.id) {
        return jsonResponse(req, 404, { success: false, error: 'User not found' });
      }

      targetUserId = authLookup.id;
      targetEmail = String(authLookup.email || requestedEmail).trim().toLowerCase();
    }

    if (!targetUserId) {
      return jsonResponse(req, 400, {
        success: false,
        error: 'Unable to resolve target user',
      });
    }

    if (targetUserId === actorUser.id) {
      return jsonResponse(req, 400, {
        success: false,
        error: 'Cannot impersonate your own account',
      });
    }

    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, email, role')
      .or(`id.eq.${targetUserId},auth_user_id.eq.${targetUserId}`)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (isSuperAdminRole(targetProfile?.role)) {
      return jsonResponse(req, 403, {
        success: false,
        error: 'Cannot impersonate superadmin users',
      });
    }

    const { data: targetUserData, error: targetUserError } =
      await supabaseAdmin.auth.admin.getUserById(targetUserId);

    if (targetUserError || !targetUserData?.user) {
      return jsonResponse(req, 404, { success: false, error: 'User not found' });
    }

    targetEmail =
      String(
        targetEmail ||
          targetUserData.user.email ||
          targetProfile?.email ||
          '',
      )
        .trim()
        .toLowerCase();

    if (!targetEmail) {
      return jsonResponse(req, 400, {
        success: false,
        error: 'This user cannot be impersonated because no email is available.',
      });
    }

    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: targetEmail,
        options: { redirectTo },
      });

    if (linkError) {
      console.error('[superadmin-start-impersonation] generateLink failed:', linkError);
      return jsonResponse(req, 500, {
        success: false,
        error: linkError.message || 'Could not create impersonation link',
      });
    }

    const actionLink =
      (linkData as { properties?: { action_link?: string } } | null)?.properties?.action_link ||
      (linkData as { action_link?: string } | null)?.action_link ||
      null;

    if (!actionLink) {
      return jsonResponse(req, 500, {
        success: false,
        error: 'Supabase did not return an impersonation link',
      });
    }

    try {
      await supabaseAdmin.from('superadmin_user_actions').insert({
        action: 'user_impersonated',
        admin_id: actorUser.id,
        admin_user_id: actorUser.id,
        description: `Impersonation link issued for ${targetEmail}`,
        target_user_id: targetUserId,
        resource_id: targetUserId,
        resource_type: 'auth_user',
      });
    } catch (logError) {
      console.warn('[superadmin-start-impersonation] Could not write action log:', logError);
    }

    return jsonResponse(req, 200, {
      success: true,
      action_link: actionLink,
      redirect_to: redirectTo,
      target_user_id: targetUserId,
      target_email: targetEmail,
    });
  } catch (error) {
    console.error('[superadmin-start-impersonation] Unexpected error:', error);
    return jsonResponse(req, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});
