import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { isPlatformStaff } from '@/lib/roleUtils';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { fetchTeamChannels } from './fetchChannels';
import {
  fetchChannelMessages,
  fetchChannelMembers,
  sendTeamMessage,
  markChannelRead,
  ensureChannelMembership,
} from './fetchMessages';
import type { ShowAlertConfig, TeamChannel, TeamMessage, TeamChannelMember } from './types';

export function useSuperAdminTeamChat(showAlert: (config: ShowAlertConfig) => void) {
  const { profile } = useAuth();
  const [channels, setChannels] = useState<TeamChannel[]>([]);
  const [activeChannel, setActiveChannel] = useState<TeamChannel | null>(null);
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [members, setMembers] = useState<TeamChannelMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const userId = profile?.id || '';

  // Load channels
  const loadChannels = useCallback(async () => {
    if (!isPlatformStaff(profile?.role)) return;
    const result = await fetchTeamChannels(userId);
    setChannels(result);
  }, [profile?.role, userId]);

  useEffect(() => {
    setLoading(true);
    loadChannels().finally(() => setLoading(false));
  }, [loadChannels]);

  // Select channel → load messages + members + subscribe realtime
  const selectChannel = useCallback(
    async (channel: TeamChannel) => {
      setActiveChannel(channel);
      setMessages([]);

      await ensureChannelMembership(channel.id, userId);

      const [msgs, mems] = await Promise.all([
        fetchChannelMessages(channel.id),
        fetchChannelMembers(channel.id),
      ]);
      setMessages(msgs);
      setMembers(mems);

      await markChannelRead(channel.id, userId);

      // Unsubscribe previous channel
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
      }

      // Subscribe to new messages in this channel
      const sub = supabase
        .channel(`team-messages:${channel.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'team_messages',
            filter: `channel_id=eq.${channel.id}`,
          },
          async (payload) => {
            const newMsg = payload.new as TeamMessage;
            // Fetch sender profile for the new message
            try {
              const { data: senderProfile } = await (await import('@/lib/supabase')).assertSupabase()
                .from('profiles')
                .select('full_name, avatar_url, role')
                .eq('id', newMsg.sender_id)
                .single();

              setMessages((prev) => {
                if (prev.some((m) => m.id === newMsg.id)) return prev;
                return [...prev, { ...newMsg, sender: senderProfile || undefined }];
              });
            } catch {
              setMessages((prev) => {
                if (prev.some((m) => m.id === newMsg.id)) return prev;
                return [...prev, newMsg];
              });
            }

            // Mark as read if message from someone else
            if (newMsg.sender_id !== userId) {
              markChannelRead(channel.id, userId);
            }
          },
        )
        .subscribe();

      realtimeChannelRef.current = sub;
    },
    [userId],
  );

  // Send message
  const handleSendMessage = useCallback(
    async (content: string, replyToId?: string) => {
      if (!activeChannel || !content.trim()) return;
      setSendingMessage(true);

      const sent = await sendTeamMessage(activeChannel.id, userId, content, replyToId);
      if (!sent) {
        showAlert({
          title: 'Send Failed',
          message: 'Could not send message. Please try again.',
          type: 'error',
        });
      }

      setSendingMessage(false);
    },
    [activeChannel, userId, showAlert],
  );

  // Refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadChannels();
    if (activeChannel) {
      const msgs = await fetchChannelMessages(activeChannel.id);
      setMessages(msgs);
    }
    setRefreshing(false);
  }, [loadChannels, activeChannel]);

  // Back to channel list
  const goBackToChannels = useCallback(() => {
    setActiveChannel(null);
    setMessages([]);
    setMembers([]);
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }
    loadChannels();
  }, [loadChannels]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
      }
    };
  }, []);

  return {
    profile,
    channels,
    activeChannel,
    messages,
    members,
    loading,
    sendingMessage,
    refreshing,
    selectChannel,
    handleSendMessage,
    onRefresh,
    goBackToChannels,
  };
}
