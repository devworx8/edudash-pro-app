import { useMutation, useQueryClient } from '@tanstack/react-query';
import { assertSupabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { sendMessagePushNotification } from '@/lib/messaging/pushNotifications';
import type { Message } from '@/lib/messaging/types';

/**
 * Hook to send a message with optimistic updates for instant bubble display
 */
export const useSendMessage = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

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
      const client = assertSupabase();
      const isVoice = !!voiceUrl;

      const { data, error } = await client
        .from('messages')
        .insert({
          thread_id: threadId,
          sender_id: user?.id,
          content: content.trim(),
          content_type: isVoice ? 'voice' : 'text',
          voice_url: voiceUrl || null,
          voice_duration: voiceDuration || null,
          reply_to_id: replyToId || null,
          ...(scheduledAt ? { scheduled_at: scheduledAt.toISOString(), is_scheduled: true } : {}),
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    // Optimistic update — show bubble instantly before server responds
    // Skip for scheduled messages (they don't appear in the thread yet)
    onMutate: async (variables) => {
      const { threadId, content, voiceUrl, voiceDuration, replyToId, scheduledAt } = variables;
      if (scheduledAt) return { previousMessages: undefined, threadId };

      // Cancel outgoing refetches so they don't overwrite optimistic update
      await queryClient.cancelQueries({ queryKey: ['messages', threadId] });

      // Snapshot previous messages for rollback
      const previousMessages = queryClient.getQueryData<Message[]>(['messages', threadId]);

      // Create optimistic message with temp ID
      const optimisticMessage: Message = {
        id: `temp-${Date.now()}`,
        thread_id: threadId,
        sender_id: user?.id || '',
        content: content.trim(),
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
        ['messages', threadId],
        (old) => old ? [...old, optimisticMessage] : [optimisticMessage],
      );

      return { previousMessages, threadId };
    },
    onError: (_err, _variables, context) => {
      // Rollback to previous messages on error
      if (context?.previousMessages !== undefined) {
        queryClient.setQueryData(
          ['messages', context.threadId],
          context.previousMessages,
        );
      }
    },
    onSuccess: async (data, { threadId, scheduledAt }) => {
      if (scheduledAt) {
        // Scheduled message — just invalidate thread list, no optimistic swap needed
        queryClient.invalidateQueries({ queryKey: ['parent', 'threads'] });
        return;
      }

      // Replace optimistic message with real server data
      queryClient.setQueryData<Message[]>(
        ['messages', threadId],
        (old) => {
          if (!old) return [data];
          return old.map((msg) =>
            (msg.id.startsWith('temp-') && msg.content === data.content && msg.sender_id === data.sender_id)
              ? { ...msg, ...data }
              : msg,
          );
        },
      );

      // Update thread ordering timestamp (fire-and-forget)
      const supabase = assertSupabase();
      supabase.from('message_threads')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', threadId)
        .then(() => {}, () => {});

      queryClient.invalidateQueries({ queryKey: ['parent', 'threads'] });
      queryClient.invalidateQueries({ queryKey: ['teacher', 'threads'] });

      // Send push notification (fire-and-forget)
      const client = assertSupabase();
      const { data: participants } = await client
        .from('message_participants')
        .select('user_id')
        .eq('thread_id', threadId);

      const recipientIds = participants?.map((participant: any) => participant.user_id) || [];

      const { data: senderProfile } = await client
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', user?.id)
        .single();

      const senderName = senderProfile
        ? `${senderProfile.first_name || ''} ${senderProfile.last_name || ''}`.trim() || 'Someone'
        : 'Someone';

      sendMessagePushNotification({
        threadId,
        messageId: data.id,
        senderId: user?.id || '',
        senderName,
        messageContent: data.content,
        recipientIds,
      }).catch(() => {}); // Don't block on notification failures
    },
  });
};

/**
 * Hook to create or get a parent-teacher thread
 */
export const useCreateThread = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ studentId }: { studentId: string }) => {
      if (!user?.id) throw new Error('User not authenticated');

      const client = assertSupabase();
      const { data, error } = await client.rpc('get_or_create_parent_teacher_thread', {
        p_student_id: studentId,
        p_parent_id: user.id,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parent', 'threads'] });
    },
  });
};
