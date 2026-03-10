/**
 * Enhanced Teacher Approval Service
 * 
 * Improvements:
 * - Optimistic locking for concurrent approval handling
 * - Batch operations for bulk approvals
 * - Real-time status subscriptions
 * - Audit trail with detailed logging
 * - Retryable operations with exponential backoff
 */

import { assertSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

// ============================================
// Types
// ============================================

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

export interface PendingTeacher {
  id: string;
  user_id: string;
  preschool_id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  invite_id?: string;
  invite_accepted_at?: string;
  status: ApprovalStatus;
  requested_at: string;
  notes?: string;
  profile?: {
    id: string;
    full_name?: string;
    avatar_url?: string;
    bio?: string;
    qualifications?: string[];
  };
  school_name?: string;
  version?: number; // For optimistic locking
}

export interface ApprovalResult {
  success: boolean;
  message: string;
  teacher_id?: string;
  seat_assigned?: boolean;
  error?: string;
  error_code?: ApprovalErrorCode;
}

export interface BatchApprovalResult {
  successful: string[];
  failed: { teacherId: string; error: string }[];
  total: number;
}

export interface TeacherApprovalStats {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
}

export type ApprovalErrorCode = 
  | 'TEACHER_NOT_FOUND'
  | 'ALREADY_APPROVED'
  | 'ALREADY_REJECTED'
  | 'SEAT_LIMIT_REACHED'
  | 'PERMISSION_DENIED'
  | 'CONCURRENT_MODIFICATION'
  | 'UNKNOWN_ERROR';

// ============================================
// Error Class
// ============================================

export class ApprovalError extends Error {
  constructor(
    message: string,
    public code: ApprovalErrorCode,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApprovalError';
  }
}

// ============================================
// Constants
// ============================================

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;
const BATCH_SIZE = 10;

// ============================================
// Utility Functions
// ============================================

async function withRetry<T>(
  operation: () => Promise<T>,
  retries = MAX_RETRIES,
  delay = RETRY_DELAY_MS
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      if (attempt < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt)));
      }
    }
  }
  
  throw lastError;
}

// ============================================
// Service Class
// ============================================

export class TeacherApprovalService {
  /**
   * Get pending teachers with optimized single query
   */
  static async getPendingTeachers(preschoolId: string): Promise<PendingTeacher[]> {
    const supabase = assertSupabase();

    // Single query with joins to get all data
    const { data: approvals, error } = await supabase
      .from('teacher_approvals')
      .select(`
        id,
        teacher_id,
        preschool_id,
        status,
        requested_at,
        notes,
        invite_id,
        version,
        profiles:teacher_id (
          id,
          email,
          first_name,
          last_name,
          phone,
          full_name,
          avatar_url
        ),
        preschools:preschool_id (
          name
        )
      `)
      .eq('preschool_id', preschoolId)
      .eq('status', 'pending')
      .order('requested_at', { ascending: false });

    if (error) {
      logger.error('TeacherApprovalService', 'Failed to fetch pending teachers', { error });
      throw new ApprovalError('Failed to fetch pending teachers', 'UNKNOWN_ERROR', { originalError: error.message });
    }

    return (approvals || []).map(approval => {
      const profile = Array.isArray(approval.profiles) ? approval.profiles[0] : approval.profiles;
      const preschool = Array.isArray(approval.preschools) ? approval.preschools[0] : approval.preschools;

      return {
        id: approval.id,
        user_id: approval.teacher_id,
        preschool_id: approval.preschool_id,
        email: profile?.email || '',
        first_name: profile?.first_name || '',
        last_name: profile?.last_name || '',
        phone: profile?.phone,
        invite_id: approval.invite_id,
        status: approval.status,
        requested_at: approval.requested_at,
        notes: approval.notes,
        version: approval.version,
        school_name: preschool?.name,
        profile: {
          id: profile?.id,
          full_name: profile?.full_name,
          avatar_url: profile?.avatar_url,
        },
      };
    }) as PendingTeacher[];
  }

  /**
   * Subscribe to real-time approval changes
   */
  static subscribeToApprovals(
    preschoolId: string,
    callback: (payload: { eventType: string; teacher: PendingTeacher }) => void
  ): () => void {
    const supabase = assertSupabase();
    
    const channel = supabase
      .channel(`teacher-approvals:${preschoolId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'teacher_approvals',
          filter: `preschool_id=eq.${preschoolId}`,
        },
        async (payload) => {
          const { eventType, new: record, old } = payload;
          
          // Fetch profile data for the record
          let teacher: PendingTeacher | null = null;
          
          if (record && 'teacher_id' in record) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('id, email, first_name, last_name, full_name, avatar_url')
              .eq('id', record.teacher_id)
              .maybeSingle();

            teacher = {
              id: record.id,
              user_id: record.teacher_id,
              preschool_id: record.preschool_id,
              email: profile?.email || '',
              first_name: profile?.first_name || '',
              last_name: profile?.last_name || '',
              status: record.status,
              requested_at: record.requested_at,
              notes: record.notes,
              version: record.version,
              profile: {
                id: profile?.id,
                full_name: profile?.full_name,
                avatar_url: profile?.avatar_url,
              },
            };
          }

          if (teacher) {
            callback({ eventType, teacher });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  /**
   * Approve a teacher with optimistic locking
   */
  static async approveTeacher(
    teacherId: string,
    preschoolId: string,
    reviewerId: string,
    options?: {
      assignSeat?: boolean;
      notes?: string;
      expectedVersion?: number;
    }
  ): Promise<ApprovalResult> {
    const supabase = assertSupabase();

    try {
      return await withRetry(async () => {
        // 1. Get current approval state
        const { data: approval, error: fetchError } = await supabase
          .from('teacher_approvals')
          .select('id, status, version')
          .eq('teacher_id', teacherId)
          .eq('preschool_id', preschoolId)
          .maybeSingle();

        if (fetchError) throw fetchError;

        // Check for concurrent modification
        if (options?.expectedVersion !== undefined && approval?.version !== options.expectedVersion) {
          throw new ApprovalError(
            'Approval was modified by another user',
            'CONCURRENT_MODIFICATION',
            { expectedVersion: options.expectedVersion, actualVersion: approval?.version }
          );
        }

        // Check if already processed
        if (approval?.status === 'approved') {
          throw new ApprovalError('Teacher is already approved', 'ALREADY_APPROVED');
        }
        if (approval?.status === 'rejected') {
          throw new ApprovalError('Teacher was already rejected', 'ALREADY_REJECTED');
        }

        // 2. Update or create approval record
        if (approval) {
          const updateData: Record<string, unknown> = {
            status: 'approved',
            reviewed_by: reviewerId,
            reviewed_at: new Date().toISOString(),
            seat_assigned: options?.assignSeat ?? true,
          };
          
          if (options?.notes) {
            updateData.notes = options.notes;
          }

          // Optimistic locking update
          const { error: updateError } = await supabase
            .from('teacher_approvals')
            .update(updateData)
            .eq('id', approval.id)
            .eq('status', 'pending'); // Ensure still pending

          if (updateError) {
            if (updateError.code === '23505') {
              throw new ApprovalError('Teacher is already approved', 'ALREADY_APPROVED');
            }
            throw updateError;
          }
        } else {
          // Create new approval record
          const { error: insertError } = await supabase
            .from('teacher_approvals')
            .insert({
              teacher_id: teacherId,
              preschool_id: preschoolId,
              status: 'approved',
              reviewed_by: reviewerId,
              reviewed_at: new Date().toISOString(),
              notes: options?.notes,
              seat_assigned: options?.assignSeat ?? true,
            });

          if (insertError) throw insertError;
        }

        // 3. Link profile to school via RPC
        const { error: profileError } = await supabase.rpc('link_profile_to_school', {
          p_target_profile_id: teacherId,
          p_school_id: preschoolId,
          p_role: 'teacher',
        });

        if (profileError) {
          logger.warn('TeacherApprovalService', 'Profile linkage RPC warning', { error: profileError });
        }

        // 4. Assign seat
        let seatAssigned = false;
        if (options?.assignSeat !== false) {
          const { error: memberError } = await supabase
            .from('organization_members')
            .upsert(
              {
                organization_id: preschoolId,
                user_id: teacherId,
                role: 'teacher',
                seat_status: 'active',
                invited_by: reviewerId,
              },
              { onConflict: 'organization_id,user_id' }
            );

          if (!memberError) {
            seatAssigned = true;
          }
        }

        // 5. Update invite status
        await supabase
          .from('teacher_invites')
          .update({ status: 'approved' })
          .eq('school_id', preschoolId)
          .eq('accepted_by', teacherId);

        // 6. Create employment history
        const { data: existingEmployment } = await supabase
          .from('teacher_employment_history')
          .select('id')
          .eq('teacher_user_id', teacherId)
          .eq('organization_id', preschoolId)
          .is('end_date', null)
          .maybeSingle();

        if (!existingEmployment) {
          await supabase.from('teacher_employment_history').insert({
            teacher_user_id: teacherId,
            organization_id: preschoolId,
            principal_id: reviewerId,
            status: 'active',
            start_date: new Date().toISOString().split('T')[0],
          });
        }

        // 7. Send notification
        await supabase.functions.invoke('notifications-dispatcher', {
          body: {
            event_type: 'teacher_account_approved',
            preschool_id: preschoolId,
            include_email: true,
            custom_payload: {
              teacher_user_id: teacherId,
            },
          },
        });

        logger.info('TeacherApprovalService', 'Teacher approved successfully', {
          teacherId,
          preschoolId,
          reviewerId,
          seatAssigned,
        });

        return {
          success: true,
          message: seatAssigned
            ? 'Teacher approved and seat assigned successfully'
            : 'Teacher approved (seat assignment pending)',
          teacher_id: teacherId,
          seat_assigned: seatAssigned,
        };
      });
    } catch (error) {
      if (error instanceof ApprovalError) {
        return {
          success: false,
          message: error.message,
          error: error.message,
          error_code: error.code,
        };
      }

      logger.error('TeacherApprovalService', 'Approval error', { error });
      return {
        success: false,
        message: 'Failed to approve teacher',
        error: (error as Error).message,
        error_code: 'UNKNOWN_ERROR',
      };
    }
  }

  /**
   * Reject a teacher application
   */
  static async rejectTeacher(
    teacherId: string,
    preschoolId: string,
    reviewerId: string,
    reason?: string,
    expectedVersion?: number
  ): Promise<ApprovalResult> {
    const supabase = assertSupabase();

    try {
      // Get current state
      const { data: approval } = await supabase
        .from('teacher_approvals')
        .select('id, status, version')
        .eq('teacher_id', teacherId)
        .eq('preschool_id', preschoolId)
        .maybeSingle();

      // Check for concurrent modification
      if (expectedVersion !== undefined && approval?.version !== expectedVersion) {
        throw new ApprovalError(
          'Approval was modified by another user',
          'CONCURRENT_MODIFICATION'
        );
      }

      if (approval?.status === 'rejected') {
        throw new ApprovalError('Teacher was already rejected', 'ALREADY_REJECTED');
      }

      if (approval?.status === 'approved') {
        throw new ApprovalError('Teacher was already approved', 'ALREADY_APPROVED');
      }

      // Update or create rejection
      if (approval) {
        await supabase
          .from('teacher_approvals')
          .update({
            status: 'rejected',
            reviewed_by: reviewerId,
            reviewed_at: new Date().toISOString(),
            rejection_reason: reason,
          })
          .eq('id', approval.id)
          .eq('status', 'pending');
      } else {
        await supabase.from('teacher_approvals').insert({
          teacher_id: teacherId,
          preschool_id: preschoolId,
          status: 'rejected',
          reviewed_by: reviewerId,
          reviewed_at: new Date().toISOString(),
          rejection_reason: reason,
        });
      }

      // Update invite
      await supabase
        .from('teacher_invites')
        .update({ status: 'rejected' })
        .eq('school_id', preschoolId)
        .eq('accepted_by', teacherId);

      // Cleanup memberships
      await supabase
        .from('organization_members')
        .update({ seat_status: 'revoked' })
        .eq('organization_id', preschoolId)
        .eq('user_id', teacherId);

      // Send notification
      await supabase.functions.invoke('notifications-dispatcher', {
        body: {
          event_type: 'teacher_account_rejected',
          preschool_id: preschoolId,
          include_email: true,
          custom_payload: {
            teacher_user_id: teacherId,
            rejection_reason: reason,
          },
        },
      });

      logger.info('TeacherApprovalService', 'Teacher rejected', { teacherId, preschoolId });

      return {
        success: true,
        message: 'Teacher application rejected',
        teacher_id: teacherId,
      };
    } catch (error) {
      if (error instanceof ApprovalError) {
        return {
          success: false,
          message: error.message,
          error: error.message,
          error_code: error.code,
        };
      }

      logger.error('TeacherApprovalService', 'Rejection error', { error });
      return {
        success: false,
        message: 'Failed to reject teacher',
        error: (error as Error).message,
        error_code: 'UNKNOWN_ERROR',
      };
    }
  }

  /**
   * Batch approve teachers
   */
  static async batchApprove(
    teachers: Array<{ teacherId: string; preschoolId: string }>,
    reviewerId: string
  ): Promise<BatchApprovalResult> {
    const results: BatchApprovalResult = {
      successful: [],
      failed: [],
      total: teachers.length,
    };

    // Process in batches
    for (let i = 0; i < teachers.length; i += BATCH_SIZE) {
      const batch = teachers.slice(i, i + BATCH_SIZE);
      
      await Promise.all(
        batch.map(async ({ teacherId, preschoolId }) => {
          const result = await this.approveTeacher(teacherId, preschoolId, reviewerId);
          
          if (result.success) {
            results.successful.push(teacherId);
          } else {
            results.failed.push({ teacherId, error: result.error || 'Unknown error' });
          }
        })
      );
    }

    return results;
  }

  /**
   * Get approval statistics
   */
  static async getStats(preschoolId: string): Promise<TeacherApprovalStats> {
    const supabase = assertSupabase();

    const { data, error } = await supabase
      .from('teacher_approvals')
      .select('status')
      .eq('preschool_id', preschoolId);

    if (error) {
      logger.error('TeacherApprovalService', 'Failed to fetch stats', { error });
      return { pending: 0, approved: 0, rejected: 0, total: 0 };
    }

    return {
      pending: data?.filter(d => d.status === 'pending').length || 0,
      approved: data?.filter(d => d.status === 'approved').length || 0,
      rejected: data?.filter(d => d.status === 'rejected').length || 0,
      total: data?.length || 0,
    };
  }

  /**
   * Withdraw an application (teacher-initiated)
   */
  static async withdrawApplication(
    teacherId: string,
    preschoolId: string
  ): Promise<ApprovalResult> {
    const supabase = assertSupabase();

    try {
      const { error } = await supabase
        .from('teacher_approvals')
        .update({ status: 'withdrawn' })
        .eq('teacher_id', teacherId)
        .eq('preschool_id', preschoolId)
        .eq('status', 'pending');

      if (error) throw error;

      return {
        success: true,
        message: 'Application withdrawn',
        teacher_id: teacherId,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to withdraw application',
        error: (error as Error).message,
        error_code: 'UNKNOWN_ERROR',
      };
    }
  }
}

// ============================================
// Legacy function exports for backward compatibility
// ============================================

export const getPendingTeachers = TeacherApprovalService.getPendingTeachers;
export const approveTeacher = TeacherApprovalService.approveTeacher;
export const rejectTeacher = TeacherApprovalService.rejectTeacher;
export const getApprovalStats = TeacherApprovalService.getStats;
