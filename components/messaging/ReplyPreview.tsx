/**
 * Reply Preview Component
 * Shows quoted message above the input bar when replying.
 * Media-aware: voice, image, file types show appropriate icons.
 * Slide-down entrance animation.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getMessageDisplayText } from '@/lib/utils/messageContent';
import type { Message } from './types';

interface ReplyPreviewProps {
  message: Message;
  onClose: () => void;
}

/** Determine content type + preview text */
function getMediaPreview(message: Message): { icon: string; text: string; color: string } {
  const ct = message.content_type;
  if (ct === 'voice' || message.voice_url) {
    const dur = message.voice_duration
      ? `${Math.floor(message.voice_duration / 60000)}:${String(Math.floor((message.voice_duration % 60000) / 1000)).padStart(2, '0')}`
      : '';
    return { icon: 'mic', text: `Voice message ${dur}`.trim(), color: '#a78bfa' };
  }
  if (ct === 'image' || message.content?.match(/\[image\]/i)) {
    return { icon: 'image', text: 'Photo', color: '#34d399' };
  }
  if (ct === 'file') {
    return { icon: 'document-attach', text: 'File', color: '#f59e0b' };
  }
  const displayText = getMessageDisplayText(message.content || '');
  if (displayText.startsWith('📞') || displayText.startsWith('📹')) {
    return { icon: 'call', text: displayText.replace(/^[^\s]+\s*/, ''), color: '#7dd3fc' };
  }
  if (displayText.startsWith('✨')) {
    return { icon: 'sparkles', text: 'GIF', color: '#f8ca59' };
  }
  if (displayText.startsWith('🎬')) {
    return { icon: 'play-circle', text: 'Video', color: '#93c5fd' };
  }
  return { icon: '', text: displayText, color: '' };
}

export const ReplyPreview: React.FC<ReplyPreviewProps> = React.memo(({ message, onClose }) => {
  const slideAnim = useRef(new Animated.Value(-40)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 200,
        friction: 20,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
  }, [slideAnim, opacityAnim]);

  const senderName = message.sender?.first_name
    ? `${message.sender.first_name} ${message.sender.last_name || ''}`.trim()
    : 'message';

  const media = getMediaPreview(message);
  const isMedia = !!media.icon;

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ translateY: slideAnim }], opacity: opacityAnim },
      ]}
    >
      {/* Accent bar */}
      <View style={styles.accentBar} />

      {/* Avatar circle */}
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {senderName.charAt(0).toUpperCase()}
        </Text>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.label} numberOfLines={1}>
          Replying to {senderName}
        </Text>
        <View style={styles.previewRow}>
          {isMedia && (
            <Ionicons
              name={media.icon as any}
              size={14}
              color={media.color}
              style={styles.mediaIcon}
            />
          )}
          <Text numberOfLines={1} style={[styles.text, isMedia && { color: media.color }]}>
            {media.text}
          </Text>
        </View>
      </View>

      {/* Close button */}
      <TouchableOpacity
        onPress={onClose}
        style={styles.closeBtn}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <View style={styles.closeBg}>
          <Ionicons name="close" size={16} color="#94a3b8" />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    paddingLeft: 0,
    backgroundColor: 'rgba(17, 27, 55, 0.84)',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(125, 211, 252, 0.16)',
  },
  accentBar: {
    width: 3,
    alignSelf: 'stretch',
    backgroundColor: '#7c5cff',
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    marginRight: 8,
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(99, 102, 241, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  avatarText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#a5b4fc',
  },
  content: {
    flex: 1,
  },
  label: {
    fontSize: 12,
    color: '#b7a7ff',
    fontWeight: '600',
    marginBottom: 2,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mediaIcon: {
    marginRight: 5,
  },
  text: {
    fontSize: 13,
    color: '#b7c5e4',
    flex: 1,
  },
  closeBtn: {
    padding: 4,
    marginLeft: 6,
  },
  closeBg: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
