import React, { useState } from 'react';
import { Dimensions, Image, Linking, Modal, Pressable, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { LinkedText } from '@/components/messaging/LinkedText';
import { toast } from '@/components/ui/ToastProvider';
import { getVoiceNoteDuration } from '@/components/messaging/utils';
import type { CallEventContent, RichMessageContent } from '@/lib/utils/messageContent';
import { messageBubbleContentStyles as styles } from './contentStyles';
import { OTHER_CALL_BUTTON_COLORS, OWN_CALL_BUTTON_COLORS } from './styles';

interface MessageBubbleContentProps {
  content: string;
  isOwn: boolean;
  callEvent: CallEventContent | null;
  parsedContent: RichMessageContent;
  translatedText?: string;
  showTranslation: boolean;
  onToggleTranslation?: () => void;
  onCallEventPress?: (event: CallEventContent) => void;
}

export function MessageBubbleContent({
  content,
  isOwn,
  callEvent,
  parsedContent,
  translatedText,
  showTranslation,
  onToggleTranslation,
  onCallEventPress,
}: MessageBubbleContentProps) {
  const [fullScreenImageUrl, setFullScreenImageUrl] = useState<string | null>(null);
  const mediaContent = parsedContent.kind === 'media' ? parsedContent : null;
  const mediaCaption = mediaContent?.caption;
  const screenWidth = Dimensions.get('window').width;
  const maxMediaWidth = Math.min(screenWidth * 0.88, 338);
  const maxMediaHeight = 340;
  const mediaRadius = 16;
  const mediaHeight = Math.min(Math.max(maxMediaWidth * 0.88, 228), maxMediaHeight);

  if (callEvent) {
    return (
      <View style={styles.callCard}>
        <View style={[styles.callAccentRing, isOwn ? styles.callAccentRingOwn : styles.callAccentRingOther]} />
        <View style={styles.callCardRow}>
          <Ionicons
            name={callEvent.callType === 'video' ? 'videocam-outline' : 'call-outline'}
            size={18}
            color={isOwn ? '#ffffff' : '#8fe8ff'}
          />
          <Text style={[styles.callCardTitle, { color: isOwn ? '#ffffff' : '#e2e8f0' }]}>
            {callEvent.callType === 'video' ? 'Missed video call' : 'Missed call'}
          </Text>
        </View>
        {!!callEvent.callerName && (
          <Text style={[styles.callCardSubtitle, { color: isOwn ? 'rgba(255,255,255,0.8)' : '#b9c6f9' }]}>
            {callEvent.callerName}
          </Text>
        )}
        {!!callEvent.callerId && !!onCallEventPress && (
          <LinearGradient
            colors={isOwn ? OWN_CALL_BUTTON_COLORS : OTHER_CALL_BUTTON_COLORS}
            style={styles.callBackButtonWrap}
          >
            <TouchableOpacity
              style={styles.callBackBtn}
              onPress={() => onCallEventPress(callEvent)}
              activeOpacity={0.85}
            >
              <Ionicons name="call" size={13} color={isOwn ? '#ffffff' : '#8fe8ff'} />
              <Text style={[styles.callBackText, { color: isOwn ? '#ffffff' : '#8fe8ff' }]}>Call back</Text>
            </TouchableOpacity>
          </LinearGradient>
        )}
      </View>
    );
  }

  if (content.startsWith('🎤 Voice')) {
    return (
      <View style={styles.voiceContainer}>
        <View style={styles.voiceRow}>
          <TouchableOpacity
            style={[styles.playBtn, isOwn ? styles.playBtnOwn : styles.playBtnOther]}
            onPress={() => toast.info('Voice playback requires audio URL', 'Voice Note')}
          >
            <Ionicons name="play" size={20} color={isOwn ? '#3b82f6' : '#fff'} style={{ marginLeft: 2 }} />
          </TouchableOpacity>
          <View style={styles.waveformPlaceholder}>
            {[...Array(24)].map((_, index) => (
              <View
                key={index}
                style={[
                  styles.waveBar,
                  {
                    height: 6 + (index % 5) * 3,
                    backgroundColor: isOwn ? 'rgba(255,255,255,0.5)' : 'rgba(148,163,184,0.6)',
                  },
                ]}
              />
            ))}
          </View>
          <Ionicons name="mic" size={14} color={isOwn ? 'rgba(255,255,255,0.6)' : '#64748b'} />
        </View>
        <Text style={[styles.voiceDuration, { color: isOwn ? 'rgba(255,255,255,0.7)' : '#64748b' }]}>
          {Math.floor(getVoiceNoteDuration(content) / 1000)}s
        </Text>
      </View>
    );
  }

  if (mediaContent && (mediaContent.mediaType === 'image' || mediaContent.mediaType === 'gif')) {
    return (
      <View style={styles.mediaWrap}>
        <TouchableOpacity
          activeOpacity={0.95}
          onPress={() => setFullScreenImageUrl(mediaContent.url)}
          style={[
            styles.mediaImageContainer,
            isOwn ? styles.mediaImageContainerOwn : styles.mediaImageContainerOther,
            { minHeight: mediaHeight, borderRadius: mediaRadius },
          ]}
        >
          <Image
            source={{ uri: mediaContent.url }}
            style={{ width: '100%', height: mediaHeight, borderRadius: mediaRadius }}
            resizeMode="cover"
          />
          {mediaContent.mediaType === 'gif' && (
            <LinearGradient colors={['rgba(15, 23, 42, 0.9)', 'rgba(91, 33, 182, 0.88)']} style={styles.mediaBadge}>
              <Text style={styles.mediaBadgeText}>GIF</Text>
            </LinearGradient>
          )}
        </TouchableOpacity>
        {mediaCaption ? (
          <Text style={[styles.text, { color: isOwn ? '#ffffff' : '#e2e8f0', marginTop: 6 }]}>{mediaCaption}</Text>
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
            <TouchableOpacity style={styles.fullScreenCloseBtn} onPress={() => setFullScreenImageUrl(null)} hitSlop={16}>
              <Ionicons name="close-circle" size={40} color="rgba(255,255,255,0.9)" />
            </TouchableOpacity>
          </Pressable>
        </Modal>
      </View>
    );
  }

  if (mediaContent?.mediaType === 'video') {
    return (
      <View style={styles.mediaWrap}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => Linking.openURL(mediaContent.url).catch(() => {})}
          style={[
            styles.mediaVideoContainer,
            isOwn ? styles.mediaVideoContainerOwn : styles.mediaVideoContainerOther,
            { minHeight: mediaHeight, borderRadius: mediaRadius },
          ]}
        >
          <View style={styles.mediaVideoPlaceholder}>
            <LinearGradient colors={['rgba(59,130,246,0.35)', 'rgba(139,92,246,0.25)']} style={styles.mediaVideoIconWrap}>
              <Ionicons name="play-circle" size={56} color={isOwn ? 'rgba(255,255,255,0.95)' : '#b9c6f9'} />
            </LinearGradient>
            <Text style={[styles.mediaVideoLabel, { color: isOwn ? 'rgba(255,255,255,0.88)' : '#d8defd' }]}>Video</Text>
          </View>
        </TouchableOpacity>
        {mediaCaption ? (
          <Text style={[styles.text, { color: isOwn ? '#ffffff' : '#e2e8f0', marginTop: 6 }]}>{mediaCaption}</Text>
        ) : null}
      </View>
    );
  }

  return (
    <>
      <LinkedText
        text={showTranslation && translatedText ? translatedText : parsedContent.kind === 'text' ? parsedContent.text : content}
        style={[styles.text, { color: isOwn ? '#ffffff' : '#e2e8f0' }]}
        linkColor={isOwn ? '#d8f0ff' : '#7dd3fc'}
      />
      {translatedText && (
        <TouchableOpacity style={styles.translationBadge} onPress={onToggleTranslation} activeOpacity={0.7}>
          <Text style={styles.translationBadgeIcon}>🌐</Text>
          <Text style={[styles.translationBadgeText, { color: isOwn ? 'rgba(255,255,255,0.6)' : '#64748b' }]}>
            {showTranslation ? 'Show original' : 'Translated'}
          </Text>
        </TouchableOpacity>
      )}
    </>
  );
}

export default MessageBubbleContent;
