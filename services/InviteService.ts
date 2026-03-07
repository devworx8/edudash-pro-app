/**
 * InviteService - Unified invitation and join request service
 * 
 * Handles creating, validating, and accepting invitations for:
 * - Teacher invites from principals
 * - Parent join requests
 * - Member joins for membership organizations
 * - Guardian claims for existing students
 * - Staff invites
 * - Learner enrollments
 * 
 * Uses the unified join_requests table from migration 20260103020855
 */
import { assertSupabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { Linking, Platform, Share } from 'react-native';
import { logger } from '@/lib/logger';
import Constants from 'expo-constants';
import { getSoaWebBaseUrl } from '@/lib/config/urls';

// Types matching the database enums
export type JoinRequestType = 
  | 'teacher_invite'
  | 'parent_join'
  | 'member_join'
  | 'guardian_claim'
  | 'staff_invite'
  | 'learner_enroll';

export type JoinRequestStatus = 
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'cancelled'
  | 'revoked';

export interface JoinRequest {
  id: string;
  request_type: JoinRequestType;
  status: JoinRequestStatus;
  requester_id: string | null;
  requester_email: string | null;
  requester_phone: string | null;
  organization_id: string | null;
  preschool_id: string | null;
  target_student_id: string | null;
  invite_code: string | null;
  invite_token: string | null;
  invited_by: string | null;
  message: string | null;
  relationship: string | null;
  requested_role: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateInviteParams {
  type: JoinRequestType;
  organizationId: string;
  preschoolId?: string;
  email?: string;
  phone?: string;
  message?: string;
  requestedRole?: string;
  expiresInDays?: number;
}

export interface AcceptInviteResult {
  success: boolean;
  error?: string;
  requestType?: JoinRequestType;
  organizationId?: string;
}

export interface ValidateInviteResult {
  valid: boolean;
  error?: string;
  requestType?: JoinRequestType;
  organizationName?: string;
  organizationId?: string;
  inviteToken?: string;
}

/**
 * InviteService class for managing invitations and join requests
 */
export class InviteService {
  /**
   * Create a new invite (for principals/admins)
   */
  static async createInvite(params: CreateInviteParams): Promise<{
    success: boolean;
    inviteCode?: string;
    inviteToken?: string;
    inviteLink?: string;
    error?: string;
  }> {
    try {
      const supabase = assertSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        return { success: false, error: 'Not authenticated' };
      }

      // Calculate expiration
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + (params.expiresInDays ?? 7));

      const { data, error } = await supabase
        .from('join_requests')
        .insert({
          request_type: params.type,
          organization_id: params.organizationId,
          preschool_id: params.preschoolId,
          requester_id: user.id, // Always set for constraint compliance
          requester_email: params.email,
          requester_phone: params.phone,
          invited_by: user.id,
          message: params.message,
          requested_role: params.requestedRole || this.getDefaultRole(params.type),
          expires_at: expiresAt.toISOString(),
        })
        .select('id, invite_code, invite_token')
        .single();

      if (error) {
        logger.error('Failed to create invite:', error);
        return { success: false, error: error.message };
      }

      const inviteLink = this.generateInviteLink(data.invite_code, data.invite_token);

      track('invite.created', {
        type: params.type,
        organization_id: params.organizationId,
        has_email: !!params.email,
        has_phone: !!params.phone,
      });

      return {
        success: true,
        inviteCode: data.invite_code,
        inviteToken: data.invite_token,
        inviteLink,
      };
    } catch (error) {
      logger.error('Create invite error:', error);
      return { success: false, error: 'Failed to create invitation' };
    }
  }

  /**
   * Create a join request (for users wanting to join an organization)
   */
  static async createJoinRequest(params: {
    type: JoinRequestType;
    organizationId: string;
    preschoolId?: string;
    message?: string;
    relationship?: string;
    targetStudentId?: string;
    requestedRole?: string;
  }): Promise<{ success: boolean; requestId?: string; error?: string }> {
    try {
      const supabase = assertSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        return { success: false, error: 'Not authenticated' };
      }

      // Check for existing pending request
      const { data: existing } = await supabase
        .from('join_requests')
        .select('id')
        .eq('requester_id', user.id)
        .eq('organization_id', params.organizationId)
        .eq('status', 'pending')
        .single();

      if (existing) {
        return { success: false, error: 'You already have a pending request for this organization' };
      }

      const { data, error } = await supabase
        .from('join_requests')
        .insert({
          request_type: params.type,
          requester_id: user.id,
          organization_id: params.organizationId,
          preschool_id: params.preschoolId,
          message: params.message,
          relationship: params.relationship,
          target_student_id: params.targetStudentId,
          requested_role: params.requestedRole,
        })
        .select('id')
        .single();

      if (error) {
        logger.error('Failed to create join request:', error);
        return { success: false, error: error.message };
      }

      track('join_request.created', {
        type: params.type,
        organization_id: params.organizationId,
      });

      return { success: true, requestId: data.id };
    } catch (error) {
      logger.error('Create join request error:', error);
      return { success: false, error: 'Failed to create join request' };
    }
  }

  /**
   * Validate an invite code
   */
  static async validateInviteCode(code: string): Promise<ValidateInviteResult> {
    try {
      const supabase = assertSupabase();
      
      const { data, error } = await supabase
        .rpc('validate_join_invite_code', { p_code: code });

      if (error) {
        logger.error('Validate invite code error:', error);
        return { valid: false, error: error.message };
      }

      if (!data.valid) {
        return { valid: false, error: data.error || 'Invalid invite code' };
      }

      return {
        valid: true,
        requestType: data.request_type,
        organizationName: data.organization_name,
        organizationId: data.organization_id,
        inviteToken: data.invite_token,
      };
    } catch (error) {
      logger.error('Validate invite code error:', error);
      return { valid: false, error: 'Failed to validate invite code' };
    }
  }

  /**
   * Accept an invitation using the invite token
   */
  static async acceptInvite(token: string): Promise<AcceptInviteResult> {
    try {
      const supabase = assertSupabase();
      
      const { data, error } = await supabase
        .rpc('accept_join_request', { p_invite_token: token });

      if (error) {
        logger.error('Accept invite error:', error);
        return { success: false, error: error.message };
      }

      if (!data.success) {
        return { success: false, error: data.error || 'Failed to accept invitation' };
      }

      track('invite.accepted', {
        type: data.request_type,
        organization_id: data.organization_id,
      });

      return {
        success: true,
        requestType: data.request_type,
        organizationId: data.organization_id,
      };
    } catch (error) {
      logger.error('Accept invite error:', error);
      return { success: false, error: 'Failed to accept invitation' };
    }
  }

  /**
   * Get pending join requests for an organization (for admins)
   */
  static async getPendingRequests(organizationId: string): Promise<{
    success: boolean;
    requests?: JoinRequest[];
    error?: string;
  }> {
    try {
      const supabase = assertSupabase();
      
      const { data, error } = await supabase
        .from('join_requests')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Get pending requests error:', error);
        return { success: false, error: error.message };
      }

      return { success: true, requests: data };
    } catch (error) {
      logger.error('Get pending requests error:', error);
      return { success: false, error: 'Failed to fetch pending requests' };
    }
  }

  /**
   * Get user's own join requests
   */
  static async getMyRequests(): Promise<{
    success: boolean;
    requests?: JoinRequest[];
    error?: string;
  }> {
    try {
      const supabase = assertSupabase();
      
      const { data, error } = await supabase
        .from('join_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Get my requests error:', error);
        return { success: false, error: error.message };
      }

      return { success: true, requests: data };
    } catch (error) {
      logger.error('Get my requests error:', error);
      return { success: false, error: 'Failed to fetch your requests' };
    }
  }

  /**
   * Approve a join request (for admins)
   */
  static async approveRequest(requestId: string, notes?: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const supabase = assertSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        return { success: false, error: 'Not authenticated' };
      }

      const { error } = await supabase
        .from('join_requests')
        .update({
          status: 'approved',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          review_notes: notes,
        })
        .eq('id', requestId)
        .eq('status', 'pending');

      if (error) {
        logger.error('Approve request error:', error);
        return { success: false, error: error.message };
      }

      track('join_request.approved', { request_id: requestId });

      return { success: true };
    } catch (error) {
      logger.error('Approve request error:', error);
      return { success: false, error: 'Failed to approve request' };
    }
  }

  /**
   * Reject a join request (for admins)
   */
  static async rejectRequest(requestId: string, notes?: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const supabase = assertSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        return { success: false, error: 'Not authenticated' };
      }

      const { error } = await supabase
        .from('join_requests')
        .update({
          status: 'rejected',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          review_notes: notes,
        })
        .eq('id', requestId)
        .eq('status', 'pending');

      if (error) {
        logger.error('Reject request error:', error);
        return { success: false, error: error.message };
      }

      track('join_request.rejected', { request_id: requestId });

      return { success: true };
    } catch (error) {
      logger.error('Reject request error:', error);
      return { success: false, error: 'Failed to reject request' };
    }
  }

  /**
   * Cancel own pending request
   */
  static async cancelRequest(requestId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const supabase = assertSupabase();
      
      const { error } = await supabase
        .from('join_requests')
        .update({ status: 'cancelled' })
        .eq('id', requestId)
        .eq('status', 'pending');

      if (error) {
        logger.error('Cancel request error:', error);
        return { success: false, error: error.message };
      }

      track('join_request.cancelled', { request_id: requestId });

      return { success: true };
    } catch (error) {
      logger.error('Cancel request error:', error);
      return { success: false, error: 'Failed to cancel request' };
    }
  }

  /**
   * Revoke an invite (for admins)
   */
  static async revokeInvite(requestId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const supabase = assertSupabase();
      
      const { error } = await supabase
        .from('join_requests')
        .update({ status: 'revoked' })
        .eq('id', requestId)
        .eq('status', 'pending');

      if (error) {
        logger.error('Revoke invite error:', error);
        return { success: false, error: error.message };
      }

      track('invite.revoked', { request_id: requestId });

      return { success: true };
    } catch (error) {
      logger.error('Revoke invite error:', error);
      return { success: false, error: 'Failed to revoke invitation' };
    }
  }

  /**
   * Share invite link via system share dialog
   */
  static async shareInviteLink(
    inviteCode: string,
    inviteToken: string,
    organizationName: string
  ): Promise<void> {
    const inviteLink = this.generateInviteLink(inviteCode, inviteToken);
    const message = `You've been invited to join ${organizationName} on EduDash Pro!\n\nUse invite code: ${inviteCode}\n\nOr click this link: ${inviteLink}`;

    try {
      await Share.share({
        message,
        url: Platform.OS === 'ios' ? inviteLink : undefined,
        title: `Join ${organizationName} on EduDash Pro`,
      });

      track('invite.shared', { method: 'system_share' });
    } catch (error) {
      logger.error('Share invite error:', error);
    }
  }

  /**
   * Open invite link in browser
   */
  static async openInviteLink(inviteCode: string, inviteToken: string): Promise<void> {
    const inviteLink = this.generateInviteLink(inviteCode, inviteToken);
    
    try {
      const canOpen = await Linking.canOpenURL(inviteLink);
      if (canOpen) {
        await Linking.openURL(inviteLink);
      }
    } catch (error) {
      logger.error('Open invite link error:', error);
    }
  }

  /**
   * Generate deep link for invitation
   */
  private static generateInviteLink(code: string | null, token: string | null): string {
    // Get the app scheme and web URL
    const scheme = Constants.expoConfig?.scheme || 'edudashpro';
    const webUrl = getSoaWebBaseUrl();
    
    // For web, use the web URL
    if (Platform.OS === 'web') {
      return `${webUrl}/invite?code=${code}&token=${token}`;
    }
    
    // For mobile, use deep link that can be handled by expo-linking
    // This will open the app if installed, or redirect to web/store
    return `${scheme}://invite?code=${code}&token=${token}`;
  }

  /**
   * Get default role for request type
   */
  private static getDefaultRole(type: JoinRequestType): string {
    switch (type) {
      case 'teacher_invite':
        return 'teacher';
      case 'parent_join':
      case 'guardian_claim':
        return 'parent';
      case 'member_join':
        return 'member';
      case 'staff_invite':
        return 'admin';
      case 'learner_enroll':
        return 'student';
      default:
        return 'parent';
    }
  }
}

export default InviteService;
