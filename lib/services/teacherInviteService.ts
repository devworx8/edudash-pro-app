import { assertSupabase } from '@/lib/supabase';
import { createPendingApproval } from '@/lib/services/teacherApprovalService';

function randomToken(len = 32) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export type TeacherInvite = {
  id: string;
  school_id: string;
  email: string;
  token: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  invited_by: string;
  expires_at: string;
  created_at: string;
  accepted_by?: string | null;
  accepted_at?: string | null;
};

export type TeacherInviteAcceptResult = {
  status: 'linked' | 'requires_switch';
  schoolId: string;
  existingOrgId?: string | null;
};

export class TeacherInviteService {
  static async createInvite(params: { schoolId: string; email: string; invitedBy: string }): Promise<TeacherInvite> {
    const token = randomToken(48);
    const { data, error } = await assertSupabase()
      .from('teacher_invites')
      .insert({ school_id: params.schoolId, email: params.email, invited_by: params.invitedBy, token })
      .select('*')
      .single();
    if (error) throw error;
    return data as TeacherInvite;
  }

  static async listInvites(schoolId: string): Promise<TeacherInvite[]> {
    const { data, error } = await assertSupabase()
      .from('teacher_invites')
      .select('*')
      .eq('school_id', schoolId)
      .in('status', ['pending', 'accepted'])
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as TeacherInvite[];
  }

  static async revoke(inviteId: string): Promise<void> {
    const { error } = await assertSupabase()
      .from('teacher_invites')
      .update({ status: 'revoked' })
      .eq('id', inviteId);
    if (error) throw error;
  }

  static async deleteInvite(
    inviteId: string,
    options?: { schoolId?: string | null }
  ): Promise<void> {
    const supabase = assertSupabase();
    const schoolId = options?.schoolId || null;

    // Attempt hard-delete with .select() to verify rows were affected
    let deleteQuery = supabase
      .from('teacher_invites')
      .delete()
      .eq('id', inviteId);
    if (schoolId) {
      deleteQuery = deleteQuery.eq('school_id', schoolId);
    }

    const { data: deleted, error } = await deleteQuery.select('id');
    if (!error && deleted && deleted.length > 0) return;

    // Hard-delete failed or 0 rows affected — fallback to revoking status
    let revokeQuery = supabase
      .from('teacher_invites')
      .update({ status: 'revoked' })
      .eq('id', inviteId);
    if (schoolId) {
      revokeQuery = revokeQuery.eq('school_id', schoolId);
    }

    const { data: revoked, error: revokeError } = await revokeQuery.select('id');
    if (!revokeError && revoked && revoked.length > 0) return;

    // Both delete and revoke failed — throw with meaningful message
    const reason = error?.message || revokeError?.message || 'Invite not found or access denied';
    throw new Error(`Failed to delete invite: ${reason}`);
  }

  static async accept(params: { token: string; authUserId: string; email: string }): Promise<TeacherInviteAcceptResult> {
    const supabase = assertSupabase();

    // Verify invite (must be pending AND not yet expired)
    const { data: invite, error: invErr } = await supabase
      .from('teacher_invites')
      .select('*')
      .eq('token', params.token)
      .eq('email', params.email)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (invErr || !invite) throw new Error('Invalid or expired invite');

    // Mark accepted
    await supabase
      .from('teacher_invites')
      .update({ status: 'accepted', accepted_by: params.authUserId, accepted_at: new Date().toISOString() })
      .eq('id', invite.id);

    // Check if the teacher is already linked to a different school
    let existingOrgId: string | null = null;
    let requiresSwitch = false;
    try {
      const { data: existing } = await supabase
        .from('profiles')
        .select('id, role, preschool_id, organization_id, auth_user_id')
        .eq('id', params.authUserId)
        .maybeSingle();
      existingOrgId = (existing as any)?.organization_id || (existing as any)?.preschool_id || null;
      requiresSwitch = !!(existingOrgId && existingOrgId !== invite.school_id);

      // Ensure auth_user_id is linked (but DON'T set role/org yet — wait for principal approval)
      if (existing && !(existing as any)?.auth_user_id) {
        await supabase
          .from('profiles')
          .update({ auth_user_id: params.authUserId })
          .eq('id', existing.id);
      } else if (!existing) {
        // Create a minimal profile if none exists (role stays unset until approval)
        await supabase
          .from('profiles')
          .upsert({
            id: params.authUserId,
            auth_user_id: params.authUserId,
            email: params.email,
          });
        requiresSwitch = false;
      }
      // NOTE: We do NOT set role='teacher', preschool_id, organization_id, or create
      // organization_members here. These are set by approveTeacher() after principal approval.
    } catch { /* Intentional: non-fatal */ }

    // Move teacher into pending principal-approval queue.
    try {
      const approvalResult = await createPendingApproval(params.authUserId, invite.school_id, invite.id);
      if (!approvalResult.success) {
        console.warn('[TeacherInviteService] Pending approval was not created:', approvalResult.error || approvalResult.message);
      }
    } catch (approvalError) {
      console.warn('[TeacherInviteService] Failed to create pending approval:', approvalError);
    }

    // Notify principals that a teacher accepted the invite and needs final approval.
    try {
      const { data: teacherProfile } = await supabase
        .from('profiles')
        .select('first_name, last_name, email')
        .eq('id', params.authUserId)
        .maybeSingle();

      const teacherName = `${teacherProfile?.first_name || ''} ${teacherProfile?.last_name || ''}`.trim() || params.email;

      await supabase.functions.invoke('notifications-dispatcher', {
        body: {
          event_type: 'teacher_invite_accepted_pending_principal',
          preschool_id: invite.school_id,
          include_email: true,
          send_immediately: true,
          custom_payload: {
            teacher_user_id: params.authUserId,
            teacher_name: teacherName,
            teacher_email: teacherProfile?.email || params.email,
          },
        },
      });
    } catch (notifyError) {
      console.warn('[TeacherInviteService] Failed to notify principal approval queue:', notifyError);
    }

    return {
      status: requiresSwitch ? 'requires_switch' : 'linked',
      schoolId: invite.school_id,
      existingOrgId,
    };
  }
}
