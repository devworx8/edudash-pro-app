/**
 * DashVoiceComposer — Text input bar for Dash Voice.
 *
 * Extracted from app/screens/dash-voice.tsx as part of the WARP refactor.
 */

import React from 'react';
import { View, TextInput, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { s } from '@/app/screens/dash-voice.styles';

const VOICE_COMPOSER_COMPACT_HEIGHT = 44;
const VOICE_COMPOSER_GROW_THRESHOLD = 60;
const VOICE_COMPOSER_MAX_HEIGHT = 124;

interface DashVoiceComposerProps {
  theme: any;
  inputText: string;
  inputHeight: number;
  isProcessing: boolean;
  paddingBottom: number;
  inputRef: React.RefObject<TextInput | null>;
  onChangeText: (text: string) => void;
  onContentSizeChange?: (e: any) => void;
  onFocus: () => void;
  onSubmit: () => void;
  onPickMedia: () => void;
  onTakePhoto: () => void;
}

export function DashVoiceComposer({
  theme,
  inputText,
  inputHeight,
  isProcessing,
  paddingBottom,
  inputRef,
  onChangeText,
  onContentSizeChange,
  onFocus,
  onSubmit,
  onPickMedia,
  onTakePhoto,
}: DashVoiceComposerProps) {
  return (
    <View style={[s.inputBar, { paddingBottom }]}>
      <View style={[s.composerShell, { backgroundColor: theme.surface + 'F0', borderColor: theme.border + '88' }]}>
        <TouchableOpacity
          onPress={onPickMedia}
          onLongPress={onTakePhoto}
          style={[s.mediaBtn, { backgroundColor: theme.primary + '14' }]}
          activeOpacity={0.7}
        >
          <Ionicons name="image-outline" size={20} color={theme.primary} />
        </TouchableOpacity>
        <TextInput
          ref={inputRef}
          style={[
            s.textInput,
            {
              color: theme.text,
              borderWidth: 0,
              outlineStyle: 'none',
              height: inputHeight,
              textAlignVertical: inputHeight > VOICE_COMPOSER_COMPACT_HEIGHT ? 'top' : 'center',
            },
          ] as any}
          placeholder="Type a message..."
          placeholderTextColor={theme.textSecondary}
          value={inputText}
          onChangeText={onChangeText}
          onContentSizeChange={
            Platform.OS === 'web'
              ? undefined
              : onContentSizeChange
          }
          onFocus={onFocus}
          onSubmitEditing={onSubmit}
          returnKeyType="send"
          editable={!isProcessing}
          multiline
          numberOfLines={1}
          blurOnSubmit={false}
          scrollEnabled={inputHeight >= VOICE_COMPOSER_MAX_HEIGHT}
          underlineColorAndroid="transparent"
        />
        <TouchableOpacity
          style={[
            s.sendBtn,
            {
              backgroundColor: inputText.trim() ? theme.primary : 'rgba(255,255,255,0.08)',
              borderColor: inputText.trim() ? theme.primary : theme.border + '88',
            },
          ]}
          onPress={onSubmit}
          disabled={!inputText.trim() || isProcessing}
        >
          <Ionicons name="send" size={18} color={inputText.trim() ? '#fff' : theme.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
