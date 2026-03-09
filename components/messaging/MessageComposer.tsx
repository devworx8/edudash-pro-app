/**
 * Message Composer Component
 * WhatsApp-style input with emoji, attachments, voice recording, and send
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { toast } from '@/components/ui/ToastProvider';
import { useCallSafe } from '@/components/calls/CallProvider';
import { Message } from './types';
import type { ParentAlertApi } from '@/components/ui/parentAlert';
import {
  COMPOSER_IMAGE_ASPECT,
  centerCropToAspect,
  pickAttachmentAssets,
  pickCameraAsset,
  sendPickedAssets,
} from './message-composer/media';
import { ComposerTextEntry } from './message-composer/ComposerTextEntry';
import { ComposerOverlays } from './message-composer/ComposerOverlays';
import { messageComposerStyles as styles } from './message-composer/styles';

// Safe component imports
let VoiceRecorder: React.FC<any> | null = null;
let EmojiPicker: React.FC<any> | null = null;

try {
  VoiceRecorder = require('@/components/messaging/VoiceRecorder').VoiceRecorder;
} catch (e) {
  console.error('[MessageComposer] Failed to load VoiceRecorder:', e);
}

try {
  EmojiPicker = require('@/components/messaging/EmojiPicker').EmojiPicker;
} catch {}

interface MessageComposerProps {
  onSend: (text: string) => Promise<void>;
  onVoiceRecording?: (uri: string, duration: number) => Promise<void>;
  onImageAttach?: (uri: string, mimeType: string) => Promise<void>;
  sending: boolean;
  replyingTo?: Message | null;
  onCancelReply?: () => void;
  disabled?: boolean;
  placeholder?: string;
  /** Called when user is typing (for typing indicators) */
  onTyping?: () => void;
  /** When set, the composer switches to edit mode with this message's content */
  editingMessage?: Message | null;
  /** Called to cancel editing */
  onCancelEdit?: () => void;
  /** Optional modal alert API (used by parent flows to avoid native alerts) */
  showAlert?: ParentAlertApi;
  /** Number of failed messages in the retry queue (for badge display) */
  failedMessageCount?: number;
  /** Called when send fails so the caller can enqueue into the retry system */
  onSendError?: (content: string, error: string) => void;
  /** Called when user taps the schedule button — passes the current text */
  onSchedule?: (text: string) => void;
  /** Called when user taps the template button to open template picker */
  onOpenTemplates?: () => void;
}

export const MessageComposer: React.FC<MessageComposerProps> = React.memo(({
  onSend,
  onVoiceRecording,
  onImageAttach,
  sending,
  replyingTo,
  onCancelReply,
  disabled = false,
  placeholder = 'Message',
  onTyping,
  editingMessage,
  onCancelEdit,
  showAlert,
  failedMessageCount = 0,
  onSendError,
  onSchedule,
  onOpenTemplates,
}) => {
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [pendingImage, setPendingImage] = useState<{ uri: string; mimeType: string } | null>(null);
  const [sendingImage, setSendingImage] = useState(false);
  const [showAssistBar, setShowAssistBar] = useState(false);
  
  // Presence activity tracking — keeps user status 'online' while chatting
  const callCtx = useCallSafe();
  
  // Mic glow animation
  const micGlowAnim = useRef(new Animated.Value(0.1)).current;
  
  useEffect(() => {
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(micGlowAnim, { toValue: 1, duration: 1200, useNativeDriver: false }),
        Animated.timing(micGlowAnim, { toValue: 0.4, duration: 1200, useNativeDriver: false }),
      ])
    );
    glowLoop.start();
    return () => glowLoop.stop();
  }, [micGlowAnim]);

  // Edit mode: pre-fill text when editingMessage changes
  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.content || '');
    }
  }, [editingMessage]);

  const isEditing = !!editingMessage;

  const showComposerAlert = useCallback((
    title: string,
    message: string,
    type: 'info' | 'warning' | 'error' | 'success' = 'info',
  ) => {
    if (showAlert) {
      showAlert({ title, message, type });
      return;
    }

    if (type === 'error') {
      toast.error(message, title);
      return;
    }
    if (type === 'warning') {
      toast.warn(message, title);
      return;
    }
    if (type === 'success') {
      toast.success(message, title);
      return;
    }
    toast.info(message, title);
  }, [showAlert]);

  const handleSend = async () => {
    const content = text.trim();
    if (!content || sending) return;

    setText('');
    setShowEmojiPicker(false);
    if (!isEditing) {
      onCancelReply?.();
    }
    callCtx?.recordActivity();
    try {
      await onSend(content);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      onSendError?.(content, errMsg);
    }
  };

  const handleVoiceComplete = async (uri: string, duration: number) => {
    setIsRecording(false);
    callCtx?.recordActivity();
    if (onVoiceRecording) {
      await onVoiceRecording(uri, duration);
    }
  };

  const handleVoiceCancel = () => {
    setIsRecording(false);
  };

  const handleEmojiSelect = (emoji: string) => {
    setText(prev => prev + emoji);
  };

  // Handle camera capture
  const handleCamera = useCallback(async () => {
    if (!onImageAttach) {
      toast.info('Image attachments not supported in this chat', 'Camera');
      return;
    }

    try {
      const item = await pickCameraAsset({
        onUnsupported: () =>
          showComposerAlert(
            'Permission Required',
            'Please grant camera access to take photos.',
            'warning',
          ),
      });
      if (item) {
        setPendingImage(item);
      }
    } catch {
      toast.error('Failed to take photo. Please try again.', 'Camera');
    }
  }, [onImageAttach, showComposerAlert]);

  // Handle gallery/attachment picker (images and videos)
  const handleAttachment = useCallback(async () => {
    if (!onImageAttach) {
      toast.info('Attachments not supported in this chat', 'Attachments');
      return;
    }
    try {
      const items = await pickAttachmentAssets({
        onPermissionDenied: () =>
          showComposerAlert(
            'Permission Required',
            'Please grant gallery access to attach images and videos.',
            'warning',
          ),
      });
      if (items?.length) {
        await sendPickedAssets({
          items,
          onImageAttach,
          onImageSelected: setPendingImage,
          setSendingImage,
        });
      }
    } catch {
      toast.error('Failed to pick media. Please try again.', 'Attachments');
    }
  }, [showComposerAlert, onImageAttach]);

  const handleConfirmImage = useCallback(async (uri: string) => {
    if (!onImageAttach || !pendingImage) return;
    try {
      setSendingImage(true);
      const croppedUri = await centerCropToAspect(uri, COMPOSER_IMAGE_ASPECT);
      await onImageAttach(croppedUri, pendingImage.mimeType);
    } finally {
      setSendingImage(false);
      setPendingImage(null);
    }
  }, [onImageAttach, pendingImage]);

  return (
    <View style={styles.container}>
      <ComposerOverlays
        pendingImage={pendingImage}
        sendingImage={sendingImage}
        onConfirmImage={handleConfirmImage}
        onCancelPendingImage={() => setPendingImage(null)}
        showAssistBar={showAssistBar}
        composerText={text}
        onAcceptAssist={setText}
        onCloseAssist={() => setShowAssistBar(false)}
        EmojiPicker={EmojiPicker}
        showEmojiPicker={showEmojiPicker}
        onEmojiSelect={handleEmojiSelect}
        onGifSelect={
          onImageAttach
            ? (url: string) => {
                setShowEmojiPicker(false);
                setSendingImage(true);
                onImageAttach(url, 'image/gif').finally(() => setSendingImage(false));
              }
            : undefined
        }
        onCloseEmojiPicker={() => setShowEmojiPicker(false)}
        isEditing={isEditing}
        editingMessage={editingMessage}
        onCancelEdit={onCancelEdit}
        onClearText={() => setText('')}
      />
      
      <View style={styles.composerRow}>
        {!isRecording && (
          <ComposerTextEntry
            text={text}
            replyingTo={replyingTo}
            isEditing={isEditing}
            sending={sending}
            disabled={disabled}
            placeholder={placeholder}
            showEmojiPicker={showEmojiPicker}
            showAssistBar={showAssistBar}
            failedMessageCount={failedMessageCount}
            onCancelReply={onCancelReply}
            onToggleEmojiPicker={() => setShowEmojiPicker((value) => !value)}
            onChangeText={(newText) => {
              setText(newText);
              if (newText.trim() && onTyping) {
                onTyping();
              }
              callCtx?.recordActivity();
            }}
            onFocusText={() => setShowEmojiPicker(false)}
            onCamera={handleCamera}
            onAttach={handleAttachment}
            onToggleAssistBar={() => setShowAssistBar((value) => !value)}
            onSchedule={onSchedule ? () => onSchedule(text.trim()) : undefined}
            onSend={handleSend}
          />
        )}
        
        {/* Voice Recorder - ChatGPT-style inline (takes full width when recording/previewing) */}
        {!text.trim() && VoiceRecorder && (
          <View style={isRecording ? styles.recordingWrapper : undefined}>
            <VoiceRecorder
              onRecordingComplete={handleVoiceComplete}
              onRecordingCancel={handleVoiceCancel}
              disabled={sending || disabled}
              onRecordingStateChange={setIsRecording}
            />
          </View>
        )}

        {/* Templates button (when no text, not recording) */}
        {!text.trim() && !isRecording && onOpenTemplates && (
          <TouchableOpacity
            style={styles.scheduleButton}
            onPress={onOpenTemplates}
            activeOpacity={0.7}
            accessibilityLabel="Message templates"
          >
            <Ionicons name="document-text-outline" size={20} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
        )}
        
        {/* Fallback mic button if VoiceRecorder not available */}
        {!text.trim() && !VoiceRecorder && (
          <View style={styles.micContainer}>
            <Animated.View style={[styles.micGlow, { opacity: micGlowAnim }]} />
            <TouchableOpacity 
              style={styles.actionButton} 
              onPress={() => toast.warn('Voice recording not available', 'Voice')}
            >
              <LinearGradient 
                colors={['#16c7ff', '#5b5bff', '#7c3aed']} 
                style={[styles.gradientButton, styles.micButton]}
              >
                <Ionicons name="mic" size={22} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
});
