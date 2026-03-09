import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { messageComposerStyles as styles } from './styles';
import { COMPOSER_IMAGE_ASPECT } from './media';
import { ImageConfirmModal } from '@/components/ui/ImageConfirmModal';
import { DashAssistBar } from '@/components/messaging/DashAssistBar';
import type { Message } from '@/components/messaging/types';

interface ComposerOverlaysProps {
  pendingImage: { uri: string; mimeType: string } | null;
  sendingImage: boolean;
  onConfirmImage: (uri: string) => Promise<void>;
  onCancelPendingImage: () => void;
  showAssistBar: boolean;
  composerText: string;
  onAcceptAssist: (value: string) => void;
  onCloseAssist: () => void;
  EmojiPicker: React.FC<any> | null;
  showEmojiPicker: boolean;
  onEmojiSelect: (emoji: string) => void;
  onGifSelect?: (url: string) => void;
  onCloseEmojiPicker: () => void;
  isEditing: boolean;
  editingMessage?: Message | null;
  onCancelEdit?: () => void;
  onClearText: () => void;
}

export function ComposerOverlays({
  pendingImage,
  sendingImage,
  onConfirmImage,
  onCancelPendingImage,
  showAssistBar,
  composerText,
  onAcceptAssist,
  onCloseAssist,
  EmojiPicker,
  showEmojiPicker,
  onEmojiSelect,
  onGifSelect,
  onCloseEmojiPicker,
  isEditing,
  editingMessage,
  onCancelEdit,
  onClearText,
}: ComposerOverlaysProps) {
  return (
    <>
      <ImageConfirmModal
        visible={!!pendingImage}
        imageUri={pendingImage?.uri ?? null}
        onConfirm={onConfirmImage}
        onCancel={onCancelPendingImage}
        title="Send Photo"
        confirmLabel="Send"
        confirmIcon="send"
        showCrop
        cropAspect={COMPOSER_IMAGE_ASPECT}
        loading={sendingImage}
      />

      <DashAssistBar
        visible={showAssistBar}
        composerText={composerText}
        onAccept={onAcceptAssist}
        onClose={onCloseAssist}
      />

      {EmojiPicker && (
        <EmojiPicker
          visible={showEmojiPicker}
          onEmojiSelect={onEmojiSelect}
          onGifSelect={onGifSelect}
          onClose={onCloseEmojiPicker}
        />
      )}

      {isEditing && (
        <View style={styles.editBanner}>
          <Ionicons name="pencil" size={16} color="#6366f1" />
          <View style={styles.editBannerText}>
            <Text style={styles.editLabel}>Editing message</Text>
            <Text style={styles.editContent} numberOfLines={1}>
              {editingMessage?.content}
            </Text>
          </View>
          <TouchableOpacity onPress={() => { onCancelEdit?.(); onClearText(); }} hitSlop={12}>
            <Ionicons name="close" size={20} color="#9ca3af" />
          </TouchableOpacity>
        </View>
      )}
    </>
  );
}

export default ComposerOverlays;
