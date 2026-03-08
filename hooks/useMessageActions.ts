/**
 * useMessageActions Hook — PRODUCTION IMPLEMENTATION
 *
 * Handles per-message actions: react, reply, copy, forward, delete, edit, star.
 * All stubs from the original have been replaced with real implementations.
 */

import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { toast } from '@/components/ui/ToastProvider';
import { assertSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type { Message } from '@/components/messaging';
import type { AlertButton } from '@/components/ui/AlertModal';

type ShowAlertFn = (config: {
  title: string;
  message: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  buttons?: AlertButton[];
}) => void;

interface UseMessageActionsProps {
  selectedMessage: Message | null;
  user: { id: string } | null;
  refetch: () => void;
  setSelectedMessage: (msg: Message | null) => void;
  setShowMessageActions: (show: boolean) => void;
  setReplyingTo: (msg: Message | null) => void;
  setOptimisticMsgs: React.Dispatch<React.SetStateAction<Message[]>>;
  showAlert?: ShowAlertFn;
}

export function useMessageActions({
  selectedMessage,
  user,
  refetch,
  setSelectedMessage,
  setShowMessageActions,
  setReplyingTo,
  setOptimisticMsgs,
  showAlert,
}: UseMessageActionsProps) {
  /** When non-null the edit composer is open for this message */
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  /** When true the forward-thread picker modal is open */
  const [showForwardPicker, setShowForwardPicker] = useState(false);
  /** The message being forwarded (held while the picker is open) */
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);

  // ─── React ───────────────────────────────────────────────────────────

  const handleReact = useCallback(
    async (emoji: string) => {
      if (!selectedMessage?.id || !user?.id) {
        setShowMessageActions(false);
        setSelectedMessage(null);
        return;
      }

      try {
        const client = assertSupabase();

        // Delete any existing reaction from this user on this message first
        await client
          .from('message_reactions')
          .delete()
          .eq('message_id', selectedMessage.id)
          .eq('user_id', user.id);

        // Add the new reaction
        await client.from('message_reactions').insert({
          message_id: selectedMessage.id,
          user_id: user.id,
          emoji,
        });

        refetch();
      } catch (err) {
        logger.error('MessageActions', 'Error reacting to message:', err);
        toast.error('Failed to add reaction');
      }

      setShowMessageActions(false);
      setSelectedMessage(null);
    },
    [selectedMessage, user?.id, refetch, setShowMessageActions, setSelectedMessage]
  );

  const handleReactionPress = useCallback(
    async (messageId: string, emoji: string) => {
      if (!user?.id) return;

      try {
        const client = assertSupabase();

        await client
          .from('message_reactions')
          .delete()
          .eq('message_id', messageId)
          .eq('user_id', user.id)
          .eq('emoji', emoji);

        refetch();
      } catch (err) {
        logger.error('MessageActions', 'Error removing reaction:', err);
        toast.error('Failed to remove reaction');
      }
    },
    [user?.id, refetch]
  );

  const handleQuickReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!user?.id) return;

      try {
        const client = assertSupabase();

        const { data: existingReaction, error: existingError } = await client
          .from('message_reactions')
          .select('id')
          .eq('message_id', messageId)
          .eq('user_id', user.id)
          .eq('emoji', emoji)
          .maybeSingle();

        if (existingError && existingError.code !== 'PGRST116') {
          throw existingError;
        }

        await client
          .from('message_reactions')
          .delete()
          .eq('message_id', messageId)
          .eq('user_id', user.id);

        if (!existingReaction?.id) {
          const { error: insertError } = await client.from('message_reactions').insert({
            message_id: messageId,
            user_id: user.id,
            emoji,
          });
          if (insertError) throw insertError;
        }

        refetch();
      } catch (err) {
        logger.error('MessageActions', 'Error toggling quick reaction:', err);
        toast.error('Failed to update reaction');
      }
    },
    [user?.id, refetch]
  );

  // ─── Reply ───────────────────────────────────────────────────────────

  const handleReply = useCallback(() => {
    if (selectedMessage) {
      setReplyingTo(selectedMessage);
    }
    setShowMessageActions(false);
    setSelectedMessage(null);
  }, [selectedMessage, setReplyingTo, setShowMessageActions, setSelectedMessage]);

  // ─── Copy to clipboard (was a stub) ─────────────────────────────────

  const handleCopy = useCallback(async () => {
    if (selectedMessage?.content) {
      try {
        await Clipboard.setStringAsync(selectedMessage.content);
        toast.success('Copied to clipboard');
      } catch {
        // Fallback for web
        if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
          try {
            await navigator.clipboard.writeText(selectedMessage.content);
            toast.success('Copied to clipboard');
          } catch (webErr) {
            logger.error('MessageActions', 'Web clipboard failed:', webErr);
            toast.error('Failed to copy');
          }
        }
      }
    }
    setShowMessageActions(false);
    setSelectedMessage(null);
  }, [selectedMessage, setShowMessageActions, setSelectedMessage]);

  // ─── Forward (was a stub) ───────────────────────────────────────────

  const handleForward = useCallback(() => {
    if (!selectedMessage) return;
    setForwardingMessage(selectedMessage);
    setShowForwardPicker(true);
    setShowMessageActions(false);
    setSelectedMessage(null);
  }, [selectedMessage, setShowMessageActions, setSelectedMessage]);

  /** Called by ForwardMessagePicker when the user selects a target thread */
  const confirmForward = useCallback(
    async (targetThreadId: string) => {
      if (!forwardingMessage || !user?.id) return;

      try {
        const client = assertSupabase();

        const { error } = await client.from('messages').insert({
          thread_id: targetThreadId,
          sender_id: user.id,
          content: forwardingMessage.content,
          content_type: (forwardingMessage as any).content_type || 'text',
          voice_url: forwardingMessage.voice_url || null,
          voice_duration: forwardingMessage.voice_duration || null,
          forwarded_from_id: forwardingMessage.id,
        });

        if (error) throw error;

        // Touch the target thread's last_message_at
        await client
          .from('message_threads')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', targetThreadId);

        toast.success('Message forwarded');
        logger.debug(
          'MessageActions',
          `Forwarded message ${forwardingMessage.id} → thread ${targetThreadId}`
        );
      } catch (err) {
        logger.error('MessageActions', 'Forward failed:', err);
        toast.error('Failed to forward message');
      } finally {
        setForwardingMessage(null);
        setShowForwardPicker(false);
      }
    },
    [forwardingMessage, user?.id]
  );

  const cancelForward = useCallback(() => {
    setForwardingMessage(null);
    setShowForwardPicker(false);
  }, []);

  // ─── Delete ──────────────────────────────────────────────────────────

  const handleDelete = useCallback(
    async () => {
      if (!selectedMessage || !user?.id) return;

      const runDelete = async () => {
        try {
          const client = assertSupabase();
          const { error } = await client
            .from('messages')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', selectedMessage.id)
            .eq('sender_id', user.id);

          // Fallback for environments still running restrictive update RLS.
          if (error && error.code === '42501') {
            const hardDelete = await client
              .from('messages')
              .delete()
              .eq('id', selectedMessage.id)
              .eq('sender_id', user.id);
            if (hardDelete.error) throw hardDelete.error;
          } else if (error) {
            throw error;
          }

          // Remove from local state immediately
          setOptimisticMsgs((prev) => prev.filter((m) => m.id !== selectedMessage.id));
          refetch();
          toast.success('Message deleted');
        } catch (err) {
          logger.error('MessageActions', 'Delete failed:', err);
          toast.error('Failed to delete message');
        }
      };

      if (showAlert) {
        showAlert({
          title: 'Delete Message',
          message: 'Are you sure you want to delete this message?',
          type: 'warning',
          buttons: [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: runDelete },
          ],
        });
      } else {
        await runDelete();
      }

      setShowMessageActions(false);
      setSelectedMessage(null);
    },
    [selectedMessage, user?.id, refetch, setOptimisticMsgs, setShowMessageActions, setSelectedMessage, showAlert]
  );

  // ─── Edit (was a stub — now fully implemented) ──────────────────────

  const handleEdit = useCallback(() => {
    if (!selectedMessage || !user?.id) return;

    // Only own messages
    if (selectedMessage.sender_id !== user.id) {
      toast.warn('You can only edit your own messages');
      setShowMessageActions(false);
      setSelectedMessage(null);
      return;
    }

    // 15-minute window
    const sentAt = new Date(selectedMessage.created_at).getTime();
    const fifteenMinutes = 15 * 60 * 1000;
    if (Date.now() - sentAt > fifteenMinutes) {
      toast.warn('Messages can only be edited within 15 minutes');
      setShowMessageActions(false);
      setSelectedMessage(null);
      return;
    }

    // Only text
    if ((selectedMessage as any).content_type && (selectedMessage as any).content_type !== 'text') {
      toast.warn('Only text messages can be edited');
      setShowMessageActions(false);
      setSelectedMessage(null);
      return;
    }

    setEditingMessage(selectedMessage);
    setShowMessageActions(false);
    setSelectedMessage(null);
  }, [selectedMessage, user?.id, setShowMessageActions, setSelectedMessage]);

  /** Called from the composer when the user submits the edited text */
  const confirmEdit = useCallback(
    async (newContent: string) => {
      if (!editingMessage) return;

      const trimmed = newContent.trim();
      if (!trimmed || trimmed === editingMessage.content) {
        setEditingMessage(null);
        return;
      }

      try {
        const client = assertSupabase();
        const { error } = await client
          .from('messages')
          .update({
            content: trimmed,
            edited_at: new Date().toISOString(),
          })
          .eq('id', editingMessage.id);

        if (error) throw error;

        // Optimistic update
        setOptimisticMsgs((prev) =>
          prev.map((m) =>
            m.id === editingMessage.id
              ? { ...m, content: trimmed, edited_at: new Date().toISOString() }
              : m
          )
        );

        refetch();
        toast.success('Message edited');
      } catch (err) {
        logger.error('MessageActions', 'Edit failed:', err);
        toast.error('Failed to edit message');
      } finally {
        setEditingMessage(null);
      }
    },
    [editingMessage, refetch, setOptimisticMsgs]
  );

  const cancelEdit = useCallback(() => {
    setEditingMessage(null);
  }, []);

  // ─── Star / unstar ──────────────────────────────────────────────────

  const handlePinMessage = useCallback(
    async () => {
      if (!selectedMessage?.id || !user?.id) return;

      try {
        const client = assertSupabase();
        const isCurrentlyPinned = !!(selectedMessage as any).is_pinned;

        const { error } = await client
          .from('messages')
          .update({
            is_pinned: !isCurrentlyPinned,
            pinned_at: isCurrentlyPinned ? null : new Date().toISOString(),
            pinned_by: isCurrentlyPinned ? null : user.id,
          })
          .eq('id', selectedMessage.id);

        if (error) throw error;

        setOptimisticMsgs((prev) =>
          prev.map((m) =>
            m.id === selectedMessage.id
              ? {
                  ...m,
                  is_pinned: !isCurrentlyPinned,
                  pinned_at: isCurrentlyPinned ? null : new Date().toISOString(),
                  pinned_by: isCurrentlyPinned ? null : user.id,
                }
              : m
          )
        );

        refetch();
        toast.success(isCurrentlyPinned ? 'Message unpinned' : 'Message pinned');
      } catch (err) {
        logger.error('MessageActions', 'Pin toggle failed:', err);
        toast.error('Failed to update pin');
      }

      setShowMessageActions(false);
      setSelectedMessage(null);
    },
    [selectedMessage, user?.id, refetch, setOptimisticMsgs, setShowMessageActions, setSelectedMessage]
  );

  const handleToggleStar = useCallback(
    async () => {
      if (!selectedMessage?.id || !user?.id) return;

      try {
        const client = assertSupabase();
        const isCurrentlyStarred = !!(selectedMessage as any).is_starred;
        const newStarred = !isCurrentlyStarred;

        const { error } = await client
          .from('messages')
          .update({ is_starred: newStarred })
          .eq('id', selectedMessage.id);

        if (error) throw error;

        setOptimisticMsgs((prev) =>
          prev.map((m) =>
            m.id === selectedMessage.id ? { ...m, is_starred: newStarred } : m
          )
        );

        toast.success(newStarred ? 'Message starred' : 'Star removed');
      } catch (err) {
        logger.error('MessageActions', 'Star toggle failed:', err);
        toast.error('Failed to update star');
      }

      setShowMessageActions(false);
      setSelectedMessage(null);
    },
    [selectedMessage, user?.id, setOptimisticMsgs, setShowMessageActions, setSelectedMessage]
  );

  return {
    // Original actions (now fully implemented)
    handleReact,
    handleReactionPress,
    handleQuickReaction,
    handleReply,
    handleCopy,
    handleForward,
    handleDelete,
    handleEdit,
    // New actions
    handleToggleStar,
    handlePinMessage,
    // Edit state & controls
    editingMessage,
    confirmEdit,
    cancelEdit,
    // Forward state & controls
    showForwardPicker,
    forwardingMessage,
    confirmForward,
    cancelForward,
  };
}
