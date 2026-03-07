'use client';

/**
 * Parent Messaging Hooks
 * 
 * This file re-exports all messaging-related hooks and types for backward compatibility.
 * The implementation has been modularized into separate files:
 * - types/messagingTypes.ts - Type definitions
 * - useMessageThreads.ts - Thread fetching
 * - useMessageMutations.ts - Send/create operations
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

// Re-export types for backward compatibility
export type {
  MessageThread,
  MessageParticipant,
  Message,
  CreateThreadParams,
  SendMessageParams,
} from './types';

// Re-export hooks from modular files
export { useMessageThreads } from './useMessageThreads';
export { useSendMessage, useCreateThread } from './useMessageMutations';

// Alias for backward compatibility
export { useMessageThreads as useParentThreads } from './useMessageThreads';

// Import types for the useThreadMessages hook
import type { Message } from './types';

/**
 * Hook to get messages for a specific thread
 * Kept in main file for backward compatibility
 */
export const useThreadMessages = (threadId: string | undefined, userId: string | undefined) => {
  const queryClient = useQueryClient();
  
  return useQuery({
    queryKey: ['messages', threadId],
    queryFn: async (): Promise<Message[]> => {
      if (!threadId) throw new Error('Thread ID required');
      
      const client = createClient();
      
      const { data: messages, error } = await client
        .from('messages')
        .select(`
          *,
          sender:profiles(first_name, last_name, role)
        `)
        .eq('thread_id', threadId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      
      // Mark messages as read
      if (userId) {
        await client
          .from('message_participants')
          .update({ last_read_at: new Date().toISOString() })
          .eq('thread_id', threadId)
          .eq('user_id', userId);
        
        // Invalidate threads query to update unread counts
        queryClient.invalidateQueries({ queryKey: ['parent', 'threads'] });
      }
      
      return messages || [];
    },
    enabled: !!threadId && !!userId,
    staleTime: 1000 * 30, // 30 seconds
  });
};
