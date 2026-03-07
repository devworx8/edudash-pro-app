'use client';

/**
 * Hook to get and track unread message count for a teacher user.
 * Subscribes to real-time updates to show new message indicators immediately.
 * Also updates the PWA app badge with the unread count.
 * Types extracted to shared/unreadMessagesTypes.ts
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import {
  type UnreadMessagesReturn,
  type MessageThread,
  type MessagePayload,
  extractUserThreadData,
  countUnreadMessages,
} from '@/lib/hooks/shared';
import { badgeManager } from '@/lib/utils/notification-badge';

export function useTeacherUnreadMessages(
  userId: string | undefined,
  preschoolId: string | undefined
): UnreadMessagesReturn {
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabaseRef = useRef(createClient());

  const loadUnreadCount = useCallback(async () => {
    if (!userId || !preschoolId) {
      setLoading(false);
      setUnreadCount(0);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const supabase = supabaseRef.current;

      // Get all threads the teacher is a participant in within their preschool
      const { data: threads, error: threadsError } = await supabase
        .from('message_threads')
        .select('id, message_participants!inner(user_id, role, last_read_at)')
        .eq('preschool_id', preschoolId);

      if (threadsError) {
        setUnreadCount(0);
        return;
      }

      if (!threads || threads.length === 0) {
        setUnreadCount(0);
        return;
      }

      // Filter to threads where user is a teacher participant
      const teacherThreadsData = extractUserThreadData(threads as MessageThread[], userId, 'teacher');
      if (teacherThreadsData.length === 0) {
        setUnreadCount(0);
        return;
      }

      // Get all messages from teacher's threads that they didn't send
      const threadIds = teacherThreadsData.map((t) => t.threadId);
      const { data: unreadMessages, error: countError } = await supabase
        .from('messages')
        .select('id, thread_id, created_at')
        .in('thread_id', threadIds)
        .neq('sender_id', userId);

      if (countError) {
        setUnreadCount(0);
        return;
      }

      setUnreadCount(countUnreadMessages(unreadMessages, teacherThreadsData));
      
      // Update app badge with unread message count
      badgeManager.setUnreadMessages(countUnreadMessages(unreadMessages, teacherThreadsData));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, [userId, preschoolId]);

  useEffect(() => { loadUnreadCount(); }, [loadUnreadCount]);

  // Real-time subscription for new messages
  useEffect(() => {
    if (!userId || !preschoolId) return;
    const supabase = supabaseRef.current;

    const channel = supabase
      .channel(`teacher-unread-messages-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload: RealtimePostgresChangesPayload<MessagePayload>) => {
          const newMessage = payload.new as MessagePayload;
          if (newMessage.sender_id !== userId) {
            const { data: participant } = await supabase
              .from('message_participants')
              .select('user_id, role')
              .eq('thread_id', newMessage.thread_id)
              .eq('user_id', userId)
              .eq('role', 'teacher')
              .maybeSingle();
            if (participant) loadUnreadCount();
          }
        }
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'message_participants', filter: `user_id=eq.${userId}` },
        () => loadUnreadCount()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, preschoolId, loadUnreadCount]);

  return { unreadCount, loading, error, refetch: loadUnreadCount };
}
