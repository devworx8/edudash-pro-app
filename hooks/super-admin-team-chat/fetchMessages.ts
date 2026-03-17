import { assertSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type { TeamMessage, TeamChannelMember } from './types';

/**
 * Fetch messages for a specific channel with sender profiles.
 */
export async function fetchChannelMessages(
  channelId: string,
  limit = 50,
): Promise<TeamMessage[]> {
  try {
    const supabase = assertSupabase();

    const { data, error } = await supabase
      .from('team_messages')
      .select(`
        *,
        sender:profiles!team_messages_sender_id_fkey(full_name, avatar_url, role)
      `)
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      logger.error('fetchChannelMessages', 'Failed:', error);
      return [];
    }

    return (data || []).map((msg) => ({
      ...msg,
      sender: msg.sender || undefined,
      reply_to: undefined,
    }));
  } catch (err) {
    logger.error('fetchChannelMessages', 'Unexpected error:', err);
    return [];
  }
}

/**
 * Fetch members of a specific channel with profiles.
 */
export async function fetchChannelMembers(
  channelId: string,
): Promise<TeamChannelMember[]> {
  try {
    const supabase = assertSupabase();

    const { data, error } = await supabase
      .from('team_channel_members')
      .select(`
        *,
        profile:profiles!team_channel_members_user_id_fkey(full_name, email, avatar_url, role)
      `)
      .eq('channel_id', channelId)
      .order('joined_at', { ascending: true });

    if (error) {
      logger.error('fetchChannelMembers', 'Failed:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    logger.error('fetchChannelMembers', 'Unexpected error:', err);
    return [];
  }
}

/**
 * Send a message to a channel.
 */
export async function sendTeamMessage(
  channelId: string,
  senderId: string,
  content: string,
  replyToId?: string,
): Promise<TeamMessage | null> {
  try {
    const supabase = assertSupabase();

    const { data, error } = await supabase
      .from('team_messages')
      .insert({
        channel_id: channelId,
        sender_id: senderId,
        content: content.trim(),
        content_type: 'text',
        reply_to_id: replyToId || null,
      })
      .select(`
        *,
        sender:profiles!team_messages_sender_id_fkey(full_name, avatar_url, role)
      `)
      .single();

    if (error) {
      logger.error('sendTeamMessage', 'Failed:', error);
      return null;
    }

    // Update last_read_at for sender
    await supabase
      .from('team_channel_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('channel_id', channelId)
      .eq('user_id', senderId);

    return data;
  } catch (err) {
    logger.error('sendTeamMessage', 'Unexpected error:', err);
    return null;
  }
}

/**
 * Mark a channel as read for a user.
 */
export async function markChannelRead(
  channelId: string,
  userId: string,
): Promise<void> {
  try {
    const supabase = assertSupabase();
    await supabase
      .from('team_channel_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('channel_id', channelId)
      .eq('user_id', userId);
  } catch (err) {
    logger.error('markChannelRead', 'Failed:', err);
  }
}

/**
 * Ensure the user is a member of the channel (auto-join for admins).
 */
export async function ensureChannelMembership(
  channelId: string,
  userId: string,
): Promise<void> {
  try {
    const supabase = assertSupabase();

    const { data: existing } = await supabase
      .from('team_channel_members')
      .select('id')
      .eq('channel_id', channelId)
      .eq('user_id', userId)
      .limit(1);

    if (existing && existing.length > 0) return;

    await supabase
      .from('team_channel_members')
      .insert({
        channel_id: channelId,
        user_id: userId,
        role: 'member',
      });
  } catch (err) {
    logger.error('ensureChannelMembership', 'Failed:', err);
  }
}
