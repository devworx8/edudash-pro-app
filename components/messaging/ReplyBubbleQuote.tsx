/**
 * ReplyBubbleQuote Component
 * Renders the quoted reply preview inside a message bubble.
 * Tappable to scroll to the original message.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { getMessageDisplayText } from '@/lib/utils/messageContent';
import type { Message } from './types';

interface ReplyBubbleQuoteProps {
  replyTo: NonNullable<Message['reply_to']>;
  isOwn: boolean;
  onPress?: () => void;
}

/** Format reply content with type-aware prefix */
function getReplyPreview(content: string, contentType?: string): string {
  if (contentType === 'voice' || content?.startsWith('🎤')) return '🎤 Voice message';
  if (contentType === 'image' || content?.match(/\[image\]/)) return '📷 Photo';
  if (contentType === 'file') return '📎 File';
  return getMessageDisplayText(content || '');
}

export const ReplyBubbleQuote: React.FC<ReplyBubbleQuoteProps> = React.memo(({
  replyTo,
  isOwn,
  onPress,
}) => {
  const senderName = replyTo.sender
    ? `${replyTo.sender.first_name || ''} ${replyTo.sender.last_name || ''}`.trim() || 'Original message'
    : 'Original message';

  const preview = getReplyPreview(replyTo.content, replyTo.content_type);

  return (
    <TouchableOpacity
      style={[
        styles.container,
        { borderLeftColor: isOwn ? '#8fe8ff' : '#b994ff' },
        { backgroundColor: isOwn ? 'rgba(255,255,255,0.1)' : 'rgba(148,163,184,0.1)' },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={!onPress}
    >
      <Text
        style={[styles.senderName, { color: isOwn ? '#93c5fd' : '#c4b5fd' }]}
        numberOfLines={1}
      >
        {senderName}
      </Text>
      <Text
        style={[styles.preview, { color: isOwn ? 'rgba(255,255,255,0.7)' : 'rgba(226,232,240,0.7)' }]}
        numberOfLines={1}
      >
        {preview}
      </Text>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    borderLeftWidth: 3,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 6,
  },
  senderName: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 1,
  },
  preview: {
    fontSize: 12,
    fontStyle: 'italic',
  },
});
