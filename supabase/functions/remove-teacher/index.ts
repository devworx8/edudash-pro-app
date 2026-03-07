// Supabase Edge Function: remove-teacher
// Archives a teacher from a school (no hard delete), using service role to bypass RLS.
// Callable by school leadership roles in the same organization.

declare const Deno: {
  env: { get(key: string): string | undefined };
};

// @ts-ignore - Deno URL imports
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// @ts-ignore - Deno URL imports
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

interface RemoveTeacherRequest {
  teacher_record_id: string;
  organization_id: string;
  teacher_user_id?: string | null;
  reason?: string | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  console.log('[remove-teacher] Request received');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Verify the caller is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Create a client scoped to the caller to verify their identity
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authError } = await callerClient.auth.getUser();
    if (authError || !caller) {
      console.error('[remove-teacher] Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body: RemoveTeacherRequest = await req.json();
    const { teacher_record_id, organization_id, teacher_user_id, reason } = body;

    if (!teacher_record_id || !organization_id) {
      return new Response(
        JSON.stringify({ error: 'Missing teacher_record_id or organization_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(
      '[remove-teacher] Caller:',
      caller.id,
      'archiving teacher record:',
      teacher_record_id,
      'from org:',
      organization_id,
    );

    // Use service role client for admin operations
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify the caller is a principal/admin of this organization
    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('role, organization_id, preschool_id')
      .eq('id', caller.id)
      .single();

    const isCallerAuthorized =
      callerProfile &&
      ['principal', 'principal_admin', 'admin', 'super_admin', 'superadmin'].includes(
        (callerProfile.role || '').toLowerCase(),
      ) &&
      (callerProfile.organization_id === organization_id ||
        callerProfile.preschool_id === organization_id);

    if (!isCallerAuthorized) {
      console.error('[remove-teacher] Caller not authorized:', callerProfile?.role, callerProfile?.organization_id);
      return new Response(
        JSON.stringify({ error: 'You must be a school leader of this school to archive teachers' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: teacherRow, error: teacherLookupError } = await adminClient
      .from('teachers')
      .select('id,preschool_id,user_id,auth_user_id,full_name,email,is_active,employment_status')
      .eq('id', teacher_record_id)
      .eq('preschool_id', organization_id)
      .maybeSingle();

    if (teacherLookupError) {
      console.error('[remove-teacher] teacher lookup error:', teacherLookupError);
      return new Response(
        JSON.stringify({ error: teacherLookupError.message || 'Failed to load teacher record' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!teacherRow) {
      return new Response(
        JSON.stringify({ error: 'Teacher record not found for this school' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const candidateIds = Array.from(
      new Set(
        [teacher_user_id, teacherRow.user_id, teacherRow.auth_user_id]
          .filter((value): value is string => typeof value === 'string' && value.length > 0),
      ),
    );

    let resolvedProfileId: string | null = null;
    let resolvedAuthUserId: string | null = null;

    if (candidateIds.length > 0) {
      const { data: profileCandidates, error: profileLookupError } = await adminClient
        .from('profiles')
        .select('id,auth_user_id')
        .or(
          candidateIds
            .map((id) => `id.eq.${id}`)
            .concat(candidateIds.map((id) => `auth_user_id.eq.${id}`))
            .join(','),
        );

      if (profileLookupError) {
        console.warn('[remove-teacher] profile lookup warning:', profileLookupError.message);
      } else if (Array.isArray(profileCandidates) && profileCandidates.length > 0) {
        const bestMatch =
          profileCandidates.find((profile) => profile.id === teacher_user_id || profile.auth_user_id === teacher_user_id) ||
          profileCandidates[0];
        resolvedProfileId = bestMatch?.id || null;
        resolvedAuthUserId = bestMatch?.auth_user_id || null;
      }
    }

    // Prevent archiving yourself
    if (
      caller.id === teacher_record_id ||
      (resolvedProfileId && caller.id === resolvedProfileId) ||
      (resolvedAuthUserId && caller.id === resolvedAuthUserId)
    ) {
      return new Response(
        JSON.stringify({ error: 'You cannot archive yourself' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const errors: string[] = [];

    // Step 1: Unassign class ownership for all known teacher identifiers.
    const classTeacherRefs = Array.from(
      new Set(
        [teacher_record_id, teacher_user_id, teacherRow.user_id, teacherRow.auth_user_id, resolvedProfileId, resolvedAuthUserId]
          .filter((value): value is string => typeof value === 'string' && value.length > 0),
      ),
    );

    if (classTeacherRefs.length > 0) {
      const { error: classError } = await adminClient
        .from('classes')
        .update({ teacher_id: null })
        .in('teacher_id', classTeacherRefs)
        .eq('preschool_id', organization_id);
      if (classError) {
        console.error('[remove-teacher] Class unassign error:', classError);
        errors.push(`Classes: ${classError.message}`);
      } else {
        console.log('[remove-teacher] ✅ Classes unassigned');
      }
    }

    // Step 2: Archive teacher record.
    const { error: teacherArchiveError } = await adminClient
      .from('teachers')
      .update({
        is_active: false,
        employment_status: 'archived',
        archived_at: new Date().toISOString(),
        archived_by: caller.id,
        archive_reason: (reason || '').trim() || 'Archived by principal',
      })
      .eq('id', teacher_record_id)
      .eq('preschool_id', organization_id);

    if (teacherArchiveError) {
      console.error('[remove-teacher] Teacher archive error:', teacherArchiveError);
      errors.push(`Teacher archive: ${teacherArchiveError.message}`);
    } else {
      console.log('[remove-teacher] ✅ Teacher archived');
    }

    // Step 3: Deactivate organization membership (archive-safe; no hard delete).
    if (resolvedProfileId) {
      const { error: memberError } = await adminClient
        .from('organization_members')
        .update({
          membership_status: 'inactive',
          seat_status: 'inactive',
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', resolvedProfileId)
        .eq('organization_id', organization_id);
      if (memberError) {
        console.error('[remove-teacher] Membership update error:', memberError);
        errors.push(`Membership: ${memberError.message}`);
      } else {
        console.log('[remove-teacher] ✅ Organization membership archived');
      }
    }

    // Step 4: Deactivate payroll recipient for archived teacher.
    const { error: recipientDeactivateError } = await adminClient
      .from('payroll_recipients')
      .update({
        active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', organization_id)
      .eq('teacher_id', teacher_record_id);
    if (recipientDeactivateError) {
      console.warn('[remove-teacher] Payroll recipient deactivate warning:', recipientDeactivateError.message);
    }

    // Step 5: Clear profile org linkage + seat status when profile exists.
    if (resolvedProfileId) {
      const { error: profileError } = await adminClient
        .from('profiles')
        .update({
          organization_id: null,
          preschool_id: null,
          seat_status: 'inactive',
          updated_at: new Date().toISOString(),
        })
        .eq('id', resolvedProfileId);
      if (profileError) {
        console.error('[remove-teacher] Profile update error:', profileError);
        errors.push(`Profile: ${profileError.message}`);
      } else {
        console.log('[remove-teacher] ✅ Profile cleared');
      }
    }

    // Step 6: Revoke subscription seat.
    if (resolvedProfileId) {
      const { error: seatError } = await adminClient
        .rpc('rpc_revoke_teacher_seat', { target_user_id: resolvedProfileId });
      if (seatError) {
        // Non-fatal — teacher might not have a seat.
        console.warn('[remove-teacher] Seat revoke (non-fatal):', seatError.message);
      } else {
        console.log('[remove-teacher] ✅ Subscription seat revoked');
      }
    }

    // Step 7: Cleanup pending invites for matching email.
    const teacherEmail = teacherRow.email || null;
    if (teacherEmail) {
      const { error: inviteError } = await adminClient
        .from('teacher_invites')
        .delete()
        .eq('email', teacherEmail)
        .eq('preschool_id', organization_id);
      if (inviteError) {
        console.warn('[remove-teacher] Invite cleanup error (non-fatal):', inviteError);
      } else {
        console.log('[remove-teacher] ✅ Pending invites cleaned up');
      }
    }

    if (errors.length > 0) {
      console.error('[remove-teacher] Completed with errors:', errors);
      return new Response(
        JSON.stringify({ success: false, error: errors.join('; '), partial: true }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log('[remove-teacher] ✅ Teacher archived');
    return new Response(
      JSON.stringify({
        success: true,
        action: 'archived',
        teacher_record_id,
        resolved_profile_id: resolvedProfileId,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    console.error('[remove-teacher] Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: err?.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
