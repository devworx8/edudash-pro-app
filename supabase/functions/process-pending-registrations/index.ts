/**
 * Process Pending Registrations — Cron Safety Net
 *
 * Scans auth.users for any with pending_children in their metadata
 * and calls process_pending_registration() for each.
 *
 * This catches cases where the client-side RPC call in handleSignedIn
 * failed due to network issues or runtime errors.
 *
 * Schedule: Every 15 minutes via Supabase cron or external scheduler.
 * Auth: CRON_SECRET or SUPABASE_SERVICE_ROLE_KEY in Authorization header.
 */

import { serve } from 'https://deno.land/std@0.214.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET') || '';

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  // Auth: CRON_SECRET (custom header or Bearer token) or valid service-role JWT
  const authHeader = req.headers.get('Authorization') || '';
  const cronHeader = req.headers.get('x-cron-secret');
  const token = authHeader.replace('Bearer ', '');

  const isCron = CRON_SECRET && (token === CRON_SECRET || cronHeader === CRON_SECRET);

  // For service-role auth, verify by decoding the JWT role claim
  let isServiceRole = false;
  if (!isCron && token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      isServiceRole = payload.role === 'service_role';
    } catch { /* not a valid JWT */ }
  }

  if (!isCron && !isServiceRole) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Find users with pending_children in their metadata
    const { data: users, error: fetchError } = await supabase
      .from('auth_users_view')
      .select('id')
      .not('raw_user_meta_data->pending_children', 'is', null);

    // If view doesn't exist, use direct SQL
    let pendingUsers: { id: string }[] = [];

    if (fetchError) {
      // Fallback: query via RPC or direct admin API
      const { data, error: rpcError } = await supabase.rpc(
        'get_users_with_pending_registrations'
      );

      if (rpcError) {
        // Final fallback: use admin auth API to list users, filter client-side
        const { data: authData, error: authError } =
          await supabase.auth.admin.listUsers({ perPage: 500 });

        if (authError) {
          return new Response(
            JSON.stringify({ error: 'Failed to query users', detail: authError.message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }

        pendingUsers = (authData.users || [])
          .filter(
            (u) =>
              u.user_metadata?.pending_children &&
              Array.isArray(u.user_metadata.pending_children) &&
              u.user_metadata.pending_children.length > 0
          )
          .map((u) => ({ id: u.id }));
      } else {
        pendingUsers = data || [];
      }
    } else {
      pendingUsers = users || [];
    }

    if (pendingUsers.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, message: 'No pending registrations found' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const results: { user_id: string; result: unknown; error?: string }[] = [];

    for (const user of pendingUsers) {
      try {
        const { data, error } = await supabase.rpc(
          'process_pending_registration',
          { p_user_id: user.id }
        );

        results.push({
          user_id: user.id,
          result: data,
          ...(error ? { error: error.message } : {}),
        });
      } catch (err) {
        results.push({
          user_id: user.id,
          result: null,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const processed = results.filter((r) => !r.error).length;
    const failed = results.filter((r) => r.error).length;

    return new Response(
      JSON.stringify({
        processed,
        failed,
        total: pendingUsers.length,
        results,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: 'Internal error',
        detail: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
