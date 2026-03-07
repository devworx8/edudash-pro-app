'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient, RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { ChatMessage } from '@/components/messaging/ChatMessageBubble';

// Extended message type with WhatsApp-style features
export interface ExtendedChatMessage extends ChatMessage {
  edited_at?: string | null;
  deleted_for?: string[];
  deleted_for_everyone?: boolean;
  reply_to_message_id?: string | null;
  forwarded_from_message_id?: string | null;
  message_status?: string;
}

interface UseRealtimeMessagesOptions {
  supabase: SupabaseClient;
  threadId: string | null;
  userId?: string;
  onNewMessage?: (message: ExtendedChatMessage) => void;
  onMessageUpdated?: (message: ExtendedChatMessage) => void;
  onMessageDeleted?: (messageId: string) => void;
}

interface MessageRow {
  id: string;
  thread_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  edited_at?: string | null;
  read_by?: string[];
  deleted_for?: string[];
  deleted_for_everyone?: boolean;
  reply_to_message_id?: string | null;
  forwarded_from_message_id?: string | null;
  message_status?: string;
  sender?: {
    first_name: string;
    last_name: string;
    role: string;
  } | Array<{
    first_name: string;
    last_name: string;
    role: string;
  }>;
}

export const useRealtimeMessages = ({
  supabase,
  threadId,
  userId,
  onNewMessage,
  onMessageUpdated,
  onMessageDeleted,
}: UseRealtimeMessagesOptions) => {
  const [messages, setMessages] = useState<ExtendedChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Helper function to check if a message should be visible to the current user
  const shouldShowMessage = useCallback((message: ExtendedChatMessage, currentUserId?: string): boolean => {
    // If deleted for everyone, don't show
    if (message.deleted_for_everyone) return false;
    
    // If deleted for this specific user, don't show
    const deletedFor = message.deleted_for;
    if (deletedFor && currentUserId && deletedFor.includes(currentUserId)) return false;
    
    return true;
  }, []);

  // Normalize message row to ExtendedChatMessage
  const normalizeMessage = useCallback((row: MessageRow): ExtendedChatMessage => {
    // Handle sender being either an object or array (Supabase join returns array)
    let sender: ExtendedChatMessage['sender'] | undefined;
    if (row.sender) {
      if (Array.isArray(row.sender) && row.sender.length > 0) {
        sender = row.sender[0];
      } else if (!Array.isArray(row.sender)) {
        sender = row.sender;
      }
    }

    return {
      id: row.id,
      sender_id: row.sender_id,
      content: row.content,
      created_at: row.created_at,
      read_by: row.read_by,
      sender,
      edited_at: row.edited_at,
      deleted_for: row.deleted_for,
      deleted_for_everyone: row.deleted_for_everyone,
      reply_to_message_id: row.reply_to_message_id,
      forwarded_from_message_id: row.forwarded_from_message_id,
      message_status: row.message_status,
    };
  }, []);

  // Fetch messages with sender info
  const fetchMessages = useCallback(async () => {
    if (!threadId) {
      setMessages([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('messages')
        .select(`
          id,
          thread_id,
          sender_id,
          content,
          created_at,
          edited_at,
          read_by,
          deleted_for,
          deleted_for_everyone,
          reply_to_message_id,
          forwarded_from_message_id,
          message_status,
          sender:profiles(first_name, last_name, role)
        `)
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });

      if (fetchError) throw fetchError;

      // Filter out messages deleted for the current user and normalize
      const filteredMessages = (data || [])
        .map(normalizeMessage)
        .filter((msg) => shouldShowMessage(msg, userId));

      setMessages(filteredMessages);
    } catch (err) {
      console.error('Error fetching messages:', err);
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setIsLoading(false);
    }
  }, [supabase, threadId, userId, normalizeMessage, shouldShowMessage]);

  // Fetch message with sender info by ID
  const fetchMessageById = useCallback(async (messageId: string): Promise<ExtendedChatMessage | null> => {
    try {
      const { data, error: fetchError } = await supabase
        .from('messages')
        .select(`
          id,
          thread_id,
          sender_id,
          content,
          created_at,
          edited_at,
          read_by,
          deleted_for,
          deleted_for_everyone,
          reply_to_message_id,
          forwarded_from_message_id,
          message_status,
          sender:profiles(first_name, last_name, role)
        `)
        .eq('id', messageId)
        .single();

      if (fetchError) throw fetchError;
      return normalizeMessage(data as MessageRow);
    } catch (err) {
      console.error('Error fetching message by ID:', err);
      return null;
    }
  }, [supabase, normalizeMessage]);

  // Set up real-time subscription
  useEffect(() => {
    if (!threadId) {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      return;
    }

    // Fetch initial messages
    fetchMessages();

    // Subscribe to real-time changes
    const channel = supabase
      .channel(`messages:${threadId}`)
      .on<MessageRow>(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `thread_id=eq.${threadId}`,
        },
        async (payload: RealtimePostgresChangesPayload<MessageRow>) => {
          if (payload.eventType === 'INSERT') {
            // Fetch complete message with sender info
            const newMessage = await fetchMessageById(payload.new.id);
            if (newMessage) {
              // Check if should be visible to current user
              if (!shouldShowMessage(newMessage, userId)) return;

              setMessages((prev) => {
                // Avoid duplicates
                if (prev.some((m) => m.id === newMessage.id)) return prev;
                return [...prev, newMessage];
              });
              onNewMessage?.(newMessage);
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedMessage = await fetchMessageById(payload.new.id);
            if (updatedMessage) {
              // Check if message should now be hidden
              if (!shouldShowMessage(updatedMessage, userId)) {
                setMessages((prev) => prev.filter((m) => m.id !== updatedMessage.id));
                onMessageDeleted?.(updatedMessage.id);
                return;
              }

              setMessages((prev) =>
                prev.map((m) => (m.id === updatedMessage.id ? updatedMessage : m))
              );
              onMessageUpdated?.(updatedMessage);
            }
          } else if (payload.eventType === 'DELETE') {
            const deletedId = payload.old.id;
            if (deletedId) {
              setMessages((prev) => prev.filter((m) => m.id !== deletedId));
              onMessageDeleted?.(deletedId);
            }
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [supabase, threadId, userId, fetchMessages, fetchMessageById, shouldShowMessage, onNewMessage, onMessageUpdated, onMessageDeleted]);

  // Edit message (within 15 minutes)
  const editMessage = useCallback(async (messageId: string, newContent: string): Promise<boolean> => {
    try {
      const { data, error: editError } = await supabase.rpc('edit_message', {
        p_message_id: messageId,
        p_new_content: newContent,
      });

      if (editError) throw editError;
      return data as boolean;
    } catch (err) {
      console.error('Error editing message:', err);
      return false;
    }
  }, [supabase]);

  // Delete message for me
  const deleteForMe = useCallback(async (messageId: string): Promise<void> => {
    try {
      const { error: deleteError } = await supabase.rpc('delete_message_for_me', {
        p_message_id: messageId,
      });

      if (deleteError) throw deleteError;
      
      // Optimistically remove from local state
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (err) {
      console.error('Error deleting message for me:', err);
      throw err;
    }
  }, [supabase]);

  // Delete message for everyone (within 1 hour)
  const deleteForEveryone = useCallback(async (messageId: string): Promise<boolean> => {
    try {
      const { data, error: deleteError } = await supabase.rpc('delete_message_for_everyone', {
        p_message_id: messageId,
      });

      if (deleteError) throw deleteError;
      
      if (data) {
        // Optimistically remove from local state
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      }
      
      return data as boolean;
    } catch (err) {
      console.error('Error deleting message for everyone:', err);
      return false;
    }
  }, [supabase]);

  // Reply to a message
  const replyToMessage = useCallback(async (
    replyToMessageId: string,
    content: string,
    contentType: string = 'text'
  ): Promise<string | null> => {
    if (!threadId || !userId) return null;

    try {
      const { data, error: insertError } = await supabase
        .from('messages')
        .insert({
          thread_id: threadId,
          sender_id: userId,
          content,
          content_type: contentType,
          reply_to_message_id: replyToMessageId,
        })
        .select('id')
        .single();

      if (insertError) throw insertError;

      // Update thread's last_message_at
      await supabase
        .from('message_threads')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', threadId);

      return data?.id || null;
    } catch (err) {
      console.error('Error sending reply:', err);
      return null;
    }
  }, [supabase, threadId, userId]);

  // Forward a message
  const forwardMessage = useCallback(async (
    originalMessageId: string,
    targetThreadId: string,
    content: string
  ): Promise<string | null> => {
    if (!userId) return null;

    try {
      const { data, error: insertError } = await supabase
        .from('messages')
        .insert({
          thread_id: targetThreadId,
          sender_id: userId,
          content,
          content_type: 'text',
          forwarded_from_message_id: originalMessageId,
        })
        .select('id')
        .single();

      if (insertError) throw insertError;

      // Update target thread's last_message_at
      await supabase
        .from('message_threads')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', targetThreadId);

      return data?.id || null;
    } catch (err) {
      console.error('Error forwarding message:', err);
      return null;
    }
  }, [supabase, userId]);

  return {
    messages,
    isLoading,
    error,
    refetch: fetchMessages,
    editMessage,
    deleteForMe,
    deleteForEveryone,
    replyToMessage,
    forwardMessage,
  };
};