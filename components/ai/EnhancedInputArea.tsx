/**
 * EnhancedInputArea Component
 * 
 * Modern input with multi-line auto-expand, attachments, and voice button.
 * Tier-aware gating for attachments.
 */

import React, { useState, useRef } from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity, Text, Keyboard, Animated, Platform, Image, ScrollView } from 'react-native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useCapability } from '@/hooks/useCapability';
import type { DashAttachment } from '@/services/dash-ai/types';
import type { VoiceState } from '@/hooks/useVoiceController';
import { UpgradePromptModal } from './UpgradePromptModal';
import { useRewardedFeature } from '@/contexts/AdsContext';
import { pickDocuments } from '@/services/AttachmentService';
import * as ImagePicker from 'expo-image-picker';
import { uploadImage } from '@/lib/ai/simple-image-upload';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
export interface EnhancedInputAreaProps {
  placeholder?: string;
  sending?: boolean;
  onSend: (text: string, attachments: DashAttachment[]) => Promise<void> | void;
  onAttachmentsChange?: (attachments: DashAttachment[]) => void;
  onVoiceStart?: () => void; // When user presses down on mic
  onVoiceEnd?: () => void;   // When user releases mic (send)
  onVoiceLock?: () => void;  // When user locks recording
  onVoiceCancel?: () => void; // When user cancels recording
  voiceState?: VoiceState;
  isVoiceLocked?: boolean;
  voiceTimerMs?: number;
}

export function EnhancedInputArea({ placeholder = 'Message Dash...', sending = false, onSend, onAttachmentsChange, onVoiceStart, onVoiceEnd, onVoiceLock, onVoiceCancel, voiceState, isVoiceLocked, voiceTimerMs }: EnhancedInputAreaProps) {
  const { theme, isDark } = useTheme();
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<DashAttachment[]>([]);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { can, tier} = useCapability();

  const canImages = can('multimodal.vision');
  const canDocs = can('multimodal.documents');
  const rewardedFeatureKey = !canImages ? 'multimodal_vision' : 'multimodal_documents';
  const { offerRewardedUnlock, canShowRewardedAd } = useRewardedFeature(rewardedFeatureKey);
  
  const hasContent = text.trim().length > 0;
  
  // Gesture state for slide-to-lock while recording
  const slideX = useRef(new Animated.Value(0)).current;
  const slideY = useRef(new Animated.Value(0)).current;
  const lockIconOpacity = useRef(new Animated.Value(0)).current;
  const cancelIconOpacity = useRef(new Animated.Value(0)).current;
  
  const LOCK_THRESHOLD = -60; // Slide up to lock
  const CANCEL_THRESHOLD = -60; // Slide left to cancel

  const addAttachments = (items: DashAttachment[]) => {
    const next = [...attachments, ...items];
    setAttachments(next);
    onAttachmentsChange?.(next);
  };

  const handleOpenCamera = async () => {
    if (!canImages) {
      setShowUpgrade(true);
      return;
    }
    try {
      // Ask permissions only when needed
      const { status: ps } = await ImagePicker.requestCameraPermissionsAsync();
      if (ps !== 'granted') {
        try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch { /* Intentional: non-fatal */ }
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      });
      if (result?.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) return;
      
      // Create pending attachment for immediate UI feedback
      const pendingAtt: DashAttachment = {
        id: `cam_${Date.now()}`,
        name: asset.fileName || 'photo.jpg',
        mimeType: 'image/jpeg',
        size: asset.fileSize || 0,
        bucket: 'chat-images',
        storagePath: '',
        kind: 'image',
        status: 'uploading',
        previewUri: asset.uri,
        uploadProgress: 0,
      };
      addAttachments([pendingAtt]);
      
      // Upload to Supabase Storage in background
      setUploading(true);
      try {
        const uploadResult = await uploadImage(asset.uri, true); // true = include base64
        
        // Update attachment with upload results
        const uploadedAtt: DashAttachment = {
          ...pendingAtt,
          status: 'uploaded',
          storagePath: uploadResult.path,
          meta: {
            publicUrl: uploadResult.url,
            base64: uploadResult.base64, // Store for AI API
          },
        };
        
        // Replace pending with uploaded
        setAttachments(prev => 
          prev.map(a => a.id === pendingAtt.id ? uploadedAtt : a)
        );
        onAttachmentsChange?.(attachments.map(a => a.id === pendingAtt.id ? uploadedAtt : a));
        
        try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch { /* Intentional: non-fatal */ }
      } catch (uploadError) {
        console.error('[EnhancedInputArea] Upload failed:', uploadError);
        // Mark as failed
        setAttachments(prev => 
          prev.map(a => a.id === pendingAtt.id ? { ...a, status: 'failed' } : a)
        );
        try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch { /* Intentional: non-fatal */ }
      } finally {
        setUploading(false);
      }
    } catch (e) {
      console.error('[EnhancedInputArea] Camera error:', e);
    }
  };

  const handlePickDocs = async () => {
    if (!canDocs) {
      setShowUpgrade(true);
      return;
    }
    const picked = await pickDocuments();
    if (picked?.length) addAttachments(picked);
  };
  
  const removeAttachment = (id: string) => {
    const next = attachments.filter(a => a.id !== id);
    setAttachments(next);
    onAttachmentsChange?.(next);
  };

  const handleSend = async () => {
    const message = text.trim();
    if (!message && attachments.length === 0) return;
    
    // Haptic feedback
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch { /* Intentional: non-fatal */ }
    
    // Clear immediately for responsive UX
    setText('');
    setAttachments([]);
    onAttachmentsChange?.([]);
    try { Keyboard.dismiss(); } catch { /* Intentional: non-fatal */ }
    
    // Send in background
    await onSend(message, attachments);
  };

  return (
    <View style={[styles.container, { borderColor: theme.border, backgroundColor: isDark ? '#0b0f14' : '#fff' }]}>
      {/* Image Preview Row */}
      {attachments.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.previewContainer}>
          {attachments.map(att => (
            <View key={att.id} style={[styles.imagePreview, { backgroundColor: theme.surface }]}>
              <Image 
                source={{ uri: att.previewUri || att.meta?.publicUrl }} 
                style={styles.previewImage}
                resizeMode="cover"
              />
              {att.status === 'uploading' && (
                <View style={styles.uploadingOverlay}>
                  <EduDashSpinner size="small" color="#fff" />
                </View>
              )}
              {att.status === 'failed' && (
                <View style={[styles.uploadingOverlay, { backgroundColor: 'rgba(220, 38, 38, 0.8)' }]}>
                  <Ionicons name="alert-circle" size={20} color="#fff" />
                </View>
              )}
              <TouchableOpacity 
                style={[styles.removeButton, { backgroundColor: theme.error }]}
                onPress={() => removeAttachment(att.id)}
              >
                <Ionicons name="close" size={14} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
      
      <View style={styles.inputRow}>
        <View style={styles.inputWrapper}>
          {/* Camera button inside input field (left side) */}
          <TouchableOpacity onPress={handleOpenCamera} style={styles.iconButtonLeftInInput}> 
            <Ionicons name="camera-outline" size={20} color={theme.textSecondary} />
          </TouchableOpacity>
          
          {/* Cash/Money clip button inside input field */}
          <TouchableOpacity onPress={handlePickDocs} style={styles.iconButtonLeftSecondInInput}> 
            <Ionicons name="cash-outline" size={20} color={theme.textSecondary} />
          </TouchableOpacity>
          
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={placeholder}
            placeholderTextColor={theme.textSecondary}
            multiline
            style={[styles.input, { color: theme.text }]}
          />
          
          {/* Document upload button inside input field (right side) */}
          <TouchableOpacity onPress={handlePickDocs} style={styles.iconButtonInInput}> 
            <Ionicons name="attach-outline" size={20} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>
        
        {/* Send/Mic toggle button */}
        {hasContent ? (
          <TouchableOpacity 
            disabled={sending} 
            onPress={handleSend} 
            style={[styles.actionButton, { backgroundColor: theme.primary }]}
          > 
            <Ionicons name="send" size={20} color="#fff" />
          </TouchableOpacity>
        ) : (
          <View style={{ position: 'relative' }}>
            {/* Lock indicator (appears when sliding up while recording) */}
            {(voiceState === 'listening' || voiceState === 'prewarm') && !isVoiceLocked && (
              <Animated.View 
                style={[
                  styles.lockIndicator,
                  { 
                    backgroundColor: theme.surface,
                    opacity: lockIconOpacity,
                  }
                ]}
                pointerEvents="none"
              >
                <Ionicons name="lock-closed" size={20} color={theme.text} />
                <Text style={[{ marginTop: 4, fontSize: 10, color: theme.textSecondary }]}>Slide up to lock</Text>
                <View style={[styles.lockArrow, { borderTopColor: theme.textSecondary }]} />
              </Animated.View>
            )}
            
            {/* Cancel indicator (appears when sliding left while recording) */}
            {(voiceState === 'listening' || voiceState === 'prewarm') && !isVoiceLocked && (
              <Animated.View 
                style={[
                  styles.cancelIndicator,
                  { 
                    backgroundColor: theme.surface,
                    opacity: cancelIconOpacity,
                  }
                ]}
                pointerEvents="none"
              >
                <Ionicons name="close" size={20} color={theme.error} />
                <Text style={[styles.cancelText, { color: theme.error }]}>Slide left to cancel</Text>
              </Animated.View>
            )}
            
            <PanGestureHandler
              minDist={10}
              onGestureEvent={(event) => {
                // Only handle gestures when actively recording
                if (voiceState !== 'listening' && voiceState !== 'prewarm') return;
                
                const { translationX, translationY } = event.nativeEvent;
                
                // Update slide animations
                slideX.setValue(translationX);
                slideY.setValue(translationY);
                
                // Show lock icon when sliding up
                if (translationY < -20) {
                  Animated.timing(lockIconOpacity, {
                    toValue: Math.min(1, Math.abs(translationY) / 60),
                    duration: 0,
                    useNativeDriver: true,
                  }).start();
                  // Immediately lock once threshold crossed
                  if (translationY < LOCK_THRESHOLD && !isVoiceLocked) {
                    onVoiceLock?.();
                  }
                } else {
                  lockIconOpacity.setValue(0);
                }
                
                // Show cancel icon when sliding left
                if (translationX < -20) {
                  Animated.timing(cancelIconOpacity, {
                    toValue: Math.min(1, Math.abs(translationX) / 80),
                    duration: 0,
                    useNativeDriver: true,
                  }).start();
                } else {
                  cancelIconOpacity.setValue(0);
                }
              }}
              onHandlerStateChange={(event) => {
                const { state, translationX, translationY } = event.nativeEvent;
                
                if (state === State.END || state === State.CANCELLED || state === State.FAILED) {
                  // Only handle if recording is active
                  if (voiceState !== 'listening' && voiceState !== 'prewarm') return;
                  
                  // Check if locked (slid up enough)
                  if (translationY < LOCK_THRESHOLD) {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                    onVoiceLock?.();
                  }
                  // Check if cancelled (slid left enough)
                  else if (translationX < CANCEL_THRESHOLD) {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    onVoiceCancel?.();
                  }
                  
                  // Reset animations
                  Animated.parallel([
                    Animated.timing(slideX, { toValue: 0, duration: 200, useNativeDriver: true }),
                    Animated.timing(slideY, { toValue: 0, duration: 200, useNativeDriver: true }),
                    Animated.timing(lockIconOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
                    Animated.timing(cancelIconOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
                  ]).start();
                }
              }}
            >
              <TouchableOpacity
                onPress={async () => {
                  try {
                    // Toggle recording: tap to start, tap again to stop and send
                    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    console.log('[EnhancedInputArea] Mic button pressed. Current voiceState:', voiceState);
                    
                    if (voiceState === 'idle' || voiceState === 'error') {
                      // Start recording
                      console.log('[EnhancedInputArea] Starting voice recording...');
                      if (onVoiceStart) {
                        await onVoiceStart();
                        console.log('[EnhancedInputArea] ✅ Voice recording started');
                      } else {
                        console.error('[EnhancedInputArea] ❌ onVoiceStart is not defined');
                      }
                    } else if (voiceState === 'listening' || voiceState === 'prewarm') {
                      // Stop and send
                      console.log('[EnhancedInputArea] Stopping voice recording...');
                      if (onVoiceEnd) {
                        await onVoiceEnd();
                        console.log('[EnhancedInputArea] ✅ Voice recording stopped');
                      } else {
                        console.error('[EnhancedInputArea] ❌ onVoiceEnd is not defined');
                      }
                    } else {
                      console.warn('[EnhancedInputArea] ⚠️ Unexpected voiceState:', voiceState);
                    }
                  } catch (error) {
                    console.error('[EnhancedInputArea] ❌ Mic button error:', error);
                    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => { /* Intentional: error handled */ });
                  }
                }}
                activeOpacity={0.7}
              >
                <Animated.View
                  style={[
                    styles.actionButton,
                    {
                      backgroundColor: voiceState === 'listening' || voiceState === 'prewarm' ? theme.error : theme.primary,
                      transform: [
                        { translateX: slideX },
                        { translateY: slideY },
                      ],
                    },
                  ]}
                >
                  <Ionicons name="mic" size={24} color="#fff" />
                </Animated.View>
              </TouchableOpacity>
            </PanGestureHandler>
          </View>
        )}
      </View>

      <UpgradePromptModal
        visible={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        currentTier={tier}
        requiredTier={'starter'}
        capability={!canImages ? 'multimodal.vision' : 'multimodal.documents'}
        onRewardedUnlock={canShowRewardedAd ? async () => {
          const unlocked = await offerRewardedUnlock();
          if (unlocked) setShowUpgrade(false);
        } : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 12,
  },
  iconButtonInline: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  inputWrapper: {
    flex: 1,
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(127,127,127,0.08)',
    borderRadius: 20,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    lineHeight: 20,
    paddingLeft: 72,
    paddingRight: 40,
    paddingVertical: 10,
    fontSize: 15,
  },
  iconButtonLeftInInput: {
    position: 'absolute',
    left: 8,
    bottom: 10,
    padding: 4,
    zIndex: 1,
  },
  iconButtonLeftSecondInInput: {
    position: 'absolute',
    left: 40,
    bottom: 10,
    padding: 4,
    zIndex: 1,
  },
  iconButtonInInput: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    padding: 4,
    zIndex: 1,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockIndicator: {
    position: 'absolute',
    bottom: 50,
    left: '50%',
    marginLeft: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  lockArrow: {
    position: 'absolute',
    bottom: -6,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  cancelIndicator: {
    position: 'absolute',
    top: 8,
    right: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  cancelText: {
    fontSize: 13,
    fontWeight: '600',
  },
  previewContainer: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    maxHeight: 100,
  },
  imagePreview: {
    position: 'relative',
    width: 80,
    height: 80,
    borderRadius: 8,
    marginRight: 8,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
