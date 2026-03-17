/**
 * Routine Sharing Service
 * 
 * Handles sharing of weekly programs/daily routines with:
 * - Teachers (for their classes)
 * - Parents (for their children's classes)
 * 
 * Features:
 * - Real-time notifications when routines are updated
 * - Version tracking for routine changes
 * - Granular permission controls
 * - Batch sharing for multiple classes
 */

import { assertSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

// ============================================
// Types
// ============================================

export interface RoutineShare {
  id: string;
  weekly_program_id: string;
  shared_by: string;
  shared_at: string;
  share_with: 'teachers' | 'parents' | 'both';
  class_ids: string[];
  message?: string;
  notify_recipients: boolean;
  status: 'active' | 'revoked';
}

export interface RoutineShareRecipient {
  user_id: string;
  class_id: string;
  role: 'teacher' | 'parent';
  notified_at?: string;
  viewed_at?: string;
}

export interface ShareRoutineParams {
  weeklyProgramId: string;
  sharedBy: string;
  shareWith: 'teachers' | 'parents' | 'both';
  classIds: string[];
  message?: string;
  notifyRecipients?: boolean;
}

export interface RoutineChangeNotification {
  id: string;
  weekly_program_id: string;
  change_type: 'created' | 'updated' | 'published' | 'unpublished';
  changed_by: string;
  changed_at: string;
  summary: string;
  recipient_count: number;
}

// ============================================
// Error Class
// ============================================

export class RoutineShareError extends Error {
  constructor(
    message: string,
    public code: 'NOT_FOUND' | 'PERMISSION_DENIED' | 'INVALID_CLASS' | 'NOT_PUBLISHED' | 'UNKNOWN',
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'RoutineShareError';
  }
}

// ============================================
// Service Class
// ============================================

export class RoutineSharingService {
  /**
   * Share a weekly program with teachers and/or parents
   */
  static async shareRoutine(params: ShareRoutineParams): Promise<RoutineShare> {
    const supabase = assertSupabase();
    const {
      weeklyProgramId,
      sharedBy,
      shareWith,
      classIds,
      message,
      notifyRecipients = true,
    } = params;

    // 1. Verify the weekly program exists and is published
    const { data: program, error: programError } = await supabase
      .from('weekly_programs')
      .select('id, status, title, preschool_id, class_id')
      .eq('id', weeklyProgramId)
      .maybeSingle();

    if (programError || !program) {
      throw new RoutineShareError('Weekly program not found', 'NOT_FOUND');
    }

    // 2. Validate class IDs
    const validClassIds = classIds.filter(Boolean);
    if (validClassIds.length === 0) {
      // If no classes specified, share with the program's class or all classes
      if (program.class_id) {
        validClassIds.push(program.class_id);
      } else {
        // School-wide program - get all classes
        const { data: classes } = await supabase
          .from('classes')
          .select('id')
          .eq('preschool_id', program.preschool_id);

        if (classes && classes.length > 0) {
          validClassIds.push(...classes.map(c => c.id));
        }
      }
    }

    // 3. Create share record
    const { data: share, error: shareError } = await supabase
      .from('routine_shares')
      .insert({
        weekly_program_id: weeklyProgramId,
        shared_by: sharedBy,
        share_with: shareWith,
        class_ids: validClassIds,
        message,
        notify_recipients: notifyRecipients,
        status: 'active',
      })
      .select()
      .single();

    if (shareError) {
      logger.error('RoutineSharingService', 'Failed to create share record', { error: shareError });
      throw new RoutineShareError('Failed to share routine', 'UNKNOWN', { originalError: shareError.message });
    }

    // 4. Create recipient records and collect user IDs
    const recipientEntries: Array<{
      routine_share_id: string;
      user_id: string;
      class_id: string;
      role: 'teacher' | 'parent';
    }> = [];

    // Get teachers for the classes
    if (shareWith === 'teachers' || shareWith === 'both') {
      const { data: classTeachers } = await supabase
        .from('teachers')
        .select('user_id, class_id')
        .in('class_id', validClassIds)
        .eq('is_active', true);

      if (classTeachers) {
        for (const teacher of classTeachers) {
          if (teacher.user_id) {
            recipientEntries.push({
              routine_share_id: share.id,
              user_id: teacher.user_id,
              class_id: teacher.class_id,
              role: 'teacher',
            });
          }
        }
      }
    }

    // Get parents for the classes
    if (shareWith === 'parents' || shareWith === 'both') {
      const { data: students } = await supabase
        .from('students')
        .select('id, class_id, parent_id')
        .in('class_id', validClassIds)
        .eq('is_active', true);

      if (students) {
        const parentMap = new Map<string, { userId: string; classId: string }>();
        for (const student of students) {
          if (student.parent_id && !parentMap.has(student.parent_id)) {
            parentMap.set(student.parent_id, {
              userId: student.parent_id,
              classId: student.class_id,
            });
          }
        }

        for (const [, { userId, classId }] of parentMap) {
          recipientEntries.push({
            routine_share_id: share.id,
            user_id: userId,
            class_id: classId,
            role: 'parent',
          });
        }
      }
    }

    // 5. Insert recipient records
    if (recipientEntries.length > 0) {
      const { error: recipientError } = await supabase
        .from('routine_share_recipients')
        .insert(recipientEntries);

      if (recipientError) {
        logger.warn('RoutineSharingService', 'Failed to create some recipient records', { error: recipientError });
      }
    }

    // 6. Send notifications
    if (notifyRecipients && recipientEntries.length > 0) {
      await this.sendShareNotifications(share.id, program.title || 'Weekly Program', recipientEntries.length);
    }

    logger.info('RoutineSharingService', 'Routine shared successfully', {
      shareId: share.id,
      recipientCount: recipientEntries.length,
    });

    return share as RoutineShare;
  }

  /**
   * Send notifications to recipients
   */
  private static async sendShareNotifications(
    shareId: string,
    programTitle: string,
    recipientCount: number
  ): Promise<void> {
    const supabase = assertSupabase();

    try {
      await supabase.functions.invoke('notifications-dispatcher', {
        body: {
          event_type: 'routine_shared',
          routine_share_id: shareId,
          include_email: true,
          send_immediately: true,
          custom_payload: {
            program_title: programTitle,
            recipient_count: recipientCount,
          },
        },
      });
    } catch (error) {
      logger.warn('RoutineSharingService', 'Failed to send notifications', { error });
    }
  }

  /**
   * Get routines shared with a teacher
   */
  static async getSharedRoutinesForTeacher(teacherId: string): Promise<RoutineShare[]> {
    const supabase = assertSupabase();

    // Get teacher's classes
    const { data: teacherClasses } = await supabase
      .from('teachers')
      .select('class_id')
      .eq('user_id', teacherId)
      .eq('is_active', true);

    const classIds = (teacherClasses || []).map(t => t.class_id).filter(Boolean);
    if (classIds.length === 0) return [];

    // Get active shares for these classes
    const { data: shares, error } = await supabase
      .from('routine_shares')
      .select(`
        *,
        weekly_programs:weekly_program_id (
          id,
          title,
          summary,
          week_start_date,
          week_end_date,
          status
        ),
        profiles:shared_by (full_name)
      `)
      .contains('class_ids', classIds)
      .eq('status', 'active')
      .in('share_with', ['teachers', 'both'])
      .order('shared_at', { ascending: false });

    if (error) {
      logger.error('RoutineSharingService', 'Failed to fetch shared routines', { error });
      return [];
    }

    return (shares || []) as RoutineShare[];
  }

  /**
   * Get routines shared with a parent
   */
  static async getSharedRoutinesForParent(parentId: string): Promise<RoutineShare[]> {
    const supabase = assertSupabase();

    // Get parent's children and their classes
    const { data: children } = await supabase
      .from('students')
      .select('class_id')
      .eq('parent_id', parentId)
      .eq('is_active', true);

    const classIds = (children || []).map(c => c.class_id).filter(Boolean);
    if (classIds.length === 0) return [];

    // Get active shares for these classes
    const { data: shares, error } = await supabase
      .from('routine_shares')
      .select(`
        *,
        weekly_programs:weekly_program_id (
          id,
          title,
          summary,
          week_start_date,
          week_end_date,
          status
        ),
        profiles:shared_by (full_name)
      `)
      .contains('class_ids', classIds)
      .eq('status', 'active')
      .in('share_with', ['parents', 'both'])
      .order('shared_at', { ascending: false });

    if (error) {
      logger.error('RoutineSharingService', 'Failed to fetch shared routines for parent', { error });
      return [];
    }

    return (shares || []) as RoutineShare[];
  }

  /**
   * Mark a shared routine as viewed
   */
  static async markAsViewed(shareId: string, userId: string): Promise<void> {
    const supabase = assertSupabase();

    await supabase
      .from('routine_share_recipients')
      .update({ viewed_at: new Date().toISOString() })
      .eq('routine_share_id', shareId)
      .eq('user_id', userId);
  }

  /**
   * Revoke a routine share
   */
  static async revokeShare(shareId: string): Promise<void> {
    const supabase = assertSupabase();

    const { error } = await supabase
      .from('routine_shares')
      .update({ status: 'revoked' })
      .eq('id', shareId);

    if (error) {
      throw new RoutineShareError('Failed to revoke share', 'UNKNOWN', { originalError: error.message });
    }
  }

  /**
   * Notify recipients of routine changes
   */
  static async notifyRoutineChange(
    weeklyProgramId: string,
    changeType: 'created' | 'updated' | 'published' | 'unpublished',
    changedBy: string,
    summary: string
  ): Promise<void> {
    const supabase = assertSupabase();

    // Get active shares for this program
    const { data: shares } = await supabase
      .from('routine_shares')
      .select('id, class_ids, share_with')
      .eq('weekly_program_id', weeklyProgramId)
      .eq('status', 'active');

    if (!shares || shares.length === 0) return;

    // Create change notification
    const { data: notification } = await supabase
      .from('routine_change_notifications')
      .insert({
        weekly_program_id: weeklyProgramId,
        change_type: changeType,
        changed_by: changedBy,
        summary,
        recipient_count: shares.reduce((sum, s) => sum + (s.class_ids?.length || 0), 0),
      })
      .select()
      .maybeSingle();

    if (notification) {
      // Send real-time notifications
      await supabase.functions.invoke('notifications-dispatcher', {
        body: {
          event_type: 'routine_changed',
          routine_change_notification_id: notification.id,
          include_email: changeType === 'published',
          send_immediately: true,
          custom_payload: {
            change_type: changeType,
            summary,
            weekly_program_id: weeklyProgramId,
          },
        },
      });
    }
  }

  /**
   * Subscribe to routine share changes
   */
  static subscribeToRoutineShares(
    userId: string,
    callback: (payload: { eventType: string; share: RoutineShare }) => void
  ): () => void {
    const supabase = assertSupabase();

    const channel = supabase
      .channel(`routine-shares:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'routine_share_recipients',
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          const { eventType, new: record } = payload;

          if (record && 'routine_share_id' in record) {
            const { data: share } = await supabase
              .from('routine_shares')
              .select(`
                *,
                weekly_programs:weekly_program_id (
                  id,
                  title,
                  summary,
                  week_start_date,
                  week_end_date
                )
              `)
              .eq('id', record.routine_share_id)
              .maybeSingle();

            if (share) {
              callback({ eventType, share: share as RoutineShare });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  /**
   * Get share statistics for a weekly program
   */
  static async getShareStats(weeklyProgramId: string): Promise<{
    teacherCount: number;
    parentCount: number;
    viewedCount: number;
    lastSharedAt?: string;
  }> {
    const supabase = assertSupabase();

    const { data: recipients, error } = await supabase
      .from('routine_share_recipients')
      .select('role, viewed_at')
      .eq('routine_share_id', weeklyProgramId);

    if (error) {
      return { teacherCount: 0, parentCount: 0, viewedCount: 0 };
    }

    return {
      teacherCount: (recipients || []).filter(r => r.role === 'teacher').length,
      parentCount: (recipients || []).filter(r => r.role === 'parent').length,
      viewedCount: (recipients || []).filter(r => r.viewed_at).length,
    };
  }
}

// ============================================
// Legacy exports
// ============================================

export const shareRoutine = RoutineSharingService.shareRoutine;
export const getSharedRoutinesForTeacher = RoutineSharingService.getSharedRoutinesForTeacher;
export const getSharedRoutinesForParent = RoutineSharingService.getSharedRoutinesForParent;