import React, { useEffect, useState } from 'react';
import { Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { messageComposerStyles as styles } from './styles';
import { ReplyPreview } from '@/components/messaging/ReplyPreview';
import type { Message } from '@/components/messaging/types';
import EduDashSpinner from '@/components/ui/EduDashSpinner';

interface ComposerTextEntryProps {
  text: string;
  replyingTo?: Message | null;
  isEditing: boolean;
  sending: boolean;
  disabled: boolean;
  placeholder: string;
  showEmojiPicker: boolean;
  showAssistBar: boolean;
  failedMessageCount: number;
  onCancelReply?: () => void;
  onToggleEmojiPicker: () => void;
  onChangeText: (value: string) => void;
  onFocusText: () => void;
  onCamera: () => void;
  onAttach: () => void;
  onToggleAssistBar: () => void;
  onSchedule?: () => void;
  onSend: () => void;
}

export function ComposerTextEntry({
  text,
  replyingTo,
  isEditing,
  sending,
  disabled,
  placeholder,
  showEmojiPicker,
  showAssistBar,
  failedMessageCount,
  onCancelReply,
  onToggleEmojiPicker,
  onChangeText,
  onFocusText,
  onCamera,
  onAttach,
  onToggleAssistBar,
  onSchedule,
  onSend,
}: ComposerTextEntryProps) {
  const [inputHeight, setInputHeight] = useState(24);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }

    const estimatedLines = text.split('\n').reduce((count, segment) => {
      const normalized = segment.trim().length > 0 ? segment.trim().length : segment.length;
      return count + Math.max(1, Math.ceil(Math.max(normalized, 1) / 26));
    }, 0);
    const nextHeight = Math.min(76, Math.max(22, 22 + (Math.max(estimatedLines, 1) - 1) * 17));
    setInputHeight(nextHeight);
  }, [text]);

  return (
    <>
      {failedMessageCount > 0 && (
        <View style={styles.failedBadge}>
          <Ionicons name="alert-circle" size={14} color="#fff" />
          <Text style={styles.failedBadgeText}>{failedMessageCount} failed</Text>
        </View>
      )}

      <View style={styles.inputWrapper}>
        {replyingTo && !isEditing && (
          <View style={styles.replyInsideInput}>
            <ReplyPreview message={replyingTo} onClose={() => onCancelReply?.()} />
          </View>
        )}

        <View style={styles.inputRow}>
          <TouchableOpacity
            style={styles.inlineBtnLeft}
            onPress={onToggleEmojiPicker}
            accessibilityLabel={showEmojiPicker ? 'Close emoji picker' : 'Open emoji picker'}
          >
            <Ionicons
              name={showEmojiPicker ? 'close-outline' : 'happy-outline'}
              size={22}
              color="rgba(255,255,255,0.65)"
            />
          </TouchableOpacity>

          <TextInput
            style={[
              styles.textInput,
              { height: inputHeight },
              Platform.OS === 'web'
                ? ({
                    backgroundColor: 'transparent',
                    outlineStyle: 'none',
                    outlineWidth: 0,
                    outlineColor: 'transparent',
                    boxShadow: 'none',
                    borderWidth: 0,
                    borderColor: 'transparent',
                  } as any)
                : null,
            ]}
            placeholder={placeholder}
            placeholderTextColor="rgba(255,255,255,0.55)"
            value={text}
            onChangeText={onChangeText}
            multiline
            maxLength={1000}
            editable={!sending && !disabled}
            onFocus={onFocusText}
            onContentSizeChange={(event) => {
              if (Platform.OS === 'web') {
                return;
              }
              const nextHeight = Math.min(76, Math.max(22, event.nativeEvent.contentSize.height));
              setInputHeight(nextHeight);
            }}
            scrollEnabled={inputHeight >= 82}
            underlineColorAndroid="transparent"
          />

          {!text.trim() && (
            <TouchableOpacity style={styles.inlineBtn} onPress={onCamera}>
              <Ionicons name="camera-outline" size={22} color="rgba(255,255,255,0.5)" />
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.inlineBtn} onPress={onAttach}>
            <Ionicons name="attach-outline" size={22} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
        </View>
      </View>

      {text.trim() && (
        <TouchableOpacity
          style={styles.sparkleButton}
          onPress={onToggleAssistBar}
          activeOpacity={0.7}
          accessibilityLabel={showAssistBar ? 'Close AI assist' : 'Open AI assist'}
        >
          <Ionicons
            name={showAssistBar ? 'sparkles' : 'sparkles-outline'}
            size={20}
            color={showAssistBar ? '#a78bfa' : 'rgba(255,255,255,0.5)'}
          />
        </TouchableOpacity>
      )}

      {text.trim() && onSchedule && (
        <TouchableOpacity
          style={styles.scheduleButton}
          onPress={onSchedule}
          activeOpacity={0.7}
          accessibilityLabel="Schedule message"
        >
          <Ionicons name="time-outline" size={20} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
      )}

      {text.trim() && (
        <TouchableOpacity style={styles.actionButton} onPress={onSend} disabled={sending} activeOpacity={0.8}>
          <LinearGradient colors={['#5c7cff', '#7c3aed', '#08c5ff']} style={styles.gradientButton}>
            {sending ? <EduDashSpinner size="small" color="#fff" /> : <Ionicons name="send" size={20} color="#fff" />}
          </LinearGradient>
        </TouchableOpacity>
      )}
    </>
  );
}

export default ComposerTextEntry;
