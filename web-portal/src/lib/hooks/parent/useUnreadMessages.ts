'use client';

/**
 * Hook to get and track unread message count for a parent user.
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

export function useUnreadMessages(
  userId: string | undefined,
  childId: string | null
): UnreadMessagesReturn {
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabaseRef = useRef(createClient());

  const loadUnreadCount = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      setUnreadCount(0);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const supabase = supabaseRef.current;

      // Get all threads the user is a participant in
      const { data: threads, error: threadsError } = await supabase
        .from('message_threads')
        .select('id, message_participants!inner(user_id, role, last_read_at)');

      if (threadsError) {
        console.error('Error fetching threads:', threadsError);
        setUnreadCount(0);
        return;
      }

      if (!threads || threads.length === 0) {
        setUnreadCount(0);
        return;
      }

      // Filter to threads where user is a participant (no role filter for parents)
      const userThreadsData = extractUserThreadData(threads as MessageThread[], userId);
      if (userThreadsData.length === 0) {
        setUnreadCount(0);
        return;
      }

      // Get all messages from user's threads that they didn't send
      const threadIds = userThreadsData.map((t) => t.threadId);
      const { data: unreadMessages, error: countError } = await supabase
        .from('messages')
        .select('id, thread_id, created_at')
        .in('thread_id', threadIds)
        .neq('sender_id', userId);

      if (countError) {
        console.error('Error counting unread messages:', countError);
        setUnreadCount(0);
        return;
      }

      setUnreadCount(countUnreadMessages(unreadMessages, userThreadsData));
      
      // Update app badge with unread message count
      badgeManager.setUnreadMessages(countUnreadMessages(unreadMessages, userThreadsData));
    } catch (err) {
      console.error('Failed to load unread messages:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadUnreadCount(); }, [loadUnreadCount]);

  // Real-time subscription for new messages
  useEffect(() => {
    if (!userId) return;
    const supabase = supabaseRef.current;

    const channel = supabase
      .channel(`unread-messages-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload: RealtimePostgresChangesPayload<MessagePayload>) => {
          const newMessage = payload.new as MessagePayload;
          if (newMessage.sender_id !== userId) {
            const { data: participant } = await supabase
              .from('message_participants')
              .select('user_id')
              .eq('thread_id', newMessage.thread_id)
              .eq('user_id', userId)
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
  }, [userId, loadUnreadCount]);

  return { unreadCount, loading, error, refetch: loadUnreadCount };
}
