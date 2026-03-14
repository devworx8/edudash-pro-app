/**
 * useNotificationsQuery Hook
 * 
 * Fetches and manages notification data from multiple sources:
 * - In-app notifications table
 * - Push notifications table
 * - General notifications table
 * - Announcements (unread)
 * - Unread messages
 * - Missed calls
 */

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { assertSupabase } from '@/lib/supabase';
import { 
  getReadNotificationIds, 
  getClearedNotificationIds, 
  getClearedBeforeDate,
  isNotificationCleared,
} from './useNotificationStorage';
import { Notification, NotificationType } from '@/components/notifications/types';

interface AnnouncementRow {
  id: string;
  title: string | null;
  content: string | null;
  priority: string | null;
  published_at: string | null;
  created_at: string;
  author_id: string | null;
  target_audience?: string | string[] | null;
}

interface AuthorProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

/**
 * Map push notification type to display type
 */
function mapNotificationType(notifType: string): NotificationType {
  const typeMap: Record<string, NotificationType> = {
    // Messages
    'new_message': 'message',
    'message': 'message',
    // Calls
    'incoming_call': 'call',
    'missed_call': 'call',
    // Announcements
    'new_announcement': 'announcement',
    'announcement': 'announcement',
    // Homework & Lessons
    'homework_graded': 'homework',
    'assignment_due_soon': 'homework',
    'lesson_assigned': 'homework',
    'homework': 'homework',
    // Progress & Grades
    'progress_update': 'grade',
    'report_approved': 'grade',
    'report_rejected': 'grade',
    'report_submitted_for_review': 'grade',
    'grade': 'grade',
    // Attendance
    'attendance_recorded': 'attendance',
    'attendance_absent': 'attendance',
    'attendance_late': 'attendance',
    // Registration
    'child_registration_submitted': 'registration',
    'child_registration_approved': 'registration',
    'child_registration_rejected': 'registration',
    'parent_invite': 'registration',
    'parent_linked': 'registration',
    // Billing & Payments
    'subscription_created': 'billing',
    'payment_success': 'billing',
    'payment_required': 'billing',
    'payment_confirmed': 'billing',
    'payment_receipt': 'billing',
    'payment_approved': 'billing',
    'payment_rejected': 'billing',
    'payment_submitted': 'billing',
    'payment_status': 'billing',
    'pop_approved': 'billing',
    'pop_rejected': 'billing',
    'pop_submitted': 'billing',
    'trial_started': 'billing',
    'trial_ending': 'billing',
    'trial_ended': 'billing',
    'new_invoice': 'billing',
    'invoice_sent': 'billing',
    'overdue_reminder': 'billing',
    'fee_due_soon': 'billing',
    'payment': 'billing',
    // Calendar & Events
    'school_event_created': 'calendar',
    'school_event_updated': 'calendar',
    'school_event_cancelled': 'calendar',
    'school_event_reminder': 'calendar',
    // Birthdays
    'birthday_reminder_week': 'birthday',
    'birthday_reminder_5_days': 'birthday',
    'birthday_reminder_tomorrow': 'birthday',
    'birthday_reminder_teacher': 'birthday',
    'birthday_today': 'birthday',
    'birthday_today_teacher': 'birthday',
    'birthday_classmates_notification': 'birthday',
    'birthday_donation_reminder': 'birthday',
    'birthday_donation_paid': 'birthday',
  };
  return typeMap[notifType] || 'system';
}

function normalizeAudience(value?: string | string[] | null): string[] {
  if (!value) return ['all'];
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).toLowerCase());
  }
  return [String(value).toLowerCase()];
}

function resolveRoleAudiences(role?: string | null): string[] {
  if (!role) return ['all'];
  const normalized = role.toLowerCase();
  if (['admin', 'superadmin'].includes(normalized)) {
    return ['all', 'principals', 'teachers', 'parents', 'students', 'staff'];
  }
  if (normalized === 'principal') {
    return ['all', 'principals', 'teachers', 'staff'];
  }
  if (normalized === 'teacher') {
    return ['all', 'teachers', 'staff'];
  }
  if (normalized === 'staff') {
    return ['all', 'staff'];
  }
  if (normalized === 'parent') {
    return ['all', 'parents'];
  }
  if (normalized === 'student') {
    return ['all', 'students'];
  }
  return ['all', normalized];
}

function shouldIncludeAnnouncement(
  announcement: AnnouncementRow,
  userId: string,
  userRole?: string | null
): boolean {
  if (announcement.author_id && announcement.author_id === userId) return false;
  const audiences = normalizeAudience(announcement.target_audience);
  if (audiences.includes('all')) return true;
  if (!userRole) return true;
  const allowed = resolveRoleAudiences(userRole);
  return audiences.some((audience) => allowed.includes(audience));
}

/**
 * Fetch notifications from all sources
 */
async function fetchNotifications(
  userId: string,
  userPreschoolId?: string | null,
  userRole?: string | null
): Promise<Notification[]> {
  const client = assertSupabase();
  
  // Get read and cleared notification data
  const readIds = await getReadNotificationIds(userId);
  const clearedIds = await getClearedNotificationIds(userId);
  const clearedBeforeDate = await getClearedBeforeDate(userId);
  
  const notifications: Notification[] = [];
  
  // 1. Fetch from in_app_notifications table
  try {
    const { data: inAppNotifs, error: inAppError } = await client
      .from('in_app_notifications')
      .select('id, type, title, body, message, data, read, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30);
    
    if (!inAppError && inAppNotifs?.length) {
      inAppNotifs.forEach((n: any) => {
        const notifId = `in-app-${n.id}`;
        if (!isNotificationCleared(notifId, n.created_at, clearedIds, clearedBeforeDate)) {
          notifications.push({
            id: notifId,
            type: mapNotificationType(n.type) || 'system',
            title: n.title || 'Notification',
            body: n.body || n.message || '',
            data: n.data,
            read: n.read || readIds.has(notifId),
            created_at: n.created_at,
          });
        }
      });
    }
  } catch (e) {
    console.log('[useNotificationsQuery] in_app_notifications not available:', e);
  }
  
  // 2. Fetch from push_notifications table (received notifications)
  try {
    const { data: pushNotifs, error: pushError } = await client
      .from('push_notifications')
      .select('id, notification_type, title, body, data, created_at')
      .eq('recipient_user_id', userId)
      .in('status', ['sent', 'delivered'])
      .order('created_at', { ascending: false })
      .limit(30);
    
    if (!pushError && pushNotifs?.length) {
      pushNotifs.forEach((n: any) => {
        const notifId = `push-${n.id}`;
        // Skip call notifications (they're handled separately)
        if (n.notification_type === 'incoming_call') return;
        
        if (!isNotificationCleared(notifId, n.created_at, clearedIds, clearedBeforeDate)) {
          notifications.push({
            id: notifId,
            type: mapNotificationType(n.notification_type),
            title: n.title || 'Notification',
            body: n.body || '',
            data: n.data,
            read: readIds.has(notifId),
            created_at: n.created_at,
          });
        }
      });
    }
  } catch (e) {
    console.log('[useNotificationsQuery] push_notifications not available:', e);
  }
  
  // 3. Fetch from general notifications table
  try {
    const { data: generalNotifs, error: generalError } = await client
      .from('notifications')
      .select('id, type, title, message, metadata, is_read, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30);
    
    if (!generalError && generalNotifs?.length) {
      generalNotifs.forEach((n: any) => {
        const notifId = `notif-${n.id}`;
        // Skip messages (they're handled separately with threading)
        if (n.type === 'message') return;
        
        if (!isNotificationCleared(notifId, n.created_at, clearedIds, clearedBeforeDate)) {
          notifications.push({
            id: notifId,
            type: mapNotificationType(n.type),
            title: n.title || 'Notification',
            body: n.message || '',
            data: n.metadata,
            read: n.is_read || readIds.has(notifId),
            created_at: n.created_at,
          });
        }
      });
    }
  } catch (e) {
    console.log('[useNotificationsQuery] notifications table not available:', e);
  }
  
  // 4. Fetch unread announcements
  if (userPreschoolId) {
    try {
      // Get announcements and check which ones haven't been viewed
      const { data: announcements } = await client
        .from('announcements')
        .select(`
          id, title, content, priority, published_at, created_at, author_id, target_audience
        `)
        .eq('preschool_id', userPreschoolId)
        .eq('is_published', true)
        .order('published_at', { ascending: false })
        .limit(10);
      
      const announcementRows = (announcements || []) as AnnouncementRow[];
      if (announcementRows.length) {
        const authorIds = announcementRows
          .map((a) => a.author_id)
          .filter((id): id is string => Boolean(id));

        let authorMap = new Map<string, AuthorProfile>();
        if (authorIds.length) {
          const { data: authors } = await client
            .from('profiles')
            .select('id, first_name, last_name')
            .in('id', authorIds);

          authorMap = new Map(
            ((authors || []) as AuthorProfile[]).map((author) => [author.id, author])
          );
        }

        // Get viewed announcement IDs for this user
        const { data: viewedAnnouncements } = await client
          .from('announcement_views')
          .select('announcement_id')
          .eq('user_id', userId);
        
        const viewedIds = new Set((viewedAnnouncements || []).map((v: any) => v.announcement_id));
        
        announcementRows.forEach((a) => {
          if (!shouldIncludeAnnouncement(a, userId, userRole)) return;
          const notifId = `announce-${a.id}`;
          const isRead = viewedIds.has(a.id) || readIds.has(notifId);
          
          if (!isNotificationCleared(notifId, a.published_at || a.created_at, clearedIds, clearedBeforeDate)) {
            const author = a.author_id ? authorMap.get(a.author_id) : null;
            const authorName = author
              ? `${author.first_name || ''} ${author.last_name || ''}`.trim()
              : 'School';
            
            notifications.push({
              id: notifId,
              type: 'announcement',
              title: a.title || 'Announcement',
              body: a.content?.substring(0, 150) || '',
              data: { announcementId: a.id, priority: a.priority },
              read: isRead,
              created_at: a.published_at || a.created_at,
              sender_name: authorName,
            });
          }
        });
      }
    } catch (e) {
      console.log('[useNotificationsQuery] Error fetching announcements:', e);
    }
  }
  
  // 5. Fetch unread messages
  try {
    const { data: participants } = await client
      .from('message_participants')
      .select('thread_id, last_read_at')
      .eq('user_id', userId);
    
    if (participants?.length) {
      for (const participant of participants.slice(0, 15)) {
        const { data: unreadMessages } = await client
          .from('messages')
          .select('id, content, created_at, sender_id, sender:profiles!sender_id(first_name, last_name)')
          .eq('thread_id', participant.thread_id)
          .gt('created_at', participant.last_read_at || '1970-01-01')
          .neq('sender_id', userId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(1);
        
        if (unreadMessages?.length) {
          const msg = unreadMessages[0];
          const senderName = msg.sender 
            ? `${(msg.sender as any).first_name || ''} ${(msg.sender as any).last_name || ''}`.trim()
            : 'Someone';
          const notifId = `msg-${participant.thread_id}`;
          
          if (!isNotificationCleared(notifId, msg.created_at, clearedIds, clearedBeforeDate)) {
            notifications.push({
              id: notifId,
              type: 'message',
              title: `New message from ${senderName}`,
              body: msg.content?.substring(0, 100) || 'New message',
              data: { threadId: participant.thread_id },
              read: readIds.has(notifId),
              created_at: msg.created_at,
              sender_name: senderName,
            });
          }
        }
      }
    }
  } catch (e) {
    console.log('[useNotificationsQuery] Error fetching messages:', e);
  }
  
  // 6. Fetch missed calls
  try {
    // Note: active_calls table doesn't have foreign keys to profiles,
    // so we fetch calls first, then separately fetch caller profiles
    const { data: calls } = await client
      .from('active_calls')
      .select('call_id, caller_id, call_type, status, started_at, caller_name')
      .eq('callee_id', userId)
      .or('status.eq.missed,and(status.eq.ended,duration_seconds.is.null),and(status.eq.ended,duration_seconds.eq.0)')
      .order('started_at', { ascending: false })
      .limit(10);
    
    if (calls?.length) {
      // Fetch caller profiles separately
      const callerIds = [...new Set(calls.map((c: any) => c.caller_id))];
      const { data: callerProfiles } = await client
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', callerIds);
      
      const profileMap = new Map(
        (callerProfiles || []).map((p: any) => [
          p.id,
          `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown'
        ])
      );
      
      calls.forEach((call: any) => {
        // Use caller_name from call record if available, otherwise look up profile
        const callerName = call.caller_name || profileMap.get(call.caller_id) || 'Unknown';
        const notifId = `call-${call.call_id}`;
        
        if (!isNotificationCleared(notifId, call.started_at, clearedIds, clearedBeforeDate)) {
          notifications.push({
            id: notifId,
            type: 'call',
            title: `Missed ${call.call_type || 'voice'} call`,
            body: `You missed a ${call.call_type || 'voice'} call from ${callerName}`,
            data: { callerId: call.caller_id, callType: call.call_type },
            read: readIds.has(notifId),
            created_at: call.started_at,
            sender_name: callerName,
          });
        }
      });
    }
  } catch (e) {
    console.log('[useNotificationsQuery] Error fetching calls:', e);
  }
  
  // Deduplicate notifications by checking for similar content within short time windows
  const deduped = deduplicateNotifications(notifications);
  
  // Sort by date (newest first)
  deduped.sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  
  return deduped;
}

/**
 * Deduplicate notifications that may appear in multiple sources
 */
function deduplicateNotifications(notifications: Notification[]): Notification[] {
  const seen = new Map<string, Notification>();
  
  for (const notif of notifications) {
    // Dedup by title+body content within a 10-minute window, ignoring type so that
    // the same notification arriving from multiple source tables (in_app_notifications,
    // push_notifications, notifications) is collapsed into one entry.
    const timeWindow = Math.floor(new Date(notif.created_at).getTime() / (10 * 60 * 1000));
    const titleKey = notif.title.trim().substring(0, 40).toLowerCase();
    const bodyKey = notif.body.trim().substring(0, 40).toLowerCase();
    const key = `${titleKey}|${bodyKey}|${timeWindow}`;

    if (!seen.has(key)) {
      seen.set(key, notif);
    }
  }
  
  return Array.from(seen.values());
}

/**
 * Hook to fetch all notifications for the current user
 */
export const useNotificationsQuery = () => {
  const { user, profile } = useAuth();
  
  return useQuery({
    queryKey: ['notifications', user?.id, profile?.preschool_id || profile?.organization_id, profile?.role],
    queryFn: () => fetchNotifications(
      user!.id,
      profile?.preschool_id || profile?.organization_id,
      profile?.role
    ),
    enabled: !!user?.id,
    staleTime: 1000 * 30, // 30 seconds
  });
};

export default useNotificationsQuery;
