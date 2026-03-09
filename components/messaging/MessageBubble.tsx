/**
 * Message Bubble Component
 * WhatsApp-style chat bubble with voice support
 * Memoized to prevent flash on new messages
 */

import React from 'react';
import { View, Text, TouchableOpacity, Pressable, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { MessageTicks } from './MessageTicks';
import { MessageBubbleContent } from './message-bubble/MessageBubbleContent';
import { ReplyBubbleQuote } from './ReplyBubbleQuote';
import { formatTime, isVoiceNote, getVoiceNoteDuration, getSenderName } from './utils';
import { parseCallEventContent, parseMessageContent, type CallEventContent } from '@/lib/utils/messageContent';
import {
  messageBubbleStyles as styles,
  OTHER_BUBBLE_COLORS,
  OWN_BUBBLE_COLORS,
} from './message-bubble/styles';
import type { Message, MessageStatus } from './types';

// Try to import VoiceMessageBubble
let VoiceMessageBubble: React.FC<any> | null = null;
try {
  VoiceMessageBubble = require('@/components/messaging/VoiceMessageBubble').VoiceMessageBubble;
} catch {}

interface MessageBubbleProps {
  msg: Message;
  isOwn: boolean;
  showSenderName?: boolean;
  showSenderAvatar?: boolean;
  onLongPress: () => void;
  onPlaybackFinished?: () => void;
  onPlayNext?: () => void;
  onPlayPrevious?: () => void;
  hasNextVoice?: boolean;
  hasPreviousVoice?: boolean;
  autoPlayVoice?: boolean;
  otherParticipantIds?: string[];
  onReactionPress?: (messageId: string, emoji: string) => void;
  onReactionLongPress?: (messageId: string, emoji: string, reactedByUserIds: string[]) => void;
  showReactionDetailsOnPress?: boolean;
  onReplyPress?: (messageId: string) => void;
  onCallEventPress?: (event: CallEventContent) => void;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
  /** Called when user taps a failed message to retry */
  onRetry?: (localId: string) => void;
  /** Tap handler for "Seen by X of Y" in group messages */
  onSeenByPress?: (messageId: string) => void;
  translatedText?: string;
  onToggleTranslation?: () => void;
  showTranslation?: boolean;
  transcriptionText?: string;
  isTranscribing?: boolean;
  onTranscribe?: () => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = React.memo(({ 
  msg, 
  isOwn, 
  showSenderName = true,
  showSenderAvatar = false,
  onLongPress,
  onPlaybackFinished,
  onPlayNext,
  onPlayPrevious,
  hasNextVoice = false,
  hasPreviousVoice = false,
  autoPlayVoice = false,
  otherParticipantIds = [],
  onReactionPress,
  onReactionLongPress,
  showReactionDetailsOnPress = false,
  onReplyPress,
  onCallEventPress,
  isFirstInGroup = true,
  isLastInGroup = true,
  onRetry,
  onSeenByPress,
  translatedText,
  onToggleTranslation,
  showTranslation = false,
  transcriptionText,
  isTranscribing,
  onTranscribe,
}) => {
  const name = getSenderName(msg.sender);
  const avatarInitials = React.useMemo(() => {
    const first = String(msg.sender?.first_name || '').trim();
    const last = String(msg.sender?.last_name || '').trim();
    const initials = `${first.charAt(0)}${last.charAt(0)}`.trim().toUpperCase();
    if (initials) return initials;
    return name ? name.charAt(0).toUpperCase() : '?';
  }, [msg.sender?.first_name, msg.sender?.last_name, name]);
  const avatarUrl = String(msg.sender?.avatar_url || '').trim();
  const callEvent = parseCallEventContent(msg.content);
  const parsedContent = parseMessageContent(msg.content);
  const isMediaMessage = parsedContent.kind === 'media';
  const hasMediaCaption = parsedContent.kind === 'media'
    ? Boolean(parsedContent.caption?.trim())
    : false;
  const hasWideRichCard = isMediaMessage || !!callEvent;

  // Determine message status for ticks
  const getMessageStatus = (): MessageStatus => {
    // Only show ticks for own messages
    if (!isOwn) return 'sent';
    
    // Check if message is still being sent (temp ID or no ID yet)
    if (!msg.id || msg.id.startsWith('temp-')) {
      return 'sending';
    }
    
    // Check if read by any OTHER user (exclude sender's own ID)
    // mark_thread_messages_as_read adds the reader's ID to read_by, which can
    // include the sender if they call markRead on their own thread.
    const readByOthers = (msg.read_by || []).filter((id: string) => id !== msg.sender_id);
    if (readByOthers.length > 0) return 'read';
    
    // Check if delivered to recipient's device (double grey ticks)
    // delivered_at is set when recipient comes online and receives the message
    const isDelivered = !!msg.delivered_at;
    if (isDelivered) return 'delivered';
    
    // Message sent to server but not yet delivered (single grey tick)
    // This happens when recipient is offline
    return 'sent';
  };

  const status = getMessageStatus();
  const isVoice = isVoiceNote(msg.content) || msg.voice_url;

  // For voice messages with actual audio URL, use the VoiceMessageBubble
  if (isVoice && msg.voice_url && VoiceMessageBubble) {
    return (
      <View style={[styles.container, isOwn ? styles.own : styles.other]}>
        <View style={[styles.bubbleRow, isOwn ? styles.bubbleRowOwn : styles.bubbleRowOther]}>
          {!isOwn && showSenderAvatar && (
            isFirstInGroup ? (
              <View style={styles.senderAvatar}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.senderAvatarImage} />
                ) : (
                  <Text style={styles.senderAvatarText}>{avatarInitials}</Text>
                )}
              </View>
            ) : (
              <View style={styles.senderAvatarSpacer} />
            )
          )}
          <View style={styles.voiceBubbleWrapper}>
            <VoiceMessageBubble
              audioUrl={msg.voice_url}
              duration={
                msg.voice_duration 
                  ? (msg.voice_duration < 1000 ? msg.voice_duration * 1000 : msg.voice_duration)
                  : getVoiceNoteDuration(msg.content)
              }
              isOwnMessage={isOwn}
              timestamp={formatTime(msg.created_at)}
              senderName={!isOwn && showSenderName && name ? name : undefined}
              isRead={msg.read_by?.some(id => otherParticipantIds.includes(id))}
              onLongPress={onLongPress}
              onPlaybackFinished={onPlaybackFinished}
              onPlayNext={onPlayNext}
              onPlayPrevious={onPlayPrevious}
              hasNext={hasNextVoice}
              hasPrevious={hasPreviousVoice}
              autoPlay={autoPlayVoice}
              reactions={msg.reactions}
              messageId={msg.id}
              onReactionPress={onReactionPress}
              onReactionLongPress={onReactionLongPress ? (emoji, ids) => onReactionLongPress(msg.id, emoji, ids) : undefined}
              showReactionDetailsOnPress={showReactionDetailsOnPress}
              transcriptionText={transcriptionText}
              isTranscribing={isTranscribing}
              onTranscribe={onTranscribe}
            />
          </View>
        </View>
      </View>
    );
  }

  // Get all reactions with counts > 0
  const activeReactions = msg.reactions?.filter(r => r.count > 0) || [];

  return (
    <View style={[
      styles.container,
      activeReactions.length > 0 && styles.containerWithReactions,
      isOwn ? styles.own : styles.other,
      !isFirstInGroup && styles.groupedMessage,
    ]}>
      {!isOwn && showSenderName && isFirstInGroup && !!name && (
        <View style={styles.senderRow}>
          <Text style={styles.name}>{name}</Text>
          {msg.sender?.role && ['teacher', 'principal', 'principal_admin', 'admin'].includes(msg.sender.role) && (
            <View style={[styles.roleBadge, {
              backgroundColor: msg.sender.role === 'teacher' ? '#dbeafe' : '#ede9fe',
            }]}>
              <Text style={[styles.roleBadgeText, {
                color: msg.sender.role === 'teacher' ? '#2563eb' : '#7c3aed',
              }]}>
                {msg.sender.role === 'teacher' ? 'Teacher' : 'Principal'}
              </Text>
            </View>
          )}
        </View>
      )}
      {msg.forwarded_from_id && (
        <View style={styles.forwardedLabel}>
          <Ionicons name="arrow-redo" size={11} color="#94a3b8" />
          <Text style={styles.forwardedText}>Forwarded</Text>
        </View>
      )}
      <View style={[styles.bubbleRow, isOwn ? styles.bubbleRowOwn : styles.bubbleRowOther]}>
        {!isOwn && showSenderAvatar && (
          isFirstInGroup ? (
            <View style={styles.senderAvatar}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.senderAvatarImage} />
              ) : (
                <Text style={styles.senderAvatarText}>{avatarInitials}</Text>
              )}
            </View>
          ) : (
            <View style={styles.senderAvatarSpacer} />
          )
        )}
        <Pressable
          style={[styles.pressableBubble, hasWideRichCard && styles.pressableBubbleWide]}
          onLongPress={onLongPress}
          delayLongPress={300}
        >
          <LinearGradient
            colors={isOwn ? OWN_BUBBLE_COLORS : OTHER_BUBBLE_COLORS}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0.92 }}
            style={[
              styles.bubble,
              isOwn ? styles.bubbleOwn : styles.bubbleOther,
              isVoice && styles.voiceBubble,
              hasWideRichCard && styles.richCardBubble,
              isMediaMessage && styles.mediaBubble,
              isMediaMessage && !hasMediaCaption && styles.mediaBubbleTight,
              !isLastInGroup && styles.bubbleMiddle,
            ]}
          >
            {/* Reply-to quote */}
            {msg.reply_to && (
              <ReplyBubbleQuote
                replyTo={msg.reply_to}
                isOwn={isOwn}
                onPress={msg.reply_to_id ? () => onReplyPress?.(msg.reply_to_id!) : undefined}
              />
            )}
            <MessageBubbleContent
              content={msg.content}
              isOwn={isOwn}
              callEvent={callEvent}
              parsedContent={parsedContent}
              translatedText={translatedText}
              showTranslation={showTranslation}
              onToggleTranslation={onToggleTranslation}
              onCallEventPress={onCallEventPress}
            />
            {/* Failed / Pending indicators */}
            {msg._failed && (
              <TouchableOpacity
                style={styles.failedRow}
                onPress={() => msg._localId && onRetry?.(msg._localId)}
                activeOpacity={0.7}
              >
                <Ionicons name="alert-circle" size={14} color="#ef4444" />
                <Text style={styles.failedLabel}>
                  {(msg as Message & { retryCount?: number }).retryCount !== undefined &&
                  (msg as Message & { retryCount?: number }).retryCount! >= 3
                    ? 'Failed to send. Tap to retry or delete.'
                    : 'Tap to retry'}
                </Text>
              </TouchableOpacity>
            )}
            {msg._pending && !msg._failed && (
              <View style={styles.pendingRow}>
                <Ionicons name="time-outline" size={12} color="#94a3b8" />
                <Text style={styles.pendingLabel}>Sending…</Text>
              </View>
            )}
            <View style={styles.footer}>
              {msg.edited_at && (
                <Text style={[styles.editedLabel, { color: isOwn ? 'rgba(255,255,255,0.5)' : '#64748b' }]}>edited</Text>
              )}
              <Text style={[styles.time, { color: isOwn ? 'rgba(255,255,255,0.7)' : '#64748b' }]}>
                {formatTime(msg.created_at)}
              </Text>
              {isOwn && !msg._failed && (
                <View style={styles.ticksContainer}>
                  <MessageTicks status={status} />
                </View>
              )}
              {isOwn && msg._failed && (
                <Ionicons name="alert-circle" size={14} color="#ef4444" style={{ marginLeft: 2 }} />
              )}
            </View>
            {/* Seen by X of Y — group messages owned by sender */}
            {isOwn && otherParticipantIds.length > 1 && !msg._pending && !msg._failed && (() => {
              const readByOthers = (msg.read_by || []).filter((id: string) => otherParticipantIds.includes(id));
              if (readByOthers.length === 0) return null;
              return (
                <TouchableOpacity
                  style={styles.seenByRow}
                  onPress={() => onSeenByPress?.(msg.id)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="eye-outline" size={11} color="rgba(255,255,255,0.5)" />
                  <Text style={styles.seenByText}>
                    Seen by {readByOthers.length} of {otherParticipantIds.length}
                  </Text>
                </TouchableOpacity>
              );
            })()}
          </LinearGradient>
        </Pressable>
      </View>
      
      {/* Reaction display below bubble - show all reactions with counts */}
      {activeReactions.length > 0 && (
        <View
          style={[
            styles.reactionsBelowBubble,
            isOwn ? styles.reactionsBelowOwn : styles.reactionsBelowOther
          ]}
        >
          {activeReactions.map((reaction) => (
            <TouchableOpacity
              key={reaction.emoji}
              style={[
                styles.reactionPill,
                reaction.hasReacted && styles.reactionPillActive
              ]}
              onPress={() => {
                const ids = reaction.reactedByUserIds ?? [];
                if (showReactionDetailsOnPress && ids.length > 0 && onReactionLongPress) {
                  onReactionLongPress(msg.id, reaction.emoji, ids);
                  return;
                }
                onReactionPress?.(msg.id, reaction.emoji);
              }}
              onLongPress={() => {
                const ids = reaction.reactedByUserIds ?? [];
                if (ids.length > 0 && onReactionLongPress) onReactionLongPress(msg.id, reaction.emoji, ids);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.reactionEmoji}>{reaction.emoji}</Text>
              {reaction.count > 1 && (
                <Text style={styles.reactionCount}>{reaction.count}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}, (prevProps, nextProps) => {
  return prevProps.msg.id === nextProps.msg.id &&
         prevProps.isOwn === nextProps.isOwn &&
         prevProps.showSenderName === nextProps.showSenderName &&
         prevProps.showSenderAvatar === nextProps.showSenderAvatar &&
         prevProps.msg.content === nextProps.msg.content &&
         JSON.stringify(prevProps.msg.read_by) === JSON.stringify(nextProps.msg.read_by) &&
         prevProps.msg.delivered_at === nextProps.msg.delivered_at &&
         prevProps.msg.forwarded_from_id === nextProps.msg.forwarded_from_id &&
         prevProps.msg.edited_at === nextProps.msg.edited_at &&
         prevProps.msg.reply_to_id === nextProps.msg.reply_to_id &&
         (prevProps.msg.reply_to?.id ?? null) === (nextProps.msg.reply_to?.id ?? null) &&
         (prevProps.msg.reply_to?.content ?? null) === (nextProps.msg.reply_to?.content ?? null) &&
         (prevProps.msg.reply_to?.sender?.first_name ?? null) === (nextProps.msg.reply_to?.sender?.first_name ?? null) &&
         (prevProps.msg.reply_to?.sender?.last_name ?? null) === (nextProps.msg.reply_to?.sender?.last_name ?? null) &&
         prevProps.isFirstInGroup === nextProps.isFirstInGroup &&
         prevProps.isLastInGroup === nextProps.isLastInGroup &&
         prevProps.msg._failed === nextProps.msg._failed &&
         prevProps.msg._pending === nextProps.msg._pending &&
         JSON.stringify(prevProps.msg.reactions) === JSON.stringify(nextProps.msg.reactions) &&
         prevProps.showReactionDetailsOnPress === nextProps.showReactionDetailsOnPress &&
         prevProps.translatedText === nextProps.translatedText &&
         prevProps.showTranslation === nextProps.showTranslation &&
         prevProps.transcriptionText === nextProps.transcriptionText &&
         prevProps.isTranscribing === nextProps.isTranscribing;
});
