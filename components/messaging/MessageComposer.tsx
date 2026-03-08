/**
 * Message Composer Component
 * WhatsApp-style input with emoji, attachments, voice recording, and send
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, Animated, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { toast } from '@/components/ui/ToastProvider';
import { ensureImageLibraryPermission } from '@/lib/utils/mediaLibrary';
import { useCallSafe } from '@/components/calls/CallProvider';
import { ReplyPreview } from './ReplyPreview';
import { Message } from './types';
import { CYAN_GLOW } from './theme';
import type { ParentAlertApi } from '@/components/ui/parentAlert';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { ImageConfirmModal } from '@/components/ui/ImageConfirmModal';
import { DashAssistBar } from './DashAssistBar';
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

const COMPOSER_IMAGE_ASPECT: [number, number] = [4, 3];

const getImageDimensions = (uri: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error),
    );
  });

const centerCropToAspect = async (uri: string, aspect: [number, number]): Promise<string> => {
  try {
    const { width, height } = await getImageDimensions(uri);
    if (!width || !height) return uri;

    const targetRatio = aspect[0] / aspect[1];
    const currentRatio = width / height;

    let cropWidth = width;
    let cropHeight = height;

    if (currentRatio > targetRatio) {
      cropWidth = Math.max(1, Math.round(height * targetRatio));
    } else if (currentRatio < targetRatio) {
      cropHeight = Math.max(1, Math.round(width / targetRatio));
    } else {
      return uri;
    }

    const originX = Math.max(0, Math.round((width - cropWidth) / 2));
    const originY = Math.max(0, Math.round((height - cropHeight) / 2));

    const result = await manipulateAsync(
      uri,
      [{ crop: { originX, originY, width: cropWidth, height: cropHeight } }],
      { compress: 0.9, format: SaveFormat.JPEG },
    );

    return result.uri || uri;
  } catch (error) {
    console.warn('[MessageComposer] Aspect crop fallback:', error);
    return uri;
  }
};

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
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      
      if (!permissionResult.granted) {
        showComposerAlert(
          'Permission Required',
          'Please grant camera access to take photos.',
          'warning',
        );
        return;
      }
      
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: false,
      });
      if (!result.canceled && result.assets.length > 0) {
        const asset = result.assets[0];
        const mimeType = asset.mimeType || 'image/jpeg';
        setPendingImage({ uri: asset.uri, mimeType });
      }
    } catch (error) {
      console.error('[MessageComposer] Camera error:', error);
      toast.error('Failed to take photo. Please try again.', 'Camera');
    }
  }, [showComposerAlert]);

  // Handle gallery/attachment picker (images and videos)
  const handleAttachment = useCallback(async () => {
    if (!onImageAttach) {
      toast.info('Attachments not supported in this chat', 'Attachments');
      return;
    }
    try {
      const hasPermission = await ensureImageLibraryPermission();
      if (!hasPermission) {
        showComposerAlert(
          'Permission Required',
          'Please grant gallery access to attach images and videos.',
          'warning',
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        quality: 0.8,
        allowsEditing: false,
        allowsMultipleSelection: true,
        videoMaxDuration: 120,
      });
      if (!result.canceled && result.assets.length > 0) {
        const assets = result.assets;
        const items = assets.map((a) => ({
          uri: a.uri,
          mimeType: a.mimeType || ((a as { type?: string }).type === 'video' ? 'video/mp4' : 'image/jpeg'),
        }));
        const videos = items.filter((i) => i.mimeType.startsWith('video/'));
        const images = items.filter((i) => !i.mimeType.startsWith('video/'));
        if (items.length === 1) {
          if (videos.length === 1) {
            setSendingImage(true);
            try {
              await onImageAttach(items[0].uri, items[0].mimeType);
            } finally {
              setSendingImage(false);
            }
          } else {
            setPendingImage(items[0]);
          }
          return;
        }
        setSendingImage(true);
        try {
          for (let i = 0; i < items.length; i++) {
            const { uri, mimeType } = items[i];
            const isVideo = mimeType.startsWith('video/');
            await onImageAttach(uri, mimeType);
          }
          if (items.length > 1) {
            toast.success(`${items.length} items sent`, 'Attachments');
          }
        } finally {
          setSendingImage(false);
        }
      }
    } catch (error) {
      console.error('[MessageComposer] Attachment error:', error);
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
      {/* Image preview/confirm modal */}
      <ImageConfirmModal
        visible={!!pendingImage}
        imageUri={pendingImage?.uri ?? null}
        onConfirm={handleConfirmImage}
        onCancel={() => setPendingImage(null)}
        title="Send Photo"
        confirmLabel="Send"
        confirmIcon="send"
        showCrop
        cropAspect={COMPOSER_IMAGE_ASPECT}
        loading={sendingImage}
      />

      {/* Dash AI Assist Bar */}
      <DashAssistBar
        visible={showAssistBar}
        composerText={text}
        onAccept={(improved) => setText(improved)}
        onClose={() => setShowAssistBar(false)}
      />

      {/* Emoji Picker (includes GIF tab) */}
      {EmojiPicker && (
        <EmojiPicker 
          visible={showEmojiPicker}
          onEmojiSelect={handleEmojiSelect}
          onGifSelect={onImageAttach ? (url: string) => {
            setShowEmojiPicker(false);
            setSendingImage(true);
            onImageAttach(url, 'image/gif').finally(() => setSendingImage(false));
          } : undefined}
          onClose={() => setShowEmojiPicker(false)} 
        />
      )}
      
      {/* Edit Mode Banner */}
      {isEditing && (
        <View style={styles.editBanner}>
          <Ionicons name="pencil" size={16} color="#6366f1" />
          <View style={styles.editBannerText}>
            <Text style={styles.editLabel}>Editing message</Text>
            <Text style={styles.editContent} numberOfLines={1}>
              {editingMessage?.content}
            </Text>
          </View>
          <TouchableOpacity onPress={() => { onCancelEdit?.(); setText(''); }} hitSlop={12}>
            <Ionicons name="close" size={20} color="#9ca3af" />
          </TouchableOpacity>
        </View>
      )}
      
      <View style={styles.composerRow}>
        {/* Failed message badge */}
        {failedMessageCount > 0 && !isRecording && (
          <View style={styles.failedBadge}>
            <Ionicons name="alert-circle" size={14} color="#fff" />
            <Text style={styles.failedBadgeText}>{failedMessageCount} failed</Text>
          </View>
        )}

        {/* Input wrapper - hide when recording */}
        {!isRecording && (
          <>
            <View style={styles.inputWrapper}>
              {/* Reply Preview — WhatsApp-style inside the input bubble */}
              {replyingTo && !isEditing && (
                <View style={styles.replyInsideInput}>
                  <ReplyPreview message={replyingTo} onClose={() => onCancelReply?.()} />
                </View>
              )}

              {/* Input row: emoji + text + camera + attach */}
              <View style={styles.inputRow}>
                {/* Emoji toggle inside the input field */}
                <TouchableOpacity
                  style={styles.inlineBtnLeft}
                  onPress={() => setShowEmojiPicker(!showEmojiPicker)}
                  accessibilityLabel={showEmojiPicker ? 'Close emoji picker' : 'Open emoji picker'}
                >
                  <Ionicons
                    name={showEmojiPicker ? 'close-outline' : 'happy-outline'}
                    size={22}
                    color="rgba(255,255,255,0.65)"
                  />
                </TouchableOpacity>

                <TextInput
                  style={styles.textInput}
                  placeholder={placeholder}
                  placeholderTextColor="rgba(255,255,255,0.55)"
                  value={text}
                  onChangeText={(newText) => {
                    setText(newText);
                    // Notify parent about typing activity
                    if (newText.trim() && onTyping) {
                      onTyping();
                    }
                    // Keep presence online while typing
                    callCtx?.recordActivity();
                  }}
                  multiline
                  maxLength={1000}
                  editable={!sending && !disabled}
                  onFocus={() => setShowEmojiPicker(false)}
                />
                
                {/* Camera button (hide when typing) */}
                {!text.trim() && (
                  <TouchableOpacity 
                    style={styles.inlineBtn}
                    onPress={handleCamera}
                  >
                    <Ionicons name="camera-outline" size={22} color="rgba(255,255,255,0.5)" />
                  </TouchableOpacity>
                )}
                
                {/* Attachment button */}
                <TouchableOpacity 
                  style={styles.inlineBtn}
                  onPress={handleAttachment}
                >
                  <Ionicons name="attach-outline" size={22} color="rgba(255,255,255,0.5)" />
                </TouchableOpacity>
              </View>
            </View>
            
            {/* AI Assist sparkle button (visible when text is present) */}
            {text.trim() && (
              <TouchableOpacity
                style={styles.sparkleButton}
                onPress={() => setShowAssistBar((v) => !v)}
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

            {/* Schedule Button - when there's text and onSchedule is provided */}
            {text.trim() && onSchedule && (
              <TouchableOpacity
                style={styles.scheduleButton}
                onPress={() => onSchedule(text.trim())}
                activeOpacity={0.7}
                accessibilityLabel="Schedule message"
              >
                <Ionicons name="time-outline" size={20} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            )}

            {/* Send Button - only when there's text */}
            {text.trim() && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleSend}
                disabled={sending}
                activeOpacity={0.8}
              >
                <LinearGradient 
                  colors={['#3b82f6', '#2563eb']} 
                  style={styles.gradientButton}
                >
                  {sending ? (
                    <EduDashSpinner size="small" color="#fff" />
                  ) : (
                    <Ionicons name="send" size={20} color="#fff" />
                  )}
                </LinearGradient>
              </TouchableOpacity>
            )}
          </>
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
                colors={['#0776d1ff', '#043c85ff']} 
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

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 6,
    paddingTop: 4,
    paddingBottom: 4,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: '#1e293b',
    borderRadius: 24,
    paddingLeft: 0,
    paddingRight: 0,
    paddingVertical: 0,
    minHeight: 46,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.18)',
    overflow: 'hidden',
  },
  replyInsideInput: {
    paddingHorizontal: 6,
    paddingTop: 6,
    paddingBottom: 2,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
    paddingRight: 6,
    paddingVertical: 4,
    minHeight: 46,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
    maxHeight: 100,
    minHeight: 36,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  inlineBtnLeft: {
    padding: 8,
    marginRight: 2,
  },
  inlineBtn: {
    padding: 8,
  },
  actionButton: {
    width: 48,
    height: 48,
  },
  gradientButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#020617',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 7,
  },
  micButton: {
    borderWidth: 1.5,
    borderColor: 'rgba(2, 17, 66, 0.5)',
    shadowColor: '#010635ff',
    shadowOpacity: 0.9,
    shadowRadius: 12,
    elevation: 8,
  },
  micContainer: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingWrapper: {
    flex: 1,
  },
  micGlow: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: CYAN_GLOW,
  },
  editBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.14)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginHorizontal: 8,
    marginBottom: 4,
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#6366f1',
    gap: 8,
  },
  editBannerText: {
    flex: 1,
  },
  editLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6366f1',
  },
  editContent: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 1,
  },
  failedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    backgroundColor: '#dc2626',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 4,
    marginBottom: 4,
  },
  failedBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  sparkleButton: {
    width: 36,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleButton: {
    width: 36,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
