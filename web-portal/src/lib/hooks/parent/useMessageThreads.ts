'use client';

/**
 * Hook for fetching parent message threads
 * Extracted from useParentMessaging.ts for single responsibility
 */

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { MessageThread } from './types';

/**
 * Hook to get parent's message threads with last message and unread count
 */
export const useMessageThreads = (userId: string | undefined) => {
  return useQuery({
    queryKey: ['parent', 'threads', userId],
    queryFn: async (): Promise<MessageThread[]> => {
      if (!userId) throw new Error('User not authenticated');
      
      const client = createClient();
      
      // Get threads with participants, student info, and last message
      const { data: threads, error } = await client
        .from('message_threads')
        .select(`
          *,
          student:students(id, first_name, last_name),
          message_participants(
            *,
            profiles(first_name, last_name, role)
          )
        `)
        .order('last_message_at', { ascending: false });
      
      if (error) throw error;
      
      // Get last message and unread count for each thread
      const threadsWithDetails = await Promise.all(
        (threads || []).map(async (thread: any) => {
          // Get last message
          const { data: lastMessage } = await client
            .from('messages')
            .select(`
              content,
              created_at,
              sender:profiles(first_name, last_name)
            `)
            .eq('thread_id', thread.id)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          // Get unread count (messages after user's last_read_at)
          const userParticipant = thread.message_participants?.find(
            (p: any) => p.user_id === userId
          );
          let unreadCount = 0;
          
          if (userParticipant) {
            const { count } = await client
              .from('messages')
              .select('id', { count: 'exact', head: true })
              .eq('thread_id', thread.id)
              .gt('created_at', userParticipant.last_read_at)
              .neq('sender_id', userId)
              .is('deleted_at', null);
            
            unreadCount = count || 0;
          }
          
          return {
            ...thread,
            last_message: lastMessage ? {
              content: lastMessage.content,
              sender_name: (() => {
                const s: any = lastMessage?.sender;
                const sender = Array.isArray(s) ? s[0] : s;
                return sender ? `${sender.first_name} ${sender.last_name}`.trim() : 'Unknown';
              })(),
              created_at: lastMessage.created_at
            } : undefined,
            unread_count: unreadCount
          };
        })
      );
      
      return threadsWithDetails;
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
};
