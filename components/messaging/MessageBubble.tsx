/**
 * Message Bubble Component
 * WhatsApp-style chat bubble with voice support
 * Memoized to prevent flash on new messages
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Pressable, StyleSheet, Image, Dimensions, Linking, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { MessageTicks } from './MessageTicks';
import { ReplyBubbleQuote } from './ReplyBubbleQuote';
import { LinkedText } from './LinkedText';
import { formatTime, isVoiceNote, getVoiceNoteDuration, getSenderName } from './utils';
import { toast } from '@/components/ui/ToastProvider';
import { parseCallEventContent, type CallEventContent } from '@/lib/utils/messageContent';
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
  onReplyPress?: (messageId: string) => void;
  onCallEventPress?: (event: CallEventContent) => void;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
  /** Called when user taps a failed message to retry */
  onRetry?: (localId: string) => void;
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
  onReplyPress,
  onCallEventPress,
  isFirstInGroup = true,
  isLastInGroup = true,
  onRetry,
  translatedText,
  onToggleTranslation,
  showTranslation = false,
  transcriptionText,
  isTranscribing,
  onTranscribe,
}) => {
  const [fullScreenImageUrl, setFullScreenImageUrl] = useState<string | null>(null);
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
        <Text style={styles.name}>{name}</Text>
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
          style={styles.pressableBubble}
          onLongPress={onLongPress}
          delayLongPress={300}
        >
          <LinearGradient
            colors={isOwn ? ['#3b82f6', '#2563eb'] : ['#1e293b', '#0f172a']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.bubble,
              isOwn ? styles.bubbleOwn : styles.bubbleOther,
              isVoice && styles.voiceBubble,
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
            {callEvent ? (
              <View style={styles.callCard}>
                <View style={styles.callCardRow}>
                  <Ionicons
                    name={callEvent.callType === 'video' ? 'videocam-outline' : 'call-outline'}
                    size={18}
                    color={isOwn ? '#ffffff' : '#cbd5e1'}
                  />
                  <Text style={[styles.callCardTitle, { color: isOwn ? '#ffffff' : '#e2e8f0' }]}>
                    {callEvent.callType === 'video' ? 'Missed video call' : 'Missed call'}
                  </Text>
                </View>
                {!!callEvent.callerName && (
                  <Text style={[styles.callCardSubtitle, { color: isOwn ? 'rgba(255,255,255,0.75)' : '#94a3b8' }]}>
                    {callEvent.callerName}
                  </Text>
                )}
                {!!callEvent.callerId && !!onCallEventPress && (
                  <TouchableOpacity
                    style={[styles.callBackBtn, { backgroundColor: isOwn ? 'rgba(255,255,255,0.2)' : 'rgba(59,130,246,0.2)' }]}
                    onPress={() => onCallEventPress(callEvent)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="call" size={13} color={isOwn ? '#ffffff' : '#93c5fd'} />
                    <Text style={[styles.callBackText, { color: isOwn ? '#ffffff' : '#93c5fd' }]}>Call back</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : isVoice ? (
              <View style={styles.voiceContainer}>
                <View style={styles.voiceRow}>
                  <TouchableOpacity 
                    style={[styles.playBtn, isOwn ? styles.playBtnOwn : styles.playBtnOther]}
                    onPress={() => toast.info('Voice playback requires audio URL', 'Voice Note')}
                  >
                    <Ionicons name="play" size={20} color={isOwn ? '#3b82f6' : '#fff'} style={{ marginLeft: 2 }} />
                  </TouchableOpacity>
                  <View style={styles.waveformPlaceholder}>
                    {[...Array(24)].map((_, i) => (
                      <View 
                        key={i} 
                        style={[
                          styles.waveBar,
                          { 
                            height: 6 + (i % 5) * 3,
                            backgroundColor: isOwn ? 'rgba(255,255,255,0.5)' : 'rgba(148,163,184,0.6)',
                          }
                        ]} 
                      />
                    ))}
                  </View>
                  <Ionicons name="mic" size={14} color={isOwn ? 'rgba(255,255,255,0.6)' : '#64748b'} />
                </View>
                <Text style={[styles.voiceDuration, { color: isOwn ? 'rgba(255,255,255,0.7)' : '#64748b' }]}>
                  {Math.floor(getVoiceNoteDuration(msg.content) / 1000)}s
                </Text>
              </View>
            ) : (() => {
              const imageMatch = msg.content?.match(/\[image\]\((.+?)\)/);
              const videoMatch = msg.content?.match(/\[video\]\((.+?)\)/);
              const screenWidth = Dimensions.get('window').width;
              const maxMediaW = Math.min(screenWidth * 0.72, 280);
              const maxMediaH = 320;
              const mediaRadius = 12;
              if (imageMatch) {
                const imageUrl = imageMatch[1];
                const caption = msg.content.replace(/📷 Photo\n?/, '').replace(/\[image\]\(.+?\)/, '').trim();
                return (
                  <View style={styles.mediaWrap}>
                    <TouchableOpacity
                      activeOpacity={0.95}
                      onPress={() => imageUrl && setFullScreenImageUrl(imageUrl)}
                      style={[styles.mediaImageContainer, { maxWidth: maxMediaW, borderRadius: mediaRadius }]}
                    >
                      <Image
                        source={{ uri: imageUrl }}
                        style={[styles.mediaImage, { width: maxMediaW, height: Math.min(maxMediaW * 0.75, maxMediaH), borderRadius: mediaRadius }]}
                        resizeMode="cover"
                      />
                    </TouchableOpacity>
                    {caption ? (
                      <Text style={[styles.text, { color: isOwn ? '#ffffff' : '#e2e8f0', marginTop: 8 }]}>{caption}</Text>
                    ) : null}
                    <Modal
                      visible={!!fullScreenImageUrl}
                      transparent
                      animationType="fade"
                      onRequestClose={() => setFullScreenImageUrl(null)}
                    >
                      <Pressable style={styles.fullScreenOverlay} onPress={() => setFullScreenImageUrl(null)}>
                        <View style={styles.fullScreenImageWrap}>
                          <Image
                            source={{ uri: fullScreenImageUrl || '' }}
                            style={styles.fullScreenImage}
                            resizeMode="contain"
                          />
                        </View>
                        <TouchableOpacity
                          style={styles.fullScreenCloseBtn}
                          onPress={() => setFullScreenImageUrl(null)}
                          hitSlop={16}
                        >
                          <Ionicons name="close-circle" size={40} color="rgba(255,255,255,0.9)" />
                        </TouchableOpacity>
                      </Pressable>
                    </Modal>
                  </View>
                );
              }
              if (videoMatch) {
                const videoUrl = videoMatch[1];
                const caption = msg.content.replace(/🎬 Video\n?/, '').replace(/\[video\]\(.+?\)/, '').trim();
                return (
                  <View style={styles.mediaWrap}>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => videoUrl && Linking.openURL(videoUrl).catch(() => {})}
                      style={[styles.mediaVideoContainer, { width: maxMediaW, borderRadius: mediaRadius }]}
                    >
                      <View style={styles.mediaVideoPlaceholder}>
                        <Ionicons name="play-circle" size={56} color={isOwn ? 'rgba(255,255,255,0.9)' : '#94a3b8'} />
                        <Text style={[styles.mediaVideoLabel, { color: isOwn ? 'rgba(255,255,255,0.85)' : '#cbd5e1' }]}>Video</Text>
                      </View>
                    </TouchableOpacity>
                    {caption ? (
                      <Text style={[styles.text, { color: isOwn ? '#ffffff' : '#e2e8f0', marginTop: 8 }]}>{caption}</Text>
                    ) : null}
                  </View>
                );
              }
              return (
                <LinkedText
                  text={showTranslation && translatedText ? translatedText : msg.content}
                  style={[styles.text, { color: isOwn ? '#ffffff' : '#e2e8f0' }]}
                  linkColor={isOwn ? '#bbdefb' : '#93c5fd'}
                />
              );
            })()}
            {translatedText && (
              <TouchableOpacity
                style={styles.translationBadge}
                onPress={onToggleTranslation}
                activeOpacity={0.7}
              >
                <Text style={styles.translationBadgeIcon}>🌐</Text>
                <Text style={[styles.translationBadgeText, { color: isOwn ? 'rgba(255,255,255,0.6)' : '#64748b' }]}>
                  {showTranslation ? 'Show original' : 'Translated'}
                </Text>
              </TouchableOpacity>
            )}
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
                if (ids.length > 0 && onReactionLongPress && reaction.count > 1) {
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
         prevProps.translatedText === nextProps.translatedText &&
         prevProps.showTranslation === nextProps.showTranslation &&
         prevProps.transcriptionText === nextProps.transcriptionText &&
         prevProps.isTranscribing === nextProps.isTranscribing;
});

const styles = StyleSheet.create({
  container: {
    marginVertical: 2,
    paddingHorizontal: 0,
    width: '100%',
    maxWidth: '100%',
  },
  containerWithReactions: {
    marginBottom: 8,
  },
  groupedMessage: {
    marginVertical: 1,
  },
  bubbleMiddle: {
    borderTopRightRadius: 18,
    borderTopLeftRadius: 18,
  },
  own: {
    alignSelf: 'stretch',
    alignItems: 'flex-end',
  },
  other: {
    alignSelf: 'stretch',
    alignItems: 'flex-start',
  },
  pressableBubble: {
    maxWidth: '88%',
    flexShrink: 1,
  },
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    width: '100%',
  },
  bubbleRowOwn: {
    justifyContent: 'flex-end',
    paddingRight: 4,
  },
  bubbleRowOther: {
    justifyContent: 'flex-start',
    paddingLeft: 4,
  },
  senderAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 0,
    marginBottom: 2,
    flexShrink: 0,
  },
  senderAvatarText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#cbd5e1',
  },
  senderAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
  },
  senderAvatarSpacer: {
    width: 32,
  },
  voiceBubbleWrapper: {
    maxWidth: '84%',
    flexShrink: 1,
  },
  name: { 
    fontSize: 12, 
    fontWeight: '600', 
    marginBottom: 4, 
    marginLeft: 6,
    color: '#a78bfa',
  },
  bubble: { 
    borderRadius: 18, 
    paddingHorizontal: 14, 
    paddingVertical: 10,
    minWidth: 96,
    borderWidth: 1,
  },
  bubbleOwn: {
    borderTopRightRadius: 4,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 5,
    elevation: 1,
  },
  bubbleOther: {
    borderTopLeftRadius: 4,
    borderColor: 'rgba(148, 163, 184, 0.2)',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  voiceBubble: {
    minWidth: 260,
    maxWidth: 300,
    paddingVertical: 10,
    paddingHorizontal: 12,
    paddingRight: 14,
  },
  callCard: {
    minWidth: 220,
  },
  callCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  callCardTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  callCardSubtitle: {
    fontSize: 12,
    marginTop: 4,
  },
  callBackBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.22)',
  },
  callBackText: {
    fontSize: 12,
    fontWeight: '700',
  },
  mediaWrap: {
    marginTop: 2,
  },
  mediaImageContainer: {
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  mediaImage: {},
  mediaVideoContainer: {
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.2)',
    minHeight: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaVideoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    paddingHorizontal: 32,
  },
  mediaVideoLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
  },
  fullScreenOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenImageWrap: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenImage: {
    width: '100%',
    height: '100%',
  },
  fullScreenCloseBtn: {
    position: 'absolute',
    top: 48,
    right: 20,
    zIndex: 10,
  },
  voiceContainer: {
    marginBottom: 2,
  },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnOwn: {
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  playBtnOther: {
    backgroundColor: 'rgba(59,130,246,0.8)',
  },
  waveformPlaceholder: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 28,
    gap: 2,
  },
  waveBar: {
    width: 3,
    borderRadius: 2,
  },
  voiceDuration: {
    fontSize: 11,
    marginTop: 4,
    marginLeft: 46,
  },
  text: { fontSize: 16, lineHeight: 22 },
  footer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'flex-end', 
    marginTop: 4,
    gap: 4,
  },
  time: { fontSize: 11 },
  ticksContainer: { marginLeft: 2 },
  reactionsBelowBubble: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
    marginBottom: 2,
  },
  reactionsBelowOwn: {
    justifyContent: 'flex-end',
    marginRight: 8,
  },
  reactionsBelowOther: {
    justifyContent: 'flex-start',
    marginLeft: 8,
  },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(30, 41, 59, 0.95)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
    gap: 2,
  },
  reactionPillActive: {
    borderColor: 'rgba(59, 130, 246, 0.5)',
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
  },
  reactionEmoji: {
    fontSize: 14,
    lineHeight: 18,
  },
  reactionCount: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
  },
  forwardedLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 2,
    marginLeft: 12,
  },
  forwardedText: {
    fontSize: 11,
    fontStyle: 'italic',
    color: '#94a3b8',
  },
  editedLabel: {
    fontSize: 10,
    fontStyle: 'italic',
    marginRight: 2,
  },
  failedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  failedLabel: {
    fontSize: 11,
    color: '#ef4444',
    fontWeight: '600',
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
    opacity: 0.6,
  },
  pendingLabel: {
    fontSize: 11,
    color: '#94a3b8',
  },
  translationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(148, 163, 184, 0.2)',
  },
  translationBadgeIcon: {
    fontSize: 12,
  },
  translationBadgeText: {
    fontSize: 11,
    fontStyle: 'italic',
  },
});
