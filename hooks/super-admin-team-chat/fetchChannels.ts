import { assertSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type { TeamChannel } from './types';

/**
 * Fetch all team channels with last message and member count.
 */
export async function fetchTeamChannels(userId: string): Promise<TeamChannel[]> {
  try {
    const supabase = assertSupabase();

    const { data: channels, error } = await supabase
      .from('team_channels')
      .select('*')
      .eq('is_archived', false)
      .order('created_at', { ascending: true });

    if (error) {
      logger.error('fetchTeamChannels', 'Failed to fetch channels:', error);
      return [];
    }

    if (!channels?.length) return [];

    // Get member counts per channel
    const { data: memberCounts } = await supabase
      .from('team_channel_members')
      .select('channel_id');

    const countMap = new Map<string, number>();
    memberCounts?.forEach((m) => {
      countMap.set(m.channel_id, (countMap.get(m.channel_id) || 0) + 1);
    });

    // Get last message per channel
    const channelIds = channels.map((c) => c.id);
    const { data: lastMessages } = await supabase
      .from('team_messages')
      .select('id, channel_id, content, content_type, created_at, sender_id')
      .in('channel_id', channelIds)
      .order('created_at', { ascending: false });

    const lastMessageMap = new Map<string, (typeof lastMessages)[0]>();
    lastMessages?.forEach((msg) => {
      if (!lastMessageMap.has(msg.channel_id)) {
        lastMessageMap.set(msg.channel_id, msg);
      }
    });

    // Get unread counts
    const { data: membership } = await supabase
      .from('team_channel_members')
      .select('channel_id, last_read_at')
      .eq('user_id', userId);

    const lastReadMap = new Map<string, string | null>();
    membership?.forEach((m) => {
      lastReadMap.set(m.channel_id, m.last_read_at);
    });

    return channels.map((channel) => {
      const lastMsg = lastMessageMap.get(channel.id);
      const lastRead = lastReadMap.get(channel.id);
      let unreadCount = 0;

      if (lastMsg && (!lastRead || new Date(lastMsg.created_at) > new Date(lastRead))) {
        unreadCount = 1; // Simplified — presence of newer message
      }

      return {
        ...channel,
        member_count: countMap.get(channel.id) || 0,
        unread_count: unreadCount,
        last_message: lastMsg
          ? { ...lastMsg, sender: undefined, reply_to: undefined, is_pinned: false, is_edited: false, metadata: {}, updated_at: lastMsg.created_at, reply_to_id: null }
          : null,
      };
    });
  } catch (err) {
    logger.error('fetchTeamChannels', 'Unexpected error:', err);
    return [];
  }
}
