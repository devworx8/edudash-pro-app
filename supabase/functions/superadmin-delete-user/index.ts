/**
 * Superadmin Delete User (Immediate)
 *
 * Deletes a target user's auth account immediately using the service role key.
 * Also performs best-effort cleanup of common public tables.
 *
 * Expected body: { confirm: true, target_user_id: string, reason?: string }
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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY!);

    // Verify caller session
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    if (!body?.confirm) {
      return new Response(JSON.stringify({ error: 'Deletion must be explicitly confirmed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const targetUserId = String(body?.target_user_id || '').trim();
    if (!targetUserId) {
      return new Response(JSON.stringify({ error: 'target_user_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (targetUserId === user.id) {
      return new Response(JSON.stringify({ error: 'Cannot delete your own account via superadmin endpoint' }), {
        status: 400,
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
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Block deleting other superadmins
    const { data: targetProfiles } = await supabase
      .from('profiles')
      .select('role,email')
      .or(`id.eq.${targetUserId},auth_user_id.eq.${targetUserId}`)
      .order('updated_at', { ascending: false })
      .limit(1);

    const targetRole = targetProfiles?.[0]?.role || null;
    if (isSuperAdminRole(targetRole)) {
      return new Response(JSON.stringify({ error: 'Cannot delete superadmin users' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Clear all FK references in a single DB transaction via RPC.
    // This nullifies audit columns, deletes owned records, and validates
    // the user isn't a principal of any organization.
    const { data: cleanupResult, error: cleanupError } = await supabase
      .rpc('prepare_user_for_deletion', { p_target_user_id: targetUserId });

    if (cleanupError) {
      console.error('[superadmin-delete-user] Cleanup RPC failed:', cleanupError.message);
      // Surface principal-reassignment errors directly to the caller
      if (cleanupError.message?.includes('principal')) {
        return new Response(
          JSON.stringify({ error: cleanupError.message }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      throw new Error(`Pre-deletion cleanup failed: ${cleanupError.message}`);
    }

    console.log('[superadmin-delete-user] Cleanup done:', JSON.stringify(cleanupResult));

    // Now safe to delete the auth user — all FK refs cleared
    const { error: deleteError } = await supabase.auth.admin.deleteUser(targetUserId);
    if (deleteError) {
      throw new Error(deleteError.message || 'Failed to delete auth user');
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (err) {
    console.error('[superadmin-delete-user] Error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});

