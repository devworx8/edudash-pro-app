/**
 * DashInputBar Component
 * 
 * Input area for the Dash AI Assistant with text input, attachments, and send button.
 * Extracted from DashAssistant for better maintainability.
 */

import React, { useState, useCallback } from 'react';
import { View, TextInput, TouchableOpacity, ScrollView, Text, Platform, Dimensions, Image, Animated, Easing, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { inputStyles as styles } from '@/components/ai/dash-assistant/styles/input.styles';
import { useTheme } from '@/contexts/ThemeContext';
import type { DashAttachment } from '@/services/dash-ai/types';
import type { AttachmentProgress } from '@/hooks/useDashAttachments';
import { getFileIconName, formatFileSize } from '@/services/AttachmentService';
import { CosmicOrb } from '@/components/dash-orb/CosmicOrb';
import { ImageViewer } from '@/components/messaging/ImageViewer';

import EduDashSpinner from '@/components/ui/EduDashSpinner';

interface DashInputBarProps {
  inputRef: React.RefObject<TextInput>;
  inputText: string;
  setInputText: (text: string) => void;
  enterToSend?: boolean;
  selectedAttachments: DashAttachment[];
  attachmentProgress?: Map<string, AttachmentProgress>;
  isLoading: boolean;
  isUploading: boolean;
  isRecording?: boolean;
  recordingVoiceActivity?: boolean;
  isSpeaking?: boolean;
  partialTranscript?: string;
  voiceAutoSendCountdownActive?: boolean;
  voiceAutoSendCountdownMs?: number;
  bottomInset?: number;
  placeholder?: string;
  messages?: any[];
  onSend: () => void;
  onMicPress: () => void;
  onCancelVoiceAutoSend?: () => void;
  onTakePhoto: () => void;
  onAttachFile: () => void;
  onRemoveAttachment: (attachmentId: string) => void;
  onQuickAction?: (text: string) => void;
  onCancel?: () => void;
  onInterrupt?: () => void | Promise<void>;
  onInputFocus?: () => void;
  hideQuickChips?: boolean;
  /** Web: paste image from clipboard (receives File). Optional. */
  onPasteImage?: (file: File) => void;
}

const WAVE_BARS = 7;
const FULL_CHAT_COMPACT_HEIGHT = 42;
const FULL_CHAT_GROW_THRESHOLD = 56;
const FULL_CHAT_MAX_HEIGHT = 120;
const FULL_CHAT_LINE_HEIGHT = 21;

const estimateWrappedLineCount = (text: string, charsPerLine: number): number =>
  String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .reduce((total, line) => total + Math.max(1, Math.ceil(Math.max(line.length, 1) / charsPerLine)), 0);

const RecordingWaveform: React.FC<{ active: boolean; color: string; mutedColor: string }> = ({
  active,
  color,
  mutedColor,
}) => {
  const bars = React.useMemo(
    () => Array.from({ length: WAVE_BARS }, () => new Animated.Value(0.26)),
    []
  );

  React.useEffect(() => {
    if (!active) {
      bars.forEach((bar) => bar.setValue(0.26));
      return;
    }

    const loops = bars.map((bar, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 55),
          Animated.timing(bar, {
            toValue: 1,
            duration: 240,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(bar, {
            toValue: 0.26,
            duration: 260,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      )
    );

    loops.forEach((loop) => loop.start());
    return () => {
      loops.forEach((loop) => loop.stop());
      bars.forEach((bar) => bar.setValue(0.26));
    };
  }, [active, bars]);

  return (
    <View style={styles.voiceWaveformRail}>
      {bars.map((bar, index) => (
        <Animated.View
          key={`wave_${index}`}
          style={[
            styles.voiceWaveformBar,
            {
              backgroundColor: active ? color : mutedColor,
              transform: [{ scaleY: bar }],
            },
          ]}
        />
      ))}
    </View>
  );
};

export const DashInputBar: React.FC<DashInputBarProps> = ({
  inputRef,
  inputText,
  setInputText,
  enterToSend = true,
  selectedAttachments,
  attachmentProgress,
  isLoading,
  isUploading,
  isRecording = false,
  recordingVoiceActivity = false,
  isSpeaking = false,
  partialTranscript = '',
  voiceAutoSendCountdownActive = false,
  voiceAutoSendCountdownMs = 0,
  bottomInset = 0,
  placeholder,
  messages = [],
  onSend,
  onMicPress,
  onCancelVoiceAutoSend,
  onTakePhoto,
  onAttachFile,
  onRemoveAttachment,
  onQuickAction,
  onCancel,
  onInterrupt,
  onInputFocus,
  hideQuickChips = false,
  onPasteImage,
}) => {
  const { theme } = useTheme();
  const { width: screenWidth } = Dimensions.get('window');
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [inputHeight, setInputHeight] = useState(FULL_CHAT_COMPACT_HEIGHT);
  const orbSize = screenWidth < 360 ? 28 : screenWidth < 400 ? 30 : 32;
  const orbRingSize = orbSize + 14;
  const webCharsPerLine = Math.max(22, Math.floor((screenWidth - 172) / 8));
  const handleComposerTextChange = useCallback((text: string) => {
    setInputText(text);
    if (!text.trim()) {
      setInputHeight(FULL_CHAT_COMPACT_HEIGHT);
      return;
    }
    if (Platform.OS === 'web') {
      const lineCount = estimateWrappedLineCount(text, webCharsPerLine);
      const nextHeight = lineCount <= 1
        ? FULL_CHAT_COMPACT_HEIGHT
        : Math.min(FULL_CHAT_COMPACT_HEIGHT + (lineCount - 1) * FULL_CHAT_LINE_HEIGHT, FULL_CHAT_MAX_HEIGHT);
      setInputHeight(nextHeight);
    }
  }, [setInputText, webCharsPerLine]);
  const handleSubmit = useCallback(() => {
    onSend();
    setInputHeight(FULL_CHAT_COMPACT_HEIGHT);
  }, [onSend]);

  const renderAttachmentStrip = () => (
    selectedAttachments.length === 0 ? null : (
      <View
        style={[
          styles.attachmentChipsContainer,
          {
            backgroundColor: theme.surfaceVariant + '66',
            borderColor: theme.border,
          },
        ]}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.attachmentChipsScroll}
        >
          {selectedAttachments.map((attachment) => {
            // Get real-time progress from the hook
            const progress = attachmentProgress?.get(attachment.id);
            const status = progress?.status || attachment.status || 'pending';
            const uploadProgress = progress?.progress ?? attachment.uploadProgress ?? 0;
            const isImage = attachment.kind === 'image';
            const imageUri = attachment.previewUri || attachment.uri;
            
            return (
              <View 
                key={attachment.id}
                style={[
                  isImage ? styles.attachmentImageCard : styles.attachmentChip,
                  { 
                    backgroundColor: theme.surface,
                    borderColor: status === 'failed' ? theme.error : theme.border
                  }
                ]}
              >
              {/* Image preview (ChatGPT style) - tap to full-screen */}
              {isImage && imageUri ? (
                <View style={styles.attachmentImageWrapper}>
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setPreviewImageUri(imageUri);
                    }}
                    style={styles.attachmentImagePreview}
                  >
                    <Image
                      source={{ uri: imageUri }}
                      style={StyleSheet.absoluteFill}
                      resizeMode="cover"
                    />
                  </Pressable>
                  {/* Overlay for status */}
                  {status === 'uploading' && (
                    <View style={[styles.attachmentImageOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
                      <EduDashSpinner size="small" color="#FFFFFF" />
                    </View>
                  )}
                  {status === 'uploaded' && (
                    <View style={[styles.attachmentImageBadge, { backgroundColor: theme.success }]}>
                      <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                    </View>
                  )}
                  {status === 'failed' && (
                    <View style={[styles.attachmentImageOverlay, { backgroundColor: 'rgba(220, 38, 38, 0.8)' }]}>
                      <Ionicons name="alert-circle" size={24} color="#FFFFFF" />
                    </View>
                  )}
                  {/* Remove button */}
                  {status !== 'uploading' && (
                    <TouchableOpacity
                      style={[styles.attachmentImageRemove, { backgroundColor: theme.error }]}
                      onPress={() => onRemoveAttachment(attachment.id)}
                      accessibilityLabel={`Remove ${attachment.name}`}
                    >
                      <Ionicons name="close" size={14} color="#FFFFFF" />
                    </TouchableOpacity>
                  )}
                  {/* File size label */}
                  <View style={[styles.attachmentImageSize, { backgroundColor: 'rgba(0,0,0,0.7)' }]}>
                    <Text style={styles.attachmentImageSizeText}>
                      {formatFileSize(attachment.size)}
                    </Text>
                  </View>
                </View>
              ) : (
                /* File/document chip (original style) */
                <>
              <View style={styles.attachmentChipContent}>
                <Ionicons 
                  name={getFileIconName(attachment.kind)}
                  size={16} 
                  color={status === 'failed' ? theme.error : theme.text} 
                />
                <View style={styles.attachmentChipText}>
                  <Text 
                    style={[
                      styles.attachmentChipName, 
                      { color: status === 'failed' ? theme.error : theme.text }
                    ]}
                    numberOfLines={1}
                  >
                    {attachment.name}
                  </Text>
                  <Text style={[styles.attachmentChipSize, { color: theme.textSecondary }]}>
                    {formatFileSize(attachment.size)}
                  </Text>
                </View>
                
                {/* Progress indicator */}
                {status === 'uploading' && (
                  <View style={styles.attachmentProgressContainer}>
                    <EduDashSpinner size="small" color={theme.primary} />
                  </View>
                )}
                
                {/* Status indicator */}
                {status === 'uploaded' && (
                  <Ionicons name="checkmark-circle" size={16} color={theme.success} />
                )}
                
                {status === 'failed' && (
                  <Ionicons name="alert-circle" size={16} color={theme.error} />
                )}
                
                {/* Remove button */}
                {status !== 'uploading' && (
                  <TouchableOpacity
                    style={styles.attachmentChipRemove}
                    onPress={() => onRemoveAttachment(attachment.id)}
                    accessibilityLabel={`Remove ${attachment.name}`}
                  >
                    <Ionicons name="close" size={14} color={theme.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
              
              {/* Progress bar */}
              {status === 'uploading' && uploadProgress !== undefined && (
                <View style={[styles.attachmentProgressBar, { backgroundColor: theme.surfaceVariant }]}>
                  <View 
                    style={[
                      styles.attachmentProgressFill,
                      { 
                        backgroundColor: theme.primary,
                        width: `${uploadProgress}%`
                      }
                    ]} 
                  />
                </View>
              )}
              </>
              )}
            </View>
            );
          })}
        </ScrollView>
      </View>
    )
  );

  const hasContent = inputText.trim() || selectedAttachments.length > 0;
  const hasMessages = messages && messages.length > 0;
  const hasPartialTranscript = partialTranscript.trim().length > 0;
  const normalizeTranscript = (value: string) =>
    value.trim().replace(/\s+/g, ' ').toLowerCase();
  const showTranscriptPreview =
    hasPartialTranscript &&
    normalizeTranscript(partialTranscript) !== normalizeTranscript(inputText);
  const showAutoSendCountdown = voiceAutoSendCountdownActive && voiceAutoSendCountdownMs > 0;
  const autoSendTotalMs = 3000;
  const autoSendRemainingSeconds = showAutoSendCountdown
    ? Math.max(1, Math.ceil(voiceAutoSendCountdownMs / 1000))
    : 0;
  const autoSendProgress = showAutoSendCountdown
    ? Math.max(0, Math.min(1, voiceAutoSendCountdownMs / autoSendTotalMs))
    : 0;
  // Avoid duplicate "thinking" UI: loading state is rendered by the
  // floating bottom thinking dock in DashAssistant shell.
  // Speaking state is shown inline in the message bubble via SpeakingWaveIndicator.
  const showVoiceStatus = isRecording || hasPartialTranscript || showAutoSendCountdown;
  const waveformActive = isRecording && recordingVoiceActivity;
  const statusToneColor = isRecording ? theme.error : (isLoading ? theme.primary : theme.textSecondary);
  const voiceStatusLabel = isRecording
    ? 'Recording live'
    : showAutoSendCountdown
      ? 'Auto-send armed'
    : isLoading
      ? 'Dash is thinking'
      : 'Transcript ready';
  const voiceStatusHint = isRecording
    ? (hasPartialTranscript
      ? 'Keep speaking. Brief pauses are okay, Dash will keep listening.'
      : 'Speak naturally. Dash will finalize after a longer pause.')
    : showAutoSendCountdown
      ? `Auto-send in ${autoSendRemainingSeconds}s. Tap cancel if you still want to continue talking.`
    : isLoading
      ? 'Analyzing your request and preparing a response...'
      : 'Tap send to submit or continue dictating.';
  // Show conversation starters when chat is empty
  const canShowQuickChips = !hideQuickChips && !hasContent && !isRecording && !isLoading && !hasMessages;

  const quickChips = [
    { id: 'explain', label: 'Explain', icon: 'bulb-outline', prompt: 'Explain this to me in simple terms.' },
    { id: 'write', label: 'Write', icon: 'create-outline', prompt: 'Help me write something.' },
    { id: 'brainstorm', label: 'Brainstorm', icon: 'sparkles-outline', prompt: 'Help me brainstorm ideas.' },
    { id: 'analyze', label: 'Analyze', icon: 'analytics-outline', prompt: 'Analyze this for me.' },
  ];

  return (
    <>
    <View
      style={[
        styles.inputContainer,
        {
          backgroundColor: 'transparent',
          paddingBottom: Math.max(12, bottomInset),
        }
      ]}
    >
      {/* Attachment strip: drop zone when empty, thumbnails when present */}
      {renderAttachmentStrip()}

      {showVoiceStatus && (
        <View style={[styles.voiceStatusRow, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
          <View style={styles.voiceStatusTopRow}>
            <View style={styles.voiceStatusHeader}>
              {isLoading && !isRecording ? (
                <EduDashSpinner size="small" color={theme.primary} />
              ) : (
                <Ionicons
                  name={isRecording ? 'mic' : isSpeaking ? 'volume-high-outline' : 'chatbubble-ellipses-outline'}
                  size={16}
                  color={statusToneColor}
                />
              )}
              <Text style={[styles.voiceStatusText, { color: statusToneColor }]}>
                {voiceStatusLabel}
              </Text>
            </View>
            <RecordingWaveform active={waveformActive} color={theme.error} mutedColor={theme.border} />
          </View>
          <View style={styles.voiceStatusContent}>
            {showAutoSendCountdown && (
              <View style={styles.autoSendCountdownRow}>
                <View
                  style={[
                    styles.autoSendCountdownCircle,
                    {
                      borderColor: theme.primary,
                      backgroundColor: theme.primary + '16',
                    },
                  ]}
                >
                  <Text style={[styles.autoSendCountdownValue, { color: theme.primary }]}>
                    {autoSendRemainingSeconds}
                  </Text>
                </View>
                <View style={styles.autoSendCountdownMeta}>
                  <Text style={[styles.autoSendCountdownTitle, { color: theme.text }]}>
                    Sending soon
                  </Text>
                  <View style={[styles.autoSendProgressTrack, { backgroundColor: theme.border + '66' }]}>
                    <View
                      style={[
                        styles.autoSendProgressFill,
                        { backgroundColor: theme.primary, width: `${autoSendProgress * 100}%` },
                      ]}
                    />
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.autoSendCancelButton, { borderColor: theme.border, backgroundColor: theme.surface }]}
                  onPress={onCancelVoiceAutoSend}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel auto send"
                >
                  <Text style={[styles.autoSendCancelText, { color: theme.text }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}
            {showTranscriptPreview && (
              <Text style={[styles.voiceTranscript, { color: theme.text }]} numberOfLines={3}>
                {partialTranscript}
              </Text>
            )}
            <Text style={[styles.voiceHint, { color: theme.textTertiary }]}>
              {voiceStatusHint}
            </Text>
          </View>
        </View>
      )}

      {/* Conversation starters */}
      {canShowQuickChips && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tutorChipRow}
        >
          {quickChips.map((chip) => (
            <TouchableOpacity
              key={chip.id}
              style={[styles.tutorChip, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}
              onPress={() => onQuickAction?.(chip.prompt)}
              activeOpacity={0.8}
            >
              <Ionicons name={chip.icon as any} size={14} color={theme.primary} />
              <Text style={[styles.tutorChipText, { color: theme.text }]}>{chip.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
      
      <View style={styles.inputRow}>
        {/* Input wrapper */}
        <View
          style={[
            styles.inputWrapper,
            {
              backgroundColor: 'transparent',
              shadowOpacity: 0,
              elevation: 0,
            },
          ]}
        >
          <View style={styles.inputAccessoryLeft}>
            {/* Attach files button */}
            <TouchableOpacity
              style={[styles.inputIconButton, { backgroundColor: theme.surface + 'AA' }]}
                onPress={async () => {
                  try {
                    await Haptics.selectionAsync();
                  } catch {
                    // No-op: haptics are optional.
                  }
                  onAttachFile();
                }}
              disabled={isLoading || isUploading}
              accessibilityLabel="Attach files"
              accessibilityRole="button"
            >
              <Ionicons
                name="attach"
                size={20}
                color={selectedAttachments.length > 0 ? theme.primary : (isLoading || isUploading ? theme.textTertiary : theme.textSecondary)}
              />
              {selectedAttachments.length > 0 && (
                <View style={[styles.attachBadgeSmall, { backgroundColor: theme.primary }]}>
                  <Text style={[styles.attachBadgeSmallText, { color: theme.onPrimary }]}>
                    {selectedAttachments.length}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Camera button (hide while typing) */}
            {inputText.trim().length === 0 && !isRecording && (
              <TouchableOpacity
                style={[styles.inputIconButton, { backgroundColor: theme.surface + 'AA' }]}
                onPress={async () => {
                  try {
                    await Haptics.selectionAsync();
                  } catch {
                    // No-op: haptics are optional.
                  }
                  onTakePhoto();
                }}
                disabled={isLoading || isUploading}
                accessibilityLabel="Take photo"
                accessibilityRole="button"
              >
                <Ionicons
                  name="camera-outline"
                  size={20}
                  color={isLoading || isUploading ? theme.textTertiary : theme.textSecondary}
                />
              </TouchableOpacity>
            )}
          </View>

          <TextInput
            ref={inputRef}
            style={[
              styles.textInput,
              {
                color: theme.inputText,
                height: inputHeight,
                textAlignVertical: inputHeight > FULL_CHAT_COMPACT_HEIGHT ? 'top' : 'center',
              }
            ]}
            placeholder={
              isRecording
                ? "Listening..."
                : (placeholder || "Message Dash...")
            }
            placeholderTextColor={isRecording ? theme.primary : theme.inputPlaceholder}
            value={inputText}
            onChangeText={handleComposerTextChange}
            onContentSizeChange={
              Platform.OS === 'web'
                ? undefined
                : (e) =>
                    setInputHeight((prev) => {
                      const measuredHeight = e.nativeEvent.contentSize.height + 16;
                      const nextHeight = measuredHeight <= FULL_CHAT_GROW_THRESHOLD
                        ? FULL_CHAT_COMPACT_HEIGHT
                        : Math.min(measuredHeight, FULL_CHAT_MAX_HEIGHT);
                      return prev === nextHeight ? prev : nextHeight;
                    })
            }
            onFocus={() => { setIsFocused(true); onInputFocus?.(); }}
            onBlur={() => setIsFocused(false)}
            {...(Platform.OS === 'web' && onPasteImage
              ? ({
                  onPaste: (e: { nativeEvent?: { clipboardData?: DataTransfer } }) => {
                    const clipboardData = e?.nativeEvent?.clipboardData;
                    if (!clipboardData?.items?.length) return;
                    const item = Array.from(clipboardData.items).find((i) => i?.type?.startsWith('image/'));
                    if (!item) return;
                    const file = item.getAsFile();
                    if (file) onPasteImage(file);
                  },
                } as Record<string, unknown>)
              : {})}
            onKeyPress={(e) => {
              if (!enterToSend || Platform.OS !== 'web') return;
              const nativeEvent = (e as any)?.nativeEvent || {};
              const key = nativeEvent.key;
              const shiftKey = nativeEvent.shiftKey;
              if (key === 'Enter' && !shiftKey) {
                (e as any).preventDefault?.();
                handleSubmit();
              }
            }}
            multiline={true}
            numberOfLines={1}
            maxLength={500}
            editable={!isLoading && !isUploading && !isRecording}
            onSubmitEditing={undefined}
            returnKeyType={enterToSend ? 'send' : 'default'}
            blurOnSubmit={false}
            scrollEnabled={inputHeight >= FULL_CHAT_MAX_HEIGHT}
          />
        </View>
        
        {/* Dash Orb (voice) */}
        <TouchableOpacity
          style={[
            styles.orbButton,
            {
              opacity: (isLoading || isSpeaking || isRecording) ? 0.9 : 1,
              width: orbSize + 6,
              height: orbSize + 6,
              backgroundColor: theme.surface + 'D9',
              borderColor: theme.border + '88',
            }
          ]}
          onPress={() => {
            if ((isLoading || isSpeaking) && onInterrupt) {
              void onInterrupt();
              return;
            }
            onMicPress();
          }}
          accessibilityLabel={(isLoading || isSpeaking) ? "Stop Dash activity" : isRecording ? "Stop recording" : "Speak to Dash"}
          accessibilityRole="button"
          activeOpacity={0.85}
        >
          <CosmicOrb size={orbSize} isProcessing={isRecording || isLoading} isSpeaking={isSpeaking} />
          <View style={[
            styles.orbPulseRing,
            { 
              width: orbRingSize,
              height: orbRingSize,
              borderRadius: orbRingSize / 2,
              borderColor: isRecording ? theme.error : theme.primary,
              opacity: isRecording ? 0.7 : 0.2,
            }
          ]} />
        </TouchableOpacity>

        {/* Stop generation button — shown when AI is generating a response */}
        {isLoading && onCancel && !hasContent && (
          <TouchableOpacity
            style={[styles.sendButton, { backgroundColor: theme.error, borderColor: theme.error }]}
            onPress={async () => {
              try {
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              } catch {
                // No-op: haptics are optional.
              }
              onCancel();
            }}
            accessibilityLabel="Stop generating"
            accessibilityRole="button"
            activeOpacity={0.7}
          >
            <Ionicons name="stop" size={16} color={theme.onPrimary || '#fff'} />
          </TouchableOpacity>
        )}

        {/* Send button */}
        {hasContent && (
          <TouchableOpacity
            style={[
              styles.sendButton,
              {
                backgroundColor: theme.primary,
                borderColor: theme.primary + '66',
                opacity: (isLoading || isUploading) ? 0.5 : 1,
              },
            ]}
            onPress={async () => {
              try {
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              } catch {
                // No-op: haptics are optional.
              }
              handleSubmit();
            }}
            disabled={isLoading || isUploading}
            accessibilityLabel="Send message"
            accessibilityRole="button"
            activeOpacity={0.7}
          >
            {(isLoading || isUploading) ? (
              <EduDashSpinner size="small" color={theme.onPrimary} />
            ) : (
              <Ionicons name="send" size={16} color={theme.onPrimary} />
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>

    {previewImageUri ? (
      <ImageViewer
        visible={!!previewImageUri}
        imageUrl={previewImageUri}
        onClose={() => setPreviewImageUri(null)}
      />
    ) : null}
  </>
  );
};
