/**
 * useTeacherSendMessage — Mutation to send a message in a thread
 * Supports text and voice messages, sends push notifications to recipients
 * Uses optimistic updates for instant bubble display
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { assertSupabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { sendMessagePushNotification } from '@/lib/messaging/pushNotifications';
import type { Message } from '@/lib/messaging/types';

export const useTeacherSendMessage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      threadId, 
      content,
      voiceUrl,
      voiceDuration,
      replyToId,
      scheduledAt,
    }: { 
      threadId: string; 
      content: string;
      voiceUrl?: string;
      voiceDuration?: number;
      replyToId?: string;
      scheduledAt?: Date;
    }) => {
      if (!user?.id) throw new Error('User not authenticated');
      
      const client = assertSupabase();
      const isVoice = !!voiceUrl;
      
      const { data, error } = await client
        .from('messages')
        .insert({
          thread_id: threadId,
          sender_id: user.id,
          content,
          content_type: isVoice ? 'voice' : 'text',
          voice_url: voiceUrl || null,
          voice_duration: voiceDuration || null,
          reply_to_id: replyToId || null,
          ...(scheduledAt ? { scheduled_at: scheduledAt.toISOString(), is_scheduled: true } : {}),
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Update thread's last_message_at (fire-and-forget, don't block UI)
      // Skip for scheduled messages
      if (!scheduledAt) {
        client
          .from('message_threads')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', threadId)
          .then(() => {}, () => {});
      }
      
      return data;
    },
    // Optimistic update — show bubble instantly before server responds
    // Skip for scheduled messages
    onMutate: async (variables) => {
      const { threadId, content, voiceUrl, voiceDuration, replyToId, scheduledAt } = variables;
      if (scheduledAt) return { previousMessages: undefined, threadId };

      // Cancel outgoing refetches so they don't overwrite optimistic update
      await queryClient.cancelQueries({ queryKey: ['teacher', 'messages', threadId] });

      // Snapshot previous messages for rollback
      const previousMessages = queryClient.getQueryData<Message[]>(['teacher', 'messages', threadId]);

      // Create optimistic message with temp ID
      const optimisticMessage: Message = {
        id: `temp-${Date.now()}`,
        thread_id: threadId,
        sender_id: user?.id || '',
        content,
        content_type: voiceUrl ? 'voice' : 'text',
        voice_url: voiceUrl || null,
        voice_duration: voiceDuration || null,
        reply_to_id: replyToId || null,
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted_at: null,
        delivered_at: null,
        read_by: [],
        reactions: [],
        sender: null,
        reply_to: null,
      } as any;

      // Immediately add to cache
      queryClient.setQueryData<Message[]>(
        ['teacher', 'messages', threadId],
        (old) => old ? [...old, optimisticMessage] : [optimisticMessage],
      );

      return { previousMessages, threadId };
    },
    onError: (_err, _variables, context) => {
      // Rollback to previous messages on error
      if (context?.previousMessages !== undefined) {
        queryClient.setQueryData(
          ['teacher', 'messages', context.threadId],
          context.previousMessages,
        );
      }
    },
    onSuccess: async (data, variables) => {
      if (variables.scheduledAt) {
        queryClient.invalidateQueries({ queryKey: ['teacher', 'threads'] });
        return;
      }

      // Replace optimistic message with real server data
      queryClient.setQueryData<Message[]>(
        ['teacher', 'messages', variables.threadId],
        (old) => {
          if (!old) return [data];
          // Remove temp messages that match this content + sender
          return old.map((msg) =>
            (msg.id.startsWith('temp-') && msg.content === data.content && msg.sender_id === data.sender_id)
              ? { ...msg, ...data }
              : msg,
          );
        },
      );
      queryClient.invalidateQueries({ queryKey: ['teacher', 'threads'] });
      
      // Send push notification (fire-and-forget, don't block)
      const client = assertSupabase();
      const { data: participants } = await client
        .from('message_participants')
        .select('user_id')
        .eq('thread_id', variables.threadId);

      const recipientIds = participants?.map((p: any) => p.user_id) || [];

      const { data: senderProfile } = await client
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', user?.id)
        .single();

      const senderName = senderProfile 
        ? `${senderProfile.first_name || ''} ${senderProfile.last_name || ''}`.trim() || 'Teacher'
        : 'Teacher';

      sendMessagePushNotification({
        threadId: variables.threadId,
        messageId: data.id,
        senderId: user?.id || '',
        senderName,
        messageContent: data.content,
        recipientIds,
      }).catch(() => {}); // Don't block on notification failures
    },
  });
};
