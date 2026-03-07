'use client';

/**
 * Hook for message mutations (send, create thread)
 * Extracted from useParentMessaging.ts for single responsibility
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { CreateThreadParams, SendMessageParams } from './types';

/**
 * Hook to send a message to an existing thread
 */
export const useSendMessage = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ threadId, content, userId }: SendMessageParams) => {
      const client = createClient();
      
      // Insert message
      const { data: message, error } = await client
        .from('messages')
        .insert({
          thread_id: threadId,
          sender_id: userId,
          content,
          content_type: 'text'
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Update thread last_message_at
      await client
        .from('message_threads')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', threadId);
      
      return message;
    },
    onSuccess: (_: unknown, variables: SendMessageParams) => {
      // Invalidate both threads and messages queries
      queryClient.invalidateQueries({ queryKey: ['parent', 'threads'] });
      queryClient.invalidateQueries({ queryKey: ['messages', variables.threadId] });
    }
  });
};

/**
 * Hook to create a new message thread with initial message
 */
export const useCreateThread = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({
      preschoolId,
      type,
      subject,
      studentId,
      recipientId,
      userId,
      initialMessage
    }: CreateThreadParams) => {
      const client = createClient();
      
      // Create thread
      const threadPayload = {
        preschool_id: preschoolId,
        type,
        subject,
        student_id: studentId || null,
        created_by: userId,
        last_message_at: new Date().toISOString(),
      };

      let thread: { id: string } | null = null;
      const { data: createdThread, error: threadError } = await client
        .from('message_threads')
        .insert(threadPayload)
        .select()
        .single();

      if (threadError) {
        const errorMessage = threadError.message?.toLowerCase() || '';
        if (errorMessage.includes('created_by')) {
          const { data: fallbackThread, error: fallbackError } = await client
            .from('message_threads')
            .insert({
              preschool_id: preschoolId,
              type,
              subject,
              student_id: studentId || null,
              last_message_at: new Date().toISOString(),
            })
            .select()
            .single();

          if (fallbackError) throw fallbackError;
          thread = fallbackThread;
        } else {
          throw threadError;
        }
      } else {
        thread = createdThread;
      }

      if (!thread?.id) {
        throw new Error('Unable to create conversation.');
      }
      
      // Add participants
      const { error: participantsError } = await client
        .from('message_participants')
        .insert([
          {
            thread_id: thread.id,
            user_id: userId,
            role: 'parent',
            last_read_at: new Date().toISOString()
          },
          {
            thread_id: thread.id,
            user_id: recipientId,
            role: type === 'parent-principal' ? 'principal' : 'teacher',
            last_read_at: new Date().toISOString()
          }
        ]);
      
      if (participantsError) throw participantsError;
      
      // Send initial message
      const { error: messageError } = await client
        .from('messages')
        .insert({
          thread_id: thread.id,
          sender_id: userId,
          content: initialMessage,
          content_type: 'text'
        });
      
      if (messageError) throw messageError;
      
      return thread;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parent', 'threads'] });
    }
  });
};
