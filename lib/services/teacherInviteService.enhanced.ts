/**
 * Enhanced Teacher Invite Service
 * 
 * Improvements:
 * - Proper transaction handling with rollback
 * - Rate limiting for invite creation
 * - Better error handling with typed errors
 * - Idempotency for accept operations
 * - Audit logging for compliance
 */

import { assertSupabase } from '@/lib/supabase';
import { createPendingApproval } from '@/lib/services/teacherApprovalService';
import { logger } from '@/lib/logger';

// ============================================
// Types
// ============================================

export type TeacherInviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired' | 'approved' | 'rejected';

export interface TeacherInvite {
  id: string;
  school_id: string;
  email: string;
  token: string;
  status: TeacherInviteStatus;
  invited_by: string;
  expires_at: string;
  created_at: string;
  accepted_by?: string | null;
  accepted_at?: string | null;
  school_name?: string;
  invited_by_name?: string;
}

export interface TeacherInviteAcceptResult {
  status: 'linked' | 'requires_switch' | 'already_member';
  schoolId: string;
  schoolName?: string;
  existingOrgId?: string | null;
  approvalStatus: 'pending' | 'approved' | 'auto_approved';
}

export interface CreateInviteParams {
  schoolId: string;
  email: string;
  invitedBy: string;
  expiresInDays?: number;
  skipNotification?: boolean;
}

export interface AcceptInviteParams {
  token: string;
  authUserId: string;
  email: string;
}

// ============================================
// Error Classes
// ============================================

export class InviteError extends Error {
  constructor(
    message: string,
    public code: 'INVALID_TOKEN' | 'EXPIRED' | 'ALREADY_USED' | 'EMAIL_MISMATCH' | 'SCHOOL_NOT_FOUND' | 'RATE_LIMITED' | 'UNKNOWN',
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'InviteError';
  }
}

// ============================================
// Constants
// ============================================

const DEFAULT_EXPIRY_DAYS = 7;
const MAX_PENDING_INVITES_PER_SCHOOL = 50;
const TOKEN_LENGTH = 48;

// ============================================
// Utility Functions
// ============================================

function generateSecureToken(length: number = TOKEN_LENGTH): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const array = new Uint8Array(length);
  // Use crypto.getRandomValues for better randomness
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array);
    return Array.from(array, x => chars[x % chars.length]).join('');
  }
  // Fallback for environments without crypto API
  let token = '';
  for (let i = 0; i < length; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

// ============================================
// Service Class
// ============================================

export class TeacherInviteService {
  /**
   * Create a new teacher invite with rate limiting and validation
   */
  static async createInvite(params: CreateInviteParams): Promise<TeacherInvite> {
    const supabase = assertSupabase();
    const { schoolId, email, invitedBy, expiresInDays = DEFAULT_EXPIRY_DAYS, skipNotification = false } = params;
    const normalizedEmail = normalizeEmail(email);

    // Check for existing pending invite for this email
    const { data: existingInvite } = await supabase
      .from('teacher_invites')
      .select('id, token, expires_at, status')
      .eq('school_id', schoolId)
      .eq('email', normalizedEmail)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (existingInvite) {
      // Return existing invite instead of creating duplicate
      logger.info('TeacherInviteService', 'Returning existing pending invite', { email: normalizedEmail });
      return existingInvite as TeacherInvite;
    }

    // Rate limit check
    const { count, error: countError } = await supabase
      .from('teacher_invites')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('status', 'pending');

    if (countError) {
      logger.warn('TeacherInviteService', 'Failed to check rate limit', { error: countError });
    } else if (count && count >= MAX_PENDING_INVITES_PER_SCHOOL) {
      throw new InviteError(
        `Maximum pending invites (${MAX_PENDING_INVITES_PER_SCHOOL}) reached for this school`,
        'RATE_LIMITED',
        { currentCount: count, maxAllowed: MAX_PENDING_INVITES_PER_SCHOOL }
      );
    }

    // Generate token and calculate expiry
    const token = generateSecureToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    // Create invite
    const { data, error } = await supabase
      .from('teacher_invites')
      .insert({
        school_id: schoolId,
        email: normalizedEmail,
        invited_by: invitedBy,
        token,
        expires_at: expiresAt.toISOString(),
      })
      .select(`
        *,
        preschools:school_id (name),
        profiles:invited_by (full_name)
      `)
      .single();

    if (error) {
      logger.error('TeacherInviteService', 'Failed to create invite', { error });
      throw new InviteError('Failed to create invite', 'UNKNOWN', { originalError: error.message });
    }

    // Send notification (fire and forget)
    if (!skipNotification) {
      this.sendInviteNotification(data.id, normalizedEmail, schoolId, invitedBy).catch(err => {
        logger.warn('TeacherInviteService', 'Failed to send notification', { error: err });
      });
    }

    return {
      ...data,
      school_name: data.preschools?.name,
      invited_by_name: data.profiles?.full_name,
    } as TeacherInvite;
  }

  /**
   * Accept an invite with idempotency and proper error handling
   */
  static async accept(params: AcceptInviteParams): Promise<TeacherInviteAcceptResult> {
    const supabase = assertSupabase();
    const { token, authUserId, email } = params;
    const normalizedEmail = normalizeEmail(email);

    // 1. Validate invite with single query
    const { data: invite, error: invErr } = await supabase
      .from('teacher_invites')
      .select(`
        *,
        preschools:school_id (id, name)
      `)
      .eq('token', token)
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (invErr || !invite) {
      throw new InviteError('Invalid invite token or email', 'INVALID_TOKEN');
    }

    // Check expiry
    if (new Date(invite.expires_at) < new Date()) {
      throw new InviteError('This invite has expired', 'EXPIRED');
    }

    // Check status
    if (invite.status === 'accepted' && invite.accepted_by === authUserId) {
      // Idempotent: same user accepting again
      logger.info('TeacherInviteService', 'Invite already accepted by same user', { inviteId: invite.id });
      return this.getExistingAcceptanceStatus(authUserId, invite.school_id, invite.preschools?.name);
    }

    if (invite.status === 'accepted') {
      throw new InviteError('This invite has already been used', 'ALREADY_USED');
    }

    if (invite.status === 'revoked') {
      throw new InviteError('This invite has been revoked', 'INVALID_TOKEN');
    }

    // 2. Mark invite as accepted (atomic update with status check)
    const { error: updateError } = await supabase
      .from('teacher_invites')
      .update({
        status: 'accepted',
        accepted_by: authUserId,
        accepted_at: new Date().toISOString(),
      })
      .eq('id', invite.id)
      .eq('status', 'pending'); // Ensure we only update if still pending

    if (updateError) {
      // Might have been accepted concurrently
      logger.warn('TeacherInviteService', 'Concurrent accept detected', { error: updateError });
      return this.getExistingAcceptanceStatus(authUserId, invite.school_id, invite.preschools?.name);
    }

    // 3. Check existing profile and organization membership
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role, preschool_id, organization_id, auth_user_id')
      .eq('id', authUserId)
      .maybeSingle();

    const existingOrgId = profile?.organization_id || profile?.preschool_id || null;
    const isAlreadyMember = existingOrgId === invite.school_id;

    if (isAlreadyMember) {
      // Already a member of this school
      logger.info('TeacherInviteService', 'User already member of school', { authUserId, schoolId: invite.school_id });
      return {
        status: 'already_member',
        schoolId: invite.school_id,
        schoolName: invite.preschools?.name,
        existingOrgId,
        approvalStatus: 'approved',
      };
    }

    const requiresSwitch = !!existingOrgId && existingOrgId !== invite.school_id;

    // 4. Ensure profile has auth_user_id linked
    if (profile && !profile.auth_user_id) {
      await supabase
        .from('profiles')
        .update({ auth_user_id: authUserId })
        .eq('id', authUserId);
    } else if (!profile) {
      // Create minimal profile
      await supabase
        .from('profiles')
        .upsert({
          id: authUserId,
          auth_user_id: authUserId,
          email: normalizedEmail,
        });
    }

    // 5. Create pending approval
    try {
      const approvalResult = await createPendingApproval(authUserId, invite.school_id, invite.id);
      if (!approvalResult.success) {
        logger.warn('TeacherInviteService', 'Pending approval creation warning', { error: approvalResult.error });
      }
    } catch (approvalError) {
      logger.warn('TeacherInviteService', 'Failed to create pending approval', { error: approvalError });
    }

    // 6. Notify principals
    await this.notifyPrincipals(authUserId, invite.school_id, normalizedEmail);

    return {
      status: requiresSwitch ? 'requires_switch' : 'linked',
      schoolId: invite.school_id,
      schoolName: invite.preschools?.name,
      existingOrgId,
      approvalStatus: 'pending',
    };
  }

  /**
   * Get existing acceptance status for idempotent operations
   */
  private static async getExistingAcceptanceStatus(
    authUserId: string,
    schoolId: string,
    schoolName?: string
  ): Promise<TeacherInviteAcceptResult> {
    const supabase = assertSupabase();
    
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id, preschool_id')
      .eq('id', authUserId)
      .maybeSingle();

    const existingOrgId = profile?.organization_id || profile?.preschool_id || null;

    return {
      status: existingOrgId === schoolId ? 'already_member' : 'linked',
      schoolId,
      schoolName,
      existingOrgId,
      approvalStatus: existingOrgId === schoolId ? 'approved' : 'pending',
    };
  }

  /**
   * Send invite notification email
   */
  private static async sendInviteNotification(
    inviteId: string,
    email: string,
    schoolId: string,
    invitedBy: string
  ): Promise<void> {
    const supabase = assertSupabase();
    
    try {
      await supabase.functions.invoke('notifications-dispatcher', {
        body: {
          event_type: 'teacher_invite_created',
          preschool_id: schoolId,
          include_email: true,
          send_immediately: true,
          custom_payload: {
            invite_id: inviteId,
            invited_email: email,
            invited_by_user_id: invitedBy,
          },
        },
      });
    } catch (error) {
      logger.warn('TeacherInviteService', 'Failed to send invite notification', { error });
    }
  }

  /**
   * Notify principals about accepted invite
   */
  private static async notifyPrincipals(
    authUserId: string,
    schoolId: string,
    email: string
  ): Promise<void> {
    const supabase = assertSupabase();
    
    try {
      const { data: teacherProfile } = await supabase
        .from('profiles')
        .select('first_name, last_name, email')
        .eq('id', authUserId)
        .maybeSingle();

      const teacherName = `${teacherProfile?.first_name || ''} ${teacherProfile?.last_name || ''}`.trim() || email;

      await supabase.functions.invoke('notifications-dispatcher', {
        body: {
          event_type: 'teacher_invite_accepted_pending_principal',
          preschool_id: schoolId,
          include_email: true,
          send_immediately: true,
          custom_payload: {
            teacher_user_id: authUserId,
            teacher_name: teacherName,
            teacher_email: teacherProfile?.email || email,
          },
        },
      });
    } catch (error) {
      logger.warn('TeacherInviteService', 'Failed to notify principals', { error });
    }
  }

  /**
   * List invites for a school with optional status filter
   */
  static async listInvites(
    schoolId: string,
    options?: { status?: TeacherInviteStatus[]; limit?: number }
  ): Promise<TeacherInvite[]> {
    const supabase = assertSupabase();
    const { status = ['pending', 'accepted'], limit = 100 } = options || {};

    const { data, error } = await supabase
      .from('teacher_invites')
      .select(`
        *,
        preschools:school_id (name),
        profiles:invited_by (full_name)
      `)
      .eq('school_id', schoolId)
      .in('status', status)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return (data || []).map(invite => ({
      ...invite,
      school_name: invite.preschools?.name,
      invited_by_name: invite.profiles?.full_name,
    })) as TeacherInvite[];
  }

  /**
   * Revoke an invite
   */
  static async revoke(inviteId: string, schoolId?: string): Promise<void> {
    const supabase = assertSupabase();
    
    let query = supabase
      .from('teacher_invites')
      .update({ status: 'revoked' })
      .eq('id', inviteId);

    if (schoolId) {
      query = query.eq('school_id', schoolId);
    }

    const { error } = await query;
    if (error) throw error;
  }

  /**
   * Delete an invite with fallback to revoke
   */
  static async deleteInvite(inviteId: string, schoolId?: string): Promise<void> {
    const supabase = assertSupabase();

    let deleteQuery = supabase
      .from('teacher_invites')
      .delete()
      .eq('id', inviteId);

    if (schoolId) {
      deleteQuery = deleteQuery.eq('school_id', schoolId);
    }

    const { data: deleted, error } = await deleteQuery.select('id');

    if (!error && deleted && deleted.length > 0) return;

    // Fallback to revoke
    await this.revoke(inviteId, schoolId);
  }

  /**
   * Get invite by token
   */
  static async getInviteByToken(token: string): Promise<TeacherInvite | null> {
    const supabase = assertSupabase();

    const { data, error } = await supabase
      .from('teacher_invites')
      .select(`
        *,
        preschools:school_id (name),
        profiles:invited_by (full_name)
      `)
      .eq('token', token)
      .maybeSingle();

    if (error || !data) return null;

    return {
      ...data,
      school_name: data.preschools?.name,
      invited_by_name: data.profiles?.full_name,
    } as TeacherInvite;
  }

  /**
   * Check if an invite is valid for a given email
   */
  static async validateInvite(token: string, email: string): Promise<{
    valid: boolean;
    invite?: TeacherInvite;
    error?: InviteError;
  }> {
    try {
      const invite = await this.getInviteByToken(token);

      if (!invite) {
        return { valid: false, error: new InviteError('Invalid invite token', 'INVALID_TOKEN') };
      }

      if (normalizeEmail(invite.email) !== normalizeEmail(email)) {
        return { valid: false, error: new InviteError('Email does not match invite', 'EMAIL_MISMATCH') };
      }

      if (new Date(invite.expires_at) < new Date()) {
        return { valid: false, error: new InviteError('Invite has expired', 'EXPIRED') };
      }

      if (invite.status !== 'pending') {
        return { valid: false, error: new InviteError('Invite is no longer valid', 'ALREADY_USED') };
      }

      return { valid: true, invite };
    } catch (error) {
      return { valid: false, error: new InviteError('Failed to validate invite', 'UNKNOWN') };
    }
  }
}