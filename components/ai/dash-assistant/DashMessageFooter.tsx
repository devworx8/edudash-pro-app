import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import type { DashMessage } from '@/services/dash-ai/types';
import { messageStyles as styles } from './styles/message.styles';

/** Small inline waveform bars that animate while Dash is speaking this message. */
function SpeakingWaveIndicator({ color }: { color: string }) {
  const bar1 = useRef(new Animated.Value(0.3)).current;
  const bar2 = useRef(new Animated.Value(0.6)).current;
  const bar3 = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const animate = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, { toValue: 1, duration: 300, delay, useNativeDriver: true }),
          Animated.timing(val, { toValue: 0.3, duration: 300, useNativeDriver: true }),
        ]),
      );
    const a1 = animate(bar1, 0);
    const a2 = animate(bar2, 100);
    const a3 = animate(bar3, 200);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, [bar1, bar2, bar3]);

  const barStyle = (anim: Animated.Value) => ({
    width: 2,
    height: 10,
    borderRadius: 1,
    backgroundColor: color,
    marginHorizontal: 0.5,
    transform: [{ scaleY: anim }],
  });

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: 12, marginLeft: 4 }}>
      <Animated.View style={barStyle(bar1)} />
      <Animated.View style={barStyle(bar2)} />
      <Animated.View style={barStyle(bar3)} />
    </View>
  );
}

interface DashMessageFooterProps {
  message: DashMessage;
  isUser: boolean;
  speakingMessageId: string | null;
  voiceEnabled: boolean;
  isLastUserMessage: boolean;
  isLoading: boolean;
  inlineActionUrl: string | null;
  inlineActionIsPdf: boolean;
  onSpeak: (message: DashMessage) => void;
  onRetry: (content: string) => void;
  onInlineAction: () => void;
}

export const DashMessageFooter: React.FC<DashMessageFooterProps> = ({
  message,
  isUser,
  speakingMessageId,
  voiceEnabled,
  isLastUserMessage,
  isLoading,
  inlineActionUrl,
  inlineActionIsPdf,
  onSpeak,
  onRetry,
  onInlineAction,
}) => {
  const { theme } = useTheme();
  const canRetryLastUserMessage =
    isUser &&
    isLastUserMessage &&
    !isLoading &&
    !(message.attachments?.length > 0) &&
    String(message.content || '').trim().length > 0;

  return (
    <>
      {/* PDF/Link quick action */}
      {!isUser && inlineActionUrl && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 }}>
          <TouchableOpacity
            style={[styles.inlineSpeakButton, { backgroundColor: inlineActionIsPdf ? theme.primary : theme.accent }]}
            onPress={onInlineAction}
            accessibilityLabel={inlineActionIsPdf ? 'Open PDF' : 'Open link'}
            activeOpacity={0.8}
          >
            <Ionicons name={inlineActionIsPdf ? 'document' : 'open-outline'} size={12} color={theme.onAccent || '#fff'} />
          </TouchableOpacity>
          <Text style={{ color: theme.textSecondary, fontSize: 12 }} numberOfLines={1}>
            {inlineActionIsPdf ? 'Preview PDF' : 'Open link'}
          </Text>
        </View>
      )}

      {/* Bottom row: speak, retry, timestamp */}
      <View style={styles.messageBubbleFooter}>
        {!isUser && (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity
              style={[styles.inlineSpeakButton, { backgroundColor: speakingMessageId === message.id ? theme.error : theme.accent, opacity: voiceEnabled ? 1 : 0.5 }]}
              onPress={() => onSpeak(message)}
              disabled={!voiceEnabled}
              activeOpacity={0.7}
              accessibilityLabel={speakingMessageId === message.id ? 'Stop audio' : 'Play audio'}
            >
              <Ionicons name={speakingMessageId === message.id ? 'stop' : 'play'} size={12} color={speakingMessageId === message.id ? theme.onError || theme.background : theme.onAccent} />
            </TouchableOpacity>
            {speakingMessageId === message.id && (
              <SpeakingWaveIndicator color={theme.primary} />
            )}
          </View>
        )}
        {canRetryLastUserMessage && (
          <TouchableOpacity
            style={[styles.inlineFooterRetryButton, { backgroundColor: 'rgba(255,255,255,0.2)', borderColor: 'rgba(255,255,255,0.32)' }]}
            onPress={() => onRetry(message.content)}
            accessibilityLabel="Retry last message"
            activeOpacity={0.78}
          >
            <Ionicons name="refresh" size={12} color={theme.onPrimary} />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }} />
        <Text style={[styles.messageTime, { color: isUser ? 'rgba(255,255,255,0.72)' : theme.textTertiary }]}>
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </>
  );
};
